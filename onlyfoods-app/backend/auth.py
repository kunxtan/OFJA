"""รหัสผ่าน (bcrypt), JWT, และ dependency ตรวจสิทธิ์"""
import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import config
from db import get_db
from errors import DomainError
from utils import ACCESS_CLEARING, ACCESS_FULL, ACCESS_LOCKED, ACCESS_READ_ONLY, store_account_access

logger = logging.getLogger("onlyfood")
_bearer = HTTPBearer(auto_error=False)

# สัญญาร้าน : ใช้ทั้งตอน login และทุก request (ต้อง LEFT JOIN StoreContract c ON c.StoreId = u.StoreId)
STORE_CONTRACT_COLUMNS = """c.EndDate AS ContractEndDate,
                   (u.StoreId IS NOT NULL AND c.EndDate < CURDATE() AND (EXISTS (
                       SELECT 1 FROM `Order` ox JOIN OrderStatus osx ON osx.StatusId = ox.StatusId
                       WHERE ox.StoreId = u.StoreId AND osx.IsTerminal = FALSE) OR EXISTS (
                       SELECT 1 FROM Refund rfx JOIN Payment px ON px.PaymentId = rfx.PaymentId
                       JOIN `Order` ox ON ox.OrderId = px.OrderId
                       WHERE ox.StoreId = u.StoreId AND rfx.RefundStatus = 'PENDING'))) AS StoreHasOpenOrders"""
CONTRACT_EXPIRED_MESSAGE = "สัญญาร้านค้าหมดอายุแล้ว บัญชีของร้านนี้ใช้งานไม่ได้ กรุณาติดต่อผู้บริหารศูนย์อาหาร"
CONTRACT_READ_ONLY_MESSAGE = "สัญญาร้านหมดแล้ว ดูข้อมูลได้อย่างเดียว แก้ไขหรือเปิดร้านไม่ได้"
CONTRACT_CLEARING_MESSAGE = (
    "สัญญาร้านหมดอายุแล้ว ตอนนี้ทำได้เฉพาะเคลียร์ออเดอร์ที่ค้างอยู่ "
    "(เปิดร้าน/รับออเดอร์ใหม่/แก้ข้อมูลร้านไม่ได้)"
)
_SAFE_METHODS = ("GET", "HEAD", "OPTIONS")

# ช่วงเคลียร์ออเดอร์ (CLEARING): นอกจากอ่านข้อมูล ยิงได้เฉพาะ path งานออเดอร์/คืนเงินลูกค้าเหล่านี้
# (งานค้าง = ออเดอร์ที่ยังไม่จบ หรือเงินคืนที่ยังไม่ได้คืน)
_CLEARING_WRITE_PATHS = re.compile(
    r"^/api/(orders/\d+/(status|cancel-request|verify-slip|print)"
    r"|print-jobs/\d+/skip"
    r"|refunds/\d+/done"
    r"|products/\d+/(toggle-stock|notify-out-of-stock))$"
)

def contract_access(row: dict) -> str:
    """FULL / CLEARING / READ_ONLY / LOCKED ของบัญชีนี้ (บัญชีที่ไม่ผูกร้าน = FULL เสมอ)"""
    if row.get("StoreId") is None:
        return ACCESS_FULL
    return store_account_access(row.get("ContractEndDate"), row["RoleCode"], bool(row.get("StoreHasOpenOrders")),
                                config.CONTRACT_OWNER_READONLY_DAYS)


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


def password_version(password_hash: Optional[str]) -> str:
    """ลายนิ้วมือสั้น ๆ ของรหัสผ่านปัจจุบัน ใส่ไว้ใน token : เปลี่ยน/รีเซ็ตรหัสแล้ว token เก่าใช้ไม่ได้ทันที"""
    return hashlib.sha256((password_hash or "").encode("utf-8")).hexdigest()[:12]


def create_token(user_id: int, password_hash: Optional[str] = None) -> str:
    # ต้องเป็นเวลา UTC แบบมี tzinfo : ถ้าส่ง datetime ไม่มี tzinfo (เวลาไทย) PyJWT จะอ่านเป็น UTC
    # แล้ว iat จะล้ำอนาคต 7 ชม. ทำให้ token ใหม่ถูกปฏิเสธเป็น 401
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "pwv": password_version(password_hash),
        "iat": now,
        "exp": now + timedelta(hours=config.JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


def _unauthorized(detail: str = "กรุณาเข้าสู่ระบบ") -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def get_current_user(
    request: Request,
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
        token_pwv = payload.get("pwv")
    except jwt.ExpiredSignatureError:
        raise _unauthorized("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่")
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise _unauthorized("โทเคนไม่ถูกต้อง")

    with db.cursor() as cur:
        cur.execute(
            """
            SELECT u.UserId, u.Username, u.FullName, u.StoreId, u.IsActive, u.PasswordHash,
                                      r.RoleCode, COALESCE(s.IsDeleted, 0) AS StoreIsDeleted,
                   """ + STORE_CONTRACT_COLUMNS + """
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
    # token ที่ออกก่อนเปลี่ยน/รีเซ็ตรหัสผ่าน (token รุ่นเก่าที่ไม่มี pwv ยอมให้ใช้จนหมดอายุ 12 ชม.)
    if token_pwv is not None and token_pwv != password_version(user.pop("PasswordHash", None)):
        raise _unauthorized("รหัสผ่านถูกเปลี่ยนแล้ว กรุณาเข้าสู่ระบบใหม่")
    user.pop("PasswordHash", None)
    access = contract_access(user)
    if access == ACCESS_LOCKED:
                # หมดสัญญา (และเคลียร์ออเดอร์ครบแล้ว) = token ที่ล็อกอินค้างไว้ใช้ไม่ได้ทันที -> frontend เด้งไปหน้า login
        raise _unauthorized(CONTRACT_EXPIRED_MESSAGE)
    if request.method not in _SAFE_METHODS:
        if access == ACCESS_READ_ONLY:
            raise HTTPException(status_code=403, detail=CONTRACT_READ_ONLY_MESSAGE)
        if access == ACCESS_CLEARING and not _CLEARING_WRITE_PATHS.match(request.url.path):
            raise HTTPException(status_code=403, detail=CONTRACT_CLEARING_MESSAGE)
    return user


def get_optional_user(request: Request, creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
                      db=Depends(get_db)) -> Optional[dict]:
    """endpoint สาธารณะที่แสดงข้อมูลเพิ่มให้คนที่ล็อกอินแล้ว : ไม่มี token/ token ใช้ไม่ได้ = None (ไม่ error)"""
    if creds is None:
        return None
    try:
        return get_current_user(request, creds, db)
    except HTTPException:
        return None


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