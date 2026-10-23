"""Request body models

หมายเหตุ: ไม่มี user_role / performed_by / user_id ของผู้กระทำอีกแล้ว ตัวตนมาจาก JWT เท่านั้น
ถ้า frontend เก่ายังส่งฟิลด์พวกนี้มา pydantic จะทิ้งโดยไม่ใช้ (extra = ignore)
"""
from decimal import Decimal
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
    # อีเมลนี้มีบัญชีที่ใช้รหัสผ่านอยู่แล้ว แต่ไม่ใช่ของเรา (หรือจำรหัสไม่ได้) -> สร้างบัญชี Google แยกใหม่
    create_new: bool = False


class GoogleLinkSchema(BaseModel):
    """ผูก Google กับบัญชีเดิมที่ใช้อีเมลเดียวกัน : ต้องพิสูจน์ว่าเป็นเจ้าของบัญชีด้วยรหัสผ่านเดิม"""
    id_token: str = Field(min_length=20)
    password: str = Field(min_length=1, max_length=200)


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


class ContractEndUpdateSchema(BaseModel):
    """แก้วันสิ้นสุดสัญญา (เฉพาะร้านที่สัญญายังไม่หมด) ต้องมีเหตุผลทุกครั้ง"""
    contract_end_date: str
    reason: str = Field(min_length=1, max_length=255)


class ContractRestartSchema(BaseModel):
    """ร้านหมดสัญญา/ยังไม่มีสัญญา -> เปิดสัญญารอบใหม่ ; ไม่ส่งวันเริ่ม = วันนี้ ; ไม่ส่งวันสิ้นสุด = 1 ปี"""
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    reason: str = Field(min_length=1, max_length=255)


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
    # เวลาที่ให้ลูกค้าตอบใช้ config.OUT_OF_STOCK_RESPONSE_MINUTES เสมอ (client เดิมยังส่งมา ไม่ใช้แล้ว)
    response_window_minutes: Optional[int] = None


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
    # walk-in จ่ายเงินสด: เงินที่รับจากลูกค้า (server คำนวณเงินทอนเอง)
    cash_received: Optional[Decimal] = Field(default=None, ge=0, le=100000, decimal_places=2)
    # M5: ยอดที่ลูกค้า/พนักงานเห็นบนหน้าจอตอนกดจ่าย ไม่ตรงกับราคาจริงตอนนี้ = 409 ให้ยืนยันยอดใหม่ (ไม่ส่ง = ไม่เทียบ)
    expected_total: Optional[Decimal] = Field(default=None, ge=0, le=1000000, decimal_places=2)
    # M6: รหัสสุ่มประจำการกดจ่ายแต่ละครั้ง (หรือส่งใน header Idempotency-Key) ส่งซ้ำ = ได้ออเดอร์เดิมกลับ
    client_request_id: Optional[str] = Field(default=None, pattern=r"^[A-Za-z0-9-]{8,64}$")


class QuoteOrderSchema(BaseModel):
    """ถามราคาจริงก่อนแสดง QR ให้ลูกค้าโอน (ไม่สร้างออเดอร์)"""
    store_id: int
    items: List[OrderItemSchema] = Field(min_length=1, max_length=50)


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
    response_window_minutes: Optional[int] = None  # ไม่ใช้แล้ว ดู NotifyOutStockSchema
    # แจ้งของหมดจากหน้าคิว: จานที่หมด (OrderItemId) -> ลูกค้าเห็นว่าต้องเปลี่ยนจานไหน
    item_ids: Optional[List[int]] = Field(default=None, max_length=50)
    close_menu: bool = False  # ปิดเมนูของจานที่เลือกในร้านด้วย (คนอื่นสั่งไม่ได้)


class CustomerCancelSchema(BaseModel):
    reason: Optional[str] = Field(default="ลูกค้ายืนยันยกเลิก เนื่องจากเมนูหมด", max_length=255)


class CustomerChangeItemSchema(BaseModel):
    detail_id: Optional[int] = None
    product_id: Optional[int] = None
    new_product_id: int


class PrintSkipSchema(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=200)


class PrintRequestSchema(BaseModel):
    print_type: str = "FIRST_PRINT"
    printer: str = Field(default="MOCK_PRINTER_01", max_length=100)


class ReviewCreateSchema(BaseModel):
    order_id: int
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default="", max_length=1000)
    image_url: Optional[str] = None


class IssueUpdateSchema(BaseModel):
    status: str = Field(pattern="^(OPEN|IN_PROGRESS|RESOLVED|REJECTED)$")
    note: Optional[str] = Field(default=None, max_length=500)  # ข้อความตอบกลับลูกค้า (IssueReport.AdminNote)


class CreateIssueReportSchema(BaseModel):
    order_id: Optional[int] = Field(default=None, ge=1)  # 0 เคยทำให้ INSERT ชน FK แล้วได้ 500
    store_id: int
    issue_type: str = Field(max_length=100)
    description: Optional[str] = Field(default="", max_length=1000)


class FoodCourtScheduleSchema(BaseModel):
    open_time: str
    close_time: str


class StoreScheduleSchema(BaseModel):
    # ไม่ส่งทั้งคู่ = ใช้เวลาของศูนย์อาหาร ; ส่ง = ต้องอยู่ในเวลาศูนย์อาหาร (ตรวจใน endpoint)
    open_time: Optional[str] = None
    close_time: Optional[str] = None


class LatePickupSchema(BaseModel):
    minutes: int  # ต้องเป็นค่าใน config.LATE_PICKUP_CHOICES (ตรวจใน endpoint)


class RefundPayoutSchema(BaseModel):
    """ลูกค้าระบุบัญชีรับเงินคืน : โอนคืนเท่านั้น (CASH รับไว้เพื่อตอบข้อความที่อ่านเข้าใจ แทน 422)"""
    method: str = Field(default="TRANSFER", pattern="^(CASH|TRANSFER)$")
    kind: Optional[str] = Field(default=None, max_length=10)
    bank: Optional[str] = Field(default=None, max_length=60)
    account_no: Optional[str] = Field(default=None, max_length=30)
    account_name: Optional[str] = Field(default=None, max_length=100)
    qr_image: Optional[str] = None   # รูปใหม่ (data URL) ; ไม่ส่ง = ใช้ QR เดิม
    remove_qr: bool = False


class RefundSlipCheckSchema(BaseModel):
    """ตรวจสลิปของออเดอร์ที่ถูกบังคับยกเลิกก่อนร้านตรวจ : ผ่าน = คืนเงินต่อได้ ; ไม่ผ่าน = ไม่ต้องคืน"""
    approved: bool
    reason: Optional[str] = Field(default="", max_length=255)


class RefundDoneSchema(BaseModel):
    """ร้านจ่ายเงินคืนแล้ว : CASH (walk-in) หรือ TRANSFER (ออนไลน์ ต้องแนบสลิปโอน)"""
    method: str = Field(default="CASH", pattern="^(CASH|TRANSFER)$")
    slip_image: Optional[str] = None
