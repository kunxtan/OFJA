-- =====================================================================
--  Migration 004 : PrintJob.PrintStatus 'SKIPPED'
--  Customer slips that will never be printed (order already handed over / no-show /
--  cancelled, or front staff chose "don't print") are closed as SKIPPED instead of
--  staying QUEUED forever in the counter's "waiting to print" banner.
--  Runs any number of times (checks first, never drops data).
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

SET @needed = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'onlyfood' AND TABLE_NAME = 'PrintJob' AND COLUMN_NAME = 'PrintStatus'
                 AND COLUMN_TYPE LIKE '%SKIPPED%');
SET @ddl = IF(@needed,
  "ALTER TABLE PrintJob MODIFY PrintStatus ENUM('QUEUED','PRINTED','FAILED','SKIPPED') NOT NULL DEFAULT 'QUEUED'",
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- Close slips stuck from before this change (only jobs of orders that have already ended).
UPDATE PrintJob pj
JOIN `Order` o ON o.OrderId = pj.OrderId
JOIN OrderStatus os ON os.StatusId = o.StatusId
SET pj.PrintStatus = 'SKIPPED',
    pj.ErrorMessage = CASE os.StatusCode
      WHEN 'COMPLETED' THEN 'ส่งมอบอาหารแล้วก่อนพิมพ์'
      WHEN 'NO_SHOW'   THEN 'ลูกค้าไม่มารับอาหาร'
      ELSE 'ออเดอร์ถูกยกเลิก' END
WHERE pj.PrintType = 'CUSTOMER' AND pj.PrintStatus = 'QUEUED'
  AND os.StatusCode IN ('COMPLETED', 'NO_SHOW', 'CANCELLED');

SELECT 'migration 004 applied' AS result;
