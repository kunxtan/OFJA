-- =====================================================================
--  Migration 005 : walk-in cash received / change given (Payment)
--  Runs any number of times (checks first, never drops data).
--  A fresh install from the current init.sql already has both columns.
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Payment' AND COLUMN_NAME = 'CashReceived');
SET @ddl = IF(@needed,
  "ALTER TABLE Payment ADD COLUMN CashReceived DECIMAL(10,2) NULL COMMENT 'walk-in cash: money handed over by the customer' AFTER PaidAt",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Payment' AND COLUMN_NAME = 'ChangeGiven');
SET @ddl = IF(@needed,
  "ALTER TABLE Payment ADD COLUMN ChangeGiven DECIMAL(10,2) NULL COMMENT 'walk-in cash: change returned (CashReceived - Amount)' AFTER CashReceived",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SELECT 'migration 005 applied' AS result;
