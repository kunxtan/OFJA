import os
import random
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pymysql
from pymysql.cursors import DictCursor

# =====================================================================
# Only Foods Engine Pro - Main Application Entrypoint
# =====================================================================

app = FastAPI(title="Only Foods Engine Pro")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================================
# Database Connection & Helper Functions
# =====================================================================

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
            cur.execute(
                "INSERT INTO AuditLog (Action, PerformedBy, Details) VALUES (%s, %s, %s)",
                (action, performed_by, details)
            )
    except Exception as e:
        print(f"AuditLog warning: {e}")

def send_notif(db, user_id: int, msg: str):
    if user_id:
        try:
            with db.cursor() as cur:
                cur.execute(
                    "INSERT INTO Notifications (UserId, Message) VALUES (%s, %s)",
                    (user_id, msg)
                )
        except Exception as e:
            print(f"SendNotif warning: {e}")

def clean_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None

# =====================================================================
# Database Auto-Migrations (Ensures Schema Compatibility)
# =====================================================================

STORE_EXTRA_COLUMNS = {
    "Category": "VARCHAR(50) NULL",
    "ContactName": "VARCHAR(100) NULL",
    "ContactPhone": "VARCHAR(20) NULL",
    "ContactLine": "VARCHAR(50) NULL",
    "ContactEmail": "VARCHAR(100) NULL",
    "Description": "VARCHAR(300) NULL",
    "ImageUrl": "MEDIUMTEXT NULL",
}
_store_columns_ready = False

def ensure_store_columns(db):
    global _store_columns_ready
    if _store_columns_ready:
        return
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Store'
            """
        )
        existing = {row["COLUMN_NAME"] for row in cur.fetchall()}
        for name, ddl in STORE_EXTRA_COLUMNS.items():
            if name not in existing:
                cur.execute(f"ALTER TABLE Store ADD COLUMN {name} {ddl}")
    db.commit()
    _store_columns_ready = True

# ---------------------------------------------------------------------
# Additional schema compatibility migrations
# ---------------------------------------------------------------------
USER_EXTRA_COLUMNS = {
    "GoogleId": "VARCHAR(255) NULL",
    "Email": "VARCHAR(255) NULL",
    "Phone": "VARCHAR(30) NULL",
    "ProfileImg": "LONGTEXT NULL",
}

_product_columns_ready = False
_user_columns_ready = False

def _ensure_extra_columns(db, table_name, extra_columns):
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
            """,
            (table_name,),
        )
        existing = {row["COLUMN_NAME"] for row in cur.fetchall()}
        for name, ddl in extra_columns.items():
            if name not in existing:
                cur.execute(f"ALTER TABLE `{table_name}` ADD COLUMN `{name}` {ddl}")
    db.commit()

def ensure_user_columns(db):
    global _user_columns_ready
    if _user_columns_ready:
        return
    _ensure_extra_columns(db, "Users", USER_EXTRA_COLUMNS)
    _user_columns_ready = True

def ensure_product_columns(db):
    global _product_columns_ready
    if _product_columns_ready:
        return
    _ensure_extra_columns(db, "Product", {"img": "MEDIUMTEXT NULL"})
    _product_columns_ready = True

_order_columns_ready = False
def ensure_order_columns(db):
    global _order_columns_ready
    if _order_columns_ready:
        return

    with db.cursor() as cur:
        cur.execute(
            """
            SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Order'
            """
        )
        columns = {row["COLUMN_NAME"]: row for row in cur.fetchall()}

        extra_columns = {
            "ReadyAt": "DATETIME NULL",
            "CancelDeadline": "DATETIME NULL",
            "PaymentMethod": "VARCHAR(50) NULL",
            "PickupTime": "VARCHAR(50) NULL",
            "OrderTime": "VARCHAR(50) NULL",
            "IsReviewed": "TINYINT(1) NOT NULL DEFAULT 0",
        }

        for name, ddl in extra_columns.items():
            if name not in columns:
                cur.execute(f"ALTER TABLE `Order` ADD COLUMN `{name}` {ddl}")

        # The original schema used ENUM for Status.  New customer/store
        # workflows need Pending_Cancellation as a valid status, so use a
        # VARCHAR while keeping every existing status value intact.
        status_col = columns.get("Status")
        if status_col and status_col.get("DATA_TYPE") == "enum":
            cur.execute(
                "ALTER TABLE `Order` MODIFY COLUMN `Status` VARCHAR(50) NOT NULL DEFAULT 'Pending'"
            )

    db.commit()
    _order_columns_ready = True

