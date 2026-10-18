-- =====================================================================
--  Only Food (OFJA) - Database Schema v2
--  Target : MySQL 8.0.32+ / InnoDB / utf8mb4
--  Source : ER Diagram v2 (22 entities)
--           Setup 5 | Master 6 | Transaction 8 | Log 2 | Summary 1
--
--  Notes
--  * `User` and `Order` are MySQL keywords -> always quoted with backticks.
--  * No "ADD COLUMN IF NOT EXISTS" (not supported by MySQL).
--  * Cycle FoodCourt -> `User` -> Store -> FoodCourt is broken by
--    creating FoodCourt first and adding fk_foodcourt_updatedby later.
--  * Money = DECIMAL(10,2). Images = file path VARCHAR, never base64.
--  * Soft delete (IsDeleted) on Store / Product only. Never hard-delete
--    anything a transaction row points to.
-- =====================================================================

-- !! WARNING: the next line wipes the whole database.
-- !! Use it only on a fresh install / Docker volume.
-- !! Comment it out if you are running this on a database that has data.
DROP DATABASE IF EXISTS onlyfood;
CREATE DATABASE onlyfood
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE onlyfood;

SET NAMES utf8mb4;
SET time_zone = '+07:00';


-- =====================================================================
-- 1) SETUP TABLES  (reference / lookup - seeded once, rarely changed)
-- =====================================================================

CREATE TABLE Role (
  RoleId        TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  RoleCode      VARCHAR(20)      NOT NULL,
  RoleNameTh    VARCHAR(50)      NOT NULL,
  RequiresStore BOOLEAN          NOT NULL DEFAULT FALSE,
  PRIMARY KEY (RoleId),
  UNIQUE KEY uk_role_code (RoleCode)
) ENGINE=InnoDB;

CREATE TABLE OrderStatus (
  StatusId     TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  StatusCode   VARCHAR(25)      NOT NULL,
  StatusNameTh VARCHAR(50)      NOT NULL,
  IsTerminal   BOOLEAN          NOT NULL DEFAULT FALSE,
  SortOrder    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (StatusId),
  UNIQUE KEY uk_status_code (StatusCode)
) ENGINE=InnoDB;

CREATE TABLE PaymentMethod (
  MethodId     TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  MethodCode   VARCHAR(20)      NOT NULL,
  MethodNameTh VARCHAR(50)      NOT NULL,
  RequiresSlip BOOLEAN          NOT NULL DEFAULT FALSE,
  IsActive     BOOLEAN          NOT NULL DEFAULT TRUE,
  PRIMARY KEY (MethodId),
  UNIQUE KEY uk_method_code (MethodCode)
) ENGINE=InnoDB;

CREATE TABLE StoreCategory (
  StoreCategoryId TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  CategoryName    VARCHAR(50)      NOT NULL,
  SortOrder       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (StoreCategoryId),
  UNIQUE KEY uk_storecategory_name (CategoryName)
) ENGINE=InnoDB;

CREATE TABLE IssueType (
  IssueTypeId TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  TypeCode    VARCHAR(25)      NOT NULL,
  TypeNameTh  VARCHAR(50)      NOT NULL,
  IsActive    BOOLEAN          NOT NULL DEFAULT TRUE,
  PRIMARY KEY (IssueTypeId),
  UNIQUE KEY uk_issuetype_code (TypeCode)
) ENGINE=InnoDB;


-- =====================================================================
-- 2) MASTER TABLES  (long-lived business data)
-- =====================================================================

-- FoodCourt is created WITHOUT the UpdatedBy foreign key.
-- The constraint is added at the end of this file (see section 6).
-- Effective open/closed is DERIVED, never stored:
--   IF(ManualOverride IS NOT NULL AND (OverrideUntil IS NULL OR OverrideUntil > NOW()),
--      ManualOverride,
--      CURTIME() BETWEEN OpenTime AND CloseTime)
CREATE TABLE FoodCourt (
  FoodCourtId    SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  FoodCourtName  VARCHAR(100)      NOT NULL,
  Location       VARCHAR(255)      NULL,
  OpenTime       TIME              NOT NULL DEFAULT '07:00:00',
  CloseTime      TIME              NOT NULL DEFAULT '18:00:00',
  ManualOverride BOOLEAN           NULL COMMENT 'NULL=follow schedule, TRUE=force open, FALSE=force close',
  OverrideUntil  DATETIME          NULL COMMENT 'NULL = override until changed by hand',
  UpdatedBy      INT UNSIGNED      NULL,
  UpdatedAt      DATETIME          NULL,
  PRIMARY KEY (FoodCourtId),
  UNIQUE KEY uk_foodcourt_name (FoodCourtName),
  KEY ix_foodcourt_updatedby (UpdatedBy)
) ENGINE=InnoDB;

