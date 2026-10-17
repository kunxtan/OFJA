"""Connection pool + transaction helper"""
import logging
import time
from contextlib import contextmanager

import pymysql
from dbutils.pooled_db import PooledDB, TooManyConnectionsError
from fastapi import HTTPException
from pymysql.cursors import DictCursor

import config
from errors import DomainError

logger = logging.getLogger("onlyfood")

_pool = None


def _get_pool() -> PooledDB:
    global _pool
    if _pool is None:
        _pool = PooledDB(
            creator=pymysql,
            maxconnections=config.DB_POOL_SIZE,
            mincached=1,
            blocking=False,  # ห้ามรอไม่จำกัด (ดู acquire)
            ping=1,  # ping ก่อนใช้ทุกครั้ง กัน connection ค้าง/ถูกตัด
            host=config.DB_HOST,
            port=config.DB_PORT,
            user=config.DB_USER,
            password=config.DB_PASSWORD,
            database=config.DB_NAME,
            charset="utf8mb4",
            cursorclass=DictCursor,
            autocommit=False,
            # READ COMMITTED: ทุก SELECT เห็นข้อมูลล่าสุดที่ commit แล้ว
            # (จำเป็นกับการ retry เลขคิว และลด gap lock ตอนสั่งอาหารพร้อมกัน)
            init_command="SET time_zone='+07:00', SESSION transaction_isolation='READ-COMMITTED'",
        )
    return _pool


def acquire():
    """ยืม connection จาก pool ; เต็มอยู่ -> รอสั้น ๆ ไม่เกิน DB_POOL_WAIT_SECONDS แล้วตอบ 503
    (รอแบบไม่มีกำหนดทำให้ backend ค้างทั้งตัวได้ ดูหมายเหตุที่ config.DB_POOL_SIZE)"""
    deadline = time.monotonic() + config.DB_POOL_WAIT_SECONDS
    while True:
        try:
            return _get_pool().connection()
        except TooManyConnectionsError:
            if time.monotonic() >= deadline:
                logger.error("db pool exhausted (%s connections in use)", config.DB_POOL_SIZE)
                raise HTTPException(status_code=503, detail="ระบบมีผู้ใช้งานพร้อมกันจำนวนมาก กรุณาลองใหม่อีกครั้ง")
            time.sleep(0.05)


def get_db():
    """FastAPI dependency: ยืม connection จาก pool แล้วคืนเสมอ (rollback ก่อนคืน)"""
    conn = acquire()
    try:
        yield conn
    finally:
        try:
            conn.rollback()
        except Exception:  # connection เสีย ปล่อยให้ pool ทิ้งเอง
            logger.warning("rollback on release failed", exc_info=True)
        conn.close()


@contextmanager
def transaction(db):
    """ครอบทุก endpoint ที่เขียนข้อมูล

    สำเร็จ -> commit ; DomainError/HTTPException -> rollback แล้วส่งต่อ ;
    ข้อผิดพลาดอื่น -> rollback + log เต็มที่ server + ตอบ 500 ข้อความกลาง ๆ (ไม่รั่ว str(e))
    """
    try:
        yield
        db.commit()
    except (DomainError, HTTPException):
        db.rollback()
        raise
    except Exception:
        db.rollback()
        logger.exception("transaction failed")
        raise HTTPException(status_code=500, detail="เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง")