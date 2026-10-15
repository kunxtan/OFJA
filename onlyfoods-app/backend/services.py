"""งานที่ต้องใช้ DB ร่วมกันหลาย router : audit, แจ้งเตือน, เลขคิว, เปลี่ยนสถานะ, คืนเงิน"""
import json
import logging
from contextvars import ContextVar
from decimal import Decimal
from typing import Any, Dict, Optional

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
SELECT o.OrderId, o.StoreId, o.CustomerId, o.QueueNo, o.TotalAmount, o.ReadyAt, o.IsWalkIn,
       o.CancelReason, o.CancelDeadline, os.StatusCode, s.StoreName
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


def queue_print_job(cur, order_id: int) -> None:
    """ออเดอร์พร้อมรับ -> ต้องมีงานพิมพ์ใบลูกค้า 1 งาน (ไม่สร้างซ้ำ)"""
    cur.execute("SELECT PrintJobId FROM PrintJob WHERE OrderId = %s AND PrintType = 'CUSTOMER' LIMIT 1", (order_id,))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO PrintJob (OrderId, PrintType, PrintStatus) VALUES (%s, 'CUSTOMER', 'QUEUED')",
            (order_id,),
        )


# --------------------------------------------------------------------- refunds
def verified_payment(cur, order_id: int, lock: bool = False) -> Optional[dict]:
    cur.execute(
        "SELECT PaymentId, Amount FROM Payment WHERE OrderId = %s AND PaymentStatus = 'VERIFIED' LIMIT 1"
        + (" FOR UPDATE" if lock else ""),
        (order_id,),
    )
    return cur.fetchone()


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


def refund_full_cancel(cur, order_id: int, reason: str) -> Decimal:
    """ยกเลิกทั้งออเดอร์ที่จ่ายเงินแล้ว -> สร้างรายการคืนเงินส่วนที่เหลือ (ถ้ามี)"""
    pay = verified_payment(cur, order_id, lock=True)
    if not pay:
        return Decimal(0)
    remaining = Decimal(pay["Amount"]) - refunded_total(cur, pay["PaymentId"])
    if remaining <= 0:
        return Decimal(0)
    create_refund(cur, pay["PaymentId"], "FULL_CANCEL", remaining, reason)
    return remaining


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
    q = queue_label(order["QueueNo"])
    if final_code == state.READY:
        queue_print_job(cur, oid)
    if final_code == state.CANCELLED:
        refunded = refund_full_cancel(cur, oid, reason or "ยกเลิกออเดอร์")
        if refunded > 0:
            logger.info("refund created order=%s amount=%s", oid, refunded)
    if order.get("CustomerId"):
        if final_code == state.CANCELLED:
            text = f"ออเดอร์คิว {q} ถูกยกเลิก" + (f": {reason}" if reason else "")
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
