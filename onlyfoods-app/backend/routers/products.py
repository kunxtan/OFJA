"""เมนูอาหาร"""
from datetime import timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends

from auth import assert_store_access, require_role
from db import get_db, transaction
from errors import DomainError
from schemas import NotifyOutStockSchema, ProductCreateSchema, ProductUpdateSchema
from services import do_transition, lock_order, log_audit, notify_menu_out_of_stock, send_notif
import state
from utils import bangkok_now, clean_text, queue_label, save_image

router = APIRouter(prefix="/api/products", tags=["products"])

_PRODUCT_COLS = """
    p.ProductId, p.StoreId, p.CategoryId, p.ProductName, p.Description, p.UnitPrice,
    p.ImageUrl, p.ImageUrl AS img, p.IsOutOfStock, p.CreatedAt, p.UpdatedAt
"""


@router.get("")
def get_products(store_id: Optional[int] = None, db=Depends(get_db)):
    """เมนูที่ยังไม่ถูกลบ (เปิดสาธารณะ: ลูกค้าดูเมนูก่อนล็อกอินได้)"""
    with db.cursor() as cur:
        if store_id:
            cur.execute(
                f"SELECT {_PRODUCT_COLS} FROM Product p WHERE p.StoreId = %s AND p.IsDeleted = FALSE ORDER BY p.ProductId",
                (store_id,),
            )
        else:
            cur.execute(
                f"""
                SELECT {_PRODUCT_COLS}, s.StoreName
                FROM Product p JOIN Store s ON s.StoreId = p.StoreId
                WHERE p.IsDeleted = FALSE AND s.IsDeleted = FALSE ORDER BY p.ProductId
                """
            )
        return cur.fetchall()


def _product_for_update(cur, product_id: int) -> dict:
    cur.execute(
        "SELECT ProductId, StoreId, ProductName, UnitPrice, IsOutOfStock, IsDeleted FROM Product WHERE ProductId = %s FOR UPDATE",
        (product_id,),
    )
    row = cur.fetchone()
    if not row or row["IsDeleted"]:
        raise DomainError(404, "ไม่พบเมนูนี้")
    return row


