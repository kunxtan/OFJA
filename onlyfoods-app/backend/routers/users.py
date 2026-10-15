"""โปรไฟล์ผู้ใช้, ค้นหาลูกค้า, บัญชีพนักงานร้าน / บัญชีร้านค้า"""
import secrets
from typing import Optional

from fastapi import APIRouter, Depends

from auth import assert_store_access, get_current_user, hash_password, require_role
from db import get_db, transaction
from errors import DomainError
from schemas import (AccountCreateSchema, AccountUpdateSchema, AdminResetPasswordSchema,
                     CompleteProfileSchema, StaffActiveSchema, StaffCreateSchema, StaffEraseSchema,
                     StaffUpdateSchema, UpdateProfileSchema)
from services import is_duplicate_key, log_audit
from shapes import USER_SELECT, shape_user
from state import STORE_ROLES, legacy_role, role_code_from_input
from utils import (bangkok_now, delete_upload, mask_email, mask_phone, save_image, validate_email,
                   validate_password, validate_phone, validate_username)

router = APIRouter(prefix="/api", tags=["users"])

STAFF_ROLES = ("FRONT_STAFF", "KITCHEN_STAFF")


def _get_user_row(cur, user_id: int) -> dict:
    cur.execute(USER_SELECT + " WHERE u.UserId = %s", (user_id,))
    row = cur.fetchone()
    if not row:
        raise DomainError(404, "ไม่พบข้อมูลผู้ใช้นี้")
    return shape_user(row)


# ------------------------------------------------------------------- profile
@router.put("/users/profile")
def update_profile(data: UpdateProfileSchema, user=Depends(get_current_user), db=Depends(get_db)):
    name = (data.full_name or data.fullName or data.name or "").strip()
    phone = (data.phone or "").strip()
    img_in = data.profile_img if data.profile_img is not None else data.profileImg
    if not name or not phone:
        raise DomainError(400, "กรุณากรอกชื่อ-นามสกุลและเบอร์โทรศัพท์ให้ครบถ้วน")
    img = save_image(img_in, "profiles") if img_in else None
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                "UPDATE `User` SET FullName = %s, Phone = %s, ProfileImageUrl = COALESCE(%s, ProfileImageUrl) WHERE UserId = %s",
                (name[:100], phone[:20], img, user["UserId"]),
            )
    with db.cursor() as cur:
        return _get_user_row(cur, user["UserId"])


@router.put("/users/complete-profile")
def complete_profile(data: CompleteProfileSchema, user=Depends(get_current_user), db=Depends(get_db)):
    img = save_image(data.profile_img, "profiles") if data.profile_img else None
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                "UPDATE `User` SET FullName = %s, Phone = %s, ProfileImageUrl = COALESCE(%s, ProfileImageUrl) WHERE UserId = %s",
                (data.full_name.strip()[:100], data.phone.strip()[:20], img, user["UserId"]),
            )
    with db.cursor() as cur:
        return _get_user_row(cur, user["UserId"])


