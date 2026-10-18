-- =====================================================================
--  Migration 009 : Order.DeliveredAt = when the food was handed to the customer
--  (status became COMPLETED). Old orders are filled once from OrderStatusLog.
--  NO_SHOW / CANCELLED orders stay NULL (nothing was handed over).
--  Runs any number of times (adds the column only if missing ; the backfill
--  only touches rows that are still NULL).
--  A fresh install from the current init.sql already has the column.
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'DeliveredAt');
SET @ddl = IF(@needed,
  "ALTER TABLE `Order` ADD COLUMN DeliveredAt DATETIME NULL COMMENT 'set when status becomes COMPLETED (food handed over)' AFTER ReadyAt",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE `Order` o
JOIN OrderStatus os ON os.StatusId = o.StatusId AND os.StatusCode = 'COMPLETED'
JOIN (SELECT l.OrderId, MAX(l.CreatedAt) AS At
      FROM OrderStatusLog l JOIN OrderStatus ns ON ns.StatusId = l.NewStatusId AND ns.StatusCode = 'COMPLETED'
      GROUP BY l.OrderId) d ON d.OrderId = o.OrderId
SET o.DeliveredAt = d.At
WHERE o.DeliveredAt IS NULL;

SELECT 'migration 009 applied' AS result;
