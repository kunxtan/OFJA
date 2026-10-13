"""ร้านค้า + สัญญาเช่า (StoreContract 1:1 กับ Store)"""
from typing import Optional

from fastapi import APIRouter, Depends

from auth import assert_store_access, hash_password, require_role
from db import get_db, transaction
from errors import DomainError
from schemas import RenewContractSchema, StoreFullSchema, StoreNameSchema
from services import get_foodcourt, is_duplicate_key, log_audit
from shapes import STORE_SELECT
from utils import (bangkok_now, clean_text, contract_active, contract_status_for, foodcourt_is_open,
                   parse_date, save_image, validate_password, validate_username)

router = APIRouter(prefix="/api/stores", tags=["stores"])

_ADMIN_STORE_SELECT = STORE_SELECT.replace("c.ContractStatus", "c.ContractStatus, c.MonthlyRent")


def _category_id(cur, name: Optional[str]) -> int:
    if not name or not name.strip():
        raise DomainError(400, "กรุณาเลือกประเภทอาหาร")
    cur.execute("SELECT StoreCategoryId FROM StoreCategory WHERE CategoryName = %s LIMIT 1", (name.strip(),))
    row = cur.fetchone()
    if not row:
        raise DomainError(400, "ประเภทอาหารไม่ถูกต้อง")
    return row["StoreCategoryId"]


def _upsert_contract(cur, store_id: int, start, end, rent, user_id: int) -> None:
    if end <= start:
        raise DomainError(400, "วันสิ้นสุดสัญญาต้องหลังวันเริ่มสัญญา")
    status = contract_status_for(end)
    cur.execute(
        """
        INSERT INTO StoreContract (StoreId, StartDate, EndDate, MonthlyRent, ContractStatus, CreatedBy)
        VALUES (%s, %s, %s, COALESCE(%s, 0), %s, %s)
        ON DUPLICATE KEY UPDATE StartDate = VALUES(StartDate), EndDate = VALUES(EndDate),
            MonthlyRent = COALESCE(%s, MonthlyRent), ContractStatus = VALUES(ContractStatus)
        """,
        (store_id, start, end, rent, status, user_id, rent),
    )


def _name_taken(cur, name: str, except_id: Optional[int] = None) -> bool:
    cur.execute("SELECT StoreId FROM Store WHERE StoreName = %s AND StoreId <> %s", (name, except_id or 0))
    return cur.fetchone() is not None


@router.get("")
def get_stores(db=Depends(get_db)):
    """รายการร้านสำหรับลูกค้า (เปิดสาธารณะ ไม่รวมร้านที่ถูกลบ และไม่รวมค่าเช่า)"""
    with db.cursor() as cur:
        cur.execute(STORE_SELECT + " WHERE s.IsDeleted = FALSE ORDER BY s.StoreId")
        return cur.fetchall()


@router.get("/history")
def get_store_history(user=Depends(require_role("EXECUTIVE", "ACCOUNTANT")), db=Depends(get_db)):
    """ร้านทั้งหมดรวมที่ถูกลบ (สำหรับผู้บริหาร/บัญชี)"""
    with db.cursor() as cur:
        cur.execute(_ADMIN_STORE_SELECT + " ORDER BY s.StoreName")
        return cur.fetchall()


