"""ฟังก์ชันช่วย (pure) : เวลา, ข้อความ, ไฟล์รูป, ศูนย์อาหาร, สัญญา"""
import base64
import binascii
import hashlib
import os
import re
import uuid
from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

import config
from errors import DomainError

_TZ = ZoneInfo(config.TIMEZONE)


def bangkok_now() -> datetime:
    """เวลาปัจจุบัน (naive, เขตเวลาไทย) ให้ตรงกับ session time_zone ของ MySQL"""
    return datetime.now(_TZ).replace(tzinfo=None)


def clean_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


def queue_label(n, code: Optional[str] = "") -> str:
    """เลขคิวที่แสดงให้ลูกค้าเห็น = ตัวอักษรประจำร้าน + เลข 3 หลัก (A001) ; QueueNo ใน DB เป็นตัวเลขล้วน"""
    return f"{code or ''}{int(n):03d}"


def parse_queue_no(value) -> Optional[int]:
    """'A007' / '007' / 7 -> 7 (ตัดตัวอักษรนำหน้าออก) ; อ่านไม่ได้ -> None"""
    digits = str(value or "").strip().lstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#")
    return int(digits) if digits.isdigit() else None


_QUEUE_CODE_RE = re.compile(r"^[A-Z]{1,2}$")


def validate_queue_code(value: str) -> str:
    code = (value or "").strip().upper()
    if not _QUEUE_CODE_RE.match(code):
        raise DomainError(400, "ตัวอักษรคิวต้องเป็นภาษาอังกฤษ A-Z 1-2 ตัว (เช่น A หรือ AB)")
    return code


def next_free_queue_code(used) -> str:
    """ตัวอักษรคิวที่ยังว่างตัวแรก: A..Z แล้ว AA, AB, ..."""
    used = set(used)
    letters = [chr(c) for c in range(ord("A"), ord("Z") + 1)]
    for code in letters + [a + b for a in letters for b in letters]:
        if code not in used:
            return code
    raise DomainError(400, "ตัวอักษรคิวเต็มแล้ว")


# ---------------------------------------------------------------- validation
_USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{4,20}$")


def validate_username(username: str) -> str:
    username = (username or "").strip()
    if not _USERNAME_RE.match(username):
        raise DomainError(400, "ชื่อผู้ใช้ต้องยาว 4–20 ตัว ใช้ได้เฉพาะ a-z, 0-9 และ _")
    return username


def validate_password(password: str) -> str:
    password = password or ""
    if len(password) < config.MIN_PASSWORD_LENGTH:
        raise DomainError(400, f"รหัสผ่านต้องยาวอย่างน้อย {config.MIN_PASSWORD_LENGTH} ตัว")
    if len(password) > 72:  # ขีดจำกัดของ bcrypt
        raise DomainError(400, "รหัสผ่านต้องไม่เกิน 72 ตัวอักษร")
    if any(ch.isspace() for ch in password):
        raise DomainError(400, "รหัสผ่านห้ามมีช่องว่าง")
    return password


