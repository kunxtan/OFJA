"""ค่าตั้งค่าทั้งหมดอ่านจาก environment variable (ดู .env.example)"""
import os


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = _int("DB_PORT", 3306)
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "onlyfood")
DB_POOL_SIZE = _int("DB_POOL_SIZE", 10)

JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = _int("JWT_EXPIRE_HOURS", 12)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

# origin ของ frontend ที่อนุญาตให้เรียก API (คั่นด้วย ,)
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/app/uploads")
MAX_IMAGE_BYTES = _int("MAX_IMAGE_BYTES", 5 * 1024 * 1024)

TIMEZONE = os.getenv("TZ", "Asia/Bangkok")

MIN_PASSWORD_LENGTH = 8
MAX_FAILED_LOGINS = 5
LOCK_MINUTES = 15

# อาหารพร้อมรับ (READY) แล้วลูกค้ายังไม่มา:
#  - ครบ PICKUP_REMINDER_MINUTES : ระบบเตือนลูกค้าอัตโนมัติ 1 ครั้ง + หน้าร้านขึ้นป้ายให้โทรหาลูกค้า
#  - ครบ NO_SHOW_AFTER_MINUTES   : ปลดล็อกปุ่ม "ลูกค้าไม่มารับ" (พนักงานกดเอง ไม่ตัดอัตโนมัติ)
PICKUP_REMINDER_MINUTES = _int("PICKUP_REMINDER_MINUTES", 15)
NO_SHOW_AFTER_MINUTES = _int("NO_SHOW_AFTER_MINUTES", 30)
# ไม่เตือนออเดอร์ READY ที่ค้างนานกว่านี้ (กันส่งรัวตอน deploy) / ความถี่ในการเช็ค
PICKUP_REMINDER_MAX_AGE_HOURS = _int("PICKUP_REMINDER_MAX_AGE_HOURS", 3)
REMINDER_LOOP_SECONDS = _int("REMINDER_LOOP_SECONDS", 30)
# ลูกค้าแจ้งร้านว่าจะมารับช้า: เลือกได้เฉพาะค่าเหล่านี้ (นาที) และแจ้งได้ไม่เกิน MAX_PICKUP_ETA_UPDATES ครั้ง
# (ยึดครั้งล่าสุด) ; ระหว่างนั้นปุ่ม "ลูกค้าไม่มารับ" กดไม่ได้จนเลยเวลาที่ลูกค้าแจ้ง และระบบไม่ส่งเตือน 15 นาที
PICKUP_ETA_CHOICES = (15, 30, 60, 120)
MAX_PICKUP_ETA_UPDATES = 3


def require_secrets() -> None:
    """เรียกตอนสตาร์ท: ไม่มี JWT_SECRET ที่แข็งแรงพอ = ไม่ยอมเปิด server"""
    if len(JWT_SECRET) < 32:
        raise RuntimeError(
            "JWT_SECRET ต้องตั้งค่าใน environment และยาวอย่างน้อย 32 ตัวอักษร "
            "(สร้างด้วย: python -c \"import secrets; print(secrets.token_urlsafe(48))\")"
        )
