// วันที่/ช่วงเวลาของหน้าเจ้าของร้าน (backend ส่งเวลาไทยแบบไม่มี timezone)
import { toISODate, rangeDayCount } from '../../../lib/dates';

// --- Helper Functions สำหรับคำนวณกราฟแบบ Executive ---
export function parseOrderDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const normalized = String(value).trim().replace(' ', 'T');
  const alreadyHasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  // backend ส่งเวลาไทยแบบไม่มี timezone (เช่น 2026-10-10T15:14:47) : ต้องอ่านเป็น +07:00
  // เดิมเติม Z (UTC) ทำให้เวลาบนกราฟ/รายงานเลื่อนไป 7 ชั่วโมง
  const parsed = new Date(alreadyHasTimezone ? normalized : `${normalized}+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ช่วงเวลาที่กำลังดู (เหมือนหน้า Executive): ย้อนหลัง N วันถึงวันที่เลือก หรือช่วงที่กำหนดเอง
export function resolvePeriod({ anchor, days, custom, customStart, customEnd }) {
  const startISO = custom
    ? customStart
    : toISODate(new Date(new Date(`${anchor}T00:00:00`).setDate(new Date(`${anchor}T00:00:00`).getDate() - days + 1)));
  const endISO = custom ? customEnd : anchor;
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return { start, end, days: rangeDayCount(startISO, endISO), startISO, endISO };
}
