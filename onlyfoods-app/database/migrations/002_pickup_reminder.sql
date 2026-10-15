-- =====================================================================
--  Migration 002 : auto pickup reminder (Order.PickupReminderAt)
--  Runs any number of times (checks first, never drops data).
--  A fresh install from the current init.sql already has the column.
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'PickupReminderAt');
SET @ddl = IF(@needed,
  "ALTER TABLE `Order` ADD COLUMN PickupReminderAt DATETIME NULL COMMENT 'when the customer was auto-reminded to pick up (15 min after ReadyAt); NULL = not yet' AFTER ReadyAt",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- Only on the run that ADDS the column (@needed = 1): orders already waiting for pickup at that
-- moment are marked as reminded so they do not all fire at once. Later runs (every deploy)
-- must not touch business data, so this step is skipped when the column already existed.
SET @backfill = IF(@needed,
  "UPDATE `Order` o JOIN OrderStatus os ON os.StatusId = o.StatusId SET o.PickupReminderAt = COALESCE(o.ReadyAt, NOW()) WHERE os.StatusCode = 'READY' AND o.PickupReminderAt IS NULL",
  'SELECT 1');
PREPARE s FROM @backfill; EXECUTE s; DEALLOCATE PREPARE s;

SELECT 'migration 002 applied' AS result;
