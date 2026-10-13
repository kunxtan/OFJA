-- =====================================================================
--  Only Food (OFJA) - data migration
--  FROM : onlyfoods_db   (old schema, ENUM-based)
--  TO   : onlyfood       (new schema, 22 tables, lookup-based)
--
--  HOW TO RUN
--    1. keep the old database in place - this script only READS from it
--    2. mysql -u root -p < init.sql                 (creates onlyfood)
--    3. run SECTION 1 of this file on its own and read the output
--    4. fix whatever it reports, then run SECTION 2 onward
--
--    Do NOT run 02_seed_demo.sql as well - that file inserts the same
--    stores and users and the IDs would clash.
--
--  WHAT IS NOT CARRIED OVER (and why)
--    Users.PasswordHash  - the old column holds PLAIN TEXT. Copying it
--                          would keep the worst bug in the system, so
--                          every account lands with PasswordHash = NULL
--                          and has to set a new password.
--    Users.Password, Cards, CardHolderName, CardLast4, CardExpiry
--                        - card data must not live in this database.
--    Users.Points        - points were cut from the ER.
--    Printer             - gone as a table; PrinterName / PrinterStatus
--                          survive on each PrintJob row.
--    ProductPriceHistory, SecurityLog, ExportLog, SystemAlert
--                        - folded into AuditLog (section 6).
--    Order.QrToken, OrderTime, IsReviewed
--                        - QrToken was never required; IsReviewed is
--                          derivable (EXISTS a Review row).
--    Order.CookedAt / CompletedAt
--                        - derivable from OrderStatusLog. Section 5b
--                          rebuilds log rows for orders that have none.
--    Payment.TransactionRef
--                        - no column in the new ER; kept in AuditLog
--                          so the reference is not lost (section 6).
-- =====================================================================

SET NAMES utf8mb4;
SET SESSION sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';


-- =====================================================================
--  SECTION 1 - PRE-FLIGHT CHECKS   (read-only; run this part first)
--  Every query should return 0 rows. Anything it returns would either
--  break a constraint or be silently dropped.
-- =====================================================================

SELECT '1.1 orders with no customer AND no staff (violates ck_order_actor)' AS Check_, COUNT(*) AS Cnt
FROM onlyfoods_db.`Order` WHERE UserId IS NULL AND CreatedBy IS NULL
UNION ALL
SELECT '1.2 duplicate store names (StoreName is UNIQUE now)', COUNT(*)
FROM (SELECT StoreName FROM onlyfoods_db.Store GROUP BY StoreName HAVING COUNT(*) > 1) x
UNION ALL
SELECT '1.3 stores with more than one contract (only the latest is kept)', COUNT(*)
FROM (SELECT StoreId FROM onlyfoods_db.StoreContract GROUP BY StoreId HAVING COUNT(*) > 1) x
UNION ALL
SELECT '1.4 contracts with EndDate <= StartDate (skipped)', COUNT(*)
FROM onlyfoods_db.StoreContract WHERE EndDate <= StartDate
UNION ALL
SELECT '1.5 duplicate product names in one store (extras merged)', COUNT(*)
FROM (SELECT StoreId, ProductName FROM onlyfoods_db.Product GROUP BY StoreId, ProductName HAVING COUNT(*) > 1) x
UNION ALL
SELECT '1.6 payments with Amount <= 0 (skipped)', COUNT(*)
FROM onlyfoods_db.Payment WHERE Amount <= 0
UNION ALL
SELECT '1.7 orders with >1 live payment (older ones forced to REJECTED)', COUNT(*)
FROM (SELECT OrderID FROM onlyfoods_db.Payment
      WHERE UPPER(PaymentStatus) IN ('PENDING','VERIFYING','PAID','REFUNDED')
      GROUP BY OrderID HAVING COUNT(*) > 1) x
UNION ALL
SELECT '1.8 refund items pointing at the same order line (extras skipped)', COUNT(*)
FROM (SELECT DetailID FROM onlyfoods_db.RefundItem GROUP BY DetailID HAVING COUNT(*) > 1) x
UNION ALL
SELECT '1.9 issue reports with no store and no order (skipped)', COUNT(*)
FROM onlyfoods_db.IssueReport WHERE StoreId IS NULL AND OrderID IS NULL
UNION ALL
SELECT '1.10 reviews with Rating outside 1-5 (skipped)', COUNT(*)
FROM onlyfoods_db.Review WHERE Rating < 1 OR Rating > 5
UNION ALL
SELECT '1.11 summaries with Year outside 2020-2100 (skipped)', COUNT(*)
FROM onlyfoods_db.MonthlyStoreSummary WHERE Year < 2020 OR Year > 2100
UNION ALL
SELECT '1.12 queue numbers with no digits at all (renumbered)', COUNT(*)
FROM onlyfoods_db.`Order` WHERE REGEXP_REPLACE(QueueNo, '[^0-9]', '') = ''
UNION ALL
SELECT '1.13 queue numbers >= 50000 (would clash with renumbering)', COUNT(*)
FROM onlyfoods_db.`Order`
WHERE CAST(NULLIF(REGEXP_REPLACE(QueueNo, '[^0-9]', ''), '') AS UNSIGNED) >= 50000
UNION ALL
SELECT '1.14 store images stored as base64 / over 500 chars (dropped)', COUNT(*)
FROM onlyfoods_db.Store WHERE ImageUrl LIKE 'data:%' OR CHAR_LENGTH(ImageUrl) > 500
UNION ALL
SELECT '1.15 product images stored as base64 / over 500 chars (dropped)', COUNT(*)
FROM onlyfoods_db.Product WHERE ImgUrl LIKE 'data:%' OR CHAR_LENGTH(ImgUrl) > 500
UNION ALL
SELECT '1.16 profile images stored as base64 / over 500 chars (dropped)', COUNT(*)
FROM onlyfoods_db.Users WHERE ProfileImgUrl LIKE 'data:%' OR CHAR_LENGTH(ProfileImgUrl) > 500
UNION ALL
SELECT '1.17 GoogleId longer than 100 chars (dropped)', COUNT(*)
FROM onlyfoods_db.Users WHERE CHAR_LENGTH(TRIM(GoogleId)) > 100
UNION ALL
SELECT '1.18 status log rows whose NewStatus is not a known status (skipped)', COUNT(*)
FROM onlyfoods_db.OrderStatusLog l
WHERE NOT EXISTS (SELECT 1 FROM onlyfood.OrderStatus s
                  WHERE s.StatusCode = CASE WHEN l.NewStatus = 'NoShow' THEN 'NO_SHOW' ELSE UPPER(l.NewStatus) END);

