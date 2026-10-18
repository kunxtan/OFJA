"""งานที่ต้องใช้ DB ร่วมกันหลาย router : audit, แจ้งเตือน, เลขคิว, เปลี่ยนสถานะ, คืนเงิน"""
import json
import logging
from contextvars import ContextVar
from decimal import Decimal
from typing import Any, Dict, List, Optional

import state
from errors import DomainError
from utils import bangkok_now, queue_label

logger = logging.getLogger("onlyfood")

# ตั้งค่าโดย middleware ใน main.py (IP ของผู้เรียก ตามที่ nginx ส่งมา)
request_ip: ContextVar[Optional[str]] = ContextVar("request_ip", default=None)

KEEP = _KEEP = object()  # ค่า sentinel: "ไม่ต้องแก้ฟิลด์นี้"


# ----------------------------------------------------------------- audit/notify
def _json(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        value = {"detail": value}
    return json.dumps(value, ensure_ascii=False, default=str)


def log_audit(db, user_id: Optional[int], action_code: str, entity_type: str,
              entity_id: Any = None, old: Any = None, new: Any = None) -> None:
    """เขียน AuditLog ใน transaction เดียวกับงานหลัก (พังแล้ว rollback ทั้งก้อน)
    PerformedBy ต้องมาจาก JWT เท่านั้น ห้ามรับจาก request body"""
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO AuditLog (PerformedBy, ActionCode, EntityType, EntityId, OldValue, NewValue, IpAddress)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (user_id, action_code, entity_type,
             str(entity_id) if entity_id is not None else None,
             _json(old), _json(new), request_ip.get()),
        )
    logger.info("audit action=%s entity=%s/%s by=%s", action_code, entity_type, entity_id, user_id)


def send_notif(db, user_id: Optional[int], ntype: str, title: str, message: str,
               order_id: Optional[int] = None) -> None:
    if not user_id:
        return
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO Notification (UserId, OrderId, NotificationType, Title, Message) VALUES (%s, %s, %s, %s, %s)",
            (user_id, order_id, ntype, title[:150], message[:500]),
        )


def notify_store_owners(db, store_id: int, ntype: str, title: str, message: str,
                        order_id: Optional[int] = None) -> None:
    """แจ้งเจ้าของร้าน (ทุกบัญชี STORE_OWNER ที่ยังใช้งานของร้านนี้)"""
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT u.UserId FROM `User` u JOIN Role r ON r.RoleId = u.RoleId
            WHERE u.StoreId = %s AND r.RoleCode = 'STORE_OWNER' AND u.IsActive = TRUE
            """,
            (store_id,),
        )
        owners = [r["UserId"] for r in cur.fetchall()]
    for uid in owners:
        send_notif(db, uid, ntype, title, message, order_id)


_ACTOR_TH = {"FRONT_STAFF": "พนักงานหน้าร้าน", "KITCHEN_STAFF": "พนักงานครัว", "STORE_OWNER": "เจ้าของร้าน"}


def notify_menu_out_of_stock(db, store_id: int, product_name: str, actor_role: str) -> None:
    """เมนูถูกปรับเป็นของหมด (ทุกช่องทาง) -> แจ้งเจ้าของร้าน พร้อมบอกว่าใครเป็นคนปรับ"""
    who = _ACTOR_TH.get(actor_role, "ร้าน")
    notify_store_owners(db, store_id, "SYSTEM", "สินค้าหมด",
                        f"⚠️ สินค้าหมด: {who}เพิ่งปรับเมนู '{product_name}' เป็นของหมด")


# -------------------------------------------------------------------- lookups
_status_ids: Dict[str, int] = {}


def status_id(cur, code: str) -> int:
    if not _status_ids:
        cur.execute("SELECT StatusId, StatusCode FROM OrderStatus")
        for r in cur.fetchall():
            _status_ids[r["StatusCode"]] = r["StatusId"]
    return _status_ids[code]


# ------------------------------------------------------------------ queue no.
def is_duplicate_key(exc: BaseException) -> bool:
    """MySQL error 1062 (ไม่ import pymysql เพื่อให้เทสต์ได้โดยไม่ต้องติดตั้ง)"""
    return bool(exc.args) and exc.args[0] == 1062


def next_queue_no(cur, store_id: int) -> int:
    """เลขคิวถัดไปของร้านในวันนี้ = MAX+1 (ไม่ใช่ COUNT+1 เพราะ COUNT ซ้ำได้เมื่อมีออเดอร์ถูกลบ/พร้อมกัน)

    ล็อกแถว Store ไว้จน transaction จบ : ออเดอร์ของร้านเดียวกันขอเลขคิวทีละคน
    (ไม่ล็อก = 20 คนสั่งพร้อมกันได้ MAX เดียวกัน ชนกันจน retry หมดแล้วได้ 503) ; ร้านอื่นไม่ต้องรอ"""
    cur.execute("SELECT StoreId FROM Store WHERE StoreId = %s FOR UPDATE", (store_id,))
    cur.execute(
        "SELECT COALESCE(MAX(QueueNo), 0) + 1 AS n FROM `Order` WHERE StoreId = %s AND OrderDate = CURDATE()",
        (store_id,),
    )
    return int(cur.fetchone()["n"])


def insert_with_queue_retry(cur, store_id: int, insert_fn, attempts: int = 3):
    """insert_fn(queue_no) -> order_id ; ชน uk_order_queue (สั่งพร้อมกัน) = ขอเลขใหม่แล้วลองซ้ำ"""
    for _ in range(attempts):
        queue_no = next_queue_no(cur, store_id)
        try:
            return insert_fn(queue_no), queue_no
        except Exception as exc:  # noqa: BLE001 - กรองเฉพาะ duplicate key ของ uk_order_queue
            if is_duplicate_key(exc) and "uk_order_queue" in str(exc):
                continue
            raise
    raise DomainError(503, "ระบบกำลังรับออเดอร์จำนวนมาก กรุณาลองสั่งอีกครั้ง")


# ----------------------------------------------------------- order transitions
_ORDER_LOCK_SQL = """
SELECT o.OrderId, o.StoreId, o.CustomerId, o.QueueNo, o.TotalAmount, o.ReadyAt, o.PickupTime,
       o.LatePickupArrivalTime, o.LatePickupCount,
       o.IsWalkIn,
       o.CancelReason, o.CancelDeadline, os.StatusCode, s.StoreName, s.QueueCode
