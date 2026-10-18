"""จำกัดการเดารหัสผ่าน (แทนการล็อกบัญชีเดิม)

นับครั้งที่ใส่ผิด 2 ชุด แล้วให้รอแบบเพิ่มขึ้นเรื่อย ๆ (ตอบ 429 + Retry-After) :
  - คู่ (IP + username) : ผิดครบ PAIR_THRESHOLD ครั้ง รอ BASE_SECONDS แล้วผิดต่อแต่ละครั้งรอเพิ่มเป็นเท่าตัว สูงสุด MAX_SECONDS
    คนอื่นที่ออกเน็ตผ่าน IP เดียวกัน (Wi-Fi มหาลัย) ไม่โดนด้วย เพราะนับแยกตาม username
  - username รวมทุก IP : เพดานสูงกว่า (USER_THRESHOLD) กันเดารหัสจากหลายเครื่องพร้อมกัน
ไม่ล็อกบัญชีถาวร และตอบเหมือนกันทั้ง username ที่มี/ไม่มีในระบบ (เดาไม่ได้ว่ามีบัญชีนี้ไหม)
เก็บเฉพาะ sha256 ของ key ไม่เก็บ IP/username ดิบ ; ไม่ผิดเลย RESET_AFTER = เริ่มนับใหม่
"""
import hashlib
import math
from datetime import timedelta
from typing import Optional

PAIR_THRESHOLD = 5
USER_THRESHOLD = 30
BASE_SECONDS = 60
MAX_SECONDS = 15 * 60
RESET_AFTER = timedelta(hours=1)
PURGE_AFTER = timedelta(days=1)


def wait_seconds(fail_count: int, threshold: int) -> int:
    """ผิดครบ threshold ครั้ง = รอ BASE_SECONDS ; ผิดเพิ่มทีละครั้ง = รอเพิ่มเป็นเท่าตัว (สูงสุด MAX_SECONDS)"""
    if fail_count < threshold:
        return 0
    return min(MAX_SECONDS, BASE_SECONDS * 2 ** min(fail_count - threshold, 10))


def _key(*parts: str) -> str:
    return hashlib.sha256("|".join(p.strip().lower() for p in parts).encode()).hexdigest()


def _keys(ip: Optional[str], username: str):
    return ((_key("ip", ip or "unknown", username), PAIR_THRESHOLD), (_key("user", username), USER_THRESHOLD))


def retry_after(cur, ip: Optional[str], username: str, now) -> int:
    """ยังต้องรออีกกี่วินาที (0 = ลองได้เลย)"""
    keys = [k for k, _ in _keys(ip, username)]
    cur.execute("SELECT MAX(BlockedUntil) AS until FROM LoginThrottle WHERE ThrottleKey IN (%s, %s)", keys)
    until = (cur.fetchone() or {}).get("until")
    if not until or until <= now:
        return 0
    return max(1, math.ceil((until - now).total_seconds()))


def record_failure(cur, ip: Optional[str], username: str, now) -> int:
    """นับครั้งที่ผิด (ต้องอยู่ใน transaction) คืนจำนวนวินาทีที่ต้องรอหลังครั้งนี้ (0 = ยังไม่ต้องรอ)"""
    wait = 0
    for key, threshold in _keys(ip, username):
        cur.execute("SELECT FailCount, LastFailAt FROM LoginThrottle WHERE ThrottleKey = %s FOR UPDATE", (key,))
        row = cur.fetchone()
        count = 1 if not row or row["LastFailAt"] < now - RESET_AFTER else int(row["FailCount"]) + 1
        seconds = wait_seconds(count, threshold)
        until = now + timedelta(seconds=seconds) if seconds else None
        cur.execute(
            """
            INSERT INTO LoginThrottle (ThrottleKey, FailCount, BlockedUntil, LastFailAt) VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE FailCount = VALUES(FailCount), BlockedUntil = VALUES(BlockedUntil),
                                    LastFailAt = VALUES(LastFailAt)
            """,
            (key, min(count, 65535), until, now),
        )
        wait = max(wait, seconds)
    cur.execute("DELETE FROM LoginThrottle WHERE LastFailAt < %s LIMIT 200", (now - PURGE_AFTER,))
    return wait


def clear(cur, ip: Optional[str], username: str) -> None:
    """เข้าสู่ระบบสำเร็จ (รหัสถูก) -> ล้างตัวนับของ username นี้"""
    keys = [k for k, _ in _keys(ip, username)]
    cur.execute("DELETE FROM LoginThrottle WHERE ThrottleKey IN (%s, %s)", keys)


def wait_message(seconds: int) -> str:
    if seconds >= 60:
        return f"ใส่รหัสผ่านผิดหลายครั้ง กรุณาลองใหม่ในอีก {(seconds + 59) // 60} นาที"
    return f"ใส่รหัสผ่านผิดหลายครั้ง กรุณาลองใหม่ในอีก {seconds} วินาที"
