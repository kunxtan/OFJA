"""ระงับบัญชีลูกค้า (ผู้บริหารเท่านั้น) : ข้อความ, การเช็คสถานะ, การปลดระงับ

กติกา
- ระงับได้เฉพาะบัญชี CUSTOMER ; ต้องมีเหตุผล ; กำหนดจำนวนวัน หรือไม่มีกำหนด (จนกว่าผู้บริหารจะปลด)
- ระหว่างระงับ : ยังเข้าสู่ระบบได้ ดูออเดอร์/แจ้งเตือนได้ และยื่นอุทธรณ์ได้ 1 ครั้งต่อการระงับ
  แต่สั่งอาหารใหม่และเขียน/แก้รีวิวไม่ได้
- ออเดอร์ที่สั่งไว้ก่อนถูกระงับไม่ถูกยกเลิก เดินตามขั้นตอนปกติจนจบ (จ่ายสลิป/รับอาหาร/แจ้งปัญหาได้ตามเดิม)
- ครบกำหนดแล้วปลดเอง : การเช็คสิทธิ์เทียบเวลา EndAt ตรง ๆ (ไม่ต้องรอ job) ส่วน job เขียน LiftedAt + แจ้งลูกค้า
- ทุกขั้นตอนลง AuditLog และแจ้งเตือนลูกค้า (Notification ประเภท SYSTEM)
"""
from datetime import datetime, timedelta
from typing import Optional

from errors import DomainError
from services import log_audit, send_notif
from utils import bangkok_now

MAX_DAYS = 365
REASON_MIN, REASON_MAX = 5, 255
APPEAL_MIN, APPEAL_MAX = 10, 1000
RESPONSE_MAX = 500

_TH_MONTHS = ("ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.")

# แถวที่ยังไม่ถูกปลด (รวมแถวที่หมดเวลาแล้วแต่ job ยังไม่ได้เขียน LiftedAt)
OPEN_SQL = "LiftedAt IS NULL"
# ระงับอยู่จริง ณ เวลา %s
ACTIVE_SQL = "LiftedAt IS NULL AND (EndAt IS NULL OR EndAt > %s)"


def thai_datetime(dt: Optional[datetime]) -> str:
    if not dt:
        return ""
    return f"{dt.day} {_TH_MONTHS[dt.month - 1]} {dt.year + 543} {dt:%H:%M} น."


def clean_words(value: Optional[str], label: str, min_len: int, max_len: int, required: bool = True) -> Optional[str]:
    text = " ".join((value or "").split())
    if not text and not required:
        return None
    if len(text) < min_len:
        raise DomainError(400, f"กรุณาระบุ{label}อย่างน้อย {min_len} ตัวอักษร")
    if len(text) > max_len:
        raise DomainError(400, f"{label}ต้องไม่เกิน {max_len} ตัวอักษร")
    return text


def suspension_end(now: datetime, days: Optional[int]) -> Optional[datetime]:
    """None = ไม่มีกำหนด ; ปัดเป็นนาที (แสดงผล/เทียบเวลาได้ตรงกัน)"""
    if days is None:
        return None
    if not 1 <= int(days) <= MAX_DAYS:
        raise DomainError(400, f"ระยะเวลาระงับต้องอยู่ระหว่าง 1–{MAX_DAYS} วัน")
    return (now + timedelta(days=int(days))).replace(second=0, microsecond=0)


def is_active(row: Optional[dict], now: datetime) -> bool:
    return bool(row) and row.get("LiftedAt") is None and (row.get("EndAt") is None or row["EndAt"] > now)


def until_text(end_at: Optional[datetime]) -> str:
    return f"ถึง {thai_datetime(end_at)}" if end_at else "จนกว่าผู้บริหารจะปลดระงับ"


def blocked_message(row: dict, action: str) -> str:
    """ข้อความตอบลูกค้าเมื่อทำสิ่งที่ถูกระงับ (สั่งอาหาร / รีวิว)"""
    return (f"บัญชีของคุณถูกระงับ{action} {until_text(row['EndAt'])} เหตุผล: {row['Reason']} "
            f"(ออเดอร์ที่สั่งไว้แล้วยังดำเนินการตามปกติ หากไม่เห็นด้วยยื่นอุทธรณ์ได้ที่หน้าโปรไฟล์)")


