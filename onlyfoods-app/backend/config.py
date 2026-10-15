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
NO_SHOW_AFTER_MINUTES = 15


def require_secrets() -> None:
    """เรียกตอนสตาร์ท: ไม่มี JWT_SECRET ที่แข็งแรงพอ = ไม่ยอมเปิด server"""
    if len(JWT_SECRET) < 32:
        raise RuntimeError(
            "JWT_SECRET ต้องตั้งค่าใน environment และยาวอย่างน้อย 32 ตัวอักษร "
            "(สร้างด้วย: python -c \"import secrets; print(secrets.token_urlsafe(48))\")"
        )
