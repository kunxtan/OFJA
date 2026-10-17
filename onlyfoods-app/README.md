# Only Foods (OFJA)

ระบบสั่งอาหารศูนย์อาหาร — React (Vite) + FastAPI + MySQL 8 + nginx รันด้วย Docker Compose
เซิร์ฟเวอร์: `only-foods.cskmitl.com` (พอร์ตที่ cloud เปิดให้: 22, 80, 443, 3306, 3000, 8080)

## โครงสร้าง
```
onlyfoods-app/
├─ docker-compose.yml   db + backend + frontend + proxy(nginx)
├─ nginx.conf           80→443, /api และ /uploads → backend, อื่น ๆ → frontend
├─ nginx.http-only.conf ใช้ชั่วคราวถ้ายังไม่มีใบรับรอง HTTPS
├─ .env.example         ตัวอย่างค่าลับ (คัดลอกเป็น .env)
├─ database/init.sql    schema ใหม่ 22 ตาราง 4 view + trigger กันแก้ log + ข้อมูล lookup
│   ├─ migrations/      อัปเดต schema ของฐานที่มีข้อมูลแล้ว (deploy รันให้อัตโนมัติ)
│   └─ optional/        02_seed_demo.sql (ข้อมูลทดลอง) · 03_migrate_from_old_db.sql (ย้ายข้อมูลจาก onlyfoods_db เดิม)
├─ backend/             FastAPI: main, config, db, auth, state, services, shapes, schemas, routers/, tools/, tests/
└─ frontend/            React (แก้เฉพาะที่จำเป็น ดูหัวข้อ "สิ่งที่แก้ใน frontend")
```
> ไม่มีพอร์ต 3306 ถูก publish จาก compose — ฐานข้อมูลคุยได้เฉพาะ backend ในเครือข่าย docker
> (พอร์ต 3306/3000/8080 ที่ cloud เปิดไว้ไม่มี service ฟังอยู่ ขอให้ผู้ดูแลปิดได้เลย)

## Deploy ครั้งแรก
```bash
cd onlyfoods-app
cp .env.example .env          # แก้ทุกค่า; JWT_SECRET: python3 -c "import secrets; print(secrets.token_urlsafe(48))"

# 1) ใบรับรอง HTTPS (พอร์ต 80 ต้องว่าง ทำก่อน compose up)
sudo certbot certonly --standalone -d only-foods.cskmitl.com
#    ถ้ายังออกใบรับรองไม่ได้: ตั้ง NGINX_CONF=./nginx.http-only.conf ใน .env (ทดสอบเท่านั้น)

# 2) ขึ้นระบบ (ฐานข้อมูลถูกสร้างจาก database/init.sql อัตโนมัติเมื่อ volume ว่าง)
sudo docker compose up -d --build

# 3) มีผู้ใช้คนแรก — เลือกอย่างใดอย่างหนึ่ง
sudo docker compose exec backend python -m tools.create_executive exec01 "ชื่อ-นามสกุล"
#  หรือโหลดข้อมูลทดลอง แล้วตั้งรหัสผ่านให้ทุกบัญชี (PasswordHash ใน seed เป็น NULL เพราะรหัสเดิมเป็น plaintext)
sudo docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" onlyfood' < database/optional/02_seed_demo.sql
sudo docker compose exec backend python -m tools.set_password --all-empty
```
ต่ออายุใบรับรอง: `certbot renew --webroot -w /var/www/certbot --deploy-hook "docker compose -f /home/ubuntu/OFJA/onlyfoods-app/docker-compose.yml exec proxy nginx -s reload"`
(ต้องสร้างโฟลเดอร์ `/var/www/certbot` ก่อน; ถ้าออกใบด้วย standalone ให้ใช้ `certbot renew` หลังหยุด proxy ชั่วคราว หรือออกใหม่ด้วย `--webroot`)

ย้ายข้อมูลจากฐานเก่า: ดูหัวไฟล์ `database/optional/03_migrate_from_old_db.sql` (ใช้แทน 02 ไม่ใช่ทั้งคู่)

