"""ตั้ง/รีเซ็ตรหัสผ่านผ่าน command line (ใช้ครั้งแรกหลังโหลด 02_seed_demo.sql ที่ PasswordHash เป็น NULL)

    docker compose exec backend python -m tools.set_password <username>
    docker compose exec backend python -m tools.set_password --all-empty      # ทุกบัญชีที่ยังไม่มีรหัสผ่าน

รหัสผ่านถามผ่านหน้าจอ (ไม่ต้องพิมพ์ใน command ไม่ค้างใน shell history)
"""
import argparse
import getpass
import sys

import pymysql

import config
from auth import hash_password
from utils import validate_password


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("username", nargs="?", help="ชื่อผู้ใช้ที่จะตั้งรหัสผ่านใหม่")
    parser.add_argument("--all-empty", action="store_true", help="ตั้งรหัสเดียวกันให้ทุกบัญชีที่ PasswordHash ยังเป็น NULL (ยกเว้นบัญชี Google)")
    args = parser.parse_args()
    if not args.username and not args.all_empty:
        parser.error("ระบุ username หรือใช้ --all-empty")

    password = getpass.getpass("รหัสผ่านใหม่: ")
    if password != getpass.getpass("พิมพ์ซ้ำอีกครั้ง: "):
        print("รหัสผ่านไม่ตรงกัน", file=sys.stderr)
        return 1
    validate_password(password)
    hashed = hash_password(password)

    conn = pymysql.connect(host=config.DB_HOST, port=config.DB_PORT, user=config.DB_USER,
                           password=config.DB_PASSWORD, database=config.DB_NAME, charset="utf8mb4")
    try:
        with conn.cursor() as cur:
            if args.all_empty:
                cur.execute(
                    "UPDATE `User` SET PasswordHash = %s, FailedLoginCount = 0, LockedUntil = NULL "
                    "WHERE PasswordHash IS NULL AND GoogleId IS NULL",
                    (hashed,),
                )
            else:
                cur.execute(
                    "UPDATE `User` SET PasswordHash = %s, FailedLoginCount = 0, LockedUntil = NULL WHERE Username = %s",
                    (hashed, args.username),
                )
            updated = cur.rowcount
        conn.commit()
    finally:
        conn.close()
    print(f"ตั้งรหัสผ่านให้ {updated} บัญชีแล้ว")
    return 0 if updated else 1


if __name__ == "__main__":
    sys.exit(main())
