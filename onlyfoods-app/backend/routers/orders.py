"""ออเดอร์: สร้าง, ดู, เปลี่ยนสถานะ, ยกเลิก, เปลี่ยนเมนู"""
from datetime import timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query

import config
import state
from auth import STORE_SCOPED, assert_store_access, get_current_user, require_role
from db import get_db, transaction
from errors import DomainError
from schemas import (CancelRequestSchema, CreateOrderSchema, CustomerCancelSchema, CustomerChangeItemSchema,
                     LatePickupSchema, RecallRequestSchema, StatusUpdateSchema, TopUpSlipSchema)
from services import (add_top_up, apply_status_effects, do_transition, get_foodcourt, insert_with_queue_retry,
                      lock_order, log_audit, log_first_status, pending_top_up, refund_price_diff, send_notif,
                      status_id)
from shapes import ORDER_SELECT, attach_items, order_people, shape_order
from utils import (bangkok_now, clean_text, contract_active, foodcourt_is_open, parse_pickup_time,
                   parse_queue_no, queue_label, save_image)

router = APIRouter(prefix="/api/orders", tags=["orders"])

# ชื่อวิธีชำระเงินที่ frontend ส่งมา -> MethodCode ในตาราง PaymentMethod
_METHOD_ALIASES = {
    "PromptPay": "QR_PROMPTPAY", "QR_PROMPTPAY": "QR_PROMPTPAY",
    "TrueMoney": "MOBILE_BANKING", "MOBILE_BANKING": "MOBILE_BANKING",
    "Cash": "CASH", "CASH": "CASH",
}


def _resolve_payment_method(raw: Optional[str], walk_in: bool) -> str:
    if walk_in:
        return "CASH"  # ออเดอร์ walk-in จ่ายเงินสดที่หน้าร้าน
    code = _METHOD_ALIASES.get((raw or "PromptPay").strip())
    if code is None or code == "CASH":
        raise DomainError(400, "ไม่รองรับวิธีชำระเงินนี้ (รองรับเฉพาะ PromptPay / TrueMoney) ระบบไม่เก็บข้อมูลบัตรเครดิต")
    return code


