-- =====================================================================
--  Migration 003 : customer tells the store they will pick up late
--  (Order.LatePickupArrivalTime / LatePickupMinutes / LatePickupCount)
--  Runs any number of times: each column is added only if it is missing
--  (also safe if some of them were already added by hand).
--  A fresh install from the current init.sql already has all three.
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'LatePickupArrivalTime');
SET @ddl = IF(@needed,
  "ALTER TABLE `Order` ADD COLUMN LatePickupArrivalTime DATETIME NULL COMMENT 'customer told the store they will arrive by this time (latest wins); no auto reminder, no-show locked until then' AFTER PickupReminderAt",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'LatePickupMinutes');
SET @ddl = IF(@needed,
  "ALTER TABLE `Order` ADD COLUMN LatePickupMinutes SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'minutes chosen in the latest late-pickup notice' AFTER LatePickupArrivalTime",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'LatePickupCount');
SET @ddl = IF(@needed,
  "ALTER TABLE `Order` ADD COLUMN LatePickupCount TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'how many times the customer sent a late-pickup notice (max 3, enforced in code)' AFTER LatePickupMinutes",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SELECT 'migration 003 applied' AS result;
