"""รีวิวร้าน + รายงานปัญหา"""
import hashlib
from datetime import timedelta

from fastapi import APIRouter, Depends

import config
import state
from auth import STORE_SCOPED, assert_store_access, get_current_user, require_role
from db import get_db, transaction
from errors import DomainError
from schemas import CreateIssueReportSchema, ReviewCreateSchema
from services import is_duplicate_key, log_audit, send_notif
from shapes import in_clause
from utils import bangkok_now, clean_text, mask_person_name, queue_label, save_image

router = APIRouter(prefix="/api", tags=["feedback"])


# ------------------------------------------------------------------ reviews
@router.post("/reviews")
def create_review(data: ReviewCreateSchema, user=Depends(require_role("CUSTOMER")), db=Depends(get_db)):
    image = save_image(data.image_url, "reviews") if data.image_url else None
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT o.CustomerId, os.StatusCode FROM `Order` o JOIN OrderStatus os ON os.StatusId = o.StatusId
                WHERE o.OrderId = %s
                """,
                (data.order_id,),
            )
            order = cur.fetchone()
            if not order:
                raise DomainError(404, "ไม่พบคำสั่งซื้อนี้")
            if order["CustomerId"] != user["UserId"]:
                raise DomainError(403, "คุณไม่มีสิทธิ์รีวิวออเดอร์นี้")
            if order["StatusCode"] != state.COMPLETED:
                raise DomainError(400, "รีวิวได้เฉพาะออเดอร์ที่รับอาหารเรียบร้อยแล้ว")
            try:
                cur.execute(
                    "INSERT INTO Review (OrderId, Rating, Comment, ImageUrl) VALUES (%s, %s, %s, %s)",
                    (data.order_id, data.rating, clean_text(data.comment), image),
                )
            except Exception as exc:  # noqa: BLE001
                if is_duplicate_key(exc):
                    raise DomainError(400, "ออเดอร์นี้ได้รับการรีวิวแล้ว")
                raise
    return {"success": True}


_REVIEW_COLS = """
    r.ReviewId, r.OrderId AS OrderID, o.StoreId, o.CustomerId AS UserId, r.Rating, r.Comment,
    r.ImageUrl, r.CreatedAt