FROM `Order` o
JOIN OrderStatus os ON os.StatusId = o.StatusId
JOIN Store s ON s.StoreId = o.StoreId
WHERE o.OrderId = %s
FOR UPDATE OF o
"""


def lock_order(cur, order_id: int) -> dict:
    cur.execute(_ORDER_LOCK_SQL, (order_id,))
    order = cur.fetchone()
    if not order:
        raise DomainError(404, "ไม่พบคำสั่งซื้อนี้")
    return order


def do_transition(cur, order: dict, new_code: str, *, actor_id: Optional[int], reason: Optional[str] = None,
                  system: bool = False, cancel_reason=_KEEP, cancel_deadline=_KEEP, now=None) -> None:
    """เปลี่ยนสถานะ 1 ขั้น + log ใน OrderStatusLog (ต้องเรียกหลัง lock_order ใน transaction เดียวกัน)"""
    old_code = order["StatusCode"]
    state.assert_transition(old_code, new_code)
    now = now or bangkok_now()
    sets = ["StatusId = %s"]
    args = [status_id(cur, new_code)]
    if new_code == state.READY:
        sets.append("ReadyAt = %s")
        args.append(now)
    if cancel_reason is not _KEEP:
        sets.append("CancelReason = %s")
        args.append(cancel_reason)
    if cancel_deadline is not _KEEP:
        sets.append("CancelDeadline = %s")
        args.append(cancel_deadline)
    args.append(order["OrderId"])
    cur.execute(f"UPDATE `Order` SET {', '.join(sets)} WHERE OrderId = %s", args)
    cur.execute(
        """
        INSERT INTO OrderStatusLog (OrderId, OldStatusId, NewStatusId, Reason, ChangedBy, ChangedByType)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (order["OrderId"], status_id(cur, old_code), status_id(cur, new_code),
         (reason or None) and reason[:255],
         None if system else actor_id, "SYSTEM" if system else "USER"),
    )
    order["StatusCode"] = new_code
    if new_code == state.READY:
        order["ReadyAt"] = now


def log_first_status(cur, order_id: int, code: str, actor_id: Optional[int]) -> None:
    """แถวแรกของ OrderStatusLog ตอนสร้างออเดอร์ (OldStatusId = NULL)"""
    cur.execute(
        """
        INSERT INTO OrderStatusLog (OrderId, OldStatusId, NewStatusId, Reason, ChangedBy, ChangedByType)
        VALUES (%s, NULL, %s, NULL, %s, 'USER')
        """,
        (order_id, status_id(cur, code), actor_id),
    )


