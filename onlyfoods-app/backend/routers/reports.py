"""รายงานสรุป + audit log"""
import json
from typing import Optional

from fastapi import APIRouter, Depends, Query

from auth import STORE_SCOPED, require_role
from db import get_db
from errors import DomainError
from shapes import ORDER_SELECT, shape_order

router = APIRouter(prefix="/api", tags=["reports"])

_REPORT_ROLES = ("STORE_OWNER", "FRONT_STAFF", "KITCHEN_STAFF", "EXECUTIVE", "ACCOUNTANT")


def _scope_store(user: dict, store_id: Optional[int]) -> Optional[int]:
    """พนักงาน/เจ้าของร้านดูได้เฉพาะร้านตัวเอง ; ผู้บริหาร/บัญชีเลือกร้านเองได้ (ไม่ระบุ = ทุกร้าน)"""
    if user["RoleCode"] in STORE_SCOPED:
        if user["StoreId"] is None:
            raise DomainError(403, "บัญชีนี้ยังไม่ได้ผูกกับร้านค้า")
        if store_id is not None and int(store_id) != int(user["StoreId"]):
            raise DomainError(403, "ไม่มีสิทธิ์เข้าถึงข้อมูลของร้านอื่น")
        return int(user["StoreId"])
    return store_id


@router.get("/reports/dashboard")
def get_dashboard(store_id: Optional[int] = None, user=Depends(require_role(*_REPORT_ROLES)), db=Depends(get_db)):
    """เฉพาะออเดอร์ที่จบแบบ COMPLETED / NO_SHOW (v_order_net)
    gross_sales = เงินที่รับจริง (ค่าอาหาร + ส่วนต่างที่โอนเพิ่ม) ; net_sales = gross - เงินที่ฝ่ายบัญชีคืนแล้ว
    (ใช้ยอดรับจริง ไม่ใช่ TotalAmount เพราะหลังเปลี่ยนเมนูถูกลง TotalAmount ลดก่อนคืนเงินจริง ทำให้ net > gross)"""
    sid = _scope_store(user, store_id)
    sql = """
        SELECT s.StoreId, s.StoreName, s.IsOpen, s.IsSuspended,
               COUNT(o.OrderId) AS total_orders,
               COALESCE(SUM(COALESCE(n.PaidAmount, o.TotalAmount)), 0) AS gross_sales,
               COALESCE(SUM(COALESCE(n.NetAmount, o.TotalAmount)), 0) AS net_sales
        FROM Store s
        LEFT JOIN `Order` o ON o.StoreId = s.StoreId
             AND o.StatusId IN (SELECT StatusId FROM OrderStatus WHERE StatusCode IN ('COMPLETED', 'NO_SHOW'))
        LEFT JOIN v_order_net n ON n.OrderId = o.OrderId
    """
    params = []
    if sid:
        sql += " WHERE s.StoreId = %s"
        params.append(sid)
    sql += " GROUP BY s.StoreId, s.StoreName, s.IsOpen, s.IsSuspended ORDER BY s.StoreId"
    with db.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


@router.get("/reports/cancellations")
def get_cancellations(store_id: Optional[int] = None, limit: int = Query(500, ge=1, le=2000),
                      user=Depends(require_role(*_REPORT_ROLES)), db=Depends(get_db)):
    sid = _scope_store(user, store_id)
    sql = ORDER_SELECT + " WHERE os.StatusCode = 'CANCELLED'"
    params = []
    if sid:
        sql += " AND o.StoreId = %s"
        params.append(sid)
    sql += " ORDER BY o.OrderId DESC LIMIT %s"
    params.append(limit)
    with db.cursor() as cur:
        cur.execute(sql, params)
        return [shape_order(r) for r in cur.fetchall()]


def _details(entity_type: str, entity_id, new_value, old_value) -> str:
    head = f"{entity_type} {entity_id}" if entity_id else entity_type
    for raw in (new_value, old_value):
        if not raw:
            continue
        try:
            val = json.loads(raw) if isinstance(raw, (str, bytes)) else raw
        except ValueError:
            val = raw
        if isinstance(val, dict) and "detail" in val:
            return str(val["detail"])
        return f"{head} {json.dumps(val, ensure_ascii=False, default=str)}"
    return head


@router.get("/audit-logs")
def get_logs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: Optional[str] = Query(None, max_length=50),
    user=Depends(require_role("EXECUTIVE", "ACCOUNTANT")),
    db=Depends(get_db),
):
    sql = """
        SELECT a.AuditLogId AS LogID, a.AuditLogId, a.ActionCode AS Action, a.EntityType, a.EntityId,
               a.PerformedBy, a.IpAddress, a.CreatedAt, a.OldValue, a.NewValue,
               CASE WHEN u.UserId IS NULL THEN 'ระบบ' ELSE CONCAT(u.FullName, ' (', r.RoleNameTh, ')') END AS PerformerRole
        FROM AuditLog a
        LEFT JOIN `User` u ON u.UserId = a.PerformedBy
        LEFT JOIN Role r ON r.RoleId = u.RoleId
    """
    params = []
    if action:
        sql += " WHERE a.ActionCode = %s"
        params.append(action)
    sql += " ORDER BY a.AuditLogId DESC LIMIT %s OFFSET %s"
    params += [limit, offset]
    with db.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    for r in rows:
        r["Details"] = _details(r["EntityType"], r["EntityId"], r.pop("NewValue"), r.pop("OldValue"))
    return rows