-- these two must both be non-empty, otherwise you are pointing at the wrong databases
SELECT 'old tables found' AS Check_, COUNT(*) AS Cnt FROM information_schema.tables WHERE table_schema = 'onlyfoods_db'
UNION ALL
SELECT 'new tables found', COUNT(*) FROM information_schema.tables WHERE table_schema = 'onlyfood' AND table_type = 'BASE TABLE';


-- =====================================================================
--  SECTION 2 - SCAFFOLDING
-- =====================================================================

USE onlyfood;

-- Rows that could not be migrated end up here instead of vanishing.
CREATE TABLE IF NOT EXISTS _mig_rejects (
  RejectId   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  SourceName VARCHAR(50)  NOT NULL,
  SourceKey  VARCHAR(50)  NOT NULL,
  Reason     VARCHAR(255) NOT NULL,
  PRIMARY KEY (RejectId)
) ENGINE=InnoDB;

-- old ProductId -> kept ProductId (duplicate names collapse into one row)
CREATE TABLE IF NOT EXISTS _mig_product_map (
  OldProductId INT UNSIGNED NOT NULL,
  NewProductId INT UNSIGNED NOT NULL,
  PRIMARY KEY (OldProductId)
) ENGINE=InnoDB;

SET @CAT_OTHER = (SELECT StoreCategoryId FROM StoreCategory WHERE CategoryName = 'อื่น ๆ');


-- ---------------------------------------------------------------------
-- 2.1 grow the lookup tables so no old value is lost
-- ---------------------------------------------------------------------

INSERT IGNORE INTO StoreCategory (CategoryName, SortOrder)
SELECT DISTINCT LEFT(TRIM(s.Category), 50), 50
FROM onlyfoods_db.Store s
WHERE s.Category IS NOT NULL AND TRIM(s.Category) <> '';

-- PROMPTPAY is the old spelling of QR_PROMPTPAY; anything else becomes
-- its own method row rather than being thrown away.
INSERT IGNORE INTO PaymentMethod (MethodCode, MethodNameTh, RequiresSlip, IsActive)
SELECT DISTINCT LEFT(UPPER(TRIM(p.PaymentMethod)), 20), LEFT(UPPER(TRIM(p.PaymentMethod)), 50), TRUE, TRUE
FROM onlyfoods_db.Payment p
WHERE p.PaymentMethod IS NOT NULL
  AND UPPER(TRIM(p.PaymentMethod)) NOT IN ('PROMPTPAY', 'QR_PROMPTPAY', 'CASH', 'MOBILE_BANKING');

INSERT IGNORE INTO IssueType (TypeCode, TypeNameTh, IsActive)
SELECT DISTINCT LEFT(UPPER(REPLACE(TRIM(i.IssueType), ' ', '_')), 25), LEFT(TRIM(i.IssueType), 50), TRUE
FROM onlyfoods_db.IssueReport i
WHERE i.IssueType IS NOT NULL AND TRIM(i.IssueType) <> '';


-- =====================================================================
--  SECTION 3 - MASTER DATA
-- =====================================================================

-- 3.1 FoodCourtSetting -> FoodCourt
--     IsOpen is dropped: open/closed is derived now (v_foodcourt_status).
--     ManualOverride 'AUTO' -> NULL, 'OPEN' -> TRUE, 'CLOSE(D)' -> FALSE.
INSERT INTO FoodCourt (FoodCourtId, FoodCourtName, Location, OpenTime, CloseTime, ManualOverride, OverrideUntil, UpdatedAt)
SELECT 1,
       'ศูนย์อาหารกลาง KMITL',
       NULL,
       COALESCE(f.OpenTime,  '08:00:00'),
       COALESCE(f.CloseTime, '20:00:00'),
       CASE UPPER(TRIM(COALESCE(f.ManualOverride, 'AUTO')))
         WHEN 'OPEN'   THEN TRUE
         WHEN 'CLOSE'  THEN FALSE
         WHEN 'CLOSED' THEN FALSE
         ELSE NULL
       END,
       f.OverrideUntil,
       COALESCE(f.UpdatedAt, NOW())
FROM onlyfoods_db.FoodCourtSetting f
WHERE f.SettingId = 1;

-- fallback if the old table was empty
INSERT INTO FoodCourt (FoodCourtId, FoodCourtName, OpenTime, CloseTime, UpdatedAt)
SELECT 1, 'ศูนย์อาหารกลาง KMITL', '08:00:00', '20:00:00', NOW()
WHERE NOT EXISTS (SELECT 1 FROM FoodCourt WHERE FoodCourtId = 1);


-- 3.2 Store
INSERT INTO Store (StoreId, StoreName, StoreCategoryId, FoodCourtId, Description, ImageUrl,
                   IsOpen, IsSuspended, AvgPrepMinutes,
                   ContactName, ContactPhone, ContactLine, ContactEmail,
                   IsDeleted, DeletedAt, CreatedAt)
SELECT s.StoreId,
       s.StoreName,
       COALESCE(sc.StoreCategoryId, @CAT_OTHER),
       1,
       LEFT(s.Description, 500),
       CASE WHEN s.ImageUrl LIKE 'data:%' OR CHAR_LENGTH(s.ImageUrl) > 500 THEN NULL ELSE s.ImageUrl END,
       COALESCE(s.IsOpen, FALSE),
       COALESCE(s.IsSuspended, FALSE),
       LEAST(GREATEST(COALESCE(s.AvgPrepMinutes, 15), 1), 65535),
       s.ContactName, s.ContactPhone, s.ContactLine, s.ContactEmail,
       COALESCE(s.IsDeleted, FALSE), s.DeletedAt, COALESCE(s.CreatedAt, NOW())
FROM onlyfoods_db.Store s
LEFT JOIN StoreCategory sc ON sc.CategoryName = TRIM(s.Category)
WHERE s.StoreId = (SELECT MIN(x.StoreId) FROM onlyfoods_db.Store x WHERE x.StoreName = s.StoreName);

INSERT INTO _mig_rejects (SourceName, SourceKey, Reason)
SELECT 'Store', CAST(s.StoreId AS CHAR), CONCAT('duplicate StoreName: ', s.StoreName)
FROM onlyfoods_db.Store s
WHERE s.StoreId <> (SELECT MIN(x.StoreId) FROM onlyfoods_db.Store x WHERE x.StoreName = s.StoreName);


-- 3.3 Users -> `User`   (pass 1: CreatedBy left NULL)
INSERT INTO `User` (UserId, Username, PasswordHash, GoogleId, FullName, Phone, Email,
                    RoleId, StoreId, ProfileImageUrl, IsActive, FailedLoginCount, LockedUntil, CreatedAt)
