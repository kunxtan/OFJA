"""ตรวจสลิป + รายการคืนเงิน"""
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query

import state
from auth import assert_store_access, require_role
from db import get_db, transaction
from errors import DomainError
from schemas import VerifySlipSchema
from services import do_transition, lock_order, log_audit, notify_store_owners, pending_top_up, send_notif
from utils import bangkok_now, clean_text, queue_label

router = APIRouter(prefix="/api", tags=["payments"])


@router.put("/orders/{order_id}/verify-slip")
def verify_slip(order_id: int, payload: VerifySlipSchema,
                user=Depends(require_role("FRONT_STAFF", "STORE_OWNER")), db=Depends(get_db)):
    """ตรวจสลิปค่าอาหาร (VERIFYING_SLIP) หรือสลิปโอนส่วนต่าง (AWAITING_TOP_UP) ด้วยปุ่มเดียวกัน"""
    now = bangkok_now()
    reason = clean_text(payload.reason) or "สลิปไม่ถูกต้อง"
    with transaction(db):
        with db.cursor() as cur:
            order = lock_order(cur, order_id)
            assert_store_access(user, order["StoreId"])
            if order["StatusCode"] == state.VERIFYING_SLIP:
                _verify_order_slip(db, cur, order, payload.approved, reason, user, now)
            elif order["StatusCode"] == state.AWAITING_TOP_UP:
                _verify_top_up_slip(db, cur, order, payload.approved, reason, user, now)
            else:
                raise DomainError(400, f"ออเดอร์นี้ถูกตรวจสอบไปแล้ว (สถานะปัจจุบัน: {state.legacy_status(order['StatusCode'])})")
    return {"success": True}


def _verify_order_slip(db, cur, order, approved: bool, reason: str, user: dict, now) -> None:
    order_id = order["OrderId"]
    cur.execute(
        """
        SELECT p.PaymentId, p.SlipImageUrl, pm.RequiresSlip
        FROM Payment p JOIN PaymentMethod pm ON pm.MethodId = p.MethodId
        WHERE p.OrderId = %s AND p.PaymentType = 'ORDER' AND p.PaymentStatus = 'PENDING'
        ORDER BY p.PaymentId DESC LIMIT 1 FOR UPDATE OF p
        """,
        (order_id,),
    )
    pay = cur.fetchone()
    if not pay:
        raise DomainError(400, "ไม่พบรายการชำระเงินที่รอตรวจสอบ")
    q = queue_label(order["QueueNo"], order["QueueCode"])
    if approved:
        if pay["RequiresSlip"] and not pay["SlipImageUrl"]:
            raise DomainError(400, "ออเดอร์นี้ยังไม่มีสลิปแนบมา อนุมัติไม่ได้ (ปฏิเสธเพื่อให้ลูกค้าสั่งใหม่)")
        cur.execute(
            "UPDATE Payment SET PaymentStatus = 'VERIFIED', VerifiedBy = %s, PaidAt = %s WHERE PaymentId = %s",
            (user["UserId"], now, pay["PaymentId"]),
        )
        do_transition(cur, order, state.PENDING, actor_id=user["UserId"], reason="ยืนยันสลิป", now=now)
        send_notif(db, order["CustomerId"], "PAYMENT", f"คิว {q}",
                   f"สลิปการชำระเงินคิว {q} ได้รับการยืนยันแล้ว", order_id)
        log_audit(db, user["UserId"], "VERIFY_SLIP_APPROVE", "Payment", pay["PaymentId"], None,
                  {"order_id": order_id, "store_id": order["StoreId"]})
    else:
        # แถว Payment ที่ถูกปฏิเสธเก็บไว้เป็นหลักฐาน (ไม่ลบ)
        cur.execute(
            "UPDATE Payment SET PaymentStatus = 'REJECTED', RejectReason = %s, VerifiedBy = %s WHERE PaymentId = %s",
            (reason[:255], user["UserId"], pay["PaymentId"]),
        )
        do_transition(cur, order, state.CANCELLED, actor_id=user["UserId"], reason=reason,
                      cancel_reason=reason, cancel_deadline=None, now=now)
        send_notif(db, order["CustomerId"], "PAYMENT", f"คิว {q}",
                   f"❌ สลิปคิว {q} ถูกปฏิเสธ: {reason}", order_id)
        log_audit(db, user["UserId"], "VERIFY_SLIP_REJECT", "Payment", pay["PaymentId"], None,
                  {"order_id": order_id, "store_id": order["StoreId"], "reason": reason})


