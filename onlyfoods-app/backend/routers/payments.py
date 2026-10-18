"""ตรวจสลิป + รายการคืนเงิน"""
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query

import state
from auth import assert_store_access, require_role
from db import get_db, transaction
from errors import DomainError
from schemas import RefundDoneSchema, RefundPayoutSchema, VerifySlipSchema
from services import do_transition, lock_order, log_audit, notify_store_owners, pending_top_up, send_notif
from utils import bangkok_now, clean_text, delete_upload, mask_account, queue_label, save_image, validate_payout

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
# ยกเลิก/เปลี่ยนเป็นเมนูที่ถูกกว่า -> Refund PENDING ("รอคืน") ; ไม่นับเป็นรายได้ตั้งแต่ตอนนี้ (v_order_net)
# ลูกค้าเลือกวิธีรับเงินคืน (PUT /refunds/{id}/payout) :
#   CASH     (ค่าเริ่มต้น) มารับเงินสดที่หน้าร้านโดยแจ้งเลขคิว -> พนักงานหน้าร้านหรือเจ้าของร้านกด "คืนเงินแล้ว"
#   TRANSFER ให้โอนคืน (พร้อมเพย์ หรือ ธนาคาร+เลขบัญชี+ชื่อบัญชี) -> เฉพาะเจ้าของร้านโอนและแนบสลิป (บังคับ)
# ข้อมูลบัญชีลูกค้าเห็นเต็มเฉพาะเจ้าของ (GET /refunds/{id}/payout-info บันทึก audit) แล้วล้างทิ้งเมื่อคืนเงินเสร็จ
# ฝ่ายบัญชี/ผู้บริหารดูได้ทุกร้าน (ดูอย่างเดียว เลขบัญชีปิดบางส่วน) ; ลูกค้าเห็นเฉพาะของตัวเอง
REFUND_CONFIRM_ROLES = ("FRONT_STAFF", "STORE_OWNER")
_REFUND_VIEW_ROLES = ("ACCOUNTANT", "EXECUTIVE", "STORE_OWNER", "FRONT_STAFF", "CUSTOMER")


@router.get("/refunds")
def list_refunds(status: Optional[str] = Query(None, pattern="^(PENDING|DONE|FAILED)$"),
                 store_id: Optional[int] = None,
                 limit: int = Query(200, ge=1, le=2000),
                 user=Depends(require_role(*_REFUND_VIEW_ROLES)), db=Depends(get_db)):
    sql = """
        SELECT rf.RefundId, rf.PaymentId, rf.OrderItemId, rf.RefundType, rf.Amount, rf.Reason, rf.RefundStatus,
               rf.RequestedAt, rf.RefundedAt, rb.FullName AS RefundedByName, rr.RoleCode AS RefundedByRole,
               rf.PayoutMethod, rf.PayoutKind, rf.PayoutBank, rf.PayoutAccountNo, rf.PayoutAccountName,
               (rf.PayoutQrUrl IS NOT NULL) AS HasPayoutQr, rf.PaidMethod, rf.TransferSlipUrl,
               p.OrderId, o.StoreId, s.StoreName, s.QueueCode, o.QueueNo, o.IsWalkIn, o.OrderDate,
               cu.FullName AS CustomerName, cu.Phone AS CustomerPhone
        FROM Refund rf
        JOIN Payment p ON p.PaymentId = rf.PaymentId
        JOIN `Order` o ON o.OrderId = p.OrderId
        JOIN Store s ON s.StoreId = o.StoreId
        LEFT JOIN `User` cu ON cu.UserId = o.CustomerId
        LEFT JOIN `User` rb ON rb.UserId = rf.RefundedBy
        LEFT JOIN Role rr ON rr.RoleId = rb.RoleId
    """
    where, params = [], []
    role = user["RoleCode"]
    if role in ("STORE_OWNER", "FRONT_STAFF"):
        if user["StoreId"] is None:
            raise DomainError(403, "บัญชีนี้ยังไม่ได้ผูกกับร้านค้า")
        where.append("o.StoreId = %s")
        params.append(user["StoreId"])
    elif role == "CUSTOMER":
        where.append("o.CustomerId = %s")
        params.append(user["UserId"])
    elif store_id is not None:
        where.append("o.StoreId = %s")
        params.append(store_id)
    if status:
        where.append("rf.RefundStatus = %s")
        params.append(status)
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY rf.RefundStatus = 'PENDING' DESC, rf.RefundId DESC LIMIT %s"
    params.append(limit)
    with db.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    for r in rows:
        r["QueueNo"] = queue_label(r["QueueNo"], r.pop("QueueCode"))
        r["HasPayoutQr"] = bool(r["HasPayoutQr"])
        if role == "CUSTOMER":  # ลูกค้าไม่ต้องเห็นชื่อพนักงาน แต่เห็นข้อมูลรับเงินของตัวเอง
            r.pop("RefundedByName", None)
            r.pop("RefundedByRole", None)
        else:  # คนอื่นเห็นแค่ว่าจะรับเงินแบบไหน เลขบัญชีปิดบางส่วน ; ชื่อบัญชีไม่ส่งให้
            r["PayoutAccountNo"] = mask_account(r["PayoutAccountNo"])
            r.pop("PayoutAccountName", None)
    return rows