SELECT u.UserId,
       u.Username,
       NULL,                                   -- old value was plain text; force a reset
       IF(CHAR_LENGTH(TRIM(u.GoogleId)) > 100, NULL, NULLIF(TRIM(u.GoogleId), '')),
       u.FullName,
       u.Phone,
       u.Email,
       r.RoleId,
       ns.StoreId,                             -- NULL if that store did not migrate
       CASE WHEN u.ProfileImgUrl LIKE 'data:%' OR CHAR_LENGTH(u.ProfileImgUrl) > 500
            THEN NULL ELSE u.ProfileImgUrl END,
       COALESCE(u.IsActive, TRUE),
       LEAST(COALESCE(u.FailedLoginCount, 0), 255),
       u.LockedUntil,
       COALESCE(u.CreatedAt, NOW())
FROM onlyfoods_db.Users u
JOIN Role r ON r.RoleCode = CASE u.Role
       WHEN 'Customer'      THEN 'CUSTOMER'
       WHEN 'Front Staff'   THEN 'FRONT_STAFF'
       WHEN 'Kitchen Staff' THEN 'KITCHEN_STAFF'
       WHEN 'Shop Owner'    THEN 'STORE_OWNER'
       WHEN 'Accountant'    THEN 'ACCOUNTANT'
       WHEN 'Executive'     THEN 'EXECUTIVE'
       ELSE 'CUSTOMER'
     END
LEFT JOIN Store ns ON ns.StoreId = u.StoreId;

-- pass 2: now that every row exists, point CreatedBy at it
UPDATE `User` nu
JOIN onlyfoods_db.Users ou ON ou.UserId = nu.UserId
JOIN `User` creator        ON creator.UserId = ou.CreatedBy
SET nu.CreatedBy = creator.UserId;

SET @EXEC_ID = (SELECT MIN(u.UserId) FROM `User` u
                JOIN Role r ON r.RoleId = u.RoleId
                WHERE r.RoleCode IN ('EXECUTIVE', 'ACCOUNTANT'));
SET @EXEC_ID = COALESCE(@EXEC_ID, (SELECT MIN(UserId) FROM `User`));


-- 3.4 StoreContract   (new schema is 1 : 1 -> keep the latest contract only)
INSERT INTO StoreContract (ContractId, StoreId, StartDate, EndDate, MonthlyRent, ContractStatus, CreatedBy, CreatedAt)
SELECT sc.ContractId,
       sc.StoreId,
       sc.StartDate,
       sc.EndDate,
       GREATEST(COALESCE(sc.MonthlyRent, 0), 0),
       CASE UPPER(TRIM(COALESCE(sc.Status, 'ACTIVE')))
         WHEN 'EXPIRED'    THEN 'EXPIRED'
         WHEN 'EXPIRING'   THEN 'EXPIRING'
         WHEN 'TERMINATED' THEN 'TERMINATED'
         ELSE 'ACTIVE'
       END,
       COALESCE(cb.UserId, @EXEC_ID),
       COALESCE(sc.CreatedAt, NOW())
FROM onlyfoods_db.StoreContract sc
JOIN Store s         ON s.StoreId = sc.StoreId
LEFT JOIN `User` cb  ON cb.UserId = sc.CreatedBy
WHERE sc.EndDate > sc.StartDate
  AND sc.ContractId = (
        SELECT x.ContractId FROM onlyfoods_db.StoreContract x
        WHERE x.StoreId = sc.StoreId AND x.EndDate > x.StartDate
        ORDER BY x.EndDate DESC, x.ContractId DESC LIMIT 1);

INSERT INTO _mig_rejects (SourceName, SourceKey, Reason)
SELECT 'StoreContract', CAST(sc.ContractId AS CHAR),
       IF(sc.EndDate <= sc.StartDate, 'EndDate <= StartDate', 'superseded: new schema keeps 1 contract per store')
FROM onlyfoods_db.StoreContract sc
WHERE NOT EXISTS (SELECT 1 FROM StoreContract n WHERE n.ContractId = sc.ContractId);


-- 3.5 ProductCategory
-- CategoryName shrinks from VARCHAR(100) to VARCHAR(50), so two long names in
-- one store can collide on uk_prodcat_store_name. INSERT IGNORE keeps the first.
INSERT IGNORE INTO ProductCategory (CategoryId, StoreId, CategoryName, SortOrder)
SELECT pc.CategoryId, pc.StoreId, LEFT(pc.CategoryName, 50),
       LEAST(GREATEST(COALESCE(pc.SortOrder, 0), 0), 255)
FROM onlyfoods_db.ProductCategory pc
JOIN Store s ON s.StoreId = pc.StoreId
ORDER BY pc.StoreId, pc.CategoryId;

INSERT INTO _mig_rejects (SourceName, SourceKey, Reason)
SELECT 'ProductCategory', CAST(pc.CategoryId AS CHAR), 'name collided after shortening to 50 chars'
FROM onlyfoods_db.ProductCategory pc
WHERE NOT EXISTS (SELECT 1 FROM ProductCategory n WHERE n.CategoryId = pc.CategoryId);


-- 3.6 Product   (duplicate names inside one store collapse; the map keeps
--                old order lines pointing at the surviving row)
INSERT INTO _mig_product_map (OldProductId, NewProductId)
SELECT p.ProductId, k.KeepId
FROM onlyfoods_db.Product p
JOIN (SELECT StoreId, ProductName, MIN(ProductId) AS KeepId
      FROM onlyfoods_db.Product GROUP BY StoreId, ProductName) k
  ON k.StoreId = p.StoreId AND k.ProductName = p.ProductName;

INSERT INTO Product (ProductId, StoreId, CategoryId, ProductName, Description, UnitPrice,
                     ImageUrl, IsOutOfStock, IsDeleted, CreatedAt, UpdatedAt)
SELECT p.ProductId,
       p.StoreId,
       nc.CategoryId,
       p.ProductName,
       LEFT(p.Description, 500),
       GREATEST(COALESCE(p.UnitPrice, 0), 0),
       CASE WHEN p.ImgUrl LIKE 'data:%' OR CHAR_LENGTH(p.ImgUrl) > 500 THEN NULL ELSE p.ImgUrl END,
       COALESCE(p.IsOutOfStock, FALSE),
       COALESCE(p.IsDeleted, FALSE),
       COALESCE(p.UpdatedAt, NOW()),            -- old Product had no CreatedAt
       COALESCE(p.UpdatedAt, NOW())
FROM onlyfoods_db.Product p
JOIN Store s                 ON s.StoreId  = p.StoreId
JOIN _mig_product_map m      ON m.OldProductId = p.ProductId AND m.NewProductId = p.ProductId
LEFT JOIN ProductCategory nc ON nc.CategoryId = p.CategoryId;

INSERT INTO _mig_rejects (SourceName, SourceKey, Reason)
SELECT 'Product', CAST(m.OldProductId AS CHAR), CONCAT('merged into ProductId ', m.NewProductId)
FROM _mig_product_map m WHERE m.OldProductId <> m.NewProductId;