CREATE TABLE Store (
  StoreId         INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  StoreName       VARCHAR(100)      NOT NULL,
  StoreCategoryId TINYINT UNSIGNED  NOT NULL,
  FoodCourtId     SMALLINT UNSIGNED NOT NULL,
  Description     VARCHAR(500)      NULL,
  ImageUrl        VARCHAR(500)      NULL,
  IsOpen          BOOLEAN           NOT NULL DEFAULT FALSE COMMENT 'set by the store itself',
  IsSuspended     BOOLEAN           NOT NULL DEFAULT FALSE COMMENT 'set by admin, overrides IsOpen',
  AvgPrepMinutes  SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  QueueCode       VARCHAR(2)        NOT NULL COMMENT 'queue prefix shown to customers: A -> A001, A002 ...',
  ContactName     VARCHAR(100)      NULL,
  ContactPhone    VARCHAR(20)       NULL,
  ContactLine     VARCHAR(50)       NULL,
  ContactEmail    VARCHAR(100)      NULL,
  IsDeleted       BOOLEAN           NOT NULL DEFAULT FALSE,
  DeletedAt       DATETIME          NULL,
  CreatedAt       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (StoreId),
  UNIQUE KEY uk_store_name (StoreName),
  UNIQUE KEY uk_store_queuecode (QueueCode),
  KEY ix_store_category (StoreCategoryId),
  KEY ix_store_foodcourt (FoodCourtId),
  KEY ix_store_active (IsDeleted, IsSuspended),
  CONSTRAINT fk_store_category   FOREIGN KEY (StoreCategoryId) REFERENCES StoreCategory (StoreCategoryId) ON UPDATE CASCADE,
  CONSTRAINT fk_store_foodcourt  FOREIGN KEY (FoodCourtId)     REFERENCES FoodCourt (FoodCourtId)         ON UPDATE CASCADE,
  CONSTRAINT ck_store_queuecode CHECK (REGEXP_LIKE(QueueCode, '^[A-Z]{1,2}$', 'c'))
) ENGINE=InnoDB;

-- StoreId is NULL for CUSTOMER / ACCOUNTANT / EXECUTIVE,
-- NOT NULL for roles whose Role.RequiresStore = TRUE (enforced in code).
CREATE TABLE `User` (
  UserId           INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  Username         VARCHAR(50)      NOT NULL,
  PasswordHash     VARCHAR(255)     NULL COMMENT 'bcrypt/argon2 only - NULL for Google-only accounts',
  GoogleId         VARCHAR(100)     NULL,
  FullName         VARCHAR(100)     NOT NULL,
  Phone            VARCHAR(20)      NULL,
  Email            VARCHAR(100)     NULL,
  RoleId           TINYINT UNSIGNED NOT NULL,
  StoreId          INT UNSIGNED     NULL,
  ProfileImageUrl  VARCHAR(500)     NULL,
  IsActive         BOOLEAN          NOT NULL DEFAULT TRUE,
  FailedLoginCount TINYINT UNSIGNED NOT NULL DEFAULT 0,
  LockedUntil      DATETIME         NULL,
  CreatedBy        INT UNSIGNED     NULL COMMENT 'admin who created this account; NULL = self sign-up',
  CreatedAt        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (UserId),
  UNIQUE KEY uk_user_username (Username),
  UNIQUE KEY uk_user_googleid (GoogleId),
  KEY ix_user_role (RoleId),
  KEY ix_user_store (StoreId),
  KEY ix_user_createdby (CreatedBy),
  CONSTRAINT fk_user_role      FOREIGN KEY (RoleId)    REFERENCES Role (RoleId)    ON UPDATE CASCADE,
  CONSTRAINT fk_user_store     FOREIGN KEY (StoreId)   REFERENCES Store (StoreId)  ON UPDATE CASCADE,
  CONSTRAINT fk_user_createdby FOREIGN KEY (CreatedBy) REFERENCES `User` (UserId)  ON UPDATE CASCADE
) ENGINE=InnoDB;

-- 1 : 1 with Store (UNIQUE on StoreId) - a store holds at most one contract row.
-- Renewing = UPDATE this row (keep the old values in AuditLog.OldValue).
CREATE TABLE StoreContract (
  ContractId     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  StoreId        INT UNSIGNED  NOT NULL,
  StartDate      DATE          NOT NULL,
  EndDate        DATE          NOT NULL,
  CreatedBy      INT UNSIGNED  NOT NULL,
  CreatedAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ContractId),
  UNIQUE KEY uk_contract_store (StoreId),
  KEY ix_contract_enddate (EndDate),
  KEY ix_contract_createdby (CreatedBy),
  CONSTRAINT fk_contract_store     FOREIGN KEY (StoreId)   REFERENCES Store (StoreId) ON UPDATE CASCADE,
  CONSTRAINT fk_contract_createdby FOREIGN KEY (CreatedBy) REFERENCES `User` (UserId) ON UPDATE CASCADE,
  CONSTRAINT ck_contract_dates CHECK (EndDate > StartDate)
) ENGINE=InnoDB;

