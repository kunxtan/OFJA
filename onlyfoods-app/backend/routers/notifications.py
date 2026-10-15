"""การแจ้งเตือนของผู้ใช้ + แจ้งเตือนสัญญาใกล้หมดอายุของผู้บริหาร"""
from fastapi import APIRouter, Depends

from auth import get_current_user, require_role
from db import get_db, transaction
from errors import DomainError

router = APIRouter(prefix="/api", tags=["notifications"])

_NOTIF_COLS = """
    NotificationId AS NotifId, NotificationId, UserId, OrderId, NotificationType, Title, Message, IsRead, CreatedAt
"""


@router.get("/notifications/{user_id}")
def get_notifs(user_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    if user["UserId"] != user_id:
        raise DomainError(403, "ดูได้เฉพาะการแจ้งเตือนของตัวเอง")
    with db.cursor() as cur:
        cur.execute(
            f"SELECT {_NOTIF_COLS} FROM Notification WHERE UserId = %s ORDER BY NotificationId DESC LIMIT 15",
            (user_id,),
        )
        return cur.fetchall()


@router.put("/notifications/{notif_id}/read")
def mark_notification_read(notif_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("SELECT 1 FROM Notification WHERE NotificationId = %s AND UserId = %s",
                        (notif_id, user["UserId"]))
            if not cur.fetchone():
                raise DomainError(404, "ไม่พบการแจ้งเตือนนี้")
            cur.execute("UPDATE Notification SET IsRead = TRUE WHERE NotificationId = %s", (notif_id,))
    return {"success": True}


@router.put("/notifications/{user_id}/read-all")
def mark_all_notifications_read(user_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    if user["UserId"] != user_id:
        raise DomainError(403, "ทำได้เฉพาะการแจ้งเตือนของตัวเอง")
    with transaction(db):
        with db.cursor() as cur:
            cur.execute("UPDATE Notification SET IsRead = TRUE WHERE UserId = %s AND IsRead = FALSE", (user_id,))
            updated = cur.rowcount
    return {"success": True, "updated": updated}


@router.get("/executive/contract-notifications/{user_id}")
def get_executive_contract_notifications(user_id: int, user=Depends(require_role("EXECUTIVE")), db=Depends(get_db)):
    if user["UserId"] != user_id:
        raise DomainError(403, "ดูได้เฉพาะการแจ้งเตือนของตัวเอง")
    with transaction(db):
        with db.cursor() as cur:
            cur.execute(
                """
                SELECT c.StoreId, s.StoreName, c.EndDate, DATEDIFF(c.EndDate, CURDATE()) AS DaysLeft
                FROM StoreContract c JOIN Store s ON s.StoreId = c.StoreId
                WHERE s.IsDeleted = FALSE AND c.EndDate <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
                """
            )
            contracts = cur.fetchall()
            store_by_title = {}
            for c in contracts:
                # Title ใช้เป็นคีย์กันแจ้งซ้ำ: 1 สัญญา (ตามวันสิ้นสุด) แจ้งผู้บริหาร 1 ครั้ง
                title = f"สัญญา {c['StoreName']} (สิ้นสุด {c['EndDate']})"[:150]
                store_by_title[title] = c["StoreId"]
                cur.execute(
                    "SELECT 1 FROM Notification WHERE UserId = %s AND NotificationType = 'CONTRACT' AND Title = %s LIMIT 1",
                    (user_id, title),
                )
                if cur.fetchone():
                    continue
                days = c["DaysLeft"]
                if days < 0:
                    msg = f"สัญญาร้าน {c['StoreName']} หมดอายุแล้ว"
                elif days == 0:
                    msg = f"สัญญาร้าน {c['StoreName']} หมดอายุวันนี้"
                else:
                    msg = f"สัญญาร้าน {c['StoreName']} ใกล้หมดอายุ (เหลือ {days} วัน)"
                cur.execute(
                    "INSERT INTO Notification (UserId, NotificationType, Title, Message) VALUES (%s, 'CONTRACT', %s, %s)",
                    (user_id, title, msg),
                )
            cur.execute(
                f"SELECT {_NOTIF_COLS} FROM Notification WHERE UserId = %s AND NotificationType = 'CONTRACT' "
                "ORDER BY NotificationId DESC LIMIT 15",
                (user_id,),
            )
            rows = cur.fetchall()
    for r in rows:
        r["EventType"] = "CONTRACT"
        r["StoreId"] = store_by_title.get(r["Title"])
    return rows
