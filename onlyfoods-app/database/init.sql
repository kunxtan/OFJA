SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS onlyfoods_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE onlyfoods_db;

-- ========================================================
-- 1. กลุ่มศูนย์อาหาร ร้านค้า และสิทธิ์การใช้งาน (Setup & Master)
-- ========================================================

-- FoodCourtSetting: การตั้งค่าเปิด-ปิดศูนย์อาหารส่วนกลาง (สำหรับ Executive)
CREATE TABLE IF NOT EXISTS FoodCourtSetting (
    SettingId INT PRIMARY KEY,
    IsOpen TINYINT(1) NOT NULL DEFAULT 1,
    OpenTime TIME NOT NULL DEFAULT '08:00:00',
    CloseTime TIME NOT NULL DEFAULT '20:00:00',
    ManualOverride VARCHAR(10) NOT NULL DEFAULT 'AUTO',
    OverrideUntil DATETIME NULL,
    UpdatedBy INT NULL,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Store: ข้อมูลร้านค้าและสถานะเปิด/ปิด
CREATE TABLE IF NOT EXISTS Store (
    StoreId INT AUTO_INCREMENT PRIMARY KEY,
    StoreName VARCHAR(100) NOT NULL,
    Category VARCHAR(50) NULL,
    Description TEXT NULL,
    ImageUrl LONGTEXT NULL,
    IsOpen TINYINT(1) DEFAULT 1,              -- Owner กดเปิด/ปิดรับออเดอร์
    IsSuspended TINYINT(1) DEFAULT 0,         -- Executive ระงับสิทธิ์ร้านค้า
    ContactName VARCHAR(100) NULL,
    ContactPhone VARCHAR(20) NULL,
    ContactLine VARCHAR(50) NULL,
    ContactEmail VARCHAR(100) NULL,
    AvgPrepMinutes INT DEFAULT 15,            -- ใช้คำนวณเวลารอรับอาหารโดยประมาณ
    IsDeleted TINYINT(1) NOT NULL DEFAULT 0,  -- Soft delete เมื่อยกเลิกร้านค้า
    DeletedAt DATETIME NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Users: ผู้ใช้งานทุกบทบาท (Customer, Staff, Owner, Accountant, Executive)
CREATE TABLE IF NOT EXISTS Users (
    UserId INT AUTO_INCREMENT PRIMARY KEY,
    Username VARCHAR(50) NOT NULL UNIQUE,
    GoogleId VARCHAR(255) UNIQUE NULL,
    PasswordHash VARCHAR(255) NULL,
    FullName VARCHAR(100) NOT NULL,
    Phone VARCHAR(20) NULL,
    Email VARCHAR(100) NULL,
    Role ENUM('Customer', 'Front Staff', 'Kitchen Staff', 'Shop Owner', 'Accountant', 'Executive') NOT NULL,
    StoreId INT NULL,                         -- สังกัดร้าน (NULL สำหรับ Customer, Accountant, Executive)
    Points INT DEFAULT 0,                     -- แต้มสะสมลูกค้า
    ProfileImgUrl LONGTEXT NULL,
    IsActive TINYINT(1) DEFAULT 1,
    FailedLoginCount INT DEFAULT 0,
    LockedUntil DATETIME NULL,
    CreatedBy INT NULL,                       -- ผู้บริหารสร้างบัญชีให้ Owner
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE SET NULL,
    FOREIGN KEY (CreatedBy) REFERENCES Users(UserId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- StoreContract: สัญญาเช่าพื้นที่ร้านค้า (สำหรับ Executive และ Accountant ตรวจสอบ)
CREATE TABLE IF NOT EXISTS StoreContract (
    ContractId INT AUTO_INCREMENT PRIMARY KEY,
    StoreId INT NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE NOT NULL,
    MonthlyRent DECIMAL(10,2) NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, EXPIRED, TERMINATED
    CreatedBy INT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE CASCADE,
    FOREIGN KEY (CreatedBy) REFERENCES Users(UserId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Printer: เครื่องพิมพ์ใบออเดอร์สำหรับครัวและหน้าร้าน
CREATE TABLE IF NOT EXISTS Printer (
    PrinterId INT AUTO_INCREMENT PRIMARY KEY,
    StoreId INT NOT NULL,
    PrinterName VARCHAR(100) NOT NULL,
    ConnectionType VARCHAR(20) NOT NULL,      -- LAN, USB, BLUETOOTH
    IpAddress VARCHAR(45) NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'ONLINE',
    LastCheckedAt DATETIME NULL,
    LastTestPrintAt DATETIME NULL,
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================================
-- 2. กลุ่มเมนูอาหารและการจัดการราคา (Menu Master)
-- ========================================================

-- ProductCategory: หมวดหมู่อาหารประจำร้าน
CREATE TABLE IF NOT EXISTS ProductCategory (
    CategoryId INT AUTO_INCREMENT PRIMARY KEY,
    StoreId INT NOT NULL,
    CategoryName VARCHAR(100) NOT NULL,
    SortOrder INT DEFAULT 0,
    UNIQUE KEY uq_store_categoryname (StoreId, CategoryName),
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Product: รายการอาหาร
CREATE TABLE IF NOT EXISTS Product (
    ProductId INT AUTO_INCREMENT PRIMARY KEY,
    StoreId INT NOT NULL,
    CategoryId INT NULL,
    ProductName VARCHAR(100) NOT NULL,
    Description TEXT NULL,
    UnitPrice DECIMAL(10, 2) NOT NULL,
    ImgUrl LONGTEXT NULL,
    IsOutOfStock TINYINT(1) DEFAULT 0,        -- หน้าร้าน/ครัวอัปเดตเมื่อของหมด
    IsDeleted TINYINT(1) DEFAULT 0,           -- Soft delete เพื่อไม่ให้กระทบ OrderDetail ย้อนหลัง
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE CASCADE,
    FOREIGN KEY (CategoryId) REFERENCES ProductCategory(CategoryId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ProductPriceHistory: บันทึกประวัติการปรับราคาอาหาร
CREATE TABLE IF NOT EXISTS ProductPriceHistory (
    HistoryId INT AUTO_INCREMENT PRIMARY KEY,
    ProductId INT NOT NULL,
    OldPrice DECIMAL(10,2) NOT NULL,
    NewPrice DECIMAL(10,2) NOT NULL,
    ChangedBy INT NULL,
    ChangedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ProductId) REFERENCES Product(ProductId) ON DELETE CASCADE,
    FOREIGN KEY (ChangedBy) REFERENCES Users(UserId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================================
-- 3. กลุ่มธุรกรรมคำสั่งซื้อและการเงิน (Order & Payment Transactions)
-- ========================================================

-- Order: คำสั่งซื้อหลัก
CREATE TABLE IF NOT EXISTS `Order` (
    OrderID INT AUTO_INCREMENT PRIMARY KEY,
    StoreId INT NOT NULL,
    UserId INT NULL,                          -- ลูกค้า (NULL กรณี Walk-in หน้าร้าน)
    CreatedBy INT NULL,                       -- พนักงานหน้าร้านที่คีย์ออเดอร์ Walk-in
    QueueNo VARCHAR(20) NOT NULL,
    OrderDate DATE GENERATED ALWAYS AS (CAST(CreatedAt AS DATE)) STORED,
    TotalAmount DECIMAL(10, 2) NOT NULL,
    Note TEXT NULL,                           -- หมายเหตุรวมของออเดอร์
    IsWalkIn TINYINT(1) DEFAULT 0,
    Status ENUM(
        'Verifying_Slip',        -- รอตรวจสอบสลิป/การชำระเงินออนไลน์
        'Pending',               -- ชำระแล้ว รอคิว/เตรียมปรุง
        'Cooking',               -- ครัวกำลังทำอาหาร
        'Cooked',                -- ครัวทำเสร็จแล้ว
        'Ready',                 -- หน้าร้านกด "เรียกคิว" (พร้อมส่งมอบ)
        'Completed',             -- หน้าร้านกด "ส่งมอบแล้ว"
        'Pending_Cancellation',  -- ของหมด รอเลือกลบ/เปลี่ยนเมนูใน 30 นาที
        'Cancelled',             -- ยกเลิกออเดอร์ (หมดเวลา 30 นาที หรือลูกค้ายกเลิก)
        'NoShow'                 -- ลูกค้าไม่มารับอาหารเกิน 60 นาที
    ) DEFAULT 'Verifying_Slip',
    PickupTime DATETIME NULL,                 -- เวลานัดรับล่วงหน้าที่ลูกค้าเลือก
    CookedAt DATETIME NULL,                   -- เวลาที่ครัวกดทำเสร็จ
    ReadyAt DATETIME NULL,                    -- เวลาที่หน้าร้านกดเรียกคิว
    CompletedAt DATETIME NULL,                -- เวลาที่ส่งมอบอาหารจริง
    CancelDeadline DATETIME NULL,             -- เส้นตาย 30 นาทีเมื่อมีของหมด
    QrToken VARCHAR(255) UNIQUE NULL,         -- โทเค็นแสดงผลหน้าคิวลูกค้า
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_store_queue_date (StoreId, QueueNo, OrderDate),
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE RESTRICT,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE SET NULL,
    FOREIGN KEY (CreatedBy) REFERENCES Users(UserId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- OrderDetail: รายการอาหารแต่ละจานในออเดอร์
CREATE TABLE IF NOT EXISTS OrderDetail (
    DetailID INT AUTO_INCREMENT PRIMARY KEY,
    OrderID INT NOT NULL,
    ProductId INT NOT NULL,
    Qty INT NOT NULL,
    UnitPrice DECIMAL(10, 2) NOT NULL,        -- Snapshot ราคา ณ วันที่สั่ง
    ItemNote VARCHAR(255) NULL,               -- รายละเอียดพิเศษ เช่น ไม่ใส่ผัก, เผ็ดน้อย
    ItemStatus VARCHAR(20) DEFAULT 'NORMAL',  -- NORMAL, OUT_OF_STOCK, REPLACED, CANCELLED
    FOREIGN KEY (OrderID) REFERENCES `Order`(OrderID) ON DELETE CASCADE,
    FOREIGN KEY (ProductId) REFERENCES Product(ProductId) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payment: การชำระเงินออนไลน์ (1 Order มีได้ 1 รายการ Active แต่รองรับการอัปโหลดสลิปใหม่หากถูก Reject)
CREATE TABLE IF NOT EXISTS Payment (
    PaymentId INT AUTO_INCREMENT PRIMARY KEY,
    OrderID INT NOT NULL,
    Amount DECIMAL(10,2) NOT NULL,
    PaymentMethod VARCHAR(50) NOT NULL,       -- PROMPTPAY, CREDIT_CARD, MOBILE_BANKING
    PaymentStatus VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, VERIFYING, PAID, FAILED, CANCELLED, REFUNDED
    SlipUrl LONGTEXT NULL,
    TransactionRef VARCHAR(100) UNIQUE NULL,
    RejectReason VARCHAR(255) NULL,
    VerifiedBy INT NULL,                      -- พนักงาน/ผู้ดูแลที่ตรวจสลิป
    PaidAt DATETIME NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    ActiveFlag TINYINT GENERATED ALWAYS AS (IF(PaymentStatus IN ('PENDING', 'VERIFYING', 'PAID'), 1, NULL)) STORED,
    UNIQUE KEY uq_order_active_payment (OrderID, ActiveFlag),
    FOREIGN KEY (OrderID) REFERENCES `Order`(OrderID) ON DELETE CASCADE,
    FOREIGN KEY (VerifiedBy) REFERENCES Users(UserId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Refund & RefundItem: คืนเงินสดหน้าร้าน (กรณีเปลี่ยนเมนูหรือยกเลิกบางรายการ)
CREATE TABLE IF NOT EXISTS Refund (
    RefundId INT AUTO_INCREMENT PRIMARY KEY,
    PaymentId INT NOT NULL,
    TotalAmount DECIMAL(10,2) NOT NULL,
    Reason VARCHAR(255) NULL,
    Status VARCHAR(20) DEFAULT 'PENDING',     -- PENDING, COMPLETED, REJECTED
    RequestedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    RefundedBy INT NULL,                      -- พนักงานหน้าร้านที่จ่ายเงินสดคืนลูกค้า
    RefundedAt DATETIME NULL,
    FOREIGN KEY (PaymentId) REFERENCES Payment(PaymentId) ON DELETE CASCADE,
    FOREIGN KEY (RefundedBy) REFERENCES Users(UserId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS RefundItem (
    RefundItemId INT AUTO_INCREMENT PRIMARY KEY,
    RefundId INT NOT NULL,
    DetailID INT NOT NULL,
    Qty INT NOT NULL,
    Amount DECIMAL(10,2) NOT NULL,
    UNIQUE KEY uq_refund_detail (RefundId, DetailID),
    FOREIGN KEY (RefundId) REFERENCES Refund(RefundId) ON DELETE CASCADE,
    FOREIGN KEY (DetailID) REFERENCES OrderDetail(DetailID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================================
-- 4. กลุ่มคิวงานพิมพ์และการส่งออเดอร์เข้าครัว (Printing Jobs)
-- ========================================================

-- PrintJob: งานพิมพ์ใบเสร็จและใบจัดอาหาร
CREATE TABLE IF NOT EXISTS PrintJob (
    PrintJobID INT AUTO_INCREMENT PRIMARY KEY,
    OrderID INT NOT NULL,
    PrinterId INT NULL,
    PrintType VARCHAR(20) NOT NULL DEFAULT 'FIRST_PRINT', -- FIRST_PRINT, REPRINT, RECALL
    AttemptNo INT DEFAULT 1,
    Status VARCHAR(20) NOT NULL DEFAULT 'PENDING',        -- PENDING, PRINTED, FAILED
    ErrorMessage TEXT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    PrintedAt DATETIME NULL,
    PrintedBy INT NULL,
    FOREIGN KEY (OrderID) REFERENCES `Order`(OrderID) ON DELETE CASCADE,
    FOREIGN KEY (PrinterId) REFERENCES Printer(PrinterId) ON DELETE SET NULL,
    FOREIGN KEY (PrintedBy) REFERENCES Users(UserId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PrintLog: บันทึกข้อมูล Snapshot ที่ส่งไปเครื่องพิมพ์จริง
CREATE TABLE IF NOT EXISTS PrintLog (
    PrintLogID INT AUTO_INCREMENT PRIMARY KEY,
    OrderID INT NOT NULL,
    PrintJobID INT NULL,
    PrintType VARCHAR(20) NOT NULL,
    PrinterName VARCHAR(100) NOT NULL,
    QueueNo VARCHAR(20) NOT NULL,
    CustomerName VARCHAR(100) NULL,
    ItemsJson LONGTEXT NOT NULL,
    TotalAmount DECIMAL(10,2) NOT NULL,
    Status VARCHAR(20) NOT NULL,
    PerformedBy INT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (OrderID) REFERENCES `Order`(OrderID) ON DELETE CASCADE,
    FOREIGN KEY (PrintJobID) REFERENCES PrintJob(PrintJobID) ON DELETE SET NULL,
    FOREIGN KEY (PerformedBy) REFERENCES Users(UserId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================================
-- 5. กลุ่มรีวิว ข้อร้องเรียน และการแจ้งเตือน (Engagement & Alerts)
-- ========================================================

-- Review: การให้คะแนนและรีวิว (หลังรับอาหารเสร็จ)
CREATE TABLE IF NOT EXISTS Review (
    ReviewId INT AUTO_INCREMENT PRIMARY KEY,
    OrderID INT NOT NULL UNIQUE,              -- 1 ออเดอร์รีวิวได้ 1 ครั้ง
    StoreId INT NOT NULL,
    UserId INT NOT NULL,
    Rating TINYINT NOT NULL,
    Comment TEXT NULL,
    ImageUrl LONGTEXT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_review_rating CHECK (Rating BETWEEN 1 AND 5),
    FOREIGN KEY (OrderID) REFERENCES `Order`(OrderID) ON DELETE CASCADE,
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE CASCADE,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- IssueReport: ข้อร้องเรียนคุณภาพการให้บริการ
CREATE TABLE IF NOT EXISTS IssueReport (
    ReportID INT AUTO_INCREMENT PRIMARY KEY,
    UserId INT NOT NULL,
    OrderID INT NULL,
    StoreId INT NULL,
    IssueType VARCHAR(100) NOT NULL,
    Description TEXT NOT NULL,
    Status ENUM('Pending', 'In_Progress', 'Resolved', 'Rejected') DEFAULT 'Pending',
    AdminNote TEXT NULL,
    HandledBy INT NULL,                       -- Executive หรือ Admin ที่ดูแลเรื่อง
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    ResolvedAt DATETIME NULL,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE,
    FOREIGN KEY (OrderID) REFERENCES `Order`(OrderID) ON DELETE SET NULL,
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE SET NULL,
    FOREIGN KEY (HandledBy) REFERENCES Users(UserId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Notification: ระบบแจ้งเตือนในระบบ (In-app Notification สำหรับทุกบทบาท)
CREATE TABLE IF NOT EXISTS Notification (
    NotifId INT AUTO_INCREMENT PRIMARY KEY,
    UserId INT NOT NULL,
    Type VARCHAR(50) NOT NULL,                -- OrderReady, OutOfStockNotice, CancelWarning, FoodCourtClosed, HighCancelAlert
    Title VARCHAR(150) NOT NULL,
    Message VARCHAR(255) NOT NULL,
    RefOrderId INT NULL,
    IsRead TINYINT(1) DEFAULT 0,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE,
    FOREIGN KEY (RefOrderId) REFERENCES `Order`(OrderID) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- SystemAlert: การเตือนอัตโนมัติของระบบ (เช่น อัตรายกเลิกสูงผิดปกติ, สัญญาใกล้หมด)
CREATE TABLE IF NOT EXISTS SystemAlert (
    AlertId INT AUTO_INCREMENT PRIMARY KEY,
    AlertType VARCHAR(50) NOT NULL,           -- HIGH_CANCELLATION_RATE, CONTRACT_EXPIRING
    StoreId INT NULL,
    MetricValue DECIMAL(10,2) NULL,
    Threshold DECIMAL(10,2) NULL,
    Severity VARCHAR(20) NOT NULL DEFAULT 'WARNING',
    Status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    AcknowledgedBy INT NULL,                  -- Accountant หรือ Executive ที่กดรับทราบ
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE SET NULL,
    FOREIGN KEY (AcknowledgedBy) REFERENCES Users(UserId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================================
-- 6. กลุ่มสรุปยอด รายงาน และบันทึกประวัติ (Reporting & Audit Logs)
-- ========================================================

-- MonthlyStoreSummary: สรุปยอดขายรายเดือนสำหรับคำนวณค่าเช่า (สำหรับ Accountant)
CREATE TABLE IF NOT EXISTS MonthlyStoreSummary (
    SummaryId INT AUTO_INCREMENT PRIMARY KEY,
    StoreId INT NOT NULL,
    Year INT NOT NULL,
    Month INT NOT NULL,
    TotalOrders INT DEFAULT 0,
    GrossSales DECIMAL(12,2) DEFAULT 0.00,
    RefundAmount DECIMAL(12,2) DEFAULT 0.00,
    NetSales DECIMAL(12,2) DEFAULT 0.00,
    CancelRate DECIMAL(5,2) DEFAULT 0.00,
    IsLocked TINYINT(1) DEFAULT 0,            -- ล็อกตัวเลขไม่ให้เปลี่ยนตามการแก้ไขย้อนหลัง
    GeneratedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    LockedBy INT NULL,
    UNIQUE KEY uq_store_year_month (StoreId, Year, Month),
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE CASCADE,
    FOREIGN KEY (LockedBy) REFERENCES Users(UserId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ExportLog: ประวัติการส่งออกไฟล์รายงาน (สำหรับ Accountant และ Executive)
CREATE TABLE IF NOT EXISTS ExportLog (
    ExportId INT AUTO_INCREMENT PRIMARY KEY,
    UserId INT NOT NULL,
    ReportType VARCHAR(50) NOT NULL,
    Format VARCHAR(10) NOT NULL,              -- CSV, XLSX, PDF
    FilterJson JSON NULL,
    RowCount INT DEFAULT 0,
    IpAddress VARCHAR(45) NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- OrderStatusLog: ประวัติการเปลี่ยนสถานะคำสั่งซื้อแบบ Append-only (ห้ามแก้ไขย้อนหลัง)
CREATE TABLE IF NOT EXISTS OrderStatusLog (
    LogId INT AUTO_INCREMENT PRIMARY KEY,
    OrderID INT NOT NULL,
    OldStatus VARCHAR(50) NULL,
    NewStatus VARCHAR(50) NOT NULL,
    Reason VARCHAR(255) NULL,
    ChangedBy INT NULL,                       -- NULL กรณีระบบเปลี่ยนอัตโนมัติ (เช่น Auto-cancel 30 นาที)
    ChangedByType ENUM('User', 'System') NOT NULL DEFAULT 'User',
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (OrderID) REFERENCES `Order`(OrderID) ON DELETE CASCADE,
    FOREIGN KEY (ChangedBy) REFERENCES Users(UserId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- AuditLog: บันทึกประวัติการกระทำสำคัญของผู้บริหารและร้านค้า
CREATE TABLE IF NOT EXISTS AuditLog (
    LogID INT AUTO_INCREMENT PRIMARY KEY,
    Action VARCHAR(100) NOT NULL,             -- SuspendStore, ChangePrice, UpdateContract, OverrideFoodCourt
    PerformedBy INT NULL,
    PerformerRole VARCHAR(50) NULL,
    EntityType VARCHAR(50) NULL,
    EntityId INT NULL,
    OldValue JSON NULL,
    NewValue JSON NULL,
    IpAddress VARCHAR(45) NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (PerformedBy) REFERENCES Users(UserId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- SecurityLog: บันทึกเหตุการณ์เข้าสู่ระบบและความปลอดภัย
CREATE TABLE IF NOT EXISTS SecurityLog (
    LogId INT AUTO_INCREMENT PRIMARY KEY,
    UserId INT NULL,
    UsernameTried VARCHAR(50) NULL,
    EventType ENUM('LoginSuccess', 'LoginFailed', 'AccountLocked', 'PermissionDenied', 'PasswordChanged', 'RoleChanged') NOT NULL,
    Severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
    IpAddress VARCHAR(45) NULL,
    DeviceInfo TEXT NULL,
    Details TEXT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================================
-- 7. ข้อมูลตั้งต้น (Initial Seed Data)
-- ========================================================

-- ตั้งค่าเวลาเปิด-ปิดศูนย์อาหาร
INSERT IGNORE INTO FoodCourtSetting (SettingId, IsOpen, OpenTime, CloseTime, ManualOverride, OverrideUntil)
VALUES (1, 1, '08:00:00', '20:00:00', 'AUTO', NULL);

-- ข้อมูลร้านค้าเริ่มต้น
INSERT INTO Store (StoreId, StoreName, Category, Description, ImageUrl, IsOpen, IsSuspended) VALUES 
(1, 'ร้านข้าวแกงวิศวะเดือด', 'อาหารจานเดียว', 'ข้าวแกงรสเด็ด เมนูหลากหลาย ทำสดใหม่ทุกวัน', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600', 1, 0), 
(2, 'ชาไทยสถาบัน KMITL', 'เครื่องดื่ม', 'ชาไทย ชาเขียว เครื่องดื่มเย็นชื่นใจ', 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=600', 1, 0),
(3, 'ก๋วยเตี๋ยวเรือตึกพระเทพ', 'ก๋วยเตี๋ยว', 'ก๋วยเตี๋ยวเรือรสเข้มข้น น้ำตกแท้ๆ', 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600', 1, 0)
ON DUPLICATE KEY UPDATE 
    StoreName=VALUES(StoreName), 
    ImageUrl=VALUES(ImageUrl), 
    Description=VALUES(Description);

-- ข้อมูลผู้ใช้งานระบบครบทุก Role
INSERT INTO Users (Username, PasswordHash, FullName, Role, StoreId, Points, Phone, Email) VALUES
('uefa01', 'uefa01', 'คุณ ยูฟ่า (ลูกค้า VIP)', 'Customer', NULL, 250, '0812345678', 'uefa01@example.com'),
('staff01', 'staff01', 'ฟลุ้ค หน้าร้าน', 'Front Staff', 1, 0, '0823456789', 'staff01@example.com'),
('kitchen01', 'kitchen01', 'เชฟฟลุ้ค ห้องครัว', 'Kitchen Staff', 1, 0, '0834567890', 'kitchen01@example.com'),
('owner01', 'owner01', 'เสี่ยฟลุ้ค เจ้าของร้านแกง', 'Shop Owner', 1, 0, '0845678901', 'owner01@example.com'),
('staff02', 'staff02', 'พนักงานยูฟ่า หน้าร้าน (ชาไทย)', 'Front Staff', 2, 0, '0856789012', 'staff02@example.com'),
('kitchen02', 'kitchen02', 'เชฟยูฟ่า ห้องครัว (ชาไทย)', 'Kitchen Staff', 2, 0, '0867890123', 'kitchen02@example.com'),
('staff03', 'staff03', 'พนักงานโฟโต้ หน้าร้าน (ก๋วยเตี๋ยวเรือ)', 'Front Staff', 3, 0, '0878901234', 'staff03@example.com'),
('kitchen03', 'kitchen03', 'เชฟโฟโต้ ห้องครัว (ก๋วยเตี๋ยวเรือ)', 'Kitchen Staff', 3, 0, '0889012345', 'kitchen03@example.com'),
('account01', 'account01', 'คุณปัด ฝ่ายบัญชี', 'Accountant', NULL, 0, '0890123456', 'account01@example.com'),
('exec01', 'exec01', 'ท่านกัปตัน ผู้บริหารสูงสุด', 'Executive', NULL, 0, '0901234567', 'exec01@example.com')
ON DUPLICATE KEY UPDATE FullName=VALUES(FullName);
-- ========================================================
-- 8. Compatibility columns for current Only Foods backend
-- ========================================================
ALTER TABLE Users
    ADD COLUMN IF NOT EXISTS Password VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS ProfileImg LONGTEXT NULL,
    ADD COLUMN IF NOT EXISTS Cards LONGTEXT NULL,
    ADD COLUMN IF NOT EXISTS CardHolderName VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS CardLast4 VARCHAR(4) NULL,
    ADD COLUMN IF NOT EXISTS CardExpiry VARCHAR(5) NULL;

UPDATE Users SET Password = PasswordHash WHERE Password IS NULL;

ALTER TABLE Product
    ADD COLUMN IF NOT EXISTS img MEDIUMTEXT NULL;

ALTER TABLE `Order`
    ADD COLUMN IF NOT EXISTS CancelReason VARCHAR(500) NULL,
    ADD COLUMN IF NOT EXISTS OrderTime VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS IsReviewed TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE AuditLog
    ADD COLUMN IF NOT EXISTS Details TEXT NULL;

CREATE TABLE IF NOT EXISTS Notifications (
    NotifId INT AUTO_INCREMENT PRIMARY KEY,
    UserId INT NOT NULL,
    Message VARCHAR(255) NOT NULL,
    IsRead TINYINT(1) DEFAULT 0,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
