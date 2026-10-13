"""สร้างบัญชีผู้บริหารคนแรก (ฐานข้อมูลใหม่ที่ยังไม่โหลด 02_seed_demo.sql จะยังไม่มีใครล็อกอินได้เลย)

    docker compose exec backend python -m tools.create_executive <username> "<ชื่อ-นามสกุล>"
"""
import argparse
import getpass
import sys

import pymysql

import config
from auth import hash_password
from utils import validate_password, validate_username


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("username")
    parser.add_argument("full_name")
    args = parser.parse_args()

    username = validate_username(args.username)
    password = getpass.getpass("รหัสผ่าน: ")
    if password != getpass.getpass("พิมพ์ซ้ำอีกครั้ง: "):
        print("รหัสผ่านไม่ตรงกัน", file=sys.stderr)
        return 1
    validate_password(password)

    conn = pymysql.connect(host=config.DB_HOST, port=config.DB_PORT, user=config.DB_USER,
                           password=config.DB_PASSWORD, database=config.DB_NAME, charset="utf8mb4")
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO `User` (Username, PasswordHash, FullName, RoleId) "
                "VALUES (%s, %s, %s, (SELECT RoleId FROM Role WHERE RoleCode = 'EXECUTIVE'))",
                (username, hash_password(password), args.full_name.strip()[:100]),
            )
        conn.commit()
    except pymysql.err.IntegrityError:
        print("ชื่อผู้ใช้นี้มีอยู่แล้ว", file=sys.stderr)
        return 1
    finally:
        conn.close()
    print(f"สร้างผู้บริหาร '{username}' แล้ว")
    return 0


if __name__ == "__main__":
    sys.exit(main())