CREATE TABLE ProductCategory (
  CategoryId   INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  StoreId      INT UNSIGNED     NOT NULL,
  CategoryName VARCHAR(50)      NOT NULL,
  SortOrder    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (CategoryId),
  UNIQUE KEY uk_prodcat_store_name (StoreId, CategoryName),
  CONSTRAINT fk_prodcat_store FOREIGN KEY (StoreId) REFERENCES Store (StoreId) ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Product (
  ProductId    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  StoreId      INT UNSIGNED  NOT NULL,
  CategoryId   INT UNSIGNED  NULL,
  ProductName  VARCHAR(100)  NOT NULL,
  Description  VARCHAR(500)  NULL,
  UnitPrice    DECIMAL(10,2) NOT NULL,
  ImageUrl     VARCHAR(500)  NULL,
  IsOutOfStock BOOLEAN       NOT NULL DEFAULT FALSE,
  IsDeleted    BOOLEAN       NOT NULL DEFAULT FALSE,
  CreatedAt    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (ProductId),
  UNIQUE KEY uk_product_store_name (StoreId, ProductName),
  KEY ix_product_category (CategoryId),
  KEY ix_product_store_visible (StoreId, IsDeleted, IsOutOfStock),
  CONSTRAINT fk_product_store    FOREIGN KEY (StoreId)    REFERENCES Store (StoreId)                     ON UPDATE CASCADE,
  CONSTRAINT fk_product_category FOREIGN KEY (CategoryId) REFERENCES ProductCategory (CategoryId)        ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT ck_product_price CHECK (UnitPrice >= 0)
) ENGINE=InnoDB;


-- =====================================================================
-- 3) TRANSACTION TABLES  (one row per business event)
-- =====================================================================

-- Allowed status transitions (enforced in application code):
--   VERIFYING_SLIP       -> PENDING | CANCELLED
--   PENDING              -> COOKING | PENDING_CANCELLATION
--   COOKING              -> COOKED  | PENDING_CANCELLATION
--   COOKED               -> READY
--   READY                -> COMPLETED | NO_SHOW   (NO_SHOW >= 30 min after ReadyAt and after LatePickupArrivalTime,
--                                                  staff press it by hand)
--   PENDING_CANCELLATION -> PENDING | AWAITING_TOP_UP | CANCELLED
--   AWAITING_TOP_UP      -> PENDING | CANCELLED   (swapped to a pricier item: the
--                           kitchen waits until the top-up slip is verified)
-- Walk-in (cash) orders start at PENDING.
CREATE TABLE `Order` (
  OrderId           BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  StoreId           INT UNSIGNED      NOT NULL,
  CustomerId        INT UNSIGNED      NULL COMMENT 'NULL for walk-in',
  CreatedByStaffId  INT UNSIGNED      NULL COMMENT 'staff who keyed in a walk-in order',
  StatusId          TINYINT UNSIGNED  NOT NULL,
  QueueNo           SMALLINT UNSIGNED NOT NULL,
  TotalAmount       DECIMAL(10,2)     NOT NULL DEFAULT 0.00,
  Note              VARCHAR(500)      NULL,
  IsWalkIn          BOOLEAN           NOT NULL DEFAULT FALSE,
  PickupTime        DATETIME          NULL COMMENT 'customer-requested pickup time',
  ReadyAt           DATETIME          NULL COMMENT 'set when status becomes READY; no-show clock starts here',
  PickupReminderAt  DATETIME          NULL COMMENT 'when the customer was auto-reminded to pick up (15 min after ReadyAt); NULL = not yet',
  LatePickupArrivalTime DATETIME      NULL COMMENT 'customer told the store they will arrive by this time (latest wins); no auto reminder, no-show locked until then',
  LatePickupMinutes SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'minutes chosen in the latest late-pickup notice',
  LatePickupCount   TINYINT UNSIGNED  NOT NULL DEFAULT 0 COMMENT 'how many times the customer sent a late-pickup notice (max 3, enforced in code)',
  CancelReason      VARCHAR(255)      NULL,
  CancelDeadline    DATETIME          NULL COMMENT 'after this, customer self-cancel is refused',
  CreatedAt         DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  OrderDate         DATE AS (DATE(CreatedAt)) STORED,
  PRIMARY KEY (OrderId),
  UNIQUE KEY uk_order_queue (StoreId, OrderDate, QueueNo),
  KEY ix_order_customer (CustomerId),
  KEY ix_order_staff (CreatedByStaffId),
  KEY ix_order_status (StatusId),
  KEY ix_order_store_date (StoreId, OrderDate),
  KEY ix_order_board (StoreId, StatusId, CreatedAt),
  CONSTRAINT fk_order_store    FOREIGN KEY (StoreId)          REFERENCES Store (StoreId)             ON UPDATE CASCADE,
  CONSTRAINT fk_order_customer FOREIGN KEY (CustomerId)       REFERENCES `User` (UserId),
  CONSTRAINT fk_order_staff    FOREIGN KEY (CreatedByStaffId) REFERENCES `User` (UserId),
  CONSTRAINT fk_order_status   FOREIGN KEY (StatusId)         REFERENCES OrderStatus (StatusId)      ON UPDATE CASCADE,
  CONSTRAINT ck_order_total CHECK (TotalAmount >= 0),
  CONSTRAINT ck_order_queue CHECK (QueueNo > 0),
  CONSTRAINT ck_order_actor CHECK (CustomerId IS NOT NULL OR CreatedByStaffId IS NOT NULL)
) ENGINE=InnoDB;