**แก้ schema ของฐานที่มีข้อมูลแล้ว**: `init.sql` รันเฉพาะตอน volume ว่าง จึงต้องเพิ่มไฟล์ใน `database/migrations/` (ตั้งชื่อเรียงเลข `002_...sql`)
ให้รันซ้ำได้และไม่ลบข้อมูล แล้วแก้ `init.sql` ให้ตรงกันด้วย ; workflow deploy รันทุกไฟล์ในโฟลเดอร์นี้ก่อนสตาร์ท backend ใหม่ทุกครั้ง

## ตัวแปรสภาพแวดล้อม (`.env`)
| ตัวแปร | ความหมาย |
|---|---|
| `MYSQL_ROOT_PASSWORD`, `MYSQL_USER`, `MYSQL_PASSWORD` | รหัสผ่าน root และ user ที่ backend ใช้ (สิทธิ์เฉพาะฐาน `onlyfood`) |
| `JWT_SECRET` | บังคับ ≥ 32 ตัวอักษร ไม่ตั้ง = backend ไม่ยอมสตาร์ท |
| `GOOGLE_CLIENT_ID` | เปิด Google Login (ตั้ง `VITE_GOOGLE_CLIENT_ID` ใน `frontend/.env` (คัดลอกจาก `frontend/.env.example`, ไม่ขึ้น git) เป็นค่าเดียวกันแล้ว build ใหม่) |
| `CORS_ORIGINS` | ปกติว่าง; ใส่เฉพาะตอนพัฒนาด้วย vite dev |
| `DISABLE_DOCS` | `1` = ปิด `/api/docs` |
| `NGINX_CONF` | ไฟล์ nginx ที่ใช้ |

