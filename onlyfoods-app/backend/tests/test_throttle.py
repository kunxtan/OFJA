"""จำกัดการเดารหัสผ่าน: ผิดครบ 5 ครั้งรอ 60 วิ แล้วรอเพิ่มเท่าตัวทุกครั้งที่ผิดต่อ สูงสุด 15 นาที"""
import throttle


def test_wait_grows_and_caps():
    t = throttle.PAIR_THRESHOLD
    assert [throttle.wait_seconds(n, t) for n in range(1, t)] == [0] * (t - 1)
    assert throttle.wait_seconds(t, t) == 60
    assert throttle.wait_seconds(t + 1, t) == 120
    assert throttle.wait_seconds(t + 3, t) == 480
    assert throttle.wait_seconds(t + 4, t) == 900       # 960 -> เพดาน 15 นาที
    assert throttle.wait_seconds(t + 500, t) == 900


def test_keys_do_not_store_raw_values_and_ignore_case():
    (pair, _), (user, _) = throttle._keys("10.0.0.1", "Staff01")
    assert len(pair) == 64 and "staff01" not in pair
    assert throttle._keys("10.0.0.1", "staff01")[0][0] == pair      # ชื่อผู้ใช้ตัวพิมพ์ใหญ่/เล็กนับรวมกัน
    assert throttle._keys("10.0.0.2", "staff01")[0][0] != pair      # คนละ IP = คนละตัวนับ
    assert throttle._keys("10.0.0.2", "staff01")[1][0] == user      # แต่ตัวนับรวมทุก IP เป็นตัวเดียวกัน


def test_wait_message():
    assert "45 วินาที" in throttle.wait_message(45)
    assert "2 นาที" in throttle.wait_message(61)