def _lock_refund(cur, refund_id: int) -> dict:
    cur.execute(
        """
        SELECT rf.RefundStatus, rf.Amount, rf.RefundType, rf.PaymentId, rf.PayoutMethod, rf.PayoutKind,
               rf.PayoutBank, rf.PayoutAccountNo, rf.PayoutAccountName, rf.PayoutQrUrl,
               o.OrderId, o.StoreId, o.CustomerId, o.QueueNo, s.QueueCode
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
    return rf


@router.put("/refunds/{refund_id}/payout")
def set_refund_payout(refund_id: int, payload: RefundPayoutSchema,
                      user=Depends(require_role("CUSTOMER")), db=Depends(get_db)):
    """ลูกค้าเลือกรับเงินสดที่ร้าน หรือให้เจ้าของร้านโอนให้ (แก้ได้จนกว่าร้านจะคืนเงินแล้ว)"""
    with transaction(db):
        with db.cursor() as cur:
            rf = _lock_refund(cur, refund_id)
            if rf["CustomerId"] != user["UserId"]:
                raise DomainError(403, "ไม่ใช่รายการคืนเงินของคุณ")
            if rf["RefundStatus"] != "PENDING":
                raise DomainError(400, "รายการนี้คืนเงินไปแล้ว เปลี่ยนวิธีรับเงินไม่ได้")
            if payload.method == "CASH":
                cur.execute(
                    """UPDATE Refund SET PayoutMethod = 'CASH', PayoutKind = NULL, PayoutBank = NULL,
                       PayoutAccountNo = NULL, PayoutAccountName = NULL, PayoutQrUrl = NULL WHERE RefundId = %s""",
                    (refund_id,),
                )
            else:
                info = validate_payout(payload.kind, payload.bank, payload.account_no, payload.account_name)
                qr = save_image(payload.qr_image, "refunds") if payload.qr_image else None
                if payload.qr_image and not qr:
                    raise DomainError(400, "ไฟล์รูป QR ไม่ถูกต้อง")
                cur.execute(
                    """UPDATE Refund SET PayoutMethod = 'TRANSFER', PayoutKind = %s, PayoutBank = %s,
                       PayoutAccountNo = %s, PayoutAccountName = %s, PayoutQrUrl = %s WHERE RefundId = %s""",
                    (info["kind"], info["bank"], info["account_no"], info["account_name"], qr, refund_id),
                )
        q = queue_label(rf["QueueNo"], rf["QueueCode"])
        if payload.method == "TRANSFER":
            notify_store_owners(db, rf["StoreId"], "PAYMENT", f"ลูกค้าขอรับเงินคืนแบบโอน คิว {q}",
                                f"คิว {q} ขอรับเงินคืน {Decimal(rf['Amount']):.2f} บาท โดยโอนเข้าบัญชี "
                                f"(เปิดดูข้อมูลได้ที่เมนูคืนเงินลูกค้า)", rf["OrderId"])
        log_audit(db, user["UserId"], "REFUND_PAYOUT_SET", "Refund", refund_id, None,
                  {"method": payload.method, "kind": payload.kind if payload.method == "TRANSFER" else None,
                   "order_id": rf["OrderId"], "store_id": rf["StoreId"]})
    return {"success": True, "method": payload.method}


@router.get("/refunds/{refund_id}/payout-info")
def get_refund_payout_info(refund_id: int, user=Depends(require_role("STORE_OWNER")), db=Depends(get_db)):
    """เจ้าของร้านเปิดดูข้อมูลบัญชีเต็มของลูกค้าเพื่อโอนคืน (บันทึก audit ทุกครั้ง)"""
    with db.cursor() as cur:
        rf = _lock_refund(cur, refund_id)
    db.rollback()
    assert_store_access(user, rf["StoreId"])
    if rf["RefundStatus"] != "PENDING" or rf["PayoutMethod"] != "TRANSFER":
        raise DomainError(400, "รายการนี้ไม่มีข้อมูลโอนที่ต้องดำเนินการ")
    with transaction(db):
        log_audit(db, user["UserId"], "REFUND_PAYOUT_VIEW", "Refund", refund_id, None,
                  {"order_id": rf["OrderId"], "store_id": rf["StoreId"]})
    return {"kind": rf["PayoutKind"], "bank": rf["PayoutBank"], "account_no": rf["PayoutAccountNo"],
            "account_name": rf["PayoutAccountName"], "qr_image": rf["PayoutQrUrl"],
            "amount": rf["Amount"]}


@router.put("/refunds/{refund_id}/done")
def mark_refund_done(refund_id: int, payload: Optional[RefundDoneSchema] = None,
                     user=Depends(require_role(*REFUND_CONFIRM_ROLES)), db=Depends(get_db)):
    """ร้านจ่ายเงินคืนแล้ว -> บันทึกว่าคืนแล้ว (ใคร/เมื่อไหร่/วิธีไหน) แล้วแจ้งลูกค้าและเจ้าของร้าน
    CASH = จ่ายเงินสดที่หน้าร้าน (พนักงานหรือเจ้าของ) ; TRANSFER = เจ้าของร้านเท่านั้น และต้องแนบสลิปโอน"""
    payload = payload or RefundDoneSchema()
    if payload.method == "TRANSFER" and user["RoleCode"] != "STORE_OWNER":
        raise DomainError(403, "การโอนเงินคืนทำได้เฉพาะเจ้าของร้าน")
    slip = None
    if payload.method == "TRANSFER":
        slip = save_image(payload.slip_image, "refunds") if payload.slip_image else None
        if not slip:
            raise DomainError(400, "กรุณาแนบสลิปโอนเงินคืน")
    with transaction(db):
        with db.cursor() as cur:
            rf = _lock_refund(cur, refund_id)
            assert_store_access(user, rf["StoreId"])
            if rf["RefundStatus"] != "PENDING":
                raise DomainError(400, "รายการนี้คืนเงินไปแล้ว")
            if rf["PayoutMethod"] == "TRANSFER" and payload.method == "CASH" and user["RoleCode"] != "STORE_OWNER":
                raise DomainError(403, "ลูกค้าขอรับเงินคืนแบบโอน ให้เจ้าของร้านดำเนินการ")
            now = bangkok_now()
            # ล้างข้อมูลบัญชีของลูกค้าออกเมื่อคืนเงินเสร็จ (เก็บแค่วิธีจ่ายและสลิป)
            cur.execute(
                """UPDATE Refund SET RefundStatus = 'DONE', RefundedBy = %s, RefundedAt = %s, PaidMethod = %s,
                   TransferSlipUrl = %s, PayoutBank = NULL, PayoutAccountNo = NULL, PayoutAccountName = NULL,
                   PayoutQrUrl = NULL WHERE RefundId = %s""",
                (user["UserId"], now, payload.method, slip, refund_id),
            )
        delete_upload(rf["PayoutQrUrl"])  # ไฟล์ QR ของลูกค้าไม่ต้องเก็บต่อ
        q = queue_label(rf["QueueNo"], rf["QueueCode"])
        amount = Decimal(rf["Amount"])
        kind = {"FULL_CANCEL": "ยกเลิกออเดอร์", "PRICE_DIFF": "ส่วนต่างราคาเมนู"}.get(rf["RefundType"], "คืนเงินรายการ")
        how = "โอนเข้าบัญชีของคุณ" if payload.method == "TRANSFER" else "ที่หน้าร้าน"
        if user["RoleCode"] != "STORE_OWNER":
            notify_store_owners(db, rf["StoreId"], "PAYMENT", f"คืนเงินคิว {q}",
                                f"หน้าร้านคืนเงินสด {amount:.2f} บาท ({kind}) คิว {q} ให้ลูกค้าแล้ว", rf["OrderId"])
        send_notif(db, rf["CustomerId"], "PAYMENT", f"คืนเงินคิว {q}",
                   f"คุณได้รับเงินคืน {amount:.2f} บาท ({kind}) คิว {q} {how}เรียบร้อยแล้ว", rf["OrderId"])
        log_audit(db, user["UserId"], "REFUND_DONE", "Refund", refund_id, {"status": "PENDING"},
                  {"status": "DONE", "amount": amount, "order_id": rf["OrderId"], "store_id": rf["StoreId"],
                   "queue": q, "type": rf["RefundType"], "paid_method": payload.method})
    return {"success": True, "refunded_at": now}
