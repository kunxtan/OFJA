-- =====================================================================
--  Migration 007 : refund payout (cash at the counter OR bank transfer by the shop owner)
--  PayoutMethod/Payout*  = what the customer asked for (account data is wiped once the refund is DONE)
--  PaidMethod/TransferSlipUrl = what the shop actually did (kept as evidence)
--  Runs any number of times (checks first, never drops data).
--  A fresh install from the current init.sql already has these columns.
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Refund' AND COLUMN_NAME = 'PayoutMethod');
SET @ddl = IF(@needed,
  "ALTER TABLE Refund
     ADD COLUMN PayoutMethod      ENUM('CASH','TRANSFER')  NOT NULL DEFAULT 'CASH' COMMENT 'customer choice' AFTER RefundStatus,
     ADD COLUMN PayoutKind        ENUM('PROMPTPAY','BANK') NULL AFTER PayoutMethod,
     ADD COLUMN PayoutBank        VARCHAR(60)  NULL AFTER PayoutKind,
     ADD COLUMN PayoutAccountNo   VARCHAR(20)  NULL COMMENT 'PromptPay id or bank account; wiped when DONE' AFTER PayoutBank,
     ADD COLUMN PayoutAccountName VARCHAR(100) NULL AFTER PayoutAccountNo,
     ADD COLUMN PayoutQrUrl       VARCHAR(500) NULL AFTER PayoutAccountName,
     ADD COLUMN PaidMethod        ENUM('CASH','TRANSFER') NULL COMMENT 'how the shop really paid' AFTER PayoutQrUrl,
     ADD COLUMN TransferSlipUrl   VARCHAR(500) NULL AFTER PaidMethod",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- refunds already DONE before this migration were all paid in cash at the counter
UPDATE Refund SET PaidMethod = 'CASH' WHERE RefundStatus = 'DONE' AND PaidMethod IS NULL;

SELECT 'migration 007 applied' AS result;