## การทำงานของ backend (สรุปที่ต่างจากของเดิม)
- **ลูกค้าไม่มารับอาหาร**: ครัวกด "ปรุงเสร็จแล้ว" -> ออเดอร์เป็น READY และลูกค้าได้แจ้งเตือนอัตโนมัติ (ไม่มีปุ่มเรียกคิวแล้ว) ; ครบ 30 นาที backend (`jobs.py` วนเช็คทุก 30 วิ) ส่งแจ้งเตือนซ้ำให้ 1 ครั้ง (บันทึกใน `Order.PickupReminderAt` ไม่ส่งซ้ำแม้รีสตาร์ท/หลาย worker) และหน้าร้านขึ้นป้ายให้โทรหาลูกค้าพร้อมเบอร์ ; ครบ 60 นาทีปุ่ม "ลูกค้าไม่มารับ" ถึงกดได้ (หน้าร้านอ่านทั้งสองค่าจาก `/api/food-court/status`) และ **พนักงานกดเองเสมอ ระบบไม่ตัดอัตโนมัติ** (ลูกค้าอาจแจ้งว่าจะมาช้า) ; ตัดแล้วไม่คืนเงิน ; ปรับเวลาด้วย env `PICKUP_REMINDER_MINUTES`, `NO_SHOW_AFTER_MINUTES` ; ปิดงานเบื้องหลังด้วย `DISABLE_BACKGROUND_JOBS=1` ; ลูกค้า walk-in ไม่มีบัญชีจึงไม่ได้รับแจ้งเตือน (ป้ายหน้าร้านบอกให้เรียกด้วยเสียง) ; การแจ้งเตือนเป็นในหน้าเว็บ (ไม่มี push) จึงต้องมีป้ายให้โทรเป็นทางสำรอง
- **ลูกค้าแจ้งร้านว่าจะมารับช้า**: `PUT /api/orders/{id}/late-pickup` body `{"minutes": 15|30|60|120}` (ลูกค้าเจ้าของออเดอร์, ตั้งแต่ร้านรับออเดอร์จนอาหารพร้อมรับ, แจ้งได้ไม่เกิน 3 ครั้ง ยึดครั้งล่าสุด ; เวลามาถึง = เวลานัดรับหรือตอนกด แล้วแต่อันไหนช้ากว่า + N นาที) -> `Order.LatePickupArrivalTime/LatePickupMinutes/LatePickupCount` ; ตอบกลับ `arrival_time`, `count`, `minutes`, `remaining` ; ระบบไม่ส่งเตือน 30 นาที, หน้าร้านขึ้นป้ายฟ้า "ลูกค้าแจ้งจะมาถึง HH:MM", ปุ่ม "ลูกค้าไม่มารับ" กดไม่ได้จนเลยเวลานั้น (backend บังคับด้วย)
- **Auth**: รหัสผ่าน bcrypt, login ได้ JWT 12 ชม. (`Authorization: Bearer`), ทุก request อ่านบทบาท/สถานะบัญชีจาก DB ใหม่, ผิด 5 ครั้งล็อก 15 นาที, ตัวตนผู้กระทำ (audit/log) มาจาก token ไม่ใช่ body
- **สิทธิ์**: ลูกค้าเห็นเฉพาะออเดอร์ตัวเอง; เจ้าของ/พนักงานเห็นเฉพาะร้านตัวเอง; endpoint ผู้บริหารเฉพาะ `EXECUTIVE`; `/api/stores`, `/api/products`, `/api/food-court/status`, รีวิวร้าน เปิดสาธารณะ
- **ลืมรหัสผ่าน**: `POST /api/reset-password` เดิมถูกปิด (ใครก็รีเซ็ตของใครได้) → ผู้ใช้เปลี่ยนเองที่ `POST /api/users/change-password`, ผู้บริหารรีเซ็ตให้ที่ `PUT /api/executive/users/{id}/reset-password`
- **Order**: state machine อยู่ที่ `state.py` ที่เดียว, เปลี่ยนสถานะภายใต้ `SELECT … FOR UPDATE` + บันทึก `OrderStatusLog` ใน transaction เดียวกัน, เลขคิว = MAX+1 ต่อ (ร้าน, วัน) พร้อม retry เมื่อชน, ราคาอ่านจาก DB เสมอ
- **เงิน** (จำลอง ไม่ได้ต่อธนาคารจริง): ทุกออเดอร์ออนไลน์มีแถว `Payment` (สลิปถูกปฏิเสธเก็บไว้ทุกใบ), ยกเลิกหลังจ่ายสร้าง `Refund` สถานะ `PENDING` ("รอลูกค้ามารับ") อัตโนมัติ (คืนทั้งค่าอาหารและส่วนต่างที่โอนเพิ่ม) และแจ้งลูกค้าให้มารับเงินคืนที่ร้านโดยแจ้งเลขคิว ; **ลูกค้ารับเงินคืนที่หน้าร้าน**: พนักงานหน้าร้าน/เจ้าของร้านกด "คืนเงินแล้ว" (`PUT /api/refunds/{id}/done` เฉพาะร้านตัวเอง) -> `DONE` บันทึกผู้คืน/เวลา + `AuditLog` `REFUND_DONE` แล้วแจ้งลูกค้า (และเจ้าของร้าน) ; `GET /api/refunds`: หน้าร้าน/เจ้าของเห็นร้านตัวเอง, ลูกค้าเห็นของตัวเอง, ฝ่ายบัญชี/ผู้บริหารเห็นทุกร้าน (ดูอย่างเดียว ส่งออก CSV ได้) ; หน้าจอคืนเงินใช้ `RefundLog.jsx` ร่วมกันทุกบทบาท
- **เปลี่ยนเมนูตอนของหมด**: ถูกลง -> `Refund` แบบ `PRICE_DIFF` ; แพงขึ้น -> ออเดอร์เป็น `AWAITING_TOP_UP` (รอโอนส่วนต่าง) ลูกค้าแนบสลิปที่ `PUT /api/orders/{id}/top-up-slip`, หน้าร้านตรวจด้วยปุ่มเดิม (`verify-slip`) ผ่านแล้วถึงเข้าครัว ไม่ผ่านแนบใหม่ได้ ; ระหว่างรอตรวจสลิปส่วนต่างยกเลิกไม่ได้ (กันคืนเงินผิดยอด)
- **ยอดขาย**: `gross_sales` = เงินที่รับจริง, `net_sales` = gross - เงินคืนทั้งที่คืนแล้วและที่รอลูกค้ามารับ (เงินคืนไม่นับเป็นรายได้ตั้งแต่ตอนสร้างรายการ, `v_order_net` migration 006) (ไม่มีค่าเช่า)
- **ของหมดแล้วลูกค้าไม่ตอบ**: ร้านแจ้งของหมด -> `PENDING_CANCELLATION` พร้อม `CancelDeadline` (30 นาที) ; เลยเวลาแล้ว `jobs.py` ยกเลิกให้อัตโนมัติ (ผู้กระทำ `SYSTEM`) สร้างรายการคืนเงินและแจ้งลูกค้าให้มารับเงินที่ร้าน — ทำงานแม้ลูกค้าปิดแอป (หน้าเว็บลูกค้าแค่นับถอยหลัง)
- **เลขคิว**: แยกตามร้าน รีเซ็ตทุกวัน แสดงเป็นตัวอักษรประจำร้าน + 3 หลัก (`Store.QueueCode`: A001, B001) ผู้บริหารเลือกตัวอักษรตอนสร้างร้านหรือให้ระบบเลือกตัวที่ว่าง
- **Audit**: login สำเร็จ/ล้มเหลว และทุกการเปลี่ยนแปลงสำคัญอยู่ใน `AuditLog` ; `AuditLog` กับ `OrderStatusLog` มี trigger ห้าม UPDATE/DELETE
- **รูปภาพ**: frontend ส่ง base64 → backend ตรวจชนิด/ขนาด (≤5 MB) แล้วเก็บไฟล์ใน volume `uploads`, DB เก็บเฉพาะ path (`/uploads/...`)
- **ไม่มีข้อมูลบัตรเครดิต/แต้ม** ใน ER ใหม่: การชำระด้วยบัตรถูกปฏิเสธ (รองรับ PromptPay / TrueMoney→`MOBILE_BANKING`), `Cards` ในโปรไฟล์คืนค่าว่าง
- **ชื่อฟิลด์เก่ายังอยู่** (`OrderID`, `Status`='Pending'/'Ready'…, `Role`='Shop Owner'…, `QueueNo`='A007', `img`, `LogID`…) เพื่อให้ frontend เดิมอ่านได้ พร้อมฟิลด์ใหม่ (`StatusCode`, `RoleCode`)
- **สถานะ legacy**: frontend เดิมส่ง `Ready` ครั้งเดียวจากครัว → backend เดิน `COOKING→COOKED→READY` และ log ทุกขั้น; `Cancelled` จากหน้าร้านขณะ PENDING/COOKING → `PENDING_CANCELLATION→CANCELLED` (ชื่อสถานะแบบใหม่ เช่น `COOKED` ใช้ตาม state machine เป๊ะ)

