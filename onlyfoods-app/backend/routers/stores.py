"""ร้านค้า + สัญญาร้าน (StoreContract 1:1 กับ Store)

กติกาสัญญา (ระบบเก็บแค่วันเริ่ม/วันสิ้นสุด เอกสารจริงอยู่นอกระบบ):
  1. มีผล 00:00:00 วันเริ่ม -> 23:59:59 วันสิ้นสุด (เวลาไทย) สถานะคำนวณจากวันที่เสมอ
    2. หมดสัญญา = ร้านเปิด/รับออเดอร์ใหม่ไม่ได้ ; ถ้ายังมีออเดอร์ค้าง บัญชีร้านเคลียร์ออเดอร์ต่อได้จนจบครบ
     แล้วพนักงานล็อกทันที เจ้าของดูได้อย่างเดียว 30 วัน (utils.store_account_access + auth.py) ;
     ตัดสัญญาย้อนหลังได้ไม่เกินเมื่อวาน ; หมดเกิน 90 วันไม่เปิดรอบใหม่ = ลบอัตโนมัติ (jobs.py)
  3. ทุกการแก้วันต้องมีเหตุผล -> AuditLog (ใคร/เมื่อไหร่/วันเดิม->วันใหม่/เหตุผล) ไม่มีการลบ log
"""
import json
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query

from auth import STORE_SCOPED, assert_store_access, get_optional_user, hash_password, require_role
from db import get_db, transaction
from errors import DomainError
from schemas import ContractEndUpdateSchema, ContractRestartSchema, StoreFullSchema, StoreNameSchema
from services import (force_cancel_open_orders, get_foodcourt, is_duplicate_key, log_audit, notify_owners_closed_by_executive,
                      notify_store_owners, open_order_count, open_orders, queue_summary)
from shapes import STORE_SELECT, shape_store
from utils import (CONTRACT_ACTIVE, CONTRACT_EXPIRED, CONTRACT_NONE, CONTRACT_UPCOMING, add_years_minus_one_day,
                   bangkok_now, clean_reason, clean_text, contract_state, foodcourt_is_open,
                   next_free_queue_code, parse_date, save_image, validate_password, validate_phone,
                   validate_queue_code, validate_username)

router = APIRouter(prefix="/api/stores", tags=["stores"])




def _category_id(cur, name: Optional[str]) -> int:
    if not name or not name.strip():
        raise DomainError(400, "กรุณาเลือกประเภทอาหาร")
    cur.execute("SELECT StoreCategoryId FROM StoreCategory WHERE CategoryName = %s LIMIT 1", (name.strip(),))
    row = cur.fetchone()
    if not row:
        raise DomainError(400, "ประเภทอาหารไม่ถูกต้อง")
    return row["StoreCategoryId"]


def _upsert_contract(cur, store_id: int, start, end, user_id: int) -> None:
    if end <= start:
        raise DomainError(400, "วันสิ้นสุดสัญญาต้องหลังวันเริ่มสัญญา")
    cur.execute(
        """
        INSERT INTO StoreContract (StoreId, StartDate, EndDate, CreatedBy)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE StartDate = VALUES(StartDate), EndDate = VALUES(EndDate)
        """,
        (store_id, start, end, user_id),
    )


def _queue_code(cur, requested: Optional[str], except_id: Optional[int] = None) -> str:
    """ตัวอักษรคิวของร้าน: ระบุเอง (ต้องไม่ซ้ำร้านอื่น) หรือไม่ระบุ = ระบบเลือกตัวที่ว่างตัวแรกให้"""
    cur.execute("SELECT QueueCode FROM Store WHERE StoreId <> %s", (except_id or 0,))
    used = {r["QueueCode"] for r in cur.fetchall()}
    if not requested or not requested.strip():
        return next_free_queue_code(used)
    code = validate_queue_code(requested)
    if code in used:
        raise DomainError(400, f"ตัวอักษรคิว {code} ถูกใช้กับร้านอื่นแล้ว")
    return code