def _verify_top_up_slip(db, cur, order, approved: bool, reason: str, user: dict, now) -> None:
    """ผ่าน -> ออเดอร์เข้าครัว (PENDING) ; ไม่ผ่าน -> เก็บใบเดิมเป็น REJECTED แล้วเปิดรายการใหม่ยอดเท่าเดิม
    ให้ลูกค้าแนบสลิปใหม่ (ออเดอร์ยังรอโอนส่วนต่าง ลูกค้ากดยกเลิกเพื่อรับเงินค่าอาหารคืนได้)"""
    order_id = order["OrderId"]
    pay = pending_top_up(cur, order_id)
    if not pay or not pay["SlipImageUrl"]:
        raise DomainError(400, "ลูกค้ายังไม่ได้แนบสลิปส่วนต่าง")
    q = queue_label(order["QueueNo"], order["QueueCode"])
    amount = Decimal(pay["Amount"])
    if approved:
        cur.execute(
            "UPDATE Payment SET PaymentStatus = 'VERIFIED', VerifiedBy = %s, PaidAt = %s WHERE PaymentId = %s",
            (user["UserId"], now, pay["PaymentId"]),
        )
        do_transition(cur, order, state.PENDING, actor_id=user["UserId"],
                      reason=f"ยืนยันสลิปส่วนต่าง {amount:.2f} บาท", now=now)
        send_notif(db, order["CustomerId"], "PAYMENT", f"คิว {q}",
                   f"สลิปส่วนต่าง {amount:.2f} บาท คิว {q} ได้รับการยืนยันแล้ว ร้านกำลังเตรียมอาหาร", order_id)
        log_audit(db, user["UserId"], "VERIFY_TOP_UP_APPROVE", "Payment", pay["PaymentId"], None,
                  {"order_id": order_id, "store_id": order["StoreId"], "amount": amount})
    else:
        cur.execute(
            "UPDATE Payment SET PaymentStatus = 'REJECTED', RejectReason = %s, VerifiedBy = %s WHERE PaymentId = %s",
            (reason[:255], user["UserId"], pay["PaymentId"]),
        )
        cur.execute(
            "INSERT INTO Payment (OrderId, PaymentType, MethodId, Amount, PaymentStatus) "
            "SELECT OrderId, 'TOP_UP', MethodId, Amount, 'PENDING' FROM Payment WHERE PaymentId = %s",
            (pay["PaymentId"],),
        )
        send_notif(db, order["CustomerId"], "PAYMENT", f"คิว {q}",
                   f"❌ สลิปส่วนต่างคิว {q} ถูกปฏิเสธ: {reason} กรุณาแนบสลิปใหม่ ({amount:.2f} บาท)", order_id)
        log_audit(db, user["UserId"], "VERIFY_TOP_UP_REJECT", "Payment", pay["PaymentId"], None,
                  {"order_id": order_id, "store_id": order["StoreId"], "reason": reason})


