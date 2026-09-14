import os
import random
from datetime import datetime, timedelta
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
    try:
        with db.cursor() as cur:
            cur.execute("INSERT INTO AuditLog (Action, PerformedBy, Details) VALUES (%s, %s, %s)", (action, performed_by, details))
    except Exception as e:
        print(f"AuditLog warning: {e}")

def send_notif(db, user_id: int, msg: str):
    if user_id:
        try:
            with db.cursor() as cur:
                cur.execute("INSERT INTO Notifications (UserId, Message) VALUES (%s, %s)", (user_id, msg))
        except Exception:
            pass

# =====================================================================
# Request Schemas
# =====================================================================
class LoginSchema(BaseModel):
    username: str
    password: str

class RegisterSchema(BaseModel):
    username: str
    password: str
    name: str

class GoogleAuthSchema(BaseModel):
    google_id: str
    email: str
    name: str

class CompleteProfileSchema(BaseModel):
    user_id: int
    full_name: str
    phone: str
    profile_img: Optional[str] = None

class StaffCreateSchema(BaseModel):
    username: str
    password: str
    fullName: str
    role: str

class AccountCreateSchema(BaseModel):
    username: str
    password: str
    full_name: str
    role: str
    store_id: int
    performed_by: Optional[str] = "Executive"

class AccountUpdateSchema(BaseModel):
    password: str
    full_name: str
    role: str
    store_id: int
    performed_by: Optional[str] = "Executive"

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
    payment_method: Optional[str] = None
    pickup_time: Optional[str] = None
    order_time: Optional[str] = None

class VerifySlipSchema(BaseModel):
    approved: bool
    reason: Optional[str] = ""

class StatusUpdateSchema(BaseModel):
    status: str
    user_role: str
    cancel_reason: Optional[str] = None

class StoreCreateSchema(BaseModel):
    store_name: str

class StoreUpdateSchema(BaseModel):
    store_name: str

class StoreFullSchema(BaseModel):
    store_name: str
    category: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_line: Optional[str] = None
    contact_email: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    performed_by: Optional[str] = "Executive"

class ProductCreateSchema(BaseModel):
    StoreId: int
    ProductName: str
    UnitPrice: float
    IsOutOfStock: Optional[bool] = False
    img: Optional[str] = None

class ProductUpdateSchema(BaseModel):
    ProductName: str
    UnitPrice: float
    img: Optional[str] = None

class ReviewCreateSchema(BaseModel):
    order_id: int
    user_id: int
    rating: int
    comment: Optional[str] = ""
    image_url: Optional[str] = None

class CancelRequestSchema(BaseModel):
    reason: str
    response_window_minutes: int

class NotifyOutStockSchema(BaseModel):
    response_window_minutes: int

