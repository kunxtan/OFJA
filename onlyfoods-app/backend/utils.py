"""ฟังก์ชันช่วย (pure) : เวลา, ข้อความ, ไฟล์รูป, ศูนย์อาหาร, สัญญา"""
import base64
import binascii
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


def queue_label(n) -> str:
    return f"{int(n):03d}"


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


def validate_email(email: Optional[str]) -> Optional[str]:
    """อีเมลไม่บังคับ ; ว่าง = None ; ยาวไม่เกิน 100 (User.Email VARCHAR(100))"""
    email = (email or "").strip()
    if not email:
        return None
    if len(email) > 100 or not _EMAIL_RE.match(email):
        raise DomainError(400, "รูปแบบอีเมลไม่ถูกต้อง")
    return email


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


def save_image(value: Optional[str], folder: str, upload_dir: Optional[str] = None) -> Optional[str]:
    """รับรูปจาก frontend แล้วคืน path ที่เก็บลง DB (VARCHAR 500)

    - data URL (base64)  -> ตรวจชนิด/ขนาด/magic bytes แล้วเขียนไฟล์ /uploads/<folder>/<uuid>.<ext>
    - path /uploads/...  -> ส่งกลับเดิม (กรณีแก้ข้อมูลโดยไม่เปลี่ยนรูป)
    - URL https://...    -> ส่งกลับเดิมถ้ายาวไม่เกิน 500 (เช่นรูปโปรไฟล์ Google)
    - อย่างอื่น/ว่าง     -> None
    """
    if not value:
        return None
    value = value.strip()
    if _UPLOAD_PATH_RE.match(value):
        return value
    if value.startswith("https://") and len(value) <= 500:
        return value
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
def contract_active(start: Optional[date], end: Optional[date], status: Optional[str] = None,
                    today: Optional[date] = None) -> bool:
    """ไม่มีสัญญา = ใช้ได้ (พฤติกรรมเดิม) ; ก่อนวันเริ่ม/หลังวันสิ้นสุด/TERMINATED = ใช้ไม่ได้"""
    today = today or bangkok_now().date()
    if status == "TERMINATED":
        return False
    if start and today < start:
        return False
    if end and today > end:
        return False
    return True


def contract_status_for(end: date, today: Optional[date] = None) -> str:
    today = today or bangkok_now().date()
    if end < today:
        return "EXPIRED"
    if (end - today).days <= 7:
        return "EXPIRING"
    return "ACTIVE"


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