# ---------------------------------------------------------------- refunds
@router.get("/refunds")
def list_refunds(status: Optional[str] = Query(None, pattern="^(PENDING|DONE|FAILED)$"),
                 limit: int = Query(200, ge=1, le=1000),
                 user=Depends(require_role("ACCOUNTANT", "EXECUTIVE", "STORE_OWNER")), db=Depends(get_db)):
    """ฝ่ายบัญชี/ผู้บริหารเห็นทุกร้าน ; เจ้าของร้านเห็นเฉพาะร้านตัวเอง (ดูอย่างเดียว)"""
    sql = """
        SELECT rf.RefundId, rf.PaymentId, rf.OrderItemId, rf.RefundType, rf.Amount, rf.Reason, rf.RefundStatus,
               rf.RequestedAt, rf.RefundedAt, p.OrderId, o.StoreId, s.StoreName, s.QueueCode, o.QueueNo
        FROM Refund rf
        JOIN Payment p ON p.PaymentId = rf.PaymentId
        JOIN `Order` o ON o.OrderId = p.OrderId
        JOIN Store s ON s.StoreId = o.StoreId
    """
    where, params = [], []
    if user["RoleCode"] == "STORE_OWNER":
        where.append("o.StoreId = %s")
        params.append(user["StoreId"])
    if status:
        where.append("rf.RefundStatus = %s")
        params.append(status)
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY rf.RefundId DESC LIMIT %s"
    params.append(limit)
    with db.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    for r in rows:
        r["QueueNo"] = queue_label(r["QueueNo"], r.pop("QueueCode"))
    return rows


@router.put("/refunds/{refund_id}/done")
def mark_refund_done(refund_id: int, user=Depends(require_role("ACCOUNTANT")), db=Depends(get_db)):
    """ฝ่ายบัญชีโอนเงินคืนลูกค้าแล้ว -> บันทึกว่าเสร็จ (ยอดสุทธิของร้านหักทันที ผ่าน v_order_net)
    แล้วแจ้งเจ้าของร้านและลูกค้า"""
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT rf.RefundStatus, rf.Amount, rf.RefundType, rf.PaymentId, o.OrderId, o.StoreId,
                       o.CustomerId, o.QueueNo, s.QueueCode
                FROM Refund rf
                JOIN Payment p ON p.PaymentId = rf.PaymentId
                JOIN `Order` o ON o.OrderId = p.OrderId
                JOIN Store s ON s.StoreId = o.StoreId
                WHERE rf.RefundId = %s FOR UPDATE OF rf
                """,
                (refund_id,),
            )
            rf = cur.fetchone()
            if not rf:
                raise DomainError(404, "ไม่พบรายการคืนเงิน")
            if rf["RefundStatus"] != "PENDING":
                raise DomainError(400, "รายการนี้ดำเนินการไปแล้ว")
            cur.execute(
                "UPDATE Refund SET RefundStatus = 'DONE', RefundedBy = %s, RefundedAt = %s WHERE RefundId = %s",
                (user["UserId"], bangkok_now(), refund_id),
            )
        q = queue_label(rf["QueueNo"], rf["QueueCode"])
        amount = Decimal(rf["Amount"])
        kind = {"FULL_CANCEL": "ยกเลิกออเดอร์", "PRICE_DIFF": "ส่วนต่างราคาเมนู"}.get(rf["RefundType"], "คืนเงินรายการ")
        notify_store_owners(db, rf["StoreId"], "PAYMENT", f"คืนเงินคิว {q}",
                            f"ฝ่ายบัญชีคืนเงิน {amount:.2f} บาท ({kind}) คิว {q} แล้ว ยอดขายสุทธิของร้านหักตามยอดนี้",
                            rf["OrderId"])
        send_notif(db, rf["CustomerId"], "PAYMENT", f"คืนเงินคิว {q}",
                   f"คืนเงิน {amount:.2f} บาท ({kind}) คิว {q} เรียบร้อยแล้ว", rf["OrderId"])
        log_audit(db, user["UserId"], "REFUND_DONE", "Refund", refund_id, None,
                  {"amount": amount, "order_id": rf["OrderId"], "store_id": rf["StoreId"]})
    return {"success": True}