"""


def _rating_summary(cur, store_id: int) -> dict:
    cur.execute(
        """
        SELECT COUNT(*) AS total, AVG(r.Rating) AS avg_rating,
               SUM(r.Rating = 5) AS star5, SUM(r.Rating = 4) AS star4, SUM(r.Rating = 3) AS star3,
               SUM(r.Rating = 2) AS star2, SUM(r.Rating = 1) AS star1
        FROM Review r JOIN `Order` o ON o.OrderId = r.OrderId WHERE o.StoreId = %s
        """,
        (store_id,),
    )
    agg = cur.fetchone() or {}
    return {
        "total": int(agg.get("total") or 0),
        "average": round(float(agg["avg_rating"]), 2) if agg.get("avg_rating") is not None else 0.0,
        "breakdown": {str(n): int(agg.get(f"star{n}") or 0) for n in (5, 4, 3, 2, 1)},
    }


@router.get("/stores/{store_id}/reviews")
def get_store_reviews(store_id: int, db=Depends(get_db)):
    """เปิดสาธารณะ (ลูกค้าดูรีวิวก่อนสั่ง) : ชื่อคนรีวิวแบบย่อ และไม่ส่งรหัสลูกค้า/เลขออเดอร์ออกไป
    (เดิมส่งชื่อจริงเต็ม + UserId ให้ใครก็ได้โดยไม่ต้องล็อกอิน)"""
    with db.cursor() as cur:
        cur.execute("SELECT 1 FROM Store WHERE StoreId = %s", (store_id,))
        if not cur.fetchone():
            raise DomainError(404, "ไม่พบร้านค้านี้")
        cur.execute(
            """
            SELECT r.ReviewId, o.StoreId, r.Rating, r.Comment, r.ImageUrl, r.CreatedAt, u.FullName
            FROM Review r JOIN `Order` o ON o.OrderId = r.OrderId
            LEFT JOIN `User` u ON u.UserId = o.CustomerId
            WHERE o.StoreId = %s ORDER BY r.CreatedAt DESC, r.ReviewId DESC
            """,
            (store_id,),
        )
        reviews = cur.fetchall()
        summary = _rating_summary(cur, store_id)
    for r in reviews:
        r["ReviewerName"] = mask_person_name(r.pop("FullName"))
    return {"reviews": reviews, "summary": summary}


def _reviewer_key(store_id: int, customer_id) -> str:
    """รหัสนิรนามของลูกค้า (คงที่ภายในร้านเดียว) : รู้ว่ารีวิวหลายอันมาจากคนเดียวกันได้ โดยไม่เห็นตัวตน"""
    raw = f"{config.JWT_SECRET}:{store_id}:{customer_id}".encode()
    return hashlib.sha256(raw).hexdigest()[:8]


@router.get("/stores/{store_id}/reviews/detail")
def get_store_reviews_detail(store_id: int, user=Depends(require_role("STORE_OWNER", "EXECUTIVE")),
                             db=Depends(get_db)):
    """รีวิวแบบละเอียดสำหรับเจ้าของร้าน: เมนูที่สั่ง, คิว, ยอด, ลูกค้าเคยสั่งร้านนี้กี่ครั้ง, สถิติ, คะแนนรายเมนู

    ความเป็นส่วนตัวของคนรีวิว: ชื่อแบบย่อเท่านั้น, ไม่มีเบอร์/อีเมล/UserId ; ใช้รหัสนิรนาม (ReviewerKey) แทน
    """
    if user["RoleCode"] in STORE_SCOPED:
        assert_store_access(user, store_id)
    now = bangkok_now()
    with db.cursor() as cur:
        cur.execute("SELECT QueueCode FROM Store WHERE StoreId = %s", (store_id,))
        store = cur.fetchone()
        if not store:
            raise DomainError(404, "ไม่พบร้านค้านี้")
        cur.execute(
            """
            SELECT r.ReviewId, r.Rating, r.Comment, r.ImageUrl, r.CreatedAt,
                   o.OrderId, o.QueueNo, o.TotalAmount, o.CreatedAt AS OrderedAt, o.CustomerId, u.FullName,
                   (SELECT COUNT(*) FROM `Order` o2 JOIN OrderStatus os2 ON os2.StatusId = o2.StatusId
                     WHERE o2.StoreId = o.StoreId AND o2.CustomerId = o.CustomerId
                       AND os2.StatusCode IN ('COMPLETED', 'NO_SHOW')) AS Visits
            FROM Review r JOIN `Order` o ON o.OrderId = r.OrderId
            LEFT JOIN `User` u ON u.UserId = o.CustomerId
            WHERE o.StoreId = %s ORDER BY r.CreatedAt DESC, r.ReviewId DESC
            """,
            (store_id,),
        )
        rows = cur.fetchall()
        items_by_order = {}
        if rows:
            ids = [r["OrderId"] for r in rows]
            cur.execute(
                f"""
                SELECT oi.OrderId, oi.ProductId, p.ProductName, p.ImageUrl, oi.Qty
                FROM OrderItem oi JOIN Product p ON p.ProductId = oi.ProductId
                WHERE oi.OrderId IN ({in_clause(ids)}) AND oi.ItemStatus <> 'REPLACED'
                ORDER BY oi.OrderItemId
                """,
                ids,
            )
            for it in cur.fetchall():
                items_by_order.setdefault(it.pop("OrderId"), []).append(it)
        summary = _rating_summary(cur, store_id)

    reviews, per_reviewer, menu = [], {}, {}
    for r in rows:
        key = _reviewer_key(store_id, r["CustomerId"])
        per_reviewer[key] = per_reviewer.get(key, 0) + 1
        items = items_by_order.get(r["OrderId"], [])
        for it in items:
            m = menu.setdefault(it["ProductId"], {"ProductId": it["ProductId"], "ProductName": it["ProductName"],
                                                  "ImageUrl": it["ImageUrl"], "count": 0, "sum": 0})
            m["count"] += 1
            m["sum"] += r["Rating"]
        reviews.append({
            "ReviewId": r["ReviewId"], "Rating": r["Rating"], "Comment": r["Comment"], "ImageUrl": r["ImageUrl"],
            "CreatedAt": r["CreatedAt"], "ReviewerName": mask_person_name(r["FullName"]), "ReviewerKey": key,
            "Visits": int(r["Visits"] or 0), "OrderId": r["OrderId"],
            "QueueNo": queue_label(r["QueueNo"], store["QueueCode"]), "OrderedAt": r["OrderedAt"],
            "TotalAmount": float(r["TotalAmount"] or 0), "items": items,
        })
    for rv in reviews:
        rv["ReviewerReviewCount"] = per_reviewer[rv["ReviewerKey"]]

    def window_avg(start_days: int, end_days: int):
        hit = [rv["Rating"] for rv in reviews if now - timedelta(days=start_days) <= rv["CreatedAt"] < now - timedelta(days=end_days)]
        return {"count": len(hit), "average": round(sum(hit) / len(hit), 2) if hit else None}

    summary.update({
        "with_comment": sum(1 for rv in reviews if (rv["Comment"] or "").strip()),
        "with_photo": sum(1 for rv in reviews if rv["ImageUrl"]),
        "positive": sum(1 for rv in reviews if rv["Rating"] >= 4),
        "last30": window_avg(30, 0),
        "prev30": window_avg(60, 30),
    })
    menu_rows = sorted(
        ({**{k: v for k, v in m.items() if k != "sum"}, "average": round(m["sum"] / m["count"], 2)} for m in menu.values()),
        key=lambda m: (-m["count"], -m["average"]),
    )
    return {"reviews": reviews, "summary": summary, "menu": menu_rows}


@router.get("/executive/customers/{user_id}/reviews")
def get_customer_reviews(user_id: int, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute(
            f"""
            SELECT {_REVIEW_COLS}, s.StoreName
            FROM Review r JOIN `Order` o ON o.OrderId = r.OrderId JOIN Store s ON s.StoreId = o.StoreId
            WHERE o.CustomerId = %s ORDER BY r.CreatedAt DESC, r.ReviewId DESC
            """,
            (user_id,),
        )
        return cur.fetchall()


# ------------------------------------------------------------------- issues
_ISSUE_SELECT = """
    SELECT r.IssueReportId AS ReportID, r.IssueReportId, r.ReportedBy AS UserId, r.OrderId AS OrderID,
           r.StoreId, it.TypeNameTh AS IssueType, it.TypeCode, r.Description, r.IssueStatus, r.AdminNote,
           r.CreatedAt, u.FullName AS CustomerName, s.StoreName, s.QueueCode, o.QueueNo
    FROM IssueReport r
    JOIN IssueType it ON it.IssueTypeId = r.IssueTypeId
    JOIN `User` u ON u.UserId = r.ReportedBy
    JOIN Store s ON s.StoreId = r.StoreId
    LEFT JOIN `Order` o ON o.OrderId = r.OrderId