-- UnitPrice is a SNAPSHOT of Product.UnitPrice at order time - never a lookup.
-- ReplacesItemId: when an item is out of stock and swapped, the NEW row points
-- back at the OLD row, so both the original and the substitute stay on record.
CREATE TABLE OrderItem (
  OrderItemId    BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  OrderId        BIGINT UNSIGNED   NOT NULL,
  ProductId      INT UNSIGNED      NOT NULL,
  ReplacesItemId BIGINT UNSIGNED   NULL,
  Qty            SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  UnitPrice      DECIMAL(10,2)     NOT NULL,
  ItemNote       VARCHAR(255)      NULL,
  ItemStatus     ENUM('NORMAL','OUT_OF_STOCK','REPLACED','CANCELLED') NOT NULL DEFAULT 'NORMAL',
  PRIMARY KEY (OrderItemId),
  UNIQUE KEY uk_orderitem_replaces (ReplacesItemId) COMMENT 'one replacement per original item',
  KEY ix_orderitem_order (OrderId),
  KEY ix_orderitem_product (ProductId),
  CONSTRAINT fk_orderitem_order    FOREIGN KEY (OrderId)        REFERENCES `Order` (OrderId)   ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_orderitem_product  FOREIGN KEY (ProductId)      REFERENCES Product (ProductId) ON UPDATE CASCADE,
  CONSTRAINT fk_orderitem_replaces FOREIGN KEY (ReplacesItemId) REFERENCES OrderItem (OrderItemId) ON UPDATE CASCADE,
  CONSTRAINT ck_orderitem_qty   CHECK (Qty > 0),
  CONSTRAINT ck_orderitem_price CHECK (UnitPrice >= 0)
) ENGINE=InnoDB;

