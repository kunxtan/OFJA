SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS onlyfoods_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE onlyfoods_db;

CREATE TABLE IF NOT EXISTS Store (
    StoreId INT AUTO_INCREMENT PRIMARY KEY,
    StoreName VARCHAR(100) NOT NULL,
    IsOpen TINYINT(1) DEFAULT 1,
    IsSuspended TINYINT(1) DEFAULT 0,
    Category VARCHAR(50) NULL,
    ContactName VARCHAR(100) NULL,
    ContactPhone VARCHAR(20) NULL,
    ContactLine VARCHAR(50) NULL,
    ContactEmail VARCHAR(100) NULL,
    Description VARCHAR(300) NULL,
    ImageUrl MEDIUMTEXT NULL,
    ContractStartDate DATE NULL,
    ContractEndDate DATE NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Users (
    UserId INT AUTO_INCREMENT PRIMARY KEY,
    Username VARCHAR(50) NOT NULL UNIQUE,
    GoogleId VARCHAR(255) UNIQUE NULL,
    Password VARCHAR(255) NULL,
    FullName VARCHAR(100) NOT NULL,
    Role ENUM('Customer', 'Front Staff', 'Kitchen Staff', 'Shop Owner', 'Accountant', 'Executive') NOT NULL,
    StoreId INT NULL,
    Points INT DEFAULT 0,
    Phone VARCHAR(20) NULL,
    Email VARCHAR(100) NULL,
    ProfileImg LONGTEXT NULL,
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Product (
    ProductId INT AUTO_INCREMENT PRIMARY KEY,
    StoreId INT NOT NULL,
    ProductName VARCHAR(100) NOT NULL,
    UnitPrice DECIMAL(10, 2) NOT NULL,
    Category VARCHAR(50) DEFAULT 'ทั่วไป',
    IsOutOfStock TINYINT(1) DEFAULT 0,
    img LONGTEXT NULL,
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `Order` (
    OrderID INT AUTO_INCREMENT PRIMARY KEY,
    StoreId INT NOT NULL,
    UserId INT NULL,
    QueueNo VARCHAR(20) NOT NULL,
    TotalAmount DECIMAL(10, 2) NOT NULL,
    Status ENUM('Verifying_Slip', 'Pending', 'Cooking', 'Ready', 'Completed', 'Cancelled', 'Pending_Cancellation', 'NoShow') DEFAULT 'Verifying_Slip',
    Note TEXT,
    IsWalkIn TINYINT(1) DEFAULT 0,
    SlipUrl LONGTEXT NULL,
    PaymentMethod VARCHAR(50) NULL,
    PickupTime VARCHAR(50) NULL,
    OrderTime VARCHAR(50) NULL,
    CancelReason VARCHAR(255) NULL,
    IsReviewed TINYINT(1) DEFAULT 0,
    ReadyAt DATETIME NULL,
    CancelDeadline DATETIME NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS OrderDetail (
    DetailID INT AUTO_INCREMENT PRIMARY KEY,
    OrderID INT NOT NULL,
    ProductId INT NOT NULL,
    Qty INT NOT NULL,
    UnitPrice DECIMAL(10, 2) NOT NULL,
    ItemNote VARCHAR(255),
    FOREIGN KEY (OrderID) REFERENCES `Order`(OrderID) ON DELETE CASCADE,
    FOREIGN KEY (ProductId) REFERENCES Product(ProductId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Review (
    ReviewId INT AUTO_INCREMENT PRIMARY KEY,
    OrderID INT NOT NULL,
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

CREATE TABLE IF NOT EXISTS Notifications (
    NotifId INT AUTO_INCREMENT PRIMARY KEY,
    UserId INT NOT NULL,
    Message VARCHAR(255) NOT NULL,
    IsRead TINYINT(1) DEFAULT 0,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS AuditLog (
    LogID INT AUTO_INCREMENT PRIMARY KEY,
    Action VARCHAR(100) NOT NULL,
    PerformedBy VARCHAR(100) NOT NULL,
    Details TEXT,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS IssueReport (
    ReportID INT AUTO_INCREMENT PRIMARY KEY,
    UserId INT NOT NULL,
    OrderID INT NULL,
    StoreId INT NULL,
    IssueType VARCHAR(100) NOT NULL,
    Description TEXT NOT NULL,
    Status ENUM('Pending', 'In_Progress', 'Resolved', 'Rejected') DEFAULT 'Pending',
    AdminNote TEXT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE,
    FOREIGN KEY (OrderID) REFERENCES `Order`(OrderID) ON DELETE SET NULL,
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS FoodCourtSetting (
    SettingId TINYINT PRIMARY KEY,
    IsOpen TINYINT(1) NOT NULL DEFAULT 1,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ข้อมูลตั้งต้น
INSERT IGNORE INTO FoodCourtSetting (SettingId, IsOpen) VALUES (1, 1);

INSERT INTO Store (StoreId, StoreName, IsOpen, IsSuspended) VALUES 
(1, 'ร้านข้าวแกงวิศวะเดือด', 1, 0), 
(2, 'ชาไทยสถาบัน KMITL', 1, 0),
(3, 'ก๋วยเตี๋ยวเรือตึกพระเทพ', 1, 0)
ON DUPLICATE KEY UPDATE StoreName=VALUES(StoreName);

INSERT INTO Users (Username, Password, FullName, Role, StoreId, Points, Phone, Email) VALUES
('uefa01', 'uefa01', 'คุณ ยูฟ่า (ลูกค้า VIP)', 'Customer', NULL, 250, '0812345678', 'uefa01@example.com'),
('staff01', 'staff01', 'ฟลุ้ค หน้าร้าน (ร้านแกง)', 'Front Staff', 1, 0, '0823456789', 'staff01@example.com'),
('kitchen01', 'kitchen01', 'เชฟฟลุ้ค ห้องครัว (ร้านแกง)', 'Kitchen Staff', 1, 0, '0834567890', 'kitchen01@example.com'),
('owner01', 'owner01', 'เสี่ยฟลุ้ค เจ้าของร้านแกง', 'Shop Owner', 1, 0, '0845678901', 'owner01@example.com'),
('staff02', 'staff02', 'พนักงานยูฟ่า หน้าร้าน (ชาไทย)', 'Front Staff', 2, 0, '0856789012', 'staff02@example.com'),
('kitchen02', 'kitchen02', 'เชฟยูฟ่า ห้องครัว (ชาไทย)', 'Kitchen Staff', 2, 0, '0867890123', 'kitchen02@example.com'),
('staff03', 'staff03', 'พนักงานโฟโต้ หน้าร้าน (ก๋วยเตี๋ยวเรือ)', 'Front Staff', 3, 0, '0878901234', 'staff03@example.com'),
('kitchen03', 'kitchen03', 'เชฟโฟโต้ ห้องครัว (ก๋วยเตี๋ยวเรือ)', 'Kitchen Staff', 3, 0, '0889012345', 'kitchen03@example.com'),
('account01', 'account01', 'คุณปัด ฝ่ายบัญชี', 'Accountant', NULL, 0, '0890123456', 'account01@example.com'),
('exec01', 'exec01', 'ท่านกัปตัน ผู้บริหารสูงสุด', 'Executive', NULL, 0, '0901234567', 'exec01@example.com')
ON DUPLICATE KEY UPDATE FullName=VALUES(FullName);

INSERT INTO Product (StoreId, ProductName, UnitPrice, Category, IsOutOfStock) VALUES 
(1, 'ข้าวราดกะเพราหมูกรอบไข่ดาว', 60.00, 'อาหารจานเดียว', 0),
(1, 'ข้าวแกงเขียวหวานไก่', 50.00, 'อาหารจานเดียว', 0),
(1, 'ไข่ต้มยางมะตูม', 10.00, 'ทานเล่น', 0),
(2, 'ชาไทยสูตรเข้มข้น (เย็น)', 30.00, 'เครื่องดื่ม', 0),
(2, 'ชาเขียวมัทฉะนมสด', 35.00, 'เครื่องดื่ม', 0),
(3, 'ก๋วยเตี๋ยวเรือน้ำตกเนื้อพิเศษ', 55.00, 'ก๋วยเตี๋ยว', 0)
ON DUPLICATE KEY UPDATE ProductName=VALUES(ProductName);