"""


def _shape_issues(rows):
    for r in rows:
        code = r.pop("QueueCode", "")
        r["QueueNo"] = queue_label(r["QueueNo"], code) if r.get("QueueNo") is not None else None
    return rows


@router.post("/reports/issue", status_code=201)
def create_issue_report(data: CreateIssueReportSchema, user=Depends(require_role("CUSTOMER")), db=Depends(get_db)):
    description = clean_text(data.description) or ""
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT 1 FROM Store WHERE StoreId = %s AND IsDeleted = FALSE", (data.store_id,))
            if not cur.fetchone():
                raise DomainError(404, "ไม่พบร้านค้านี้")
            if data.order_id:
                cur.execute("SELECT CustomerId, StoreId FROM `Order` WHERE OrderId = %s", (data.order_id,))
                order = cur.fetchone()
                if not order or order["CustomerId"] != user["UserId"] or order["StoreId"] != data.store_id:
                    raise DomainError(403, "ออเดอร์นี้ไม่ใช่ของคุณหรือไม่ตรงกับร้านที่แจ้ง")
            cur.execute(
                "SELECT IssueTypeId FROM IssueType WHERE (TypeNameTh = %s OR TypeCode = %s) AND IsActive = TRUE ORDER BY IssueTypeId LIMIT 1",
                (data.issue_type.strip(), data.issue_type.strip()),
            )
            itype = cur.fetchone()
            if not itype:  # ประเภทที่ไม่รู้จัก -> OTHER แต่ไม่ทิ้งข้อความเดิม
                cur.execute("SELECT IssueTypeId FROM IssueType WHERE TypeCode = 'OTHER'")
                itype = cur.fetchone()
                description = f"[{data.issue_type.strip()}] {description}".strip()
            if not description:
                raise DomainError(400, "กรุณาอธิบายรายละเอียดปัญหา")
            cur.execute(
                "INSERT INTO IssueReport (ReportedBy, StoreId, OrderId, IssueTypeId, Description) VALUES (%s, %s, %s, %s, %s)",
                (user["UserId"], data.store_id, data.order_id, itype["IssueTypeId"], description[:1000]),
            )
            report_id = cur.lastrowid
            cur.execute(
                """
                SELECT u.UserId FROM `User` u JOIN Role r ON r.RoleId = u.RoleId
                WHERE u.StoreId = %s AND r.RoleCode = 'STORE_OWNER' AND u.IsActive = TRUE
                """,
                (data.store_id,),
            )
            for owner in cur.fetchall():
                send_notif(db, owner["UserId"], "ISSUE", "มีรายงานปัญหาใหม่", "ลูกค้าส่งรายงานปัญหาเกี่ยวกับร้านของคุณ", data.order_id)
        log_audit(db, user["UserId"], "CREATE_ISSUE", "IssueReport", report_id, None, {"store_id": data.store_id})
    return {"success": True, "report_id": report_id, "message": "ส่งรายงานปัญหาเรียบร้อยแล้ว"}


@router.get("/reports/issue/store/{store_id}")
def get_store_issue_reports(store_id: int, user=Depends(require_role("STORE_OWNER", "EXECUTIVE", "ACCOUNTANT")),
                            db=Depends(get_db)):
    if user["RoleCode"] in STORE_SCOPED:
        assert_store_access(user, store_id)
    with db.cursor() as cur:
        cur.execute(_ISSUE_SELECT + " WHERE r.StoreId = %s ORDER BY r.CreatedAt DESC, r.IssueReportId DESC", (store_id,))
        return _shape_issues(cur.fetchall())


@router.get("/reports/issue/user/{user_id}")
def get_user_issue_reports(user_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    if user["UserId"] != user_id and user["RoleCode"] != "EXECUTIVE":
        raise DomainError(403, "ไม่มีสิทธิ์ดูรายงานของผู้ใช้นี้")
    with db.cursor() as cur:
        cur.execute(_ISSUE_SELECT + " WHERE r.ReportedBy = %s ORDER BY r.CreatedAt DESC, r.IssueReportId DESC", (user_id,))
        return _shape_issues(cur.fetchall())


@router.get("/executive/customers/{user_id}/issues")
def get_customer_issues(user_id: int, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    with db.cursor() as cur:
        cur.execute(_ISSUE_SELECT + " WHERE r.ReportedBy = %s ORDER BY r.CreatedAt DESC, r.IssueReportId DESC", (user_id,))
        return _shape_issues(cur.fetchall())
