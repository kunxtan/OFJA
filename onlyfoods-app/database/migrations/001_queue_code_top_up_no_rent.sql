-- =====================================================================
--  Migration 001 : queue letters, top-up payments, no rent, append-only logs
--  For a database that was created from an OLDER init.sql (the live server).
--  A fresh install from the current init.sql already has all of this.
--
--  Safe to run any number of times: every step checks first and does
--  nothing if it was already applied. Keeps all existing rows.
--  The deploy workflow runs every file in database/migrations/ in order
--  before starting the new backend. By hand:
--    docker compose -f docker-compose.cloud.yml exec -T db \
--      sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" onlyfood' < database/migrations/001_queue_code_top_up_no_rent.sql
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

-- MySQL has no IF in plain scripts: each step sets @needed from
-- information_schema and runs @ddl, or a harmless SELECT 1 when done already.


-- ---------------------------------------------------------------------
-- 1) Store.QueueCode  (A, B, ... Z, AA, AB ...) in StoreId order
-- ---------------------------------------------------------------------
SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Store' AND COLUMN_NAME = 'QueueCode');
SET @ddl = IF(@needed,
  "ALTER TABLE Store ADD COLUMN QueueCode VARCHAR(2) NULL COMMENT 'queue prefix shown to customers: A -> A001, A002 ...' AFTER AvgPrepMinutes",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE Store s
JOIN (SELECT StoreId, ROW_NUMBER() OVER (ORDER BY StoreId) AS n FROM Store) x ON x.StoreId = s.StoreId
SET s.QueueCode = IF(x.n <= 26, CHAR(64 + x.n),
                     CONCAT(CHAR(64 + FLOOR((x.n - 27) / 26) + 1), CHAR(65 + MOD(x.n - 27, 26))))
WHERE s.QueueCode IS NULL;

ALTER TABLE Store MODIFY QueueCode VARCHAR(2) NOT NULL COMMENT 'queue prefix shown to customers: A -> A001, A002 ...';

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Store' AND INDEX_NAME = 'uk_store_queuecode');
SET @ddl = IF(@needed, 'ALTER TABLE Store ADD UNIQUE KEY uk_store_queuecode (QueueCode)', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.TABLE_CONSTRAINTS
               WHERE CONSTRAINT_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Store' AND CONSTRAINT_NAME = 'ck_store_queuecode');
SET @ddl = IF(@needed,
  "ALTER TABLE Store ADD CONSTRAINT ck_store_queuecode CHECK (REGEXP_LIKE(QueueCode, '^[A-Z]{1,2}$', 'c'))",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;


-- ---------------------------------------------------------------------
-- 2) StoreContract: no rent any more (contract dates stay)
-- ---------------------------------------------------------------------
SET @needed = (SELECT COUNT(*) > 0 FROM information_schema.TABLE_CONSTRAINTS
               WHERE CONSTRAINT_SCHEMA = 'onlyfood' AND TABLE_NAME = 'StoreContract' AND CONSTRAINT_NAME = 'ck_contract_rent');
SET @ddl = IF(@needed, 'ALTER TABLE StoreContract DROP CHECK ck_contract_rent', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @needed = (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'StoreContract' AND COLUMN_NAME = 'MonthlyRent');
SET @ddl = IF(@needed, 'ALTER TABLE StoreContract DROP COLUMN MonthlyRent', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;


-- ---------------------------------------------------------------------
-- 3) New order status AWAITING_TOP_UP (code lookups are by StatusCode,
--    so its StatusId value does not matter)
-- ---------------------------------------------------------------------
INSERT INTO OrderStatus (StatusCode, StatusNameTh, IsTerminal, SortOrder)
SELECT 'AWAITING_TOP_UP', 'รอโอนส่วนต่าง', FALSE, 8
WHERE NOT EXISTS (SELECT 1 FROM OrderStatus WHERE StatusCode = 'AWAITING_TOP_UP');
UPDATE OrderStatus SET SortOrder = 9  WHERE StatusCode = 'CANCELLED';
UPDATE OrderStatus SET SortOrder = 10 WHERE StatusCode = 'NO_SHOW';


-- ---------------------------------------------------------------------
-- 4) Payment.PaymentType: one active ORDER payment, any number of TOP_UPs
--    (existing rows become ORDER, which is what they are)
-- ---------------------------------------------------------------------
SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Payment' AND COLUMN_NAME = 'PaymentType');
SET @ddl = IF(@needed,
  "ALTER TABLE Payment ADD COLUMN PaymentType ENUM('ORDER','TOP_UP') NOT NULL DEFAULT 'ORDER' AFTER OrderId",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- the uniqueness rule must only cover ORDER payments
SET @needed = (SELECT COUNT(*) > 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Payment' AND COLUMN_NAME = 'ActiveFlag'
                 AND GENERATION_EXPRESSION NOT LIKE '%PaymentType%');
SET @ddl = IF(@needed,
  "ALTER TABLE Payment MODIFY ActiveFlag TINYINT UNSIGNED AS (IF(PaymentType = 'ORDER' AND PaymentStatus <> 'REJECTED', 1, NULL)) STORED",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Payment' AND INDEX_NAME = 'ix_payment_order_type');
SET @ddl = IF(@needed, 'ALTER TABLE Payment ADD KEY ix_payment_order_type (OrderId, PaymentType, PaymentStatus)', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;


-- ---------------------------------------------------------------------
-- 5) v_order_net : ย้ายไปไว้ใน migration 006 ที่เดียว (นิยามล่าสุด : เงินคืนที่รอคืนไม่นับเป็นรายได้)
--    เดิมไฟล์นี้สร้าง view แบบเก่าใหม่ทุก deploy ถ้า migration ไฟล์หลัง ๆ ล้ม ยอดขายจะนับเงินที่รอคืนเป็นรายได้
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 6) Logs are append-only, even for the app's own DB user
-- ---------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_auditlog_no_update BEFORE UPDATE ON AuditLog FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only';
CREATE TRIGGER IF NOT EXISTS trg_auditlog_no_delete BEFORE DELETE ON AuditLog FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only';
CREATE TRIGGER IF NOT EXISTS trg_oslog_no_update BEFORE UPDATE ON OrderStatusLog FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'OrderStatusLog is append-only';
CREATE TRIGGER IF NOT EXISTS trg_oslog_no_delete BEFORE DELETE ON OrderStatusLog FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'OrderStatusLog is append-only';

SELECT 'migration 001 applied' AS result;
