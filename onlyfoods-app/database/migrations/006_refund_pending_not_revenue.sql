-- =====================================================================
--  Migration 006 : refunds waiting for the customer to collect at the counter
--  (RefundStatus = PENDING) are no longer counted as revenue in v_order_net.
--  Runs any number of times (view only, no table changes).
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

CREATE OR REPLACE VIEW v_order_net AS
SELECT
  p.OrderId,
  SUM(p.Amount)                                  AS PaidAmount,
  COALESCE(SUM(rf.Refunded), 0)                  AS RefundedAmount,
  COALESCE(SUM(rf.Pending), 0)                   AS PendingRefundAmount,
  SUM(p.Amount) - COALESCE(SUM(rf.Refunded), 0) - COALESCE(SUM(rf.Pending), 0) AS NetAmount
FROM Payment p
LEFT JOIN (
  SELECT PaymentId,
         SUM(CASE WHEN RefundStatus = 'DONE' THEN Amount ELSE 0 END)    AS Refunded,
         SUM(CASE WHEN RefundStatus = 'PENDING' THEN Amount ELSE 0 END) AS Pending
  FROM Refund
  WHERE RefundStatus IN ('DONE', 'PENDING')
  GROUP BY PaymentId
) rf ON rf.PaymentId = p.PaymentId
WHERE p.PaymentStatus = 'VERIFIED'
GROUP BY p.OrderId;

SELECT 'migration 006 applied' AS result;