-- PaymentType ORDER  = the first payment for the food (one active per order:
--                      ActiveFlag + uk_payment_active).
-- PaymentType TOP_UP = extra transfer after swapping to a pricier item; an order
--                      can have many (each with its own slip).
-- A rejected slip leaves its row in place (ActiveFlag = NULL) and the customer
-- uploads a new one, so every slip and every rejection stays on record.
CREATE TABLE Payment (
  PaymentId     BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  OrderId       BIGINT UNSIGNED  NOT NULL,
  PaymentType   ENUM('ORDER','TOP_UP') NOT NULL DEFAULT 'ORDER',
  MethodId      TINYINT UNSIGNED NOT NULL,
  Amount        DECIMAL(10,2)    NOT NULL COMMENT 'amount actually paid (stored, not derived)',
  PaymentStatus ENUM('PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'PENDING',
  SlipImageUrl  VARCHAR(500)     NULL,
  SlipHash      CHAR(64)         NULL COMMENT 'sha256 of the slip image (reuse check)',
  RejectReason  VARCHAR(255)     NULL,
  VerifiedBy    INT UNSIGNED     NULL,
  PaidAt        DATETIME         NULL,
  CashReceived  DECIMAL(10,2)    NULL COMMENT 'walk-in cash: money handed over by the customer',
  ChangeGiven   DECIMAL(10,2)    NULL COMMENT 'walk-in cash: change returned (CashReceived - Amount)',
  CreatedAt     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ActiveFlag    TINYINT UNSIGNED AS (IF(PaymentType = 'ORDER' AND PaymentStatus <> 'REJECTED', 1, NULL)) STORED,
  PRIMARY KEY (PaymentId),
  UNIQUE KEY uk_payment_active (OrderId, ActiveFlag),
  KEY ix_payment_method (MethodId),
  KEY ix_payment_verifiedby (VerifiedBy),
  KEY ix_payment_status (PaymentStatus),
  KEY ix_payment_order_type (OrderId, PaymentType, PaymentStatus),
  KEY ix_payment_sliphash (SlipHash),
  CONSTRAINT fk_payment_order      FOREIGN KEY (OrderId)    REFERENCES `Order` (OrderId)             ON UPDATE CASCADE,
  CONSTRAINT fk_payment_method     FOREIGN KEY (MethodId)   REFERENCES PaymentMethod (MethodId)      ON UPDATE CASCADE,
  CONSTRAINT fk_payment_verifiedby FOREIGN KEY (VerifiedBy) REFERENCES `User` (UserId)               ON UPDATE CASCADE,
  CONSTRAINT ck_payment_amount CHECK (Amount > 0)
) ENGINE=InnoDB;

-- RefundType:
--   FULL_CANCEL  - whole order cancelled   (OrderItemId NULL)
--   PRICE_DIFF   - swapped for a cheaper item, pay the difference back
--   ITEM_CANCEL  - one item dropped, the rest still cooks
-- Rule enforced in code: SUM(Refund.Amount) per PaymentId <= Payment.Amount
CREATE TABLE Refund (
  RefundId     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  PaymentId    BIGINT UNSIGNED NOT NULL,
  OrderItemId  BIGINT UNSIGNED NULL,
  RefundType   ENUM('FULL_CANCEL','PRICE_DIFF','ITEM_CANCEL') NOT NULL,
  Amount       DECIMAL(10,2)   NOT NULL COMMENT 'stored, not derived',
  Reason       VARCHAR(255)    NULL,
  RefundStatus ENUM('PENDING','DONE','FAILED') NOT NULL DEFAULT 'PENDING',
  PayoutMethod      ENUM('CASH','TRANSFER')  NOT NULL DEFAULT 'CASH' COMMENT 'customer choice',
  PayoutKind        ENUM('PROMPTPAY','BANK') NULL,
  PayoutBank        VARCHAR(60)  NULL,
  PayoutAccountNo   VARCHAR(20)  NULL COMMENT 'PromptPay id or bank account; wiped when DONE',
  PayoutAccountName VARCHAR(100) NULL,
  PayoutQrUrl       VARCHAR(500) NULL,
  PayoutLockedAt    DATETIME     NULL COMMENT 'owner opened the payout details',
  PaidMethod        ENUM('CASH','TRANSFER') NULL COMMENT 'how the shop really paid',
  TransferSlipUrl   VARCHAR(500) NULL,
  RefundedBy   INT UNSIGNED    NULL,
  RequestedAt  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  RefundedAt   DATETIME        NULL,
  PRIMARY KEY (RefundId),
  KEY ix_refund_orderitem (OrderItemId),
  KEY ix_refund_payment (PaymentId),
  KEY ix_refund_refundedby (RefundedBy),
  CONSTRAINT fk_refund_payment    FOREIGN KEY (PaymentId)   REFERENCES Payment (PaymentId)     ON UPDATE CASCADE,
  CONSTRAINT fk_refund_orderitem  FOREIGN KEY (OrderItemId) REFERENCES OrderItem (OrderItemId),
  CONSTRAINT fk_refund_refundedby FOREIGN KEY (RefundedBy)  REFERENCES `User` (UserId)         ON UPDATE CASCADE,
  CONSTRAINT ck_refund_amount CHECK (Amount > 0),
  CONSTRAINT ck_refund_scope  CHECK (
    (RefundType = 'FULL_CANCEL' AND OrderItemId IS NULL)
    OR (RefundType <> 'FULL_CANCEL' AND OrderItemId IS NOT NULL)
  )
) ENGINE=InnoDB;

-- ItemsSnapshot keeps what was printed on the slip, so a reprint shows the
-- same thing even if the order was edited afterwards.
CREATE TABLE PrintJob (
  PrintJobId    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  OrderId       BIGINT UNSIGNED NOT NULL,
  PrintType     ENUM('KITCHEN','CUSTOMER','REPRINT') NOT NULL DEFAULT 'CUSTOMER',
  PrintStatus   ENUM('QUEUED','PRINTED','FAILED','SKIPPED') NOT NULL DEFAULT 'QUEUED',
  PrinterName   VARCHAR(100)    NULL,
  PrinterStatus ENUM('READY','OFFLINE')              NULL,
  ItemsSnapshot JSON            NULL,
  PerformedBy   INT UNSIGNED    NULL,
  ErrorMessage  VARCHAR(255)    NULL,
  CreatedAt     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PrintedAt     DATETIME        NULL,
  PRIMARY KEY (PrintJobId),
  KEY ix_printjob_order (OrderId),
  KEY ix_printjob_performedby (PerformedBy),
  KEY ix_printjob_status (PrintStatus),
  CONSTRAINT fk_printjob_order       FOREIGN KEY (OrderId)     REFERENCES `Order` (OrderId) ON UPDATE CASCADE,
  CONSTRAINT fk_printjob_performedby FOREIGN KEY (PerformedBy) REFERENCES `User` (UserId)   ON UPDATE CASCADE
) ENGINE=InnoDB;

-- StoreId / UserId are NOT stored here: they are reachable through
-- Order.StoreId and Order.CustomerId (3NF).
CREATE TABLE Review (
  ReviewId  BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  OrderId   BIGINT UNSIGNED  NOT NULL,
  Rating    TINYINT UNSIGNED NOT NULL,
  Comment   VARCHAR(1000)    NULL,
  ImageUrl  VARCHAR(500)     NULL,
  CreatedAt DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ReviewId),
  UNIQUE KEY uk_review_order (OrderId) COMMENT 'one review per order',
  CONSTRAINT fk_review_order FOREIGN KEY (OrderId) REFERENCES `Order` (OrderId) ON UPDATE CASCADE,
  CONSTRAINT ck_review_rating CHECK (Rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

CREATE TABLE IssueReport (
  IssueReportId BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  ReportedBy    INT UNSIGNED     NOT NULL,
  StoreId       INT UNSIGNED     NOT NULL,
  OrderId       BIGINT UNSIGNED  NULL,
  IssueTypeId   TINYINT UNSIGNED NOT NULL,
  Description   VARCHAR(1000)    NOT NULL,
  IssueStatus   ENUM('OPEN','IN_PROGRESS','RESOLVED','REJECTED') NOT NULL DEFAULT 'OPEN',
  AdminNote     VARCHAR(500)     NULL,
  HandledBy     INT UNSIGNED     NULL,
  CreatedAt     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ResolvedAt    DATETIME         NULL,
  PRIMARY KEY (IssueReportId),
  KEY ix_issue_reportedby (ReportedBy),
  KEY ix_issue_store (StoreId),
  KEY ix_issue_order (OrderId),
  KEY ix_issue_type (IssueTypeId),
  KEY ix_issue_handledby (HandledBy),
  KEY ix_issue_status (IssueStatus, CreatedAt),
  CONSTRAINT fk_issue_reportedby FOREIGN KEY (ReportedBy)  REFERENCES `User` (UserId)          ON UPDATE CASCADE,
  CONSTRAINT fk_issue_store      FOREIGN KEY (StoreId)     REFERENCES Store (StoreId)          ON UPDATE CASCADE,
  CONSTRAINT fk_issue_order      FOREIGN KEY (OrderId)     REFERENCES `Order` (OrderId)        ON UPDATE CASCADE,
  CONSTRAINT fk_issue_type       FOREIGN KEY (IssueTypeId) REFERENCES IssueType (IssueTypeId)  ON UPDATE CASCADE,
  CONSTRAINT fk_issue_handledby  FOREIGN KEY (HandledBy)   REFERENCES `User` (UserId)          ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Notification (
  NotificationId   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UserId           INT UNSIGNED    NOT NULL,
  OrderId          BIGINT UNSIGNED NULL,
  NotificationType ENUM('ORDER_STATUS','QUEUE_CALLED','PAYMENT','CONTRACT','ISSUE','SYSTEM') NOT NULL,
  Title            VARCHAR(150)    NOT NULL,
  Message          VARCHAR(500)    NOT NULL,
  IsRead           BOOLEAN         NOT NULL DEFAULT FALSE,
  CreatedAt        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (NotificationId),
  KEY ix_notif_user_unread (UserId, IsRead, CreatedAt),
  KEY ix_notif_order (OrderId),
  CONSTRAINT fk_notif_user  FOREIGN KEY (UserId)  REFERENCES `User` (UserId)   ON UPDATE CASCADE,
  CONSTRAINT fk_notif_order FOREIGN KEY (OrderId) REFERENCES `Order` (OrderId) ON UPDATE CASCADE
) ENGINE=InnoDB;


-- =====================================================================
-- 4) LOG TABLES  (append-only - never UPDATE, never DELETE)
-- =====================================================================

CREATE TABLE OrderStatusLog (
  LogId         BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  OrderId       BIGINT UNSIGNED  NOT NULL,
  OldStatusId   TINYINT UNSIGNED NULL COMMENT 'NULL on the first row (order created)',
  NewStatusId   TINYINT UNSIGNED NOT NULL,
  Reason        VARCHAR(255)     NULL,
  ChangedBy     INT UNSIGNED     NULL COMMENT 'NULL when ChangedByType = SYSTEM',
  ChangedByType ENUM('USER','SYSTEM') NOT NULL DEFAULT 'USER',
  CreatedAt     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (LogId),
  KEY ix_oslog_order (OrderId, CreatedAt),
  KEY ix_oslog_old (OldStatusId),
  KEY ix_oslog_new (NewStatusId),
  KEY ix_oslog_changedby (ChangedBy),
  CONSTRAINT fk_oslog_order     FOREIGN KEY (OrderId)     REFERENCES `Order` (OrderId)      ON UPDATE CASCADE,
  CONSTRAINT fk_oslog_old       FOREIGN KEY (OldStatusId) REFERENCES OrderStatus (StatusId) ON UPDATE CASCADE,
  CONSTRAINT fk_oslog_new       FOREIGN KEY (NewStatusId) REFERENCES OrderStatus (StatusId) ON UPDATE CASCADE,
  CONSTRAINT fk_oslog_changedby FOREIGN KEY (ChangedBy)   REFERENCES `User` (UserId),
  CONSTRAINT ck_oslog_actor CHECK (
    (ChangedByType = 'SYSTEM' AND ChangedBy IS NULL)
    OR (ChangedByType = 'USER' AND ChangedBy IS NOT NULL)
  )
) ENGINE=InnoDB;

-- Covers login events too (EntityType = 'AUTH'), and price history
-- through OldValue / NewValue - that is why there is no separate
-- SecurityLog or ProductPriceHistory table.
CREATE TABLE AuditLog (
  AuditLogId  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  PerformedBy INT UNSIGNED    NULL,
  ActionCode  VARCHAR(50)     NOT NULL COMMENT 'LOGIN_FAIL, PRICE_UPDATE, STORE_SUSPEND, ...',
  EntityType  VARCHAR(50)     NOT NULL COMMENT 'AUTH, Product, Store, Order, ...',
  EntityId    VARCHAR(50)     NULL,
  OldValue    JSON            NULL,
  NewValue    JSON            NULL,
  IpAddress   VARCHAR(45)     NULL COMMENT 'IPv6-sized',
  CreatedAt   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (AuditLogId),
  KEY ix_audit_performedby (PerformedBy, CreatedAt),
  KEY ix_audit_entity (EntityType, EntityId),
  KEY ix_audit_action (ActionCode, CreatedAt),
  CONSTRAINT fk_audit_performedby FOREIGN KEY (PerformedBy) REFERENCES `User` (UserId) ON UPDATE CASCADE
) ENGINE=InnoDB;


-- Append-only for real: even the app's own DB user cannot rewrite history.
-- (Single-statement trigger bodies, so no DELIMITER is needed.)
CREATE TRIGGER trg_auditlog_no_update BEFORE UPDATE ON AuditLog FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only';
CREATE TRIGGER trg_auditlog_no_delete BEFORE DELETE ON AuditLog FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only';
CREATE TRIGGER trg_oslog_no_update BEFORE UPDATE ON OrderStatusLog FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'OrderStatusLog is append-only';
CREATE TRIGGER trg_oslog_no_delete BEFORE DELETE ON OrderStatusLog FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'OrderStatusLog is append-only';


-- =====================================================================
-- 5) SUMMARY TABLE  (pre-computed monthly figures, all values STORED)
-- =====================================================================

-- NO_SHOW counts as revenue. CANCELLED does not.
-- Once IsLocked = TRUE the row must not change, even if old orders are edited.
CREATE TABLE MonthlyStoreSummary (
  SummaryId    BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  StoreId      INT UNSIGNED      NOT NULL,
  SummaryYear  SMALLINT UNSIGNED NOT NULL,
  SummaryMonth TINYINT UNSIGNED  NOT NULL,
  TotalOrders  INT UNSIGNED      NOT NULL DEFAULT 0,
  GrossSales   DECIMAL(12,2)     NOT NULL DEFAULT 0.00,
  RefundAmount DECIMAL(12,2)     NOT NULL DEFAULT 0.00,
  NetSales     DECIMAL(12,2)     NOT NULL DEFAULT 0.00,
  CancelRate   DECIMAL(5,2)      NOT NULL DEFAULT 0.00 COMMENT 'percent',
  IsLocked     BOOLEAN           NOT NULL DEFAULT FALSE,
  LockedBy     INT UNSIGNED      NULL,
  GeneratedAt  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (SummaryId),
  UNIQUE KEY uk_summary_store_period (StoreId, SummaryYear, SummaryMonth),
  KEY ix_summary_lockedby (LockedBy),
  CONSTRAINT fk_summary_store    FOREIGN KEY (StoreId)  REFERENCES Store (StoreId) ON UPDATE CASCADE,
  CONSTRAINT fk_summary_lockedby FOREIGN KEY (LockedBy) REFERENCES `User` (UserId) ON UPDATE CASCADE,
  CONSTRAINT ck_summary_month CHECK (SummaryMonth BETWEEN 1 AND 12),
  CONSTRAINT ck_summary_year  CHECK (SummaryYear BETWEEN 2020 AND 2100)
) ENGINE=InnoDB;


-- =====================================================================
-- 6) DEFERRED FOREIGN KEY  (breaks the FoodCourt -> User -> Store cycle)
-- =====================================================================

