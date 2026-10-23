"""SQL ที่ใช้ร่วมกัน + แปลงแถวจาก DB เป็นรูปแบบเดียวกับ API เดิม (frontend ยังอ่านชื่อฟิลด์เดิมได้)"""
from typing import Dict, Iterable, List

import config

from state import legacy_role, legacy_status
from utils import (CONTRACT_ACTIVE, CONTRACT_EXPIRED, STORE_CLOSED, STORE_OPEN, STORE_PAUSED, bangkok_now,
                   contract_state, foodcourt_mode, queue_label, store_hours, store_open_state, time_to_hhmm)
USER_SELECT = """
SELECT u.UserId, u.Username, u.FullName, u.Phone, u.Email,
       u.ProfileImageUrl AS ProfileImg, u.StoreId, u.IsActive,
       r.RoleCode, r.RoleNameTh
FROM `User` u JOIN Role r ON r.RoleId = u.RoleId
"""


def shape_user(row: dict) -> dict:
    row = dict(row)
    row["Role"] = legacy_role(row["RoleCode"])
    row["Cards"] = []  # ER ใหม่ไม่เก็บข้อมูลบัตรอีกแล้ว
    return row


STORE_SELECT = """
SELECT s.StoreId, s.StoreName, sc.CategoryName AS Category, s.StoreCategoryId, s.FoodCourtId,
       s.Description, s.ImageUrl, s.IsSuspended, s.AvgPrepMinutes, s.QueueCode,
       s.OpenTime, s.CloseTime, s.ManualOverride, s.OverrideUntil, s.PausedUntil,
       s.ContactName, s.ContactPhone, s.ContactLine, s.ContactEmail,
       s.IsDeleted, s.DeletedAt, s.CreatedAt,
       c.StartDate AS ContractStartDate, c.StartDate AS CurrentContractStartDate,
       c.EndDate AS ContractEndDate, 
       (SELECT COUNT(*) FROM `Order` oo JOIN OrderStatus oos ON oos.StatusId = oo.StatusId
        WHERE oo.StoreId = s.StoreId AND oos.IsTerminal = FALSE) AS OpenOrderCount
FROM Store s
JOIN StoreCategory sc ON sc.StoreCategoryId = s.StoreCategoryId
LEFT JOIN StoreContract c ON c.StoreId = s.StoreId
"""


def _fmt_dt(value):
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else None


def shape_store(row: dict, fc: dict, now=None) -> dict:
    """เติมสถานะสัญญาที่คำนวณจากวันที่ + สถานะเปิดร้านที่คำนวณจากเวลา (fc = แถว FoodCourt)

    - ContractState : NONE / UPCOMING / ACTIVE / EXPIRED
    - ContractDaysLeft : วันที่เหลือถึงวันสิ้นสุด (0 = หมดคืนนี้ 23:59:59, ติดลบ = หมดมาแล้ว)
    - OpenState : OPEN / PAUSED (หยุดรับออเดอร์ชั่วคราว) / CLOSED  (utils.store_open_state + สัญญา)
    - IsOpen : รับออเดอร์ได้จริงตอนนี้ (OpenState == OPEN) frontend ทุกบทบาทอ่านค่านี้ได้เลย
    - OpenMode : AUTO = ตามเวลา ; OPEN/CLOSED = กดเองถึง OverrideUntil
    - OpenTime/CloseTime : เวลาร้านที่ใช้จริง (HH:MM) ; HasOwnHours = ตั้งเวลาร้านเอง (ไม่ใช่เวลาศูนย์อาหาร)
    """
    row = dict(row)
    now = now or bangkok_now()
    today = now.date()
    state = contract_state(row.get("ContractStartDate"), row.get("ContractEndDate"), today)
    end = row.get("ContractEndDate")
    row["ContractState"] = state
    row["ContractDaysLeft"] = (end - today).days if end else None
    row["OpenOrderCount"] = int(row.get("OpenOrderCount") or 0)
    # หมดสัญญาแล้วแต่ยังมีออเดอร์ค้าง = บัญชีร้านยังเข้ามาเคลียร์ออเดอร์ได้ (utils.store_account_access)
    row["IsClearingOrders"] = state == CONTRACT_EXPIRED and row["OpenOrderCount"] > 0
    # อีกกี่วันร้านที่หมดสัญญาจะถูกลบอัตโนมัติ (services.purge_expired_stores)
    row["AutoDeleteInDays"] = (config.CONTRACT_PURGE_AFTER_DAYS + row["ContractDaysLeft"] + 1
                               if state == CONTRACT_EXPIRED else None)
    open_state = store_open_state(row, fc, now) if state == CONTRACT_ACTIVE else STORE_CLOSED
    o, c = store_hours(row, fc)
    row["HasOwnHours"] = row.get("OpenTime") is not None
    row["OpenTime"], row["CloseTime"] = time_to_hhmm(o), time_to_hhmm(c)
    row["OpenMode"] = foodcourt_mode(row, now)
    row["OverrideUntil"] = _fmt_dt(row.get("OverrideUntil")) if row["OpenMode"] != "AUTO" else None
    row["PausedUntil"] = _fmt_dt(row.get("PausedUntil")) if open_state == STORE_PAUSED else None
    row.pop("ManualOverride", None)
    row["OpenState"] = open_state
    row["IsOpen"] = open_state == STORE_OPEN
    return row