-- =====================================================================
--  SECTION 4 - TRANSACTIONS
-- =====================================================================

-- 4.1 `Order`
--     QueueNo VARCHAR -> SMALLINT. The digits of the old value are used
--     when they are usable and unique for that store+day; otherwise the
--     row is renumbered from 50001 up and flagged in _mig_rejects.
INSERT INTO `Order` (OrderId, StoreId, CustomerId, CreatedByStaffId, StatusId, QueueNo,
                     TotalAmount, Note, IsWalkIn, PickupTime, ReadyAt,
                     CancelReason, CancelDeadline, CreatedAt)
SELECT q.OrderID,
       q.StoreId,
       cu.UserId,
       st.UserId,
       os.StatusId,
       IF(q.qn IS NOT NULL AND q.dup = 1 AND q.qn < 50000, q.qn, 50000 + q.seq),
       GREATEST(COALESCE(q.TotalAmount, 0), 0),
       LEFT(q.Note, 500),
       COALESCE(q.IsWalkIn, FALSE),
       q.PickupTime,
       q.ReadyAt,
       LEFT(q.CancelReason, 255),
       q.CancelDeadline,
       COALESCE(q.CreatedAt, NOW())
FROM (
  SELECT o.*,
         CAST(NULLIF(REGEXP_REPLACE(o.QueueNo, '[^0-9]', ''), '') AS UNSIGNED) AS qn,
         ROW_NUMBER() OVER (PARTITION BY o.StoreId, DATE(o.CreatedAt),
                                         CAST(NULLIF(REGEXP_REPLACE(o.QueueNo, '[^0-9]', ''), '') AS UNSIGNED)
                            ORDER BY o.CreatedAt, o.OrderID) AS dup,
         ROW_NUMBER() OVER (PARTITION BY o.StoreId, DATE(o.CreatedAt)
                            ORDER BY o.CreatedAt, o.OrderID) AS seq
  FROM onlyfoods_db.`Order` o
) q
JOIN Store s        ON s.StoreId = q.StoreId
JOIN OrderStatus os ON os.StatusCode = CASE WHEN q.Status = 'NoShow' THEN 'NO_SHOW' ELSE UPPER(q.Status) END
LEFT JOIN `User` cu ON cu.UserId = q.UserId
LEFT JOIN `User` st ON st.UserId = q.CreatedBy
WHERE (q.UserId IS NOT NULL OR q.CreatedBy IS NOT NULL);

INSERT INTO _mig_rejects (SourceName, SourceKey, Reason)
SELECT 'Order', CAST(o.OrderID AS CHAR), 'no CustomerId and no CreatedByStaffId'
FROM onlyfoods_db.`Order` o
WHERE o.UserId IS NULL AND o.CreatedBy IS NULL;

INSERT INTO _mig_rejects (SourceName, SourceKey, Reason)
SELECT 'Order', CAST(o.OrderID AS CHAR), CONCAT('QueueNo renumbered, old value was: ', o.QueueNo)
FROM onlyfoods_db.`Order` o
JOIN `Order` n ON n.OrderId = o.OrderID
WHERE n.QueueNo >= 50000;


-- 4.2 OrderDetail -> OrderItem   (DetailID becomes OrderItemId)
INSERT INTO OrderItem (OrderItemId, OrderId, ProductId, ReplacesItemId, Qty, UnitPrice, ItemNote, ItemStatus)
SELECT d.DetailID,
       d.OrderID,
       m.NewProductId,
       NULL,                                   -- no equivalent in the old schema
       GREATEST(COALESCE(d.Qty, 1), 1),
       GREATEST(COALESCE(d.UnitPrice, 0), 0),
       LEFT(d.ItemNote, 255),
       CASE UPPER(TRIM(COALESCE(d.ItemStatus, 'NORMAL')))
         WHEN 'OUT_OF_STOCK' THEN 'OUT_OF_STOCK'
         WHEN 'REPLACED'     THEN 'REPLACED'
         WHEN 'CANCELLED'    THEN 'CANCELLED'
         ELSE 'NORMAL'
       END
FROM onlyfoods_db.OrderDetail d
JOIN `Order` o          ON o.OrderId = d.OrderID
JOIN _mig_product_map m ON m.OldProductId = d.ProductId
JOIN Product p          ON p.ProductId = m.NewProductId;

INSERT INTO _mig_rejects (SourceName, SourceKey, Reason)
SELECT 'OrderDetail', CAST(d.DetailID AS CHAR), 'parent order or product was not migrated'
FROM onlyfoods_db.OrderDetail d
WHERE NOT EXISTS (SELECT 1 FROM OrderItem oi WHERE oi.OrderItemId = d.DetailID);


-- 4.3 Payment
--     Status map: PAID/REFUNDED -> VERIFIED, PENDING/VERIFYING -> PENDING,
--                 FAILED/CANCELLED -> REJECTED.
--     uk_payment_active allows one live payment per order, so when an
--     order has several, the newest keeps its status and the rest are
--     written as REJECTED.
INSERT INTO Payment (PaymentId, OrderId, MethodId, Amount, PaymentStatus,
                     SlipImageUrl, RejectReason, VerifiedBy, PaidAt, CreatedAt)
SELECT x.PaymentId,
       x.OrderID,
       pm.MethodId,
       x.Amount,
       IF(x.activeRank = 1, x.NewStatus, 'REJECTED'),
       CASE WHEN x.SlipUrl LIKE 'data:%' OR CHAR_LENGTH(x.SlipUrl) > 500 THEN NULL ELSE x.SlipUrl END,
       COALESCE(LEFT(x.RejectReason, 255),
                IF(x.activeRank = 1, NULL, 'superseded by a newer payment during migration')),
       vb.UserId,
       x.PaidAt,
       COALESCE(x.CreatedAt, NOW())
FROM (
  SELECT m.*,
         IF(m.NewStatus = 'REJECTED', 0,
            ROW_NUMBER() OVER (PARTITION BY m.OrderID, (m.NewStatus = 'REJECTED')
                               ORDER BY m.CreatedAt DESC, m.PaymentId DESC)) AS activeRank
  FROM (
    SELECT p.*,
           CASE UPPER(TRIM(COALESCE(p.PaymentStatus, 'PENDING')))
             WHEN 'PAID'      THEN 'VERIFIED'
             WHEN 'REFUNDED'  THEN 'VERIFIED'
             WHEN 'PENDING'   THEN 'PENDING'
             WHEN 'VERIFYING' THEN 'PENDING'
             ELSE 'REJECTED'
           END AS NewStatus
    FROM onlyfoods_db.Payment p
    WHERE p.Amount > 0
  ) m
) x
JOIN `Order` o       ON o.OrderId = x.OrderID
JOIN PaymentMethod pm ON pm.MethodCode = CASE UPPER(TRIM(COALESCE(x.PaymentMethod, 'CASH')))
                                           WHEN 'PROMPTPAY' THEN 'QR_PROMPTPAY'
                                           ELSE LEFT(UPPER(TRIM(COALESCE(x.PaymentMethod, 'CASH'))), 20)
                                         END
