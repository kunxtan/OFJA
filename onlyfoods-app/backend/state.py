"""State machine ของออเดอร์ + ตารางแปลงชื่อเก่า/ใหม่ (pure Python ไม่แตะ DB)

กฎอยู่ที่นี่ที่เดียว ทุก endpoint ที่เปลี่ยนสถานะต้องผ่าน plan_status_change / assert_transition
"""
from datetime import datetime, timedelta
from typing import List, Optional

from errors import DomainError

VERIFYING_SLIP = "VERIFYING_SLIP"
PENDING = "PENDING"
COOKING = "COOKING"
COOKED = "COOKED"
READY = "READY"
COMPLETED = "COMPLETED"
PENDING_CANCELLATION = "PENDING_CANCELLATION"
CANCELLED = "CANCELLED"
NO_SHOW = "NO_SHOW"

ALL_STATUSES = {
    VERIFYING_SLIP, PENDING, COOKING, COOKED, READY,
    COMPLETED, PENDING_CANCELLATION, CANCELLED, NO_SHOW,
}
TERMINAL = {COMPLETED, CANCELLED, NO_SHOW}

TRANSITIONS = {
    VERIFYING_SLIP: {PENDING, CANCELLED},
    PENDING: {COOKING, PENDING_CANCELLATION},
    COOKING: {COOKED, PENDING_CANCELLATION},
    COOKED: {READY},
    READY: {COMPLETED, NO_SHOW},
    PENDING_CANCELLATION: {PENDING, CANCELLED},
    COMPLETED: set(),
    CANCELLED: set(),
    NO_SHOW: set(),
}

# สถานะที่แต่ละบทบาท "ตั้งให้ออเดอร์ได้" ผ่าน PUT /orders/{id}/status
# (PENDING_CANCELLATION ใช้ผ่าน cancel-request / notify-out-of-stock เท่านั้น)
_FRONT = {PENDING, READY, COMPLETED, NO_SHOW, CANCELLED}
ROLE_CAN_SET = {
    "KITCHEN_STAFF": {COOKING, COOKED},
    "FRONT_STAFF": set(_FRONT),
    "STORE_OWNER": set(_FRONT) | {COOKING, COOKED},
    # ลูกค้าทำได้เฉพาะผ่าน change-item / customer-cancel (ตอนอยู่ PENDING_CANCELLATION)
    "CUSTOMER": {PENDING, CANCELLED},
}

# ---- ชื่อสถานะแบบเก่า (frontend เดิมยังส่ง/อ่านชื่อพวกนี้) ----
LEGACY_TO_CODE = {
    "Verifying_Slip": VERIFYING_SLIP,
    "Pending": PENDING,
    "Cooking": COOKING,
    "Ready": READY,
    "Completed": COMPLETED,
    "Pending_Cancellation": PENDING_CANCELLATION,
    "Cancelled": CANCELLED,
    "NoShow": NO_SHOW,
}
CODE_TO_LEGACY = {
    VERIFYING_SLIP: "Verifying_Slip",
    PENDING: "Pending",
    COOKING: "Cooking",
    COOKED: "Ready",      # อาหารปรุงเสร็จแล้ว = frontend เดิมเรียกว่า Ready
    READY: "Ready",
    COMPLETED: "Completed",
    PENDING_CANCELLATION: "Pending_Cancellation",
    CANCELLED: "Cancelled",
    NO_SHOW: "NoShow",
}

LEGACY_ROLE = {
    "CUSTOMER": "Customer",
    "FRONT_STAFF": "Front Staff",
    "KITCHEN_STAFF": "Kitchen Staff",
    "STORE_OWNER": "Shop Owner",
    "ACCOUNTANT": "Accountant",
    "EXECUTIVE": "Executive",
}
ROLE_FROM_LEGACY = {v: k for k, v in LEGACY_ROLE.items()}
STORE_ROLES = ("STORE_OWNER", "FRONT_STAFF", "KITCHEN_STAFF")


def legacy_status(code: str) -> str:
    return CODE_TO_LEGACY.get(code, code)


def legacy_role(code: str) -> str:
    return LEGACY_ROLE.get(code, code)