@router.post("", status_code=201)
def create_store(data: StoreNameSchema, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    name = data.store_name.strip()
    with transaction(db):
        with db.cursor() as cur:
            if _name_taken(cur, name):
                raise DomainError(400, "มีชื่อร้านค้านี้อยู่แล้ว")
            fc = get_foodcourt(cur)
            cur.execute("SELECT StoreCategoryId FROM StoreCategory WHERE CategoryName = 'อื่น ๆ' LIMIT 1")
            cat = cur.fetchone()
            if not cat:
                raise DomainError(500, "ไม่พบประเภทร้านเริ่มต้น (อื่น ๆ)")
            cur.execute(
                "INSERT INTO Store (StoreName, StoreCategoryId, FoodCourtId, IsOpen, IsSuspended) VALUES (%s, %s, %s, TRUE, FALSE)",
                (name, cat["StoreCategoryId"], fc["FoodCourtId"]),
            )
            store_id = cur.lastrowid
        log_audit(db, user["UserId"], "CREATE_STORE", "Store", store_id, None, {"name": name})
    return {"success": True, "store_id": store_id, "message": "เพิ่มร้านค้าเรียบร้อยแล้ว"}


@router.post("/full", status_code=201)
def create_store_full(data: StoreFullSchema, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    name = data.store_name.strip()
    owner_name = (data.owner_full_name or "").strip()
    if not owner_name:
        raise DomainError(400, "กรุณากรอกชื่อเจ้าของร้าน")
    owner_username = validate_username(data.owner_username or "")
    validate_password(data.owner_password or "")
    start, end = parse_date(data.contract_start_date, "วันเริ่มสัญญา"), parse_date(data.contract_end_date, "วันสิ้นสุดสัญญา")
    if (start is None) != (end is None):
        raise DomainError(400, "กรุณากรอกวันเริ่มและวันสิ้นสุดสัญญาให้ครบทั้งสองช่อง")
    image = save_image(data.image_url, "stores") if data.image_url else None
    with transaction(db):
        with db.cursor() as cur:
            category_id = _category_id(cur, data.category)
            if _name_taken(cur, name):
                raise DomainError(400, "มีชื่อร้านค้านี้อยู่แล้ว")
            cur.execute("SELECT 1 FROM `User` WHERE Username = %s", (owner_username,))
            if cur.fetchone():
                raise DomainError(400, "ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว")
            fc = get_foodcourt(cur)
            cur.execute(
                """
                INSERT INTO Store (StoreName, StoreCategoryId, FoodCourtId, Description, ImageUrl, IsOpen, IsSuspended,
                                   ContactName, ContactPhone, ContactLine, ContactEmail)
                VALUES (%s, %s, %s, %s, %s, TRUE, FALSE, %s, %s, %s, %s)
                """,
                (name, category_id, fc["FoodCourtId"], clean_text(data.description), image,
                 clean_text(data.contact_name), clean_text(data.contact_phone),
                 clean_text(data.contact_line), clean_text(data.contact_email)),
            )
            store_id = cur.lastrowid
            try:
                cur.execute(
                    """
                    INSERT INTO `User` (Username, PasswordHash, FullName, RoleId, StoreId, CreatedBy)
                    VALUES (%s, %s, %s, (SELECT RoleId FROM Role WHERE RoleCode = 'STORE_OWNER'), %s, %s)
                    """,
                    (owner_username, hash_password(data.owner_password), owner_name[:100], store_id, user["UserId"]),
                )
            except Exception as exc:  # noqa: BLE001
                if is_duplicate_key(exc):
                    raise DomainError(400, "ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว")
                raise
            owner_id = cur.lastrowid
            if start and end:
                _upsert_contract(cur, store_id, start, end, data.monthly_rent, user["UserId"])
        log_audit(db, user["UserId"], "CREATE_STORE", "Store", store_id, None, {"name": name})
        log_audit(db, user["UserId"], "CREATE_STORE_ACCOUNT", "User", owner_id, None,
                  {"username": owner_username, "role": "STORE_OWNER", "store_id": store_id})
    return {"success": True, "store_id": store_id, "user_id": owner_id,
            "message": "เพิ่มร้านค้าและบัญชีเจ้าของร้านเรียบร้อยแล้ว"}


@router.put("/{store_id}")
def update_store(store_id: int, data: StoreNameSchema, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    name = data.store_name.strip()
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT StoreName FROM Store WHERE StoreId = %s FOR UPDATE", (store_id,))
            old = cur.fetchone()
            if not old:
                raise DomainError(404, "ไม่พบร้านค้า")
            if _name_taken(cur, name, store_id):
                raise DomainError(400, "มีชื่อร้านค้านี้อยู่แล้ว")
            cur.execute("UPDATE Store SET StoreName = %s WHERE StoreId = %s", (name, store_id))
        log_audit(db, user["UserId"], "UPDATE_STORE", "Store", store_id, {"name": old["StoreName"]}, {"name": name})
    return {"success": True, "message": "แก้ไขชื่อร้านเรียบร้อยแล้ว"}


@router.put("/{store_id}/full")
def update_store_full(store_id: int, data: StoreFullSchema, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    name = data.store_name.strip()
    start, end = parse_date(data.contract_start_date, "วันเริ่มสัญญา"), parse_date(data.contract_end_date, "วันสิ้นสุดสัญญา")
    image = save_image(data.image_url, "stores") if data.image_url else None
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT StoreName FROM Store WHERE StoreId = %s FOR UPDATE", (store_id,))
            old = cur.fetchone()
            if not old:
                raise DomainError(404, "ไม่พบร้านค้า")
            if _name_taken(cur, name, store_id):
                raise DomainError(400, "มีชื่อร้านค้านี้อยู่แล้ว")
            category_id = _category_id(cur, data.category)
            cur.execute(
                """
                UPDATE Store SET StoreName = %s, StoreCategoryId = %s, ContactName = %s, ContactPhone = %s,
                       ContactLine = %s, ContactEmail = %s, Description = %s, ImageUrl = %s
                WHERE StoreId = %s
                """,
                (name, category_id, clean_text(data.contact_name), clean_text(data.contact_phone),
                 clean_text(data.contact_line), clean_text(data.contact_email), clean_text(data.description),
                 image, store_id),
            )
            if start and end:
                _upsert_contract(cur, store_id, start, end, data.monthly_rent, user["UserId"])
        log_audit(db, user["UserId"], "UPDATE_STORE", "Store", store_id, {"name": old["StoreName"]}, {"name": name})
    return {"success": True, "message": "บันทึกข้อมูลร้านค้าเรียบร้อยแล้ว"}


@router.delete("/{store_id}")
def delete_store(store_id: int, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    """soft delete: ห้ามลบถ้ายังมีออเดอร์ที่ยังไม่จบ"""
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT StoreName, IsDeleted FROM Store WHERE StoreId = %s FOR UPDATE", (store_id,))
            store = cur.fetchone()
            if not store:
                raise DomainError(404, "ไม่พบร้านค้า")
            if store["IsDeleted"]:
                raise DomainError(400, "ร้านค้านี้ถูกลบไปแล้ว")
            cur.execute(
                """
                SELECT COUNT(*) AS n FROM `Order` o JOIN OrderStatus os ON os.StatusId = o.StatusId
                WHERE o.StoreId = %s AND os.IsTerminal = FALSE
                """,
                (store_id,),
            )
            pending = cur.fetchone()["n"]
            if pending:
                raise DomainError(400, f"ร้านนี้ยังมีออเดอร์ค้างอยู่ {pending} รายการ กรุณาจัดการออเดอร์ให้เสร็จก่อนลบร้าน")
            cur.execute("UPDATE Store SET IsDeleted = TRUE, DeletedAt = %s, IsOpen = FALSE WHERE StoreId = %s",
                        (bangkok_now(), store_id))
        log_audit(db, user["UserId"], "DELETE_STORE", "Store", store_id, {"name": store["StoreName"]}, None)
    return {"success": True, "message": "ลบร้านค้าเรียบร้อยแล้ว"}


@router.put("/{store_id}/toggle")
def toggle_store(store_id: int, user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    assert_store_access(user, store_id)
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT s.StoreName, s.IsOpen, s.IsSuspended, s.IsDeleted,
                       c.StartDate, c.EndDate, c.ContractStatus
                FROM Store s LEFT JOIN StoreContract c ON c.StoreId = s.StoreId
                WHERE s.StoreId = %s FOR UPDATE OF s
                """,
                (store_id,),
            )
            store = cur.fetchone()
            if not store or store["IsDeleted"]:
                raise DomainError(404, "ไม่พบร้านค้า")
            new_open = not bool(store["IsOpen"])
            if new_open:
                if not foodcourt_is_open(get_foodcourt(cur)):
                    raise DomainError(400, "ไม่สามารถเปิดร้านได้ เนื่องจากศูนย์อาหารปิดให้บริการ")
                if store["IsSuspended"]:
                    raise DomainError(400, "ร้านถูกระงับสิทธิ์ ไม่สามารถเปิดร้านได้")
                if not contract_active(store["StartDate"], store["EndDate"], store["ContractStatus"]):
                    raise DomainError(400, "สัญญาร้านหมดอายุหรือยังไม่มีผล ไม่สามารถเปิดร้านได้")
            cur.execute("UPDATE Store SET IsOpen = %s WHERE StoreId = %s", (new_open, store_id))
        log_audit(db, user["UserId"], "OPEN_STORE" if new_open else "CLOSE_STORE", "Store", store_id,
                  None, {"name": store["StoreName"]})
    return {"success": True, "is_open": new_open}


@router.put("/{store_id}/suspend")
def suspend_store(store_id: int, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT StoreName, IsSuspended FROM Store WHERE StoreId = %s FOR UPDATE", (store_id,))
            store = cur.fetchone()
            if not store:
                raise DomainError(404, "ไม่พบร้านค้า")
            suspended = not bool(store["IsSuspended"])
            if suspended:
                cur.execute("UPDATE Store SET IsSuspended = TRUE, IsOpen = FALSE WHERE StoreId = %s", (store_id,))
            else:
                cur.execute("UPDATE Store SET IsSuspended = FALSE WHERE StoreId = %s", (store_id,))
        log_audit(db, user["UserId"], "SUSPEND_STORE" if suspended else "UNSUSPEND_STORE", "Store", store_id,
                  {"suspended": not suspended}, {"suspended": suspended, "name": store["StoreName"]})
    return {"success": True, "is_suspended": suspended}


@router.put("/{store_id}/renew-contract")
def renew_store_contract(store_id: int, data: RenewContractSchema, user=Depends(require_role("EXECUTIVE")),
                         db=Depends(get_db)):
    requested_start = parse_date(data.contract_start_date, "วันเริ่มสัญญา")
    new_end = parse_date(data.contract_end_date, "วันสิ้นสุดสัญญา")
    if not requested_start or not new_end:
        raise DomainError(400, "รูปแบบวันที่สัญญาไม่ถูกต้อง")
    today = bangkok_now().date()
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT StoreName FROM Store WHERE StoreId = %s FOR UPDATE", (store_id,))
            store = cur.fetchone()
            if not store:
                raise DomainError(404, "ไม่พบร้านค้านี้")
            cur.execute("SELECT StartDate, EndDate FROM StoreContract WHERE StoreId = %s FOR UPDATE", (store_id,))
            old = cur.fetchone()
            if old and old["EndDate"] >= today:
                # สัญญาเดิมยังมีผล -> ต่อเนื่องจากเดิม (เริ่มเดิม) แต่ต้องสิ้นสุดช้ากว่าเดิม
                start = old["StartDate"]
                if new_end <= old["EndDate"]:
                    raise DomainError(400, "วันสิ้นสุดสัญญาใหม่ต้องหลังวันสิ้นสุดสัญญาเดิม")
            else:
                start = requested_start
                if start < today:
                    raise DomainError(400, "วันที่เริ่มสัญญาใหม่ต้องไม่เป็นวันที่ผ่านมาแล้ว")
                if new_end <= start:
                    raise DomainError(400, "วันสิ้นสุดสัญญาใหม่ต้องหลังวันที่เริ่มสัญญา")
            _upsert_contract(cur, store_id, start, new_end, data.monthly_rent, user["UserId"])
        log_audit(db, user["UserId"], "RENEW_CONTRACT", "Store", store_id,
                  {"end": old["EndDate"] if old else None},
                  {"start": start, "end": new_end, "name": store["StoreName"]})
    return {"success": True, "message": "ต่อสัญญาเรียบร้อยแล้ว",
            "current_contract_start_date": start.isoformat(), "contract_end_date": new_end.isoformat()}
