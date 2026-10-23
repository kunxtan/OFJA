"""สถานะร้าน เปิด / หยุดรับชั่วคราว / ปิด ที่คำนวณจากเวลา (utils.store_open_state)"""
from datetime import datetime, timedelta

import utils
from shapes import shape_store

FC = {"OpenTime": timedelta(hours=7), "CloseTime": timedelta(hours=18), "ManualOverride": None, "OverrideUntil": None}
AUTO = {"OpenTime": None, "CloseTime": None, "ManualOverride": None, "OverrideUntil": None, "PausedUntil": None}


def at(h, m=0, day=1):
    return datetime(2026, 1, day, h, m)


def test_store_follows_food_court_hours_by_default():
    assert utils.store_hours(AUTO, FC) == (7 * 60, 18 * 60)
    assert utils.store_open_state(AUTO, FC, at(7)) == utils.STORE_OPEN
    assert utils.store_open_state(AUTO, FC, at(17, 59)) == utils.STORE_OPEN
    assert utils.store_open_state(AUTO, FC, at(18)) == utils.STORE_CLOSED
    assert utils.store_open_state(AUTO, FC, at(6, 59)) == utils.STORE_CLOSED


def test_own_hours_are_clipped_to_food_court_hours():
    own = dict(AUTO, OpenTime=timedelta(hours=9), CloseTime=timedelta(hours=15))
    assert utils.store_hours(own, FC) == (9 * 60, 15 * 60)
    assert utils.store_open_state(own, FC, at(8, 59)) == utils.STORE_CLOSED
    assert utils.store_open_state(own, FC, at(9)) == utils.STORE_OPEN
    assert utils.store_open_state(own, FC, at(15)) == utils.STORE_CLOSED
    # ผู้บริหารย่นเวลาศูนย์อาหารทีหลัง : เวลาร้านถูกตัดตาม
    short_fc = dict(FC, OpenTime=timedelta(hours=10), CloseTime=timedelta(hours=14))
    assert utils.store_hours(own, short_fc) == (10 * 60, 14 * 60)
    # ไม่เหลือช่วงที่ร้านเปิดตามเวลา = ปิดทั้งวัน (ยังกดเปิดเองได้)
    late = dict(AUTO, OpenTime=timedelta(hours=19), CloseTime=timedelta(hours=20))
    assert utils.store_open_state(late, FC, at(12)) == utils.STORE_CLOSED


def test_food_court_closed_closes_every_store():
    forced_open = dict(AUTO, ManualOverride=1, OverrideUntil=at(17))
    closed_fc = dict(FC, ManualOverride=0, OverrideUntil=None)
    assert utils.store_open_state(forced_open, closed_fc, at(12)) == utils.STORE_CLOSED
    assert utils.store_open_state(AUTO, closed_fc, at(12)) == utils.STORE_CLOSED


def test_manual_override_lasts_until_next_transition():
    own = dict(AUTO, OpenTime=timedelta(hours=9), CloseTime=timedelta(hours=15))
    # กดปิดตอน 10:00 -> ปิดถึง 15:00 (เวลาปิดตามปกติ) แล้วกลับไปตามเวลา
    until = utils.store_next_transition(own, FC, at(10))
    assert until == at(15)
    closed = dict(own, ManualOverride=0, OverrideUntil=until)
    assert utils.store_open_state(closed, FC, at(14, 59)) == utils.STORE_CLOSED
    assert utils.store_open_state(closed, FC, at(9, 0, day=2)) == utils.STORE_OPEN
    # กดเปิดหลังเวลาร้าน (16:00) -> เปิดได้ถึงเวลาปิดศูนย์อาหาร ไม่ลากไปถึงเช้าวันถัดไป
    until = utils.store_next_transition(own, FC, at(16))
    assert until == at(18)
    opened = dict(own, ManualOverride=1, OverrideUntil=until)
    assert utils.store_open_state(opened, FC, at(17)) == utils.STORE_OPEN
    assert utils.store_open_state(opened, FC, at(7, 30, day=2)) == utils.STORE_CLOSED  # ยังไม่ถึง 09:00 ของร้าน
    # NULL = ปิดจนกว่าจะกดเปิดเอง (ระงับสิทธิ์ / เริ่มสัญญารอบใหม่)
    held = dict(AUTO, ManualOverride=0, OverrideUntil=None)
    assert utils.store_open_state(held, FC, at(12, day=5)) == utils.STORE_CLOSED


def test_pause_only_while_open_and_until_set_time():
    paused = dict(AUTO, PausedUntil=at(18))
    assert utils.store_open_state(paused, FC, at(12)) == utils.STORE_PAUSED
    assert utils.store_open_state(paused, FC, at(18)) == utils.STORE_CLOSED      # ร้านปิดตามเวลา = ปิด ไม่ใช่หยุดชั่วคราว
    assert utils.store_open_state(paused, FC, at(12, day=2)) == utils.STORE_OPEN  # ไม่ค้างข้ามวัน


def test_shape_store_open_fields():
    base = dict(AUTO, ContractStartDate=datetime(2026, 1, 1).date(), ContractEndDate=datetime(2026, 12, 31).date())
    paused = shape_store(dict(base, PausedUntil=at(18)), FC, at(12))
    assert paused["OpenState"] == "PAUSED" and paused["IsOpen"] is False
    assert paused["PausedUntil"] == "2026-01-01 18:00:00"
    manual = shape_store(dict(base, ManualOverride=0, OverrideUntil=at(18)), FC, at(12))
    assert manual["OpenMode"] == "CLOSED" and manual["OverrideUntil"] == "2026-01-01 18:00:00"
    assert manual["PausedUntil"] is None and "ManualOverride" not in manual
    own = shape_store(dict(base, OpenTime=timedelta(hours=9), CloseTime=timedelta(hours=15)), FC, at(12))
    assert (own["OpenTime"], own["CloseTime"], own["HasOwnHours"]) == ("09:00", "15:00", True)
