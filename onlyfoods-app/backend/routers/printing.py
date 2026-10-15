"""งานพิมพ์ใบออเดอร์ (ตาราง PrintJob ตารางเดียว เก็บ snapshot รายการอาหาร ณ ตอนพิมพ์)"""
import json
from typing import Optional

from fastapi import APIRouter, Depends

import state
from auth import assert_store_access, require_role
from db import get_db, transaction
from errors import DomainError
from schemas import PrintRequestSchema, PrintSkipSchema
from services import lock_order, log_audit
from utils import bangkok_now, queue_label

router = APIRouter(prefix="/api", tags=["printing"])

_PRINT_ROLES = ("FRONT_STAFF", "KITCHEN_STAFF", "STORE_OWNER")


@router.get("/print-jobs/pending")
def get_pending_print_jobs(user=Depends(require_role(*_PRINT_ROLES)), store_id: Optional[int] = None,
                           db=Depends(get_db)):
    if store_id is not None:
        assert_store_access(user, store_id)
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT pj.PrintJobId AS PrintJobID, pj.OrderId AS OrderID, 'PENDING' AS Status,
                   'FIRST_PRINT' AS PrintType, pj.CreatedAt, o.QueueNo, s.QueueCode, o.TotalAmount
            FROM PrintJob pj JOIN `Order` o ON o.OrderId = pj.OrderId JOIN Store s ON s.StoreId = o.StoreId
            JOIN OrderStatus os ON os.StatusId = o.StatusId
            WHERE o.StoreId = %s AND pj.PrintStatus = 'QUEUED' AND pj.PrintType = 'CUSTOMER'
              -- ออเดอร์ที่จบไปแล้ว (ส่งมอบ/ไม่มารับ/ยกเลิก) ไม่ต้องพิมพ์ใบลูกค้าแล้ว: ไม่ต้องเตือนหน้าร้าน
              AND os.StatusCode NOT IN ('COMPLETED', 'NO_SHOW', 'CANCELLED')
            ORDER BY pj.CreatedAt
            """,
            (user["StoreId"],),
        )
        rows = cur.fetchall()
    for r in rows:
        r["QueueNo"] = queue_label(r["QueueNo"], r.pop("QueueCode"))
    return rows


@router.get("/orders/{order_id}/print-logs")
def get_print_logs(order_id: int, user=Depends(require_role(*_PRINT_ROLES, "EXECUTIVE", "ACCOUNTANT")),
                   db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT StoreId FROM `Order` WHERE OrderId = %s", (order_id,))
        order = cur.fetchone()
        if not order:
            raise DomainError(404, "ไม่พบออเดอร์")
        if user["RoleCode"] in _PRINT_ROLES:
            assert_store_access(user, order["StoreId"])
        cur.execute(
            """
            SELECT PrintJobId AS PrintLogID, PrintJobId, OrderId AS OrderID,
                   IF(PrintType = 'CUSTOMER', 'FIRST_PRINT', PrintType) AS PrintType,
                   PrinterName AS Printer, PrintStatus AS Status, ItemsSnapshot AS ItemsJson,
                   PerformedBy, ErrorMessage, CreatedAt, PrintedAt
            FROM PrintJob WHERE OrderId = %s ORDER BY PrintJobId DESC
            """,
            (order_id,),
        )
        return cur.fetchall()


@router.post("/orders/{order_id}/print")
def print_order(order_id: int, payload: PrintRequestSchema, user=Depends(require_role(*_PRINT_ROLES)),
                db=Depends(get_db)):
    print_type = "REPRINT" if payload.print_type == "REPRINT" else "CUSTOMER"
    printer = payload.printer.strip() or "MOCK_PRINTER_01"
    now = bangkok_now()
    with transaction(db):
        with db.cursor() as cur:
            order = lock_order(cur, order_id)
            assert_store_access(user, order["StoreId"])
            if order["StatusCode"] in (state.CANCELLED, state.NO_SHOW):
                why = "ถูกยกเลิกแล้ว" if order["StatusCode"] == state.CANCELLED else "ถูกตัดเป็นลูกค้าไม่มารับแล้ว"
                raise DomainError(400, f"พิมพ์ไม่ได้: ออเดอร์นี้{why}")
            cur.execute(
                """
                SELECT oi.ProductId, oi.Qty, oi.UnitPrice, p.ProductName
                FROM OrderItem oi JOIN Product p ON p.ProductId = oi.ProductId
                WHERE oi.OrderId = %s AND oi.ItemStatus = 'NORMAL' ORDER BY oi.OrderItemId
                """,
                (order_id,),
            )
            items = cur.fetchall()
            if not items:
                raise DomainError(400, "พิมพ์ไม่ได้: ออเดอร์นี้ไม่มีรายการอาหารที่พร้อมพิมพ์ (อาจมีเมนูหมดรอลูกค้าเปลี่ยน)")
            customer_name = "ลูกค้า Walk-in"
            if order["CustomerId"]:
                cur.execute("SELECT FullName FROM `User` WHERE UserId = %s", (order["CustomerId"],))
                cust = cur.fetchone()
                if cust and cust["FullName"]:
                    customer_name = cust["FullName"]

            snapshot = [{"product": i["ProductName"], "qty": int(i["Qty"]), "unit_price": float(i["UnitPrice"])}
                        for i in items]
            snapshot_json = json.dumps(snapshot, ensure_ascii=False)

            cur.execute(
                "SELECT PrintJobId, PrintStatus FROM PrintJob WHERE OrderId = %s AND PrintType = 'CUSTOMER' LIMIT 1 FOR UPDATE",
                (order_id,),
            )
            first = cur.fetchone()
            if print_type == "CUSTOMER":
                if first and first["PrintStatus"] == "PRINTED":
                    raise DomainError(409, "ใบสั่งซื้อนี้พิมพ์แล้ว หากต้องการพิมพ์อีกครั้งให้ใช้ Reprint")
                if first:  # งานที่รอพิมพ์อยู่ (QUEUED) -> ปิดงานเดิม
                    job_id = first["PrintJobId"]
                    cur.execute(
                        "UPDATE PrintJob SET PrintStatus = 'PRINTED', PrinterName = %s, PrinterStatus = 'READY', "
                        "ItemsSnapshot = %s, PerformedBy = %s, PrintedAt = %s WHERE PrintJobId = %s",
                        (printer, snapshot_json, user["UserId"], now, job_id),
                    )
                else:
                    cur.execute(
                        "INSERT INTO PrintJob (OrderId, PrintType, PrintStatus, PrinterName, PrinterStatus, ItemsSnapshot, "
                        "PerformedBy, PrintedAt) VALUES (%s, 'CUSTOMER', 'PRINTED', %s, 'READY', %s, %s, %s)",
                        (order_id, printer, snapshot_json, user["UserId"], now),
                    )
                    job_id = cur.lastrowid
            else:
                cur.execute(
                    "INSERT INTO PrintJob (OrderId, PrintType, PrintStatus, PrinterName, PrinterStatus, ItemsSnapshot, "
                    "PerformedBy, PrintedAt) VALUES (%s, 'REPRINT', 'PRINTED', %s, 'READY', %s, %s, %s)",
                    (order_id, printer, snapshot_json, user["UserId"], now),
                )
                job_id = cur.lastrowid
        q = queue_label(order["QueueNo"], order["QueueCode"])
        log_audit(db, user["UserId"], "PRINT_ORDER" if print_type == "CUSTOMER" else "REPRINT_ORDER", "Order",
                  order_id, None, {"queue": q, "print_job_id": job_id, "printer": printer})
    return {
        "success": True,
        "print_data": {
            "orderId": order_id, "queueNo": q, "customerName": customer_name, "items": snapshot,
            "totalAmount": float(order["TotalAmount"] or 0), "printer": printer,
            "printType": "FIRST_PRINT" if print_type == "CUSTOMER" else "REPRINT",
        },
    }


@router.post("/print-jobs/{job_id}/skip")
def skip_print_job(job_id: int, payload: PrintSkipSchema, user=Depends(require_role("FRONT_STAFF", "STORE_OWNER")),
                   db=Depends(get_db)):
    """หน้าร้านกด "ไม่ต้องพิมพ์ใบนี้": ปิดงานที่รอพิมพ์ (ยังพิมพ์ซ้ำด้วย Reprint ได้ทีหลัง)"""
    reason = (payload.reason or "").strip() or "หน้าร้านเลือกไม่พิมพ์"
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT pj.PrintJobId, pj.PrintStatus, pj.PrintType, o.OrderId, o.StoreId
                FROM PrintJob pj JOIN `Order` o ON o.OrderId = pj.OrderId
                WHERE pj.PrintJobId = %s FOR UPDATE OF pj
                """,
                (job_id,),
            )
            job = cur.fetchone()
            if not job:
                raise DomainError(404, "ไม่พบงานพิมพ์")
            assert_store_access(user, job["StoreId"])
            if job["PrintType"] != "CUSTOMER" or job["PrintStatus"] != "QUEUED":
                raise DomainError(400, "งานพิมพ์นี้ไม่ได้รอพิมพ์อยู่แล้ว")
            cur.execute("UPDATE PrintJob SET PrintStatus = 'SKIPPED', ErrorMessage = %s, PerformedBy = %s "
                        "WHERE PrintJobId = %s", (reason[:255], user["UserId"], job_id))
        log_audit(db, user["UserId"], "PRINT_SKIP", "Order", job["OrderId"], None,
                  {"print_job_id": job_id, "reason": reason, "store_id": job["StoreId"]})
    return {"success": True}
