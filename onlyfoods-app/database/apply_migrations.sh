#!/usr/bin/env bash
# รัน database/migrations/*.sql ทุกไฟล์กับฐานที่มีข้อมูลอยู่แล้ว (ทุกไฟล์รันซ้ำได้)
# ใช้จาก deploy.yml :  DC="sudo docker compose -f docker-compose.cloud.yml" bash database/apply_migrations.sh
#
# กันค้าง: ALTER TABLE ต้องรอให้ไม่มีใครถือตารางนั้นค้างใน transaction ; ค่าเริ่มต้นของ MySQL รอได้ 1 ปี
# ระหว่างรอ ทุกคำสั่งที่แตะตารางนั้นต่อคิวตาม = เว็บค้าง
#   1) ก่อนเริ่ม: ปิด ALTER ที่ค้างจากรอบ deploy ก่อน (ยกเลิก job ไม่ได้ปิดคำสั่งที่รันใน container)
#   2) แต่ละไฟล์รอล็อกได้ไม่เกิน LOCK_WAIT วินาที
#   3) ถ้ารอไม่ไหว: แสดงว่าใครถือตารางค้าง แล้วปิด connection ที่ "ว่าง (Sleep) แต่ถือตาราง onlyfood ค้าง"
#      นานกว่า IDLE_KILL_AFTER วินาที (เช่นโปรแกรมดู DB ที่ไม่ได้ commit / connection ค้าง) แล้วลองใหม่ 1 ครั้ง
set -euo pipefail
cd "$(dirname "$0")/.."

DC=${DC:-docker compose}
LOCK_WAIT=${LOCK_WAIT:-60}
IDLE_KILL_AFTER=${IDLE_KILL_AFTER:-30}

sql() {  # sql "<query>"  -> ผลลัพธ์แบบไม่มีหัวตาราง
  $DC exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B onlyfood 2>/dev/null' <<<"$1"
}

kill_ids() {
  local ids="$1" why="$2" id
  for id in $ids; do
    echo "   KILL $id ($why)"
    sql "KILL $id;" || true
  done
}

show_blockers() {
  echo "-- connections ที่ถือตารางใน onlyfood อยู่ (id, คำสั่ง, ค้างมากี่วินาที, host, คำสั่ง SQL ล่าสุด):"
  sql "SELECT DISTINCT t.PROCESSLIST_ID, t.PROCESSLIST_COMMAND, t.PROCESSLIST_TIME, t.PROCESSLIST_HOST, LEFT(COALESCE(t.PROCESSLIST_INFO,''),80)
       FROM performance_schema.metadata_locks ml JOIN performance_schema.threads t ON t.THREAD_ID = ml.OWNER_THREAD_ID
       WHERE ml.OBJECT_SCHEMA = 'onlyfood' AND t.PROCESSLIST_ID IS NOT NULL AND t.PROCESSLIST_ID <> CONNECTION_ID();" || true
}

stale_alters() {  # ALTER/DDL จากรอบก่อนที่ยังรอล็อกอยู่
  sql "SELECT ID FROM information_schema.PROCESSLIST
       WHERE ID <> CONNECTION_ID() AND STATE LIKE 'Waiting for table metadata lock'
         AND (INFO LIKE 'ALTER %' OR INFO LIKE 'CREATE %' OR INFO LIKE 'DROP %');"
}

idle_lock_holders() {  # ว่างอยู่ (Sleep) แต่ยังถือตารางค้าง = transaction ที่ไม่ได้ commit/rollback
  sql "SELECT DISTINCT t.PROCESSLIST_ID
       FROM performance_schema.metadata_locks ml JOIN performance_schema.threads t ON t.THREAD_ID = ml.OWNER_THREAD_ID
       WHERE ml.OBJECT_SCHEMA = 'onlyfood' AND ml.LOCK_STATUS = 'GRANTED'
         AND t.PROCESSLIST_ID IS NOT NULL AND t.PROCESSLIST_ID <> CONNECTION_ID()
         AND t.PROCESSLIST_COMMAND = 'Sleep' AND t.PROCESSLIST_TIME >= $IDLE_KILL_AFTER;"
}

run_file() {
  # lock_wait_timeout ต่อ session : ไฟล์ migration ไม่ต้องแก้
  { echo "SET SESSION lock_wait_timeout = $LOCK_WAIT;"; cat "$1"; } |
    $DC exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" onlyfood'
}

ids=$(stale_alters || true)
if [ -n "$ids" ]; then kill_ids "$ids" "migration ค้างจากรอบก่อน"; fi

for f in database/migrations/*.sql; do
  [ -f "$f" ] || continue
  echo "== $f"
  if run_file "$f"; then continue; fi
  echo "!! $f ไม่สำเร็จ (อาจรอล็อกเกิน ${LOCK_WAIT} วินาที)"
  show_blockers
  ids=$(idle_lock_holders || true)
  if [ -z "$ids" ]; then
    echo "ไม่พบ connection ว่างที่ถือตารางค้าง - หยุด deploy (ดูรายการด้านบน)"; exit 1
  fi
  kill_ids "$ids" "ว่างแต่ถือตารางค้าง >= ${IDLE_KILL_AFTER}s"
  sleep 2
  echo "== $f (ลองใหม่)"
  run_file "$f" || { show_blockers; exit 1; }
done
