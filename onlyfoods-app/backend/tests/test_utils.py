import base64
import os
from datetime import date, datetime, timedelta

import pytest

import config
import utils
from errors import DomainError

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 32).decode()


def test_password_rules():
    utils.validate_password("abcdefg1")
    for bad in ("short1", "has space 123", "x" * 73, ""):
        with pytest.raises(DomainError):
            utils.validate_password(bad)


def test_username_rules():
    assert utils.validate_username(" abc_123 ") == "abc_123"
    for bad in ("abc", "a" * 21, "has space", "สวัสดีครับ", "a-b-c-d"):
        with pytest.raises(DomainError):
            utils.validate_username(bad)


def test_delete_upload_only_touches_saved_images(tmp_path):
    path = utils.save_image("data:image/png;base64," + PNG, "profiles", upload_dir=str(tmp_path))
    assert utils.delete_upload(path, upload_dir=str(tmp_path)) is True
    assert not os.listdir(tmp_path / "profiles")
    assert utils.delete_upload(path, upload_dir=str(tmp_path)) is False  # ลบซ้ำ = ไม่ error
    (tmp_path / "secret.txt").write_text("x")
    for bad in (None, "", "https://lh3.googleusercontent.com/a.png", "/uploads/../secret.txt",
                "/uploads/profiles/../../secret.txt", "/etc/passwd"):
        assert utils.delete_upload(bad, upload_dir=str(tmp_path)) is False
    assert (tmp_path / "secret.txt").exists()


def test_erased_username_prefix_can_never_be_registered():
    # routers.users.ERASED_USERNAME_PREFIX = "deleted-" อาศัยว่าชื่อผู้ใช้จริงมีขีดไม่ได้
    with pytest.raises(DomainError):
        utils.validate_username("deleted-15-ab12cd34")


def test_phone_rules():
    assert utils.validate_phone("081-234-5678") == "0812345678"
    assert utils.validate_phone(" 02 123 4567 ") == "021234567"
    assert utils.validate_phone("") is None and utils.validate_phone(None) is None
    for bad in ("812345678", "08123", "081234567890", "08x2345678", "+66812345678"):
        with pytest.raises(DomainError):
            utils.validate_phone(bad)
    with pytest.raises(DomainError):
        utils.validate_phone("  ", required=True)


def test_email_rules():
    assert utils.validate_email(" a.b@shop.co.th ") == "a.b@shop.co.th"
    assert utils.validate_email("") is None and utils.validate_email(None) is None
    for bad in ("no-at-sign", "a@b", "a b@c.com", "a@@b.com", "x" * 95 + "@a.com"):
        with pytest.raises(DomainError):
            utils.validate_email(bad)


def test_mask_person_name():
    assert utils.mask_person_name("คุณ ยูฟ่า (ลูกค้า VIP)") == "ยู***"
    assert utils.mask_person_name("สมหมาย ใจดี") == "สม*** จ."
    assert utils.mask_person_name("นางสาว มะลิ หอมกรุ่น") == "มะ*** ห."
    assert utils.mask_person_name("John Smith") == "Jo*** S."
    assert utils.mask_person_name("Al") == "A***"
    for empty in (None, "", "   ", "คุณ", "(VIP)"):
        assert utils.mask_person_name(empty) == "ลูกค้า"
    full = "สมหมาย ใจดี"
    assert "สมหมาย" not in utils.mask_person_name(full) and "ใจดี" not in utils.mask_person_name(full)


def test_masking():
    assert utils.mask_email("user1001@example.test") == "u***@example.test"
    assert utils.mask_phone("0812345678") == "081****678"
    assert utils.mask_phone("123") == "123"


def test_save_image_writes_file(tmp_path):
    path = utils.save_image(f"data:image/png;base64,{PNG}", "slips", str(tmp_path))
    assert path.startswith("/uploads/slips/") and path.endswith(".png") and len(path) <= 500
    assert os.path.exists(tmp_path / "slips" / path.rsplit("/", 1)[1])


def test_save_image_passthrough_and_ignores_garbage(tmp_path):
    assert utils.save_image(None, "slips", str(tmp_path)) is None
    assert utils.save_image("slip_placeholder.png", "slips", str(tmp_path)) is None
    assert utils.save_image("http://evil.example/x.png", "slips", str(tmp_path)) is None
    assert utils.save_image("https://lh3.googleusercontent.com/a/x", "profiles", str(tmp_path)).startswith("https://")
    existing = "/uploads/products/" + "a" * 32 + ".png"
    assert utils.save_image(existing, "products", str(tmp_path)) == existing
    assert utils.save_image("/uploads/../../etc/passwd", "products", str(tmp_path)) is None


def test_save_image_rejects_fake_and_oversize(tmp_path, monkeypatch):
    fake = base64.b64encode(b"<?php echo 1; ?>").decode()
    with pytest.raises(DomainError):
        utils.save_image(f"data:image/png;base64,{fake}", "slips", str(tmp_path))
    monkeypatch.setattr(config, "MAX_IMAGE_BYTES", 10)
    with pytest.raises(DomainError):
        utils.save_image(f"data:image/png;base64,{PNG}", "slips", str(tmp_path))
    assert not os.listdir(tmp_path)


