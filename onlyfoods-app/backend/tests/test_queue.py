"""เลขคิว: MAX+1 ต่อ (ร้าน, วัน) และ retry เมื่อชน uk_order_queue"""
import pytest

from errors import DomainError
from services import insert_with_queue_retry, is_duplicate_key, next_queue_no


class DupKey(Exception):
    """หน้าตาเหมือน pymysql.err.IntegrityError(1062, ...)"""

    def __init__(self, key="uk_order_queue"):
        super().__init__(1062, f"Duplicate entry '1-2026-01-01-2' for key 'order.{key}'")


class FakeDB:
    def __init__(self):
        self.rows = set()  # (store, queue)


class FakeCursor:
    def __init__(self, db, stale_reads=0):
        self.db, self._row, self.stale_reads = db, None, stale_reads

    def execute(self, sql, args=()):
        if "MAX(QueueNo)" in sql:
            store = args[0]
            qs = [q for (s, q) in self.db.rows if s == store]
            self._row = {"n": (max(qs) if qs else 0) + 1}

    def fetchone(self):
        return self._row


def test_first_queue_is_one():
    assert next_queue_no(FakeCursor(FakeDB()), 1) == 1


def test_next_is_max_plus_one_even_with_gaps():
    db = FakeDB()
    db.rows |= {(1, 1), (1, 2), (1, 5)}  # คิว 3,4 ถูกยกเลิก/หายไปแล้ว -> COUNT+1 จะซ้ำกับ 4 แต่ MAX+1 = 6
    assert next_queue_no(FakeCursor(db), 1) == 6
    assert next_queue_no(FakeCursor(db), 2) == 1  # คนละร้านนับแยกกัน


def test_sequential_inserts_get_unique_numbers():
    db = FakeDB()
    cur = FakeCursor(db)
    got = []
    for _ in range(5):
        def ins(q):
            assert (1, q) not in db.rows
            db.rows.add((1, q))
            return q * 100
        oid, q = insert_with_queue_retry(cur, 1, ins)
        got.append(q)
    assert got == [1, 2, 3, 4, 5]


def test_retry_after_duplicate_key():
    db = FakeDB()
    cur = FakeCursor(db)
    calls = []

    def ins(q):
        calls.append(q)
        if len(calls) == 1:
            db.rows.add((1, q))  # อีก transaction แย่งเลขนี้ไปก่อน
            raise DupKey()
        db.rows.add((1, q))
        return 77

    oid, q = insert_with_queue_retry(cur, 1, ins)
    assert (oid, q) == (77, 2)
    assert calls == [1, 2]


def test_gives_up_after_three_attempts():
    cur = FakeCursor(FakeDB())
    calls = []

    def ins(q):
        calls.append(q)
        raise DupKey()

    with pytest.raises(DomainError) as e:
        insert_with_queue_retry(cur, 1, ins)
    assert e.value.status_code == 503
    assert len(calls) == 3


def test_other_integrity_errors_are_not_retried():
    cur = FakeCursor(FakeDB())
    calls = []

    def ins(q):
        calls.append(q)
        raise DupKey("uk_something_else")

    with pytest.raises(DupKey):
        insert_with_queue_retry(cur, 1, ins)
    assert len(calls) == 1


def test_non_duplicate_errors_propagate():
    class Boom(Exception):
        pass

    def ins(q):
        raise Boom("fk fail")

    with pytest.raises(Boom):
        insert_with_queue_retry(FakeCursor(FakeDB()), 1, ins)


def test_is_duplicate_key():
    assert is_duplicate_key(DupKey())
    assert not is_duplicate_key(Exception(1452, "fk"))
    assert not is_duplicate_key(Exception())