LEFT JOIN `User` vb  ON vb.UserId = x.VerifiedBy;

INSERT INTO _mig_rejects (SourceName, SourceKey, Reason)
SELECT 'Payment', CAST(p.PaymentId AS CHAR),
       IF(p.Amount <= 0, 'Amount <= 0', 'parent order was not migrated')
FROM onlyfoods_db.Payment p
WHERE NOT EXISTS (SELECT 1 FROM Payment n WHERE n.PaymentId = p.PaymentId);


-- 4.4 Refund + RefundItem -> Refund
--     The old pair was header + lines. The new table is one row per
--     refunded thing, so each RefundItem becomes its own Refund row
--     (ITEM_CANCEL) and a header with no lines becomes FULL_CANCEL.
INSERT INTO Refund (PaymentId, OrderItemId, RefundType, Amount, Reason, RefundStatus, RefundedBy, RequestedAt, RefundedAt)
SELECT r.PaymentId,
       ri.DetailID,
       'ITEM_CANCEL',
       ri.Amount,
       LEFT(r.Reason, 255),
       CASE UPPER(TRIM(COALESCE(r.Status, 'PENDING')))
         WHEN 'COMPLETED' THEN 'DONE'
         WHEN 'REJECTED'  THEN 'FAILED'
         ELSE 'PENDING'
       END,
       rb.UserId,
       COALESCE(r.RequestedAt, NOW()),
       r.RefundedAt
FROM onlyfoods_db.RefundItem ri
JOIN onlyfoods_db.Refund r ON r.RefundId = ri.RefundId
JOIN Payment p             ON p.PaymentId = r.PaymentId
JOIN OrderItem oi          ON oi.OrderItemId = ri.DetailID
LEFT JOIN `User` rb        ON rb.UserId = r.RefundedBy
WHERE ri.Amount > 0
  AND ri.RefundItemId = (SELECT MIN(x.RefundItemId) FROM onlyfoods_db.RefundItem x WHERE x.DetailID = ri.DetailID);

INSERT INTO Refund (PaymentId, OrderItemId, RefundType, Amount, Reason, RefundStatus, RefundedBy, RequestedAt, RefundedAt)
SELECT r.PaymentId,
       NULL,
       'FULL_CANCEL',
       r.TotalAmount,
       LEFT(r.Reason, 255),
       CASE UPPER(TRIM(COALESCE(r.Status, 'PENDING')))
         WHEN 'COMPLETED' THEN 'DONE'
         WHEN 'REJECTED'  THEN 'FAILED'
         ELSE 'PENDING'
       END,
       rb.UserId,
       COALESCE(r.RequestedAt, NOW()),
       r.RefundedAt
FROM onlyfoods_db.Refund r
JOIN Payment p      ON p.PaymentId = r.PaymentId
LEFT JOIN `User` rb ON rb.UserId = r.RefundedBy
WHERE r.TotalAmount > 0
  AND NOT EXISTS (SELECT 1 FROM onlyfoods_db.RefundItem ri WHERE ri.RefundId = r.RefundId);


-- 4.5 PrintJob + PrintLog + Printer -> PrintJob
INSERT INTO PrintJob (PrintJobId, OrderId, PrintType, PrintStatus, PrinterName, PrinterStatus,
                      ItemsSnapshot, PerformedBy, ErrorMessage, CreatedAt, PrintedAt)
SELECT j.PrintJobID,
       j.OrderID,
       CASE UPPER(TRIM(COALESCE(j.PrintType, 'FIRST_PRINT')))
         WHEN 'REPRINT' THEN 'REPRINT'
         WHEN 'RECALL'  THEN 'REPRINT'
         ELSE 'CUSTOMER'
       END,
       CASE UPPER(TRIM(COALESCE(j.Status, 'PENDING')))
         WHEN 'PRINTED' THEN 'PRINTED'
         WHEN 'FAILED'  THEN 'FAILED'
         ELSE 'QUEUED'
       END,
       LEFT(COALESCE(pr.PrinterName, l.PrinterName), 100),
       CASE UPPER(TRIM(COALESCE(pr.Status, ''))) WHEN 'ONLINE' THEN 'READY' WHEN 'OFFLINE' THEN 'OFFLINE' ELSE NULL END,
       IF(JSON_VALID(l.ItemsJson), CAST(l.ItemsJson AS JSON), NULL),
       pb.UserId,
       LEFT(j.ErrorMessage, 255),
       COALESCE(j.CreatedAt, NOW()),
       j.PrintedAt
FROM onlyfoods_db.PrintJob j
JOIN `Order` o                 ON o.OrderId = j.OrderID
LEFT JOIN onlyfoods_db.Printer pr ON pr.PrinterId = j.PrinterId
LEFT JOIN onlyfoods_db.PrintLog l ON l.PrintLogID = (
       SELECT MIN(x.PrintLogID) FROM onlyfoods_db.PrintLog x WHERE x.PrintJobID = j.PrintJobID)
LEFT JOIN `User` pb            ON pb.UserId = j.PrintedBy;

-- PrintLog rows that never had a PrintJob become jobs of their own
INSERT INTO PrintJob (OrderId, PrintType, PrintStatus, PrinterName, ItemsSnapshot, PerformedBy, CreatedAt, PrintedAt)
SELECT l.OrderID,
       CASE UPPER(TRIM(COALESCE(l.PrintType, 'FIRST_PRINT')))
         WHEN 'REPRINT' THEN 'REPRINT'
         WHEN 'RECALL'  THEN 'REPRINT'
         ELSE 'CUSTOMER'
       END,
       CASE UPPER(TRIM(COALESCE(l.Status, 'PENDING')))
         WHEN 'PRINTED' THEN 'PRINTED'
         WHEN 'FAILED'  THEN 'FAILED'
         ELSE 'QUEUED'
       END,
       LEFT(l.PrinterName, 100),
       IF(JSON_VALID(l.ItemsJson), CAST(l.ItemsJson AS JSON), NULL),
       pb.UserId,
       COALESCE(l.CreatedAt, NOW()),
       IF(UPPER(TRIM(COALESCE(l.Status, ''))) = 'PRINTED', l.CreatedAt, NULL)
FROM onlyfoods_db.PrintLog l
JOIN `Order` o      ON o.OrderId = l.OrderID
LEFT JOIN `User` pb ON pb.UserId = l.PerformedBy
WHERE l.PrintJobID IS NULL;


