import os
import random
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pymysql
from pymysql.cursors import DictCursor

app = FastAPI(title="Only Foods Engine Pro")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    conn = pymysql.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", "root"),
        db=os.getenv("DB_NAME", "onlyfoods_db"),
        cursorclass=DictCursor,
        autocommit=False
    )
    try:
        yield conn
    finally:
        conn.close()

def log_audit(db, action: str, performed_by: str, details: str):
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO AuditLog (Action, PerformedBy, Details) VALUES (%s, %s, %s)",
            (action, performed_by, details)
        )

def send_notif(db, user_id: int, msg: str):
    if user_id:
        with db.cursor() as cur:
            cur.execute(
                "INSERT INTO Notifications (UserId, Message) VALUES (%s, %s)",
                (user_id, msg)
            )

class LoginSchema(BaseModel):
    username: str
    password: str

class OrderItemSchema(BaseModel):
    product_id: int
    qty: int
    unit_price: float
    item_note: Optional[str] = ""

class CreateOrderSchema(BaseModel):
    store_id: int
    user_id: Optional[int] = None
    items: List[OrderItemSchema]
    note: Optional[str] = ""
    is_walk_in: Optional[bool] = False
    slip_url: Optional[str] = None

class VerifySlipSchema(BaseModel):
    approved: bool
    reason: Optional[str] = ""

class StatusUpdateSchema(BaseModel):
    status: str
    user_role: str
    cancel_reason: Optional[str] = None

# เพิ่ม
class StoreCreateSchema(BaseModel):
    store_name: str

class StoreUpdateSchema(BaseModel):
    store_name: str

@app.post("/api/login")
def login(data: LoginSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM Users WHERE Username=%s AND Password=%s", (data.username, data.password))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
        return user

@app.get("/api/notifications/{user_id}")
def get_notifs(user_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM Notifications WHERE UserId=%s ORDER BY NotifId DESC LIMIT 15", (user_id,))
        return cur.fetchall()

@app.get("/api/stores")
def get_stores(db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM Store")
        return cur.fetchall()

# เพิ่ม
@app.post("/api/stores", status_code=201)
def create_store(data: StoreCreateSchema, db=Depends(get_db)):
    store_name = data.store_name.strip()
    if not store_name:
        raise HTTPException(status_code=400, detail="กรุณากรอกชื่อร้านค้า")

    try:
        with db.cursor() as cur:
            cur.execute(
                "SELECT StoreId FROM Store WHERE StoreName = %s",
                (store_name,)
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="มีชื่อร้านค้านี้อยู่แล้ว"
                )

            cur.execute("""
                INSERT INTO Store (StoreName, IsOpen, IsSuspended)
                VALUES (%s, 1, 0)
            """, (store_name,))
            store_id = cur.lastrowid
            db.commit()

            return {
                "success": True,
                "store_id": store_id,
                "message": "เพิ่มร้านค้าเรียบร้อยแล้ว"
            }
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(error))

@app.put("/api/stores/{store_id}")
def update_store(
    store_id: int,
    data: StoreUpdateSchema,
    db=Depends(get_db)
):
    store_name = data.store_name.strip()
    if not store_name:
        raise HTTPException(status_code=400, detail="กรุณากรอกชื่อร้านค้า")

    try:
        with db.cursor() as cur:
            cur.execute(
                "SELECT StoreId FROM Store WHERE StoreId = %s",
                (store_id,)
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="ไม่พบร้านค้า")

            cur.execute("""
                SELECT StoreId FROM Store
                WHERE StoreName = %s AND StoreId != %s
            """, (store_name, store_id))
            if cur.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="มีชื่อร้านค้านี้อยู่แล้ว"
                )

            cur.execute("""
                UPDATE Store
                SET StoreName = %s
                WHERE StoreId = %s
            """, (store_name, store_id))
            db.commit()

            return {
                "success": True,
                "message": "แก้ไขชื่อร้านเรียบร้อยแล้ว"
            }
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(error))

