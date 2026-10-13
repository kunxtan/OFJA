"""รีวิวร้าน + รายงานปัญหา"""
from fastapi import APIRouter, Depends

import state
from auth import STORE_SCOPED, assert_store_access, get_current_user, require_role
from db import get_db, transaction
from errors import DomainError
from schemas import CreateIssueReportSchema, ReviewCreateSchema
from services import is_duplicate_key, log_audit, send_notif
from utils import clean_text, queue_label, save_image

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


@router.get("/stores/{store_id}/reviews")
def get_store_reviews(store_id: int, db=Depends(get_db)):
    """เปิดสาธารณะ (ลูกค้าดูรีวิวก่อนสั่ง)"""
    with db.cursor() as cur:
        cur.execute("SELECT 1 FROM Store WHERE StoreId = %s", (store_id,))
        if not cur.fetchone():
            raise DomainError(404, "ไม่พบร้านค้านี้")
        cur.execute(
            f"""
            SELECT {_REVIEW_COLS}, u.FullName AS ReviewerName
            FROM Review r JOIN `Order` o ON o.OrderId = r.OrderId
            LEFT JOIN `User` u ON u.UserId = o.CustomerId
            WHERE o.StoreId = %s ORDER BY r.CreatedAt DESC, r.ReviewId DESC
            """,
            (store_id,),
        )
        reviews = cur.fetchall()
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
    avg = round(float(agg["avg_rating"]), 2) if agg.get("avg_rating") is not None else 0.0
    return {
        "reviews": reviews,
        "summary": {
            "total": int(agg.get("total") or 0),
            "average": avg,
            "breakdown": {str(n): int(agg.get(f"star{n}") or 0) for n in (5, 4, 3, 2, 1)},
        },
    }


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
           r.CreatedAt, u.FullName AS CustomerName, s.StoreName, o.QueueNo
    FROM IssueReport r
    JOIN IssueType it ON it.IssueTypeId = r.IssueTypeId
    JOIN `User` u ON u.UserId = r.ReportedBy
    JOIN Store s ON s.StoreId = r.StoreId
    LEFT JOIN `Order` o ON o.OrderId = r.OrderId
"""


def _shape_issues(rows):
    for r in rows:
        r["QueueNo"] = queue_label(r["QueueNo"]) if r.get("QueueNo") is not None else None
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
