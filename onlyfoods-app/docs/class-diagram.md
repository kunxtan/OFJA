# Class Diagram — Only Foods (OFJA)

อิงจาก `database/init.sql` (ตารางจริงในระบบ) ; แสดงเฉพาะ attribute หลัก ไม่ใส่ timestamp/ฟิลด์ช่วยทางเทคนิค
User ทุกบทบาทอยู่ตารางเดียว (`User.RoleId`) แสดงเป็น generalization เพื่อให้เห็นว่าแต่ละบทบาททำอะไรได้

## 0) ภาพรวม (ระดับกลุ่มคลาส)

แต่ละกล่องคือกลุ่มคลาสที่แยกรายละเอียดไว้ในหัวข้อ 1–4 ; ลูกศรบอกว่ากลุ่มไหนอ้างอิงกลุ่มไหน

```mermaid
classDiagram
direction LR

class Users["1) ผู้ใช้และสิทธิ์"] {
  User, Role
  Customer, FrontStaff, KitchenStaff
  StoreOwner, Accountant, Executive
}
class StoreMenu["2) ศูนย์อาหาร ร้าน เมนู"] {
  FoodCourt, Store, StoreCategory
  StoreContract
  ProductCategory, Product
}
class Orders["3) คำสั่งซื้อและการเงิน"] {
  Order, OrderItem, OrderStatusLog
  Payment, Refund, PrintJob, Review
}
class Support["4) สนับสนุนและตรวจสอบ"] {
  IssueReport, Notification
  AuditLog, MonthlyStoreSummary
  LoginThrottle
}

Users --> StoreMenu : พนักงาน/เจ้าของสังกัดร้าน
Orders --> StoreMenu : สั่งจากร้าน ระบุเมนู
Orders --> Users : ลูกค้า / ผู้ตรวจสลิป / ผู้คืนเงิน
Support --> Users : ผู้แจ้ง ผู้จัดการ ผู้กระทำ
Support --> StoreMenu : ปัญหาและสรุปยอดรายร้าน
Support --> Orders : ข้อร้องเรียนและแจ้งเตือนของออเดอร์
```

## 1) ผู้ใช้และสิทธิ์

```mermaid
classDiagram
direction TB

class User {
  +int UserId
  +string Username
  +string FullName
  +string Phone
  +string Email
  +bool IsActive
  +int FailedLoginCount
  +datetime LockedUntil
  +login()
  +changePassword()
}
class Customer {
  +placeOrder()
  +cancelOrder()
  +notifyLatePickup()
  +chooseRefundPayout()
  +writeReview()
  +reportIssue()
}
class FrontStaff {
  +verifySlip()
  +createWalkInOrder()
  +printTicket()
  +markDelivered()
  +markNoShow()
  +refundCash()
}
class KitchenStaff {
  +startCooking()
  +markCooked()
  +reportOutOfStock()
}
class StoreOwner {
  +manageMenu()
  +toggleStore()
  +manageStaff()
  +refundTransfer()
  +viewStoreSales()
}
class Accountant {
  +viewMonthlySummary()
  +viewCancelRate()
  +exportReport()
  +viewRefunds()
}
class Executive {
  +manageStore()
  +manageContract()
  +toggleFoodCourt()
  +handleIssue()
  +resetPassword()
  +viewAuditLog()
}
class Role {
  +string RoleCode
  +string RoleNameTh
  +bool RequiresStore
}

User <|-- Customer
User <|-- FrontStaff
User <|-- KitchenStaff
User <|-- StoreOwner
User <|-- Accountant
User <|-- Executive
User "*" --> "1" Role
User "*" --> "0..1" Store : StoreId (พนักงาน/เจ้าของ)
User "0..1" --> "*" User : CreatedBy
```

## 2) ศูนย์อาหาร ร้าน และเมนู

```mermaid
classDiagram
direction LR

class FoodCourt {
  +string FoodCourtName
  +time OpenTime
  +time CloseTime
  +bool ManualOverride
  +datetime OverrideUntil
  +isOpen() bool
}
class Store {
  +int StoreId
  +string StoreName
  +bool IsOpen
  +bool IsSuspended
  +int AvgPrepMinutes
  +string QueueCode
  +string ContactPhone
  +bool IsDeleted
  +nextQueueNo() string
}
class StoreCategory {
  +string CategoryName
}
class StoreContract {
  +date StartDate
  +date EndDate
}
class ProductCategory {
  +string CategoryName
  +int SortOrder
}
class Product {
  +int ProductId
  +string ProductName
  +string Description
  +decimal UnitPrice
  +string ImageUrl
  +bool IsOutOfStock
  +bool IsDeleted
}

FoodCourt "1" o-- "*" Store
StoreCategory "1" <-- "*" Store
Store "1" *-- "*" StoreContract
Store "1" *-- "*" ProductCategory
Store "1" *-- "*" Product
ProductCategory "0..1" <-- "*" Product
```

## 3) คำสั่งซื้อ การชำระเงิน การคืนเงิน และการพิมพ์

