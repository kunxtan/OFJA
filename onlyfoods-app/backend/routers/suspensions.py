"""ระงับบัญชีลูกค้า : ผู้บริหารระงับ/ปลด/พิจารณาอุทธรณ์ ; ลูกค้าดูสถานะและยื่นอุทธรณ์ (กติกาดู suspension.py)"""
from fastapi import APIRouter, Depends

from auth import require_role
from db import get_db, transaction
from errors import DomainError
from schemas import AppealDecisionSchema, AppealSchema, SuspendSchema, UnsuspendSchema
from services import is_duplicate_key, log_audit, send_notif
from suspension import (ACTIVE_SQL, APPEAL_MAX, APPEAL_MIN, REASON_MAX, REASON_MIN, RESPONSE_MAX, active_suspension,
                        clean_words, is_active, lift, lift_expired, notice_suspended, suspension_end, until_text)
from routers.users import ERASED_USERNAME_PREFIX
from utils import bangkok_now

router = APIRouter(prefix="/api", tags=["suspensions"])

_HISTORY_SQL = """
    SELECT s.SuspensionId, s.UserId, s.Reason, s.StartAt, s.EndAt, s.LiftedAt, s.LiftType, s.LiftNote,
           s.AppealText, s.AppealAt, s.AppealStatus, s.AppealResponse, s.AppealReviewedAt,
           c.Username, c.FullName AS CustomerName,
           sb.FullName AS SuspendedByName, lb.FullName AS LiftedByName, rb.FullName AS ReviewedByName
    FROM UserSuspension s
    JOIN `User` c ON c.UserId = s.UserId
    JOIN `User` sb ON sb.UserId = s.SuspendedBy
    LEFT JOIN `User` lb ON lb.UserId = s.LiftedBy
    LEFT JOIN `User` rb ON rb.UserId = s.AppealReviewedBy
"""

# ลูกค้าเห็นสถานะของตัวเองได้ แต่ไม่เห็นชื่อผู้บริหารที่ดำเนินการ
_STAFF_ONLY = ("SuspendedByName", "LiftedByName", "ReviewedByName")


def _shape(row: dict, now, for_customer: bool = False) -> dict:
    row = dict(row)
    row["IsActive"] = is_active(row, now)
    if row["IsActive"]:
        row["State"] = "ACTIVE"
    elif row["LiftType"] == "MANUAL":
        row["State"] = "LIFTED"
    elif row["LiftType"] == "APPEAL":
        row["State"] = "APPEAL_APPROVED"
    else:
        row["State"] = "EXPIRED"  # ครบกำหนด (ปลดอัตโนมัติแล้ว หรือหมดเวลาแต่ job ยังไม่ได้เขียน)
    if for_customer:
        for key in _STAFF_ONLY:
            row.pop(key, None)
    return row


def _lock_customer(cur, user_id: int) -> dict:
    cur.execute(
        "SELECT u.UserId, u.Username, u.FullName, u.IsActive, r.RoleCode FROM `User` u "
        "JOIN Role r ON r.RoleId = u.RoleId WHERE u.UserId = %s FOR UPDATE OF u",
        (user_id,),
    )
    target = cur.fetchone()
    if not target or target["RoleCode"] != "CUSTOMER" or target["Username"].startswith(ERASED_USERNAME_PREFIX):
        raise DomainError(404, "ไม่พบบัญชีลูกค้านี้ (ระงับได้เฉพาะบัญชีลูกค้า)")
    return target


def _one(cur, suspension_id: int, now) -> dict:
    cur.execute(_HISTORY_SQL + " WHERE s.SuspensionId = %s", (suspension_id,))
    return _shape(cur.fetchone(), now)