def test_pickup_time():
    now = datetime(2026, 10, 9, 8, 0)
    assert utils.parse_pickup_time("14:30 น.", now) == datetime(2026, 10, 9, 14, 30)
    assert utils.parse_pickup_time("2026-10-09 12:05:00", now) == datetime(2026, 10, 9, 12, 5)
    assert utils.parse_pickup_time("25:00", now) is None
    assert utils.parse_pickup_time("", now) is None
    assert utils.parse_pickup_time("soon", now) is None


def test_foodcourt_schedule_and_override():
    row = {"OpenTime": timedelta(hours=7), "CloseTime": timedelta(hours=18), "ManualOverride": None, "OverrideUntil": None}
    assert utils.foodcourt_is_open(row, datetime(2026, 1, 1, 7, 0))
    assert utils.foodcourt_is_open(row, datetime(2026, 1, 1, 17, 59))
    assert not utils.foodcourt_is_open(row, datetime(2026, 1, 1, 18, 0))
    assert not utils.foodcourt_is_open(row, datetime(2026, 1, 1, 6, 59))
    forced = dict(row, ManualOverride=1, OverrideUntil=datetime(2026, 1, 1, 20, 0))
    assert utils.foodcourt_is_open(forced, datetime(2026, 1, 1, 19, 0))
    assert utils.foodcourt_mode(forced, datetime(2026, 1, 1, 19, 0)) == "OPEN"
    assert not utils.foodcourt_is_open(forced, datetime(2026, 1, 1, 21, 0))  # override หมดอายุ -> กลับ AUTO
    assert utils.foodcourt_mode(forced, datetime(2026, 1, 1, 21, 0)) == "AUTO"
    closed = dict(row, ManualOverride=0, OverrideUntil=None)
    assert not utils.foodcourt_is_open(closed, datetime(2026, 1, 1, 12, 0))
    assert utils.foodcourt_mode(closed) == "CLOSED"


def test_next_transition():
    o, c = timedelta(hours=7), timedelta(hours=18)
    assert utils.next_transition(o, c, datetime(2026, 1, 1, 5, 0)) == datetime(2026, 1, 1, 7, 0)
    assert utils.next_transition(o, c, datetime(2026, 1, 1, 12, 0)) == datetime(2026, 1, 1, 18, 0)
    assert utils.next_transition(o, c, datetime(2026, 1, 1, 19, 0)) == datetime(2026, 1, 2, 7, 0)


def test_contract_rules():
    today = date(2026, 6, 15)
    assert utils.contract_active(None, None, None, today)  # ไม่มีสัญญา = ใช้ได้ (พฤติกรรมเดิม)
    assert utils.contract_active(date(2026, 1, 1), date(2026, 6, 15), "ACTIVE", today)  # วันสุดท้ายยังใช้ได้
    assert not utils.contract_active(date(2026, 1, 1), date(2026, 6, 14), "EXPIRED", today)
    assert not utils.contract_active(date(2026, 6, 16), date(2026, 12, 1), "ACTIVE", today)
    assert not utils.contract_active(date(2026, 1, 1), date(2026, 12, 1), "TERMINATED", today)
    assert utils.contract_status_for(date(2026, 6, 14), today) == "EXPIRED"
    assert utils.contract_status_for(date(2026, 6, 22), today) == "EXPIRING"
    assert utils.contract_status_for(date(2026, 6, 23), today) == "ACTIVE"


def test_queue_label_and_date_parse():
    assert utils.queue_label(7) == "007"
    assert utils.queue_label(1234) == "1234"
    assert utils.parse_date("2026-02-03") == date(2026, 2, 3)
    assert utils.parse_date(None) is None
    with pytest.raises(DomainError):
        utils.parse_date("03/02/2026")


def test_parse_date_rejects_buddhist_era_year():
    # ช่องวันที่สัญญาเป็นปี ค.ศ. : พิมพ์ 2569 ต้องถูกปฏิเสธ ไม่ใช่กลายเป็นสัญญาถึงปี ค.ศ. 2569
    with pytest.raises(DomainError) as err:
        utils.parse_date("2569-10-10", "วันสิ้นสุดสัญญา")
    assert "2026" in err.value.detail
    assert utils.parse_date("2399-12-31") == date(2399, 12, 31)


def test_queue_label_with_store_code():
    assert utils.queue_label(7, "A") == "A007"
    assert utils.queue_label(12, "AB") == "AB012"
    assert utils.queue_label(7, None) == "007"


def test_parse_queue_no_accepts_prefixed_and_plain():
    assert utils.parse_queue_no("A007") == 7
    assert utils.parse_queue_no("ab012") == 12
    assert utils.parse_queue_no("007") == 7
    assert utils.parse_queue_no(7) == 7
    assert utils.parse_queue_no("A") is None
    assert utils.parse_queue_no("") is None


def test_queue_code_validation_and_next_free():
    assert utils.validate_queue_code(" b ") == "B"
    for bad in ("", "1", "ABC", "ก", "A1"):
        with pytest.raises(DomainError):
            utils.validate_queue_code(bad)
    assert utils.next_free_queue_code([]) == "A"
    assert utils.next_free_queue_code(["A", "B", "D"]) == "C"
    assert utils.next_free_queue_code([chr(c) for c in range(65, 91)]) == "AA"
