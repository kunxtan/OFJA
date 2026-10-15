"""รหัสผ่าน (bcrypt), JWT, และ dependency ตรวจสิทธิ์"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import config
from db import get_db
from errors import DomainError

logger = logging.getLogger("onlyfood")
_bearer = HTTPBearer(auto_error=False)


# หมดสัญญาบัญชีที่ผูกร้าน (เจ้าของ/หน้าร้าน/ครัว) ใช้งานไม่ได้เมื่อเลย 23:59:59 ของวันสิ้นสุดสัญญา
# ยกเว้น "ช่วงผ่อนผัน" : ถ้ายังมีออเดอร์ค้าง เข้าได้ต่อเพื่อเคลียร์ออเดอร์ ถึง 23:59:59 ของวันถัดไป (สูงสุด 1 วัน)

STORE_CONTRACT_EXPIRED_SQL = """(
    u.StoreId IS NOT NULL AND c.EndDate IS NOT NULL AND c.EndDate < CURDATE()
    AND (
        c.EndDate < DATE_SUB(CURDATE(), INTERVAL 1 DAY)
        OR NOT EXISTS (SELECT 1 FROM `Order` ox JOIN OrderStatus osx ON osx.StatusId = ox.StatusId
                       WHERE ox.StoreId = u.StoreId AND osx.IsTerminal = FALSE)
    )
)"""
CONTRACT_EXPIRED_MESSAGE = "สัญญาร้านค้าหมดอายุแล้ว บัญชีของร้านนี้ใช้งานไม่ได้ กรุณาติดต่อผู้บริหารศูนย์อาหาร"

_dummy_hash: Optional[str] = None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password: str, password_hash: Optional[str]) -> bool:
    global _dummy_hash
    if not password_hash:
        # ใช้เวลาเท่ากับกรณีรหัสผิด กันเดา username จากเวลาตอบ
        if _dummy_hash is None:
            _dummy_hash = hash_password("dummy-password")
        bcrypt.checkpw(password.encode("utf-8")[:72], _dummy_hash.encode("ascii"))
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode("ascii"))
    except ValueError:
        return False


def create_token(user_id: int) -> str:
    # ต้องเป็นเวลา UTC แบบมี tzinfo : ถ้าส่ง datetime ไม่มี tzinfo (เวลาไทย) PyJWT จะอ่านเป็น UTC
    # แล้ว iat จะล้ำอนาคต 7 ชม. ทำให้ token ใหม่ถูกปฏิเสธเป็น 401
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(hours=config.JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


def _unauthorized(detail: str = "กรุณาเข้าสู่ระบบ") -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db=Depends(get_db),
) -> dict:
    """ถอด JWT แล้วอ่านบทบาท/สถานะบัญชีจาก DB ใหม่ทุก request
    (ถูกระงับ/ลบ/เปลี่ยนบทบาทแล้ว token เก่าใช้ไม่ได้ทันที)"""
    if creds is None or creds.scheme.lower() != "bearer":
        raise _unauthorized()
    try:
        payload = jwt.decode(creds.credentials, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise _unauthorized("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่")
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise _unauthorized("โทเคนไม่ถูกต้อง")

    with db.cursor() as cur:
        cur.execute(
            """
                        SELECT u.UserId, u.Username, u.FullName, u.StoreId, u.IsActive,
                   r.RoleCode, COALESCE(s.IsDeleted, 0) AS StoreIsDeleted,
                   """ + STORE_CONTRACT_EXPIRED_SQL + """ AS StoreContractExpired
            FROM `User` u
            JOIN Role r ON r.RoleId = u.RoleId
            LEFT JOIN Store s ON s.StoreId = u.StoreId
            LEFT JOIN StoreContract c ON c.StoreId = u.StoreId
            WHERE u.UserId = %s
            """,
            (user_id,),
        )
        user = cur.fetchone()
    if not user or not user["IsActive"] or user["StoreIsDeleted"]:
        raise _unauthorized("บัญชีนี้ใช้งานไม่ได้")
    if user["StoreContractExpired"]:
        # หมดสัญญา = token ที่ล็อกอินค้างไว้ใช้ไม่ได้ทันทีตั้งแต่ 00:00 ของวันถัดจากวันสิ้นสุด
        raise _unauthorized(CONTRACT_EXPIRED_MESSAGE)
    return user


def require_role(*role_codes: str):
    """dependency: ผ่านเฉพาะบทบาทที่ระบุ"""
    allowed = set(role_codes)

    def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["RoleCode"] not in allowed:
            raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์ใช้งานส่วนนี้")
        return user

    return checker


STORE_SCOPED = {"STORE_OWNER", "FRONT_STAFF", "KITCHEN_STAFF"}


def assert_store_access(user: dict, store_id: int) -> None:
    """พนักงาน/เจ้าของร้านแตะได้เฉพาะร้านตัวเอง ; EXECUTIVE ผ่านเสมอ"""
    if user["RoleCode"] == "EXECUTIVE":
        return
    if user["RoleCode"] in STORE_SCOPED and user["StoreId"] is not None and int(user["StoreId"]) == int(store_id):
        return
    raise DomainError(403, "ไม่มีสิทธิ์เข้าถึงข้อมูลของร้านอื่น")