@router.get("/users/{user_id}")
def get_user_profile(user_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    if user["UserId"] != user_id and user["RoleCode"] != "EXECUTIVE":
        raise DomainError(403, "ไม่มีสิทธิ์ดูข้อมูลผู้ใช้นี้")
    with db.cursor() as cur:
        return _get_user_row(cur, user_id)


@router.get("/customers/{user_id}")
def get_customer_profile(
    user_id: int,
    user=Depends(require_role("FRONT_STAFF", "KITCHEN_STAFF", "STORE_OWNER", "EXECUTIVE")),
    db=Depends(get_db),
):
    """ข้อมูลลูกค้าสำหรับหน้าร้าน (ชื่อ/เบอร์/จำนวนออเดอร์ที่จบแล้ว)

    พนักงาน/เจ้าของร้านดูได้เฉพาะลูกค้า (CUSTOMER) ที่เคยสั่งกับร้านตัวเอง และนับออเดอร์เฉพาะร้านตัวเอง ;
    ไม่ผ่านเงื่อนไข = 404 ข้อความเดียวกับไม่พบ (ไล่ UserId เพื่อดูว่ามีบัญชีไหนอยู่บ้างไม่ได้)
    เบอร์โทรไม่ปิดบังเพราะหน้าร้านต้องโทรหาลูกค้า ; อีเมลปิดบังสำหรับฝั่งร้าน
    """
    store_id = None
    if user["RoleCode"] != "EXECUTIVE":
        if user["StoreId"] is None:
            raise DomainError(403, "บัญชีนี้ยังไม่ได้ผูกกับร้านค้า")
        store_id = int(user["StoreId"])
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT u.FullName AS CustomerName, u.Phone, u.Email
            FROM `User` u JOIN Role r ON r.RoleId = u.RoleId
            WHERE u.UserId = %s AND r.RoleCode = 'CUSTOMER'
            """,
            (user_id,),
        )
        row = cur.fetchone()
        if row and store_id is not None:
            cur.execute("SELECT 1 FROM `Order` WHERE CustomerId = %s AND StoreId = %s LIMIT 1", (user_id, store_id))
            if not cur.fetchone():
                row = None
        if not row:
            raise DomainError(404, "ไม่พบข้อมูลลูกค้า")
        sql = """
            SELECT COUNT(*) AS TotalOrders FROM `Order` o JOIN OrderStatus os ON os.StatusId = o.StatusId
            WHERE o.CustomerId = %s AND os.StatusCode IN ('COMPLETED', 'NO_SHOW')
        """
        params = [user_id]
        if store_id is not None:
            sql += " AND o.StoreId = %s"
            params.append(store_id)
        cur.execute(sql, params)
        row["TotalOrders"] = cur.fetchone()["TotalOrders"]
    if store_id is not None:
        row["Email"] = mask_email(row["Email"])
    return row


@router.get("/executive/customers")
def search_customers(search: Optional[str] = None, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    sql = """
        SELECT u.UserId, u.Username, u.FullName, u.Email, u.Phone
        FROM `User` u JOIN Role r ON r.RoleId = u.RoleId WHERE r.RoleCode = 'CUSTOMER'
    """
    params = []
    if search and search.strip():
        kw = search.strip()
        like = f"%{kw}%"
        if kw.isdigit():
            sql += " AND (u.UserId = %s OR u.Username LIKE %s OR u.FullName LIKE %s)"
            params += [int(kw), like, like]
        else:
            sql += " AND (u.Username LIKE %s OR u.FullName LIKE %s)"
            params += [like, like]
    sql += " ORDER BY u.UserId LIMIT 20"
    with db.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    for r in rows:
        r["Role"] = "Customer"
        r["Email"] = mask_email(r["Email"])
        r["Phone"] = mask_phone(r["Phone"])
    return rows


@router.put("/executive/users/{user_id}/reset-password")
def executive_reset_password(user_id: int, data: AdminResetPasswordSchema,
                             user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    """ลูกค้า/พนักงานลืมรหัสผ่าน -> ผู้บริหารตั้งรหัสใหม่ให้ (แทน endpoint reset-password แบบเปิดสาธารณะเดิม)"""
    validate_password(data.new_password)
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT UserId FROM `User` WHERE UserId = %s FOR UPDATE", (user_id,))
            if not cur.fetchone():
                raise DomainError(404, "ไม่พบบัญชีผู้ใช้นี้")
            cur.execute(
                "UPDATE `User` SET PasswordHash = %s, FailedLoginCount = 0, LockedUntil = NULL WHERE UserId = %s",
                (hash_password(data.new_password), user_id),
            )
        log_audit(db, user["UserId"], "PASSWORD_RESET", "User", user_id)
    return {"success": True, "message": "ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว"}


# ------------------------------------------------------- staff (owner scope)
# บัญชีที่ถูก "ลบถาวร" (ลบข้อมูลส่วนตัว แต่เก็บแถวไว้ให้ Order/Log อ้างถึง) จะถูกเปลี่ยน Username เป็น
# deleted-<id>-<สุ่ม> ; ขีด (-) ไม่ผ่าน validate_username จึงไม่มีทางชนกับชื่อผู้ใช้จริง และใช้แยกบัญชีที่ถูกลบได้
ERASED_USERNAME_PREFIX = "deleted-"

_STAFF_SELECT = """
    SELECT u.UserId, u.Username, u.FullName, u.Phone, u.Email, u.ProfileImageUrl, u.IsActive,
           u.CreatedAt, u.LockedUntil, r.RoleCode, creator.FullName AS CreatedByName,
           (SELECT MAX(l.CreatedAt) FROM OrderStatusLog l WHERE l.ChangedBy = u.UserId) AS LastActiveAt,
           (SELECT COUNT(DISTINCT l.OrderId) FROM OrderStatusLog l
             WHERE l.ChangedBy = u.UserId AND l.CreatedAt >= CURDATE()) AS OrdersToday
    FROM `User` u
    JOIN Role r ON r.RoleId = u.RoleId
    LEFT JOIN `User` creator ON creator.UserId = u.CreatedBy
"""


def _shape_staff(row: dict, now) -> dict:
    row["Role"] = legacy_role(row["RoleCode"])
    row["IsActive"] = bool(row["IsActive"])
    row["IsLocked"] = bool(row["LockedUntil"] and row["LockedUntil"] > now)
    row["OrdersToday"] = int(row["OrdersToday"] or 0)
    return row


def _staff_image(value: Optional[str]) -> Optional[str]:
    """รูปโปรไฟล์: data URL -> เก็บไฟล์ ; ส่งมาแต่ใช้ไม่ได้ = แจ้ง error (ไม่ทิ้งเงียบ ๆ)"""
    if not value:
        return None
    path = save_image(value, "profiles")
    if not path:
        raise DomainError(400, "ไฟล์รูปโปรไฟล์ไม่ถูกต้อง")
    return path


def _lock_staff(cur, user: dict, user_id: int) -> dict:
    """พนักงานหน้าร้าน/ครัวที่ผู้เรียกมีสิทธิ์จัดการ (เจ้าของร้าน = เฉพาะร้านตัวเอง)"""
    cur.execute(
        """
        SELECT u.UserId, u.Username, u.FullName, u.StoreId, u.IsActive, u.ProfileImageUrl, r.RoleCode,
               COALESCE(s.IsDeleted, 0) AS StoreIsDeleted
        FROM `User` u JOIN Role r ON r.RoleId = u.RoleId LEFT JOIN Store s ON s.StoreId = u.StoreId
        WHERE u.UserId = %s FOR UPDATE OF u
        """,
        (user_id,),
    )
    target = cur.fetchone()
    if not target or target["RoleCode"] not in STAFF_ROLES or target["Username"].startswith(ERASED_USERNAME_PREFIX):
        raise DomainError(404, "ไม่พบพนักงานนี้")
    assert_store_access(user, target["StoreId"])
    return target


@router.get("/stores/{store_id}/staff")
def get_store_staff(store_id: int, include_inactive: bool = False,
                    user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    """รายชื่อพนักงานร้าน + ข้อมูลติดต่อ, สถานะบัญชี, วันที่สร้าง, งานที่ทำวันนี้ (จาก OrderStatusLog)"""
    assert_store_access(user, store_id)
    sql = (_STAFF_SELECT + " WHERE u.StoreId = %s AND r.RoleCode IN ('FRONT_STAFF', 'KITCHEN_STAFF')"
           f" AND u.Username NOT LIKE '{ERASED_USERNAME_PREFIX}%%'")
    if not include_inactive:
        sql += " AND u.IsActive = TRUE"
    sql += " ORDER BY u.IsActive DESC, u.UserId"
    with db.cursor() as cur:
        cur.execute(sql, (store_id,))
        rows = cur.fetchall()
    now = bangkok_now()
    return [_shape_staff(r, now) for r in rows]


def _insert_user(cur, username, password, full_name, role_code, store_id, created_by,
                 phone=None, email=None, profile_img=None) -> int:
    try:
        cur.execute(
            """
            INSERT INTO `User` (Username, PasswordHash, FullName, Phone, Email, ProfileImageUrl, RoleId, StoreId, CreatedBy)
            VALUES (%s, %s, %s, %s, %s, %s, (SELECT RoleId FROM Role WHERE RoleCode = %s), %s, %s)
            """,
            (username, hash_password(password), full_name, phone, email, profile_img, role_code, store_id, created_by),
        )
    except Exception as exc:  # noqa: BLE001
        if is_duplicate_key(exc):
            raise DomainError(400, "ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว")
        raise
    return cur.lastrowid


@router.post("/stores/{store_id}/staff", status_code=201)
def add_store_staff(store_id: int, data: StaffCreateSchema,
                    user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    assert_store_access(user, store_id)
    role_code = role_code_from_input(data.role)
    if role_code not in STAFF_ROLES:
        raise DomainError(400, "เจ้าของร้านเพิ่มได้เฉพาะพนักงานหน้าร้านหรือพนักงานครัว")
    username = validate_username(data.username)
    validate_password(data.password)
    full_name = data.fullName.strip()
    if not full_name:
        raise DomainError(400, "กรุณากรอกชื่อ-นามสกุลพนักงาน")
    phone = validate_phone(data.phone, required=True)
    email = validate_email(data.email)
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT 1 FROM Store WHERE StoreId = %s AND IsDeleted = FALSE", (store_id,))
            if not cur.fetchone():
                raise DomainError(404, "ไม่พบร้านค้า")
            cur.execute("SELECT 1 FROM `User` WHERE Username = %s", (username,))
            if cur.fetchone():
                raise DomainError(400, "ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว")
            # เขียนไฟล์รูปหลังตรวจข้อมูลอื่นผ่านแล้ว (กันไฟล์ค้างเมื่อข้อมูลผิด)
            img = _staff_image(data.profile_img)
            uid = _insert_user(cur, username, data.password, full_name, role_code, store_id, user["UserId"],
                               phone, email, img)
        log_audit(db, user["UserId"], "CREATE_STAFF", "User", uid, None,
                  {"username": username, "role": role_code, "store_id": store_id})
    return {"success": True, "user_id": uid, "message": "เพิ่มพนักงานสำเร็จ"}


@router.put("/staff/{user_id}")
def update_staff(user_id: int, data: StaffUpdateSchema,
                 user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    """แก้ชื่อ/เบอร์/อีเมล/ตำแหน่ง/รูป (ชื่อผู้ใช้แก้ไม่ได้ ; รหัสผ่านใช้ endpoint reset-password)
    profile_img: None หรือ path /uploads/ เดิม = ไม่เปลี่ยน ; "" = ลบรูป ; data URL = รูปใหม่"""
    sets, args, changed = [], [], []
    if data.fullName is not None:
        name = data.fullName.strip()
        if not name:
            raise DomainError(400, "กรุณากรอกชื่อ-นามสกุลพนักงาน")
        sets.append("FullName = %s")
        args.append(name)
        changed.append("full_name")
    if data.phone is not None:
        sets.append("Phone = %s")
        args.append(validate_phone(data.phone, required=True))
        changed.append("phone")
    if data.email is not None:
        sets.append("Email = %s")
        args.append(validate_email(data.email))
        changed.append("email")
    role_code = None
    if data.role is not None:
        role_code = role_code_from_input(data.role)
        if role_code not in STAFF_ROLES:
            raise DomainError(400, "ตำแหน่งต้องเป็นพนักงานหน้าร้านหรือพนักงานครัว")
        sets.append("RoleId = (SELECT RoleId FROM Role WHERE RoleCode = %s)")
        args.append(role_code)
        changed.append("role")
    new_image = data.profile_img is not None and not data.profile_img.startswith("/uploads/")
    if new_image:
        changed.append("profile_img")
    if not changed:
        raise DomainError(400, "ไม่มีข้อมูลที่ต้องการแก้ไข")

    with transaction(db):
        with db.cursor() as cur:
            target = _lock_staff(cur, user, user_id)
            if not target["IsActive"]:
                raise DomainError(400, "พนักงานคนนี้ถูกปิดใช้งานอยู่ กรุณาเปิดใช้งานก่อนแก้ไข")
            if new_image:
                sets.append("ProfileImageUrl = %s")
                args.append(_staff_image(data.profile_img))
            args.append(user_id)
            cur.execute(f"UPDATE `User` SET {', '.join(sets)} WHERE UserId = %s", args)
        log_audit(db, user["UserId"], "UPDATE_STAFF", "User", user_id,
                  {"role": target["RoleCode"]} if role_code else None,
                  {"changed": changed, **({"role": role_code} if role_code else {})})
    return {"success": True, "message": "บันทึกข้อมูลพนักงานเรียบร้อยแล้ว"}


@router.put("/staff/{user_id}/active")
def set_staff_active(user_id: int, data: StaffActiveSchema,
                     user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    """ปิดใช้งาน (เข้าสู่ระบบไม่ได้ทันที เพราะทุก request อ่าน IsActive จาก DB) / เปิดใช้งานอีกครั้ง"""
    with transaction(db):
        with db.cursor() as cur:
            target = _lock_staff(cur, user, user_id)
            if bool(target["IsActive"]) == data.is_active:
                return {"success": True, "is_active": data.is_active}
            if data.is_active and target["StoreIsDeleted"]:
                raise DomainError(400, "ร้านค้านี้ถูกลบแล้ว เปิดใช้งานพนักงานไม่ได้")
            if data.is_active:
                # เปิดใช้งานใหม่ = เริ่มนับรหัสผิดใหม่ด้วย
                cur.execute("UPDATE `User` SET IsActive = TRUE, FailedLoginCount = 0, LockedUntil = NULL "
                            "WHERE UserId = %s", (user_id,))
            else:
                cur.execute("UPDATE `User` SET IsActive = FALSE WHERE UserId = %s", (user_id,))
        log_audit(db, user["UserId"], "ACTIVATE_STAFF" if data.is_active else "DEACTIVATE_STAFF", "User", user_id,
                  {"is_active": not data.is_active}, {"is_active": data.is_active, "username": target["Username"]})
    return {"success": True, "is_active": data.is_active}


@router.put("/staff/{user_id}/reset-password")
def reset_staff_password(user_id: int, data: AdminResetPasswordSchema,
                         user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    """พนักงานลืมรหัสผ่าน -> เจ้าของร้านตั้งให้ใหม่ (ปลดล็อกบัญชีด้วย)"""
    validate_password(data.new_password)
    with transaction(db):
        with db.cursor() as cur:
            target = _lock_staff(cur, user, user_id)
            if not target["IsActive"]:
                raise DomainError(400, "พนักงานคนนี้ถูกปิดใช้งานอยู่ กรุณาเปิดใช้งานก่อน")
            cur.execute(
                "UPDATE `User` SET PasswordHash = %s, FailedLoginCount = 0, LockedUntil = NULL WHERE UserId = %s",
                (hash_password(data.new_password), user_id),
            )
        log_audit(db, user["UserId"], "RESET_STAFF_PASSWORD", "User", user_id)
    return {"success": True, "message": f"ตั้งรหัสผ่านใหม่ให้ {target['FullName']} เรียบร้อยแล้ว"}


@router.delete("/staff/{user_id}")
def delete_staff(user_id: int, user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    """ลบแบบ soft delete (IsActive = FALSE) เพราะ Order/Log อ้างถึง UserId นี้อยู่"""
    with transaction(db):
        with db.cursor() as cur:
            target = _lock_staff(cur, user, user_id)  # เจ้าของร้านลบได้เฉพาะพนักงานร้านตัวเอง
            cur.execute("UPDATE `User` SET IsActive = FALSE WHERE UserId = %s", (user_id,))
        log_audit(db, user["UserId"], "DELETE_STAFF", "User", user_id, {"username": target["Username"]}, None)
    return {"success": True, "message": "ลบพนักงานสำเร็จ"}


@router.post("/staff/{user_id}/erase")
def erase_staff(user_id: int, data: StaffEraseSchema,
                user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    """ลบถาวร = ลบข้อมูลส่วนตัวทิ้ง (ชื่อ/เบอร์/อีเมล/รูป/รหัสผ่าน) แต่เก็บแถว User ไว้
    เพราะ Order, OrderStatusLog, Payment, AuditLog ฯลฯ อ้างถึง UserId นี้ (ลบแถวจริงจะผิด FK และประวัติหาย)
    ต้องปิดใช้งานก่อน และพิมพ์ชื่อผู้ใช้ยืนยันให้ตรง ; ทำแล้วย้อนกลับไม่ได้"""
    with transaction(db):
        with db.cursor() as cur:
            target = _lock_staff(cur, user, user_id)
            if target["IsActive"]:
                raise DomainError(400, "กรุณาปิดใช้งานบัญชีนี้ก่อนลบถาวร")
            if data.confirm_username.strip() != target["Username"]:
                raise DomainError(400, "ชื่อผู้ใช้ที่พิมพ์ยืนยันไม่ตรงกับบัญชีนี้")
            cur.execute(
                """
                UPDATE `User`
                SET Username = %s, FullName = %s, Phone = NULL, Email = NULL, ProfileImageUrl = NULL,
                    PasswordHash = NULL, GoogleId = NULL, FailedLoginCount = 0, LockedUntil = NULL, IsActive = FALSE
                WHERE UserId = %s
                """,
                (f"{ERASED_USERNAME_PREFIX}{user_id}-{secrets.token_hex(4)}", f"พนักงานที่ถูกลบ #{user_id}", user_id),
            )
        log_audit(db, user["UserId"], "ERASE_STAFF", "User", user_id, {"username": target["Username"]},
                  {"erased": True})
    # ลบไฟล์รูปหลัง commit แล้วเท่านั้น (ถ้า transaction ล้มจะไม่เสียรูปไปฟรี ๆ)
    delete_upload(target["ProfileImageUrl"])
    return {"success": True, "message": f"ลบข้อมูลพนักงาน {target['FullName']} ถาวรเรียบร้อยแล้ว"}


# ---------------------------------------------- store accounts (executive only)
@router.get("/store-accounts")
def list_store_accounts(user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT u.UserId, u.Username, u.FullName, r.RoleCode, u.StoreId, s.StoreName,
                   COALESCE(s.IsDeleted, 0) AS StoreIsDeleted, s.DeletedAt AS StoreDeletedAt
            FROM `User` u
            JOIN Role r ON r.RoleId = u.RoleId
            LEFT JOIN Store s ON s.StoreId = u.StoreId
            WHERE r.RoleCode IN ('STORE_OWNER', 'FRONT_STAFF', 'KITCHEN_STAFF') AND u.IsActive = TRUE
            ORDER BY u.StoreId, u.UserId
            """
        )
        rows = cur.fetchall()
    for r in rows:
        r["Role"] = legacy_role(r["RoleCode"])
    return rows