_PHONE_RE = re.compile(r"^0\d{8,9}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def validate_phone(phone: Optional[str], required: bool = False) -> Optional[str]:
    """เบอร์ไทย 9–10 หลักขึ้นต้นด้วย 0 (ยอมให้พิมพ์ขีด/ช่องว่างมา) -> เก็บเป็นตัวเลขล้วน ; ว่าง = None"""
    digits = re.sub(r"[\s-]", "", phone or "")
    if not digits:
        if required:
            raise DomainError(400, "กรุณากรอกเบอร์โทรศัพท์")
        return None
    if not _PHONE_RE.match(digits):
        raise DomainError(400, "เบอร์โทรศัพท์ต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0")
    return digits


_DIGITS_RE = re.compile(r"^\d+$")


def validate_payout(kind: Optional[str], bank: Optional[str], account_no: Optional[str],
                    account_name: Optional[str]) -> dict:
    """ข้อมูลรับเงินคืนแบบโอน : PROMPTPAY (เบอร์ 10 หลักขึ้นต้น 0 หรือเลขบัตรประชาชน 13 หลัก) หรือ BANK (ธนาคาร + เลขบัญชี 10–15 หลัก + ชื่อบัญชี)"""
    kind = (kind or "").upper()
    digits = re.sub(r"[\s-]", "", account_no or "")
    name = (account_name or "").strip()
    if kind == "PROMPTPAY":
        if not _DIGITS_RE.match(digits) or not ((len(digits) == 10 and digits.startswith("0")) or len(digits) == 13):
            raise DomainError(400, "พร้อมเพย์ต้องเป็นเบอร์โทร 10 หลัก (ขึ้นต้น 0) หรือเลขบัตรประชาชน 13 หลัก")
        return {"kind": kind, "bank": None, "account_no": digits, "account_name": name[:100] or None}
    if kind == "BANK":
        bank = (bank or "").strip()
        if not bank or len(bank) > 60:
            raise DomainError(400, "กรุณาระบุชื่อธนาคาร")
        if not _DIGITS_RE.match(digits) or not (10 <= len(digits) <= 15):
            raise DomainError(400, "เลขบัญชีต้องเป็นตัวเลข 10–15 หลัก")
        if not name:
            raise DomainError(400, "กรุณาระบุชื่อบัญชี")
        return {"kind": kind, "bank": bank, "account_no": digits, "account_name": name[:100]}
    raise DomainError(400, "กรุณาเลือกพร้อมเพย์หรือบัญชีธนาคาร")


def mask_account(value: Optional[str]) -> Optional[str]:
    """เลขบัญชี/พร้อมเพย์ที่ปิดบางส่วน เหลือ 4 ตัวท้าย"""
    if not value:
        return None
    return "x" * max(len(value) - 4, 0) + value[-4:]


def validate_email(email: Optional[str]) -> Optional[str]:
    """อีเมลไม่บังคับ ; ว่าง = None ; ยาวไม่เกิน 100 (User.Email VARCHAR(100))"""
    email = (email or "").strip()
    if not email:
        return None
    if len(email) > 100 or not _EMAIL_RE.match(email):
        raise DomainError(400, "รูปแบบอีเมลไม่ถูกต้อง")
    return email


_NAME_TITLES = {"คุณ", "นาย", "นาง", "นางสาว", "น.ส.", "ด.ช.", "ด.ญ.", "mr", "mrs", "ms", "miss", "dr"}
_THAI_LEADING_VOWELS = "เแโใไ"


def mask_person_name(name: Optional[str]) -> str:
    """ชื่อคนรีวิวแบบย่อ (ไม่ระบุตัวตน): 'คุณ สมหมาย ใจดี' -> 'สม*** จ.' ; 'ยูฟ่า (ลูกค้า VIP)' -> 'ยู***'
    ตัดคำนำหน้า/ข้อความในวงเล็บ ; นามสกุลเหลือตัวอักษรแรก (ข้ามสระหน้า เ แ โ ใ ไ)"""
    text = re.sub(r"\(.*?\)", " ", name or "")
    parts = [p for p in text.split() if p.lower() not in _NAME_TITLES and p.lower().rstrip(".") not in _NAME_TITLES]
    if not parts:
        return "ลูกค้า"
    first = parts[0]
    masked = (first[:2] if len(first) > 2 else first[:1]) + "***"
    if len(parts) > 1:
        last = parts[-1].lstrip(_THAI_LEADING_VOWELS) or parts[-1]
        masked += f" {last[0]}."
    return masked


def mask_email(email: Optional[str]) -> Optional[str]:
    if email and "@" in email:
        name, domain = email.split("@", 1)
        return f"{name[:1]}***@{domain}"
    return email


def mask_phone(phone: Optional[str]) -> Optional[str]:
    if phone:
        phone = str(phone)
        if len(phone) >= 6:
            return f"{phone[:3]}****{phone[-3:]}"
    return phone


# --------------------------------------------------------------------- images
_DATA_URL_RE = re.compile(r"^data:image/(png|jpeg|jpg|webp|gif);base64,(.+)$", re.DOTALL)
_UPLOAD_PATH_RE = re.compile(r"^/uploads/[a-z]+/[0-9a-f]{32}\.(png|jpg|webp|gif)$")
_MAGIC = {
    "png": (b"\x89PNG\r\n\x1a\n",),
    "jpg": (b"\xff\xd8\xff",),
    "webp": (b"RIFF",),
    "gif": (b"GIF87a", b"GIF89a"),
}


# โฟลเดอร์รูปที่เปิดสาธารณะที่ /uploads/<folder>/ ; โฟลเดอร์อื่น (slips, refunds) เปิดผ่าน /api/files เท่านั้น
PUBLIC_UPLOAD_FOLDERS = ("products", "stores", "profiles", "reviews")


def save_image(value: Optional[str], folder: str, upload_dir: Optional[str] = None, *,
               new_only: bool = False) -> Optional[str]:
    """รับรูปจาก frontend แล้วคืน path ที่เก็บลง DB (VARCHAR 500)

    - data URL (base64)  -> ตรวจชนิด/ขนาด/magic bytes แล้วเขียนไฟล์ /uploads/<folder>/<uuid>.<ext>
    - path /uploads/<folder>/... -> ส่งกลับเดิม (กรณีแก้ข้อมูลโดยไม่เปลี่ยนรูป) ; ต้องเป็นโฟลเดอร์เดียวกัน
      (กันเอา path สลิป/รูปของคนอื่นมาผูก แล้วไปลบหรือใช้ซ้ำ)
    - URL https://...    -> ส่งกลับเดิมถ้ายาวไม่เกิน 500 (เช่นรูปโปรไฟล์ Google)
    - อย่างอื่น/ว่าง     -> None
    new_only=True (สลิป / QR / หลักฐานการโอน) : รับเฉพาะรูปที่อัปโหลดใหม่ (data URL) เท่านั้น
    """
    if not value:
        return None
    value = value.strip()
    if _UPLOAD_PATH_RE.match(value) or value.startswith("https://"):
        if new_only:
            raise DomainError(400, "กรุณาแนบรูปจากเครื่องใหม่ (ใช้ไฟล์ที่อยู่ในระบบแล้วไม่ได้)")
        if value.startswith(f"/uploads/{folder}/"):
            return value
        if value.startswith("https://") and len(value) <= 500:
            return value
        raise DomainError(400, "รูปภาพไม่ถูกต้อง")
    m = _DATA_URL_RE.match(value)
    if not m:
        return None
    ext = "jpg" if m.group(1) in ("jpeg", "jpg") else m.group(1)
    try:
        raw = base64.b64decode(m.group(2), validate=False)
    except (binascii.Error, ValueError):
        raise DomainError(400, "ไฟล์รูปไม่ถูกต้อง")
    if not raw:
        raise DomainError(400, "ไฟล์รูปไม่ถูกต้อง")
    if len(raw) > config.MAX_IMAGE_BYTES:
        raise DomainError(400, f"ไฟล์รูปต้องไม่เกิน {config.MAX_IMAGE_BYTES // (1024 * 1024)} MB")
    if not any(raw.startswith(sig) for sig in _MAGIC[ext]):
        raise DomainError(400, "ชนิดไฟล์รูปไม่ตรงกับเนื้อหา")
    if not re.fullmatch(r"[a-z]+", folder):
        raise ValueError("invalid folder")
    base = upload_dir or config.UPLOAD_DIR
    target_dir = os.path.join(base, folder)
    os.makedirs(target_dir, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{ext}"
    with open(os.path.join(target_dir, name), "wb") as fh:
        fh.write(raw)
    return f"/uploads/{folder}/{name}"


def image_digest(value: Optional[str]) -> Optional[str]:
    """sha256 ของเนื้อรูปจาก data URL (ใช้ตรวจสลิปซ้ำ) ; ไม่ใช่ data URL = None"""
    m = _DATA_URL_RE.match((value or "").strip())
    if not m:
        return None
    try:
        return hashlib.sha256(base64.b64decode(m.group(2), validate=False)).hexdigest()
    except (binascii.Error, ValueError):
        return None


def delete_upload(path: Optional[str], upload_dir: Optional[str] = None) -> bool:
    """ลบไฟล์ที่ save_image เขียนไว้ (เฉพาะ path รูปแบบ /uploads/<folder>/<uuid>.<ext> เท่านั้น
    URL ภายนอกหรือ path แปลก ๆ ไม่แตะ) ; คืน True ถ้าลบไฟล์ได้จริง"""
    if not path or not _UPLOAD_PATH_RE.match(path):
        return False
    _, _, folder, name = path.split("/")
    try:
        os.remove(os.path.join(upload_dir or config.UPLOAD_DIR, folder, name))
        return True
    except FileNotFoundError:
        return False


# ----------------------------------------------------------------- pickup time
def parse_pickup_time(value: Optional[str], now: Optional[datetime] = None) -> Optional[datetime]:
    """frontend ส่ง '14:30 น.' หรือ 'YYYY-MM-DD HH:MM[:SS]' -> DATETIME (วันนี้ถ้าเป็นเวลาล้วน)"""
    if not value:
        return None
    now = now or bangkok_now()
    text = str(value).replace("น.", "").replace("น", "").strip()
    m = re.fullmatch(r"(\d{1,2}):(\d{2})(?::(\d{2}))?", text)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if h > 23 or mi > 59:
            return None
        return now.replace(hour=h, minute=mi, second=0, microsecond=0)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


# ------------------------------------------------------------------ food court
def time_to_minutes(value) -> int:
    if isinstance(value, timedelta):
        return int(value.total_seconds() // 60)
    if hasattr(value, "hour") and hasattr(value, "minute"):
        return value.hour * 60 + value.minute
    parts = str(value).split(":")
    return int(parts[0]) * 60 + int(parts[1])


def time_to_hhmm(value) -> str:
    m = time_to_minutes(value)
    return f"{m // 60:02d}:{m % 60:02d}"


def next_transition(open_time, close_time, now: Optional[datetime] = None) -> datetime:
    """เวลาเปลี่ยนสถานะอัตโนมัติครั้งถัดไป (ใช้เป็นเวลาหมดอายุของ manual override)"""
    now = now or bangkok_now()
    o, c = time_to_minutes(open_time), time_to_minutes(close_time)
    cur = now.hour * 60 + now.minute
    if cur < o:
        return now.replace(hour=o // 60, minute=o % 60, second=0, microsecond=0)
    if cur < c:
        return now.replace(hour=c // 60, minute=c % 60, second=0, microsecond=0)
    tomorrow = now + timedelta(days=1)
    return tomorrow.replace(hour=o // 60, minute=o % 60, second=0, microsecond=0)


def foodcourt_mode(row: dict, now: Optional[datetime] = None) -> str:
    """AUTO / OPEN / CLOSED  (override ที่หมดอายุแล้ว = AUTO)"""
    now = now or bangkok_now()
    manual = row.get("ManualOverride")
    until = row.get("OverrideUntil")
    if manual is None:
        return "AUTO"
    if until is not None and now >= until:
        return "AUTO"
    return "OPEN" if manual else "CLOSED"


def foodcourt_is_open(row: dict, now: Optional[datetime] = None) -> bool:
    now = now or bangkok_now()
    mode = foodcourt_mode(row, now)
    if mode == "OPEN":
        return True
    if mode == "CLOSED":
        return False
    cur = now.hour * 60 + now.minute
    return time_to_minutes(row["OpenTime"]) <= cur < time_to_minutes(row["CloseTime"])


# -------------------------------------------------------------------- contract
#  กติกา: สัญญามีผลตั้งแต่ 00:00:00 ของวันเริ่ม ถึง 23:59:59 ของวันสิ้นสุด (เวลาไทย)
#  สถานะคำนวณจากวันที่เสมอ (เหมือนสถานะเปิด/ปิดศูนย์อาหาร) ไม่มีคอลัมน์สถานะเก็บใน DB
CONTRACT_NONE = "NONE"          # ยังไม่มีสัญญา  -> ขาย/เปิดร้านไม่ได้ แต่ยังล็อกอินได้
CONTRACT_UPCOMING = "UPCOMING"  # ยังไม่ถึงวันเริ่ม -> ขาย/เปิดร้านไม่ได้ แต่ล็อกอินเตรียมร้านได้
CONTRACT_ACTIVE = "ACTIVE"      # อยู่ในช่วงสัญญา -> ใช้งานได้ปกติ
CONTRACT_EXPIRED = "EXPIRED"    # เลย 23:59:59 ของวันสิ้นสุด -> ขายไม่ได้ บัญชีร้านเข้าได้ตาม store_account_access


def contract_state(start: Optional[date], end: Optional[date], today: Optional[date] = None) -> str:
    if not start or not end:
        return CONTRACT_NONE
    today = today or bangkok_now().date()
    if today > end:
        return CONTRACT_EXPIRED
    if today < start:
        return CONTRACT_UPCOMING
    return CONTRACT_ACTIVE


def contract_active(start: Optional[date], end: Optional[date], today: Optional[date] = None) -> bool:
    """ขาย/เปิดร้านได้เฉพาะช่วงสัญญา ; ไม่มีสัญญา = ไม่ได้"""
    return contract_state(start, end, today) == CONTRACT_ACTIVE


ACCESS_FULL, ACCESS_CLEARING, ACCESS_READ_ONLY, ACCESS_LOCKED = "FULL", "CLEARING", "READ_ONLY", "LOCKED"


def store_account_access(end: Optional[date], role: str, has_open_orders: bool, owner_readonly_days: int,
                         today: Optional[date] = None) -> str:
    """สิทธิ์ของบัญชีที่ผูกร้าน (เจ้าของ/หน้าร้าน/ครัว) เทียบกับวันสิ้นสุดสัญญา

    - สัญญายังไม่หมด                       -> FULL
    - หมดแล้ว + ร้านยังมีออเดอร์ค้าง        -> CLEARING  ทุกบัญชีของร้านทำได้เฉพาะงานเคลียร์ออเดอร์ (auth.py)
                                               ไม่จำกัดวัน เพราะหลังหมดสัญญาไม่มีออเดอร์ใหม่เข้ามาได้อีก
    - เคลียร์ครบแล้ว : เจ้าของร้าน ภายใน N วัน -> READ_ONLY (ดูยอดขาย/ประวัติได้ แก้อะไรไม่ได้)
    - นอกนั้น                               -> LOCKED    (token เดิมใช้ไม่ได้ทันที = เด้งออกจากระบบ)
    """
    today = today or bangkok_now().date()
    if end is None or today <= end:
        return ACCESS_FULL
    if has_open_orders:
        return ACCESS_CLEARING
    if role == "STORE_OWNER" and (today - end).days <= owner_readonly_days:
        return ACCESS_READ_ONLY
    return ACCESS_LOCKED


def add_years_minus_one_day(start: date, years: int = 1) -> date:
    """วันสิ้นสุดของสัญญา N ปี : 2026-10-15 + 1 ปี -> 2027-10-14 (29 ก.พ. -> 28 ก.พ.)"""
    try:
        same_day = start.replace(year=start.year + years)
    except ValueError:  # 29 ก.พ. ในปีที่ไม่มี
        same_day = start.replace(year=start.year + years, day=28) + timedelta(days=1)
    return same_day - timedelta(days=1)


def clean_reason(value: Optional[str]) -> str:
    """เหตุผลการแก้สัญญา: บังคับกรอก 5–255 ตัวอักษร (เก็บลง AuditLog เป็นหลักฐาน)"""
    reason = " ".join((value or "").split())
    if len(reason) < 5:
        raise DomainError(400, "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร (เช่น เลขที่หนังสือ/รอบประมูล)")
    if len(reason) > 255:
        raise DomainError(400, "เหตุผลต้องไม่เกิน 255 ตัวอักษร")
    return reason


def parse_date(value: Optional[str], label: str = "วันที่") -> Optional[date]:
    """วันที่ YYYY-MM-DD ปี ค.ศ. เท่านั้น (ระบบเก็บและแสดงวันที่สัญญาเป็น ค.ศ.)"""
    if not value:
        return None
    try:
        parsed = datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        raise DomainError(400, f"รูปแบบ{label}ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)")
    if parsed.year > 2400:
        # เช่นพิมพ์ 2569 ลงช่องวันที่ (ช่องนี้เป็นปี ค.ศ.) -> สัญญาจะยาวไปอีก 543 ปี
        raise DomainError(400, f"{label}: กรุณาระบุปีเป็น ค.ศ. (เช่น {parsed.year - 543} แทน {parsed.year})")
    return parsed
