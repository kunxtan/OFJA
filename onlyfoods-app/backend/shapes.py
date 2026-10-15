"""SQL ที่ใช้ร่วมกัน + แปลงแถวจาก DB เป็นรูปแบบเดียวกับ API เดิม (frontend ยังอ่านชื่อฟิลด์เดิมได้)"""
from typing import Dict, Iterable, List

from state import legacy_role, legacy_status
from utils import queue_label

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
       s.Description, s.ImageUrl, s.IsOpen, s.IsSuspended, s.AvgPrepMinutes, s.QueueCode,
       s.ContactName, s.ContactPhone, s.ContactLine, s.ContactEmail,
       s.IsDeleted, s.DeletedAt, s.CreatedAt,
       c.StartDate AS ContractStartDate, c.StartDate AS CurrentContractStartDate,
       c.EndDate AS ContractEndDate, c.ContractStatus
FROM Store s
JOIN StoreCategory sc ON sc.StoreCategoryId = s.StoreCategoryId
LEFT JOIN StoreContract c ON c.StoreId = s.StoreId
"""

ORDER_SELECT = """
SELECT o.OrderId AS OrderID, o.OrderId, o.StoreId, o.CustomerId AS UserId, o.CustomerId,
       o.CreatedByStaffId, o.QueueNo, o.TotalAmount, os.StatusCode, os.StatusNameTh,
       o.Note, o.IsWalkIn, o.PickupTime, o.CreatedAt, o.ReadyAt, o.CancelReason, o.CancelDeadline,
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
    return row


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
        SELECT OrderId, PaymentId, PaymentType, Amount, PaymentStatus, SlipImageUrl AS SlipUrl,
               RejectReason, PaidAt, CreatedAt
        FROM Payment WHERE OrderId IN ({placeholders}) ORDER BY PaymentId
        """,
        ids,
    )
    by_order: Dict[int, List[Dict]] = {}
    for p in cur.fetchall():
        p["Amount"] = float(p["Amount"])
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
