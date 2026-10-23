
/* ============================================================
   จัดการพนักงาน (sf-*)
   ============================================================ */
// กติกาต้องตรงกับ backend: utils.validate_username / validate_password / validate_phone / validate_email
export const STAFF_USERNAME_RE = /^[A-Za-z0-9_]{4,20}$/;

export const STAFF_PHONE_RE = /^0\d{8,9}$/;

export const STAFF_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const STAFF_PASSWORD_MIN = 8;

export const STAFF_PASSWORD_MAX = 72;

// ขีดจำกัดของ bcrypt

export const STAFF_ROLE_INFO = {
  'Front Staff': {
    label: 'พนักงานหน้าร้าน', short: 'หน้าร้าน', tone: 'primary', icon: 'receipt',
    desc: 'รับออเดอร์ walk-in ตรวจสลิป เรียกคิว และส่งมอบอาหาร',
  },
  'Kitchen Staff': {
    label: 'พนักงานครัว', short: 'ครัว', tone: 'warning', icon: 'flame',
    desc: 'ดูคิวที่ต้องทำ อัปเดตสถานะการปรุง และปรับเมนูที่ของหมด',
  },
};

export const staffRoleInfo = (role) => STAFF_ROLE_INFO[role] || STAFF_ROLE_INFO['Front Staff'];

export const AVATAR_CROP = [{ id: '1:1', label: '1:1', value: 1 }];

export const AVATAR_COLORS = ['#FF724C', '#2A2C41', '#17A673', '#E2A430', '#5B6CF0', '#C2185B'];

// อักษรย่อจากชื่อ (ข้ามสระหน้า เ แ โ ใ ไ ของชื่อไทย)
export function staffInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.slice(0, 2).map(p => (p.replace(/^[เแโใไ]/, '') || p)[0]).join('').toUpperCase();
}

export function staffStatus(s) {
  if (!s.IsActive) return { key: 'inactive', label: 'ปิดใช้งาน', tone: 'neutral' };
  if (s.IsLocked) return { key: 'locked', label: 'ถูกล็อกชั่วคราว', tone: 'warning' };
  return { key: 'active', label: 'ใช้งานอยู่', tone: 'success' };
}

export function passwordChecks(password, confirm) {
  return [
    { id: 'len', ok: password.length >= STAFF_PASSWORD_MIN && password.length <= STAFF_PASSWORD_MAX, label: `${STAFF_PASSWORD_MIN}–${STAFF_PASSWORD_MAX} ตัวอักษร` },
    { id: 'space', ok: password.length > 0 && !/\s/.test(password), label: 'ไม่มีช่องว่าง' },
    { id: 'match', ok: password.length > 0 && password === confirm, label: 'ยืนยันรหัสผ่านตรงกัน' },
  ];
}