@app.post("/api/orders")
def create_order(data: CreateOrderSchema, db=Depends(get_db)):
    try:
        with db.cursor() as cur:
            # --- 1. เช็คสถานะศูนย์อาหารก่อนเป็นอันดับแรก ---
            cur.execute("SELECT IsOpen FROM FoodCourtSetting WHERE SettingId = 1")
            fc_status = cur.fetchone()
            if fc_status and int(fc_status['IsOpen']) == 0:
                raise HTTPException(status_code=400, detail="ศูนย์อาหารปิดให้บริการชั่วคราว ไม่สามารถสั่งอาหารได้")

            # --- 2. ค่อยเช็คสถานะรายร้านค้า ---
            cur.execute("SELECT IsOpen, IsSuspended, StoreName FROM Store WHERE StoreId=%s", (data.store_id,))
            st = cur.fetchone()
            if not st:
                raise HTTPException(status_code=404, detail="ไม่พบร้านค้านี้")
            if st['IsSuspended']:
                raise HTTPException(status_code=400, detail=f"ร้าน '{st['StoreName']}' ถูกระงับสิทธิ์การจำหน่ายชั่วคราว")
            if not st['IsOpen']:
                raise HTTPException(status_code=400, detail=f"ร้าน '{st['StoreName']}' ปิดทำการอยู่ขณะนี้")

            total = 0.0
            validated_items = []
            for item in data.items:
                cur.execute("SELECT ProductId, UnitPrice, IsOutOfStock FROM Product WHERE ProductId=%s AND StoreId=%s", (item.product_id, data.store_id))
                prod = cur.fetchone()
                if not prod:
                    raise HTTPException(status_code=400, detail=f"ไม่พบสินค้า ID {item.product_id} ในร้านนี้")
                if prod['IsOutOfStock']:
                    raise HTTPException(status_code=400, detail=f"สินค้า ID {item.product_id} หมด")
                
                real_price = float(prod['UnitPrice'])
                total += item.qty * real_price
                validated_items.append((item.product_id, item.qty, real_price, item.item_note))

            queue_no = f"OF-{random.randint(100, 999)}"
            initial_status = 'Pending' if data.is_walk_in else 'Verifying_Slip'
            
            cur.execute(
                "INSERT INTO `Order` (StoreId, UserId, QueueNo, TotalAmount, Status, Note, IsWalkIn, SlipUrl) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (data.store_id, data.user_id, queue_no, total, initial_status, data.note, 1 if data.is_walk_in else 0, data.slip_url)
            )
            order_id = cur.lastrowid

            for pid, qty, price, note in validated_items:
                cur.execute(
                    "INSERT INTO OrderDetail (OrderID, ProductId, Qty, UnitPrice, ItemNote) VALUES (%s, %s, %s, %s, %s)",
                    (order_id, pid, qty, price, note)
                )
            
            if data.user_id:
                pts_earned = int(total // 10)
                cur.execute("UPDATE Users SET Points = Points + %s WHERE UserId = %s", (pts_earned, data.user_id))
                send_notif(db, data.user_id, f"สั่งซื้อคิว {queue_no} สำเร็จ! (ได้รับ {pts_earned} แต้ม)")
                
            log_audit(db, "CREATE_ORDER", f"User:{data.user_id or 'WalkIn'}", f"คิว {queue_no} ยอด {total}B ร้าน ID:{data.store_id}")
            
            db.commit()
            return {"success": True, "order_id": order_id, "queue_no": queue_no, "total": total}

    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/orders/{order_id}/verify-slip")
def verify_slip(order_id: int, payload: VerifySlipSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM `Order` WHERE OrderID=%s", (order_id,))
        ord_data = cur.fetchone()
        if not ord_data: 
            raise HTTPException(status_code=404, detail="ไม่พบคำสั่งซื้อ")
        
        if payload.approved:
            cur.execute("UPDATE `Order` SET Status='Pending' WHERE OrderID=%s", (order_id,))
            send_notif(db, ord_data['UserId'], f"✅ สลิปการชำระเงินคิว {ord_data['QueueNo']} ได้รับการยืนยันแล้ว")
            log_audit(db, "VERIFY_SLIP_APPROVE", "Staff/Owner", f"อนุมัติสลิป Order ID:{order_id}")
        else:
            cur.execute("UPDATE `Order` SET Status='Cancelled', CancelReason=%s WHERE OrderID=%s", (payload.reason or 'สลิปไม่ถูกต้อง', order_id))
            send_notif(db, ord_data['UserId'], f"❌ สลิปคิว {ord_data['QueueNo']} ถูกปฏิเสธ: {payload.reason}")
            log_audit(db, "VERIFY_SLIP_REJECT", "Staff/Owner", f"ปฏิเสธสลิป Order ID:{order_id} เหตุผล: {payload.reason}")
        
        db.commit()
        return {"success": True}

@app.get("/api/orders")
def get_orders(store_id: Optional[int] = None, user_id: Optional[int] = None, db=Depends(get_db)):
    with db.cursor() as cur:
        query = "SELECT o.*, s.StoreName FROM `Order` o JOIN Store s ON o.StoreId = s.StoreId WHERE 1=1"
        params = []
        if store_id:
            query += " AND o.StoreId = %s"
            params.append(store_id)
        if user_id:
            query += " AND o.UserId = %s"
            params.append(user_id)
        query += " ORDER BY o.OrderID DESC"
        cur.execute(query, params)
        orders = cur.fetchall()
        for o in orders:
            cur.execute("SELECT od.*, p.ProductName FROM OrderDetail od JOIN Product p ON od.ProductId = p.ProductId WHERE od.OrderID = %s", (o['OrderID'],))
            o['items'] = cur.fetchall()
        return orders

@app.get("/api/orders/kitchen-summary")
def get_kitchen_summary(store_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT p.ProductName, SUM(od.Qty) as TotalQty
            FROM OrderDetail od
            JOIN `Order` o ON od.OrderID = o.OrderID
            JOIN Product p ON od.ProductId = p.ProductId
            WHERE o.StoreId = %s AND o.Status IN ('Pending', 'Cooking')
            GROUP BY p.ProductName
        """, (store_id,))
        return cur.fetchall()

@app.put("/api/orders/{order_id}/status")
def update_status(order_id: int, payload: StatusUpdateSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("UPDATE `Order` SET Status=%s, CancelReason=%s WHERE OrderID=%s", (payload.status, payload.cancel_reason, order_id))
        cur.execute("SELECT UserId, QueueNo FROM `Order` WHERE OrderID=%s", (order_id,))
        o = cur.fetchone()
        if o and o['UserId']:
            status_map = {'Cooking': 'กำลังปรุงอาหาร', 'Ready': 'อาหารพร้อมรับแล้ว!', 'Completed': 'รับอาหารเรียบร้อย', 'Cancelled': f'ถูกยกเลิก: {payload.cancel_reason}'}
            send_notif(db, o['UserId'], f"🔔 ออเดอร์คิว {o['QueueNo']} {status_map.get(payload.status, payload.status)}")
        log_audit(db, "UPDATE_STATUS", payload.user_role, f"Order {order_id} -> {payload.status}")
        db.commit()
        return {"success": True}

@app.get("/api/products")
def get_products(store_id: Optional[int] = None, db=Depends(get_db)):
    with db.cursor() as cur:
        if store_id: 
            cur.execute("SELECT * FROM Product WHERE StoreId = %s", (store_id,))
        else: 
            cur.execute("SELECT p.*, s.StoreName FROM Product p JOIN Store s ON p.StoreId = s.StoreId")
        return cur.fetchall()

@app.put("/api/products/{product_id}/toggle-stock")
def toggle_stock(product_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("UPDATE Product SET IsOutOfStock = NOT IsOutOfStock WHERE ProductId = %s", (product_id,))
        db.commit()
        return {"success": True}

@app.put("/api/stores/{store_id}/toggle")
def toggle_store(store_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("UPDATE Store SET IsOpen = NOT IsOpen WHERE StoreId = %s", (store_id,))
        db.commit()
        return {"success": True}

@app.put("/api/stores/{store_id}/suspend")
def suspend_store(store_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("UPDATE Store SET IsSuspended = NOT IsSuspended WHERE StoreId = %s", (store_id,))
        log_audit(db, "SUSPEND_STORE", "Executive", f"เปลี่ยนสถานะระงับสิทธิ์ร้านค้า ID: {store_id}")
        db.commit()
        return {"success": True}

def ensure_food_court_setting(db):
    with db.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS FoodCourtSetting (
                SettingId TINYINT PRIMARY KEY,
                IsOpen TINYINT(1) NOT NULL DEFAULT 1,
                UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        cur.execute("""
            INSERT IGNORE INTO FoodCourtSetting (SettingId, IsOpen)
            VALUES (1, 1)
        """)
    db.commit()

@app.get("/api/food-court/status")
def get_food_court_status(db=Depends(get_db)):
    ensure_food_court_setting(db)
    with db.cursor() as cur:
        cur.execute("""
            SELECT IsOpen FROM FoodCourtSetting WHERE SettingId = 1
        """)
        result = cur.fetchone()
        return {"is_open": bool(result["IsOpen"])}

@app.put("/api/food-court/toggle")
def toggle_food_court(db=Depends(get_db)):
    ensure_food_court_setting(db)
    try:
        with db.cursor() as cur:
            cur.execute("""
                UPDATE FoodCourtSetting
                SET IsOpen = NOT IsOpen
                WHERE SettingId = 1
            """)
            cur.execute("""
                SELECT IsOpen FROM FoodCourtSetting WHERE SettingId = 1
            """)
            result = cur.fetchone()
            is_open = bool(result["IsOpen"])
            db.commit()

            return {
                "success": True,
                "is_open": is_open,
                "message": (
                    "เปิดศูนย์อาหารเรียบร้อยแล้ว"
                    if is_open
                    else "ปิดศูนย์อาหารเรียบร้อยแล้ว"
                )
            }
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(error))

@app.get("/api/reports/dashboard")
def get_dashboard(store_id: Optional[int] = None, db=Depends(get_db)):
    with db.cursor() as cur:
        q = "SELECT s.StoreId, s.StoreName, s.IsOpen, s.IsSuspended, COUNT(o.OrderID) as total_orders, IFNULL(SUM(o.TotalAmount), 0) as net_sales FROM Store s LEFT JOIN `Order` o ON s.StoreId = o.StoreId AND o.Status = 'Completed'"
        params = []
        if store_id: 
            q += " WHERE s.StoreId = %s"
            params.append(store_id)
        q += " GROUP BY s.StoreId, s.StoreName, s.IsOpen, s.IsSuspended"
        cur.execute(q, params)
        return cur.fetchall()

@app.get("/api/reports/cancellations")
def get_cancellations(store_id: Optional[int] = None, db=Depends(get_db)):
    with db.cursor() as cur:
        q = "SELECT o.*, s.StoreName FROM `Order` o JOIN Store s ON o.StoreId = s.StoreId WHERE o.Status = 'Cancelled'"
        params = []
        if store_id: 
            q += " AND o.StoreId = %s"
            params.append(store_id)
        q += " ORDER BY o.OrderID DESC"
        cur.execute(q, params)
        return cur.fetchall()

@app.get("/api/audit-logs")
def get_logs(db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM AuditLog ORDER BY LogID DESC LIMIT 50")
        return cur.fetchall()