ALTER TABLE FoodCourt
  ADD CONSTRAINT fk_foodcourt_updatedby
  FOREIGN KEY (UpdatedBy) REFERENCES `User` (UserId) ON UPDATE CASCADE;


-- =====================================================================
-- 7) SEED DATA  (setup tables only)
-- =====================================================================

-- ศูนย์อาหารต้องมีอย่างน้อย 1 แถว (backend อ่านแถวแรก และร้านทุกร้านต้องผูกกับมัน)
-- ไฟล์ optional/02_seed_demo.sql จะมาอัปเดตแถวนี้ (ON DUPLICATE KEY UPDATE) ไม่ซ้ำ
INSERT INTO FoodCourt (FoodCourtId, FoodCourtName, Location, OpenTime, CloseTime, UpdatedAt)
VALUES (1, 'ศูนย์อาหารกลาง KMITL', 'อาคารศูนย์อาหาร', '08:00:00', '20:00:00', NOW());

-- RoleCode ตรงกับ 6 บทบาทของระบบเดิม (Users.Role ENUM) เพื่อย้ายข้อมูลได้ 1:1
INSERT INTO Role (RoleCode, RoleNameTh, RequiresStore) VALUES
  ('CUSTOMER',      'ลูกค้า',             FALSE),
  ('FRONT_STAFF',   'พนักงานหน้าร้าน',     TRUE),
  ('KITCHEN_STAFF', 'พนักงานครัว',        TRUE),
  ('STORE_OWNER',   'เจ้าของร้าน',         TRUE),
  ('ACCOUNTANT',    'ฝ่ายบัญชี',          FALSE),
  ('EXECUTIVE',     'ผู้บริหาร',           FALSE);

