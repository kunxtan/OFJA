// จัดรูปแบบเงิน/วันที่/เดือน สำหรับหน้าฝ่ายบัญชี
import { STORE_COLORS, SERVER_TZ } from './constants';

// การแจ้งเตือน Cancel Rate คำนวณจากข้อมูลย้อนหลังกี่วัน

export const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export const fmtThaiMonth = (ym) => { const [y, m] = String(ym || '').split('-').map(Number); return y && m ? `${THAI_MONTHS[m - 1]} ${y + 543}` : ''; };

export const THAI_WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

/* ---------------- Pure helpers ---------------- */
export const fmtMoney = (n) => {
  const num = Number(n || 0);
  return num.toLocaleString('th-TH', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  });
};

export const colorForStore = (storeId) => STORE_COLORS[Number(storeId) % STORE_COLORS.length];

export const statusLabel = (s) => (s === 'na' ? 'N/A' : s === 'bad' ? 'สูงผิดปกติ' : s === 'warn' ? 'เฝ้าระวัง' : 'ปกติ');

// ถ้าไม่มีข้อมูล (rate เป็น null) ให้แสดง N/A แทน 0%
export const fmtRate = (r) => (r === null || r === undefined || Number.isNaN(r) ? 'N/A' : `${r}%`);

export function parseOrderDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const normalized = String(value).trim().replace(' ', 'T');
  const alreadyHasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  // backend/MySQL ส่งเวลามาแบบไม่มี timezone (เช่น 2026-10-06T10:17:43) และเก็บเป็นเวลาไทย
  // จึงต้องตีความเป็น UTC+7 (ไม่ใช่ UTC) ไม่งั้นเวลาจะคลาดไป 7 ชั่วโมง
  const parsed = new Date(alreadyHasTimezone ? normalized : `${normalized}${SERVER_TZ}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const fmtDateTime = (d) => {
  const dt = parseOrderDate(d);
  if (!dt) return '-';
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
};

// วันที่/เวลาแบบอ่านง่าย (ใช้ใน Audit Log และ popup ออเดอร์ยกเลิก)
export const fmtTimeOnly = (d) => {
  const dt = parseOrderDate(d);
  if (!dt) return '-';
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}:${String(dt.getSeconds()).padStart(2, '0')}`;
};

export const fmtDateTh = (d) => {
  const dt = parseOrderDate(d);
  if (!dt) return '-';
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
};

export const fmtMoney2 = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const dayLabel = (key) => {
  if (!key) return 'ไม่ทราบวันที่';
  const [Y, M, D] = key.split('-');
  const base = `วัน${THAI_WEEKDAYS[new Date(+Y, +M - 1, +D).getDay()]}ที่ ${D}/${M}/${Y}`;
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (key === dateOnly(new Date())) return `วันนี้ · ${base}`;
  if (key === dateOnly(y)) return `เมื่อวาน · ${base}`;
  return base;
};

export const dateOnly = (d) => {
  const dt = parseOrderDate(d);
  if (!dt) return '';
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// จำนวนวันแบบรวมวันแรกและวันสุดท้าย (YYYY-MM-DD ถึง YYYY-MM-DD)
export const daysInclusive = (start, end) => Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000) + 1;

export const shiftDay = (day, delta) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + delta); return dateOnly(d); };

// ช่วงวันที่กำหนดเองยาวสุด (ตรงกับจำนวนจุดสูงสุดของกราฟรายวัน)
export const fmtDayTh = (key) => String(key || '').split('-').reverse().join('/');
