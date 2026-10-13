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
       s.Description, s.ImageUrl, s.IsOpen, s.IsSuspended, s.AvgPrepMinutes,
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
       s.StoreName, u.FullName AS CustomerName, u.Username AS UserName,
       u.Phone AS CustomerPhone, u.Email AS CustomerEmail,
       pm.MethodCode AS PaymentMethodCode, pm.MethodNameTh AS PaymentMethod,
       p.PaymentStatus, p.SlipImageUrl AS SlipUrl,
       EXISTS(SELECT 1 FROM Review rv WHERE rv.OrderId = o.OrderId) AS IsReviewed
FROM `Order` o
JOIN OrderStatus os ON os.StatusId = o.StatusId
JOIN Store s ON s.StoreId = o.StoreId
LEFT JOIN `User` u ON u.UserId = o.CustomerId
LEFT JOIN Payment p ON p.PaymentId = (SELECT MAX(p2.PaymentId) FROM Payment p2 WHERE p2.OrderId = o.OrderId)
LEFT JOIN PaymentMethod pm ON pm.MethodId = p.MethodId
"""


def shape_order(row: dict) -> dict:
    row = dict(row)
    row["QueueNo"] = queue_label(row["QueueNo"])
    row["Status"] = legacy_status(row["StatusCode"])
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
    return orders


def in_clause(values: Iterable) -> str:
    return ",".join(["%s"] * len(list(values)))
