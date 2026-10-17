"""State machine ของออเดอร์ : ทุกคู่สถานะเก่า->ใหม่ + สิทธิ์ของแต่ละบทบาท"""
from datetime import datetime, timedelta
from itertools import product

import pytest

import state
from errors import DomainError

ALL = sorted(state.ALL_STATUSES)

ALLOWED = {
    ("VERIFYING_SLIP", "PENDING"), ("VERIFYING_SLIP", "CANCELLED"),
    ("PENDING", "COOKING"), ("PENDING", "PENDING_CANCELLATION"),
    ("COOKING", "COOKED"), ("COOKING", "PENDING_CANCELLATION"),
    ("COOKED", "READY"),
    ("READY", "COMPLETED"), ("READY", "NO_SHOW"),
    ("PENDING_CANCELLATION", "PENDING"), ("PENDING_CANCELLATION", "CANCELLED"),
    ("PENDING_CANCELLATION", "AWAITING_TOP_UP"),
    ("AWAITING_TOP_UP", "PENDING"), ("AWAITING_TOP_UP", "CANCELLED"),
}


@pytest.mark.parametrize("old,new", list(product(ALL, ALL)))
def test_every_pair(old, new):
    if (old, new) in ALLOWED:
        state.assert_transition(old, new)
    else:
        with pytest.raises(DomainError) as e:
            state.assert_transition(old, new)
        assert e.value.status_code == 400


def test_terminal_states_have_no_exit():
    for t in ("COMPLETED", "CANCELLED", "NO_SHOW"):
        assert state.TRANSITIONS[t] == set()


def test_kitchen_can_only_cook():
    state.assert_role_can_set("KITCHEN_STAFF", "COOKING")
    state.assert_role_can_set("KITCHEN_STAFF", "COOKED")
    for s in ("READY", "COMPLETED", "CANCELLED", "NO_SHOW", "PENDING"):
        with pytest.raises(DomainError) as e:
            state.assert_role_can_set("KITCHEN_STAFF", s)
        assert e.value.status_code == 403


def test_front_staff_cannot_cook():
    with pytest.raises(DomainError):
        state.assert_role_can_set("FRONT_STAFF", "COOKING")
    state.assert_role_can_set("FRONT_STAFF", "READY")


def test_owner_has_all_staff_powers():
    for s in ("COOKING", "COOKED", "READY", "COMPLETED", "NO_SHOW", "CANCELLED", "PENDING"):
        state.assert_role_can_set("STORE_OWNER", s)


@pytest.mark.parametrize("role", ["CUSTOMER", "ACCOUNTANT", "EXECUTIVE", "NOBODY"])
def test_other_roles_cannot_use_status_endpoint(role):
    for s in ("COOKING", "READY", "COMPLETED"):
        with pytest.raises(DomainError):
            state.assert_role_can_set(role, s)


# ---- plan_status_change -------------------------------------------------
def test_plain_new_code_is_one_step():
    assert state.plan_status_change("PENDING", "COOKING", "KITCHEN_STAFF") == ["COOKING"]
    assert state.plan_status_change("READY", "COMPLETED", "FRONT_STAFF") == ["COMPLETED"]


def test_same_status_is_noop():
    assert state.plan_status_change("COOKING", "COOKING", "KITCHEN_STAFF") == []
    assert state.plan_status_change("COOKING", "Cooking", "KITCHEN_STAFF") == []


def test_cannot_skip_steps_with_new_codes():
    with pytest.raises(DomainError):
        state.plan_status_change("PENDING", "READY", "FRONT_STAFF")
    with pytest.raises(DomainError):
        state.plan_status_change("PENDING", "COMPLETED", "FRONT_STAFF")


def test_terminal_cannot_change():
    for cur in ("COMPLETED", "CANCELLED", "NO_SHOW"):
        with pytest.raises(DomainError) as e:
            state.plan_status_change(cur, "PENDING", "STORE_OWNER")
        assert "จบแล้ว" in e.value.detail


def test_legacy_ready_walks_the_chain():
    assert state.plan_status_change("PENDING", "Ready", "KITCHEN_STAFF") == ["COOKING", "COOKED", "READY"]
    assert state.plan_status_change("COOKING", "Ready", "KITCHEN_STAFF") == ["COOKED", "READY"]
    assert state.plan_status_change("COOKED", "Ready", "FRONT_STAFF") == ["READY"]


def test_legacy_ready_from_other_states_rejected():
    for cur in ("VERIFYING_SLIP", "PENDING_CANCELLATION"):
        with pytest.raises(DomainError):
            state.plan_status_change(cur, "Ready", "KITCHEN_STAFF")


