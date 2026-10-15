-- =====================================================================
--  Only Food (OFJA) - demo seed data
--  ported from the OLD init.sql (onlyfoods_db) into the NEW schema
--
--  Run AFTER init.sql:
--     mysql -u root -p < init.sql
--     mysql -u root -p < 02_seed_demo.sql
--
--  What changed on the way in
--   * FoodCourtSetting -> FoodCourt. IsOpen is gone (it is derived now,
--     see v_foodcourt_status). ManualOverride 'AUTO' -> NULL.
--   * Store.Category (free text) -> Store.StoreCategoryId (lookup).
--   * Users.Role (ENUM) -> `User`.RoleId (lookup, same 6 codes).
--   * Users.Points, Cards / CardHolderName / CardLast4 / CardExpiry
--     are NOT carried over - points were cut from the ER, and card data
--     must never sit in this database.
--   * PasswordHash is left NULL on purpose. The old file stored the
--     password in plain text ('uefa01', 'staff01', ...). See section 3.
-- =====================================================================

USE onlyfood;

SET @FC_NAME = 'ศูนย์อาหารกลาง KMITL';


-- ---------------------------------------------------------------------
-- 1) FoodCourt   (old FoodCourtSetting, SettingId = 1)
-- ---------------------------------------------------------------------
INSERT INTO FoodCourt (FoodCourtId, FoodCourtName, Location, OpenTime, CloseTime, ManualOverride, OverrideUntil, UpdatedAt)
VALUES (1, @FC_NAME, 'อาคารศูนย์อาหาร', '08:00:00', '20:00:00', NULL, NULL, NOW());


-- ---------------------------------------------------------------------
-- 2) Store   (old seed: 3 stores, StoreId kept the same)
-- ---------------------------------------------------------------------
INSERT INTO Store (StoreId, StoreName, StoreCategoryId, FoodCourtId, Description, ImageUrl, IsOpen, IsSuspended, AvgPrepMinutes) VALUES
(1, 'ร้านข้าวแกงวิศวะเดือด',
    (SELECT StoreCategoryId FROM StoreCategory WHERE CategoryName = 'อาหารจานเดียว'), 1,
    'ข้าวแกงรสเด็ด เมนูหลากหลาย ทำสดใหม่ทุกวัน',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600', TRUE, FALSE, 10),
(2, 'ชาไทยสถาบัน KMITL',
    (SELECT StoreCategoryId FROM StoreCategory WHERE CategoryName = 'เครื่องดื่ม'), 1,
    'ชาไทย ชาเขียว เครื่องดื่มเย็นชื่นใจ',
    'https://images.unsplash.com/photo-1558857563-b371033873b8?w=600', TRUE, FALSE, 5),
(3, 'ก๋วยเตี๋ยวเรือตึกพระเทพ',
    (SELECT StoreCategoryId FROM StoreCategory WHERE CategoryName = 'ก๋วยเตี๋ยว / เส้น'), 1,
    'ก๋วยเตี๋ยวเรือรสเข้มข้น น้ำตกแท้ ๆ',
    'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600', TRUE, FALSE, 8);


-- ---------------------------------------------------------------------
-- 3) `User`   (old seed: 10 accounts, UserId kept the same)
--
--    PasswordHash IS NULL -> nobody can log in with a password yet.
--    That is deliberate: the old file kept passwords in plain text.
--    Generate real hashes on your own machine, then UPDATE:
--
--      pip install bcrypt
--      python3 -c "import bcrypt;print(bcrypt.hashpw(b'uefa01', bcrypt.gensalt()).decode())"
--
--      UPDATE `User` SET PasswordHash = '$2b$12$....' WHERE Username = 'uefa01';
--
--    Old plaintext passwords, for reference: the password equals the
--    username for every demo account (uefa01 / staff01 / ... / exec01).
-- ---------------------------------------------------------------------
INSERT INTO `User` (UserId, Username, PasswordHash, FullName, RoleId, StoreId, Phone, Email) VALUES
( 1, 'uefa01',    NULL, 'คุณ ยูฟ่า (ลูกค้า VIP)',
      (SELECT RoleId FROM `Role` WHERE RoleCode = 'CUSTOMER'),      NULL, '0812345678', 'uefa01@example.com'),
( 2, 'staff01',   NULL, 'ฟลุ้ค หน้าร้าน',
      (SELECT RoleId FROM `Role` WHERE RoleCode = 'FRONT_STAFF'),      1, '0823456789', 'staff01@example.com'),
( 3, 'kitchen01', NULL, 'เชฟฟลุ้ค ห้องครัว',
      (SELECT RoleId FROM `Role` WHERE RoleCode = 'KITCHEN_STAFF'),    1, '0834567890', 'kitchen01@example.com'),
( 4, 'owner01',   NULL, 'เสี่ยฟลุ้ค เจ้าของร้านแกง',
      (SELECT RoleId FROM `Role` WHERE RoleCode = 'STORE_OWNER'),      1, '0845678901', 'owner01@example.com'),
( 5, 'staff02',   NULL, 'พนักงานยูฟ่า หน้าร้าน (ชาไทย)',
      (SELECT RoleId FROM `Role` WHERE RoleCode = 'FRONT_STAFF'),      2, '0856789012', 'staff02@example.com'),
( 6, 'kitchen02', NULL, 'เชฟยูฟ่า ห้องครัว (ชาไทย)',
      (SELECT RoleId FROM `Role` WHERE RoleCode = 'KITCHEN_STAFF'),    2, '0867890123', 'kitchen02@example.com'),