# ------------------------------------------------------------------- create
@router.post("")
def create_order(data: CreateOrderSchema, user=Depends(require_role("CUSTOMER", "FRONT_STAFF", "STORE_OWNER")),
                 db=Depends(get_db)):
    is_staff = user["RoleCode"] != "CUSTOMER"
    if is_staff != bool(data.is_walk_in):
        raise DomainError(403, "พนักงานสร้างได้เฉพาะออเดอร์ Walk-in และลูกค้าสร้างได้เฉพาะออเดอร์ออนไลน์")
    if is_staff:
        assert_store_access(user, data.store_id)
    method_code = _resolve_payment_method(data.payment_method, is_staff)
    now = bangkok_now()
    pickup = parse_pickup_time(data.pickup_time, now)

    with transaction(db):
        with db.cursor() as cur:
            if not foodcourt_is_open(get_foodcourt(cur), now):
                raise DomainError(400, "ศูนย์อาหารปิดให้บริการชั่วคราว ไม่สามารถสั่งอาหารได้")

            cur.execute(
                """
                SELECT s.StoreName, s.QueueCode, s.IsOpen, s.IsSuspended, s.IsDeleted, c.StartDate, c.EndDate, c.ContractStatus
                FROM Store s LEFT JOIN StoreContract c ON c.StoreId = s.StoreId WHERE s.StoreId = %s
                """,
                (data.store_id,),
            )
            store = cur.fetchone()
            if not store or store["IsDeleted"]:
                raise DomainError(404, "ไม่พบร้านค้านี้")
            if store["IsSuspended"]:
                raise DomainError(400, f"ร้าน '{store['StoreName']}' ถูกระงับสิทธิ์การจำหน่ายชั่วคราว")
            if not contract_active(store["StartDate"], store["EndDate"], store["ContractStatus"], now.date()):
                raise DomainError(400, f"สัญญาร้าน '{store['StoreName']}' หมดอายุหรือยังไม่มีผล ไม่สามารถรับออเดอร์ใหม่ได้")
            if not store["IsOpen"]:
                raise DomainError(400, f"ร้าน '{store['StoreName']}' ปิดทำการอยู่ขณะนี้")

            wanted = sorted({i.product_id for i in data.items})
            cur.execute(
                f"""
                SELECT ProductId, ProductName, UnitPrice, IsOutOfStock FROM Product
                WHERE StoreId = %s AND IsDeleted = FALSE AND ProductId IN ({','.join(['%s'] * len(wanted))})
                """,
                [data.store_id, *wanted],
            )
            products = {p["ProductId"]: p for p in cur.fetchall()}
            total = Decimal(0)
            rows = []
            for item in data.items:
                prod = products.get(item.product_id)
                if not prod:
                    raise DomainError(400, f"ไม่พบสินค้า ID {item.product_id} ในร้านนี้")
                if prod["IsOutOfStock"]:
                    raise DomainError(400, f"สินค้า '{prod['ProductName']}' หมด")
                price = Decimal(prod["UnitPrice"])  # ราคาจริงจาก DB เสมอ ไม่เชื่อราคาจาก client
                total += price * item.qty
                rows.append((item.product_id, item.qty, price, clean_text(item.item_note or item.note)))
            if total <= 0:
                raise DomainError(400, "ยอดรวมออเดอร์ต้องมากกว่า 0 บาท")

            customer_id = None if is_staff else user["UserId"]
            staff_id = user["UserId"] if is_staff else None
            initial = state.PENDING if is_staff else state.VERIFYING_SLIP

            def insert_order(queue_no: int) -> int:
                cur.execute(
                    """
                    INSERT INTO `Order` (StoreId, CustomerId, CreatedByStaffId, StatusId, QueueNo, TotalAmount,
                                         Note, IsWalkIn, PickupTime, CreatedAt)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    # ส่ง CreatedAt เอง : คอลัมน์ OrderDate (generated) คำนวณจาก CreatedAt และ MySQL 8.0.32
                    # คำนวณก่อนใส่ DEFAULT CURRENT_TIMESTAMP จึงได้ '0000-00-00' ถ้าไม่ระบุค่า
                    (data.store_id, customer_id, staff_id, status_id(cur, initial), queue_no, total,
                     clean_text(data.note), is_staff, pickup, bangkok_now()),
                )
                return cur.lastrowid

            order_id, queue_no = insert_with_queue_retry(cur, data.store_id, insert_order)
            cur.executemany(
                "INSERT INTO OrderItem (OrderId, ProductId, Qty, UnitPrice, ItemNote) VALUES (%s, %s, %s, %s, %s)",
                [(order_id, pid, qty, price, note) for pid, qty, price, note in rows],
            )

            cur.execute("SELECT MethodId FROM PaymentMethod WHERE MethodCode = %s AND IsActive = TRUE", (method_code,))
            method = cur.fetchone()
            if not method:
                raise DomainError(400, "วิธีชำระเงินนี้ปิดใช้งานอยู่")
            if is_staff:
                cur.execute(
                    """
                    INSERT INTO Payment (OrderId, MethodId, Amount, PaymentStatus, VerifiedBy, PaidAt)
                    VALUES (%s, %s, %s, 'VERIFIED', %s, %s)
                    """,
                    (order_id, method["MethodId"], total, user["UserId"], now),
                )
            else:
                slip = save_image(data.slip_url, "slips")  # slip_placeholder.png ฯลฯ -> None (ร้านจะเห็นว่าไม่มีสลิป)
                cur.execute(
                    "INSERT INTO Payment (OrderId, MethodId, Amount, PaymentStatus, SlipImageUrl) VALUES (%s, %s, %s, 'PENDING', %s)",
                    (order_id, method["MethodId"], total, slip),
                )
            log_first_status(cur, order_id, initial, user["UserId"])

        q = queue_label(queue_no, store["QueueCode"])
        if customer_id:
            send_notif(db, customer_id, "ORDER_STATUS", f"คิว {q}", f"สั่งซื้อคิว {q} สำเร็จ!", order_id)
        log_audit(db, user["UserId"], "CREATE_ORDER", "Order", order_id, None,
                  {"queue": q, "total": total, "store_id": data.store_id, "walk_in": is_staff})
    return {"success": True, "order_id": order_id, "queue_no": q, "total": float(total)}


# --------------------------------------------------------------------- list
@router.get("")
def get_orders(
    store_id: Optional[int] = None,
    user_id: Optional[int] = None,
    status: Optional[str] = None,
    # หน้าผู้บริหาร/บัญชี/เจ้าของร้านคำนวณรายงาน (ยอดขาย, อัตรายกเลิก) จากรายการนี้ทั้งหมด
    # ถ้าตัดที่ 300 รายการ ตัวเลขช่วงเก่าจะผิด จึงให้ค่าเริ่มต้นสูงพอสำหรับขนาดโปรเจกต์
    limit: int = Query(5000, ge=1, le=20000),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    role = user["RoleCode"]
    where, params = [], []
    if role == "CUSTOMER":
        where.append("o.CustomerId = %s")
        params.append(user["UserId"])  # ลูกค้าเห็นเฉพาะของตัวเอง ไม่สน user_id ที่ส่งมา
    elif role in STORE_SCOPED:
        if user["StoreId"] is None:
            raise DomainError(403, "บัญชีนี้ยังไม่ได้ผูกกับร้านค้า")
        if store_id is not None and int(store_id) != int(user["StoreId"]):
            raise DomainError(403, "ไม่มีสิทธิ์เข้าถึงข้อมูลของร้านอื่น")
        where.append("o.StoreId = %s")
        params.append(user["StoreId"])
    else:  # EXECUTIVE / ACCOUNTANT
        if store_id:
            where.append("o.StoreId = %s")
            params.append(store_id)
        if user_id:
            where.append("o.CustomerId = %s")
            params.append(user_id)
    if status:
        code = state.LEGACY_TO_CODE.get(status, status)
        if code not in state.ALL_STATUSES:
            raise DomainError(400, "สถานะที่ส่งมาไม่ถูกต้อง")
        where.append("os.StatusCode = %s")
        params.append(code)
    sql = ORDER_SELECT + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY o.OrderId DESC LIMIT %s OFFSET %s"
    with db.cursor() as cur:
        cur.execute(sql, [*params, limit, offset])
        orders = [shape_order(r) for r in cur.fetchall()]
        return attach_items(cur, orders)


@router.get("/queue-estimate")
def get_queue_estimate(store_id: int = Query(..., ge=1),
                       user=Depends(require_role("CUSTOMER")), db=Depends(get_db)):
    """ข้อมูลคิวแบบย่อสำหรับให้ลูกค้าประเมินเวลารอรับทันที โดยไม่เปิดเผยข้อมูลลูกค้าคนอื่น"""
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT o.OrderId AS OrderID, o.CreatedAt, o.ReadyAt, o.PickupTime,
                   os.StatusCode AS Status,
                   COALESCE(SUM(CASE WHEN oi.ItemStatus = 'NORMAL' THEN oi.Qty ELSE 0 END), 0) AS DishCount
            FROM `Order` o
            JOIN OrderStatus os ON os.StatusId = o.StatusId
            LEFT JOIN OrderItem oi ON oi.OrderId = o.OrderId
            WHERE o.StoreId = %s
              AND os.StatusCode IN ('PENDING', 'COOKING', 'READY', 'COMPLETED')
              AND DATE(o.CreatedAt) = CURDATE()
            GROUP BY o.OrderId, o.CreatedAt, o.ReadyAt, o.PickupTime, os.StatusCode
            ORDER BY o.OrderId ASC
            """,
            (store_id,),
        )
        rows = cur.fetchall()
    # ส่งเฉพาะข้อมูลที่จำเป็นต่อการประมาณเวลา ไม่มีชื่อลูกค้าหรือรายละเอียดออเดอร์
    return {
        "orders": [
            {
                "order_id": row["OrderID"],
                "created_at": row["CreatedAt"].isoformat(sep=" ") if row.get("CreatedAt") else None,
                "ready_at": row["ReadyAt"].isoformat(sep=" ") if row.get("ReadyAt") else None,
                "pickup_time": row["PickupTime"].strftime("%H:%M") if row.get("PickupTime") else None,
                "status": row["Status"],
                "dish_count": int(row["DishCount"] or 0),
            }
            for row in rows
        ]
    }


