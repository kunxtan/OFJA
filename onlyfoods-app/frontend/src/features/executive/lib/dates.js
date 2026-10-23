// ช่วงเวลาและวันที่ของรายงานผู้บริหาร
import { rangeDayCount, toISODate } from '../../../lib/dates';

// ===== ตั้งค่าหลักของหน้า Executive =====
export const ORDER_TIME_IS_UTC = false;

export function parseOrderDate(value) {
    if (!value)
        return null;
    if (value instanceof Date)
        return value;
    const normalized = String(value).trim().replace(' ', 'T');
    const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
    const parsed = new Date(hasTz || !ORDER_TIME_IS_UTC ? normalized : `${normalized}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function periodBounds(anchorISO, days) {
    const end = new Date(`${anchorISO}T00:00:00`);
    end.setDate(end.getDate() + 1);
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    return { start, end };
}

export function previousBounds(anchorISO, days) {
    const { start } = periodBounds(anchorISO, days);
    const prevEnd = new Date(start);
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - days);
    return { start: prevStart, end: prevEnd };
}

export function customPeriodBounds(startISO, endISO) {
    const start = new Date(`${startISO}T00:00:00`);
    const end = new Date(`${endISO}T00:00:00`);
    end.setDate(end.getDate() + 1);
    return { start, end };
}

export function previousBoundsForRange(startISO, endISO) {
    const days = rangeDayCount(startISO, endISO);
    const current = customPeriodBounds(startISO, endISO);
    const previousEnd = new Date(current.start);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - days);
    return { start: previousStart, end: previousEnd };
}

export function inRange(order, bounds, storeId = null) {
    const at = parseOrderDate(order.CreatedAt);
    if (!at)
        return false;
    if (at < bounds.start || at >= bounds.end)
        return false;
    if (storeId !== null && String(order.StoreId) !== String(storeId))
        return false;
    return true;
}

// วันสิ้นสุดสัญญา N เดือน (ทุกปุ่มใช้ตัวนี้ ให้ตรงกับ backend)
// เช่น 2026-10-22 + 12 เดือน -> 2027-10-21
export function contractEndISO(startISO, months) {
    const [y, m, d] = String(startISO || '').split('-').map(Number);
    if (!y || !m || !d || !months) return '';
    const lastDay = new Date(y, m - 1 + months + 1, 0).getDate();
    if (d > lastDay) return toISODate(new Date(y, m - 1 + months, lastDay));
    return toISODate(new Date(y, m - 1 + months, d - 1));
}

export function addYearsMinusOneDayISO(startISO, years = 1) {
    return contractEndISO(startISO, years * 12);
}

export function minusOneDayISO(iso) {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    return toISODate(new Date(y, m - 1, d - 1));
}

export function addMonthsToISO(baseISO, months) {
    const [y, m, d] = String(baseISO || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    const lastDay = new Date(y, m - 1 + months + 1, 0).getDate();
    return toISODate(new Date(y, m - 1 + months, Math.min(d, lastDay)));
}