( 7, 'staff03',   NULL, 'พนักงานโฟโต้ หน้าร้าน (ก๋วยเตี๋ยวเรือ)',
      (SELECT RoleId FROM `Role` WHERE RoleCode = 'FRONT_STAFF'),      3, '0878901234', 'staff03@example.com'),
( 8, 'kitchen03', NULL, 'เชฟโฟโต้ ห้องครัว (ก๋วยเตี๋ยวเรือ)',
      (SELECT RoleId FROM `Role` WHERE RoleCode = 'KITCHEN_STAFF'),    3, '0889012345', 'kitchen03@example.com'),
( 9, 'account01', NULL, 'คุณปัด ฝ่ายบัญชี',
      (SELECT RoleId FROM `Role` WHERE RoleCode = 'ACCOUNTANT'),    NULL, '0890123456', 'account01@example.com'),
(10, 'exec01',    NULL, 'ท่านกัปตัน ผู้บริหารสูงสุด',
      (SELECT RoleId FROM `Role` WHERE RoleCode = 'EXECUTIVE'),     NULL, '0901234567', 'exec01@example.com');

-- CreatedBy is set in a second pass: the executive must exist first.
UPDATE `User` SET CreatedBy = 10 WHERE UserId BETWEEN 2 AND 9;

-- FoodCourt.UpdatedBy likewise (the FK is added at the end of init.sql).
UPDATE FoodCourt SET UpdatedBy = 10 WHERE FoodCourtId = 1;


-- =====================================================================
--  EVERYTHING BELOW IS NEW SAMPLE DATA - the old init.sql had none.
--  Without it the 3 stores have empty menus and you cannot place an
--  order to test with. Delete this part if you would rather key the
--  menu in through the UI.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4) ProductCategory + Product
-- ---------------------------------------------------------------------
INSERT INTO ProductCategory (CategoryId, StoreId, CategoryName, SortOrder) VALUES
(1, 1, 'ข้าวราดแกง',   1),
(2, 1, 'อาหารตามสั่ง', 2),
(3, 2, 'ชา',          1),
(4, 2, 'กาแฟ',        2),
(5, 3, 'ก๋วยเตี๋ยว',   1),
(6, 3, 'ของทานเล่น',  2);

INSERT INTO Product (StoreId, CategoryId, ProductName, Description, UnitPrice, IsOutOfStock) VALUES
(1, 1, 'ข้าวแกงเขียวหวานไก่', 'แกงเขียวหวานไก่ ราดข้าวสวยร้อน ๆ',  45.00, FALSE),
(1, 1, 'ข้าวพะแนงหมู',       'พะแนงหมูนุ่ม กะทิเข้มข้น',          45.00, FALSE),
(1, 2, 'ข้าวผัดกระเพราหมูสับ','ไข่ดาวเพิ่ม 10 บาท',               50.00, FALSE),
(1, 2, 'ข้าวผัดอเมริกัน',     'ไส้กรอก ไข่ดาว ไก่ทอด',            65.00, TRUE),
(2, 3, 'ชาไทยเย็น',          'ชาไทยสูตรต้นตำรับ หวานมัน',         35.00, FALSE),
(2, 3, 'ชาเขียวนมสด',        'ชาเขียวญี่ปุ่น นมสดแท้',            40.00, FALSE),
(2, 4, 'อเมริกาโน่เย็น',      'เข้มไม่ใส่นม',                     40.00, FALSE),
(2, 4, 'ลาเต้เย็น',          'เอสเพรสโซ่ + นมสด',                45.00, FALSE),
(3, 5, 'ก๋วยเตี๋ยวเรือหมูน้ำตก','เส้นเล็ก หมูสับ ลูกชิ้น',           50.00, FALSE),
(3, 5, 'ก๋วยเตี๋ยวเรือเนื้อตุ๋น','เนื้อตุ๋นเปื่อย น้ำซุปเข้มข้น',      60.00, FALSE),
(3, 6, 'แคบหมู',             'กรอบ ๆ ทานเล่น',                   20.00, FALSE),
(3, 6, 'ไข่ลวก',             'ไข่ลวกยางมะตูม',                   15.00, FALSE);


-- ---------------------------------------------------------------------
-- 5) StoreContract   (1 : 1 with Store)
-- ---------------------------------------------------------------------
INSERT INTO StoreContract (StoreId, StartDate, EndDate, MonthlyRent, ContractStatus, CreatedBy) VALUES
(1, '2026-01-01', '2026-12-31', 8000.00,  'ACTIVE',   10),
(2, '2026-01-01', '2026-10-31', 5000.00,  'EXPIRING', 10),  -- ใกล้หมด -> โผล่ใน v_contract_expiring
(3, '2026-03-01', '2027-02-28', 7500.00,  'ACTIVE',   10);


-- ---------------------------------------------------------------------
-- 6) sanity check
-- ---------------------------------------------------------------------
SELECT 'FoodCourt' AS TableName, COUNT(*) AS Cnt FROM FoodCourt
UNION ALL SELECT 'Store',           COUNT(*) FROM Store
UNION ALL SELECT 'User',            COUNT(*) FROM `User`
UNION ALL SELECT 'ProductCategory', COUNT(*) FROM ProductCategory
UNION ALL SELECT 'Product',         COUNT(*) FROM Product
UNION ALL SELECT 'StoreContract',   COUNT(*) FROM StoreContract;

-- expected: 1 / 3 / 10 / 6 / 12 / 3