ORDER_SELECT = """
SELECT o.OrderId AS OrderID, o.OrderId, o.StoreId, o.CustomerId AS UserId, o.CustomerId,
       o.CreatedByStaffId, o.QueueNo, o.TotalAmount, os.StatusCode, os.StatusNameTh,
       o.Note, o.IsWalkIn, o.PickupTime, o.CreatedAt, o.ReadyAt, o.DeliveredAt, o.PickupReminderAt, o.CancelReason, o.CancelDeadline,
       o.LatePickupCount, o.LatePickupMinutes, o.LatePickupArrivalTime,
       s.StoreName, s.QueueCode, u.FullName AS CustomerName, u.Username AS UserName,
       u.Phone AS CustomerPhone, u.Email AS CustomerEmail,
       pm.MethodCode AS PaymentMethodCode, pm.MethodNameTh AS PaymentMethod,
       p.PaymentStatus, p.SlipImageUrl AS SlipUrl,
       tu.PaymentId AS TopUpPaymentId, tu.Amount AS TopUpAmount, tu.SlipImageUrl AS TopUpSlipUrl,
       EXISTS(SELECT 1 FROM Review rv WHERE rv.OrderId = o.OrderId) AS IsReviewed
FROM `Order` o
JOIN OrderStatus os ON os.StatusId = o.StatusId
JOIN Store s ON s.StoreId = o.StoreId
LEFT JOIN `User` u ON u.UserId = o.CustomerId
-- p = การชำระค่าอาหาร (ใบล่าสุด) ; tu = ส่วนต่างที่ยังรอโอน/รอตรวจ (มีได้ทีละ 1)
LEFT JOIN Payment p ON p.PaymentId = (SELECT MAX(p2.PaymentId) FROM Payment p2
                                      WHERE p2.OrderId = o.OrderId AND p2.PaymentType = 'ORDER')
LEFT JOIN Payment tu ON tu.PaymentId = (SELECT MAX(p3.PaymentId) FROM Payment p3
                                        WHERE p3.OrderId = o.OrderId AND p3.PaymentType = 'TOP_UP'
                                          AND p3.PaymentStatus = 'PENDING')
LEFT JOIN PaymentMethod pm ON pm.MethodId = p.MethodId
"""


def shape_order(row: dict) -> dict:
    row = dict(row)
    row["QueueNo"] = queue_label(row["QueueNo"], row.get("QueueCode"))
    row["Status"] = legacy_status(row["StatusCode"])
    row["TopUpAmount"] = float(row["TopUpAmount"]) if row.get("TopUpAmount") is not None else None
    created = row.get("CreatedAt")
    row["OrderTime"] = created.strftime("%Y-%m-%d %H:%M:%S") if created else None
    pickup = row.get("PickupTime")
    row["PickupTime"] = f"{pickup.strftime('%H:%M')} น." if pickup else None
    row["IsReviewed"] = bool(row.get("IsReviewed"))
    late_arrival = row.get("LatePickupArrivalTime")
    row["LatePickupArrivalTime"] = (
        late_arrival.strftime("%Y-%m-%d %H:%M:%S")
        if late_arrival else None
    )
    row["LatePickupCount"] = int(row.get("LatePickupCount") or 0)
    row["LatePickupMinutes"] = int(row.get("LatePickupMinutes") or 0)
    return row


# ข้อมูลติดต่อลูกค้าเท่าที่แต่ละบทบาทต้องใช้ : ครัวไม่ต้องเห็นเบอร์/อีเมล ; หน้าร้านใช้เบอร์โทรตามลูกค้า แต่ไม่ต้องเห็นอีเมล
_HIDDEN_CONTACTS = {"KITCHEN_STAFF": ("CustomerPhone", "CustomerEmail"), "FRONT_STAFF": ("CustomerEmail",)}


def redact_order_contacts(orders: List[Dict], role: str) -> List[Dict]:
    for o in orders:
        for f in _HIDDEN_CONTACTS.get(role, ()):
            o.pop(f, None)
    return orders