def _insert_store(cur, sql: str, args: tuple) -> int:
    try:
        cur.execute(sql, args)
    except Exception as exc:  # noqa: BLE001 - สร้างร้านพร้อมกันแล้วได้ตัวอักษรคิวเดียวกัน
        if is_duplicate_key(exc) and "uk_store_queuecode" in str(exc):
            raise DomainError(409, "ตัวอักษรคิวถูกใช้ไปพร้อมกัน กรุณากดบันทึกอีกครั้ง")
        raise
    return cur.lastrowid

def _lock_store_contract(cur, store_id: int) -> dict:
    cur.execute(
        """
        SELECT s.StoreName, s.IsDeleted, c.StartDate, c.EndDate
        FROM Store s LEFT JOIN StoreContract c ON c.StoreId = s.StoreId
        WHERE s.StoreId = %s FOR UPDATE
        """,
        (store_id,),
    )
    row = cur.fetchone()
    if not row or row["IsDeleted"]:
        raise DomainError(404, "ไม่พบร้านค้า")
    return row



def _name_taken(cur, name: str, except_id: Optional[int] = None) -> bool:
    cur.execute("SELECT StoreId FROM Store WHERE StoreName = %s AND StoreId <> %s", (name, except_id or 0))
    return cur.fetchone() is not None


# ข้อมูลภายในของร้าน (ผู้ติดต่อ / วันสัญญา) : เห็นเฉพาะผู้บริหาร บัญชี และบัญชีของร้านนั้นเอง
_STORE_PRIVATE_FIELDS = ("ContactName", "ContactPhone", "ContactLine", "ContactEmail", "ContractStartDate",
                         "CurrentContractStartDate", "ContractEndDate", "ContractDaysLeft", "AutoDeleteInDays",
                         "OpenOrderCount", "IsClearingOrders")


@router.get("")
def get_stores(viewer=Depends(get_optional_user), db=Depends(get_db)):
    """รายการร้าน (เปิดสาธารณะ ไม่รวมร้านที่ถูกลบ) ; ข้อมูลผู้ติดต่อ/สัญญาไม่ส่งให้คนทั่วไป"""
    role = viewer["RoleCode"] if viewer else None
    own_store = viewer.get("StoreId") if viewer and role in STORE_SCOPED else None
    with db.cursor() as cur:
        cur.execute(STORE_SELECT + " WHERE s.IsDeleted = FALSE ORDER BY s.StoreId")
        today = bangkok_now().date()
        rows = [shape_store(r, today) for r in cur.fetchall()]
    if role not in ("EXECUTIVE", "ACCOUNTANT"):
        for r in rows:
            if own_store is None or int(r["StoreId"]) != int(own_store):
                for f in _STORE_PRIVATE_FIELDS:
                    r.pop(f, None)
    return rows