# ออเดอร์จบแล้ว: ใบลูกค้าที่ยังรอพิมพ์ไม่มีประโยชน์ -> ปิดเป็น SKIPPED (ไม่งั้นค้างในแบนเนอร์หน้าร้านตลอดไป)
_PRINT_SKIP_REASON = {
    state.COMPLETED: "ส่งมอบอาหารแล้วก่อนพิมพ์",
    state.NO_SHOW: "ลูกค้าไม่มารับอาหาร",
    state.CANCELLED: "ออเดอร์ถูกยกเลิก",
}


def skip_queued_print_jobs(cur, order_id: int, reason: str) -> None:
    cur.execute(
        "UPDATE PrintJob SET PrintStatus = 'SKIPPED', ErrorMessage = %s "
        "WHERE OrderId = %s AND PrintType = 'CUSTOMER' AND PrintStatus = 'QUEUED'",
        (reason[:255], order_id),
    )


def queue_print_job(cur, order_id: int) -> None:
    """ออเดอร์พร้อมรับ -> ต้องมีงานพิมพ์ใบลูกค้า 1 งาน (ไม่สร้างซ้ำ)"""
    cur.execute("SELECT PrintJobId FROM PrintJob WHERE OrderId = %s AND PrintType = 'CUSTOMER' LIMIT 1", (order_id,))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO PrintJob (OrderId, PrintType, PrintStatus) VALUES (%s, 'CUSTOMER', 'QUEUED')",
            (order_id,),
        )


# --------------------------------------------------------------------- refunds
def verified_payments(cur, order_id: int, lock: bool = False) -> List[dict]:
    """ทุกการชำระที่ยืนยันแล้วของออเดอร์ (ค่าอาหาร ORDER ก่อน แล้วตามด้วยส่วนต่าง TOP_UP)"""
    cur.execute(
        "SELECT PaymentId, PaymentType, Amount FROM Payment WHERE OrderId = %s AND PaymentStatus = 'VERIFIED' "
        "ORDER BY PaymentType = 'ORDER' DESC, PaymentId" + (" FOR UPDATE" if lock else ""),
        (order_id,),
    )
    return cur.fetchall()


def refunded_total(cur, payment_id: int) -> Decimal:
    cur.execute(
        "SELECT COALESCE(SUM(Amount), 0) AS t FROM Refund WHERE PaymentId = %s AND RefundStatus <> 'FAILED'",
        (payment_id,),
    )
    return Decimal(cur.fetchone()["t"])


def assert_refundable(cur, payment_id: int, amount: Decimal) -> Decimal:
    """SUM(Refund) ต้องไม่เกินยอดที่จ่ายจริง (ล็อกแถว Payment กันขอคืนซ้อนกัน) คืนยอดที่คืนได้อีก"""
    cur.execute("SELECT Amount FROM Payment WHERE PaymentId = %s FOR UPDATE", (payment_id,))
    row = cur.fetchone()
    if not row:
        raise DomainError(404, "ไม่พบรายการชำระเงิน")
    remaining = Decimal(row["Amount"]) - refunded_total(cur, payment_id)
    if amount > remaining:
        raise DomainError(400, f"ยอดคืนเงินเกินยอดที่ชำระ (คืนได้อีก {remaining:.2f} บาท)")
    return remaining


def create_refund(cur, payment_id: int, refund_type: str, amount: Decimal, reason: str,
                  order_item_id: Optional[int] = None) -> int:
    assert_refundable(cur, payment_id, amount)
    cur.execute(
        """
        INSERT INTO Refund (PaymentId, OrderItemId, RefundType, Amount, Reason, RefundStatus)
        VALUES (%s, %s, %s, %s, %s, 'PENDING')
        """,
        (payment_id, order_item_id, refund_type, amount, reason[:255]),
    )
    return cur.lastrowid


def refund_price_diff(cur, order_id: int, amount: Decimal, reason: str, order_item_id: int) -> bool:
    """เปลี่ยนเป็นเมนูที่ถูกกว่า -> คืนส่วนต่างจากการชำระที่ยังเหลือยอดพอ (ค่าอาหารก่อน) ; ยังไม่จ่าย = ไม่ต้องคืน"""
    for pay in verified_payments(cur, order_id, lock=True):
        if Decimal(pay["Amount"]) - refunded_total(cur, pay["PaymentId"]) >= amount:
            create_refund(cur, pay["PaymentId"], "PRICE_DIFF", amount, reason, order_item_id)
            return True
    return False