```mermaid
classDiagram
direction LR

class Order {
  +long OrderId
  +int QueueNo
  +decimal TotalAmount
  +string Note
  +bool IsWalkIn
  +datetime PickupTime
  +datetime ReadyAt
  +datetime DeliveredAt
  +datetime PickupReminderAt
  +datetime LatePickupArrivalTime
  +int LatePickupCount
  +string CancelReason
  +datetime CancelDeadline
  +changeStatus()
  +cancel()
}
class OrderStatus {
  <<lookup>>
  VERIFYING_SLIP
  PENDING
  COOKING
  COOKED
  READY
  COMPLETED
  PENDING_CANCELLATION
  AWAITING_TOP_UP
  CANCELLED
  NO_SHOW
}
class OrderItem {
  +int Qty
  +decimal UnitPrice
  +string ItemNote
  +ItemStatus ItemStatus
}
class OrderStatusLog {
  <<append-only>>
  +string Reason
  +ChangedByType ChangedByType
}
class Payment {
  +PaymentType PaymentType
  +decimal Amount
  +PaymentStatus PaymentStatus
  +string SlipImageUrl
  +string SlipHash
  +decimal CashReceived
  +decimal ChangeGiven
  +verify()
  +reject()
}
class PaymentMethod {
  <<lookup>>
  QR_PROMPTPAY
  CASH
  MOBILE_BANKING
}
class Refund {
  +RefundType RefundType
  +decimal Amount
  +RefundStatus RefundStatus
  +PayoutMethod PayoutMethod
  +PaidMethod PaidMethod
  +string TransferSlipUrl
  +markDone()
}
class PrintJob {
  +PrintType PrintType
  +PrintStatus PrintStatus
  +string PrinterName
  +PrinterStatus PrinterStatus
  +json ItemsSnapshot
}
class Review {
  +int Rating
  +string Comment
  +string ImageUrl
}

Order "*" --> "1" Store
Order "*" --> "0..1" User : Customer (null = walk-in)
Order "*" --> "0..1" User : CreatedByStaff
Order "*" --> "1" OrderStatus
Order "1" *-- "1..*" OrderItem
Order "1" *-- "*" OrderStatusLog
Order "1" *-- "*" Payment
Order "1" *-- "*" PrintJob
Order "1" -- "0..1" Review
OrderItem "*" --> "1" Product
OrderItem "0..1" --> "1" OrderItem : ReplacesItem
Payment "*" --> "1" PaymentMethod
Payment "*" --> "0..1" User : VerifiedBy
Payment "1" -- "*" Refund
Refund "*" --> "0..1" OrderItem
Refund "*" --> "0..1" User : RefundedBy
PrintJob "*" --> "0..1" User : PerformedBy
OrderStatusLog "*" --> "0..1" User : ChangedBy
```

## 4) ข้อร้องเรียน แจ้งเตือน รายงาน และ Audit

```mermaid
classDiagram
direction LR

class IssueReport {
  +string Description
  +IssueStatus IssueStatus
  +string AdminNote
  +datetime ResolvedAt
}
class IssueType {
  <<lookup>>
  WRONG_ORDER
  MISSING_ITEM
  FOOD_QUALITY
  SLOW_SERVICE
  PAYMENT_ISSUE
  STAFF_BEHAVIOR
  OTHER
}
class Notification {
  +NotificationType NotificationType
  +string Title
  +string Message
  +bool IsRead
}
class AuditLog {
  <<append-only>>
  +string ActionCode
  +string EntityType
  +string EntityId
  +json OldValue
  +json NewValue
  +string IpAddress
}
class MonthlyStoreSummary {
  +int SummaryYear
  +int SummaryMonth
  +int TotalOrders
  +decimal GrossSales
  +decimal RefundAmount
  +decimal NetSales
  +decimal CancelRate
  +bool IsLocked
}
class LoginThrottle {
  +string ThrottleKey
  +int FailCount
  +datetime BlockedUntil
}

IssueReport "*" --> "1" User : ReportedBy
IssueReport "*" --> "0..1" User : HandledBy
IssueReport "*" --> "1" Store
IssueReport "*" --> "0..1" Order
IssueReport "*" --> "1" IssueType
Notification "*" --> "1" User
Notification "*" --> "0..1" Order
AuditLog "*" --> "0..1" User : PerformedBy
MonthlyStoreSummary "*" --> "1" Store
MonthlyStoreSummary "*" --> "0..1" User : LockedBy
```

## 5) วงจรสถานะของ Order (`backend/state.py`)

ใช้ประกอบ Class Diagram ส่วนที่ 3 ; รายละเอียดทุกคู่สถานะดูที่ `state.py`

```mermaid
stateDiagram-v2
direction LR
[*] --> VERIFYING_SLIP : จ่ายด้วยสลิป
[*] --> PENDING : เงินสด / walk-in
VERIFYING_SLIP --> PENDING : สลิปผ่าน
VERIFYING_SLIP --> CANCELLED
PENDING --> COOKING
COOKING --> COOKED
COOKED --> READY : แจ้งลูกค้า
READY --> COMPLETED : ส่งมอบ
READY --> NO_SHOW : ไม่มารับ (>60 นาที)
PENDING --> PENDING_CANCELLATION : ของหมด / ขอยกเลิก
COOKING --> PENDING_CANCELLATION
PENDING_CANCELLATION --> PENDING : ลูกค้าเปลี่ยนเมนู (ถูกลง)
PENDING_CANCELLATION --> CANCELLED
PENDING_CANCELLATION --> AWAITING_TOP_UP : เปลี่ยนเมนูแพงขึ้น
AWAITING_TOP_UP --> PENDING : ส่วนต่างผ่าน
AWAITING_TOP_UP --> CANCELLED
COMPLETED --> [*]
CANCELLED --> [*]
NO_SHOW --> [*]
```

> ส่วนที่ 5 ตรวจเทียบกับตาราง `TRANSITIONS` ใน `state.py` แล้ว ; ข้อยกเว้นเดียวคือ `force_cancel` (ผู้บริหารปิดศูนย์อาหารแล้วเลือกยกเลิกทั้งหมด) ที่ข้ามตารางนี้ได้
