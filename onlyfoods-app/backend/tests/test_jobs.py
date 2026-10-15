"""งานเตือนลูกค้าที่ยังไม่มารับอาหาร: ข้อความ + ตรรกะเลือก/จองออเดอร์ (ใช้ DB จำลอง ไม่ต้องมี MySQL)"""
from datetime import datetime, timedelta

import config
import jobs


class FakeCursor:
    def __init__(self, db):
        self.db, self.rowcount, self._rows = db, 0, []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, args=()):
        s = " ".join(sql.split())
        self.db.sql.append(s)
        if s.startswith("SELECT o.OrderId"):
            due_before, oldest = args
            self._rows = [dict(o) for o in self.db.orders
                          if o["status"] == "READY" and o["customer"] and o["reminded"] is None
                          and o.get("eta") is None and oldest <= o["ReadyAt"] <= due_before]
        elif s.startswith("UPDATE `Order` SET PickupReminderAt"):
            now, oid = args
            o = next(x for x in self.db.orders if x["OrderId"] == oid)
            if o["reminded"] is None and o["status"] == "READY" and o.get("eta") is None:
                o["reminded"], self.rowcount = now, 1
            else:
                self.rowcount = 0
        elif s.startswith("INSERT INTO Notification"):
            self.db.notifs.append(args)
        elif s.startswith("INSERT INTO AuditLog"):
            self.db.audits.append(args)

    def fetchall(self):
        return self._rows


class FakeDB:
    def __init__(self, orders):
        self.orders, self.sql, self.notifs, self.audits = orders, [], [], []

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        pass

    def rollback(self):
        pass


NOW = datetime(2026, 1, 1, 12, 0, 0)


def order(oid, minutes_ago, **kw):
    base = {"OrderId": oid, "CustomerId": 7, "QueueNo": oid, "QueueCode": "A", "StoreId": 1, "status": "READY",
            "customer": True, "reminded": None, "ReadyAt": NOW - timedelta(minutes=minutes_ago)}
    base.update(kw)
    return base


def test_reminder_text_mentions_queue_and_minutes():
    t = jobs.reminder_text("A007", 15)
    assert "A007" in t and "15 นาที" in t


def test_sends_once_after_15_minutes_and_not_before():
    db = FakeDB([order(1, 14), order(2, 15), order(3, 40)])
    assert jobs.send_pickup_reminders(db, NOW) == 2
    assert {o["OrderId"] for o in db.orders if o["reminded"]} == {2, 3}
    assert len(db.notifs) == 2 and len(db.audits) == 2
    assert jobs.send_pickup_reminders(db, NOW) == 0  # รอบถัดไปไม่ส่งซ้ำ
    assert len(db.notifs) == 2


def test_skips_walk_in_finished_and_very_old_orders():
    db = FakeDB([
        order(1, 20, customer=False, CustomerId=None),                       # walk-in: ไม่มีบัญชีให้แจ้ง
        order(2, 20, status="COMPLETED"),                                     # รับของไปแล้ว
        order(3, 60 * (config.PICKUP_REMINDER_MAX_AGE_HOURS + 1)),            # ค้างเก่าเกินไป (กันส่งรัวตอน deploy)
    ])
    assert jobs.send_pickup_reminders(db, NOW) == 0
    assert db.notifs == []


def test_claim_loses_when_status_changed_meanwhile():
    """ระหว่างเลือกกับจอง ลูกค้ามารับแล้ว (สถานะไม่ใช่ READY) -> ต้องไม่ส่ง"""
    o = order(1, 20)
    db = FakeDB([o])
    real_execute = FakeCursor.execute

    def sneaky(self, sql, args=()):
        if " ".join(sql.split()).startswith("UPDATE `Order` SET PickupReminderAt"):
            o["status"] = "COMPLETED"
        return real_execute(self, sql, args)

    FakeCursor.execute = sneaky
    try:
        assert jobs.send_pickup_reminders(db, NOW) == 0
    finally:
        FakeCursor.execute = real_execute
    assert db.notifs == [] and o["reminded"] is None


def test_no_reminder_when_customer_already_said_they_are_late():
    db = FakeDB([order(1, 20, eta=NOW + timedelta(minutes=60)), order(2, 20)])
    assert jobs.send_pickup_reminders(db, NOW) == 1
    assert [o["OrderId"] for o in db.orders if o["reminded"]] == [2]


def test_reminder_sql_excludes_orders_with_eta():
    """ตัว SQL จริงต้องกรอง LatePickupArrivalTime ทั้งตอนเลือกและตอนจอง (FakeDB จำลองตามนี้)"""
    db = FakeDB([order(1, 20)])
    jobs.send_pickup_reminders(db, NOW)
    select_sql = next(q for q in db.sql if q.startswith("SELECT o.OrderId"))
    claim_sql = next(q for q in db.sql if q.startswith("UPDATE `Order` SET PickupReminderAt"))
    assert "LatePickupArrivalTime IS NULL" in select_sql and "LatePickupArrivalTime IS NULL" in claim_sql
