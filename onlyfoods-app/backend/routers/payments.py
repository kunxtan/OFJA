"""ตรวจสลิป + รายการคืนเงิน"""
from typing import Optional

from fastapi import APIRouter, Depends, Query

import state
from auth import assert_store_access, require_role
from db import get_db, transaction
from errors import DomainError
from schemas import VerifySlipSchema
from services import do_transition, lock_order, log_audit, send_notif
from utils import bangkok_now, clean_text, queue_label

router = APIRouter(prefix="/api", tags=["payments"])


@router.put("/orders/{order_id}/verify-slip")
def verify_slip(order_id: int, payload: VerifySlipSchema,
                user=Depends(require_role("FRONT_STAFF", "STORE_OWNER")), db=Depends(get_db)):
    now = bangkok_now()
    reason = clean_text(payload.reason) or "สลิปไม่ถูกต้อง"
    with transaction(db):
        with db.cursor() as cur:
            order = lock_order(cur, order_id)
            assert_store_access(user, order["StoreId"])
            if order["StatusCode"] != state.VERIFYING_SLIP:
                raise DomainError(400, f"ออเดอร์นี้ถูกตรวจสอบไปแล้ว (สถานะปัจจุบัน: {state.legacy_status(order['StatusCode'])})")
            cur.execute(
                """
                SELECT p.PaymentId, p.SlipImageUrl, pm.RequiresSlip
                FROM Payment p JOIN PaymentMethod pm ON pm.MethodId = p.MethodId
                WHERE p.OrderId = %s AND p.PaymentStatus = 'PENDING' ORDER BY p.PaymentId DESC LIMIT 1 FOR UPDATE OF p
                """,
                (order_id,),
            )
            pay = cur.fetchone()
            if not pay:
                raise DomainError(400, "ไม่พบรายการชำระเงินที่รอตรวจสอบ")
            q = queue_label(order["QueueNo"])
            if payload.approved:
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
    return {"success": True}


# ---------------------------------------------------------------- refunds
@router.get("/refunds")
def list_refunds(status: Optional[str] = Query(None, pattern="^(PENDING|DONE|FAILED)$"),
                 limit: int = Query(200, ge=1, le=1000),
                 user=Depends(require_role("ACCOUNTANT", "EXECUTIVE")), db=Depends(get_db)):
    sql = """
        SELECT rf.RefundId, rf.PaymentId, rf.OrderItemId, rf.RefundType, rf.Amount, rf.Reason, rf.RefundStatus,
               rf.RequestedAt, rf.RefundedAt, p.OrderId, o.StoreId, s.StoreName, o.QueueNo
        FROM Refund rf
        JOIN Payment p ON p.PaymentId = rf.PaymentId
        JOIN `Order` o ON o.OrderId = p.OrderId
        JOIN Store s ON s.StoreId = o.StoreId
    """
    params = []
    if status:
        sql += " WHERE rf.RefundStatus = %s"
        params.append(status)
    sql += " ORDER BY rf.RefundId DESC LIMIT %s"
    params.append(limit)
    with db.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    for r in rows:
        r["QueueNo"] = queue_label(r["QueueNo"])
    return rows


@router.put("/refunds/{refund_id}/done")
def mark_refund_done(refund_id: int, user=Depends(require_role("ACCOUNTANT")), db=Depends(get_db)):
    """ฝ่ายบัญชีโอนเงินคืนลูกค้าแล้ว -> บันทึกว่าเสร็จ"""
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT RefundStatus, Amount, PaymentId FROM Refund WHERE RefundId = %s FOR UPDATE", (refund_id,))
            rf = cur.fetchone()
            if not rf:
                raise DomainError(404, "ไม่พบรายการคืนเงิน")
            if rf["RefundStatus"] != "PENDING":
                raise DomainError(400, "รายการนี้ดำเนินการไปแล้ว")
            cur.execute(
                "UPDATE Refund SET RefundStatus = 'DONE', RefundedBy = %s, RefundedAt = %s WHERE RefundId = %s",
                (user["UserId"], bangkok_now(), refund_id),
            )
        log_audit(db, user["UserId"], "REFUND_DONE", "Refund", refund_id, None, {"amount": rf["Amount"]})
    return {"success": True}