@router.get("/history")
def get_store_history(user=Depends(require_role("EXECUTIVE", "ACCOUNTANT")), db=Depends(get_db)):
    """ร้านทั้งหมดรวมที่ถูกลบ (สำหรับผู้บริหาร/บัญชี)"""
    with db.cursor() as cur:
        cur.execute(STORE_SELECT + " ORDER BY s.StoreName")
        today = bangkok_now().date()
        return [shape_store(r, today) for r in cur.fetchall()]


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
            code = _queue_code(cur, data.queue_code)
            store_id = _insert_store(
                cur,
                "INSERT INTO Store (StoreName, StoreCategoryId, FoodCourtId, QueueCode, IsOpen, IsSuspended) "
                "VALUES (%s, %s, %s, %s, TRUE, FALSE)",
                (name, cat["StoreCategoryId"], fc["FoodCourtId"], code),
            )
        log_audit(db, user["UserId"], "CREATE_STORE", "Store", store_id, None, {"name": name, "queue_code": code})
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
    if start is None or end is None:
        raise DomainError(400, "กรุณากรอกวันเริ่มและวันสิ้นสุดสัญญาให้ครบทั้งสองช่อง")

    if end <= start:
        raise DomainError(400, "วันสิ้นสุดสัญญาต้องหลังวันเริ่มสัญญา")
    if end < bangkok_now().date():
        raise DomainError(400, "วันสิ้นสุดสัญญาเป็นวันที่ผ่านมาแล้ว ร้านจะหมดสัญญาทันทีที่สร้าง")
    
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
            code = _queue_code(cur, data.queue_code)
            store_id = _insert_store(
                cur,
                """
                INSERT INTO Store (StoreName, StoreCategoryId, FoodCourtId, QueueCode, Description, ImageUrl,
                                   IsOpen, IsSuspended, ContactName, ContactPhone, ContactLine, ContactEmail)
                VALUES (%s, %s, %s, %s, %s, %s, TRUE, FALSE, %s, %s, %s, %s)
                """,
                (name, category_id, fc["FoodCourtId"], code, clean_text(data.description), image,
                 clean_text(data.contact_name), validate_phone(data.contact_phone),
                 clean_text(data.contact_line), clean_text(data.contact_email)),
            )
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
            _upsert_contract(cur, store_id, start, end, user["UserId"])
        log_audit(db, user["UserId"], "CREATE_STORE", "Store", store_id, None,
                  {"name": name, "queue_code": code, "start": start, "end": end})
        log_audit(db, user["UserId"], "CREATE_STORE_ACCOUNT", "User", owner_id, None,
                  {"username": owner_username, "role": "STORE_OWNER", "store_id": store_id})
    return {"success": True, "store_id": store_id, "user_id": owner_id,
            "message": "เพิ่มร้านค้าและบัญชีเจ้าของร้านเรียบร้อยแล้ว"}


