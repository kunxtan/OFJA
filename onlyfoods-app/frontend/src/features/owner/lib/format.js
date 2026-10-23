// จัดรูปแบบตัวเลข/วันที่/เบอร์โทร สำหรับหน้าเจ้าของร้าน
import { parseOrderDate } from './dates';

export const fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ยอดเงินคืน: แสดงสตางค์เฉพาะเมื่อมี (ส่วนต่างราคาอาจไม่ลงตัว)
export const fmtBaht = (n) => { const v = Number(n || 0); return v.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }); };

// "เมื่อสักครู่" / "5 นาทีที่แล้ว" / "3 ชั่วโมงที่แล้ว" / "2 วันที่แล้ว" / วันที่
export function timeAgo(value) {
  const d = parseOrderDate(value);
  if (!d) return '-';
  const diff = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'เมื่อสักครู่';
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} วันที่แล้ว`;
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

export function thaiDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d.getDate()} ${m[d.getMonth()]} ${(d.getFullYear() + 543) % 100}`;
}

export const phoneDigits = (value) => String(value || '').replace(/[\s-]/g, '');

// 0812345678 -> 081-234-5678 ; 021234567 -> 02-123-4567
export function formatPhone(value) {
  const d = phoneDigits(value);
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (/^0\d{8}$/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return value || '';
}

export function thaiDateTime(value, withTime = false) {
  const d = parseOrderDate(value);
  if (!d) return '-';
  const date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  return withTime ? `${date} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.` : date;
}

export function minutesBetween(a, b) {
  const x = parseOrderDate(a);
  const y = parseOrderDate(b);
  if (!x || !y) return null;
  return Math.max(0, Math.round((y - x) / 60000));
}

export function formatDuration(mins) {
  if (mins === null || mins === undefined) return '—';
  if (mins < 1) return 'ไม่ถึง 1 นาที';
  if (mins < 60) return `${mins} นาที`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

export const timeHM = (value) => {
  const d = parseOrderDate(value);
  return d ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-';
};

export function hoursSince(value) {
  const d = parseOrderDate(value);
  return d ? (Date.now() - d.getTime()) / 3600000 : 0;
}

export function formatHours(h) {
  if (h === null || h === undefined) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} นาที`;
  if (h < 48) return `${Math.round(h * 10) / 10} ชม.`;
  return `${Math.round(h / 24)} วัน`;
}
