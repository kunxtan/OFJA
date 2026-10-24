"""แจ้งลูกค้าว่าเมนูหมด (หน้าร้าน/เจ้าของร้าน) : ออเดอร์ที่รอลูกค้าตอบอยู่แล้วต้องถูกเพิ่มจานที่หมดด้วย (ไม่ต้องมี MySQL)"""
from routers import products
from schemas import NotifyOutStockSchema

OWNER = {"UserId": 9, "RoleCode": "STORE_OWNER", "StoreId": 1}


class FakeCursor:
    def __init__(self, db):
        self.db = db
        self.rowcount = 0
        self._rows = []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, args=()):
        sql = " ".join(sql.split())
        self.db.sql.append((sql, args))
        if sql.startswith("SELECT DISTINCT o.OrderId"):
            self._rows = [{"OrderId": o["OrderId"]} for o in self.db.orders]
        elif sql.startswith("UPDATE OrderItem"):
            oid, pid = args
            items = [i for i in self.db.items if i["OrderId"] == oid and i["ProductId"] == pid and i["ItemStatus"] == "NORMAL"]
            for i in items:
                i["ItemStatus"] = "OUT_OF_STOCK"
            self.rowcount = len(items)
        elif sql.startswith("UPDATE `Order` SET CancelReason"):
            reason, oid = args
            self.order(oid)["CancelReason"] = reason

    def fetchall(self):
        return self._rows

    def order(self, oid):
        return next(o for o in self.db.orders if o["OrderId"] == oid)


class FakeDB:
    def __init__(self, orders, items):
        self.orders, self.items, self.sql = orders, items, []

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        pass

    def rollback(self):
        pass


def order(oid, status, reason=None):
    return {"OrderId": oid, "StatusCode": status, "CustomerId": 100 + oid, "QueueNo": oid, "QueueCode": "A",
            "CancelReason": reason, "CancelDeadline": "deadline-เดิม"}


def run(monkeypatch, orders, items):
    db = FakeDB(orders, items)
    transitions, notifs = [], []
    monkeypatch.setattr(products, "_product_for_update",
                        lambda cur, pid: {"ProductId": pid, "StoreId": 1, "ProductName": "ไข่เจียว"})
    monkeypatch.setattr(products, "lock_order", lambda cur, oid: cur.order(oid))
    monkeypatch.setattr(products, "log_audit", lambda *a, **k: None)

    def fake_transition(cur, o, new_code, **kw):
        transitions.append((o["OrderId"], new_code, kw["cancel_deadline"]))
        o["StatusCode"] = new_code

    monkeypatch.setattr(products, "do_transition", fake_transition)
    monkeypatch.setattr(products, "send_notif", lambda db_, uid, kind, title, msg, oid: notifs.append((oid, title, msg)))
    res = products.notify_out_of_stock(7, NotifyOutStockSchema(), user=OWNER, db=db)
    return db, res, transitions, notifs


def test_pending_order_moves_to_pending_cancellation(monkeypatch):
    db, res, transitions, notifs = run(monkeypatch, [order(1, "PENDING")],
                                       [{"OrderId": 1, "ProductId": 7, "ItemStatus": "NORMAL"}])
    assert res["notified_count"] == 1
    assert transitions[0][:2] == (1, "PENDING_CANCELLATION") and transitions[0][2] != "deadline-เดิม"
    assert db.items[0]["ItemStatus"] == "OUT_OF_STOCK"
    assert "ไข่เจียว" in notifs[0][2] and "15 นาที" in notifs[0][2]


def test_order_already_waiting_gets_second_item_flagged_without_new_deadline(monkeypatch):
    """ปิดสองเมนูต่อกัน (เช่นเลือกหลายเมนูแล้วกดของหมด) : ออเดอร์ที่มีทั้งสองจานต้องถูกแจ้งทั้งสองจาน"""
    o = order(1, "PENDING_CANCELLATION", reason="วัตถุดิบหมด: ข้าวผัด")
    db, res, transitions, notifs = run(monkeypatch, [o], [
        {"OrderId": 1, "ProductId": 5, "ItemStatus": "OUT_OF_STOCK"},
        {"OrderId": 1, "ProductId": 7, "ItemStatus": "NORMAL"},
    ])
    assert res["notified_count"] == 1
    assert transitions == []  # อยู่ในสถานะรอลูกค้าตอบแล้ว ไม่เปลี่ยนสถานะ/ไม่ต่อเวลา
    assert o["StatusCode"] == "PENDING_CANCELLATION" and o["CancelDeadline"] == "deadline-เดิม"
    assert o["CancelReason"] == "วัตถุดิบหมด: ข้าวผัด, ไข่เจียว"
    assert [i["ItemStatus"] for i in db.items] == ["OUT_OF_STOCK", "OUT_OF_STOCK"]
    assert "เวลาเดิม" in notifs[0][2]


def test_waiting_for_other_reason_keeps_reason_and_adds_item(monkeypatch):
    o = order(1, "PENDING_CANCELLATION", reason="ร้านขอยกเลิก")
    run(monkeypatch, [o], [{"OrderId": 1, "ProductId": 7, "ItemStatus": "NORMAL"}])
    assert o["CancelReason"] == "ร้านขอยกเลิก ; วัตถุดิบหมด: ไข่เจียว"


def test_skips_orders_that_changed_while_waiting_for_lock(monkeypatch):
    db, res, transitions, notifs = run(monkeypatch, [order(1, "COOKED"), order(2, "PENDING")], [
        {"OrderId": 1, "ProductId": 7, "ItemStatus": "NORMAL"},
        {"OrderId": 2, "ProductId": 7, "ItemStatus": "REPLACED"},  # ลูกค้าเปลี่ยนจานไปแล้ว
    ])
    assert res["notified_count"] == 0 and transitions == [] and notifs == []
    assert db.items[0]["ItemStatus"] == "NORMAL"