def refund_full_cancel(cur, order_id: int, reason: str) -> Decimal:
    """ยกเลิกทั้งออเดอร์ -> คืนยอดที่เหลือของทุกการชำระที่ยืนยันแล้ว (ค่าอาหาร + ส่วนต่างที่โอนเพิ่ม)"""
    total = Decimal(0)
    for pay in verified_payments(cur, order_id, lock=True):
        remaining = Decimal(pay["Amount"]) - refunded_total(cur, pay["PaymentId"])
        if remaining > 0:
            create_refund(cur, pay["PaymentId"], "FULL_CANCEL", remaining, reason)
            total += remaining
    return total


# ------------------------------------------------------------- top-up (ส่วนต่าง)
def pending_top_up(cur, order_id: int) -> Optional[dict]:
    """รายการโอนส่วนต่างที่ยังรออยู่ (มีได้ทีละ 1 รายการ) ; ล็อกแถวไว้"""
    cur.execute(
        """
        SELECT PaymentId, Amount, SlipImageUrl FROM Payment
        WHERE OrderId = %s AND PaymentType = 'TOP_UP' AND PaymentStatus = 'PENDING'
        ORDER BY PaymentId DESC LIMIT 1 FOR UPDATE
        """,
        (order_id,),
    )
    return cur.fetchone()


def add_top_up(cur, order_id: int, amount: Decimal) -> Decimal:
    """เพิ่มยอดที่ลูกค้าต้องโอนเพิ่ม (รวมเข้ารายการที่ยังรออยู่ถ้ามี) คืนยอดรวมที่ต้องโอน"""
    pending = pending_top_up(cur, order_id)
    if pending:
        if pending["SlipImageUrl"]:
            raise DomainError(400, "ลูกค้าแนบสลิปส่วนต่างแล้ว กรุณารอร้านตรวจสอบก่อน")
        new_amount = Decimal(pending["Amount"]) + amount
        cur.execute("UPDATE Payment SET Amount = %s WHERE PaymentId = %s", (new_amount, pending["PaymentId"]))
        return new_amount
    cur.execute(
        "SELECT MethodId FROM Payment WHERE OrderId = %s AND PaymentType = 'ORDER' ORDER BY PaymentId DESC LIMIT 1",
        (order_id,),
    )
    method = cur.fetchone()
    if not method:
        raise DomainError(400, "ไม่พบรายการชำระเงินของออเดอร์นี้")
    cur.execute(
        "INSERT INTO Payment (OrderId, PaymentType, MethodId, Amount, PaymentStatus) VALUES (%s, 'TOP_UP', %s, %s, 'PENDING')",
        (order_id, method["MethodId"], amount),
    )
    return amount


def close_pending_top_ups(cur, order_id: int, reason: str) -> None:
    """ก่อนยกเลิกออเดอร์: ส่วนต่างที่ยังไม่โอน -> ปิดทิ้ง (REJECTED) ;
    ถ้าลูกค้าแนบสลิปแล้วแต่ร้านยังไม่ตรวจ -> ห้ามยกเลิก (เงินอาจโอนมาแล้ว ต้องตรวจก่อนจะได้คืนถูกยอด)"""
    cur.execute(
        "SELECT PaymentId, SlipImageUrl FROM Payment "
        "WHERE OrderId = %s AND PaymentType = 'TOP_UP' AND PaymentStatus = 'PENDING' FOR UPDATE",
        (order_id,),
    )
    rows = cur.fetchall()
    if any(r["SlipImageUrl"] for r in rows):
        raise DomainError(400, "มีสลิปส่วนต่างที่ยังไม่ได้ตรวจ กรุณาให้ร้านตรวจสลิปก่อนยกเลิก")
    for r in rows:
        cur.execute(
            "UPDATE Payment SET PaymentStatus = 'REJECTED', RejectReason = %s WHERE PaymentId = %s",
            (reason[:255], r["PaymentId"]),
        )


# ------------------------------------------------------------ status messages
_MESSAGES = {
    state.PENDING: "ร้านรับออเดอร์แล้ว",
    state.COOKING: "กำลังปรุงอาหาร",
    state.COOKED: "ปรุงอาหารเสร็จแล้ว",
    state.READY: "อาหารพร้อมรับแล้ว!",
    state.COMPLETED: "รับอาหารเรียบร้อย",
    state.NO_SHOW: "ถูกตัดออเดอร์เนื่องจากไม่มารับอาหารเกินเวลา",
}


