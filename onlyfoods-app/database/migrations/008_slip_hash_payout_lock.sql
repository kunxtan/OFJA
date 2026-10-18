-- =====================================================================
--  Migration 008 : Payment.SlipHash (sha256 of the slip image) so the same slip
--  cannot pay for two orders ; Refund.PayoutLockedAt = the shop owner opened the
--  customer's bank details, the customer can no longer change them (no double payout) ;
--  Refund.OrderItemId no longer unique (price differences split across payments / swapped twice).
--  Runs any number of times (checks first, never drops data).
--  A fresh install from the current init.sql already has these columns.
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Payment' AND COLUMN_NAME = 'SlipHash');
SET @ddl = IF(@needed,
  "ALTER TABLE Payment ADD COLUMN SlipHash CHAR(64) NULL COMMENT 'sha256 of the slip image (reuse check)' AFTER SlipImageUrl,
                       ADD KEY ix_payment_sliphash (SlipHash)",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Refund' AND COLUMN_NAME = 'PayoutLockedAt');
SET @ddl = IF(@needed,
  "ALTER TABLE Refund ADD COLUMN PayoutLockedAt DATETIME NULL COMMENT 'owner opened the payout details' AFTER PayoutQrUrl",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- one item can be swapped to a cheaper dish more than once, and one price difference can be paid back
-- from two payments (food + top-up) : OrderItemId is no longer unique in Refund
SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Refund' AND INDEX_NAME = 'ix_refund_orderitem');
SET @ddl = IF(@needed, 'ALTER TABLE Refund ADD KEY ix_refund_orderitem (OrderItemId)', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @needed = (SELECT COUNT(*) > 0 FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Refund' AND INDEX_NAME = 'uk_refund_orderitem');
SET @ddl = IF(@needed, 'ALTER TABLE Refund DROP INDEX uk_refund_orderitem', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SELECT 'migration 008 applied' AS result;
