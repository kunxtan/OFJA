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


def test_sends_once_after_30_minutes_and_not_before():
    db = FakeDB([order(1, 29), order(2, 30), order(3, 50)])
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
    db = FakeDB([order(1, 40, eta=NOW + timedelta(minutes=60)), order(2, 40)])
    assert jobs.send_pickup_reminders(db, NOW) == 1
    assert [o["OrderId"] for o in db.orders if o["reminded"]] == [2]


def test_reminder_sql_excludes_orders_with_eta():
    """ตัว SQL จริงต้องกรอง LatePickupArrivalTime ทั้งตอนเลือกและตอนจอง (FakeDB จำลองตามนี้)"""
    db = FakeDB([order(1, 40)])
    jobs.send_pickup_reminders(db, NOW)
    select_sql = next(q for q in db.sql if q.startswith("SELECT o.OrderId"))
    claim_sql = next(q for q in db.sql if q.startswith("UPDATE `Order` SET PickupReminderAt"))
    assert "LatePickupArrivalTime IS NULL" in select_sql and "LatePickupArrivalTime IS NULL" in claim_sql


# ------------------------------------------------ ของหมด: ยกเลิกอัตโนมัติเมื่อเลยเส้นตาย
class CancelCursor:
    def __init__(self, db):
        self.db = db

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, args=()):
        now, *skip = args
        self._rows = [{"OrderId": o["OrderId"]} for o in self.db.orders
                      if o["StatusCode"] == "PENDING_CANCELLATION" and o["CancelDeadline"] and o["CancelDeadline"] <= now
                      and o["OrderId"] not in skip]

    def fetchall(self):
        return self._rows


class CancelDB(FakeDB):
    def __init__(self, orders):
        super().__init__(orders)
        self.commits = 0

    def cursor(self):
        return CancelCursor(self)

    def commit(self):
        self.commits += 1


def pc_order(oid, deadline_in_minutes, status="PENDING_CANCELLATION"):
    return {"OrderId": oid, "StatusCode": status, "CancelReason": "วัตถุดิบหมด: ข้าวมันไก่",
            "CancelDeadline": NOW + timedelta(minutes=deadline_in_minutes)}


def patch_cancel(monkeypatch, db, fail_ids=()):
    calls = []
    monkeypatch.setattr(jobs, "_auto_cancel_retry_at", {})

    def fake_lock(cur, oid):
        return next(o for o in db.orders if o["OrderId"] == oid)

    def fake_transition(cur, order, new_code, **kw):
        assert kw["system"] is True and kw["actor_id"] is None and kw["cancel_deadline"] is None
        if order["OrderId"] in fail_ids:
            raise jobs.DomainError(400, "มีสลิปส่วนต่างที่ยังไม่ได้ตรวจ")
        order["StatusCode"] = new_code

    def fake_effects(db_, cur, order, final_code, actor_id, reason):
        calls.append((order["OrderId"], final_code, actor_id, reason))

    monkeypatch.setattr(jobs, "lock_order", fake_lock)
    monkeypatch.setattr(jobs, "do_transition", fake_transition)
    monkeypatch.setattr(jobs, "apply_status_effects", fake_effects)
    return calls


def test_auto_cancel_only_after_deadline(monkeypatch):
    db = CancelDB([pc_order(1, -1), pc_order(2, 5), pc_order(3, 0), pc_order(4, -10, status="PENDING")])
    calls = patch_cancel(monkeypatch, db)
    assert jobs.cancel_expired_requests(db, NOW) == 2
    assert [c[0] for c in calls] == [1, 3]
    assert all(c[1] == "CANCELLED" and c[2] is None for c in calls)  # ผลข้างเคียงครบ (คืนเงิน/แจ้งลูกค้า) โดยระบบ
    assert "ระบบยกเลิกออเดอร์อัตโนมัติ" in calls[0][3] and "ข้าวมันไก่" in calls[0][3]
    assert {o["OrderId"]: o["StatusCode"] for o in db.orders}[2] == "PENDING_CANCELLATION"
    assert jobs.cancel_expired_requests(db, NOW) == 0  # รอบถัดไปไม่ยกเลิกซ้ำ


def test_auto_cancel_skips_order_changed_meanwhile(monkeypatch):
    """เลือกไว้แล้ว แต่ตอนล็อกลูกค้าเปลี่ยนเมนูไปแล้ว -> ไม่แตะ"""
    o = pc_order(1, -1)
    db = CancelDB([o])
    calls = patch_cancel(monkeypatch, db)
    real_lock = jobs.lock_order

    def lock_after_change(cur, oid):
        o["StatusCode"] = "PENDING"
        return real_lock(cur, oid)

    monkeypatch.setattr(jobs, "lock_order", lock_after_change)
    assert jobs.cancel_expired_requests(db, NOW) == 0
    assert calls == [] and o["StatusCode"] == "PENDING"


def test_auto_cancel_one_failure_does_not_block_others(monkeypatch):
    db = CancelDB([pc_order(1, -2), pc_order(2, -1)])
    calls = patch_cancel(monkeypatch, db, fail_ids={1})
    assert jobs.cancel_expired_requests(db, NOW) == 1
    assert [c[0] for c in calls] == [2] and db.commits == 1


def test_auto_cancel_reason_fits_column():
    assert len(jobs.auto_cancel_reason("x" * 300)) == 255
    assert jobs.auto_cancel_reason(None).startswith("หมดเวลาเลือกเมนูทดแทน")


def test_auto_cancel_failure_backs_off(monkeypatch):
    """ยกเลิกไม่สำเร็จ -> เว้น 10 นาทีค่อยลองใหม่ (ไม่ลองทุกรอบ และไม่กินโควตา LIMIT ของออเดอร์อื่น)"""
    db = CancelDB([pc_order(1, -2)])
    patch_cancel(monkeypatch, db, fail_ids={1})
    tried = []
    real_lock = jobs.lock_order
    monkeypatch.setattr(jobs, "lock_order", lambda cur, oid: (tried.append(oid), real_lock(cur, oid))[1])
    jobs.cancel_expired_requests(db, NOW)
    jobs.cancel_expired_requests(db, NOW + timedelta(minutes=1))
    assert tried == [1]
    jobs.cancel_expired_requests(db, NOW + timedelta(minutes=jobs.AUTO_CANCEL_RETRY_MINUTES))
    assert tried == [1, 1]