def notice_suspended(reason: str, end_at: Optional[datetime], days: Optional[int]) -> str:
    span = f"{days} วัน ({until_text(end_at)})" if days else until_text(end_at)
    return (f"ระงับการสั่งอาหารการรีวิว และการแจ้งปัญหา {span} เหตุผล: {reason} "
            f"ออเดอร์ที่สั่งไว้แล้วยังดำเนินการตามปกติ หากไม่เห็นด้วยยื่นอุทธรณ์ได้ที่หน้าโปรไฟล์")


def active_suspension(cur, user_id: int, now: Optional[datetime] = None) -> Optional[dict]:
    cur.execute(
        f"SELECT SuspensionId, Reason, StartAt, EndAt, LiftedAt, AppealStatus FROM UserSuspension "
        f"WHERE UserId = %s AND {ACTIVE_SQL} LIMIT 1",
        (user_id, now or bangkok_now()),
    )
    return cur.fetchone()


def assert_not_suspended(cur, user: dict, action: str) -> None:
    """เรียกก่อนสร้างออเดอร์/รีวิวของลูกค้า (บทบาทอื่นไม่มีการระงับแบบนี้)"""
    if user.get("RoleCode") != "CUSTOMER":
        return
    row = active_suspension(cur, user["UserId"])
    if row:
        raise DomainError(403, blocked_message(row, action))


def lift(db, cur, row: dict, lift_type: str, now: datetime, by: Optional[int] = None,
         note: Optional[str] = None) -> None:
    """ปลดระงับ 1 แถว (ใน transaction ของผู้เรียก) + แจ้งลูกค้า + AuditLog
    AUTO : LiftedAt = EndAt (เวลาที่หมดจริง ไม่ใช่เวลาที่ job มาเจอ)"""
    lifted_at = row["EndAt"] if lift_type == "AUTO" and row.get("EndAt") else now
    cur.execute(
        "UPDATE UserSuspension SET LiftedAt = %s, LiftedBy = %s, LiftType = %s, LiftNote = %s "
        "WHERE SuspensionId = %s AND LiftedAt IS NULL",
        (lifted_at, by, lift_type, note, row["SuspensionId"]),
    )
    if cur.rowcount != 1:
        raise DomainError(409, "การระงับนี้ถูกปลดไปแล้ว")
    if lift_type == "AUTO":
        title, msg, action = ("ครบกำหนดระงับบัญชีแล้ว", "บัญชีของคุณกลับมาสั่งอาหาร รีวิว และแจ้งปัญหาได้ตามปกติแล้ว",
                              "AUTO_UNBAN_USER")
    elif lift_type == "APPEAL":
        title = "อุทธรณ์ได้รับการอนุมัติ บัญชีถูกปลดระงับแล้ว"
        msg = "บัญชีของคุณกลับมาสั่งอาหาร รีวิว และแจ้งปัญหาได้ตามปกติแล้ว" + (f" ข้อความจากผู้บริหาร: {note}" if note else "")
        action = "USER_APPEAL_APPROVE"
    else:
        title = "บัญชีของคุณถูกปลดระงับแล้ว"
        msg = "บัญชีของคุณกลับมาสั่งอาหาร รีวิว และแจ้งปัญหาได้ตามปกติแล้ว" + (f" หมายเหตุ: {note}" if note else "")
        action = "UNBAN_USER"
    send_notif(db, row["UserId"], "SYSTEM", title, msg)
    log_audit(db, by, action, "User", row["UserId"], {"suspended": True},
              {"suspended": False, "suspension_id": row["SuspensionId"], "username": row.get("Username"),
               "reason": row.get("Reason"), "note": note, "until": row.get("EndAt")})


def lift_expired(cur, db, user_id: int, now: datetime) -> None:
    """แถวที่หมดเวลาแล้วแต่ job ยังไม่ปลด : ปลดก่อนระงับรอบใหม่ (ไม่ชน uk_susp_open_user)"""
    cur.execute(
        "SELECT s.SuspensionId, s.UserId, s.Reason, s.EndAt, u.Username FROM UserSuspension s "
        "JOIN `User` u ON u.UserId = s.UserId "
        "WHERE s.UserId = %s AND s.LiftedAt IS NULL AND s.EndAt IS NOT NULL AND s.EndAt <= %s FOR UPDATE OF s",
        (user_id, now),
    )
    for row in cur.fetchall():
        lift(db, cur, row, "AUTO", now)
