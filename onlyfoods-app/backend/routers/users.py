"""โปรไฟล์ผู้ใช้, ค้นหาลูกค้า, บัญชีพนักงานร้าน / บัญชีร้านค้า"""
from typing import Optional

from fastapi import APIRouter, Depends

from auth import assert_store_access, get_current_user, hash_password, require_role
from db import get_db, transaction
from errors import DomainError
from schemas import (AccountCreateSchema, AccountUpdateSchema, AdminResetPasswordSchema,
                     CompleteProfileSchema, StaffCreateSchema, UpdateProfileSchema)
from services import is_duplicate_key, log_audit
from shapes import USER_SELECT, shape_user
from state import STORE_ROLES, legacy_role, role_code_from_input
from utils import mask_email, mask_phone, save_image, validate_password, validate_username

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
@router.get("/stores/{store_id}/staff")
def get_store_staff(store_id: int, user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    assert_store_access(user, store_id)
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT u.UserId, u.Username, u.FullName, r.RoleCode
            FROM `User` u JOIN Role r ON r.RoleId = u.RoleId
            WHERE u.StoreId = %s AND u.IsActive = TRUE AND r.RoleCode IN ('FRONT_STAFF', 'KITCHEN_STAFF')
            ORDER BY u.UserId
            """,
            (store_id,),
        )
        rows = cur.fetchall()
    for r in rows:
        r["Role"] = legacy_role(r["RoleCode"])
    return rows


def _insert_user(cur, username, password, full_name, role_code, store_id, created_by) -> int:
    try:
        cur.execute(
            """
            INSERT INTO `User` (Username, PasswordHash, FullName, RoleId, StoreId, CreatedBy)
            VALUES (%s, %s, %s, (SELECT RoleId FROM Role WHERE RoleCode = %s), %s, %s)
            """,
            (username, hash_password(password), full_name, role_code, store_id, created_by),
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
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT 1 FROM Store WHERE StoreId = %s AND IsDeleted = FALSE", (store_id,))
            if not cur.fetchone():
                raise DomainError(404, "ไม่พบร้านค้า")
            uid = _insert_user(cur, username, data.password, data.fullName.strip(), role_code, store_id, user["UserId"])
        log_audit(db, user["UserId"], "CREATE_STAFF", "User", uid, None,
                  {"username": username, "role": role_code, "store_id": store_id})
    return {"success": True, "user_id": uid, "message": "เพิ่มพนักงานสำเร็จ"}


@router.delete("/staff/{user_id}")
def delete_staff(user_id: int, user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    """ลบแบบ soft delete (IsActive = FALSE) เพราะ Order/Log อ้างถึง UserId นี้อยู่"""
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT u.UserId, u.Username, u.StoreId, r.RoleCode FROM `User` u JOIN Role r ON r.RoleId = u.RoleId
                WHERE u.UserId = %s FOR UPDATE
                """,
                (user_id,),
            )
            target = cur.fetchone()
            if not target or target["RoleCode"] not in STAFF_ROLES:
                raise DomainError(404, "ไม่พบพนักงานนี้")
            assert_store_access(user, target["StoreId"])  # เจ้าของร้านลบได้เฉพาะพนักงานร้านตัวเอง
            cur.execute("UPDATE `User` SET IsActive = FALSE WHERE UserId = %s", (user_id,))
        log_audit(db, user["UserId"], "DELETE_STAFF", "User", user_id, {"username": target["Username"]}, None)
    return {"success": True, "message": "ลบพนักงานสำเร็จ"}


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
            if not acc or acc["RoleCode"] not in STORE_ROLES:
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
