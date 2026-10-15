"""สรุปใครรับ / ใครทำ / ใครเรียกคิว / ใครส่งมอบ จาก OrderStatusLog (หน้ารายละเอียดประวัติการขาย)"""
from shapes import order_people


def log(old, new, who=None, name=None, role=None, at="t", system=False):
    return {"OldStatusCode": old, "NewStatusCode": new, "ChangedBy": None if system else who,
            "ChangedByName": None if system else name, "ChangedByRole": None if system else role,
            "ChangedByType": "SYSTEM" if system else "USER", "CreatedAt": at}


FRONT = dict(who=2, name="ฟลุ้ค หน้าร้าน", role="FRONT_STAFF")
KITCHEN = dict(who=3, name="เชฟ", role="KITCHEN_STAFF")
CUSTOMER = dict(who=1, name="ยูฟ่า", role="CUSTOMER")


def test_online_order_full_flow():
    timeline = [
        log(None, "VERIFYING_SLIP", **CUSTOMER, at="10:00"),
        log("VERIFYING_SLIP", "PENDING", **FRONT, at="10:01"),
        log("PENDING", "COOKING", **KITCHEN, at="10:02"),
        log("COOKING", "COOKED", **KITCHEN, at="10:10"),
        log("COOKED", "READY", **FRONT, at="10:11"),
        log("READY", "COMPLETED", **FRONT, at="10:15"),
    ]
    p = order_people({"IsWalkIn": False}, timeline)
    assert p["accepted"]["Name"] == "ฟลุ้ค หน้าร้าน" and p["accepted"]["At"] == "10:01"
    assert p["cooking"]["Name"] == "เชฟ" and p["cooked"]["At"] == "10:10"
    assert p["called"]["RoleCode"] == "FRONT_STAFF"
    assert p["handed_over"]["At"] == "10:15"
    assert "cancelled" not in p and "no_show" not in p


def test_first_time_counts_when_status_repeats():
    # รอยกเลิก (ของหมด) แล้วลูกค้าเปลี่ยนเมนู -> กลับมา PENDING โดยลูกค้า ; คนรับยังเป็นหน้าร้านคนแรก
    timeline = [
        log(None, "VERIFYING_SLIP", **CUSTOMER),
        log("VERIFYING_SLIP", "PENDING", **FRONT, at="first"),
        log("PENDING", "PENDING_CANCELLATION", **FRONT),
        log("PENDING_CANCELLATION", "PENDING", **CUSTOMER, at="second"),
    ]
    assert order_people({"IsWalkIn": False}, timeline)["accepted"]["At"] == "first"


def test_walk_in_creator_is_the_acceptor():
    timeline = [log(None, "PENDING", **FRONT, at="10:00"), log("PENDING", "COOKING", **KITCHEN)]
    p = order_people({"IsWalkIn": True}, timeline)
    assert p["accepted"]["Name"] == "ฟลุ้ค หน้าร้าน" and p["cooking"]["Name"] == "เชฟ"


def test_system_steps_show_as_system():
    timeline = [log(None, "VERIFYING_SLIP", **CUSTOMER), log("VERIFYING_SLIP", "CANCELLED", system=True)]
    p = order_people({"IsWalkIn": False}, timeline)
    assert p["cancelled"]["Name"] == "ระบบ" and p["cancelled"]["IsSystem"] is True
    assert "accepted" not in p