-- 4.6 Review   (StoreId / UserId dropped - both reachable through Order)
INSERT INTO Review (ReviewId, OrderId, Rating, Comment, ImageUrl, CreatedAt)
SELECT r.ReviewId,
       r.OrderID,
       r.Rating,
       LEFT(r.Comment, 1000),
       CASE WHEN r.ImageUrl LIKE 'data:%' OR CHAR_LENGTH(r.ImageUrl) > 500 THEN NULL ELSE r.ImageUrl END,
       COALESCE(r.CreatedAt, NOW())
FROM onlyfoods_db.Review r
JOIN `Order` o ON o.OrderId = r.OrderID
WHERE r.Rating BETWEEN 1 AND 5;


-- 4.7 IssueReport   (StoreId is NOT NULL now -> fall back to the order's store)
INSERT INTO IssueReport (IssueReportId, ReportedBy, StoreId, OrderId, IssueTypeId, Description,
                         IssueStatus, AdminNote, HandledBy, CreatedAt, ResolvedAt)
SELECT i.ReportID,
       i.UserId,
       COALESCE(i.StoreId, o.StoreId),
       o.OrderId,
       it.IssueTypeId,
       LEFT(i.Description, 1000),
       CASE UPPER(TRIM(COALESCE(i.Status, 'Pending')))
         WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'
         WHEN 'RESOLVED'    THEN 'RESOLVED'
         WHEN 'REJECTED'    THEN 'REJECTED'
         ELSE 'OPEN'
       END,
       LEFT(i.AdminNote, 500),
       hb.UserId,
       COALESCE(i.CreatedAt, NOW()),
       i.ResolvedAt
FROM onlyfoods_db.IssueReport i
JOIN `User` ru      ON ru.UserId = i.UserId
JOIN IssueType it   ON it.TypeCode = LEFT(UPPER(REPLACE(TRIM(i.IssueType), ' ', '_')), 25)
LEFT JOIN `Order` o ON o.OrderId = i.OrderID
LEFT JOIN `User` hb ON hb.UserId = i.HandledBy
WHERE COALESCE(i.StoreId, o.StoreId) IS NOT NULL
  AND EXISTS (SELECT 1 FROM Store s WHERE s.StoreId = COALESCE(i.StoreId, o.StoreId));

INSERT INTO _mig_rejects (SourceName, SourceKey, Reason)
SELECT 'IssueReport', CAST(i.ReportID AS CHAR), 'no store could be determined (StoreId NOT NULL)'
FROM onlyfoods_db.IssueReport i
WHERE NOT EXISTS (SELECT 1 FROM IssueReport n WHERE n.IssueReportId = i.ReportID);


-- 4.8 Notification   (both the old Notification and the compat Notifications table)
INSERT INTO Notification (NotificationId, UserId, OrderId, NotificationType, Title, Message, IsRead, CreatedAt)
SELECT n.NotifId,
       n.UserId,
       o.OrderId,
       CASE TRIM(n.Type)
         WHEN 'OrderReady'       THEN 'QUEUE_CALLED'
         WHEN 'OutOfStockNotice' THEN 'ORDER_STATUS'
         WHEN 'CancelWarning'    THEN 'ORDER_STATUS'
         WHEN 'FoodCourtClosed'  THEN 'SYSTEM'
         WHEN 'HighCancelAlert'  THEN 'SYSTEM'
         ELSE 'SYSTEM'
       END,
       LEFT(n.Title, 150),
       LEFT(n.Message, 500),
       COALESCE(n.IsRead, FALSE),
       COALESCE(n.CreatedAt, NOW())
FROM onlyfoods_db.Notification n
JOIN `User` u       ON u.UserId = n.UserId
LEFT JOIN `Order` o ON o.OrderId = n.RefOrderId;

-- The backend also created a second, plural `Notifications` table. It only
-- exists if section 8 of the old init.sql ever ran, so this is guarded.
SET @has_notifs = (SELECT COUNT(*) FROM information_schema.tables
                   WHERE table_schema = 'onlyfoods_db' AND table_name = 'Notifications');
SET @s = IF(@has_notifs = 0, 'DO 0',
  'INSERT INTO Notification (UserId, OrderId, NotificationType, Title, Message, IsRead, CreatedAt)
   SELECT n.UserId, NULL, ''SYSTEM'', ''แจ้งเตือน'', LEFT(n.Message, 500),
          COALESCE(n.IsRead, FALSE), COALESCE(n.CreatedAt, NOW())
   FROM onlyfoods_db.Notifications n JOIN `User` u ON u.UserId = n.UserId');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;


-- =====================================================================
--  SECTION 5 - LOGS
-- =====================================================================

-- 5.1 OrderStatusLog
--     ck_oslog_actor: a row with no ChangedBy must say ChangedByType = SYSTEM.
INSERT INTO OrderStatusLog (LogId, OrderId, OldStatusId, NewStatusId, Reason, ChangedBy, ChangedByType, CreatedAt)
SELECT l.LogId,
       l.OrderID,
       oldst.StatusId,
       newst.StatusId,
       LEFT(l.Reason, 255),
       cb.UserId,
       IF(cb.UserId IS NULL, 'SYSTEM', 'USER'),
       COALESCE(l.CreatedAt, NOW())
FROM onlyfoods_db.OrderStatusLog l
JOIN `Order` o              ON o.OrderId = l.OrderID
JOIN OrderStatus newst      ON newst.StatusCode = CASE WHEN l.NewStatus = 'NoShow' THEN 'NO_SHOW' ELSE UPPER(l.NewStatus) END
LEFT JOIN OrderStatus oldst ON oldst.StatusCode = CASE WHEN l.OldStatus = 'NoShow' THEN 'NO_SHOW' ELSE UPPER(l.OldStatus) END
LEFT JOIN `User` cb         ON cb.UserId = l.ChangedBy;


-- 5.2 rebuild a log for orders that have none, out of the old timestamp
--     columns (CreatedAt / CookedAt / ReadyAt / CompletedAt). This is why
--     Order.CookedAt and Order.CompletedAt are not needed as columns.
INSERT INTO OrderStatusLog (OrderId, OldStatusId, NewStatusId, Reason, ChangedBy, ChangedByType, CreatedAt)
SELECT o.OrderID, NULL, s.StatusId, 'rebuilt from the old schema during migration', NULL, 'SYSTEM', o.CreatedAt
FROM onlyfoods_db.`Order` o
JOIN `Order` n      ON n.OrderId = o.OrderID
JOIN OrderStatus s  ON s.StatusCode = 'VERIFYING_SLIP'
WHERE NOT EXISTS (SELECT 1 FROM onlyfoods_db.OrderStatusLog l WHERE l.OrderID = o.OrderID);

INSERT INTO OrderStatusLog (OrderId, OldStatusId, NewStatusId, Reason, ChangedBy, ChangedByType, CreatedAt)
SELECT o.OrderID, NULL, s.StatusId, 'rebuilt from Order.CookedAt', NULL, 'SYSTEM', o.CookedAt
FROM onlyfoods_db.`Order` o
JOIN `Order` n     ON n.OrderId = o.OrderID
JOIN OrderStatus s ON s.StatusCode = 'COOKED'
WHERE o.CookedAt IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM onlyfoods_db.OrderStatusLog l WHERE l.OrderID = o.OrderID);

INSERT INTO OrderStatusLog (OrderId, OldStatusId, NewStatusId, Reason, ChangedBy, ChangedByType, CreatedAt)
SELECT o.OrderID, NULL, s.StatusId, 'rebuilt from Order.ReadyAt', NULL, 'SYSTEM', o.ReadyAt
FROM onlyfoods_db.`Order` o
JOIN `Order` n     ON n.OrderId = o.OrderID
JOIN OrderStatus s ON s.StatusCode = 'READY'
WHERE o.ReadyAt IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM onlyfoods_db.OrderStatusLog l WHERE l.OrderID = o.OrderID);