@router.put("/{store_id}")
def update_store(store_id: int, data: StoreNameSchema, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    name = data.store_name.strip()
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT StoreName, QueueCode FROM Store WHERE StoreId = %s FOR UPDATE", (store_id,))
            old = cur.fetchone()
            if not old:
                raise DomainError(404, "ไม่พบร้านค้า")
            if _name_taken(cur, name, store_id):
                raise DomainError(400, "มีชื่อร้านค้านี้อยู่แล้ว")
            code = _queue_code(cur, data.queue_code, store_id) if data.queue_code else old["QueueCode"]
            cur.execute("UPDATE Store SET StoreName = %s, QueueCode = %s WHERE StoreId = %s", (name, code, store_id))
        log_audit(db, user["UserId"], "UPDATE_STORE", "Store", store_id,
                  {"name": old["StoreName"], "queue_code": old["QueueCode"]}, {"name": name, "queue_code": code})
    return {"success": True, "message": "แก้ไขชื่อร้านเรียบร้อยแล้ว"}


@router.put("/{store_id}/full")
def update_store_full(store_id: int, data: StoreFullSchema, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
        # วันสัญญาที่ส่งมากับฟอร์มนี้ถูก "ไม่สนใจ" โดยตั้งใจ : แก้วันสัญญาได้ทางเดียวคือ
    # PUT /{store_id}/contract หรือ POST /{store_id}/contract/restart (ต้องมีเหตุผล + ลง AuditLog)
    name = data.store_name.strip()
    image = save_image(data.image_url, "stores") if data.image_url else None
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT StoreName, QueueCode FROM Store WHERE StoreId = %s FOR UPDATE", (store_id,))
            old = cur.fetchone()
            if not old:
                raise DomainError(404, "ไม่พบร้านค้า")
            if _name_taken(cur, name, store_id):
                raise DomainError(400, "มีชื่อร้านค้านี้อยู่แล้ว")
            category_id = _category_id(cur, data.category)
            # ไม่ส่ง queue_code มา = คงตัวเดิม
            code = _queue_code(cur, data.queue_code, store_id) if data.queue_code else old["QueueCode"]
            cur.execute(
                """
                UPDATE Store SET StoreName = %s, StoreCategoryId = %s, QueueCode = %s, ContactName = %s,
                       ContactPhone = %s, ContactLine = %s, ContactEmail = %s, Description = %s, ImageUrl = %s
                WHERE StoreId = %s
                """,
                                (name, category_id, code, clean_text(data.contact_name), validate_phone(data.contact_phone),
                 clean_text(data.contact_line), clean_text(data.contact_email), clean_text(data.description),
                 image, store_id),
            )
        log_audit(db, user["UserId"], "UPDATE_STORE", "Store", store_id,
                  {"name": old["StoreName"], "queue_code": old["QueueCode"]}, {"name": name, "queue_code": code})
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
            pending = open_order_count(cur, store_id)
            if pending:
                raise DomainError(400, f"ร้านนี้ยังมีออเดอร์หรือเงินคืนลูกค้าค้างอยู่ {pending} รายการ กรุณาจัดการให้เสร็จก่อนลบร้าน")
            cur.execute("UPDATE Store SET IsDeleted = TRUE, DeletedAt = %s, IsOpen = FALSE WHERE StoreId = %s",
                        (bangkok_now(), store_id))
        log_audit(db, user["UserId"], "DELETE_STORE", "Store", store_id, {"name": store["StoreName"]}, None)
    return {"success": True, "message": "ลบร้านค้าเรียบร้อยแล้ว"}


@router.get("/{store_id}/open-orders")
def get_store_open_orders(store_id: int, user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    """ออเดอร์ที่ยังไม่จบของร้าน (แสดงในหน้าต่างยืนยันก่อนปิดร้าน)"""
    assert_store_access(user, store_id)
    with db.cursor() as cur:
        return open_orders(cur, store_id)


@router.put("/{store_id}/toggle")
def toggle_store(store_id: int, open: Optional[bool] = None,
                 on_open_orders: Optional[str] = Query(None, pattern="^(finish|cancel)$"),
                 user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    """open=true/false = ตั้งเป็นสถานะนั้น (เป็นอยู่แล้ว = ไม่ทำอะไร) ; ไม่ส่ง = สลับ (client เดิม)
    กฎ PO 1 ปิดร้านตอนยังมีออเดอร์ค้าง: เจ้าของร้านปิดไม่ได้ ; ผู้บริหารต้องเลือก on_open_orders
      finish = หยุดรับออเดอร์ใหม่ ออเดอร์ที่ค้างทำต่อจนจบ ; cancel = ยกเลิกทั้งหมดและคืนเงิน"""
    assert_store_access(user, store_id)
    forced = None
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT s.StoreName, s.IsOpen, s.IsSuspended, s.IsDeleted, c.StartDate, c.EndDate
                FROM Store s LEFT JOIN StoreContract c ON c.StoreId = s.StoreId
                WHERE s.StoreId = %s FOR UPDATE OF s
                """,
                (store_id,),
            )
            store = cur.fetchone()
            if not store or store["IsDeleted"]:
                raise DomainError(404, "ไม่พบร้านค้า")
            state = contract_state(store["StartDate"], store["EndDate"])
            # ใช้สถานะ "เปิดจริง" (กดเปิดไว้ + สัญญามีผล) เป็นตัวตั้ง กดแล้วจึงตรงกับที่หน้าจอแสดง
            current = bool(store["IsOpen"]) and state == CONTRACT_ACTIVE
            if open is not None and bool(open) == current:
                return {"success": True, "is_open": current, "unchanged": True,
                        "message": "ร้านเปิดอยู่แล้ว" if current else "ร้านปิดอยู่แล้ว"}
            new_open = not current
            pending = []
            if new_open:
                if state == CONTRACT_EXPIRED:
                    raise DomainError(400, "สัญญาร้านหมดอายุแล้ว ไม่สามารถเปิดร้านได้")
                if state == CONTRACT_UPCOMING:
                    raise DomainError(400, f"สัญญาร้านเริ่มมีผลวันที่ {store['StartDate']} ยังเปิดร้านไม่ได้")
                if state == CONTRACT_NONE:
                    raise DomainError(400, "ร้านนี้ยังไม่มีสัญญา ไม่สามารถเปิดร้านได้")
                if not foodcourt_is_open(get_foodcourt(cur)):
                    raise DomainError(400, "ไม่สามารถเปิดร้านได้ เนื่องจากศูนย์อาหารปิดให้บริการ")
                if store["IsSuspended"]:
                    raise DomainError(400, "ร้านถูกระงับสิทธิ์ ไม่สามารถเปิดร้านได้")
            else:
                pending = open_orders(cur, store_id)
                if pending and user["RoleCode"] != "EXECUTIVE":
                    raise DomainError(400, f"ยังปิดร้านไม่ได้ เพราะมีออเดอร์ที่ยังไม่จบ {len(pending)} ออเดอร์ "
                                           f"({queue_summary(pending)}) กรุณาทำและส่งมอบให้ครบก่อน")
                if pending and not on_open_orders:
                    raise DomainError(409, f"ร้านนี้ยังมีออเดอร์ที่ยังไม่จบ {len(pending)} ออเดอร์ "
                                           f"({queue_summary(pending)}) กรุณาเลือกว่าจะให้ทำต่อจนเสร็จหรือยกเลิกทั้งหมด")
            cur.execute("UPDATE Store SET IsOpen = %s WHERE StoreId = %s", (new_open, store_id))
            if not new_open and pending and on_open_orders == "cancel":
                forced = force_cancel_open_orders(db, cur, store_id, user["UserId"],
                                                  "ร้านปิดให้บริการกะทันหัน (ผู้บริหารสั่งปิด)")
            # ผู้บริหารปิดร้านแทน : เจ้าของร้านต้องรู้ทันที (พร้อมบอกว่าออเดอร์ค้างจะเป็นอย่างไร)
            if not new_open and user["RoleCode"] == "EXECUTIVE":
                if pending:
                    notify_owners_closed_by_executive(db, pending, on_open_orders, "ผู้บริหารปิดร้านของคุณ")
                else:
                    notify_store_owners(db, store_id, "SYSTEM", "ร้านถูกปิดโดยผู้บริหาร",
                                        "ผู้บริหารปิดร้านของคุณ ร้านจะไม่รับออเดอร์ใหม่จนกว่าจะเปิดอีกครั้ง")
        detail = {"name": store["StoreName"]}
        if not new_open and pending:
            detail.update(open_orders=len(pending), on_open_orders=on_open_orders, **(forced or {}))
        log_audit(db, user["UserId"], "OPEN_STORE" if new_open else "CLOSE_STORE", "Store", store_id, None, detail)
    return {"success": True, "is_open": new_open, **({"forced": forced} if forced else {})}


@router.put("/{store_id}/suspend")
def suspend_store(store_id: int, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT s.StoreName, s.IsSuspended, c.StartDate, c.EndDate
                FROM Store s LEFT JOIN StoreContract c ON c.StoreId = s.StoreId
                WHERE s.StoreId = %s FOR UPDATE OF s
                """,
                (store_id,),
            )
            store = cur.fetchone()
            if not store:
                raise DomainError(404, "ไม่พบร้านค้า")
            if contract_state(store["StartDate"], store["EndDate"]) == CONTRACT_EXPIRED:
                raise DomainError(400, "ร้านนี้หมดสัญญาแล้ว ระงับ/ปลดระงับสิทธิ์ไม่ได้ (ร้านเปิดขายไม่ได้อยู่แล้ว)")
            suspended = not bool(store["IsSuspended"])
            if suspended:
                cur.execute("UPDATE Store SET IsSuspended = TRUE, IsOpen = FALSE WHERE StoreId = %s", (store_id,))
            else:
                cur.execute("UPDATE Store SET IsSuspended = FALSE WHERE StoreId = %s", (store_id,))
        log_audit(db, user["UserId"], "SUSPEND_STORE" if suspended else "UNSUSPEND_STORE", "Store", store_id,
                  {"suspended": not suspended}, {"suspended": suspended, "name": store["StoreName"]})
    return {"success": True, "is_suspended": suspended}


# ----------------------------------------------------------------- contract
_CONTRACT_ACTIONS = ("CREATE_STORE", "RENEW_CONTRACT", "CONTRACT_EXTEND", "CONTRACT_SHORTEN",
                     "CONTRACT_END_BACKDATED", "CONTRACT_RESTART", "AUTO_DELETE_STORE", "DELETE_STORE")


@router.put("/{store_id}/contract")
def update_contract_end(store_id: int, data: ContractEndUpdateSchema, user=Depends(require_role("EXECUTIVE")),
                        db=Depends(get_db)):
    """แก้วันสิ้นสุดสัญญาของร้านที่สัญญายังไม่หมด (ต่อ/ลดระยะ หลังทำเรื่องภายนอกแล้ว)

    - สัญญาหมดแล้ว แก้ไม่ได้ -> ต้องใช้ /contract/restart
    - แก้ให้จบย้อนหลังได้ไม่เกินเมื่อวาน = ร้านหมดสัญญาทันที ; ถ้ายังมีออเดอร์ค้าง ร้านเคลียร์ออเดอร์ต่อได้จนจบ
    - วันเดิม/วันใหม่/เหตุผล/ผู้แก้/เวลา/IP เก็บใน AuditLog ทุกครั้ง
    """
    new_end = parse_date(data.contract_end_date, "วันสิ้นสุดสัญญา")
    if not new_end:
        raise DomainError(400, "กรุณาระบุวันสิ้นสุดสัญญาใหม่")
    reason = clean_reason(data.reason)
    today = bangkok_now().date()
    with transaction(db):
        with db.cursor() as cur:
            row = _lock_store_contract(cur, store_id)
            start, old_end = row["StartDate"], row["EndDate"]
            old_state = contract_state(start, old_end, today)
            if old_state == CONTRACT_NONE:
                raise DomainError(400, "ร้านนี้ยังไม่มีสัญญา กรุณาใช้ปุ่ม \"กำหนดสัญญา\"")
            if old_state == CONTRACT_EXPIRED:
                raise DomainError(400, "สัญญาร้านนี้หมดแล้ว แก้วันสิ้นสุดไม่ได้ กรุณากดปุ่ม \"หมดสัญญา\" เพื่อเปิดสัญญารอบใหม่")
            if new_end == old_end:
                raise DomainError(400, "วันสิ้นสุดใหม่ซ้ำกับวันเดิม")
            if new_end <= start:
                raise DomainError(400, f"วันสิ้นสุดสัญญาต้องหลังวันเริ่มสัญญา ({start.isoformat()})")
            yesterday = today - timedelta(days=1)
            if new_end < yesterday:
                # ย้อนไกลกว่านี้ = เจ้าของเสียสิทธิ์ดูย้อนหลัง/ร้านโดนลบอัตโนมัติเร็วกว่าที่ควร
                raise DomainError(400, f"ตัดสัญญาย้อนหลังได้ไม่เกินเมื่อวาน ({yesterday.isoformat()})")
            backdated = new_end < today
            pending = open_order_count(cur, store_id) if backdated else 0
            if backdated:
                cur.execute("UPDATE Store SET IsOpen = FALSE WHERE StoreId = %s", (store_id,))
            cur.execute("UPDATE StoreContract SET EndDate = %s WHERE StoreId = %s", (new_end, store_id))
        action = "CONTRACT_END_BACKDATED" if backdated else ("CONTRACT_EXTEND" if new_end > old_end else "CONTRACT_SHORTEN")
        log_audit(db, user["UserId"], action, "Store", store_id,
                  {"start": start, "end": old_end, "state": old_state},
                  {"start": start, "end": new_end, "state": contract_state(start, new_end, today),
                   "reason": reason, "name": row["StoreName"], "open_orders": pending})
    if not backdated:
        message = "แก้ไขวันสิ้นสุดสัญญาเรียบร้อยแล้ว"
    elif pending:
        message = (f"ตัดสัญญาเรียบร้อยแล้ว ร้านปิดรับออเดอร์ใหม่ทันที · ยังมีออเดอร์ค้าง {pending} รายการ "
                   "ร้านยังเคลียร์ออเดอร์ได้ เมื่อจบครบระบบจะออกจากระบบบัญชีพนักงานให้เอง")
    else:
        message = "ตัดสัญญาเรียบร้อยแล้ว ร้านหมดสัญญาทันที บัญชีพนักงานถูกออกจากระบบ"
    return {"success": True, "message": message, "open_orders": pending,
            "contract_start_date": start.isoformat(), "contract_end_date": new_end.isoformat(),
            "contract_state": contract_state(start, new_end, today)}


@router.post("/{store_id}/contract/restart")
def restart_contract(store_id: int, data: ContractRestartSchema, user=Depends(require_role("EXECUTIVE")),
                     db=Depends(get_db)):
    """ปุ่ม "หมดสัญญา" : ร้านที่หมดสัญญา (หรือยังไม่มีสัญญา) เปิดสัญญารอบใหม่
    วันเริ่ม = ที่เลือก (ไม่ส่ง = วันนี้ ; ห้ามย้อนหลัง) ; วันสิ้นสุด = ที่เลือก (ไม่ส่ง = 1 ปีนับจากวันเริ่ม)"""
    reason = clean_reason(data.reason)
    today = bangkok_now().date()
    start = parse_date(data.contract_start_date, "วันเริ่มสัญญา") or today
    if start < today:
        raise DomainError(400, "วันเริ่มสัญญารอบใหม่ต้องไม่ใช่วันที่ผ่านมาแล้ว")
    end = parse_date(data.contract_end_date, "วันสิ้นสุดสัญญา") or add_years_minus_one_day(start)
    if end <= start:
        raise DomainError(400, "วันสิ้นสุดสัญญาต้องหลังวันเริ่มสัญญา")
    with transaction(db):
        with db.cursor() as cur:
            row = _lock_store_contract(cur, store_id)
            old_state = contract_state(row["StartDate"], row["EndDate"], today)
            if old_state not in (CONTRACT_EXPIRED, CONTRACT_NONE):
                raise DomainError(400, "สัญญาร้านนี้ยังไม่หมด ให้ใช้ \"แก้วันสิ้นสุด\" แทน")
            _upsert_contract(cur, store_id, start, end, user["UserId"])
            # เริ่มรอบใหม่แบบปิดร้านไว้ก่อน เจ้าของร้านล็อกอินแล้วกดเปิดเอง (เปิดได้เมื่อถึงวันเริ่ม)
            cur.execute("UPDATE Store SET IsOpen = FALSE WHERE StoreId = %s", (store_id,))
        new_state = contract_state(start, end, today)
        log_audit(db, user["UserId"], "CONTRACT_RESTART", "Store", store_id,
                  {"start": row["StartDate"], "end": row["EndDate"], "state": old_state},
                  {"start": start, "end": end, "state": new_state, "reason": reason, "name": row["StoreName"]})
    return {"success": True, "message": f"เปิดสัญญารอบใหม่ให้ร้าน {row['StoreName']} เรียบร้อยแล้ว",
            "contract_start_date": start.isoformat(), "contract_end_date": end.isoformat(),
            "contract_state": new_state}


def _json_value(value):
    if value is None or isinstance(value, dict):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


@router.get("/{store_id}/contract-history")
def get_contract_history(store_id: int, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    """ประวัติการกำหนด/แก้สัญญาของร้าน (อ่านจาก AuditLog ซึ่งไม่ถูกแก้/ลบ)"""
    placeholders = ",".join(["%s"] * len(_CONTRACT_ACTIONS))
    with db.cursor() as cur:
        cur.execute(
            f"""
            SELECT a.AuditLogId, a.ActionCode, a.OldValue, a.NewValue, a.CreatedAt,
                   u.FullName AS PerformedByName, u.Username AS PerformedByUsername
            FROM AuditLog a LEFT JOIN `User` u ON u.UserId = a.PerformedBy
            WHERE a.EntityType = 'Store' AND a.EntityId = %s AND a.ActionCode IN ({placeholders})
            ORDER BY a.AuditLogId DESC LIMIT 100
            """,
            [str(store_id), *_CONTRACT_ACTIONS],
        )
        rows = cur.fetchall()
    for r in rows:
        r["OldValue"] = _json_value(r["OldValue"])
        r["NewValue"] = _json_value(r["NewValue"])
    return rows
