-- =====================================================================
--  Migration 011 : idempotent order creation (M6)
--  Order.ClientRequestId = random key the app sends with each checkout attempt
--  (Idempotency-Key). Unique per actor (the customer, or the staff member for
--  walk-in), so a double tap / network retry returns the same order instead of
--  creating a second one, and nobody can read another person's order by
--  guessing a key. RequestFingerprint = sha256 of the cart, to refuse the same
--  key with a different cart.
--  Runs any number of times. A fresh install from init.sql already has these.
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'ClientRequestId');
SET @ddl = IF(@needed,
  "ALTER TABLE `Order`
     ADD COLUMN RequestActorId     INT UNSIGNED NULL COMMENT 'who sent ClientRequestId (customer, or staff for walk-in)' AFTER CreatedAt,
     ADD COLUMN ClientRequestId    VARCHAR(64)  NULL COMMENT 'Idempotency-Key of the checkout attempt' AFTER RequestActorId,
     ADD COLUMN RequestFingerprint CHAR(64)     NULL COMMENT 'sha256 of the cart sent with ClientRequestId' AFTER ClientRequestId,
     ADD UNIQUE KEY uk_order_client_request (RequestActorId, ClientRequestId)",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SELECT 'migration 011 applied' AS result;