@router.get("/kitchen-summary")
def get_kitchen_summary(user=Depends(require_role("KITCHEN_STAFF", "FRONT_STAFF", "STORE_OWNER")),
                        store_id: Optional[int] = None, db=Depends(get_db)):
    if store_id is not None:
        assert_store_access(user, store_id)
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT p.ProductName, SUM(oi.Qty) AS TotalQty
            FROM OrderItem oi
            JOIN `Order` o ON o.OrderId = oi.OrderId
            JOIN OrderStatus os ON os.StatusId = o.StatusId
            JOIN Product p ON p.ProductId = oi.ProductId
            WHERE o.StoreId = %s AND os.StatusCode IN ('PENDING', 'COOKING') AND oi.ItemStatus = 'NORMAL'
            GROUP BY p.ProductId, p.ProductName
            """,
            (user["StoreId"],),
        )
        return cur.fetchall()


# ------------------------------------------------------------------- detail
@router.get("/{order_id}/detail")
def get_order_detail(order_id: int, user=Depends(require_role("STORE_OWNER", "EXECUTIVE", "ACCOUNTANT")),
                     db=Depends(get_db)):
    """รายละเอียดเชิงลึกของ 1 ออเดอร์ (หน้าประวัติการขาย): รายการอาหารทุกแถว (รวมที่ถูกเปลี่ยน),
    การชำระทุกใบ + คนตรวจสลิป, ไทม์ไลน์สถานะ + ใครเปลี่ยน, คืนเงิน, งานพิมพ์, รีวิว, รายงานปัญหา
    และสรุปว่าใครรับ / ใครทำ / ใครเรียกคิว / ใครส่งมอบ (จาก OrderStatusLog)"""
    with db.cursor() as cur:
        cur.execute(ORDER_SELECT + " WHERE o.OrderId = %s", (order_id,))
        row = cur.fetchone()
        if not row:
            raise DomainError(404, "ไม่พบคำสั่งซื้อนี้")
        if user["RoleCode"] in STORE_SCOPED:
            assert_store_access(user, row["StoreId"])  # เจ้าของร้านดูได้เฉพาะร้านตัวเอง
        order = shape_order(row)

        cur.execute(
            """
            SELECT u.UserId, u.FullName, r.RoleCode, r.RoleNameTh
            FROM `User` u JOIN Role r ON r.RoleId = u.RoleId WHERE u.UserId = %s
            """,
            (order["CreatedByStaffId"],),
        )
        order["CreatedByStaff"] = cur.fetchone() if order["CreatedByStaffId"] else None

        # รายการอาหารทุกแถว (REPLACED = เมนูเดิมที่ลูกค้าเปลี่ยน ; ReplacesItemId ชี้กลับไปหาเมนูเดิม)
        cur.execute(
            """
            SELECT oi.OrderItemId, oi.ProductId, p.ProductName, p.ImageUrl, oi.Qty, oi.UnitPrice,
                   oi.ItemNote, oi.ItemStatus, oi.ReplacesItemId
            FROM OrderItem oi JOIN Product p ON p.ProductId = oi.ProductId
            WHERE oi.OrderId = %s ORDER BY oi.OrderItemId
            """,
            (order_id,),
        )
        order["items"] = cur.fetchall()

        cur.execute(
            """
            SELECT p.PaymentId, p.PaymentType, p.Amount, p.PaymentStatus, p.SlipImageUrl AS SlipUrl, p.RejectReason,
                   p.PaidAt, p.CreatedAt, pm.MethodCode, pm.MethodNameTh,
                   v.FullName AS VerifiedByName, vr.RoleCode AS VerifiedByRole, vr.RoleNameTh AS VerifiedByRoleTh
            FROM Payment p
            JOIN PaymentMethod pm ON pm.MethodId = p.MethodId
            LEFT JOIN `User` v ON v.UserId = p.VerifiedBy
            LEFT JOIN Role vr ON vr.RoleId = v.RoleId
            WHERE p.OrderId = %s ORDER BY p.PaymentId
            """,
            (order_id,),
        )
        payments = cur.fetchall()

        cur.execute(
            """
            SELECT l.LogId, l.CreatedAt, l.Reason, l.ChangedBy, l.ChangedByType,
                   os_old.StatusCode AS OldStatusCode, os_old.StatusNameTh AS OldStatusNameTh,
                   os_new.StatusCode AS NewStatusCode, os_new.StatusNameTh AS NewStatusNameTh,
                   u.FullName AS ChangedByName, r.RoleCode AS ChangedByRole, r.RoleNameTh AS ChangedByRoleTh
            FROM OrderStatusLog l
            LEFT JOIN OrderStatus os_old ON os_old.StatusId = l.OldStatusId
            JOIN OrderStatus os_new ON os_new.StatusId = l.NewStatusId
            LEFT JOIN `User` u ON u.UserId = l.ChangedBy
            LEFT JOIN Role r ON r.RoleId = u.RoleId
            WHERE l.OrderId = %s ORDER BY l.CreatedAt, l.LogId
            """,
            (order_id,),
        )
        timeline = cur.fetchall()

        cur.execute(
            """
            SELECT rf.RefundId, rf.RefundType, rf.Amount, rf.Reason, rf.RefundStatus, rf.RequestedAt, rf.RefundedAt,
                   u.FullName AS RefundedByName
            FROM Refund rf JOIN Payment p ON p.PaymentId = rf.PaymentId
            LEFT JOIN `User` u ON u.UserId = rf.RefundedBy
            WHERE p.OrderId = %s ORDER BY rf.RefundId
            """,
            (order_id,),
        )
        refunds = cur.fetchall()

        cur.execute(
            """
            SELECT pj.PrintJobId, pj.PrintType, pj.PrintStatus, pj.PrinterName, pj.CreatedAt, pj.PrintedAt,
                   u.FullName AS PerformedByName
            FROM PrintJob pj LEFT JOIN `User` u ON u.UserId = pj.PerformedBy
            WHERE pj.OrderId = %s ORDER BY pj.PrintJobId
            """,
            (order_id,),
        )
        prints = cur.fetchall()

        cur.execute("SELECT Rating, Comment, ImageUrl, CreatedAt FROM Review WHERE OrderId = %s", (order_id,))
        review = cur.fetchone()

        cur.execute(
            """
            SELECT r.IssueReportId, it.TypeNameTh AS IssueType, r.Description, r.IssueStatus, r.CreatedAt
            FROM IssueReport r JOIN IssueType it ON it.IssueTypeId = r.IssueTypeId
            WHERE r.OrderId = %s ORDER BY r.IssueReportId
            """,
            (order_id,),
        )
        issues = cur.fetchall()

    people = order_people(order, timeline)
    if order["IsWalkIn"] and "accepted" not in people and order["CreatedByStaff"]:
        staff = order["CreatedByStaff"]
        people["accepted"] = {"UserId": staff["UserId"], "Name": staff["FullName"], "RoleCode": staff["RoleCode"],
                              "At": order["CreatedAt"], "IsSystem": False}
    return {
        "order": order,
        "payments": payments,
        "timeline": timeline,
        "people": people,
        "refunds": refunds,
        "prints": prints,
        "review": review,
        "issues": issues,
    }


# ------------------------------------------------------------------- status
@router.put("/{order_id}/status")
def update_status(order_id: int, payload: StatusUpdateSchema,
                  user=Depends(require_role("KITCHEN_STAFF", "FRONT_STAFF", "STORE_OWNER")), db=Depends(get_db)):
    reason = clean_text(payload.cancel_reason)
    with transaction(db):
        with db.cursor() as cur:
            order = lock_order(cur, order_id)
            assert_store_access(user, order["StoreId"])
            now = bangkok_now()
            steps = state.plan_status_change(order["StatusCode"], payload.status, user["RoleCode"])
            if not steps:
                return {"success": True}
            if state.NO_SHOW in steps:
                state.assert_no_show_allowed(order["ReadyAt"], now, config.NO_SHOW_AFTER_MINUTES,
                                             order.get("LatePickupArrivalTime"))
            if state.CANCELLED in steps and not reason:
                reason = "ยกเลิกโดยร้านค้า"
            for step in steps:
                kwargs = {}
                if step in (state.PENDING_CANCELLATION, state.CANCELLED):
                    kwargs["cancel_reason"] = reason
                    if step == state.CANCELLED:
                        kwargs["cancel_deadline"] = None
                elif step == state.PENDING:  # ย้อนจากรอยกเลิกกลับมาทำต่อ
                    kwargs.update(cancel_reason=None, cancel_deadline=None)
                do_transition(cur, order, step, actor_id=user["UserId"], reason=reason, now=now, **kwargs)
            apply_status_effects(db, cur, order, steps[-1], user["UserId"], reason)
    return {"success": True}


@router.put("/{order_id}/cancel-request")
def request_cancel(order_id: int, payload: CancelRequestSchema,
                   user=Depends(require_role("FRONT_STAFF", "STORE_OWNER")), db=Depends(get_db)):
    now = bangkok_now()
    deadline = now + timedelta(minutes=payload.response_window_minutes)
    reason = payload.reason.strip()
    with transaction(db):
        with db.cursor() as cur:
            order = lock_order(cur, order_id)
            assert_store_access(user, order["StoreId"])
            if order["StatusCode"] in (state.COOKED, state.READY):
                raise DomainError(400, "อาหารเสร็จแล้ว ไม่สามารถยกเลิกหรือแจ้งของหมดกับออเดอร์นี้ได้")
            if order["CustomerId"] is None:
                raise DomainError(400, "ออเดอร์ Walk-in ไม่มีลูกค้าในระบบให้เลือกเมนูใหม่ กรุณาใช้ปุ่มยกเลิกแทน")
            do_transition(cur, order, state.PENDING_CANCELLATION, actor_id=user["UserId"], reason=reason,
                          cancel_reason=reason, cancel_deadline=deadline, now=now)
            q = queue_label(order["QueueNo"], order["QueueCode"])
            send_notif(db, order["CustomerId"], "ORDER_STATUS", f"คิว {q} มีปัญหา",
                       f"คิว {q} มีปัญหา: {reason} (กรุณายืนยันใน {payload.response_window_minutes} นาที)", order_id)
        log_audit(db, user["UserId"], "CANCEL_REQUEST", "Order", order_id, None,
                  {"reason": reason, "store_id": order["StoreId"]})
    return {"success": True}


# --------------------------------------------------- customer: change / cancel
def _customer_own_order(cur, order_id: int, user: dict) -> dict:
    order = lock_order(cur, order_id)
    if order["CustomerId"] is None or int(order["CustomerId"]) != int(user["UserId"]):
        raise DomainError(403, "คุณไม่มีสิทธิ์ดำเนินการกับคำสั่งซื้อนี้")
    return order


def _customer_pending_cancellation_order(cur, order_id: int, user: dict, now, enforce_deadline: bool = True,
                                         allow_top_up: bool = False) -> dict:
    """allow_top_up: ตอนรอโอนส่วนต่าง ลูกค้ายังกดยกเลิกได้ (แต่เปลี่ยนเมนูซ้ำไม่ได้)"""
    order = _customer_own_order(cur, order_id, user)
    allowed = {state.PENDING_CANCELLATION} | ({state.AWAITING_TOP_UP} if allow_top_up else set())
    if order["StatusCode"] not in allowed:
        raise DomainError(400, "ออเดอร์นี้ไม่ได้อยู่ในสถานะรอยืนยัน (เปลี่ยนเมนู/ยกเลิก)")
    if enforce_deadline and order["CancelDeadline"] and now > order["CancelDeadline"]:
        raise DomainError(400, "หมดเวลาเปลี่ยนเมนูแล้ว กรุณากดยกเลิกออเดอร์เพื่อรับเงินคืน")
    return order


@router.put("/{order_id}/change-item")
def customer_change_order_item(order_id: int, payload: CustomerChangeItemSchema,
                               user=Depends(require_role("CUSTOMER")), db=Depends(get_db)):
    now = bangkok_now()
    with transaction(db):
        with db.cursor() as cur:
            order = _customer_pending_cancellation_order(cur, order_id, user, now)

            base = """
                SELECT oi.OrderItemId, oi.ProductId, oi.Qty, oi.UnitPrice, oi.ItemNote, p.ProductName
                FROM OrderItem oi JOIN Product p ON p.ProductId = oi.ProductId
                WHERE oi.OrderId = %s AND oi.ItemStatus IN ('NORMAL', 'OUT_OF_STOCK')
            """
            old = None
            if payload.detail_id:
                cur.execute(base + " AND oi.OrderItemId = %s", (order_id, payload.detail_id))
                old = cur.fetchone()
            if not old and payload.product_id:
                cur.execute(base + " AND oi.ProductId = %s ORDER BY oi.OrderItemId LIMIT 1", (order_id, payload.product_id))
                old = cur.fetchone()
            if not old:
                cur.execute(base + " AND oi.ItemStatus = 'OUT_OF_STOCK' ORDER BY oi.OrderItemId LIMIT 1", (order_id,))
                old = cur.fetchone()
            if not old:
                raise DomainError(400, "ไม่พบรายการอาหารที่ต้องเปลี่ยนในออเดอร์นี้")

            cur.execute(
                "SELECT ProductId, ProductName, UnitPrice, IsOutOfStock FROM Product "
                "WHERE ProductId = %s AND StoreId = %s AND IsDeleted = FALSE",
                (payload.new_product_id, order["StoreId"]),
            )
            new = cur.fetchone()
            if not new:
                raise DomainError(400, "ไม่พบเมนูใหม่ในร้านเดียวกัน")
            if new["IsOutOfStock"]:
                raise DomainError(400, f"เมนู '{new['ProductName']}' หมดแล้ว กรุณาเลือกเมนูอื่น")
            if int(new["ProductId"]) == int(old["ProductId"]):
                raise DomainError(400, "กรุณาเลือกเมนูที่แตกต่างจากเมนูเดิม")
            old_price, new_price = Decimal(old["UnitPrice"]), Decimal(new["UnitPrice"])

            # ประวัติไม่หาย: รายการเดิม -> REPLACED, เพิ่มรายการใหม่ที่ชี้กลับด้วย ReplacesItemId
            cur.execute("UPDATE OrderItem SET ItemStatus = 'REPLACED' WHERE OrderItemId = %s", (old["OrderItemId"],))
            cur.execute(
                "INSERT INTO OrderItem (OrderId, ProductId, ReplacesItemId, Qty, UnitPrice, ItemNote) VALUES (%s, %s, %s, %s, %s, %s)",
                (order_id, new["ProductId"], old["OrderItemId"], old["Qty"], new_price, old["ItemNote"]),
            )
            diff = (old_price - new_price) * int(old["Qty"])
            top_up_due = Decimal(0)
            if diff > 0:  # ถูกลง -> คืนส่วนต่าง
                refund_price_diff(cur, order_id, diff,
                                  f"ส่วนต่างราคา {old['ProductName']} -> {new['ProductName']}", old["OrderItemId"])
            elif diff < 0:  # แพงขึ้น -> ลูกค้าต้องโอนเพิ่ม (รวมกับส่วนต่างที่ยังไม่โอนของรายการอื่น)
                top_up_due = add_top_up(cur, order_id, -diff)

            cur.execute(
                "SELECT COALESCE(SUM(Qty * UnitPrice), 0) AS t FROM OrderItem "
                "WHERE OrderId = %s AND ItemStatus IN ('NORMAL', 'OUT_OF_STOCK')",
                (order_id,),
            )
            new_total = Decimal(cur.fetchone()["t"])
            cur.execute("UPDATE `Order` SET TotalAmount = %s WHERE OrderId = %s", (new_total, order_id))
            cur.execute("SELECT COUNT(*) AS n FROM OrderItem WHERE OrderId = %s AND ItemStatus = 'OUT_OF_STOCK'", (order_id,))
            still_out = cur.fetchone()["n"]
            pending = pending_top_up(cur, order_id)
            if pending:
                top_up_due = Decimal(pending["Amount"])
            if still_out == 0:
                # มีส่วนต่างต้องโอน -> รอสลิปก่อนเข้าครัว ; ไม่มี -> กลับเข้าคิวครัวเลย
                nxt, why = ((state.AWAITING_TOP_UP, f"รอโอนส่วนต่าง {top_up_due:.2f} บาท") if pending
                            else (state.PENDING, "ลูกค้าเปลี่ยนเมนูแล้ว"))
                do_transition(cur, order, nxt, actor_id=user["UserId"], reason=why,
                              cancel_reason=None, cancel_deadline=None, now=now)
            q = queue_label(order["QueueNo"], order["QueueCode"])
            msg = f"คิว {q} เปลี่ยนเมนูจาก '{old['ProductName']}' เป็น '{new['ProductName']}' เรียบร้อยแล้ว"
            if pending:
                msg += f" กรุณาโอนส่วนต่าง {top_up_due:.2f} บาท และแนบสลิป"
            send_notif(db, user["UserId"], "ORDER_STATUS", f"คิว {q} เปลี่ยนเมนู", msg, order_id)
        log_audit(db, user["UserId"], "CUSTOMER_CHANGE_ITEM", "Order", order_id,
                  {"product": old["ProductName"], "price": old_price},
                  {"product": new["ProductName"], "price": new_price, "refund_diff": diff if diff > 0 else 0,
                   "top_up_due": top_up_due})
    return {
        "success": True,
        "message": f"เปลี่ยนเมนูเป็น {new['ProductName']} เรียบร้อยแล้ว",
        "order_id": order_id,
        "new_product_id": new["ProductId"],
        "new_product_name": new["ProductName"],
        "new_total": float(new_total),
        "top_up_due": float(top_up_due),
        "status": state.legacy_status(order["StatusCode"]),
    }


@router.put("/{order_id}/top-up-slip")
def upload_top_up_slip(order_id: int, payload: TopUpSlipSchema,
                       user=Depends(require_role("CUSTOMER")), db=Depends(get_db)):
    """ลูกค้าแนบสลิปโอนส่วนต่าง (แนบใหม่ทับได้จนกว่าร้านจะตรวจ ; ใบที่ถูกปฏิเสธยังเก็บไว้ทุกใบ)"""
    with transaction(db):
        with db.cursor() as cur:
            order = _customer_own_order(cur, order_id, user)
            if order["StatusCode"] != state.AWAITING_TOP_UP:
                raise DomainError(400, "ออเดอร์นี้ไม่ได้รอโอนส่วนต่าง")
            pay = pending_top_up(cur, order_id)
            if not pay:
                raise DomainError(400, "ไม่พบยอดส่วนต่างที่ต้องโอน")
            slip = save_image(payload.slip_url, "slips")
            if not slip:
                raise DomainError(400, "กรุณาแนบรูปสลิป")
            cur.execute("UPDATE Payment SET SlipImageUrl = %s WHERE PaymentId = %s", (slip, pay["PaymentId"]))
        log_audit(db, user["UserId"], "UPLOAD_TOP_UP_SLIP", "Payment", pay["PaymentId"], None,
                  {"order_id": order_id, "amount": pay["Amount"], "store_id": order["StoreId"]})
    return {"success": True, "amount": float(pay["Amount"])}


def _customer_cancel(order_id: int, payload: CustomerCancelSchema, user: dict, db):
    now = bangkok_now()
    reason = (payload.reason or "ลูกค้ายืนยันยกเลิก เนื่องจากเมนูหมด").strip()
    with transaction(db):
        with db.cursor() as cur:
            order = _customer_pending_cancellation_order(cur, order_id, user, now, enforce_deadline=False,
                                                         allow_top_up=True)
            do_transition(cur, order, state.CANCELLED, actor_id=user["UserId"], reason=reason,
                          cancel_reason=reason, cancel_deadline=None, now=now)
            apply_status_effects(db, cur, order, state.CANCELLED, user["UserId"], reason)
    return {"success": True, "message": "ยกเลิกออเดอร์เรียบร้อยแล้ว", "order_id": order_id}


@router.put("/{order_id}/customer-cancel")
def customer_cancel_order(order_id: int, payload: CustomerCancelSchema,
                          user=Depends(require_role("CUSTOMER")), db=Depends(get_db)):
    return _customer_cancel(order_id, payload, user, db)


@router.put("/{order_id}/cancel")
def customer_cancel_order_alias(order_id: int, payload: CustomerCancelSchema,
                                user=Depends(require_role("CUSTOMER")), db=Depends(get_db)):
    return _customer_cancel(order_id, payload, user, db)


# สถานะที่ลูกค้าแจ้งร้านว่าจะมาช้าได้: ร้านรับออเดอร์แล้วจนถึงอาหารพร้อมรับ
_LATE_PICKUP_STATUSES = (state.PENDING, state.COOKING, state.COOKED, state.READY)


@router.put("/{order_id}/late-pickup")
def report_late_pickup(order_id: int, payload: LatePickupSchema,
                       user=Depends(require_role("CUSTOMER")), db=Depends(get_db)):
    """ลูกค้าแจ้งร้านว่าจะมารับช้า N นาที ; แจ้งซ้ำได้ ยึดครั้งล่าสุด ไม่เกิน MAX_LATE_PICKUP_UPDATES ครั้ง
    เวลามาถึง = (เวลานัดรับ หรือ ตอนกด แล้วแต่อันไหนช้ากว่า) + N นาที
    ผล: หน้าร้านเห็นเวลา, ระบบไม่ส่งเตือน 15 นาที, ปุ่ม "ลูกค้าไม่มารับ" กดไม่ได้จนเลยเวลานี้"""
    if payload.minutes not in config.LATE_PICKUP_CHOICES:
        raise DomainError(400, "เลือกเวลาได้เฉพาะ " + " / ".join(f"{m} นาที" for m in config.LATE_PICKUP_CHOICES))
    now = bangkok_now()
    with transaction(db):
        with db.cursor() as cur:
            order = lock_order(cur, order_id)
            if order["CustomerId"] is None or int(order["CustomerId"]) != int(user["UserId"]):
                raise DomainError(403, "คุณไม่มีสิทธิ์ดำเนินการกับคำสั่งซื้อนี้")
            if order["StatusCode"] not in _LATE_PICKUP_STATUSES:
                raise DomainError(400, "แจ้งเวลามารับได้หลังร้านรับออเดอร์แล้ว และก่อนรับอาหาร")
            used = int(order["LatePickupCount"] or 0)
            if used >= config.MAX_LATE_PICKUP_UPDATES:
                raise DomainError(400, f"คุณแจ้งเวลามารับช้าออเดอร์นี้ครบ {config.MAX_LATE_PICKUP_UPDATES} ครั้งแล้ว กรุณาติดต่อร้าน")
            arrival = state.late_pickup_arrival(now, order.get("PickupTime"), payload.minutes)
            cur.execute(
                "UPDATE `Order` SET LatePickupMinutes = %s, LatePickupArrivalTime = %s, "
                "LatePickupCount = COALESCE(LatePickupCount, 0) + 1 WHERE OrderId = %s",
                (payload.minutes, arrival, order_id),
            )
        log_audit(db, user["UserId"], "LATE_PICKUP", "Order", order_id, {"arrival": order["LatePickupArrivalTime"]},
                  {"arrival": arrival, "minutes": payload.minutes, "store_id": order["StoreId"], "count": used + 1})
    return {"success": True, "order_id": order_id, "minutes": payload.minutes,
            "arrival_time": arrival.isoformat(), "count": used + 1,
            "remaining": config.MAX_LATE_PICKUP_UPDATES - used - 1}


@router.post("/{order_id}/recall")
def recall_order(order_id: int, payload: RecallRequestSchema,
                 user=Depends(require_role("FRONT_STAFF", "KITCHEN_STAFF", "STORE_OWNER")), db=Depends(get_db)):
    with transaction(db):
        with db.cursor() as cur:
            order = lock_order(cur, order_id)
            assert_store_access(user, order["StoreId"])
            if order["StatusCode"] != state.READY:
                raise DomainError(400, "เรียกคิวซ้ำได้เฉพาะออเดอร์ที่พร้อมรับ")
            if parse_queue_no(payload.queue_no) != int(order["QueueNo"]):
                raise DomainError(400, "เลขคิวไม่ตรงกับออเดอร์")
            q = queue_label(order["QueueNo"], order["QueueCode"])
            send_notif(db, order["CustomerId"], "QUEUE_CALLED", f"เรียกคิว {q}",
                       f"📢 เรียกคิว {q} อีกครั้ง กรุณามารับอาหาร", order_id)
        log_audit(db, user["UserId"], "RECALL_QUEUE", "Order", order_id, None, {"queue": q})
    return {"success": True, "order_id": order_id, "queue_no": q}
