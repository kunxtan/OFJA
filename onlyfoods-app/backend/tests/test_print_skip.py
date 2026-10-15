"""ใบลูกค้าที่ยังรอพิมพ์ของออเดอร์ที่จบแล้ว ต้องถูกปิดเป็น SKIPPED (ไม่ค้างในแบนเนอร์หน้าร้าน)"""
import state
from services import _PRINT_SKIP_REASON, skip_queued_print_jobs


class RecCursor:
    def __init__(self):
        self.calls = []

    def execute(self, sql, args=()):
        self.calls.append((" ".join(sql.split()), args))


def test_ended_statuses_close_queued_slips():
    assert set(_PRINT_SKIP_REASON) == {state.COMPLETED, state.NO_SHOW, state.CANCELLED}
    # สถานะที่ยังต้องพิมพ์ได้ ห้ามอยู่ในรายการ
    for code in (state.READY, state.COOKED, state.COOKING, state.PENDING):
        assert code not in _PRINT_SKIP_REASON


def test_skip_only_touches_queued_customer_slips():
    cur = RecCursor()
    skip_queued_print_jobs(cur, 42, "x" * 300)
    sql, args = cur.calls[0]
    assert sql.startswith("UPDATE PrintJob SET PrintStatus = 'SKIPPED'")
    assert "PrintType = 'CUSTOMER'" in sql and "PrintStatus = 'QUEUED'" in sql
    assert args[1] == 42 and len(args[0]) == 255  # ErrorMessage VARCHAR(255)