def attach_items(cur, orders: List[Dict]) -> List[Dict]:
    """ดึงรายการอาหารของทุกออเดอร์ด้วย query เดียว (ไม่ใช่ N+1)"""
    for o in orders:
        o["items"] = []
    if not orders:
        return orders
    ids = [o["OrderID"] for o in orders]
    placeholders = ",".join(["%s"] * len(ids))
    cur.execute(
        f"""
        SELECT oi.OrderId, oi.OrderItemId AS DetailID, oi.OrderItemId, oi.ProductId, p.ProductName,
               p.IsOutOfStock, oi.Qty, oi.UnitPrice, oi.ItemNote, oi.ItemStatus
        FROM OrderItem oi JOIN Product p ON p.ProductId = oi.ProductId
        WHERE oi.OrderId IN ({placeholders}) AND oi.ItemStatus <> 'REPLACED'
        ORDER BY oi.OrderItemId
        """,
        ids,
    )
    by_order: Dict[int, List[Dict]] = {}
    for it in cur.fetchall():
        by_order.setdefault(it["OrderId"], []).append(it)
    for o in orders:
        o["items"] = by_order.get(o["OrderID"], [])
    _attach_payments(cur, orders, ids, placeholders)
    return orders


def _attach_payments(cur, orders: List[Dict], ids: List[int], placeholders: str) -> None:
    """ทุกการชำระของออเดอร์ (ค่าอาหาร + ส่วนต่าง รวมใบที่ถูกปฏิเสธ) ให้ร้าน/ลูกค้าดูสลิปย้อนหลังได้ทุกใบ"""
    cur.execute(
        f"""
        SELECT p.OrderId, p.PaymentId, p.PaymentType, p.Amount, p.PaymentStatus, p.SlipImageUrl AS SlipUrl,
               p.RejectReason, p.PaidAt, p.CreatedAt, pm.MethodCode, p.CashReceived, p.ChangeGiven
        FROM Payment p JOIN PaymentMethod pm ON pm.MethodId = p.MethodId
        WHERE p.OrderId IN ({placeholders}) ORDER BY p.PaymentId
        """,
        ids,
    )
    by_order: Dict[int, List[Dict]] = {}
    for p in cur.fetchall():
        p["Amount"] = float(p["Amount"])
        for k in ("CashReceived", "ChangeGiven"):
            p[k] = float(p[k]) if p[k] is not None else None
        by_order.setdefault(p.pop("OrderId"), []).append(p)
    for o in orders:
        o["Payments"] = by_order.get(o["OrderID"], [])


# ขั้นตอนในไทม์ไลน์ -> บทบาทที่แสดงในหน้ารายละเอียดออเดอร์ (ใครรับ / ใครทำ / ใครเรียกคิว / ใครส่งมอบ)
_PEOPLE_STEPS = {
    "PENDING": "accepted",      # รับออเดอร์ (ยืนยันสลิปค่าอาหาร = ร้านรับออเดอร์)
    "COOKING": "cooking",       # เริ่มทำอาหาร
    "COOKED": "cooked",         # ทำเสร็จ
    "READY": "called",          # เรียกคิว
    "COMPLETED": "handed_over",  # ส่งมอบอาหาร
    "NO_SHOW": "no_show",       # ตัดเป็นไม่มารับ
    "CANCELLED": "cancelled",   # ยกเลิก
}


def order_people(order: Dict, timeline: List[Dict]) -> Dict[str, Dict]:
    """สรุปว่าใครทำขั้นไหนของออเดอร์ จาก OrderStatusLog (เรียงตามเวลาแล้ว)

    - ใช้ครั้งแรกที่เข้าแต่ละสถานะ (เช่นย้อนจากรอยกเลิกกลับมา PENDING อีกรอบ ยังนับคนรับคนแรก)
    - walk-in: คนรับ = พนักงานที่คีย์ออเดอร์ (แถวแรกของ log สร้างออเดอร์เป็น PENDING เลย)
    - ขั้นที่ระบบทำเอง (ChangedByType = SYSTEM) แสดงเป็น "ระบบ"
    """
    people: Dict[str, Dict] = {}
    for step in timeline:
        role = _PEOPLE_STEPS.get(step["NewStatusCode"])
        if not role or role in people:
            continue
        if role == "accepted" and step["OldStatusCode"] is None and not order.get("IsWalkIn"):
            continue  # ออเดอร์ออนไลน์ไม่ได้เริ่มที่ PENDING ; กันข้อมูลแปลกไว้
        people[role] = {
            "UserId": step["ChangedBy"],
            "Name": step["ChangedByName"] if step["ChangedByType"] == "USER" else "ระบบ",
            "RoleCode": step["ChangedByRole"],
            "At": step["CreatedAt"],
            "IsSystem": step["ChangedByType"] == "SYSTEM",
        }
    return people


def in_clause(values: Iterable) -> str:
    return ",".join(["%s"] * len(list(values)))