# =====================================================================
# Auth & User Endpoints
# =====================================================================
@app.post("/api/login")
def login(data: LoginSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM Users WHERE Username=%s AND Password=%s", (data.username, data.password))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
        return user

@app.post("/api/register")
def register(data: RegisterSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT UserId FROM Users WHERE Username=%s", (data.username,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="ชื่อผู้ใช้นี้ถูกใช้งานแล้ว")
        cur.execute("INSERT INTO Users (Username, Password, FullName, Role) VALUES (%s, %s, %s, 'Customer')", (data.username, data.password, data.name))
        user_id = cur.lastrowid
        cur.execute("SELECT * FROM Users WHERE UserId=%s", (user_id,))
        user = cur.fetchone()
        db.commit()
        return user

@app.post("/api/auth/google")
def google_auth(data: GoogleAuthSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM Users WHERE GoogleId=%s OR Email=%s", (data.google_id, data.email))
        user = cur.fetchone()
        if not user:
            cur.execute("INSERT INTO Users (Username, GoogleId, Email, FullName, Role) VALUES (%s, %s, %s, %s, 'Customer')", 
                        (data.email.split('@')[0], data.google_id, data.email, data.name))
            user_id = cur.lastrowid
            db.commit()
            cur.execute("SELECT * FROM Users WHERE UserId=%s", (user_id,))
            user = cur.fetchone()
        
        is_incomplete = not user.get('Phone')
        return {"user": user, "is_profile_incomplete": is_incomplete}

@app.put("/api/users/complete-profile")
def complete_profile(data: CompleteProfileSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("UPDATE Users SET FullName=%s, Phone=%s, ProfileImg=%s WHERE UserId=%s", 
                    (data.full_name, data.phone, data.profile_img, data.user_id))
        db.commit()
        cur.execute("SELECT * FROM Users WHERE UserId=%s", (data.user_id,))
        return cur.fetchone()

@app.get("/api/notifications/{user_id}")
def get_notifs(user_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM Notifications WHERE UserId=%s ORDER BY NotifId DESC LIMIT 15", (user_id,))
        return cur.fetchall()

@app.put("/api/notifications/{notif_id}/read")
def mark_notification_read(notif_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("UPDATE Notifications SET IsRead = 1 WHERE NotifId = %s", (notif_id,))
    db.commit()
    return {"success": True}

@app.put("/api/notifications/{user_id}/read-all")
def mark_all_notifications_read(user_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("UPDATE Notifications SET IsRead = 1 WHERE UserId = %s AND IsRead = 0", (user_id,))
    db.commit()
    return {"success": True}

# =====================================================================
# Store Management Endpoints
# =====================================================================
@app.get("/api/stores")
def get_stores(db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM Store")
        return cur.fetchall()

@app.post("/api/stores/full", status_code=201)
def create_store_full(data: StoreFullSchema, db=Depends(get_db)):
    name = data.store_name.strip()
    with db.cursor() as cur:
        cur.execute("SELECT StoreId FROM Store WHERE StoreName = %s", (name,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="มีชื่อร้านค้านี้อยู่แล้ว")
        cur.execute("""
            INSERT INTO Store (StoreName, IsOpen, IsSuspended, Category, ContactName, ContactPhone, ContactLine, ContactEmail, Description, ImageUrl)
            VALUES (%s, 1, 0, %s, %s, %s, %s, %s, %s, %s)
        """, (name, data.category, data.contact_name, data.contact_phone, data.contact_line, data.contact_email, data.description, data.image_url))
        store_id = cur.lastrowid
        log_audit(db, "CREATE_STORE", data.performed_by or "Executive", f"เพิ่มร้าน {name}")
    db.commit()
    return {"success": True, "store_id": store_id}

@app.put("/api/stores/{store_id}/full")
def update_store_full(store_id: int, data: StoreFullSchema, db=Depends(get_db)):
    name = data.store_name.strip()
    with db.cursor() as cur:
        cur.execute("UPDATE Store SET StoreName=%s, Category=%s, ContactName=%s, ContactPhone=%s, ContactLine=%s, ContactEmail=%s, Description=%s, ImageUrl=%s WHERE StoreId=%s",
                    (name, data.category, data.contact_name, data.contact_phone, data.contact_line, data.contact_email, data.description, data.image_url, store_id))
        log_audit(db, "UPDATE_STORE", data.performed_by or "Executive", f"แก้ไขร้าน ID {store_id}")
    db.commit()
    return {"success": True}

@app.delete("/api/stores/{store_id}")
def delete_store(store_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("UPDATE Users SET StoreId = NULL WHERE StoreId = %s", (store_id,))
        cur.execute("DELETE FROM Store WHERE StoreId = %s", (store_id,))
        log_audit(db, "DELETE_STORE", "Executive", f"ลบร้าน ID {store_id}")
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
    db.commit()
    return {"success": True}

# =====================================================================
# Reviews
# =====================================================================
@app.post("/api/reviews")
def create_review(data: ReviewCreateSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT StoreId FROM `Order` WHERE OrderID=%s", (data.order_id,))
        order = cur.fetchone()
        if not order: raise HTTPException(status_code=404, detail="Order not found")
        
        cur.execute("INSERT INTO Review (OrderID, StoreId, UserId, Rating, Comment, ImageUrl) VALUES (%s, %s, %s, %s, %s, %s)",
                    (data.order_id, order['StoreId'], data.user_id, data.rating, data.comment, data.image_url))
        cur.execute("UPDATE `Order` SET IsReviewed=1 WHERE OrderID=%s", (data.order_id,))
        db.commit()
        return {"success": True}

@app.get("/api/stores/{store_id}/reviews")
def get_store_reviews(store_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT r.*, u.FullName as ReviewerName FROM Review r 
            JOIN Users u ON r.UserId = u.UserId 
            WHERE r.StoreId = %s ORDER BY r.CreatedAt DESC
        """, (store_id,))
        reviews = cur.fetchall()
        cur.execute("""
            SELECT COUNT(*) AS total, AVG(Rating) AS avg_rating,
            SUM(Rating=5) AS star5, SUM(Rating=4) AS star4, SUM(Rating=3) AS star3, SUM(Rating=2) AS star2, SUM(Rating=1) AS star1
            FROM Review WHERE StoreId = %s
        """, (store_id,))
        agg = cur.fetchone() or {}
        return {"reviews": reviews, "summary": { "total": agg.get("total", 0), "average": float(agg.get("avg_rating") or 0) }}

# =====================================================================
# Products / Menus
# =====================================================================
@app.get("/api/products")
def get_products(store_id: Optional[int] = None, db=Depends(get_db)):
    with db.cursor() as cur:
        if store_id: 
            cur.execute("SELECT * FROM Product WHERE StoreId = %s", (store_id,))
        else: 
            cur.execute("SELECT p.*, s.StoreName FROM Product p JOIN Store s ON p.StoreId = s.StoreId")
        return cur.fetchall()

@app.post("/api/products", status_code=201)
def add_product(data: ProductCreateSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("INSERT INTO Product (StoreId, ProductName, UnitPrice, IsOutOfStock, img) VALUES (%s, %s, %s, %s, %s)", 
                    (data.StoreId, data.ProductName, data.UnitPrice, 1 if data.IsOutOfStock else 0, data.img))
    db.commit()
    return {"success": True}

@app.put("/api/products/{product_id}")
def edit_product(product_id: int, data: ProductUpdateSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("UPDATE Product SET ProductName=%s, UnitPrice=%s, img=%s WHERE ProductId=%s", (data.ProductName, data.UnitPrice, data.img, product_id))
    db.commit()
    return {"success": True}

@app.delete("/api/products/{product_id}")
def delete_product(product_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM Product WHERE ProductId = %s", (product_id,))
    db.commit()
    return {"success": True}

@app.put("/api/products/{product_id}/toggle-stock")
def toggle_stock(product_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("UPDATE Product SET IsOutOfStock = NOT IsOutOfStock WHERE ProductId = %s", (product_id,))
    db.commit()
    return {"success": True}

# =====================================================================
# Accounts Management
# =====================================================================
@app.get("/api/store-accounts")
def list_store_accounts(db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT u.UserId, u.Username, u.FullName, u.Role, u.StoreId, s.StoreName FROM Users u LEFT JOIN Store s ON u.StoreId = s.StoreId WHERE u.Role IN ('Shop Owner', 'Front Staff', 'Kitchen Staff')")
        return cur.fetchall()

@app.get("/api/stores/{store_id}/staff")
def get_store_staff(store_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT UserId, Username, FullName, Role FROM Users WHERE StoreId = %s AND Role IN ('Front Staff', 'Kitchen Staff')", (store_id,))
        return cur.fetchall()

@app.post("/api/stores/{store_id}/staff")
def add_store_staff(store_id: int, data: StaffCreateSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("INSERT INTO Users (Username, Password, FullName, Role, StoreId) VALUES (%s, %s, %s, %s, %s)", (data.username, data.password, data.fullName, data.role, store_id))
    db.commit()
    return {"success": True}

@app.delete("/api/staff/{user_id}")
def delete_staff(user_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM Users WHERE UserId = %s", (user_id,))
    db.commit()
    return {"success": True}

@app.post("/api/store-accounts")
def create_store_account(data: AccountCreateSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("INSERT INTO Users (Username, Password, FullName, Role, StoreId) VALUES (%s, %s, %s, %s, %s)", (data.username, data.password, data.full_name, data.role, data.store_id))
    db.commit()
    return {"success": True}

@app.put("/api/store-accounts/{user_id}/password")
def update_store_account(user_id: int, data: AccountUpdateSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("UPDATE Users SET Password=%s, FullName=%s, Role=%s, StoreId=%s WHERE UserId=%s", (data.password, data.full_name, data.role, data.store_id, user_id))
    db.commit()
    return {"success": True}

@app.delete("/api/store-accounts/{user_id}")
def delete_store_account(user_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("DELETE FROM Users WHERE UserId = %s", (user_id,))
    db.commit()
    return {"success": True}

# =====================================================================
# Orders
# =====================================================================
@app.post("/api/orders")
def create_order(data: CreateOrderSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        total = sum(i.qty * i.unit_price for i in data.items)
        queue_no = f"OF-{random.randint(100, 999)}"
        initial_status = 'Pending' if data.is_walk_in else 'Verifying_Slip'
        
        cur.execute("""
            INSERT INTO `Order` (StoreId, UserId, QueueNo, TotalAmount, Status, Note, IsWalkIn, SlipUrl, PaymentMethod, PickupTime, OrderTime) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (data.store_id, data.user_id, queue_no, total, initial_status, data.note, 1 if data.is_walk_in else 0, data.slip_url, data.payment_method, data.pickup_time, data.order_time))
        order_id = cur.lastrowid

        for item in data.items:
            cur.execute("INSERT INTO OrderDetail (OrderID, ProductId, Qty, UnitPrice, ItemNote) VALUES (%s, %s, %s, %s, %s)",
                        (order_id, item.product_id, item.qty, item.unit_price, item.item_note))
        
        db.commit()
        return {"success": True, "order_id": order_id, "queue_no": queue_no}

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
            SELECT p.ProductName, SUM(od.Qty) as TotalQty FROM OrderDetail od
            JOIN `Order` o ON od.OrderID = o.OrderID JOIN Product p ON od.ProductId = p.ProductId
            WHERE o.StoreId = %s AND o.Status IN ('Pending', 'Cooking') GROUP BY p.ProductName
        """, (store_id,))
        return cur.fetchall()

@app.put("/api/orders/{order_id}/verify-slip")
def verify_slip(order_id: int, payload: VerifySlipSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        if payload.approved:
            cur.execute("UPDATE `Order` SET Status='Pending' WHERE OrderID=%s", (order_id,))
        else:
            cur.execute("UPDATE `Order` SET Status='Cancelled', CancelReason=%s WHERE OrderID=%s", (payload.reason, order_id))
        db.commit()
        return {"success": True}

@app.put("/api/orders/{order_id}/status")
def update_status(order_id: int, payload: StatusUpdateSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        if payload.status == 'Ready':
            cur.execute("UPDATE `Order` SET Status=%s, CancelReason=%s, ReadyAt=%s WHERE OrderID=%s", (payload.status, payload.cancel_reason, datetime.now(), order_id))
        else:
            cur.execute("UPDATE `Order` SET Status=%s, CancelReason=%s WHERE OrderID=%s", (payload.status, payload.cancel_reason, order_id))
        log_audit(db, "UPDATE_STATUS", payload.user_role, f"Order {order_id} -> {payload.status}")
        db.commit()
        return {"success": True}

# =====================================================================
# Food Court & Global Reports
# =====================================================================
@app.get("/api/food-court/status")
def get_food_court_status(db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT IsOpen FROM FoodCourtSetting WHERE SettingId = 1")
        return {"is_open": bool(cur.fetchone()["IsOpen"])}

@app.put("/api/food-court/toggle")
def toggle_food_court(db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("UPDATE FoodCourtSetting SET IsOpen = NOT IsOpen WHERE SettingId = 1")
        cur.execute("SELECT IsOpen FROM FoodCourtSetting WHERE SettingId = 1")
        is_open = bool(cur.fetchone()["IsOpen"])
        db.commit()
        return {"success": True, "is_open": is_open}

@app.get("/api/reports/dashboard")
def get_dashboard(store_id: Optional[int] = None, db=Depends(get_db)):
    with db.cursor() as cur:
        q = "SELECT s.StoreId, s.StoreName, s.IsOpen, s.IsSuspended, COUNT(o.OrderID) as total_orders, IFNULL(SUM(o.TotalAmount), 0) as net_sales FROM Store s LEFT JOIN `Order` o ON s.StoreId = o.StoreId AND o.Status IN ('Completed', 'NoShow')"
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