"""งานเบื้องหลัง: เตือนลูกค้าที่ยังไม่มารับอาหาร

อาหารพร้อมรับ (READY) แล้วลูกค้ายังไม่มาเกิน PICKUP_REMINDER_MINUTES -> ส่งแจ้งเตือนให้ 1 ครั้ง
(ปุ่ม "ลูกค้าไม่มารับ" ปลดล็อกทีหลังที่ NO_SHOW_AFTER_MINUTES และพนักงานกดเองเสมอ ;
 ลูกค้าที่แจ้งร้านแล้วว่าจะมาช้า (LatePickupArrivalTime) ไม่ถูกเตือน)

ปลอดภัยเมื่อรันหลาย worker / รีสตาร์ท: ใช้ UPDATE ... WHERE PickupReminderAt IS NULL เป็นตัวจอง
ใครจองได้ (rowcount = 1) คนนั้นเท่านั้นที่ส่งแจ้งเตือน
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

import config
from db import _get_pool
from services import log_audit, purge_expired_stores, send_notif
from utils import bangkok_now, queue_label

logger = logging.getLogger("onlyfood")


def reminder_text(queue: str, waited_minutes: int) -> str:
    return (f"อาหารคิว {queue} พร้อมรับมาแล้ว {waited_minutes} นาที กรุณามารับที่ร้าน "
            f"หากมารับช้าให้แจ้งร้านก่อน")


def send_pickup_reminders(db, now: Optional[datetime] = None) -> int:
    """ส่งแจ้งเตือนให้ทุกออเดอร์ที่ถึงเวลา คืนจำนวนที่ส่ง (1 ออเดอร์ = 1 transaction)"""
    now = now or bangkok_now()
    due_before = now - timedelta(minutes=config.PICKUP_REMINDER_MINUTES)
    # ไม่เตือนออเดอร์ READY ที่ค้างมานานมาก (เช่นค้างจากเมื่อวาน/ตอน deploy) เพื่อไม่ให้ส่งรัวตอนสตาร์ท
    oldest = now - timedelta(hours=config.PICKUP_REMINDER_MAX_AGE_HOURS)
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT o.OrderId, o.CustomerId, o.QueueNo, o.ReadyAt, s.QueueCode, o.StoreId
            FROM `Order` o
            JOIN OrderStatus os ON os.StatusId = o.StatusId
            JOIN Store s ON s.StoreId = o.StoreId
            WHERE os.StatusCode = 'READY' AND o.CustomerId IS NOT NULL AND o.PickupReminderAt IS NULL
              AND o.LatePickupArrivalTime IS NULL  -- ลูกค้าแจ้งแล้วว่าจะมาช้า: ไม่ต้องเตือน
              AND o.ReadyAt <= %s AND o.ReadyAt >= %s
            ORDER BY o.ReadyAt
            LIMIT 200
            """,
            (due_before, oldest),
        )
        due = cur.fetchall()
    db.rollback()  # จบ read: ไม่ค้าง transaction

    sent = 0
    for o in due:
        try:
            with db.cursor() as cur:
                # จองก่อน: ถ้าสถานะเปลี่ยนไปแล้ว (รับของ/ตัดคิว) หรือ worker อื่นจองไปแล้ว rowcount = 0
                cur.execute(
                    """
                    UPDATE `Order` SET PickupReminderAt = %s
                    WHERE OrderId = %s AND PickupReminderAt IS NULL AND LatePickupArrivalTime IS NULL
                      AND StatusId = (SELECT StatusId FROM OrderStatus WHERE StatusCode = 'READY')
                    """,
                    (now, o["OrderId"]),
                )
                if cur.rowcount != 1:
                    db.rollback()
                    continue
            q = queue_label(o["QueueNo"], o["QueueCode"])
            waited = int((now - o["ReadyAt"]).total_seconds() // 60)
            send_notif(db, o["CustomerId"], "QUEUE_CALLED", f"คิว {q} ยังไม่ได้รับอาหาร",
                       reminder_text(q, waited), o["OrderId"])
            log_audit(db, None, "PICKUP_REMINDER", "Order", o["OrderId"], None,
                      {"queue": q, "store_id": o["StoreId"], "waited_minutes": waited})
            db.commit()
            sent += 1
        except Exception:  # noqa: BLE001 - ออเดอร์หนึ่งพัง ไม่ให้กระทบออเดอร์อื่น
            db.rollback()
            logger.exception("pickup reminder failed order=%s", o["OrderId"])
    return sent


def _run_once() -> int:
    conn = _get_pool().connection()
    try:
        return send_pickup_reminders(conn)
    finally:
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        conn.close()

_last_purge_at: Optional[datetime] = None


def _purge_if_due() -> int:
    """ร้านหมดสัญญาเกิน CONTRACT_PURGE_AFTER_DAYS วันโดยไม่ถูกเปิดสัญญาใหม่ -> ลบอัตโนมัติ (เช็คชั่วโมงละครั้ง)"""
    global _last_purge_at
    now = bangkok_now()
    if _last_purge_at is not None and now - _last_purge_at < timedelta(hours=1):
        return 0
    _last_purge_at = now
    conn = _get_pool().connection()
    try:
        purged = purge_expired_stores(conn, config.CONTRACT_PURGE_AFTER_DAYS)
        conn.commit()
        return purged
    except Exception:  # noqa: BLE001
        conn.rollback()
        raise
    finally:
        conn.close()



async def reminder_loop() -> None:
    """เช็คทุก REMINDER_LOOP_SECONDS วินาที ; error ใดๆ ไม่ทำให้ลูปตาย"""
    logger.info("pickup reminder loop started (every %ss)", config.REMINDER_LOOP_SECONDS)
    while True:
        try:
            sent = await asyncio.to_thread(_run_once)
            if sent:
                logger.info("pickup reminders sent: %s", sent)
            purged = await asyncio.to_thread(_purge_if_due)
            if purged:
                logger.info("expired stores auto-deleted: %s", purged)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("pickup reminder loop error")
        await asyncio.sleep(config.REMINDER_LOOP_SECONDS)
