"""Request body models

หมายเหตุ: ไม่มี user_role / performed_by / user_id ของผู้กระทำอีกแล้ว ตัวตนมาจาก JWT เท่านั้น
ถ้า frontend เก่ายังส่งฟิลด์พวกนี้มา pydantic จะทิ้งโดยไม่ใช้ (extra = ignore)
"""
from typing import List, Optional

from pydantic import BaseModel, Field


class LoginSchema(BaseModel):
    username: str = Field(max_length=50)
    password: str = Field(max_length=200)


class RegisterSchema(BaseModel):
    username: str = Field(max_length=50)
    password: str = Field(max_length=200)
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=1, max_length=20)
    email: Optional[str] = Field(default=None, max_length=100)


class GoogleAuthSchema(BaseModel):
    id_token: str = Field(min_length=20)


class ChangePasswordSchema(BaseModel):
    old_password: str = Field(max_length=200)
    new_password: str = Field(max_length=200)


class AdminResetPasswordSchema(BaseModel):
    new_password: str = Field(max_length=200)


class CompleteProfileSchema(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=1, max_length=20)
    profile_img: Optional[str] = None


class UpdateProfileSchema(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=100)
    fullName: Optional[str] = Field(default=None, max_length=100)
    name: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=20)
    profile_img: Optional[str] = None
    profileImg: Optional[str] = None


class StaffCreateSchema(BaseModel):
    username: str
    password: str
    fullName: str = Field(min_length=1, max_length=100)
    role: str
    phone: Optional[str] = Field(default=None, max_length=30)
    email: Optional[str] = Field(default=None, max_length=100)
    profile_img: Optional[str] = None


class StaffUpdateSchema(BaseModel):
    """None = ไม่แก้ฟิลด์นั้น ; profile_img = "" คือลบรูปออก"""
    fullName: Optional[str] = Field(default=None, max_length=100)
    role: Optional[str] = None
    phone: Optional[str] = Field(default=None, max_length=30)
    email: Optional[str] = Field(default=None, max_length=100)
    profile_img: Optional[str] = None


class StaffActiveSchema(BaseModel):
    is_active: bool


class StaffEraseSchema(BaseModel):
    confirm_username: str = Field(max_length=50)  # ต้องพิมพ์ชื่อผู้ใช้ของพนักงานให้ตรง กันกดลบผิดคน


class AccountCreateSchema(BaseModel):
    username: str
    password: str
    full_name: str = Field(min_length=1, max_length=100)
    role: str
    store_id: int


class AccountUpdateSchema(BaseModel):
    password: Optional[str] = None
    full_name: Optional[str] = Field(default=None, max_length=100)
    role: Optional[str] = None
    store_id: Optional[int] = None


class StoreNameSchema(BaseModel):
    store_name: str = Field(min_length=1, max_length=100)
    queue_code: Optional[str] = Field(default=None, max_length=2)  # ไม่ส่ง = ระบบเลือกตัวอักษรที่ว่างให้


class StoreFullSchema(BaseModel):
    store_name: str = Field(min_length=1, max_length=100)
    category: Optional[str] = None
    contact_name: Optional[str] = Field(default=None, max_length=100)
    contact_phone: Optional[str] = Field(default=None, max_length=20)
    contact_line: Optional[str] = Field(default=None, max_length=50)
    contact_email: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    image_url: Optional[str] = None
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    queue_code: Optional[str] = Field(default=None, max_length=2)
    owner_full_name: Optional[str] = None
    owner_username: Optional[str] = None
    owner_password: Optional[str] = None


class RenewContractSchema(BaseModel):
    contract_start_date: str
    contract_end_date: str


class ProductCreateSchema(BaseModel):
    StoreId: int
    ProductName: str = Field(min_length=1, max_length=100)
    Description: Optional[str] = Field(default=None, max_length=500)
    UnitPrice: float = Field(ge=0, le=99999999)
    IsOutOfStock: Optional[bool] = False
    img: Optional[str] = None


class ProductUpdateSchema(BaseModel):
    ProductName: str = Field(min_length=1, max_length=100)
    # None (ไม่ส่งมา) = คงค่าเดิม ; "" = ลบรายละเอียดออก
    Description: Optional[str] = Field(default=None, max_length=500)
    UnitPrice: float = Field(ge=0, le=99999999)
    img: Optional[str] = None


class NotifyOutStockSchema(BaseModel):
    response_window_minutes: int = Field(ge=1, le=240)


class OrderItemSchema(BaseModel):
    product_id: int
    qty: int = Field(ge=1, le=99)
    item_note: Optional[str] = Field(default="", max_length=255)
    note: Optional[str] = Field(default="", max_length=255)
    # unit_price จาก client ถูกทิ้ง ราคาจริงอ่านจากตาราง Product เสมอ


class CreateOrderSchema(BaseModel):
    store_id: int
    items: List[OrderItemSchema] = Field(min_length=1, max_length=50)
    note: Optional[str] = Field(default="", max_length=500)
    is_walk_in: Optional[bool] = False
    slip_url: Optional[str] = None
    payment_method: Optional[str] = None
    pickup_time: Optional[str] = None


class TopUpSlipSchema(BaseModel):
    slip_url: str = Field(min_length=1)


class VerifySlipSchema(BaseModel):
    approved: bool
    reason: Optional[str] = Field(default="", max_length=255)


class StatusUpdateSchema(BaseModel):
    status: str
    cancel_reason: Optional[str] = Field(default=None, max_length=255)


class CancelRequestSchema(BaseModel):
    reason: str = Field(min_length=1, max_length=255)
    response_window_minutes: int = Field(ge=1, le=240)


class CustomerCancelSchema(BaseModel):
    reason: Optional[str] = Field(default="ลูกค้ายืนยันยกเลิก เนื่องจากเมนูหมด", max_length=255)


class CustomerChangeItemSchema(BaseModel):
    detail_id: Optional[int] = None
    product_id: Optional[int] = None
    new_product_id: int


class PrintRequestSchema(BaseModel):
    print_type: str = "FIRST_PRINT"
    printer: str = Field(default="MOCK_PRINTER_01", max_length=100)


class RecallRequestSchema(BaseModel):
    queue_no: str


class ReviewCreateSchema(BaseModel):
    order_id: int
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default="", max_length=1000)
    image_url: Optional[str] = None


class IssueUpdateSchema(BaseModel):
    status: str = Field(pattern="^(OPEN|IN_PROGRESS|RESOLVED|REJECTED)$")
    note: Optional[str] = Field(default=None, max_length=500)  # ข้อความตอบกลับลูกค้า (IssueReport.AdminNote)


class CreateIssueReportSchema(BaseModel):
    order_id: Optional[int] = None
    store_id: int
    issue_type: str = Field(max_length=100)
    description: Optional[str] = Field(default="", max_length=1000)


class FoodCourtScheduleSchema(BaseModel):
    open_time: str
    close_time: str
