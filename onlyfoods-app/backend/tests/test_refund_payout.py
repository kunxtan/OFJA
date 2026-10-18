"""คืนเงินแบบโอน : ตรวจข้อมูลบัญชี, ปิดบางส่วน, โอนได้เฉพาะเจ้าของร้านและต้องแนบสลิป (ไม่ต้องมี MySQL)"""
import pytest

from errors import DomainError
from routers.payments import mark_refund_done
from schemas import RefundDoneSchema
from utils import mask_account, validate_payout


def test_promptpay_phone_or_national_id():
    assert validate_payout("PROMPTPAY", None, "081-234-5678", None)["account_no"] == "0812345678"
    assert validate_payout("promptpay", None, "1234567890123", "สมชาย")["account_no"] == "1234567890123"
    for bad in ("", "12345", "1234567890", "08123456789", "081234567", "abc"):
        with pytest.raises(DomainError):
            validate_payout("PROMPTPAY", None, bad, None)


def test_bank_needs_bank_account_and_name():
    ok = validate_payout("BANK", "กสิกรไทย", "123-4-56789-0", "สมชาย ใจดี")
    assert ok["account_no"] == "1234567890" and ok["bank"] == "กสิกรไทย"
    for args in ((None, "1234567890", "ก"), ("ธนาคาร", "123", "ก"), ("ธนาคาร", "1234567890", ""), ("ธนาคาร", "12345678901234567", "ก")):
        with pytest.raises(DomainError):
            validate_payout("BANK", *args)
    with pytest.raises(DomainError):
        validate_payout(None, None, "0812345678", None)


def test_mask_account_keeps_last_four():
    assert mask_account("1234567890") == "xxxxxx7890"
    assert mask_account("0812") == "0812"
    assert mask_account(None) is None


def test_only_owner_can_transfer_and_slip_is_required():
    staff = {"RoleCode": "FRONT_STAFF", "UserId": 1, "StoreId": 1}
    owner = {"RoleCode": "STORE_OWNER", "UserId": 2, "StoreId": 1}
    with pytest.raises(DomainError) as e:
        mark_refund_done(1, RefundDoneSchema(method="TRANSFER", slip_image="x"), user=staff, db=None)
    assert e.value.status_code == 403
    with pytest.raises(DomainError) as e:
        mark_refund_done(1, RefundDoneSchema(method="TRANSFER"), user=owner, db=None)
    assert e.value.status_code == 400 and "สลิป" in e.value.detail


def test_price_diff_is_split_across_payments(monkeypatch):
    """ค่าอาหาร 50 + โอนส่วนต่าง 50 แล้วเปลี่ยนเป็นจาน 10 บาท : ส่วนต่าง 90 ต้องคืนครบ (ใบละไม่พอ -> แบ่งคืนสองใบ)"""
    from decimal import Decimal
    import services
    pays = [{"PaymentId": 1, "Amount": Decimal("50")}, {"PaymentId": 2, "Amount": Decimal("50")}]
    made = []
    monkeypatch.setattr(services, "verified_payments", lambda cur, oid, lock=False: pays)
    monkeypatch.setattr(services, "refunded_total", lambda cur, pid: Decimal("0"))
    monkeypatch.setattr(services, "create_refund", lambda cur, pid, kind, amt, reason, item: made.append((pid, amt)))
    assert services.refund_price_diff(None, 1, Decimal("90"), "x", 7) == Decimal("90")
    assert made == [(1, Decimal("50")), (2, Decimal("40"))]
    made.clear()
    monkeypatch.setattr(services, "verified_payments", lambda cur, oid, lock=False: [])
    assert services.refund_price_diff(None, 1, Decimal("20"), "x", 7) == Decimal("0") and made == []
