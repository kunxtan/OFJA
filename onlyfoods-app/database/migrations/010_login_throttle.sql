-- =====================================================================
--  Migration 010 : LoginThrottle = failed logins counted per (IP + username)
--  and per username across all IPs. Replaces the old account lock
--  (User.FailedLoginCount / LockedUntil are no longer written).
--  After 5 failures the key waits 60 s, each further failure doubles the
--  wait up to 15 minutes ; the server answers 429 + Retry-After.
--  Runs any number of times. A fresh install from init.sql already has it.
-- =====================================================================

SET NAMES utf8mb4;
USE onlyfood;

CREATE TABLE IF NOT EXISTS LoginThrottle (
  ThrottleKey  CHAR(64)         NOT NULL COMMENT 'sha256 of "ip|<ip>|<username>" or "user|<username>" (no raw IP/username stored)',
  FailCount    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  BlockedUntil DATETIME         NULL,
  LastFailAt   DATETIME         NOT NULL,
  PRIMARY KEY (ThrottleKey),
  KEY ix_throttle_lastfail (LastFailAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- old 15-minute account locks : release them (the new throttle takes over)
UPDATE `User` SET FailedLoginCount = 0, LockedUntil = NULL WHERE LockedUntil IS NOT NULL OR FailedLoginCount > 0;

SELECT 'migration 010 applied' AS result;
