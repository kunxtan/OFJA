"""ข้อผิดพลาดเชิงธุรกิจ (ไม่ผูกกับ FastAPI เพื่อให้เทสต์ได้โดยไม่ต้องมี DB)

main.py ลงทะเบียน handler แปลง DomainError -> JSON {"detail": "..."}
"""


class DomainError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def bad_request(detail: str) -> DomainError:
    return DomainError(400, detail)


def forbidden(detail: str = "ไม่มีสิทธิ์ดำเนินการ") -> DomainError:
    return DomainError(403, detail)


def not_found(detail: str) -> DomainError:
    return DomainError(404, detail)


def conflict(detail: str) -> DomainError:
    return DomainError(409, detail)
