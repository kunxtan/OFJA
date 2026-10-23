-- =====================================================================
--  Migration 014 : executive suspends a CUSTOMER account for N days
--  (or until lifted), with a reason, an appeal and automatic lifting.
--  This replaces the removed all-or-nothing ban (migration 012):
--    * the customer can still log in, see orders and appeal, but cannot
--      place new orders or write reviews while suspended
--    * orders placed before the suspension are NOT cancelled
--    * one row per suspension = the suspension history
--  Active suspension = LiftedAt IS NULL AND (EndAt IS NULL OR EndAt > now)
--  (enforcement compares the time, so it is exact even before the
--   background job writes LiftedAt for an expired row)
--  OpenUserId (= UserId while not lifted) + UNIQUE : at most one open
--  suspension per user, even under concurrent requests.
--  Runs any number of times (CREATE TABLE IF NOT EXISTS).
--  A fresh install from the current init.sql already has the table.
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

CREATE TABLE IF NOT EXISTS UserSuspension (
  SuspensionId     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  UserId           INT UNSIGNED  NOT NULL,
  Reason           VARCHAR(255)  NOT NULL,
  StartAt          DATETIME      NOT NULL,
  EndAt            DATETIME      NULL COMMENT 'NULL = until an executive lifts it',
  SuspendedBy      INT UNSIGNED  NOT NULL,
  LiftedAt         DATETIME      NULL,
  LiftedBy         INT UNSIGNED  NULL COMMENT 'NULL with LiftType AUTO = system',
  LiftType         ENUM('AUTO','MANUAL','APPEAL') NULL,
  LiftNote         VARCHAR(255)  NULL,
  AppealText       VARCHAR(1000) NULL COMMENT 'one appeal per suspension',
  AppealAt         DATETIME      NULL,
  AppealStatus     ENUM('PENDING','APPROVED','REJECTED') NULL,
  AppealResponse   VARCHAR(500)  NULL,
  AppealReviewedBy INT UNSIGNED  NULL,
  AppealReviewedAt DATETIME      NULL,
  OpenUserId       INT UNSIGNED  AS (IF(LiftedAt IS NULL, UserId, NULL)) STORED,
  PRIMARY KEY (SuspensionId),
  UNIQUE KEY uk_susp_open_user (OpenUserId),
  KEY ix_susp_user (UserId, StartAt),
  KEY ix_susp_due (LiftedAt, EndAt),
  KEY ix_susp_appeal (AppealStatus, AppealAt),
  -- no CASCADE here : MySQL forbids it on a base column of a STORED generated column (OpenUserId)
  CONSTRAINT fk_susp_user       FOREIGN KEY (UserId)           REFERENCES `User` (UserId),
  CONSTRAINT fk_susp_by         FOREIGN KEY (SuspendedBy)      REFERENCES `User` (UserId) ON UPDATE CASCADE,
  CONSTRAINT fk_susp_liftedby   FOREIGN KEY (LiftedBy)         REFERENCES `User` (UserId) ON UPDATE CASCADE,
  CONSTRAINT fk_susp_reviewedby FOREIGN KEY (AppealReviewedBy) REFERENCES `User` (UserId) ON UPDATE CASCADE
) ENGINE=InnoDB;

SELECT 'migration 014 applied' AS result;