def apply_status_effects(db, cur, order: dict, final_code: str, actor_id: Optional[int],
                         reason: Optional[str]) -> None:
    """ผลข้างเคียงหลังเปลี่ยนสถานะ: งานพิมพ์, คืนเงิน, แจ้งเตือนลูกค้า, audit"""
    oid = order["OrderId"]
    q = queue_label(order["QueueNo"], order.get("QueueCode"))
    if final_code == state.READY:
        queue_print_job(cur, oid)
    if final_code in _PRINT_SKIP_REASON:
        skip_queued_print_jobs(cur, oid, _PRINT_SKIP_REASON[final_code])
    refunded = Decimal(0)
    if final_code == state.CANCELLED:
        close_pending_top_ups(cur, oid, "ออเดอร์ถูกยกเลิกก่อนโอนส่วนต่าง")
        refunded = refund_full_cancel(cur, oid, reason or "ยกเลิกออเดอร์")
        if refunded > 0:
            logger.info("refund created order=%s amount=%s", oid, refunded)
    if order.get("CustomerId"):
        if final_code == state.CANCELLED:
            text = f"ออเดอร์คิว {q} ถูกยกเลิก" + (f": {reason}" if reason else "")
            if refunded > 0:
                text += f" — กรุณารับเงินคืน {refunded:.2f} บาท ที่ร้าน {order.get('StoreName') or ''} โดยแจ้งเลขคิว {q}"
            ntype = "ORDER_STATUS"
        elif final_code == state.READY:
            text, ntype = f"ออเดอร์คิว {q} {_MESSAGES[final_code]}", "QUEUE_CALLED"
        elif final_code in _MESSAGES:
            text, ntype = f"ออเดอร์คิว {q} {_MESSAGES[final_code]}", "ORDER_STATUS"
        else:
            text = ntype = None
        if text:
            send_notif(db, order["CustomerId"], ntype, f"คิว {q}", text, oid)
    action = "CANCEL_ORDER" if final_code == state.CANCELLED else "UPDATE_STATUS"
    log_audit(db, actor_id, action, "Order", oid, None,
              {"status": final_code, "store_id": order["StoreId"], "reason": reason})

# -------------------------------------------------------------------- contract
def open_order_count(cur, store_id: int) -> int:
    """ออเดอร์ของร้านที่ยังไม่จบ (ใช้กันไม่ให้ตัดสัญญา/ลบร้านทั้งที่ลูกค้ายังรออาหารหรือรอเงินคืน)"""
    cur.execute(
        """
        SELECT COUNT(*) AS n FROM `Order` o JOIN OrderStatus os ON os.StatusId = o.StatusId
        WHERE o.StoreId = %s AND os.IsTerminal = FALSE
        """,
        (store_id,),
    )
    return int(cur.fetchone()["n"])


def purge_expired_stores(db, purge_after_days: int) -> int:
    """ร้านที่หมดสัญญาเกิน N วันและไม่ถูกเปิดสัญญารอบใหม่ -> soft delete (ข้อมูล/ยอดขาย/AuditLog ยังอยู่ครบ)

    ข้ามร้านที่ยังมีออเดอร์ค้าง ; ผู้กระทำ = ระบบ (PerformedBy NULL) ; เรียกซ้ำได้ไม่เกิดผลซ้ำ
    """
    if purge_after_days <= 0:
        return 0
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT s.StoreId, s.StoreName, c.EndDate
            FROM Store s JOIN StoreContract c ON c.StoreId = s.StoreId
            WHERE s.IsDeleted = FALSE AND c.EndDate < DATE_SUB(CURDATE(), INTERVAL %s DAY)
            FOR UPDATE OF s
            """,
            (purge_after_days,),
        )
        targets = cur.fetchall()
        purged = 0
        for st in targets:
            if open_order_count(cur, st["StoreId"]):
                continue
            cur.execute("UPDATE Store SET IsDeleted = TRUE, DeletedAt = %s, IsOpen = FALSE WHERE StoreId = %s",
                        (bangkok_now(), st["StoreId"]))
            log_audit(db, None, "AUTO_DELETE_STORE", "Store", st["StoreId"], {"end": st["EndDate"]},
                      {"name": st["StoreName"], "reason": f"หมดสัญญาเกิน {purge_after_days} วันโดยไม่มีการเปิดสัญญาใหม่"})
            purged += 1
    return purged




# ------------------------------------------------------------------ food court
def get_foodcourt(cur) -> dict:
    cur.execute(
        "SELECT FoodCourtId, FoodCourtName, OpenTime, CloseTime, ManualOverride, OverrideUntil "
        "FROM FoodCourt ORDER BY FoodCourtId LIMIT 1"
    )
    row = cur.fetchone()
    if not row:
        raise DomainError(500, "ยังไม่มีข้อมูลศูนย์อาหารในระบบ (ตาราง FoodCourt ว่าง)")
    return row