INSERT INTO OrderStatusLog (OrderId, OldStatusId, NewStatusId, Reason, ChangedBy, ChangedByType, CreatedAt)
SELECT o.OrderID, NULL, s.StatusId, 'rebuilt from Order.CompletedAt', NULL, 'SYSTEM', o.CompletedAt
FROM onlyfoods_db.`Order` o
JOIN `Order` n     ON n.OrderId = o.OrderID
JOIN OrderStatus s ON s.StatusCode = 'COMPLETED'
WHERE o.CompletedAt IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM onlyfoods_db.OrderStatusLog l WHERE l.OrderID = o.OrderID);


-- 5.3 AuditLog
INSERT INTO AuditLog (AuditLogId, PerformedBy, ActionCode, EntityType, EntityId, OldValue, NewValue, IpAddress, CreatedAt)
SELECT a.LogID,
       pb.UserId,
       LEFT(a.Action, 50),
       LEFT(COALESCE(a.EntityType, 'UNKNOWN'), 50),
       CAST(a.EntityId AS CHAR),
       a.OldValue,
       COALESCE(a.NewValue, IF(a.Details IS NULL, NULL, JSON_OBJECT('details', a.Details, 'performerRole', a.PerformerRole))),
       a.IpAddress,
       COALESCE(a.CreatedAt, NOW())
FROM onlyfoods_db.AuditLog a
LEFT JOIN `User` pb ON pb.UserId = a.PerformedBy;


-- =====================================================================
--  SECTION 6 - TABLES THAT NO LONGER EXIST, FOLDED INTO AuditLog
--  (nothing is thrown away; AuditLogId is auto-assigned from here on)
-- =====================================================================

-- 6.1 ProductPriceHistory -> price changes
INSERT INTO AuditLog (PerformedBy, ActionCode, EntityType, EntityId, OldValue, NewValue, CreatedAt)
SELECT cb.UserId, 'PRICE_UPDATE', 'Product', CAST(h.ProductId AS CHAR),
       JSON_OBJECT('UnitPrice', h.OldPrice),
       JSON_OBJECT('UnitPrice', h.NewPrice),
       COALESCE(h.ChangedAt, NOW())
FROM onlyfoods_db.ProductPriceHistory h
LEFT JOIN `User` cb ON cb.UserId = h.ChangedBy;

-- 6.2 SecurityLog -> auth events (this is why there is no SecurityLog table)
INSERT INTO AuditLog (PerformedBy, ActionCode, EntityType, EntityId, NewValue, IpAddress, CreatedAt)
SELECT u.UserId,
       LEFT(UPPER(REGEXP_REPLACE(s.EventType, '([a-z])([A-Z])', '\\1_\\2')), 50),
       'AUTH',
       s.UsernameTried,
       JSON_OBJECT('severity', s.Severity, 'device', s.DeviceInfo, 'details', s.Details),
       s.IpAddress,
       COALESCE(s.CreatedAt, NOW())
FROM onlyfoods_db.SecurityLog s
LEFT JOIN `User` u ON u.UserId = s.UserId;

-- 6.3 ExportLog -> report exports
INSERT INTO AuditLog (PerformedBy, ActionCode, EntityType, EntityId, NewValue, IpAddress, CreatedAt)
SELECT u.UserId, 'REPORT_EXPORT', 'REPORT', LEFT(e.ReportType, 50),
       JSON_OBJECT('format', e.Format, 'rows', e.RowCount, 'filter', e.FilterJson),
       e.IpAddress, COALESCE(e.CreatedAt, NOW())
FROM onlyfoods_db.ExportLog e
JOIN `User` u ON u.UserId = e.UserId;

-- 6.4 SystemAlert -> automatic alerts
INSERT INTO AuditLog (PerformedBy, ActionCode, EntityType, EntityId, NewValue, CreatedAt)
SELECT ab.UserId, 'SYSTEM_ALERT', 'Store', CAST(a.StoreId AS CHAR),
       JSON_OBJECT('alertType', a.AlertType, 'metric', a.MetricValue,
                   'threshold', a.Threshold, 'severity', a.Severity, 'status', a.Status),
       COALESCE(a.CreatedAt, NOW())
FROM onlyfoods_db.SystemAlert a
LEFT JOIN `User` ab ON ab.UserId = a.AcknowledgedBy;

-- 6.5 Payment.TransactionRef - no column for it in the new ER, keep the value
INSERT INTO AuditLog (PerformedBy, ActionCode, EntityType, EntityId, NewValue, CreatedAt)
SELECT NULL, 'PAYMENT_REF_ARCHIVED', 'Payment', CAST(p.PaymentId AS CHAR),
       JSON_OBJECT('transactionRef', p.TransactionRef),
       COALESCE(p.CreatedAt, NOW())
FROM onlyfoods_db.Payment p
JOIN Payment np ON np.PaymentId = p.PaymentId
WHERE p.TransactionRef IS NOT NULL AND TRIM(p.TransactionRef) <> '';

-- 6.6 Users.Points - cut from the ER, keep the balances on record
INSERT INTO AuditLog (PerformedBy, ActionCode, EntityType, EntityId, NewValue, CreatedAt)
SELECT NULL, 'POINTS_ARCHIVED', 'User', CAST(u.UserId AS CHAR),
       JSON_OBJECT('points', u.Points), NOW()
FROM onlyfoods_db.Users u
JOIN `User` nu ON nu.UserId = u.UserId
WHERE COALESCE(u.Points, 0) > 0;