# ------------------------------------------------------------------ executive
@router.post("/executive/customers/{user_id}/suspend", status_code=201)
def suspend_customer(user_id: int, data: SuspendSchema, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    reason = clean_words(data.reason, "เหตุผลที่ระงับ", REASON_MIN, REASON_MAX)
    now = bangkok_now()
    end_at = suspension_end(now, data.days)
    with transaction(db):
        with db.cursor() as cur:
            target = _lock_customer(cur, user_id)
            if not target["IsActive"]:
                raise DomainError(400, "บัญชีนี้ถูกปิดใช้งานอยู่แล้ว")
            lift_expired(cur, db, user_id, now)
            current = active_suspension(cur, user_id, now)
            if current:
                raise DomainError(409, f"บัญชีนี้ถูกระงับอยู่แล้ว {until_text(current['EndAt'])} "
                                       "หากต้องการเปลี่ยนระยะเวลา ให้ปลดระงับก่อนแล้วระงับใหม่")
            try:
                cur.execute(
                    "INSERT INTO UserSuspension (UserId, Reason, StartAt, EndAt, SuspendedBy) VALUES (%s, %s, %s, %s, %s)",
                    (user_id, reason, now, end_at, user["UserId"]),
                )
            except Exception as exc:  # noqa: BLE001
                if is_duplicate_key(exc):  # ผู้บริหารอีกคนเพิ่งระงับพร้อมกัน
                    raise DomainError(409, "บัญชีนี้เพิ่งถูกระงับไป กรุณาโหลดข้อมูลใหม่")
                raise
            sid = cur.lastrowid
            send_notif(db, user_id, "SYSTEM", "บัญชีของคุณถูกระงับการใช้งาน", notice_suspended(reason, end_at, data.days))
            log_audit(db, user["UserId"], "BAN_USER", "User", user_id, {"suspended": False},
                      {"suspended": True, "suspension_id": sid, "username": target["Username"], "reason": reason,
                       "days": data.days, "until": end_at})
            row = _one(cur, sid, now)
    return {"success": True, "suspension": row,
            "message": f"ระงับบัญชี {target['Username']} {until_text(end_at)} แล้ว"}


@router.post("/executive/customers/{user_id}/unsuspend")
def unsuspend_customer(user_id: int, data: UnsuspendSchema, user=Depends(require_role("EXECUTIVE")),
                       db=Depends(get_db)):
    note = clean_words(data.note, "หมายเหตุ", 0, REASON_MAX, required=False)
    now = bangkok_now()
    with transaction(db):
        with db.cursor() as cur:
            target = _lock_customer(cur, user_id)
            cur.execute(
                f"SELECT SuspensionId, UserId, Reason, EndAt FROM UserSuspension WHERE UserId = %s AND {ACTIVE_SQL} "
                "FOR UPDATE",
                (user_id, now),
            )
            row = cur.fetchone()
            if not row:
                raise DomainError(400, "บัญชีนี้ไม่ได้ถูกระงับอยู่")
            lift(db, cur, {**row, "Username": target["Username"]}, "MANUAL", now, by=user["UserId"], note=note)
    return {"success": True, "message": f"ปลดระงับบัญชี {target['Username']} แล้ว"}


@router.get("/executive/customers/{user_id}/suspensions")
def customer_suspensions(user_id: int, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    """ประวัติการระงับ : ใครระงับ เมื่อไร เหตุผล ระยะเวลา การปลด และอุทธรณ์"""
    now = bangkok_now()
    with db.cursor() as cur:
        cur.execute(_HISTORY_SQL + " WHERE s.UserId = %s ORDER BY s.StartAt DESC, s.SuspensionId DESC", (user_id,))
        return [_shape(r, now) for r in cur.fetchall()]


@router.get("/executive/suspension-appeals")
def pending_appeals(user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    """อุทธรณ์ที่รอพิจารณา (เฉพาะการระงับที่ยังมีผลอยู่)"""
    now = bangkok_now()
    with db.cursor() as cur:
        cur.execute(_HISTORY_SQL + " WHERE s.AppealStatus = 'PENDING' AND s.LiftedAt IS NULL"
                                   " AND (s.EndAt IS NULL OR s.EndAt > %s) ORDER BY s.AppealAt", (now,))
        return [_shape(r, now) for r in cur.fetchall()]


@router.post("/executive/suspensions/{suspension_id}/appeal")
def decide_appeal(suspension_id: int, data: AppealDecisionSchema, user=Depends(require_role("EXECUTIVE")),
                  db=Depends(get_db)):
    response = clean_words(data.response, "คำตอบถึงลูกค้า", 0 if data.approve else 5, RESPONSE_MAX,
                           required=not data.approve)
    now = bangkok_now()
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                "SELECT s.SuspensionId, s.UserId, s.Reason, s.EndAt, s.LiftedAt, s.AppealStatus, u.Username "
                "FROM UserSuspension s JOIN `User` u ON u.UserId = s.UserId WHERE s.SuspensionId = %s FOR UPDATE OF s",
                (suspension_id,),
            )
            row = cur.fetchone()
            if not row or not row["AppealStatus"]:
                raise DomainError(404, "ไม่พบคำอุทธรณ์นี้")
            if row["AppealStatus"] != "PENDING":
                raise DomainError(409, "คำอุทธรณ์นี้ได้รับการพิจารณาไปแล้ว")
            if not is_active(row, now):
                raise DomainError(409, "การระงับนี้สิ้นสุดไปแล้ว ไม่ต้องพิจารณาอุทธรณ์")
            cur.execute(
                "UPDATE UserSuspension SET AppealStatus = %s, AppealResponse = %s, AppealReviewedBy = %s, "
                "AppealReviewedAt = %s WHERE SuspensionId = %s",
                ("APPROVED" if data.approve else "REJECTED", response, user["UserId"], now, suspension_id),
            )
            if data.approve:
                lift(db, cur, row, "APPEAL", now, by=user["UserId"], note=response)
            else:
                send_notif(db, row["UserId"], "SYSTEM", "อุทธรณ์ไม่ได้รับการอนุมัติ",
                           f"บัญชีของคุณยังถูกระงับ {until_text(row['EndAt'])} ข้อความจากผู้บริหาร: {response}")
                log_audit(db, user["UserId"], "USER_APPEAL_REJECT", "User", row["UserId"], None,
                          {"suspension_id": suspension_id, "username": row["Username"], "response": response})
    return {"success": True, "message": "อนุมัติอุทธรณ์และปลดระงับแล้ว" if data.approve else "แจ้งผลไม่อนุมัติให้ลูกค้าแล้ว"}


# ------------------------------------------------------------------- customer
@router.get("/me/suspension")
def my_suspension(user=Depends(require_role("CUSTOMER")), db=Depends(get_db)):
    """สถานะการระงับของตัวเอง (active = None คือใช้งานได้ตามปกติ) + ประวัติล่าสุด"""
    now = bangkok_now()
    with db.cursor() as cur:
        cur.execute(_HISTORY_SQL + " WHERE s.UserId = %s ORDER BY s.StartAt DESC, s.SuspensionId DESC LIMIT 10",
                    (user["UserId"],))
        history = [_shape(r, now, for_customer=True) for r in cur.fetchall()]
    return {"active": next((h for h in history if h["IsActive"]), None), "history": history}


@router.post("/me/suspension/appeal")
def submit_appeal(data: AppealSchema, user=Depends(require_role("CUSTOMER")), db=Depends(get_db)):
    text = clean_words(data.text, "เหตุผลในการอุทธรณ์", APPEAL_MIN, APPEAL_MAX)
    now = bangkok_now()
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                f"SELECT SuspensionId, AppealText FROM UserSuspension WHERE UserId = %s AND {ACTIVE_SQL} FOR UPDATE",
                (user["UserId"], now),
            )
            row = cur.fetchone()
            if not row:
                raise DomainError(400, "บัญชีของคุณไม่ได้ถูกระงับอยู่")
            if row["AppealText"]:
                raise DomainError(409, "คุณยื่นอุทธรณ์สำหรับการระงับครั้งนี้ไปแล้ว (ยื่นได้ 1 ครั้งต่อการระงับ)")
            cur.execute(
                "UPDATE UserSuspension SET AppealText = %s, AppealAt = %s, AppealStatus = 'PENDING' WHERE SuspensionId = %s",
                (text, now, row["SuspensionId"]),
            )
            cur.execute(
                "SELECT u.UserId FROM `User` u JOIN Role r ON r.RoleId = u.RoleId "
                "WHERE r.RoleCode = 'EXECUTIVE' AND u.IsActive = TRUE"
            )
            name = user.get("FullName") or user["Username"]
            for ex in cur.fetchall():
                send_notif(db, ex["UserId"], "SYSTEM", "มีคำอุทธรณ์การระงับบัญชี",
                           f"{name} (@{user['Username']}) ยื่นอุทธรณ์: {text[:200]}")
            log_audit(db, user["UserId"], "USER_APPEAL", "User", user["UserId"], None,
                      {"suspension_id": row["SuspensionId"], "username": user["Username"], "text": text[:300]})
    return {"success": True, "message": "ส่งคำอุทธรณ์แล้ว ผู้บริหารจะพิจารณาและแจ้งผลทางการแจ้งเตือน"}
