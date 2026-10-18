"""Login / สมัครสมาชิก / Google / เปลี่ยนรหัสผ่าน"""
import logging
import re
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException

import config
from auth import (CONTRACT_EXPIRED_MESSAGE, STORE_CONTRACT_COLUMNS, contract_access, create_token,
                  get_current_user, hash_password, verify_password)
from db import get_db, transaction
from errors import DomainError
from schemas import ChangePasswordSchema, GoogleAuthSchema, LoginSchema, RegisterSchema
from services import is_duplicate_key, log_audit
from shapes import USER_SELECT, shape_user
from utils import (ACCESS_LOCKED, bangkok_now, validate_email, validate_password, validate_phone,
                   validate_username)

logger = logging.getLogger("onlyfood")
router = APIRouter(prefix="/api", tags=["auth"])


def _load_user(cur, user_id: int) -> dict:
    cur.execute(USER_SELECT + " WHERE u.UserId = %s", (user_id,))
    return shape_user(cur.fetchone())


@router.post("/login")
def login(data: LoginSchema, db=Depends(get_db)):
    now = bangkok_now()
    username = data.username.strip()
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT u.UserId, u.PasswordHash, u.IsActive, u.FailedLoginCount, u.LockedUntil, u.StoreId,
            r.RoleCode, COALESCE(s.IsDeleted, 0) AS StoreIsDeleted,
            """ + STORE_CONTRACT_COLUMNS + """
            FROM `User` u JOIN Role r ON r.RoleId = u.RoleId
            LEFT JOIN Store s ON s.StoreId = u.StoreId
            LEFT JOIN StoreContract c ON c.StoreId = u.StoreId
            WHERE u.Username = %s
            """,
            (username,),
        )
        row = cur.fetchone()

    if row and row["LockedUntil"] and row["LockedUntil"] > now:
        minutes = int((row["LockedUntil"] - now).total_seconds() // 60) + 1
        raise HTTPException(status_code=423, detail=f"บัญชีถูกล็อกชั่วคราวจากการใส่รหัสผ่านผิดหลายครั้ง กรุณาลองใหม่ใน {minutes} นาที")

    if not verify_password(data.password, row["PasswordHash"] if row else None):
        # บันทึกความพยายามที่ล้มเหลว (commit ก่อนแล้วค่อยตอบ 401)
        with transaction(db):
            if row:
                count = int(row["FailedLoginCount"]) + 1
                locked = count >= config.MAX_FAILED_LOGINS
                with db.cursor() as cur:
                    # ลำดับ SET สำคัญ: LockedUntil ต้องอ่านค่านับก่อนถูกรีเซ็ต
                    cur.execute(
                        """
                        UPDATE `User`
                        SET LockedUntil = IF(FailedLoginCount + 1 >= %s, %s, LockedUntil),
                            FailedLoginCount = IF(FailedLoginCount + 1 >= %s, 0, FailedLoginCount + 1)
                        WHERE UserId = %s
                        """,
                        (config.MAX_FAILED_LOGINS, now + timedelta(minutes=config.LOCK_MINUTES),
                         config.MAX_FAILED_LOGINS, row["UserId"]),
                    )
                log_audit(db, row["UserId"], "ACCOUNT_LOCKED" if locked else "LOGIN_FAIL", "AUTH",
                          row["UserId"], None, {"failed_count": count})
            else:
                log_audit(db, None, "LOGIN_FAIL", "AUTH", username[:50], None, {"reason": "unknown_username"})
        raise HTTPException(status_code=401, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")

    if not row["IsActive"]:
        raise HTTPException(status_code=403, detail="บัญชีนี้ถูกปิดใช้งาน")
    if row["StoreIsDeleted"]:
        raise HTTPException(status_code=403, detail="ร้านค้านี้ถูกลบแล้ว ไม่สามารถเข้าสู่ระบบได้")
    if contract_access(row) == ACCESS_LOCKED:
        raise HTTPException(status_code=403, detail=CONTRACT_EXPIRED_MESSAGE)
    
    with transaction(db):
        if row["FailedLoginCount"] or row["LockedUntil"]:
            with db.cursor() as cur:
                cur.execute("UPDATE `User` SET FailedLoginCount = 0, LockedUntil = NULL WHERE UserId = %s", (row["UserId"],))
        log_audit(db, row["UserId"], "LOGIN", "AUTH", row["UserId"], None, {"method": "password"})
    with db.cursor() as cur:
        user = _load_user(cur, row["UserId"])
        user["access_token"] = _token_for(cur, row["UserId"])
    user["token_type"] = "bearer"
    return user


@router.post("/register")
def register(data: RegisterSchema, db=Depends(get_db)):
    username = validate_username(data.username)
    validate_password(data.password)
    name = data.name.strip()
    if not name:
        raise DomainError(400, "กรุณากรอกชื่อ-นามสกุล")
    phone = validate_phone(data.phone, required=True)
    email = validate_email(data.email)
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT UserId FROM `User` WHERE Username = %s", (username,))
            if cur.fetchone():
                raise DomainError(400, "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว")
            try:
                cur.execute(
                    """
                    INSERT INTO `User` (Username, PasswordHash, FullName, Phone, Email, RoleId)
                    VALUES (%s, %s, %s, %s, %s, (SELECT RoleId FROM Role WHERE RoleCode = 'CUSTOMER'))
                    """,
                    (username, hash_password(data.password), name, phone, email),
                )
            except Exception as exc:  # noqa: BLE001
                if is_duplicate_key(exc):
                    raise DomainError(400, "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว")
                raise
            user_id = cur.lastrowid
    with db.cursor() as cur:
        user = _load_user(cur, user_id)
        user["access_token"] = _token_for(cur, user_id)
    user["token_type"] = "bearer"
    return user


@router.post("/logout")
def logout():
    # JWT เป็น stateless: frontend ลบ token เอง (token หมดอายุตาม JWT_EXPIRE_HOURS)
    return {"success": True, "message": "ออกจากระบบเรียบร้อยแล้ว"}


@router.post("/reset-password")
def reset_password_disabled():
    """endpoint เดิมให้ใครก็ได้รีเซ็ตรหัสผ่านของใครก็ได้ด้วยแค่ username/เบอร์/อีเมล -> ปิดถาวร"""
    raise HTTPException(
        status_code=410,
        detail="ไม่รองรับการรีเซ็ตรหัสผ่านด้วยตนเอง กรุณาติดต่อผู้ดูแลระบบ (ผู้บริหาร) เพื่อรีเซ็ตรหัสผ่านให้",
    )


@router.post("/users/change-password")
def change_password(data: ChangePasswordSchema, user=Depends(get_current_user), db=Depends(get_db)):
    validate_password(data.new_password)
    if data.old_password == data.new_password:
        raise DomainError(400, "รหัสผ่านใหม่ต้องไม่ซ้ำรหัสผ่านเดิม")
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT PasswordHash FROM `User` WHERE UserId = %s FOR UPDATE", (user["UserId"],))
            row = cur.fetchone()
            if not verify_password(data.old_password, row["PasswordHash"]):
                raise DomainError(400, "รหัสผ่านเดิมไม่ถูกต้อง")
            new_hash = hash_password(data.new_password)
            cur.execute("UPDATE `User` SET PasswordHash = %s WHERE UserId = %s", (new_hash, user["UserId"]))
        log_audit(db, user["UserId"], "PASSWORD_CHANGE", "User", user["UserId"])
    # token เดิมทุกเครื่องใช้ไม่ได้แล้ว : ส่ง token ใหม่ให้เครื่องที่เปลี่ยนรหัสใช้ต่อ
    return {"success": True, "message": "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว", "access_token": create_token(user["UserId"], new_hash)}


def _token_for(cur, user_id: int) -> str:
    cur.execute("SELECT PasswordHash FROM `User` WHERE UserId = %s", (user_id,))
    row = cur.fetchone() or {}
    return create_token(user_id, row.get("PasswordHash"))


def _unique_username(cur, email: str) -> str:
    base = re.sub(r"[^A-Za-z0-9_]", "", email.split("@")[0])[:16] or "user"
    base = base.ljust(4, "0")
    candidate, n = base, 0
    while True:
        cur.execute("SELECT 1 FROM `User` WHERE Username = %s", (candidate,))
        if not cur.fetchone():
            return candidate
        n += 1
        candidate = f"{base[:16]}{n}"


@router.post("/auth/google")
def google_auth(data: GoogleAuthSchema, db=Depends(get_db)):
    """ตรวจ id_token กับ Google ฝั่ง server (ห้ามเชื่อ google_id/email ที่ client ส่งมาเอง)"""
    if not config.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า Google Login บนเซิร์ฟเวอร์ (GOOGLE_CLIENT_ID)")
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token

        claims = google_id_token.verify_oauth2_token(data.id_token, google_requests.Request(), config.GOOGLE_CLIENT_ID)
    except ValueError:
        raise HTTPException(status_code=401, detail="Google token ไม่ถูกต้องหรือหมดอายุ")
    if not claims.get("email") or not claims.get("email_verified"):
        raise HTTPException(status_code=401, detail="อีเมล Google ยังไม่ได้รับการยืนยัน")

    google_id, email = claims["sub"], claims["email"]
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT u.UserId, u.IsActive, r.RoleCode FROM `User` u JOIN Role r ON r.RoleId = u.RoleId
                WHERE u.GoogleId = %s FOR UPDATE
                """,
                (google_id,),
            )
            row = cur.fetchone()
            if not row:
                # ผูกกับบัญชีลูกค้าเดิมที่ใช้อีเมลเดียวกัน (เฉพาะ CUSTOMER เท่านั้น ไม่ผูกกับบัญชีพนักงาน)
                cur.execute(
                    """
                    SELECT u.UserId, u.IsActive, r.RoleCode FROM `User` u JOIN Role r ON r.RoleId = u.RoleId
                    WHERE u.Email = %s AND r.RoleCode = 'CUSTOMER' AND u.GoogleId IS NULL FOR UPDATE
                    """,
                    (email,),
                )
                row = cur.fetchone()
                if row:
                    cur.execute("UPDATE `User` SET GoogleId = %s WHERE UserId = %s", (google_id, row["UserId"]))
            if not row:
                picture = claims.get("picture")
                cur.execute(
                    """
                    INSERT INTO `User` (Username, GoogleId, Email, FullName, ProfileImageUrl, RoleId)
                    VALUES (%s, %s, %s, %s, %s, (SELECT RoleId FROM Role WHERE RoleCode = 'CUSTOMER'))
                    """,
                    (_unique_username(cur, email), google_id, email,
                     (claims.get("name") or email.split("@")[0])[:100],
                     picture if picture and len(picture) <= 500 else None),
                )
                user_id = cur.lastrowid
            else:
                if not row["IsActive"]:
                    raise DomainError(403, "บัญชีนี้ถูกปิดใช้งาน")
                user_id = row["UserId"]
        log_audit(db, user_id, "LOGIN", "AUTH", user_id, None, {"method": "google"})
    with db.cursor() as cur:
        user = _load_user(cur, user_id)
        token = _token_for(cur, user_id)
    return {
        "user": user,
        "is_profile_incomplete": not bool(user.get("Phone")),
        "access_token": token,
        "token_type": "bearer",
    }
