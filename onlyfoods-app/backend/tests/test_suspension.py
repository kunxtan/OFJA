"""ระงับบัญชีลูกค้า : ระยะเวลา, สถานะ, ข้อความ และงานปลดอัตโนมัติ (ใช้ DB จำลอง ไม่ต้องมี MySQL)"""
from datetime import datetime, timedelta

import pytest

import jobs
import suspension
from errors import DomainError

NOW = datetime(2026, 10, 24, 13, 30, 45)


def test_end_is_n_days_later_rounded_to_minute_or_none():
    assert suspension.suspension_end(NOW, 7) == datetime(2026, 10, 31, 13, 30)
    assert suspension.suspension_end(NOW, None) is None
    for bad in (0, 366, -1):
        with pytest.raises(DomainError):
            suspension.suspension_end(NOW, bad)


def test_active_until_end_time_and_until_lifted():
    row = {"LiftedAt": None, "EndAt": NOW + timedelta(minutes=1)}
    assert suspension.is_active(row, NOW)
    assert not suspension.is_active(row, NOW + timedelta(minutes=1))  # ครบกำหนด = ใช้งานได้ทันที ไม่ต้องรอ job
    assert suspension.is_active({"LiftedAt": None, "EndAt": None}, NOW + timedelta(days=999))  # ไม่มีกำหนด
    assert not suspension.is_active({"LiftedAt": NOW, "EndAt": None}, NOW)
    assert not suspension.is_active(None, NOW)


def test_reason_and_appeal_text_rules():
    assert suspension.clean_words("  สั่งแล้ว   ไม่มารับ  ", "เหตุผล", 5, 255) == "สั่งแล้ว ไม่มารับ"
    with pytest.raises(DomainError):
        suspension.clean_words("สั้น", "เหตุผล", 5, 255)
    with pytest.raises(DomainError):
        suspension.clean_words("ก" * 256, "เหตุผล", 5, 255)
    assert suspension.clean_words("   ", "หมายเหตุ", 0, 255, required=False) is None


def test_messages_tell_until_when_why_and_that_old_orders_continue():
    end = datetime(2026, 10, 31, 13, 30)
    assert suspension.thai_datetime(end) == "31 ต.ค. 2569 13:30 น."
    msg = suspension.blocked_message({"EndAt": end, "Reason": "ใช้สลิปซ้ำ"}, "การสั่งอาหาร")
    assert "การสั่งอาหาร ถึง 31 ต.ค. 2569" in msg and "ใช้สลิปซ้ำ" in msg and "อุทธรณ์" in msg
    assert "จนกว่าผู้บริหารจะปลดระงับ" in suspension.blocked_message({"EndAt": None, "Reason": "x"}, "การรีวิว")
    notice = suspension.notice_suspended("พฤติกรรมผิดปกติซ้ำ", end, 7)
    assert "7 วัน" in notice and "ออเดอร์ที่สั่งไว้แล้วยังดำเนินการตามปกติ" in notice


def test_only_customers_are_checked():
    class NoQuery:
        def execute(self, *a):
            raise AssertionError("ไม่ควร query สำหรับบทบาทอื่น")
    suspension.assert_not_suspended(NoQuery(), {"RoleCode": "FRONT_STAFF", "UserId": 2}, "การสั่งอาหาร")


# ---------------------------------------------------------------- job ปลดอัตโนมัติ
class FakeCursor:
    def __init__(self, db):
        self.db, self.rowcount, self._rows = db, 0, []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, args=()):
        s = " ".join(sql.split())
        rows = self.db.rows
        if s.startswith("SELECT s.SuspensionId FROM UserSuspension"):
            (now,) = args
            self._rows = [{"SuspensionId": r["SuspensionId"]} for r in rows
                          if r["LiftedAt"] is None and r["EndAt"] is not None and r["EndAt"] <= now]
            # จำลองผู้บริหารกดปลดระหว่างที่ job เลือกแถวไปแล้ว
            for r in rows:
                if r.get("lift_after_select"):
                    r["LiftedAt"] = now
        elif s.startswith("SELECT s.SuspensionId, s.UserId"):
            self._rows = [dict(r, Username="u%s" % r["UserId"]) for r in rows if r["SuspensionId"] == args[0]]
        elif s.startswith("UPDATE UserSuspension SET LiftedAt"):
            lifted_at, by, lift_type, note, sid = args
            r = next(x for x in rows if x["SuspensionId"] == sid)
            if r["LiftedAt"] is None:
                r.update(LiftedAt=lifted_at, LiftedBy=by, LiftType=lift_type)
                self.rowcount = 1
            else:
                self.rowcount = 0
        elif s.startswith("INSERT INTO Notification"):
            self.db.notifs.append(args)
        elif s.startswith("INSERT INTO AuditLog"):
            self.db.audits.append(args)

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None


class FakeDB:
    def __init__(self, rows):
        self.rows, self.notifs, self.audits, self.commits = rows, [], [], 0

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        pass


def susp(sid, end, **kw):
    base = {"SuspensionId": sid, "UserId": 10 + sid, "Reason": "ทดสอบ", "EndAt": end, "LiftedAt": None}
    base.update(kw)
    return base


def test_job_lifts_only_expired_and_records_real_end_time():
    db = FakeDB([susp(1, NOW - timedelta(hours=2)), susp(2, NOW + timedelta(hours=1)), susp(3, None),
                 susp(4, NOW - timedelta(days=1), LiftedAt=NOW - timedelta(days=2))])
    assert jobs.lift_expired_suspensions(db, NOW) == 1
    lifted = db.rows[0]
    assert lifted["LiftType"] == "AUTO" and lifted["LiftedBy"] is None
    assert lifted["LiftedAt"] == NOW - timedelta(hours=2)  # เวลาที่หมดจริง ไม่ใช่เวลาที่ job มาเจอ
    assert db.rows[1]["LiftedAt"] is None and db.rows[2]["LiftedAt"] is None
    assert len(db.notifs) == 1 and db.notifs[0][0] == 11 and db.notifs[0][2] == "SYSTEM"
    assert len(db.audits) == 1 and db.audits[0][0] is None and db.audits[0][1] == "AUTO_UNBAN_USER"
    assert jobs.lift_expired_suspensions(db, NOW) == 0  # รอบถัดไปไม่แจ้งซ้ำ


def test_job_skips_row_lifted_by_executive_in_between():
    db = FakeDB([susp(1, NOW - timedelta(minutes=5), lift_after_select=True)])
    assert jobs.lift_expired_suspensions(db, NOW) == 0
    assert db.notifs == [] and db.audits == []
