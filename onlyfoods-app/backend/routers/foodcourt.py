"""เปิด-ปิดศูนย์อาหาร (สถานะจริง = คำนวณจากเวลาทำการ + manual override ไม่มีคอลัมน์ IsOpen)"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends

import config
from auth import require_role
from db import get_db, transaction
from errors import DomainError
from schemas import FoodCourtScheduleSchema
from services import get_foodcourt, log_audit
from utils import (bangkok_now, foodcourt_is_open, foodcourt_mode, next_transition, time_to_hhmm,
                   time_to_minutes)

router = APIRouter(prefix="/api/food-court", tags=["food-court"])


def _status_payload(row: dict, now=None) -> dict:
    now = now or bangkok_now()
    mode = foodcourt_mode(row, now)
    until = row.get("OverrideUntil")
    return {
        "is_open": foodcourt_is_open(row, now),
        "open_time": time_to_hhmm(row["OpenTime"]),
        "close_time": time_to_hhmm(row["CloseTime"]),
        "mode": mode,
        "override_until": until.strftime("%Y-%m-%d %H:%M:%S") if (until and mode != "AUTO") else None,
        # เวลาที่หน้าร้านใช้: ขึ้นป้ายให้โทรหาลูกค้า / ปลดล็อกปุ่ม "ลูกค้าไม่มารับ" (นาทีหลังอาหารพร้อม)
        "pickup_reminder_minutes": config.PICKUP_REMINDER_MINUTES,
        "no_show_after_minutes": config.NO_SHOW_AFTER_MINUTES,
    }


def _broadcast(cur, title: str, message: str) -> None:
    cur.execute(
        """
        INSERT INTO Notification (UserId, NotificationType, Title, Message)
        SELECT u.UserId, 'SYSTEM', %s, %s FROM `User` u JOIN Role r ON r.RoleId = u.RoleId
        WHERE u.IsActive = TRUE AND r.RoleCode IN ('CUSTOMER', 'STORE_OWNER')
        """,
        (title, message),
    )


@router.get("/status")
def get_food_court_status(db=Depends(get_db)):
    with db.cursor() as cur:
        return _status_payload(get_foodcourt(cur))


@router.put("/toggle")
def toggle_food_court(open: Optional[bool] = None, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    """open=true/false = ตั้งเป็นสถานะนั้น (เป็นอยู่แล้ว = ไม่ทำอะไร) ; ไม่ส่ง = สลับ (client เดิม)"""
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT FoodCourtId, OpenTime, CloseTime, ManualOverride, OverrideUntil FROM FoodCourt ORDER BY FoodCourtId LIMIT 1 FOR UPDATE")
            fc = cur.fetchone()
            if not fc:
                raise DomainError(500, "ยังไม่มีข้อมูลศูนย์อาหารในระบบ")
            now = bangkok_now()
            current = foodcourt_is_open(fc, now)
            if open is not None and bool(open) == current:
                payload = _status_payload(fc, now)
                return {"success": True, "is_open": current, "mode": payload["mode"],
                        "override_until": payload["override_until"], "unchanged": True,
                        "message": "ศูนย์อาหารเปิดอยู่แล้ว" if current else "ศูนย์อาหารปิดอยู่แล้ว"}
            new_open = not current
            until = next_transition(fc["OpenTime"], fc["CloseTime"], now)
            cur.execute(
                "UPDATE FoodCourt SET ManualOverride = %s, OverrideUntil = %s, UpdatedBy = %s, UpdatedAt = %s "
                "WHERE FoodCourtId = %s",
                (new_open, until, user["UserId"], now, fc["FoodCourtId"]),
            )
            _broadcast(cur, "ศูนย์อาหาร",
                       "ศูนย์อาหารเปิดให้บริการแล้ว" if new_open else "ศูนย์อาหารปิดให้บริการแล้ว")
        log_audit(db, user["UserId"], "OPEN_FOOD_COURT" if new_open else "CLOSE_FOOD_COURT", "FoodCourt",
                  fc["FoodCourtId"], None, {"override_until": until})
    return {
        "success": True, "is_open": new_open, "mode": "OPEN" if new_open else "CLOSED",
        "override_until": until.strftime("%Y-%m-%d %H:%M:%S"),
        "message": "เปิดศูนย์อาหารเรียบร้อยแล้ว" if new_open else "ปิดศูนย์อาหารเรียบร้อยแล้ว",
    }


@router.put("/schedule")
def update_food_court_schedule(data: FoodCourtScheduleSchema, user=Depends(require_role("EXECUTIVE")),
                               db=Depends(get_db)):
    try:
        o = datetime.strptime(data.open_time, "%H:%M")
        c = datetime.strptime(data.close_time, "%H:%M")
    except ValueError:
        raise DomainError(400, "รูปแบบเวลาต้องเป็น HH:MM")
    if time_to_minutes(o.time()) >= time_to_minutes(c.time()):
        raise DomainError(400, "เวลาปิดต้องอยู่หลังเวลาเปิด")  # ไม่รองรับช่วงเวลาข้ามวัน
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT FoodCourtId, OpenTime, CloseTime, ManualOverride, OverrideUntil FROM FoodCourt ORDER BY FoodCourtId LIMIT 1 FOR UPDATE")
            fc = cur.fetchone()
            if not fc:
                raise DomainError(500, "ยังไม่มีข้อมูลศูนย์อาหารในระบบ")
            now = bangkok_now()
            until = fc["OverrideUntil"]
            if foodcourt_mode(fc, now) != "AUTO":
                until = next_transition(data.open_time, data.close_time, now)
            cur.execute(
                "UPDATE FoodCourt SET OpenTime = %s, CloseTime = %s, OverrideUntil = %s, UpdatedBy = %s, UpdatedAt = %s "
                "WHERE FoodCourtId = %s",
                (data.open_time, data.close_time, until, user["UserId"], now, fc["FoodCourtId"]),
            )
        log_audit(db, user["UserId"], "UPDATE_FOOD_COURT_SCHEDULE", "FoodCourt", fc["FoodCourtId"],
                  {"open": time_to_hhmm(fc["OpenTime"]), "close": time_to_hhmm(fc["CloseTime"])},
                  {"open": data.open_time, "close": data.close_time})
    with db.cursor() as cur:
        payload = _status_payload(get_foodcourt(cur))
    payload.update({"success": True, "message": "บันทึกเวลาทำการเรียบร้อยแล้ว"})
    return payload


@router.put("/auto")
def return_food_court_to_auto(user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    with transaction(db):
        with db.cursor() as cur:
            fc = get_foodcourt(cur)
            cur.execute(
                "UPDATE FoodCourt SET ManualOverride = NULL, OverrideUntil = NULL, UpdatedBy = %s, UpdatedAt = %s "
                "WHERE FoodCourtId = %s",
                (user["UserId"], bangkok_now(), fc["FoodCourtId"]),
            )
        log_audit(db, user["UserId"], "FOOD_COURT_AUTO_MODE", "FoodCourt", fc["FoodCourtId"])
    with db.cursor() as cur:
        payload = _status_payload(get_foodcourt(cur))
    payload.update({"success": True, "message": "กลับสู่ระบบอัตโนมัติเรียบร้อยแล้ว"})
    return payload
