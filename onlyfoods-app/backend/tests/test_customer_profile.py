"""GET /api/customers/{id} : ฝั่งร้านดูได้เฉพาะลูกค้าที่เคยสั่งกับร้านตัวเอง (กันไล่ UserId ดูข้อมูลส่วนตัว)"""
import pytest

from errors import DomainError
from routers.users import get_customer_profile

USERS = {
    # UserId: (RoleCode, FullName, Phone, Email)
    10: ("CUSTOMER", "ลูกค้า ร้าน1", "0812345678", "cust10@example.test"),
    11: ("CUSTOMER", "ลูกค้า ร้าน2", "0899999999", "cust11@example.test"),
    20: ("EXECUTIVE", "ผู้บริหาร", "0900000000", "exec@example.test"),
}
# (CustomerId, StoreId, StatusCode)
ORDERS = [(10, 1, "COMPLETED"), (10, 1, "CANCELLED"), (10, 2, "COMPLETED"), (11, 2, "NO_SHOW")]


class FakeCursor:
    def __init__(self):
        self._row = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, args=()):
        if "FROM `User` u JOIN Role" in sql:
            u = USERS.get(args[0])
            ok = u and ("r.RoleCode = 'CUSTOMER'" not in sql or u[0] == "CUSTOMER")
            self._row = {"CustomerName": u[1], "Phone": u[2], "Email": u[3]} if ok else None
        elif sql.strip().startswith("SELECT 1 FROM `Order`"):
            cid, sid = args
            self._row = {"1": 1} if any(c == cid and s == sid for c, s, _ in ORDERS) else None
        elif "COUNT(*) AS TotalOrders" in sql:
            cid = args[0]
            sid = args[1] if len(args) > 1 else None
            n = sum(1 for c, s, st in ORDERS
                    if c == cid and st in ("COMPLETED", "NO_SHOW") and (sid is None or s == sid))
            self._row = {"TotalOrders": n}
        else:
            raise AssertionError(f"unexpected SQL: {sql}")

    def fetchone(self):
        return self._row


class FakeDB:
    def cursor(self):
        return FakeCursor()


def staff(role="FRONT_STAFF", store_id=1):
    return {"UserId": 99, "RoleCode": role, "StoreId": store_id}


EXEC = {"UserId": 20, "RoleCode": "EXECUTIVE", "StoreId": None}


@pytest.mark.parametrize("role", ["FRONT_STAFF", "KITCHEN_STAFF", "STORE_OWNER"])
def test_store_staff_sees_own_customer_scoped_to_store(role):
    row = get_customer_profile(10, staff(role, 1), FakeDB())
    assert row["CustomerName"] == "ลูกค้า ร้าน1"
    assert row["Phone"] == "0812345678"          # หน้าร้านต้องโทรหาลูกค้าได้
    assert row["Email"] == "c***@example.test"   # อีเมลปิดบัง
    assert row["TotalOrders"] == 1               # นับเฉพาะร้าน 1 (ไม่รวมออเดอร์ร้าน 2)


def test_store_staff_cannot_see_customer_of_other_store():
    with pytest.raises(DomainError) as e:
        get_customer_profile(11, staff(store_id=1), FakeDB())
    assert e.value.status_code == 404


def test_store_staff_cannot_see_non_customer_accounts():
    with pytest.raises(DomainError) as e:
        get_customer_profile(20, staff(store_id=1), FakeDB())
    assert e.value.status_code == 404


def test_not_allowed_and_not_found_look_the_same():
    with pytest.raises(DomainError) as other_store:
        get_customer_profile(11, staff(store_id=1), FakeDB())
    with pytest.raises(DomainError) as missing:
        get_customer_profile(12345, staff(store_id=1), FakeDB())
    assert (other_store.value.status_code, other_store.value.detail) == (missing.value.status_code, missing.value.detail)


def test_staff_without_store_rejected():
    with pytest.raises(DomainError) as e:
        get_customer_profile(10, staff(store_id=None), FakeDB())
    assert e.value.status_code == 403


def test_executive_sees_any_customer_unmasked_all_stores():
    row = get_customer_profile(10, EXEC, FakeDB())
    assert row["Email"] == "cust10@example.test"
    assert row["TotalOrders"] == 2
    row = get_customer_profile(11, EXEC, FakeDB())
    assert row["TotalOrders"] == 1


def test_executive_cannot_use_it_for_non_customers():
    with pytest.raises(DomainError):
        get_customer_profile(20, EXEC, FakeDB())
