// จัดรูปแบบตัวเลข/วันที่/เดือน สำหรับหน้าผู้บริหาร
import { toISODate, pad2, todayISO } from '../../../lib/dates';
import { parseOrderDate } from './dates';

// ===== ฟังก์ชันช่วยจัดรูปแบบวันที่ ยอดเงิน และคำนวณข้อมูล =====
export const intFmt = new Intl.NumberFormat('th-TH');

export const money = (v) => intFmt.format(Math.round(Number(v) || 0));

export const money2 = (v) => new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
}).format(Number(v) || 0);

export function shortNumber(value) {
    const n = Number(value) || 0;
    if (n >= 1000000)
        return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000)
        return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
    return String(Math.round(n));
}

export function thaiDate(iso) {
    if (!iso) return '-';
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return toISODate(d);
}

export function thaiDateTime(value) {
    const d = parseOrderDate(value);
    if (!d) return '-';

    return `${toISODate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function nowStamp() {
    const d = new Date();
    return `${toISODate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function daysAgoISO(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return toISODate(d);
}

export function formatHoursTh(h) {
    if (h === null || h === undefined) return '—';
    if (h < 1) return `${Math.max(1, Math.round(h * 60))} นาที`;
    if (h < 48) return `${Math.round(h * 10) / 10} ชม.`;
    return `${Math.round(h / 24)} วัน`;
}

// ===== เลือกเป็นเดือน (ใช้กับ Dashboard + ยอดขายรายร้าน และไฟล์ CSV/XLSX ที่ export ตามช่วงนี้) =====
export const TH_MONTH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

// เดือน m (1–12) ของปี y -> [วันที่ 1, วันสุดท้าย] ; เดือนปัจจุบันตัดที่วันนี้
export function monthRange(y, m) {
    const last = toISODate(new Date(y, m, 0));
    const today = todayISO();
    return [`${y}-${pad2(m)}-01`, last > today ? today : last];
}

// ช่วงวันที่ตรงกับ "ทั้งเดือน" -> "เดือนธันวาคม 2025" ; ไม่ใช่ -> ''
export function monthLabelOf(startISO, endISO) {
    if (!startISO || !endISO || startISO.slice(8) !== '01' || startISO.slice(0, 7) !== endISO.slice(0, 7)) return '';
    const [y, m] = startISO.split('-').map(Number);
    const [, end] = monthRange(y, m);
    if (endISO !== end) return '';
    const label = `เดือน${TH_MONTH_FULL[m - 1]} ${y}`;
    return end === todayISO() && end !== toISODate(new Date(y, m, 0)) ? `${label} (ถึงวันนี้)` : label;
}

// 0812345678 -> 081-234-5678 ; 021234567 -> 02-123-4567
export function formatPhone(value) {
    const d = String(value || '').replace(/\D/g, '');
    if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    if (/^0\d{8}$/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return value || '';
}
