-- =====================================================================
--  Migration 003 : customer tells the store they will pick up late
--  (Order.CustomerEtaAt + Order.EtaUpdateCount)
--  Runs any number of times (checks first, never drops data).
--  A fresh install from the current init.sql already has both columns.
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'CustomerEtaAt');
SET @ddl = IF(@needed,
  "ALTER TABLE `Order` ADD COLUMN CustomerEtaAt DATETIME NULL COMMENT 'customer said they will pick up by this time (latest wins); no auto reminder, no-show locked until then' AFTER PickupReminderAt",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'EtaUpdateCount');
SET @ddl = IF(@needed,
  "ALTER TABLE `Order` ADD COLUMN EtaUpdateCount TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'how many times the customer set CustomerEtaAt (max 3, enforced in code)' AFTER CustomerEtaAt",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SELECT 'migration 003 applied' AS result;