-- =====================================================================
--  SECTION 7 - SUMMARY
-- =====================================================================

INSERT INTO MonthlyStoreSummary (SummaryId, StoreId, SummaryYear, SummaryMonth, TotalOrders,
                                 GrossSales, RefundAmount, NetSales, CancelRate, IsLocked, LockedBy, GeneratedAt)
SELECT m.SummaryId, m.StoreId, m.Year, m.Month,
       GREATEST(COALESCE(m.TotalOrders, 0), 0),
       COALESCE(m.GrossSales, 0), COALESCE(m.RefundAmount, 0), COALESCE(m.NetSales, 0),
       LEAST(GREATEST(COALESCE(m.CancelRate, 0), 0), 999.99),
       COALESCE(m.IsLocked, FALSE),
       lb.UserId,
       COALESCE(m.GeneratedAt, NOW())
FROM onlyfoods_db.MonthlyStoreSummary m
JOIN Store s        ON s.StoreId = m.StoreId
LEFT JOIN `User` lb ON lb.UserId = m.LockedBy
WHERE m.Month BETWEEN 1 AND 12 AND m.Year BETWEEN 2020 AND 2100;


-- ---------------------------------------------------------------------
-- 7.1 keep FoodCourt.UpdatedBy pointing at someone real
-- ---------------------------------------------------------------------
UPDATE FoodCourt
SET UpdatedBy = (SELECT u.UserId FROM `User` u JOIN Role r ON r.RoleId = u.RoleId
                 WHERE r.RoleCode = 'EXECUTIVE' ORDER BY u.UserId LIMIT 1)
WHERE FoodCourtId = 1 AND UpdatedBy IS NULL;


-- ---------------------------------------------------------------------
-- 7.2 re-seat AUTO_INCREMENT above the migrated IDs
-- ---------------------------------------------------------------------
SET @s = CONCAT('ALTER TABLE Store AUTO_INCREMENT = ', (SELECT COALESCE(MAX(StoreId),0)+1 FROM Store));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = CONCAT('ALTER TABLE `User` AUTO_INCREMENT = ', (SELECT COALESCE(MAX(UserId),0)+1 FROM `User`));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = CONCAT('ALTER TABLE Product AUTO_INCREMENT = ', (SELECT COALESCE(MAX(ProductId),0)+1 FROM Product));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = CONCAT('ALTER TABLE `Order` AUTO_INCREMENT = ', (SELECT COALESCE(MAX(OrderId),0)+1 FROM `Order`));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = CONCAT('ALTER TABLE OrderItem AUTO_INCREMENT = ', (SELECT COALESCE(MAX(OrderItemId),0)+1 FROM OrderItem));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = CONCAT('ALTER TABLE Payment AUTO_INCREMENT = ', (SELECT COALESCE(MAX(PaymentId),0)+1 FROM Payment));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;


-- =====================================================================
--  SECTION 8 - VERIFY   (old row count vs new row count)
-- =====================================================================

SELECT 'Store'               AS TableName, (SELECT COUNT(*) FROM onlyfoods_db.Store)               AS OldRows, (SELECT COUNT(*) FROM Store)               AS NewRows
UNION ALL SELECT 'User',           (SELECT COUNT(*) FROM onlyfoods_db.Users),               (SELECT COUNT(*) FROM `User`)
UNION ALL SELECT 'StoreContract',  (SELECT COUNT(*) FROM onlyfoods_db.StoreContract),       (SELECT COUNT(*) FROM StoreContract)
UNION ALL SELECT 'ProductCategory',(SELECT COUNT(*) FROM onlyfoods_db.ProductCategory),     (SELECT COUNT(*) FROM ProductCategory)
UNION ALL SELECT 'Product',        (SELECT COUNT(*) FROM onlyfoods_db.Product),             (SELECT COUNT(*) FROM Product)
UNION ALL SELECT 'Order',          (SELECT COUNT(*) FROM onlyfoods_db.`Order`),             (SELECT COUNT(*) FROM `Order`)
UNION ALL SELECT 'OrderItem',      (SELECT COUNT(*) FROM onlyfoods_db.OrderDetail),         (SELECT COUNT(*) FROM OrderItem)
UNION ALL SELECT 'Payment',        (SELECT COUNT(*) FROM onlyfoods_db.Payment),             (SELECT COUNT(*) FROM Payment)
UNION ALL SELECT 'Refund',         (SELECT COUNT(*) FROM onlyfoods_db.Refund),              (SELECT COUNT(*) FROM Refund)
UNION ALL SELECT 'PrintJob',       (SELECT COUNT(*) FROM onlyfoods_db.PrintJob),            (SELECT COUNT(*) FROM PrintJob)
UNION ALL SELECT 'Review',         (SELECT COUNT(*) FROM onlyfoods_db.Review),              (SELECT COUNT(*) FROM Review)
UNION ALL SELECT 'IssueReport',    (SELECT COUNT(*) FROM onlyfoods_db.IssueReport),         (SELECT COUNT(*) FROM IssueReport)
UNION ALL SELECT 'Notification',   (SELECT COUNT(*) FROM onlyfoods_db.Notification),        (SELECT COUNT(*) FROM Notification)
UNION ALL SELECT 'OrderStatusLog', (SELECT COUNT(*) FROM onlyfoods_db.OrderStatusLog),      (SELECT COUNT(*) FROM OrderStatusLog)
UNION ALL SELECT 'AuditLog',       (SELECT COUNT(*) FROM onlyfoods_db.AuditLog),            (SELECT COUNT(*) FROM AuditLog)
UNION ALL SELECT 'MonthlySummary', (SELECT COUNT(*) FROM onlyfoods_db.MonthlyStoreSummary), (SELECT COUNT(*) FROM MonthlyStoreSummary);

-- anything that did not make it, and why
SELECT SourceName, Reason, COUNT(*) AS Cnt
FROM _mig_rejects GROUP BY SourceName, Reason ORDER BY SourceName;

-- the refund rule the DDL cannot express: SUM(Refund) must not exceed Payment.Amount
SELECT p.PaymentId, p.Amount AS Paid, SUM(r.Amount) AS Refunded
FROM Payment p JOIN Refund r ON r.PaymentId = p.PaymentId
GROUP BY p.PaymentId, p.Amount
HAVING SUM(r.Amount) > p.Amount;

-- every account needs a new password before it can log in
SELECT COUNT(*) AS AccountsNeedingPasswordReset FROM `User` WHERE PasswordHash IS NULL;


-- =====================================================================
--  SECTION 9 - CLEAN UP (run only once you are happy with the result)
-- =====================================================================
-- DROP TABLE onlyfood._mig_product_map;
-- DROP TABLE onlyfood._mig_rejects;
-- =====================================================================
