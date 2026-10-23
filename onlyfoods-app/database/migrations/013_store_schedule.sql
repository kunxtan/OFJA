-- =====================================================================
--  Migration 013 : store opening hours + "pause new orders"
--  Whether a store takes orders is now computed from time, like FoodCourt
--  (utils.store_open_state) :
--    OpenTime / CloseTime  store hours inside the food court hours (NULL = food court hours)
--    ManualOverride        NULL = follow hours, TRUE/FALSE = opened/closed by hand
--    OverrideUntil         when the manual state ends (NULL = until changed by hand)
--    PausedUntil           "pause new orders" until this time (NULL = not paused)
--  Store.IsOpen is no longer read.
--  Backfill (only on the run that adds ManualOverride): stores that were
--  closed stay closed until the owner opens them again, instead of opening
--  on their own at the next scheduled time.
--  Runs any number of times (adds each column only if missing).
--  A fresh install from the current init.sql already has the columns.
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Store' AND COLUMN_NAME = 'OpenTime');
SET @ddl = IF(@needed,
  "ALTER TABLE Store ADD COLUMN OpenTime TIME NULL COMMENT 'store hours, inside FoodCourt hours ; NULL = FoodCourt hours' AFTER IsSuspended",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Store' AND COLUMN_NAME = 'CloseTime');
SET @ddl = IF(@needed,
  "ALTER TABLE Store ADD COLUMN CloseTime TIME NULL COMMENT 'NULL = FoodCourt hours' AFTER OpenTime",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @add_override = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Store' AND COLUMN_NAME = 'ManualOverride');
SET @ddl = IF(@add_override,
  "ALTER TABLE Store ADD COLUMN ManualOverride BOOLEAN NULL COMMENT 'NULL=follow hours, TRUE=opened by hand, FALSE=closed by hand' AFTER CloseTime",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Store' AND COLUMN_NAME = 'OverrideUntil');
SET @ddl = IF(@needed,
  "ALTER TABLE Store ADD COLUMN OverrideUntil DATETIME NULL COMMENT 'NULL = until changed by hand' AFTER ManualOverride",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Store' AND COLUMN_NAME = 'PausedUntil');
SET @ddl = IF(@needed,
  "ALTER TABLE Store ADD COLUMN PausedUntil DATETIME NULL COMMENT 'no new orders until this time ; NULL = not paused' AFTER OverrideUntil",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- once only (same run that added ManualOverride) : closed stores stay closed until the owner opens them
SET @ddl = IF(@add_override, 'UPDATE Store SET ManualOverride = FALSE WHERE IsOpen = FALSE', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SELECT 'migration 013 applied' AS result;