@router.post("", status_code=201)
def add_product(data: ProductCreateSchema, user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    assert_store_access(user, data.StoreId)
    name = data.ProductName.strip()
    if not name:
        raise DomainError(400, "กรุณากรอกชื่อเมนู")
    img = save_image(data.img, "products") if data.img else None
    price = Decimal(str(data.UnitPrice))
    description = clean_text(data.Description)
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT 1 FROM Store WHERE StoreId = %s AND IsDeleted = FALSE", (data.StoreId,))
            if not cur.fetchone():
                raise DomainError(404, "ไม่พบร้านค้า")
            cur.execute("SELECT ProductId, IsDeleted FROM Product WHERE StoreId = %s AND ProductName = %s FOR UPDATE",
                        (data.StoreId, name))
            existing = cur.fetchone()
            if existing and not existing["IsDeleted"]:
                raise DomainError(400, "มีเมนูชื่อนี้ในร้านอยู่แล้ว")
            if existing:  # เมนูที่เคยลบไว้ (soft delete) -> นำกลับมาใช้ใหม่ เพราะ (StoreId, ProductName) ต้องไม่ซ้ำ
                product_id = existing["ProductId"]
                cur.execute(
                    "UPDATE Product SET Description = %s, UnitPrice = %s, ImageUrl = %s, IsOutOfStock = %s, "
                    "IsDeleted = FALSE WHERE ProductId = %s",
                    (description, price, img, bool(data.IsOutOfStock), product_id),
                )
            else:
                cur.execute(
                    "INSERT INTO Product (StoreId, ProductName, Description, UnitPrice, IsOutOfStock, ImageUrl) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (data.StoreId, name, description, price, bool(data.IsOutOfStock), img),
                )
                product_id = cur.lastrowid
        log_audit(db, user["UserId"], "CREATE_PRODUCT", "Product", product_id, None,
                  {"name": name, "price": price, "store_id": data.StoreId})
    return {"success": True, "product_id": product_id, "message": "เพิ่มเมนูสำเร็จ"}


@router.put("/{product_id}")
def edit_product(product_id: int, data: ProductUpdateSchema,
                 user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    name = data.ProductName.strip()
    if not name:
        raise DomainError(400, "กรุณากรอกชื่อเมนู")
    price = Decimal(str(data.UnitPrice))
    img = save_image(data.img, "products") if data.img else None
    with transaction(db):
        with db.cursor() as cur:
            prod = _product_for_update(cur, product_id)
            assert_store_access(user, prod["StoreId"])
            cur.execute("SELECT 1 FROM Product WHERE StoreId = %s AND ProductName = %s AND ProductId <> %s",
                        (prod["StoreId"], name, product_id))
            if cur.fetchone():
                raise DomainError(400, "มีเมนูชื่อนี้ในร้านอยู่แล้ว")
            if data.Description is None:  # ไม่ได้ส่งรายละเอียดมา -> คงค่าเดิม
                cur.execute(
                    "UPDATE Product SET ProductName = %s, UnitPrice = %s, ImageUrl = COALESCE(%s, ImageUrl) WHERE ProductId = %s",
                    (name, price, img, product_id),
                )
            else:
                cur.execute(
                    "UPDATE Product SET ProductName = %s, Description = %s, UnitPrice = %s, "
                    "ImageUrl = COALESCE(%s, ImageUrl) WHERE ProductId = %s",
                    (name, clean_text(data.Description), price, img, product_id),
                )
        if Decimal(prod["UnitPrice"]) != price:
            log_audit(db, user["UserId"], "PRICE_UPDATE", "Product", product_id,
                      {"price": prod["UnitPrice"]}, {"price": price, "name": name})
        else:
            log_audit(db, user["UserId"], "UPDATE_PRODUCT", "Product", product_id, None, {"name": name})
    return {"success": True, "message": "แก้ไขเมนูสำเร็จ"}


@router.delete("/{product_id}")
def delete_product(product_id: int, user=Depends(require_role("STORE_OWNER", "EXECUTIVE")), db=Depends(get_db)):
    """soft delete: ออเดอร์เก่าที่อ้างอิงเมนูนี้ต้องยังอ่านได้"""
    with transaction(db):
        with db.cursor() as cur:
            prod = _product_for_update(cur, product_id)
            assert_store_access(user, prod["StoreId"])
            cur.execute("UPDATE Product SET IsDeleted = TRUE WHERE ProductId = %s", (product_id,))
        log_audit(db, user["UserId"], "DELETE_PRODUCT", "Product", product_id, {"name": prod["ProductName"]}, None)
    return {"success": True, "message": "ลบเมนูสำเร็จ"}


@router.put("/{product_id}/toggle-stock")
def toggle_stock(product_id: int, out_of_stock: Optional[bool] = None,
                 user=Depends(require_role("FRONT_STAFF", "KITCHEN_STAFF", "STORE_OWNER")), db=Depends(get_db)):
    """out_of_stock=true/false = ตั้งเป็นสถานะนั้น (ถ้าเป็นอยู่แล้วไม่ทำอะไร กันกดซ้ำจากหน้าจอเก่าแล้วกลับด้าน) ;
    ไม่ส่ง = สลับ (client เดิม)"""
    with transaction(db):
        with db.cursor() as cur:
            prod = _product_for_update(cur, product_id)
            assert_store_access(user, prod["StoreId"])
            if out_of_stock is not None and bool(out_of_stock) == bool(prod["IsOutOfStock"]):
                return {"success": True, "is_out_of_stock": bool(prod["IsOutOfStock"]), "unchanged": True}
            out_of_stock = not bool(prod["IsOutOfStock"])
            cur.execute("UPDATE Product SET IsOutOfStock = %s WHERE ProductId = %s", (out_of_stock, product_id))
            if out_of_stock:
                notify_menu_out_of_stock(db, prod["StoreId"], prod["ProductName"], user["RoleCode"])
        log_audit(db, user["UserId"], "OUT_OF_STOCK" if out_of_stock else "BACK_IN_STOCK", "Product", product_id,
                  None, {"name": prod["ProductName"]})
    return {"success": True, "is_out_of_stock": out_of_stock}


@router.post("/{product_id}/notify-out-of-stock")
def notify_out_of_stock(product_id: int, payload: NotifyOutStockSchema,
                        user=Depends(require_role("FRONT_STAFF", "STORE_OWNER")), db=Depends(get_db)):
    """เมนูหมด: ออเดอร์ที่ยังไม่เริ่มส่งมอบ (PENDING/COOKING) -> PENDING_CANCELLATION ให้ลูกค้าเลือกเปลี่ยนเมนูหรือยกเลิก"""
    now = bangkok_now()
    deadline = now + timedelta(minutes=payload.response_window_minutes)
    with transaction(db):
        with db.cursor() as cur:
            prod = _product_for_update(cur, product_id)
            assert_store_access(user, prod["StoreId"])
            cur.execute(
                """
                SELECT DISTINCT o.OrderId
                FROM `Order` o
                JOIN OrderStatus os ON os.StatusId = o.StatusId
                JOIN OrderItem oi ON oi.OrderId = o.OrderId
                WHERE oi.ProductId = %s AND oi.ItemStatus = 'NORMAL' AND o.StoreId = %s
                  AND os.StatusCode IN ('PENDING', 'COOKING')
                  AND o.CustomerId IS NOT NULL  -- walk-in: พนักงานคุยกับลูกค้าหน้าร้านแล้วกดยกเลิกเอง
                ORDER BY o.OrderId
                """,
                (product_id, prod["StoreId"]),
            )
            ids = [r["OrderId"] for r in cur.fetchall()]
            reason = f"วัตถุดิบหมด: {prod['ProductName']}"
            for oid in ids:
                order = lock_order(cur, oid)
                if order["StatusCode"] not in (state.PENDING, state.COOKING):
                    continue  # สถานะเปลี่ยนไประหว่างรอล็อก
                cur.execute(
                    "UPDATE OrderItem SET ItemStatus = 'OUT_OF_STOCK' WHERE OrderId = %s AND ProductId = %s AND ItemStatus = 'NORMAL'",
                    (oid, product_id),
                )
                do_transition(cur, order, state.PENDING_CANCELLATION, actor_id=user["UserId"], reason=reason,
                              cancel_reason=reason, cancel_deadline=deadline, now=now)
                send_notif(db, order["CustomerId"], "ORDER_STATUS", f"คิว {queue_label(order['QueueNo'], order['QueueCode'])} เมนูหมด",
                           f"⚠️ คิว {queue_label(order['QueueNo'], order['QueueCode'])} สินค้า {prod['ProductName']} หมด! "
                           f"กรุณาเปลี่ยนเมนูหรือกดยกเลิกรับเงินคืนภายใน {payload.response_window_minutes} นาที "
                           f"หากเลยเวลา ระบบจะยกเลิกให้อัตโนมัติ", oid)
        log_audit(db, user["UserId"], "OUT_OF_STOCK_NOTIFY", "Product", product_id, None,
                  {"orders": len(ids), "name": prod["ProductName"]})
    return {"success": True, "notified_count": len(ids)}
