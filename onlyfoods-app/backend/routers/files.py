"""ไฟล์ที่ต้องเช็คสิทธิ์ก่อนเปิด (L25): สลิปโอนเงิน และ QR/สลิปของการคืนเงิน

รูปเมนู/ร้าน/โปรไฟล์/รีวิว ยังเปิดสาธารณะที่ /uploads/<folder>/ เหมือนเดิม (main.py)
ส่วน /uploads/slips และ /uploads/refunds ไม่เปิดตรงแล้ว ต้องขอผ่าน GET /api/files/<folder>/<ชื่อไฟล์> พร้อม token :
  - สลิปชำระเงิน      : ลูกค้าเจ้าของบิล, หน้าร้าน/เจ้าของร้านนั้น, ฝ่ายบัญชี, ผู้บริหาร
  - QR รับเงินคืน      : ลูกค้าเจ้าของรายการ, เจ้าของร้านนั้น (คนโอน) — เป็นข้อมูลบัญชีของลูกค้า จึงไม่เปิดให้คนอื่น
  - สลิปโอนเงินคืน     : ลูกค้าเจ้าของรายการ, หน้าร้าน/เจ้าของร้านนั้น, ฝ่ายบัญชี, ผู้บริหาร
ไม่พบหรือไม่มีสิทธิ์ตอบ 404 เหมือนกัน (ไม่บอกว่ามีไฟล์นี้อยู่)
"""
import os
import re

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

import config
from auth import get_current_user
from db import get_db
from errors import DomainError

router = APIRouter(prefix="/api/files", tags=["files"])

PROTECTED_FOLDERS = ("slips", "refunds")
_NAME = re.compile(r"^[0-9a-f]{32}\.(png|jpe?g|webp)$")
_STORE_STAFF = ("FRONT_STAFF", "STORE_OWNER")
_FINANCE = ("ACCOUNTANT", "EXECUTIVE")


def _not_found() -> DomainError:
    return DomainError(404, "ไม่พบไฟล์")


def _allowed(user: dict, customer_id, store_id, staff_roles, other_roles) -> bool:
    role = user["RoleCode"]
    if role == "CUSTOMER":
        return customer_id is not None and int(customer_id) == int(user["UserId"])
    if role in staff_roles:
        return user.get("StoreId") is not None and int(user["StoreId"]) == int(store_id)
    return role in other_roles


def _can_open(cur, user: dict, folder: str, path: str) -> bool:
    if folder == "slips":
        cur.execute(
            "SELECT o.CustomerId, o.StoreId FROM Payment p JOIN `Order` o ON o.OrderId = p.OrderId "
            "WHERE p.SlipImageUrl = %s LIMIT 1",
            (path,),
        )
        row = cur.fetchone()
        return bool(row) and _allowed(user, row["CustomerId"], row["StoreId"], _STORE_STAFF, _FINANCE)
    # refunds : QR ของลูกค้า หรือ สลิปที่ร้านโอนคืน
    cur.execute(
        """
        SELECT o.CustomerId, o.StoreId, (rf.PayoutQrUrl = %s) AS IsQr
        FROM Refund rf JOIN Payment p ON p.PaymentId = rf.PaymentId JOIN `Order` o ON o.OrderId = p.OrderId
        WHERE rf.PayoutQrUrl = %s OR rf.TransferSlipUrl = %s LIMIT 1
        """,
        (path, path, path),
    )
    row = cur.fetchone()
    if not row:
        return False
    if row["IsQr"]:
        return _allowed(user, row["CustomerId"], row["StoreId"], ("STORE_OWNER",), ())
    return _allowed(user, row["CustomerId"], row["StoreId"], _STORE_STAFF, _FINANCE)


@router.get("/{folder}/{name}")
def get_protected_file(folder: str, name: str, user=Depends(get_current_user), db=Depends(get_db)):
    if folder not in PROTECTED_FOLDERS or not _NAME.match(name):
        raise _not_found()
    with db.cursor() as cur:
        if not _can_open(cur, user, folder, f"/uploads/{folder}/{name}"):
            raise _not_found()
    full = os.path.join(config.UPLOAD_DIR, folder, name)
    if not os.path.isfile(full):
        raise _not_found()
    # หน้าจอเก็บรูปไว้ในหน่วยความจำเอง (ไม่โหลดซ้ำทุกรอบ polling) ; ห้าม proxy/CDN กลางเก็บ
    return FileResponse(full, headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