_review_table_ready = False
def ensure_review_table(db):
    global _review_table_ready
    if _review_table_ready:
        return
    with db.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS Review (
                ReviewId INT AUTO_INCREMENT PRIMARY KEY,
                OrderID INT NOT NULL,
                StoreId INT NOT NULL,
                UserId INT NOT NULL,
                Rating TINYINT NOT NULL,
                Comment VARCHAR(500) NULL,
                ImageUrl LONGTEXT NULL,
                CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_review_rating CHECK (Rating BETWEEN 1 AND 5),
                FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
    db.commit()
    _review_table_ready = True

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

# =====================================================================
# Pydantic Request Schemas
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
    note: Optional[str] = ""

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

class CustomerCancelSchema(BaseModel):
    user_id: int
    reason: Optional[str] = "ลูกค้ายืนยันยกเลิก เนื่องจากเมนูหมด"

class CustomerChangeItemSchema(BaseModel):
    user_id: int
    detail_id: Optional[int] = None
    product_id: Optional[int] = None
    new_product_id: int
    new_product_name: Optional[str] = None
    unit_price: Optional[float] = None

ALLOWED_STORE_ROLES = ("Shop Owner", "Front Staff", "Kitchen Staff")

# =====================================================================
# Auth & User Endpoints
# =====================================================================

@app.post("/api/login")
def login(data: LoginSchema, db=Depends(get_db)):
    ensure_user_columns(db)
    with db.cursor() as cur:
        cur.execute("SELECT * FROM Users WHERE Username=%s AND Password=%s", (data.username, data.password))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
        return user

@app.post("/api/register")
def register(data: RegisterSchema, db=Depends(get_db)):
    ensure_user_columns(db)
    with db.cursor() as cur:
        cur.execute("SELECT UserId FROM Users WHERE Username=%s", (data.username,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="ชื่อผู้ใช้นี้ถูกใช้งานแล้ว")
        cur.execute(
            "INSERT INTO Users (Username, Password, FullName, Role) VALUES (%s, %s, %s, 'Customer')", 
            (data.username, data.password, data.name)
        )
        user_id = cur.lastrowid
        db.commit()
        cur.execute("SELECT * FROM Users WHERE UserId=%s", (user_id,))
        return cur.fetchone()

@app.post("/api/auth/google")
def google_auth(data: GoogleAuthSchema, db=Depends(get_db)):
    ensure_user_columns(db)
    with db.cursor() as cur:
        cur.execute("SELECT * FROM Users WHERE GoogleId=%s OR Email=%s", (data.google_id, data.email))
        user = cur.fetchone()
        
        if not user:
            # ถ้าเป็นผู้ใช้ใหม่จาก Google ให้สร้างบัญชี
            cur.execute(
                "INSERT INTO Users (Username, GoogleId, Email, FullName, Role) VALUES (%s, %s, %s, %s, 'Customer')", 
                (data.email.split('@')[0], data.google_id, data.email, data.name)
            )
            user_id = cur.lastrowid
            db.commit()
            cur.execute("SELECT * FROM Users WHERE UserId=%s", (user_id,))
            user = cur.fetchone()
        
        # เช็คว่ามีเบอร์โทรศัพท์หรือยัง ถ้ายังให้แจ้งให้หน้าบ้านบังคับกรอก
        is_profile_incomplete = not bool(user.get('Phone'))
        return {"user": user, "is_profile_incomplete": is_profile_incomplete}

@app.put("/api/users/complete-profile")
def complete_profile(data: CompleteProfileSchema, db=Depends(get_db)):
    ensure_user_columns(db)
    with db.cursor() as cur:
        cur.execute(
            "UPDATE Users SET FullName=%s, Phone=%s, ProfileImg=%s WHERE UserId=%s", 
            (data.full_name, data.phone, data.profile_img, data.user_id)
        )
        db.commit()
        cur.execute("SELECT * FROM Users WHERE UserId=%s", (data.user_id,))
        return cur.fetchone()

@app.get("/api/customers/{user_id}")
def get_customer_profile(user_id: int, db=Depends(get_db)):
    ensure_user_columns(db)
    with db.cursor() as cur:
        cur.execute("SELECT FullName as CustomerName, Phone, Email FROM Users WHERE UserId = %s", (user_id,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="ไม่พบข้อมูลลูกค้า")
        
        cur.execute("SELECT COUNT(*) as TotalOrders FROM `Order` WHERE UserId = %s AND Status IN ('Completed', 'NoShow')", (user_id,))
        orders_count = cur.fetchone()
        user['TotalOrders'] = orders_count['TotalOrders']
        return user

@app.get("/api/notifications/{user_id}")
def get_notifs(user_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM Notifications WHERE UserId=%s ORDER BY NotifId DESC LIMIT 15", (user_id,))
        return cur.fetchall()

@app.put("/api/notifications/{notif_id}/read")
def mark_notification_read(notif_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("UPDATE Notifications SET IsRead = 1 WHERE NotifId = %s", (notif_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="ไม่พบการแจ้งเตือนนี้")
    db.commit()
    return {"success": True}

@app.put("/api/notifications/{user_id}/read-all")
def mark_all_notifications_read(user_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute(
            "UPDATE Notifications SET IsRead = 1 WHERE UserId = %s AND IsRead = 0",
            (user_id,),
        )
        updated = cur.rowcount
    db.commit()
    return {"success": True, "updated": updated}

# =====================================================================
# Store Management Endpoints
# =====================================================================

@app.get("/api/stores")
def get_stores(db=Depends(get_db)):
    ensure_store_columns(db)
    with db.cursor() as cur:
        cur.execute("SELECT * FROM Store")
        return cur.fetchall()

@app.post("/api/stores", status_code=201)
def create_store(data: StoreCreateSchema, db=Depends(get_db)):
    store_name = data.store_name.strip()
    if not store_name:
        raise HTTPException(status_code=400, detail="กรุณากรอกชื่อร้านค้า")

    try:
        with db.cursor() as cur:
            cur.execute("SELECT StoreId FROM Store WHERE StoreName = %s", (store_name,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="มีชื่อร้านค้านี้อยู่แล้ว")

            cur.execute("INSERT INTO Store (StoreName, IsOpen, IsSuspended) VALUES (%s, 1, 0)", (store_name,))
            store_id = cur.lastrowid
            db.commit()
            return {"success": True, "store_id": store_id, "message": "เพิ่มร้านค้าเรียบร้อยแล้ว"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(error))

@app.put("/api/stores/{store_id}")
def update_store(store_id: int, data: StoreUpdateSchema, db=Depends(get_db)):
    store_name = data.store_name.strip()
    if not store_name:
        raise HTTPException(status_code=400, detail="กรุณากรอกชื่อร้านค้า")

    try:
        with db.cursor() as cur:
            cur.execute("SELECT StoreId FROM Store WHERE StoreId = %s", (store_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="ไม่พบร้านค้า")

            cur.execute("SELECT StoreId FROM Store WHERE StoreName = %s AND StoreId != %s", (store_name, store_id))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="มีชื่อร้านค้านี้อยู่แล้ว")

            cur.execute("UPDATE Store SET StoreName = %s WHERE StoreId = %s", (store_name, store_id))
            db.commit()
            return {"success": True, "message": "แก้ไขชื่อร้านเรียบร้อยแล้ว"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(error))

@app.post("/api/stores/full", status_code=201)
def create_store_full(data: StoreFullSchema, db=Depends(get_db)):
    ensure_store_columns(db)
    name = data.store_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="กรุณากรอกชื่อร้านค้า")
    if not data.category:
        raise HTTPException(status_code=400, detail="กรุณาเลือกประเภทอาหาร")

    try:
        with db.cursor() as cur:
            cur.execute("SELECT StoreId FROM Store WHERE StoreName = %s", (name,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="มีชื่อร้านค้านี้อยู่แล้ว")

            cur.execute(
                """
                INSERT INTO Store
                    (StoreName, IsOpen, IsSuspended, Category, ContactName,
                     ContactPhone, ContactLine, ContactEmail, Description, ImageUrl)
                VALUES (%s, 1, 0, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    name,
                    clean_text(data.category),
                    clean_text(data.contact_name),
                    clean_text(data.contact_phone),
                    clean_text(data.contact_line),
                    clean_text(data.contact_email),
                    clean_text(data.description),
                    data.image_url or None,
                ),
            )
            store_id = cur.lastrowid
            log_audit(db, "CREATE_STORE", data.performed_by or "Executive", f"เพิ่มร้าน {name} (ID {store_id})")
        db.commit()
        return {"success": True, "store_id": store_id, "message": "เพิ่มร้านค้าเรียบร้อยแล้ว"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(error))

@app.put("/api/stores/{store_id}/full")
def update_store_full(store_id: int, data: StoreFullSchema, db=Depends(get_db)):
    ensure_store_columns(db)
    name = data.store_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="กรุณากรอกชื่อร้านค้า")

    try:
        with db.cursor() as cur:
            cur.execute("SELECT StoreId FROM Store WHERE StoreId = %s", (store_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="ไม่พบร้านค้า")

            cur.execute("SELECT StoreId FROM Store WHERE StoreName = %s AND StoreId != %s", (name, store_id))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="มีชื่อร้านค้านี้อยู่แล้ว")

            cur.execute(
                """
                UPDATE Store SET
                    StoreName = %s, Category = %s, ContactName = %s, ContactPhone = %s,
                    ContactLine = %s, ContactEmail = %s, Description = %s, ImageUrl = %s
                WHERE StoreId = %s
                """,
                (
                    name,
                    clean_text(data.category),
                    clean_text(data.contact_name),
                    clean_text(data.contact_phone),
                    clean_text(data.contact_line),
                    clean_text(data.contact_email),
                    clean_text(data.description),
                    data.image_url or None,
                    store_id,
                ),
            )
            log_audit(db, "UPDATE_STORE", data.performed_by or "Executive", f"แก้ไขร้าน ID {store_id}")
        db.commit()
        return {"success": True, "message": "บันทึกข้อมูลร้านค้าเรียบร้อยแล้ว"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(error))

@app.delete("/api/stores/{store_id}")
def delete_store(store_id: int, db=Depends(get_db)):
    try:
        with db.cursor() as cur:
            cur.execute("SELECT StoreName FROM Store WHERE StoreId = %s", (store_id,))
            store = cur.fetchone()
            if not store:
                raise HTTPException(status_code=404, detail="ไม่พบร้านค้า")

            cur.execute("SELECT COUNT(*) AS total FROM `Order` WHERE StoreId = %s", (store_id,))
            if cur.fetchone()["total"] > 0:
                raise HTTPException(
                    status_code=400,
                    detail="ร้านนี้มีประวัติออเดอร์อยู่ จึงลบไม่ได้ — แนะนำให้ใช้ 'ระงับสิทธิ์' แทน",
                )

            cur.execute("UPDATE Users SET StoreId = NULL WHERE StoreId = %s", (store_id,))
            cur.execute("DELETE FROM Store WHERE StoreId = %s", (store_id,))
            log_audit(db, "DELETE_STORE", "Executive", f"ลบร้าน {store['StoreName']} (ID {store_id})")
        db.commit()
        return {"success": True, "message": "ลบร้านค้าเรียบร้อยแล้ว"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(error))

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


# =====================================================================
# Review Management Endpoints
# =====================================================================

@app.post("/api/reviews")
def create_review(data: ReviewCreateSchema, db=Depends(get_db)):
    ensure_review_table(db)
    with db.cursor() as cur:
        # หารหัสร้านค้าจาก OrderID
        cur.execute("SELECT StoreId FROM `Order` WHERE OrderID=%s", (data.order_id,))
        order = cur.fetchone()
        if not order: 
            raise HTTPException(status_code=404, detail="ไม่พบคำสั่งซื้อนี้")
        
        # บันทึกรีวิว
        cur.execute(
            """
            INSERT INTO Review (OrderID, StoreId, UserId, Rating, Comment, ImageUrl) 
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (data.order_id, order['StoreId'], data.user_id, data.rating, data.comment, data.image_url)
        )
        
        # อัปเดตสถานะการรีวิวใน Order 
        cur.execute("UPDATE `Order` SET IsReviewed=1 WHERE OrderID=%s", (data.order_id,))
        db.commit()
        return {"success": True}

@app.get("/api/stores/{store_id}/reviews")
def get_store_reviews(store_id: int, db=Depends(get_db)):
    ensure_review_table(db)
    with db.cursor() as cur:
        cur.execute("SELECT StoreId FROM Store WHERE StoreId = %s", (store_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="ไม่พบร้านค้านี้")

        cur.execute(
            """
            SELECT r.*, u.FullName as ReviewerName 
            FROM Review r 
            JOIN Users u ON r.UserId = u.UserId 
            WHERE r.StoreId = %s 
            ORDER BY r.CreatedAt DESC, r.ReviewId DESC
            """,
            (store_id,),
        )
        reviews = cur.fetchall()

        cur.execute(
            """
            SELECT
                COUNT(*) AS total,
                AVG(Rating) AS avg_rating,
                SUM(Rating = 5) AS star5,
                SUM(Rating = 4) AS star4,
                SUM(Rating = 3) AS star3,
                SUM(Rating = 2) AS star2,
                SUM(Rating = 1) AS star1
            FROM Review
            WHERE StoreId = %s
            """,
            (store_id,),
        )
        agg = cur.fetchone() or {}
        total = int(agg.get("total") or 0)
        avg_rating = round(float(agg["avg_rating"]), 2) if agg.get("avg_rating") is not None else 0.0

        return {
            "reviews": reviews,
            "summary": {
                "total": total,
                "average": avg_rating,
                "breakdown": {
                    "5": int(agg.get("star5") or 0),
                    "4": int(agg.get("star4") or 0),
                    "3": int(agg.get("star3") or 0),
                    "2": int(agg.get("star2") or 0),
                    "1": int(agg.get("star1") or 0),
                },
            },
        }

# =====================================================================
# Staff & Store Accounts Management Endpoints
# =====================================================================

@app.get("/api/stores/{store_id}/staff")
def get_store_staff(store_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("""
            SELECT UserId, Username, FullName, Role 
            FROM Users 
            WHERE StoreId = %s AND Role IN ('Front Staff', 'Kitchen Staff')
        """, (store_id,))
        return cur.fetchall()

@app.post("/api/stores/{store_id}/staff", status_code=201)
def add_store_staff(store_id: int, data: StaffCreateSchema, db=Depends(get_db)):
    try:
        with db.cursor() as cur:
            cur.execute("SELECT UserId FROM Users WHERE Username = %s", (data.username,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Username นี้มีอยู่ในระบบแล้ว")

            cur.execute("""
                INSERT INTO Users (Username, Password, FullName, Role, StoreId, Points)
                VALUES (%s, %s, %s, %s, %s, 0)
            """, (data.username, data.password, data.fullName, data.role, store_id))
            db.commit()
            return {"success": True, "message": "เพิ่มพนักงานสำเร็จ"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/staff/{user_id}")
def delete_staff(user_id: int, db=Depends(get_db)):
    try:
        with db.cursor() as cur:
            cur.execute("DELETE FROM Users WHERE UserId = %s", (user_id,))
            db.commit()
            return {"success": True, "message": "ลบพนักงานสำเร็จ"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/store-accounts")
def list_store_accounts(db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT u.UserId, u.Username, u.FullName, u.Role, u.StoreId, s.StoreName
            FROM Users u
            LEFT JOIN Store s ON u.StoreId = s.StoreId
            WHERE u.Role IN ('Shop Owner', 'Front Staff', 'Kitchen Staff')
            ORDER BY u.StoreId, u.UserId
            """
        )
        return cur.fetchall()

@app.post("/api/store-accounts", status_code=201)
def create_store_account(data: AccountCreateSchema, db=Depends(get_db)):
    username = data.username.strip()
    full_name = data.full_name.strip()

    if not username or " " in username or not (4 <= len(username) <= 20):
        raise HTTPException(status_code=400, detail="ชื่อผู้ใช้ต้องยาว 4–20 ตัว และห้ามมีช่องว่าง")
    if len(data.password) < 6 or " " in data.password:
        raise HTTPException(status_code=400, detail="รหัสผ่านต้องยาวอย่างน้อย 6 ตัว และห้ามมีช่องว่าง")
    if not full_name:
        raise HTTPException(status_code=400, detail="กรุณากรอกชื่อ-นามสกุลผู้ใช้")
    if data.role not in ALLOWED_STORE_ROLES:
        raise HTTPException(status_code=400, detail="ตำแหน่งไม่ถูกต้อง")

    try:
        with db.cursor() as cur:
            cur.execute("SELECT StoreId FROM Store WHERE StoreId = %s", (data.store_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="ไม่พบร้านค้าที่เลือก")

            cur.execute("SELECT UserId FROM Users WHERE Username = %s", (username,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว")

            cur.execute(
                """
                INSERT INTO Users (Username, Password, FullName, Role, StoreId, Points)
                VALUES (%s, %s, %s, %s, %s, 0)
                """,
                (username, data.password, full_name, data.role, data.store_id),
            )
            user_id = cur.lastrowid
            log_audit(db, "CREATE_STORE_ACCOUNT", data.performed_by or "Executive", f"สร้างบัญชี {username} ({data.role}) ให้ร้าน ID {data.store_id}")
        db.commit()
        return {"success": True, "user_id": user_id, "message": "สร้างบัญชีเรียบร้อยแล้ว"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(error))

@app.put("/api/store-accounts/{user_id}/password")
def update_store_account(user_id: int, data: AccountUpdateSchema, db=Depends(get_db)):
    if len(data.password) < 6 or " " in data.password:
        raise HTTPException(status_code=400, detail="รหัสผ่านต้องยาวอย่างน้อย 6 ตัว และห้ามมีช่องว่าง")
    if data.role not in ALLOWED_STORE_ROLES:
        raise HTTPException(status_code=400, detail="ตำแหน่งไม่ถูกต้อง")

    try:
        with db.cursor() as cur:
            cur.execute("SELECT Username FROM Users WHERE UserId = %s", (user_id,))
            account = cur.fetchone()
            if not account:
                raise HTTPException(status_code=404, detail="ไม่พบบัญชีผู้ใช้นี้")

            cur.execute(
                """
                UPDATE Users SET Password = %s, FullName = %s, Role = %s, StoreId = %s
                WHERE UserId = %s
                """,
                (data.password, data.full_name.strip(), data.role, data.store_id, user_id),
            )
            log_audit(db, "UPDATE_STORE_ACCOUNT", data.performed_by or "Executive", f"แก้ไขบัญชี {account['Username']} (ID {user_id})")
        db.commit()
        return {"success": True, "message": "อัปเดตบัญชีเรียบร้อยแล้ว"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(error))

@app.delete("/api/store-accounts/{user_id}")
def delete_store_account(user_id: int, db=Depends(get_db)):
    try:
        with db.cursor() as cur:
            cur.execute("SELECT Username, Role FROM Users WHERE UserId = %s", (user_id,))
            account = cur.fetchone()
            if not account:
                raise HTTPException(status_code=404, detail="ไม่พบบัญชีผู้ใช้นี้")
            if account["Role"] not in ALLOWED_STORE_ROLES:
                raise HTTPException(status_code=400, detail="ลบได้เฉพาะบัญชีของฝั่งร้านค้าเท่านั้น")

            cur.execute("DELETE FROM Users WHERE UserId = %s", (user_id,))
            log_audit(db, "DELETE_STORE_ACCOUNT", "Executive", f"ลบบัญชี {account['Username']}")
        db.commit()
        return {"success": True, "message": "ลบบัญชีเรียบร้อยแล้ว"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(error))

# =====================================================================
# Product / Menu Management Endpoints
# =====================================================================

@app.get("/api/products")
def get_products(store_id: Optional[int] = None, db=Depends(get_db)):
    ensure_product_columns(db)
    with db.cursor() as cur:
        if store_id: 
            cur.execute("SELECT * FROM Product WHERE StoreId = %s", (store_id,))
        else: 
            cur.execute("SELECT p.*, s.StoreName FROM Product p JOIN Store s ON p.StoreId = s.StoreId")
        return cur.fetchall()

@app.post("/api/products", status_code=201)
def add_product(data: ProductCreateSchema, db=Depends(get_db)):
    ensure_product_columns(db)
    try:
        with db.cursor() as cur:
            cur.execute("""
                INSERT INTO Product (StoreId, ProductName, UnitPrice, IsOutOfStock, img)
                VALUES (%s, %s, %s, %s, %s)
            """, (data.StoreId, data.ProductName, data.UnitPrice, 1 if data.IsOutOfStock else 0, data.img))
            product_id = cur.lastrowid
            db.commit()
            return {"success": True, "product_id": product_id, "message": "เพิ่มเมนูสำเร็จ"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/products/{product_id}")
def edit_product(product_id: int, data: ProductUpdateSchema, db=Depends(get_db)):
    ensure_product_columns(db)
    try:
        with db.cursor() as cur:
            cur.execute("SELECT ProductId FROM Product WHERE ProductId = %s", (product_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="ไม่พบเมนูนี้")

            cur.execute("""
                UPDATE Product
                SET ProductName = %s, UnitPrice = %s, img = %s
                WHERE ProductId = %s
            """, (data.ProductName, data.UnitPrice, data.img, product_id))
            db.commit()
            return {"success": True, "message": "แก้ไขเมนูสำเร็จ"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/products/{product_id}")
def delete_product(product_id: int, db=Depends(get_db)):
    try:
        with db.cursor() as cur:
            cur.execute("DELETE FROM Product WHERE ProductId = %s", (product_id,))
            db.commit()
            return {"success": True, "message": "ลบเมนูสำเร็จ"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/products/{product_id}/toggle-stock")
def toggle_stock(product_id: int, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("UPDATE Product SET IsOutOfStock = NOT IsOutOfStock WHERE ProductId = %s", (product_id,))
        db.commit()
        return {"success": True}

@app.post("/api/products/{product_id}/notify-out-of-stock")
def notify_out_of_stock(product_id: int, payload: NotifyOutStockSchema, db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute("SELECT ProductName FROM Product WHERE ProductId=%s", (product_id,))
        prod = cur.fetchone()
        p_name = prod['ProductName'] if prod else 'รายการหนึ่ง'

        cur.execute("""
            SELECT DISTINCT o.OrderID, o.UserId, o.QueueNo 
            FROM `Order` o
            JOIN OrderDetail od ON o.OrderID = od.OrderID
            WHERE od.ProductId = %s AND o.Status NOT IN ('Completed', 'Cancelled', 'NoShow', 'Verifying_Slip')
        """, (product_id,))
        affected = cur.fetchall()

        deadline = datetime.now() + timedelta(minutes=payload.response_window_minutes)
        for o in affected:
            cur.execute("""
                UPDATE `Order` 
                SET Status='Pending_Cancellation', CancelReason=%s, CancelDeadline=%s 
                WHERE OrderID=%s
            """, (f"วัตถุดิบหมด: {p_name}", deadline, o['OrderID']))
            
            if o['UserId']:
                send_notif(db, o['UserId'], f"⚠️ คิว {o['QueueNo']} สินค้า {p_name} หมด! กรุณากดยกเลิกรับเงินคืนภายใน {payload.response_window_minutes} นาที")
        
        log_audit(db, "OUT_OF_STOCK_NOTIFY", "Front Staff", f"แจ้งเตือนลูกค้า {len(affected)} คิว กรณี {p_name} หมด")
        db.commit()
        return {"success": True, "notified_count": len(affected)}

# =====================================================================
# Order Processing & Kitchen Operations Endpoints
# =====================================================================

@app.post("/api/orders")
def create_order(data: CreateOrderSchema, db=Depends(get_db)):
    ensure_order_columns(db)
    ensure_food_court_setting(db)
    try:
        with db.cursor() as cur:
            cur.execute("SELECT IsOpen FROM FoodCourtSetting WHERE SettingId = 1")
            fc_status = cur.fetchone()
            if fc_status and int(fc_status['IsOpen']) == 0:
                raise HTTPException(status_code=400, detail="ศูนย์อาหารปิดให้บริการชั่วคราว ไม่สามารถสั่งอาหารได้")

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
                note_val = item.item_note or item.note or ""
                validated_items.append((item.product_id, item.qty, real_price, note_val))

            queue_no = f"OF-{random.randint(100, 999)}"
            initial_status = 'Pending' if data.is_walk_in else 'Verifying_Slip'
            
            cur.execute("""
                INSERT INTO `Order` (StoreId, UserId, QueueNo, TotalAmount, Status, Note, IsWalkIn, SlipUrl, PaymentMethod, PickupTime, OrderTime) 
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (data.store_id, data.user_id, queue_no, total, initial_status, data.note, 1 if data.is_walk_in else 0, data.slip_url, data.payment_method, data.pickup_time, data.order_time))
            
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
    ensure_order_columns(db)
    ensure_product_columns(db)
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
            cur.execute("SELECT od.*, p.ProductName, p.IsOutOfStock FROM OrderDetail od JOIN Product p ON od.ProductId = p.ProductId WHERE od.OrderID = %s", (o['OrderID'],))
            o['items'] = cur.fetchall()
        return orders

@app.put("/api/orders/{order_id}/change-item")
def customer_change_order_item(
    order_id: int,
    payload: CustomerChangeItemSchema,
    db=Depends(get_db)
):
    """
    Customer chooses a replacement menu after the store reports an item
    as out of stock. Only the owner of the order can perform this action.
    """
    ensure_order_columns(db)
    ensure_product_columns(db)

    try:
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT OrderID, StoreId, UserId, QueueNo, Status, CancelReason, CancelDeadline
                FROM `Order`
                WHERE OrderID=%s
                """,
                (order_id,),
            )
            order = cur.fetchone()

            if not order:
                raise HTTPException(status_code=404, detail="ไม่พบคำสั่งซื้อนี้")

            if order["UserId"] is None or int(order["UserId"]) != int(payload.user_id):
                raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์แก้ไขคำสั่งซื้อนี้")

            if order["Status"] != "Pending_Cancellation":
                raise HTTPException(
                    status_code=400,
                    detail="ออเดอร์นี้ไม่ได้อยู่ในสถานะรอเปลี่ยนเมนู"
                )

            if order.get("CancelDeadline") and datetime.now() > order["CancelDeadline"]:
                raise HTTPException(
                    status_code=400,
                    detail="หมดเวลาสำหรับเปลี่ยนเมนูหรือยกเลิกออเดอร์แล้ว"
                )

            # If frontend doesn't send a DetailID, find the affected detail
            # from the out-of-stock product named in CancelReason.
            detail = None
            if payload.detail_id:
                cur.execute(
                    """
                    SELECT od.*, p.ProductName, p.IsOutOfStock
                    FROM OrderDetail od
                    JOIN Product p ON od.ProductId=p.ProductId
                    WHERE od.DetailID=%s AND od.OrderID=%s
                    """,
                    (payload.detail_id, order_id),
                )
                detail = cur.fetchone()

            if not detail and payload.product_id:
                cur.execute(
                    """
                    SELECT od.*, p.ProductName, p.IsOutOfStock
                    FROM OrderDetail od
                    JOIN Product p ON od.ProductId=p.ProductId
                    WHERE od.OrderID=%s AND od.ProductId=%s
                    ORDER BY od.DetailID
                    LIMIT 1
                    """,
                    (order_id, payload.product_id),
                )
                detail = cur.fetchone()

            if not detail:
                reason = str(order.get("CancelReason") or "")
                old_name = ""
                if reason.startswith("วัตถุดิบหมด:"):
                    old_name = reason.replace("วัตถุดิบหมด:", "", 1).strip()

                if old_name:
                    cur.execute(
                        """
                        SELECT od.*, p.ProductName, p.IsOutOfStock
                        FROM OrderDetail od
                        JOIN Product p ON od.ProductId=p.ProductId
                        WHERE od.OrderID=%s AND p.ProductName=%s
                        ORDER BY od.DetailID
                        LIMIT 1
                        """,
                        (order_id, old_name),
                    )
                    detail = cur.fetchone()

            if not detail:
                cur.execute(
                    """
                    SELECT od.*, p.ProductName, p.IsOutOfStock
                    FROM OrderDetail od
                    JOIN Product p ON od.ProductId=p.ProductId
                    WHERE od.OrderID=%s AND p.IsOutOfStock=1
                    ORDER BY od.DetailID
                    LIMIT 1
                    """,
                    (order_id,),
                )
                detail = cur.fetchone()

            if not detail:
                raise HTTPException(
                    status_code=400,
                    detail="ไม่พบรายการอาหารที่ต้องเปลี่ยนในออเดอร์นี้"
                )

            cur.execute(
                """
                SELECT ProductId, ProductName, UnitPrice, IsOutOfStock
                FROM Product
                WHERE ProductId=%s AND StoreId=%s
                """,
                (payload.new_product_id, order["StoreId"]),
            )
            new_product = cur.fetchone()

            if not new_product:
                raise HTTPException(
                    status_code=400,
                    detail="ไม่พบเมนูใหม่ในร้านเดียวกัน"
                )

            if int(new_product["IsOutOfStock"] or 0) == 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"เมนู '{new_product['ProductName']}' หมดแล้ว กรุณาเลือกเมนูอื่น"
                )

            if int(new_product["ProductId"]) == int(detail["ProductId"]):
                raise HTTPException(
                    status_code=400,
                    detail="กรุณาเลือกเมนูที่แตกต่างจากเมนูเดิม"
                )

            old_name = detail["ProductName"]
            qty = int(detail["Qty"] or 1)

            cur.execute(
                """
                UPDATE OrderDetail
                SET ProductId=%s, UnitPrice=%s
                WHERE DetailID=%s AND OrderID=%s
                """,
                (
                    new_product["ProductId"],
                    new_product["UnitPrice"],
                    detail["DetailID"],
                    order_id,
                ),
            )

            # Recalculate the whole order using the actual DB prices.
            cur.execute(
                """
                SELECT SUM(Qty * UnitPrice) AS TotalAmount
                FROM OrderDetail
                WHERE OrderID=%s
                """,
                (order_id,),
            )
            total_row = cur.fetchone()
            new_total = float(total_row["TotalAmount"] or 0)

            cur.execute(
                """
                UPDATE `Order`
                SET TotalAmount=%s,
                    Status='Pending',
                    CancelReason=NULL,
                    CancelDeadline=NULL
                WHERE OrderID=%s
                """,
                (new_total, order_id),
            )

            send_notif(
                db,
                order["UserId"],
                f"✅ คิว {order['QueueNo']} เปลี่ยนเมนูจาก '{old_name}' "
                f"เป็น '{new_product['ProductName']}' เรียบร้อยแล้ว"
            )

            log_audit(
                db,
                "CUSTOMER_CHANGE_ITEM",
                f"User:{payload.user_id}",
                f"Order {order_id}: {old_name} x{qty} -> {new_product['ProductName']}"
            )

        db.commit()
        return {
            "success": True,
            "message": f"เปลี่ยนเมนูเป็น {new_product['ProductName']} เรียบร้อยแล้ว",
            "order_id": order_id,
            "new_product_id": new_product["ProductId"],
            "new_product_name": new_product["ProductName"],
            "new_total": new_total,
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/orders/{order_id}/customer-cancel")
def customer_cancel_order(
    order_id: int,
    payload: CustomerCancelSchema,
    db=Depends(get_db)
):
    """
    Customer confirms cancellation after an out-of-stock notification.
    This changes the order to Cancelled. Actual money transfer/refund is
    not automated because this project has no payment/refund gateway.
    """
    ensure_order_columns(db)

    try:
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT OrderID, UserId, QueueNo, Status, CancelDeadline
                FROM `Order`
                WHERE OrderID=%s
                """,
                (order_id,),
            )
            order = cur.fetchone()

            if not order:
                raise HTTPException(status_code=404, detail="ไม่พบคำสั่งซื้อนี้")

            if order["UserId"] is None or int(order["UserId"]) != int(payload.user_id):
                raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์ยกเลิกคำสั่งซื้อนี้")

            if order["Status"] != "Pending_Cancellation":
                raise HTTPException(
                    status_code=400,
                    detail="ออเดอร์นี้ไม่อยู่ในสถานะที่สามารถยกเลิกได้"
                )

            if order.get("CancelDeadline") and datetime.now() > order["CancelDeadline"]:
                raise HTTPException(
                    status_code=400,
                    detail="หมดเวลาสำหรับยกเลิกออเดอร์แล้ว"
                )

            reason = (payload.reason or "ลูกค้ายืนยันยกเลิก เนื่องจากเมนูหมด").strip()

            cur.execute(
                """
                UPDATE `Order`
                SET Status='Cancelled',
                    CancelReason=%s,
                    CancelDeadline=NULL
                WHERE OrderID=%s
                """,
                (reason, order_id),
            )

            send_notif(
                db,
                order["UserId"],
                f"❌ คิว {order['QueueNo']} ถูกยกเลิกตามคำขอของคุณแล้ว "
                f"(การคืนเงินดำเนินการตามระบบชำระเงินของร้าน)"
            )

            log_audit(
                db,
                "CUSTOMER_CANCEL_ORDER",
                f"User:{payload.user_id}",
                f"Order {order_id} ลูกค้ายืนยันยกเลิก: {reason}"
            )

        db.commit()
        return {
            "success": True,
            "message": "ยกเลิกออเดอร์เรียบร้อยแล้ว",
            "order_id": order_id,
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


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
    ensure_order_columns(db)
    try:
        with db.cursor() as cur:
            if payload.status == 'Ready':
                cur.execute(
                    "UPDATE `Order` SET Status=%s, CancelReason=%s, ReadyAt=%s WHERE OrderID=%s", 
                    (payload.status, payload.cancel_reason, datetime.now(), order_id)
                )
            else:
                cur.execute(
                    "UPDATE `Order` SET Status=%s, CancelReason=%s WHERE OrderID=%s", 
                    (payload.status, payload.cancel_reason, order_id)
                )
            
            cur.execute("SELECT UserId, QueueNo FROM `Order` WHERE OrderID=%s", (order_id,))
            o = cur.fetchone()
            if o and o.get('UserId'):
                status_map = {
                    'Cooking': 'กำลังปรุงอาหาร', 
                    'Ready': 'อาหารพร้อมรับแล้ว!', 
                    'Completed': 'รับอาหารเรียบร้อย', 
                    'Cancelled': f'ถูกยกเลิก: {payload.cancel_reason}',
                    'NoShow': 'ออเดอร์ถูกยกเลิกเนื่องจากไม่มารับอาหารเกินเวลา'
                }
                send_notif(db, o['UserId'], f"🔔 ออเดอร์คิว {o['QueueNo']} {status_map.get(payload.status, payload.status)}")
            
            log_audit(db, "UPDATE_STATUS", payload.user_role, f"Order {order_id} -> {payload.status}")
            db.commit()
            return {"success": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/orders/{order_id}/cancel-request")
def request_cancel(order_id: int, payload: CancelRequestSchema, db=Depends(get_db)):
    ensure_order_columns(db)
    with db.cursor() as cur:
        deadline = datetime.now() + timedelta(minutes=payload.response_window_minutes)
        cur.execute("""
            UPDATE `Order` 
            SET Status='Pending_Cancellation', CancelReason=%s, CancelDeadline=%s 
            WHERE OrderID=%s
        """, (payload.reason, deadline, order_id))
        
        cur.execute("SELECT UserId, QueueNo FROM `Order` WHERE OrderID=%s", (order_id,))
        o = cur.fetchone()
        if o and o['UserId']:
            send_notif(db, o['UserId'], f"⚠️ คิว {o['QueueNo']} มีปัญหา: {payload.reason} (กรุณายืนยันใน {payload.response_window_minutes} นาที)")
        
        log_audit(db, "CANCEL_REQUEST", "Front Staff", f"Order {order_id} รอการยืนยันยกเลิก")
        db.commit()
        return {"success": True}

# =====================================================================
# Food Court Global Settings Endpoints
# =====================================================================

@app.get("/api/food-court/status")
def get_food_court_status(db=Depends(get_db)):
    ensure_food_court_setting(db)
    with db.cursor() as cur:
        cur.execute("SELECT IsOpen FROM FoodCourtSetting WHERE SettingId = 1")
        result = cur.fetchone()
        return {"is_open": bool(result["IsOpen"])}

@app.put("/api/food-court/toggle")
def toggle_food_court(db=Depends(get_db)):
    ensure_food_court_setting(db)
    try:
        with db.cursor() as cur:
            cur.execute("UPDATE FoodCourtSetting SET IsOpen = NOT IsOpen WHERE SettingId = 1")
            cur.execute("SELECT IsOpen FROM FoodCourtSetting WHERE SettingId = 1")
            result = cur.fetchone()
            is_open = bool(result["IsOpen"])
            db.commit()

            return {
                "success": True,
                "is_open": is_open,
                "message": "เปิดศูนย์อาหารเรียบร้อยแล้ว" if is_open else "ปิดศูนย์อาหารเรียบร้อยแล้ว"
            }
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(error))

# =====================================================================
# Reports & Audit Logs Endpoints
# =====================================================================

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

@app.get("/api/stores/{store_id}/reviews")
def get_store_reviews(store_id: int, db: Session = Depends(get_db)):
    try:
        # ดึงข้อมูลรีวิวของร้านค้า พร้อมเชื่อมชื่อลูกค้าจากตาราง Users (ถ้ามี)
        reviews = (
            db.query(
                Review.ReviewID,
                Review.Rating,
                Review.Comment,
                Review.ImageURL.label("image_url"),
                Review.CreatedAt,
                Users.FullName.label("CustomerName")
            )
            .outerjoin(Users, Review.UserID == Users.UserId)
            .filter(Review.StoreID == store_id)
            .order_by(Review.CreatedAt.desc())
            .all()
        )

        result = []
        for r in reviews:
            # จัดรูปแบบวันที่ให้อ่านง่าย
            created_date = r.CreatedAt.strftime("%d/%m/%Y %H:%M น.") if r.CreatedAt else ""
            result.append({
                "ReviewID": r.ReviewID,
                "Rating": r.Rating,
                "Comment": r.Comment or "ไม่ได้ระบุข้อความ",
                "image_url": r.image_url or "",
                "CreatedAt": created_date,
                "CustomerName": r.CustomerName or "ผู้ใช้บริการ"
            })

        return result
    except Exception as e:
        print(f"Error fetching store reviews: {e}")
        raise HTTPException(status_code=500, detail="เกิดข้อผิดพลาดในการดึงข้อมูลรีวิว")