@router.post("/store-accounts", status_code=201)
def create_store_account(data: AccountCreateSchema, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    username = validate_username(data.username)
    validate_password(data.password)
    role_code = role_code_from_input(data.role)
    if role_code not in STORE_ROLES:
        raise DomainError(400, "ตำแหน่งไม่ถูกต้อง")
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT 1 FROM Store WHERE StoreId = %s AND IsDeleted = FALSE", (data.store_id,))
            if not cur.fetchone():
                raise DomainError(404, "ไม่พบร้านค้าที่เลือก หรือร้านนี้ถูกลบแล้ว")
            uid = _insert_user(cur, username, data.password, data.full_name.strip(), role_code, data.store_id, user["UserId"])
        log_audit(db, user["UserId"], "CREATE_STORE_ACCOUNT", "User", uid, None,
                  {"username": username, "role": role_code, "store_id": data.store_id})
    return {"success": True, "user_id": uid, "message": "สร้างบัญชีเรียบร้อยแล้ว"}


@router.put("/store-accounts/{user_id}/password")
def update_store_account(user_id: int, data: AccountUpdateSchema,
                         user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT u.UserId, u.Username, r.RoleCode, COALESCE(s.IsDeleted, 0) AS StoreIsDeleted
                FROM `User` u JOIN Role r ON r.RoleId = u.RoleId LEFT JOIN Store s ON s.StoreId = u.StoreId
                WHERE u.UserId = %s FOR UPDATE OF u
                """,
                (user_id,),
            )
            acc = cur.fetchone()
            if not acc or acc["RoleCode"] not in STORE_ROLES or acc["Username"].startswith(ERASED_USERNAME_PREFIX):
                raise DomainError(404, "ไม่พบบัญชีผู้ใช้นี้")
            if acc["StoreIsDeleted"]:
                raise DomainError(403, "ไม่สามารถแก้ไขบัญชีของร้านที่ถูกลบแล้ว")

            sets, args, changed = [], [], []
            if data.password is not None:
                validate_password(data.password)
                sets.append("PasswordHash = %s, FailedLoginCount = 0, LockedUntil = NULL")
                args.append(hash_password(data.password))
                changed.append("password")
            if data.full_name is not None:
                name = data.full_name.strip()
                if not name:
                    raise DomainError(400, "กรุณากรอกชื่อ-นามสกุลผู้ใช้")
                sets.append("FullName = %s")
                args.append(name[:100])
                changed.append("full_name")
            if data.role is not None:
                role_code = role_code_from_input(data.role)
                if role_code not in STORE_ROLES:
                    raise DomainError(400, "ตำแหน่งไม่ถูกต้อง")
                sets.append("RoleId = (SELECT RoleId FROM Role WHERE RoleCode = %s)")
                args.append(role_code)
                changed.append("role")
            if data.store_id is not None:
                cur.execute("SELECT 1 FROM Store WHERE StoreId = %s AND IsDeleted = FALSE", (data.store_id,))
                if not cur.fetchone():
                    raise DomainError(404, "ไม่พบร้านค้าที่เลือก")
                sets.append("StoreId = %s")
                args.append(data.store_id)
                changed.append("store_id")
            if not sets:
                raise DomainError(400, "ไม่มีข้อมูลที่ต้องการแก้ไข")
            args.append(user_id)
            cur.execute(f"UPDATE `User` SET {', '.join(sets)} WHERE UserId = %s", args)
        log_audit(db, user["UserId"], "UPDATE_STORE_ACCOUNT", "User", user_id, None, {"changed": changed})
    return {"success": True, "message": "อัปเดตบัญชีเรียบร้อยแล้ว"}


@router.delete("/store-accounts/{user_id}")
def delete_store_account(user_id: int, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT u.Username, r.RoleCode, COALESCE(s.IsDeleted, 0) AS StoreIsDeleted
                FROM `User` u JOIN Role r ON r.RoleId = u.RoleId LEFT JOIN Store s ON s.StoreId = u.StoreId
                WHERE u.UserId = %s FOR UPDATE OF u
                """,
                (user_id,),
            )
            acc = cur.fetchone()
            if not acc:
                raise DomainError(404, "ไม่พบบัญชีผู้ใช้นี้")
            if acc["StoreIsDeleted"]:
                raise DomainError(403, "ไม่สามารถลบบัญชีของร้านที่ถูกลบแล้ว")
            if acc["RoleCode"] not in STORE_ROLES:
                raise DomainError(400, "ลบได้เฉพาะบัญชีของฝั่งร้านค้าเท่านั้น")
            cur.execute("UPDATE `User` SET IsActive = FALSE WHERE UserId = %s", (user_id,))
        log_audit(db, user["UserId"], "DELETE_STORE_ACCOUNT", "User", user_id, {"username": acc["Username"]}, None)
    return {"success": True, "message": "ลบบัญชีเรียบร้อยแล้ว"}
