SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS onlyfoods_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE onlyfoods_db;

CREATE TABLE IF NOT EXISTS Store (
    StoreId INT AUTO_INCREMENT PRIMARY KEY,
    StoreName VARCHAR(100) NOT NULL,
    IsOpen TINYINT(1) DEFAULT 1,
    IsSuspended TINYINT(1) DEFAULT 0,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Users (
    UserId INT AUTO_INCREMENT PRIMARY KEY,
    Username VARCHAR(50) NOT NULL UNIQUE,
    Password VARCHAR(50) NOT NULL,
    FullName VARCHAR(100) NOT NULL,
    Role ENUM('Customer', 'Front Staff', 'Kitchen Staff', 'Shop Owner', 'Accountant', 'Executive') NOT NULL,
    StoreId INT NULL,
    Points INT DEFAULT 0,
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Product (
    ProductId INT AUTO_INCREMENT PRIMARY KEY,
    StoreId INT NOT NULL,
    ProductName VARCHAR(100) NOT NULL,
    UnitPrice DECIMAL(10, 2) NOT NULL,
    Category VARCHAR(50) DEFAULT 'ทั่วไป',
    IsOutOfStock TINYINT(1) DEFAULT 0,
    FOREIGN KEY (StoreId) REFERENCES Store(StoreId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `Order` (
    OrderID INT AUTO_INCREMENT PRIMARY KEY,
    StoreId INT NOT NULL,
    UserId INT NULL,
    QueueNo VARCHAR(20) NOT NULL,
    TotalAmount DECIMAL(10, 2) NOT NULL,
    Status ENUM('Verifying_Slip', 'Pending', 'Cooking', 'Ready', 'Completed', 'Cancelled') DEFAULT 'Verifying_Slip',
    Note TEXT,
    IsWalkIn TINYINT(1) DEFAULT 0,
    SlipUrl VARCHAR(255) NULL,
    CancelReason VARCHAR(255) NULL,
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
    FOREIGN KEY (OrderID) REFERENCES `Order`(OrderID) ON DELETE CASCADE
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

INSERT INTO Store (StoreId, StoreName, IsOpen, IsSuspended) VALUES 
(1, 'ร้านข้าวแกงวิศวะเดือด', 1, 0), 
(2, 'ชาไทยสถาบัน KMITL', 1, 0),
(3, 'ก๋วยเตี๋ยวเรือตึกพระเทพ', 1, 0)
ON DUPLICATE KEY UPDATE StoreName=VALUES(StoreName);

INSERT INTO Users (Username, Password, FullName, Role, StoreId, Points) VALUES
('uefa01', 'uefa01', 'คุณ ยูฟ่า (ลูกค้า VIP)', 'Customer', NULL, 250),

-- ร้านที่ 1: ร้านข้าวแกงวิศวะเดือด
('staff01', 'staff01', 'ฟลุ้ค หน้าร้าน (ร้านแกง)', 'Front Staff', 1, 0),
('kitchen01', 'kitchen01', 'เชฟฟลุ้ค ห้องครัว (ร้านแกง)', 'Kitchen Staff', 1, 0),
('owner01', 'owner01', 'เสี่ยฟลุ้ค เจ้าของร้านแกง', 'Shop Owner', 1, 0),

-- ร้านที่ 2: ชาไทยสถาบัน KMITL
('staff02', 'staff02', 'พนักงานยูฟ่า หน้าร้าน (ชาไทย)', 'Front Staff', 2, 0),
('kitchen02', 'kitchen02', 'เชฟยูฟ่า ห้องครัว (ชาไทย)', 'Kitchen Staff', 2, 0),

-- ร้านที่ 3: ก๋วยเตี๋ยวเรือตึกพระเทพ
('staff03', 'staff03', 'พนักงานโฟโต้ หน้าร้าน (ก๋วยเตี๋ยวเรือ)', 'Front Staff', 3, 0),
('kitchen03', 'kitchen03', 'เชฟโฟโต้ ห้องครัว (ก๋วยเตี๋ยวเรือ)', 'Kitchen Staff', 3, 0),

-- ฝ่ายบริหาร / บัญชี
('account01', 'account01', 'คุณปัด ฝ่ายบัญชี', 'Accountant', NULL, 0),
('exec01', 'exec01', 'ท่านกัปตัน ผู้บริหารสูงสุด', 'Executive', NULL, 0)
ON DUPLICATE KEY UPDATE FullName=VALUES(FullName);

INSERT INTO Product (StoreId, ProductName, UnitPrice, Category, IsOutOfStock) VALUES 
(1, 'ข้าวราดกะเพราหมูกรอบไข่ดาว', 60.00, 'อาหารจานเดียว', 0),
(1, 'ข้าวแกงเขียวหวานไก่', 50.00, 'อาหารจานเดียว', 0),
(1, 'ไข่ต้มยางมะตูม', 10.00, 'ทานเล่น', 0),
(2, 'ชาไทยสูตรเข้มข้น (เย็น)', 30.00, 'เครื่องดื่ม', 0),
(2, 'ชาเขียวมัทฉะนมสด', 35.00, 'เครื่องดื่ม', 0),
(3, 'ก๋วยเตี๋ยวเรือน้ำตกเนื้อพิเศษ', 55.00, 'ก๋วยเตี๋ยว', 0)
ON DUPLICATE KEY UPDATE ProductName=VALUES(ProductName);