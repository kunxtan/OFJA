-- =====================================================================
--  Migration 012 : the executive "ban customer" feature was removed (PO:
--  customers must not be bannable). Customers banned before the removal
--  could never be unbanned, so turn them back on.
--  Only CUSTOMER accounts are touched; staff use IsActive for their own
--  deactivate/delete flow and are left alone. No other code path sets a
--  customer to inactive, so running this again changes nothing.
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

UPDATE `User` u
JOIN Role r ON r.RoleId = u.RoleId AND r.RoleCode = 'CUSTOMER'
SET u.IsActive = TRUE
WHERE u.IsActive = FALSE;

SELECT 'migration 012 applied' AS result;