def test_legacy_ready_denied_for_customer():
    with pytest.raises(DomainError) as e:
        state.plan_status_change("PENDING", "Ready", "CUSTOMER")
    assert e.value.status_code == 403


def test_legacy_cancel_chain_for_front_staff_only():
    assert state.plan_status_change("PENDING", "Cancelled", "FRONT_STAFF") == ["PENDING_CANCELLATION", "CANCELLED"]
    assert state.plan_status_change("PENDING_CANCELLATION", "Cancelled", "FRONT_STAFF") == ["CANCELLED"]
    with pytest.raises(DomainError) as e:
        state.plan_status_change("PENDING", "Cancelled", "KITCHEN_STAFF")
    assert e.value.status_code == 403


def test_no_cancel_after_cooked():
    for cur in ("COOKED", "READY"):
        with pytest.raises(DomainError):
            state.plan_status_change(cur, "Cancelled", "STORE_OWNER")


def test_unknown_status_rejected():
    with pytest.raises(DomainError):
        state.plan_status_change("PENDING", "FLYING", "STORE_OWNER")
    with pytest.raises(DomainError):
        state.plan_status_change("PENDING", "", "STORE_OWNER")


def test_no_show_needs_30_minutes():
    now = datetime(2026, 1, 1, 12, 0, 0)
    with pytest.raises(DomainError):
        state.assert_no_show_allowed(None, now)
    with pytest.raises(DomainError):
        state.assert_no_show_allowed(now - timedelta(minutes=29, seconds=59), now)
    state.assert_no_show_allowed(now - timedelta(minutes=30), now)


def test_no_show_waits_for_customer_eta():
    """ลูกค้าแจ้งว่าจะมาช้า: ครบ 30 นาทีแล้วก็ยังตัดคิวไม่ได้จนเลยเวลาที่แจ้ง"""
    now = datetime(2026, 1, 1, 12, 0, 0)
    ready = now - timedelta(minutes=45)
    with pytest.raises(DomainError) as e:
        state.assert_no_show_allowed(ready, now, 30, customer_eta=now + timedelta(minutes=1))
    assert "12:01" in e.value.detail
    state.assert_no_show_allowed(ready, now, 30, customer_eta=now)                       # ถึงเวลาที่แจ้งพอดี
    state.assert_no_show_allowed(ready, now, 30, customer_eta=now - timedelta(minutes=5))
    with pytest.raises(DomainError):  # เลยเวลาที่แจ้งแล้ว แต่ยังไม่ครบ 30 นาทีหลังอาหารพร้อม
        state.assert_no_show_allowed(now - timedelta(minutes=10), now, 30, customer_eta=now - timedelta(minutes=5))


def test_reminder_comes_before_no_show_unlock():
    """ลูกค้าต้องได้รับเตือนก่อนที่พนักงานจะตัดคิวได้ (ไม่งั้นไม่มีเวลาตอบสนอง)"""
    import config
    assert config.PICKUP_REMINDER_MINUTES < config.NO_SHOW_AFTER_MINUTES
    assert (config.PICKUP_REMINDER_MINUTES, config.NO_SHOW_AFTER_MINUTES) == (30, 60)


def test_legacy_names_round_trip():
    for legacy, code in state.LEGACY_TO_CODE.items():
        assert state.legacy_status(code) == legacy
    assert state.legacy_status("COOKED") == "Ready"  # ปรุงเสร็จ = Ready ในสายตา frontend เดิม


def test_role_names():
    assert state.role_code_from_input("Shop Owner") == "STORE_OWNER"
    assert state.role_code_from_input("KITCHEN_STAFF") == "KITCHEN_STAFF"
    with pytest.raises(DomainError):
        state.role_code_from_input("Admin")


def test_late_pickup_latest_notice_replaces_previous():
    """นัด 12:00: กด 15 -> 12:15 แล้วกด 30 -> 12:30 (แทนเวลาเดิม ไม่ใช่ 12:45)"""
    pickup = datetime(2026, 1, 1, 12, 0)
    now = datetime(2026, 1, 1, 11, 30)
    assert state.late_pickup_arrival(now, pickup, 15) == datetime(2026, 1, 1, 12, 15)
    assert state.late_pickup_arrival(now + timedelta(minutes=5), pickup, 30) == datetime(2026, 1, 1, 12, 30)


def test_late_pickup_after_pickup_time_counts_from_now():
    pickup = datetime(2026, 1, 1, 12, 0)
    now = datetime(2026, 1, 1, 12, 20, 0, 500)
    assert state.late_pickup_arrival(now, pickup, 15) == datetime(2026, 1, 1, 12, 35)
    assert state.late_pickup_arrival(now, None, 30) == datetime(2026, 1, 1, 12, 50)  # รับทันที (ไม่ได้นัดเวลา)