INSERT INTO OrderStatus (StatusCode, StatusNameTh, IsTerminal, SortOrder) VALUES
  ('VERIFYING_SLIP',       'รอตรวจสลิป',        FALSE, 1),
  ('PENDING',              'รอร้านรับออเดอร์',   FALSE, 2),
  ('COOKING',              'กำลังทำ',           FALSE, 3),
  ('COOKED',               'ทำเสร็จแล้ว',        FALSE, 4),
  ('READY',                'เรียกคิวแล้ว',       FALSE, 5),
  ('COMPLETED',            'รับอาหารแล้ว',       TRUE,  6),
  ('PENDING_CANCELLATION', 'รออนุมัติยกเลิก',    FALSE, 7),
  ('AWAITING_TOP_UP',      'รอโอนส่วนต่าง',      FALSE, 8),
  ('CANCELLED',            'ยกเลิก',            TRUE,  9),
  ('NO_SHOW',              'ไม่มารับอาหาร',      TRUE,  10);

INSERT INTO PaymentMethod (MethodCode, MethodNameTh, RequiresSlip, IsActive) VALUES
  ('QR_PROMPTPAY',   'โอนผ่าน QR PromptPay',  TRUE,  TRUE),
  ('CASH',           'เงินสด (หน้าร้าน)',     FALSE, TRUE),
  ('MOBILE_BANKING', 'โอนผ่านแอปธนาคาร',      TRUE,  TRUE);

