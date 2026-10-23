
/* ============================================================
   ประวัติการขาย (sh-*)
   ============================================================ */
export const ORDER_STATUS_META = {
  VERIFYING_SLIP: { label: 'รอตรวจสลิป', tone: 'warning' },
  PENDING: { label: 'รอร้านรับ', tone: 'warning' },
  COOKING: { label: 'กำลังทำ', tone: 'primary' },
  COOKED: { label: 'ทำเสร็จแล้ว', tone: 'primary' },
  READY: { label: 'เรียกคิวแล้ว', tone: 'primary' },
  COMPLETED: { label: 'สำเร็จ', tone: 'success' },
  PENDING_CANCELLATION: { label: 'รอยืนยันยกเลิก', tone: 'warning' },
  AWAITING_TOP_UP: { label: 'รอโอนส่วนต่าง', tone: 'warning' },
  CANCELLED: { label: 'ยกเลิก', tone: 'danger' },
  NO_SHOW: { label: 'ไม่มารับ', tone: 'neutral' },
};

export const orderStatusMeta = (code) => ORDER_STATUS_META[code] || { label: code || '-', tone: 'neutral' };

export const ROLE_TH = {
  CUSTOMER: 'ลูกค้า',
  FRONT_STAFF: 'พนักงานหน้าร้าน',
  KITCHEN_STAFF: 'พนักงานครัว',
  STORE_OWNER: 'เจ้าของร้าน',
  ACCOUNTANT: 'ฝ่ายบัญชี',
  EXECUTIVE: 'ผู้บริหาร',
};

export const PAYMENT_STATUS_META = {
  PENDING: { label: 'รอตรวจ', tone: 'warning' },
  VERIFIED: { label: 'ยืนยันแล้ว', tone: 'success' },
  REJECTED: { label: 'ปฏิเสธ', tone: 'danger' },
};

export const REFUND_TYPE_TH = { FULL_CANCEL: 'คืนเงินทั้งออเดอร์', PRICE_DIFF: 'คืนส่วนต่างราคา', ITEM_CANCEL: 'คืนเงินบางรายการ' };

export const REFUND_STATUS_META = {
  PENDING: { label: 'รอคืนเงิน', tone: 'warning' },
  DONE: { label: 'คืนเงินแล้ว', tone: 'success' },
  FAILED: { label: 'ไม่สำเร็จ', tone: 'danger' },
};

export const PRINT_TYPE_TH = { CUSTOMER: 'ใบรับอาหาร', KITCHEN: 'ใบครัว', REPRINT: 'พิมพ์ซ้ำ' };
