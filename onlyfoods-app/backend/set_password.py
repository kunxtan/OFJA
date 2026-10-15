"""
ตั้งรหัสผ่าน (bcrypt) ให้บัญชีใน `User` - ใช้กับบัญชี demo จาก 02_seed_demo.sql
ที่ PasswordHash เป็น NULL หรือใช้ปลดล็อกบัญชีที่ถูกล็อก

    python set_password.py uefa01
    python set_password.py exec01 owner01 staff01      (ตั้งทีละบัญชี ถามรหัสทีละครั้ง)

ใช้ environment เดียวกับ main.py (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)
รหัสผ่านพิมพ์ผ่าน getpass - ไม่ผ่าน command line จึงไม่ค้างใน shell history
"""
import getpass
import os
import sys

import bcrypt
import pymysql

MIN_LENGTH = 8


def check_policy(password: str) -> str:
    if len(password) < MIN_LENGTH:
        return f"ต้องยาวอย่างน้อย {MIN_LENGTH} ตัว"
    if len(password.encode("utf-8")) > 72:
        return "ยาวเกินไป"
    if any(ch.isspace() for ch in password):
        return "ห้ามมีช่องว่าง"
    if not (any(ch.isalpha() for ch in password) and any(ch.isdigit() for ch in password)):
        return "ต้องมีทั้งตัวอักษรและตัวเลข"
    return ""


def main(usernames):
    if not usernames:
        print(__doc__)
        return 1
    conn = pymysql.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.getenv("DB_NAME", "onlyfood"),
        charset="utf8mb4",
    )
    try:
        for username in usernames:
            with conn.cursor() as cur:
                cur.execute("SELECT UserId FROM `User` WHERE Username = %s", (username,))
                row = cur.fetchone()
            if not row:
                print(f"[{username}] ไม่พบบัญชีนี้ - ข้าม")
                continue
            while True:
                password = getpass.getpass(f"[{username}] รหัสผ่านใหม่: ")
                problem = check_policy(password)
                if problem:
                    print(f"  รหัสผ่าน{problem}")
                    continue
                if getpass.getpass(f"[{username}] ยืนยันรหัสผ่าน: ") != password:
                    print("  รหัสผ่านไม่ตรงกัน")
                    continue
                break
            hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")
            with conn.cursor() as cur:
                cur.execute("""UPDATE `User` SET PasswordHash = %s, FailedLoginCount = 0, LockedUntil = NULL
                               WHERE UserId = %s""", (hashed, row[0]))
                cur.execute("""INSERT INTO AuditLog (PerformedBy, ActionCode, EntityType, EntityId, NewValue)
                               VALUES (NULL, 'PASSWORD_SET_CLI', 'User', %s, JSON_OBJECT('tool', 'set_password.py'))""",
                            (str(row[0]),))
            conn.commit()
            print(f"[{username}] ตั้งรหัสผ่านเรียบร้อย")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
