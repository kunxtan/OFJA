#!/bin/bash
# L26 : user MySQL ที่ backend ใช้ (MYSQL_USER ใน .env) ได้แค่ SELECT / INSERT / UPDATE / DELETE ในฐาน onlyfood
# (image mysql ให้ MYSQL_USER สิทธิ์ ALL บนฐานนี้ตั้งแต่สร้าง = DROP/ALTER/TRIGGER ได้ ถ้าโดน SQL injection เสียหายหนัก)
# migration / init ยังรันด้วย root ตามเดิม ; trigger และ view สร้างโดย root จึงทำงานต่อได้ด้วยสิทธิ์ของ root
# รันซ้ำได้ ; ไม่มี MYSQL_USER หรือเป็น root = ไม่ทำอะไร
# ใช้: DC="sudo docker compose -f docker-compose.cloud.yml" bash database/restrict_app_user.sh
set -euo pipefail
DC=${DC:-"docker compose"}

$DC exec -T db sh -c '
  u="$MYSQL_USER"
  if [ -z "$u" ] || [ "$u" = "root" ]; then echo "ไม่มี MYSQL_USER แยก (backend ใช้ root) - ข้าม"; exit 0; fi
  q() { mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B -e "$1" 2>/dev/null; }
  if [ "$(q "SELECT COUNT(*) FROM mysql.user WHERE User = '"'"'$u'"'"' AND Host = '"'"'%'"'"'")" != "1" ]; then
    echo "ไม่พบ user $u@% - ข้าม"; exit 0
  fi
  q "REVOKE ALL PRIVILEGES, GRANT OPTION FROM '"'"'$u'"'"'@'"'"'%'"'"'"
  q "GRANT SELECT, INSERT, UPDATE, DELETE ON onlyfood.* TO '"'"'$u'"'"'@'"'"'%'"'"'"
  echo "สิทธิ์ของ $u ตอนนี้:"; q "SHOW GRANTS FOR '"'"'$u'"'"'@'"'"'%'"'"'"
'