## สิ่งที่แก้ใน frontend (เฉพาะที่จำเป็น)
1. `src/authFetch.js` (ใหม่) + import ใน `main.jsx` — แนบ `Authorization: Bearer` ให้ทุก request ไป `/api` โดยไม่ต้องแก้ fetch ทีละจุด
2. `App.jsx`: `API_BASE` จากค่าตายตัว `http://only-foods.cskmitl.com` → `VITE_API_URL || window.location.origin`
3. `App.jsx`: ส่ง `id_token` ของ Google ไปให้ server ตรวจ; `GOOGLE_CLIENT_ID` อ่านจาก `VITE_GOOGLE_CLIENT_ID`
4. `frontend/.env`: ล้างค่า `onrender.com` เดิม และไม่เก็บใน git แล้ว (ใช้ `frontend/.env.example` เป็นตัวอย่าง ใส่ได้เฉพาะ `VITE_*`)

ที่ยังไม่ได้แก้ (ตั้งใจ): token อยู่ในหน่วยความจำ — refresh หน้าแล้วต้อง login ใหม่ (เหมือนเดิม), ปุ่ม Undo ของครัว (Ready→Pending) ถูก state machine ปฏิเสธ, ตัวเลือก "บัตรเครดิต" ในหน้าสั่งอาหารจะได้ข้อความปฏิเสธจาก backend, ปุ่ม "ลืมรหัสผ่าน" แสดงข้อความให้ติดต่อเจ้าหน้าที่ศูนย์อาหาร (ไม่มีฟอร์มรีเซ็ตเอง), polling ทุก 2–5 วินาทีเหมือนเดิม

## ทดสอบ
```bash
cd backend && pip install -r requirements-dev.txt && pytest
```
เทสต์ครอบ state machine ทุกคู่สถานะ, สิทธิ์ตามบทบาท, เลขคิว/retry, การตรวจรูป, เวลาเปิด-ปิดศูนย์อาหาร, สัญญา (ไม่ต้องใช้ MySQL)
