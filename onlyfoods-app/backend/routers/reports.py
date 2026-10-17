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

# ตัวกรองประเภท : ต้องตรงกับ actionMeta ใน ExecutiveView.jsx (เช็คตามลำดับ กลุ่มแรกที่ตรงชนะ)
_AUDIT_GROUPS = (
    ("store", ("STORE", "SUSPEND")),
    ("account", ("ACCOUNT", "USER", "STAFF", "PASSWORD")),
    ("payment", ("SLIP", "PAYMENT")),
    ("order", ("ORDER", "CANCEL", "STATUS", "QUEUE", "PRINT")),
)


def _audit_group_filter(group: str):
    conds, params = [], []
    for name, words in _AUDIT_GROUPS:
        any_word = "(" + " OR ".join(["a.ActionCode LIKE %s"] * len(words)) + ")"
        params += [f"%{w}%" for w in words]
        if name == group:
            conds.append(any_word)
            return conds, params
        conds.append("NOT " + any_word)
    return [], []

@router.get("/audit-logs")
def get_logs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: Optional[str] = Query(None, max_length=50),
    q: Optional[str] = Query(None, max_length=100),
    group: Optional[str] = Query(None, pattern="^(store|account|payment|order)$"),
    actions: Optional[str] = Query(None, max_length=2000),
    user=Depends(require_role("EXECUTIVE", "ACCOUNTANT")),
    db=Depends(get_db),
):
    """ค้นหา/กรองที่ฐานข้อมูล แล้วค่อยแบ่งหน้า (limit/offset) ค้นเจอทั้งตาราง ไม่ใช่แค่หน้าที่โหลดมาแล้ว"""
    sql = """
        SELECT a.AuditLogId AS LogID, a.AuditLogId, a.ActionCode AS Action, a.EntityType, a.EntityId,
               a.PerformedBy, a.IpAddress, a.CreatedAt, a.OldValue, a.NewValue,
               CASE WHEN u.UserId IS NULL THEN 'ระบบ' ELSE CONCAT(u.FullName, ' (', r.RoleNameTh, ')') END AS PerformerRole
        FROM AuditLog a
        LEFT JOIN `User` u ON u.UserId = a.PerformedBy
        LEFT JOIN Role r ON r.RoleId = u.RoleId
        LEFT JOIN Payment ap ON a.EntityType = 'Payment' AND ap.PaymentId = a.EntityId
        LEFT JOIN `Order` ao ON ao.OrderId = COALESCE(IF(a.EntityType = 'Order', a.EntityId, NULL), ap.OrderId)
        LEFT JOIN Store ast ON ast.StoreId = COALESCE(ao.StoreId, IF(a.EntityType = 'Store', a.EntityId, NULL))
    """
    where, params = [], []
    if action:
        where.append("a.ActionCode = %s")
        params.append(action)
    if group:
        conds, group_params = _audit_group_filter(group)
        where += conds
        params += group_params
    keyword = (q or "").strip().lower()
    if keyword:
        like = "%" + keyword.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        search = [
            "LOWER(REPLACE(a.ActionCode, '_', ' ')) LIKE %s",
            "LOWER(a.ActionCode) LIKE %s",
            "a.EntityId = %s",
            "LOWER(CAST(a.NewValue AS CHAR)) LIKE %s",
            "LOWER(CAST(a.OldValue AS CHAR)) LIKE %s",
            "LOWER(u.FullName) LIKE %s",
            "LOWER(u.Username) LIKE %s",
            "r.RoleNameTh LIKE %s",
            "LOWER(ast.StoreName) LIKE %s",
            "LOWER(CONCAT(ast.QueueCode, LPAD(ao.QueueNo, 3, '0'))) LIKE %s"
        ]
        search_params = [like, like, keyword.lstrip("#"), like, like, like, like, like, like, like]
        codes = [c for c in (actions or "").upper().split(",") if c and len(c) <= 50 and c.replace("_", "").isalpha()][:50]
        if codes:
            search.append(f"a.ActionCode IN ({','.join(['%s'] * len(codes))})")
            search_params += codes
        where.append("(" + " OR ".join(search) + ")")
        params += search_params
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY a.AuditLogId DESC LIMIT %s OFFSET %s"
    params += [limit, offset]
    with db.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    # Enrich audit history without changing the original append-only AuditLog.
    order_ids, payment_ids, store_ids = set(), set(), set()
    for r in rows:
        payload = {}
        for field in ("NewValue", "OldValue"):
            raw = r.get(field)
            try:
                value = json.loads(raw) if isinstance(raw, (str, bytes)) else raw
            except (ValueError, TypeError):
                value = None
            if isinstance(value, dict):
                payload.update(value)
        r["AuditPayload"] = payload
        kind, entity_id = str(r.get("EntityType") or "").lower(), r.get("EntityId")
        if str(entity_id or "").isdigit():
            if kind == "order": order_ids.add(int(entity_id))
            elif kind == "payment": payment_ids.add(int(entity_id))
            elif kind == "store": store_ids.add(int(entity_id))
        for key in ("order_id", "OrderId", "OrderID"):
            if str(payload.get(key) or "").isdigit(): order_ids.add(int(payload[key]))
        for key in ("store_id", "StoreId"):
            if str(payload.get(key) or "").isdigit(): store_ids.add(int(payload[key]))

    with db.cursor() as cur:
        payment_orders = {}
        if payment_ids:
            ids = sorted(payment_ids)
            cur.execute(f"SELECT PaymentId, OrderId FROM Payment WHERE PaymentId IN ({','.join(['%s'] * len(ids))})", ids)
            payment_orders = {int(x["PaymentId"]): int(x["OrderId"]) for x in cur.fetchall()}
            order_ids.update(payment_orders.values())

        orders = {}
        if order_ids:
            ids = sorted(order_ids)
            cur.execute(f"""SELECT o.OrderId, o.StoreId, o.QueueNo, s.StoreName, s.QueueCode
                            FROM `Order` o LEFT JOIN Store s ON s.StoreId = o.StoreId
                            WHERE o.OrderId IN ({','.join(['%s'] * len(ids))})""", ids)
            orders = {int(x["OrderId"]): x for x in cur.fetchall()}

        store_ids.update(int(o["StoreId"]) for o in orders.values() if o.get("StoreId") is not None)
        stores = {}
        if store_ids:
            ids = sorted(store_ids)
            cur.execute(f"""SELECT StoreId, StoreName, QueueCode FROM Store
                            WHERE StoreId IN ({','.join(['%s'] * len(ids))})""", ids)
            stores = {int(x["StoreId"]): x for x in cur.fetchall()}

    for r in rows:
        payload = r.pop("AuditPayload")
        kind, entity_id = str(r.get("EntityType") or "").lower(), r.get("EntityId")
        oid = int(entity_id) if kind == "order" and str(entity_id or "").isdigit() else None
        if kind == "payment" and str(entity_id or "").isdigit():
            oid = payment_orders.get(int(entity_id))
        if oid is None:
            for key in ("order_id", "OrderId", "OrderID"):
                if str(payload.get(key) or "").isdigit():
                    oid = int(payload[key])
                    break

        order = orders.get(oid) if oid is not None else None
        sid = order.get("StoreId") if order else None
        if sid is None and kind == "store" and str(entity_id or "").isdigit():
            sid = int(entity_id)
        if sid is None:
            for key in ("store_id", "StoreId"):
                if str(payload.get(key) or "").isdigit():
                    sid = int(payload[key])
                    break

        store = stores.get(int(sid)) if sid is not None else None
        r["OrderId"], r["StoreId"] = oid, sid
        r["StoreName"] = store.get("StoreName") if store else (order.get("StoreName") if order else None)
        queue = order.get("QueueNo") if order else None
        prefix = (store or order or {}).get("QueueCode")
        r["QueueLabel"] = f"{prefix}{int(queue):03d}" if prefix and queue is not None else (str(queue) if queue is not None else payload.get("queue"))
        r["Details"] = _details(r["EntityType"], entity_id, r.pop("NewValue"), r.pop("OldValue"))

    return rows
