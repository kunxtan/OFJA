"""pool เต็ม: ต้องตอบ 503 ภายในเวลาที่กำหนด ไม่ใช่รอไม่มีกำหนด (กัน backend ค้างทั้งตัว)"""
import time

import pytest
from dbutils.pooled_db import TooManyConnectionsError
from fastapi import HTTPException

import config
import db


class FullPool:
    def connection(self):
        raise TooManyConnectionsError()


def test_acquire_gives_up_with_503(monkeypatch):
    monkeypatch.setattr(db, "_get_pool", lambda: FullPool())
    monkeypatch.setattr(config, "DB_POOL_WAIT_SECONDS", 0)
    t = time.monotonic()
    with pytest.raises(HTTPException) as e:
        db.acquire()
    assert e.value.status_code == 503 and time.monotonic() - t < 1


def test_pool_bigger_than_threadpool():
    # FastAPI/anyio รัน endpoint แบบ sync ใน threadpool 40 thread ; pool ต้องไม่เล็กกว่านั้น
    assert config.DB_POOL_SIZE >= 40
