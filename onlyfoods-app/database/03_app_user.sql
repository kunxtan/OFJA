-- =====================================================================
--  Only Food (OFJA) - least-privilege database user for main.py
--  Run AFTER 01_init.sql (as root):
--     mysql -u root -p < 03_app_user.sql
--
--  main.py no longer runs ALTER/CREATE/DROP, and never hard-deletes,
--  so the app account gets only what it uses:
--   * lookup tables        -> SELECT
--   * log tables           -> SELECT, INSERT   (append-only, as the schema says)
--   * everything else      -> SELECT, INSERT, UPDATE
--   * no DELETE / DDL / GRANT anywhere
--
--  1) change the password below (do NOT keep it)
--  2) narrow '%' to the app server's host/IP, e.g. 'onlyfood_app'@'10.0.0.5'
--  3) put the same values in DB_USER / DB_PASSWORD for main.py
-- =====================================================================

CREATE USER IF NOT EXISTS 'onlyfood_app'@'%' IDENTIFIED BY 'CHANGE_ME_to_a_long_random_password';

-- lookup / setup tables
GRANT SELECT ON onlyfood.`Role`          TO 'onlyfood_app'@'%';
GRANT SELECT ON onlyfood.OrderStatus     TO 'onlyfood_app'@'%';
GRANT SELECT ON onlyfood.PaymentMethod   TO 'onlyfood_app'@'%';
GRANT SELECT ON onlyfood.StoreCategory   TO 'onlyfood_app'@'%';
GRANT SELECT ON onlyfood.IssueType       TO 'onlyfood_app'@'%';
GRANT SELECT ON onlyfood.ProductCategory TO 'onlyfood_app'@'%';
GRANT SELECT ON onlyfood.MonthlyStoreSummary TO 'onlyfood_app'@'%';

-- master / transaction tables
GRANT SELECT, UPDATE         ON onlyfood.FoodCourt     TO 'onlyfood_app'@'%';
GRANT SELECT, INSERT, UPDATE ON onlyfood.Store         TO 'onlyfood_app'@'%';
GRANT SELECT, INSERT, UPDATE ON onlyfood.`User`        TO 'onlyfood_app'@'%';
GRANT SELECT, INSERT, UPDATE ON onlyfood.StoreContract TO 'onlyfood_app'@'%';
GRANT SELECT, INSERT, UPDATE ON onlyfood.Product       TO 'onlyfood_app'@'%';
GRANT SELECT, INSERT, UPDATE ON onlyfood.`Order`       TO 'onlyfood_app'@'%';
GRANT SELECT, INSERT, UPDATE ON onlyfood.OrderItem     TO 'onlyfood_app'@'%';
GRANT SELECT, INSERT, UPDATE ON onlyfood.Payment       TO 'onlyfood_app'@'%';
GRANT SELECT, INSERT, UPDATE ON onlyfood.Refund        TO 'onlyfood_app'@'%';
GRANT SELECT, INSERT, UPDATE ON onlyfood.PrintJob      TO 'onlyfood_app'@'%';
GRANT SELECT, INSERT, UPDATE ON onlyfood.Notification  TO 'onlyfood_app'@'%';
GRANT SELECT, INSERT         ON onlyfood.Review        TO 'onlyfood_app'@'%';
GRANT SELECT, INSERT         ON onlyfood.IssueReport   TO 'onlyfood_app'@'%';

-- log tables: append-only
GRANT SELECT, INSERT ON onlyfood.OrderStatusLog TO 'onlyfood_app'@'%';
GRANT SELECT, INSERT ON onlyfood.AuditLog       TO 'onlyfood_app'@'%';

-- views
GRANT SELECT ON onlyfood.v_foodcourt_status  TO 'onlyfood_app'@'%';
GRANT SELECT ON onlyfood.v_store_rating      TO 'onlyfood_app'@'%';
GRANT SELECT ON onlyfood.v_order_net         TO 'onlyfood_app'@'%';
GRANT SELECT ON onlyfood.v_contract_expiring TO 'onlyfood_app'@'%';
