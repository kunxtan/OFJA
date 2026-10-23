
/* ============================================================
   รายงานปัญหาจากลูกค้า (is-*)
   ============================================================ */
export const ISSUE_TYPE_ICON = {
  WRONG_ORDER: 'receipt', MISSING_ITEM: 'box', FOOD_QUALITY: 'flame', SLOW_SERVICE: 'clock',
  PAYMENT_ISSUE: 'coin', STAFF_BEHAVIOR: 'users', OTHER: 'alert',
};

export const ISSUE_STATUS_UI = {
  OPEN: { label: 'รอดำเนินการ', tone: 'red', badge: 'danger' },
  IN_PROGRESS: { label: 'กำลังดำเนินการ', tone: 'amber', badge: 'warning' },
  RESOLVED: { label: 'แก้ไขแล้ว', tone: 'green', badge: 'success' },
  REJECTED: { label: 'ไม่รับเรื่อง', tone: 'neutral', badge: 'neutral' },
};

export const ISSUE_OPEN_STATES = ['OPEN', 'IN_PROGRESS'];

export const ISSUE_STALE_HOURS = 24;

// ค้างเกินนี้ขึ้นป้ายเตือน

// ข้อความตอบกลับสำเร็จรูป (กดแล้วเติมลงช่อง แก้ต่อได้)
export const ISSUE_QUICK_REPLIES = {
  IN_PROGRESS: ['ร้านรับเรื่องแล้ว กำลังตรวจสอบให้นะคะ', 'ขออภัยในความไม่สะดวก ร้านกำลังแก้ไขให้ค่ะ'],
  RESOLVED: ['ร้านแก้ไขเรียบร้อยแล้ว ขอบคุณที่แจ้งให้ทราบค่ะ', 'ร้านได้ปรับปรุงขั้นตอนแล้ว ขออภัยอีกครั้งค่ะ', 'ร้านติดต่อคืนเงินให้เรียบร้อยแล้วค่ะ'],
  REJECTED: ['ตรวจสอบแล้วไม่พบปัญหาตามที่แจ้งค่ะ', 'เรื่องนี้ไม่เกี่ยวข้องกับทางร้าน รบกวนติดต่อศูนย์อาหารค่ะ'],
  OPEN: [],
};