INSERT INTO StoreCategory (CategoryName, SortOrder) VALUES
  ('อาหารจานเดียว',      1),
  ('ก๋วยเตี๋ยว / เส้น',    2),
  ('ตามสั่ง',            3),
  ('อาหารอีสาน',        4),
  ('เครื่องดื่ม',          5),
  ('ของหวาน / เบเกอรี',  6),
  ('ทานเล่น',           7),
  ('อื่น ๆ',              9);

INSERT INTO IssueType (TypeCode, TypeNameTh, IsActive) VALUES
  ('WRONG_ORDER',    'อาหารไม่ตรงตามออเดอร์',        TRUE),
  ('MISSING_ITEM',   'อาหารไม่ครบ',                 TRUE),
  ('FOOD_QUALITY',   'คุณภาพ/รสชาติอาหาร',          TRUE),
  ('SLOW_SERVICE',   'อาหารรอนานเกินกำหนด',         TRUE),
  ('PAYMENT_ISSUE',  'ปัญหาเรื่องการชำระเงิน/สลิป',  TRUE),
  ('STAFF_BEHAVIOR', 'พฤติกรรมพนักงาน',            TRUE),
  ('OTHER',          'ระบบขัดข้อง/อื่นๆ',           TRUE);


-- =====================================================================
-- 8) HELPER VIEWS  (derived values - keeps them out of the base tables)
-- =====================================================================

-- Effective open/closed state of a food court (FR-29).
CREATE OR REPLACE VIEW v_foodcourt_status AS
SELECT
  fc.FoodCourtId,
  fc.FoodCourtName,
  fc.OpenTime,
  fc.CloseTime,
  CASE
    WHEN fc.ManualOverride IS NOT NULL
         AND (fc.OverrideUntil IS NULL OR fc.OverrideUntil > NOW())
      THEN fc.ManualOverride
    ELSE CURTIME() BETWEEN fc.OpenTime AND fc.CloseTime
  END AS IsEffectivelyOpen
FROM FoodCourt fc;

-- Rating per store, derived from Review -> Order -> Store.
CREATE OR REPLACE VIEW v_store_rating AS
SELECT
  o.StoreId,
  COUNT(r.ReviewId)            AS ReviewCount,
  ROUND(AVG(r.Rating), 2)      AS AvgRating
FROM Review r
JOIN `Order` o ON o.OrderId = r.OrderId
GROUP BY o.StoreId;

-- Money actually kept per order = everything verified (food + top-ups)
-- minus refunds, both paid back (DONE) and waiting for the customer to collect
-- at the counter (PENDING): a refund is never revenue. One row per order: the
-- refund sums are grouped per payment first so a join never multiplies the totals.
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

-- Contracts within 30 days of expiry (FR-33).
CREATE OR REPLACE VIEW v_contract_expiring AS
SELECT
  sc.ContractId,
  sc.StoreId,
  s.StoreName,
  sc.EndDate,
  DATEDIFF(sc.EndDate, CURDATE()) AS DaysLeft
FROM StoreContract sc
JOIN Store s ON s.StoreId = sc.StoreId
WHERE sc.EndDate >= CURDATE()
  AND sc.EndDate <= DATE_ADD(CURDATE(), INTERVAL 30 DAY);

-- =====================================================================
--  End of schema. 22 tables + 4 views.
--  Rules that must live in application code (not expressible in DDL):
--   1. Order status transitions (see the comment above `Order`).
--   2. SUM(Refund.Amount) per PaymentId <= Payment.Amount.
--   3. QueueNo = next number per (StoreId, OrderDate), taken while holding
--      a lock on the Store row; shown as Store.QueueCode + 3 digits (A001).
--      Never COUNT(*) + 1.
--   4. `User`.StoreId must be NOT NULL when Role.RequiresStore = TRUE.
--   5. OrderItem.UnitPrice is copied from Product at insert time.
--   6. A substitute item that costs more creates a PENDING TOP_UP payment and
--      the order waits in AWAITING_TOP_UP until that slip is verified;
--      a cheaper one creates a PRICE_DIFF refund.
--   7. NO_SHOW only from READY and only >= 30 minutes after ReadyAt; the customer is auto-reminded
--      once at 15 minutes (PickupReminderAt).
-- =====================================================================