def role_code_from_input(value: Optional[str]) -> str:
    """รับได้ทั้ง RoleCode ใหม่ (STORE_OWNER) และชื่อเก่า (Shop Owner)"""
    v = (value or "").strip()
    if v in LEGACY_ROLE:
        return v
    if v in ROLE_FROM_LEGACY:
        return ROLE_FROM_LEGACY[v]
    raise DomainError(400, "ตำแหน่งไม่ถูกต้อง")


def assert_transition(old: str, new: str) -> None:
    if old not in TRANSITIONS:
        raise DomainError(400, f"สถานะปัจจุบันไม่ถูกต้อง: {old}")
    if new not in TRANSITIONS[old]:
        if old in TERMINAL:
            raise DomainError(400, f"ออเดอร์สถานะ {legacy_status(old)} จบแล้ว ไม่สามารถเปลี่ยนสถานะได้")
        raise DomainError(400, f"เปลี่ยนสถานะจาก {legacy_status(old)} เป็น {legacy_status(new)} ไม่ได้")


def assert_role_can_set(role: str, new: str) -> None:
    if new not in ROLE_CAN_SET.get(role, set()):
        raise DomainError(403, "บทบาทของคุณไม่มีสิทธิ์เปลี่ยนเป็นสถานะนี้")


def assert_no_show_allowed(ready_at: Optional[datetime], now: datetime, minutes: int = 15) -> None:
    if ready_at is None or now - ready_at < timedelta(minutes=minutes):
        raise DomainError(400, f"ออเดอร์นี้ยังไม่ถึง {minutes} นาทีหลังเรียกคิว")


# ---- แปลงคำขอเปลี่ยนสถานะ -> ลำดับขั้นที่ต้องเดินจริง ----
_READY_CHAIN_ROLES = {"KITCHEN_STAFF", "FRONT_STAFF", "STORE_OWNER"}
_FORCE_CANCEL_ROLES = {"FRONT_STAFF", "STORE_OWNER"}


def plan_status_change(current: str, requested: str, role: str) -> List[str]:
    """คืนรายการสถานะที่ต้องเดินผ่านตามลำดับ (ตรวจ transition + สิทธิ์ให้แล้ว)

    - ชื่อใหม่ (COOKING, READY, ...) = เดิน 1 ขั้นตรงตาม state machine
    - ชื่อเก่า 'Ready' (frontend เดิมไม่มีขั้น COOKED -> READY แยก):
        PENDING/COOKING/COOKED -> ... -> COOKED -> READY  (ทุกขั้นถูก log)
    - ชื่อเก่า 'Cancelled' จาก PENDING/COOKING โดยพนักงานหน้าร้าน:
        -> PENDING_CANCELLATION -> CANCELLED  (ยกเลิกทันที)
    - สถานะเดิมเท่ากับที่ขอ = ไม่ทำอะไร (คืน [])
    """
    requested = (requested or "").strip()
    if requested in LEGACY_TO_CODE:
        legacy = True
        target = LEGACY_TO_CODE[requested]
    elif requested in ALL_STATUSES:
        legacy = False
        target = requested
    else:
        raise DomainError(400, "สถานะที่ส่งมาไม่ถูกต้อง")

    if current == target:
        return []
    if current in TERMINAL:
        raise DomainError(400, f"ออเดอร์สถานะ {legacy_status(current)} จบแล้ว ไม่สามารถเปลี่ยนสถานะได้")

    if legacy and requested == "Ready":
        if role not in _READY_CHAIN_ROLES:
            raise DomainError(403, "บทบาทของคุณไม่มีสิทธิ์เปลี่ยนเป็นสถานะนี้")
        chain = {
            PENDING: [COOKING, COOKED, READY],
            COOKING: [COOKED, READY],
            COOKED: [READY],
        }.get(current)
        if chain is None:
            raise DomainError(400, f"เปลี่ยนสถานะจาก {legacy_status(current)} เป็น Ready ไม่ได้")
        return chain

    if legacy and requested == "Cancelled" and current in (PENDING, COOKING):
        if role not in _FORCE_CANCEL_ROLES:
            raise DomainError(403, "บทบาทของคุณไม่มีสิทธิ์ยกเลิกออเดอร์")
        return [PENDING_CANCELLATION, CANCELLED]

    assert_transition(current, target)
    assert_role_can_set(role, target)
    return [target]
