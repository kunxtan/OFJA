// สรุปยอดขาย/การยกเลิก/สัญญา สำหรับรายงานผู้บริหาร
import { pad2, toISODate, rangeDayCount } from '../../../lib/dates';
import { parseOrderDate, periodBounds } from './dates';

export const statusIs = (order, status) => String(order?.Status || '').toLowerCase() === status.toLowerCase();

export const sumAmount = (orders) => orders.reduce((s, o) => s + Number(o.TotalAmount || 0), 0);

// กติกาเดียวกับหน้าบัญชี (accountant/lib/orders.js):
//  สลิปถูกปฏิเสธ (PaymentStatus === 'REJECTED') = ร้านไม่เคยได้รับเงิน → นับเป็น "จำนวนออเดอร์" ได้ แต่ไม่นับเป็น "ยอดเงิน"
export const isPaymentRejected = (o) => Boolean(o) && o.PaymentStatus === 'REJECTED';
export const moneyOf = (o) => (!o || isPaymentRejected(o) ? 0 : Number(o.TotalAmount || 0));
export const sumMoney = (orders) => orders.reduce((s, o) => s + moneyOf(o), 0);
export function changePct(current, previous) {
    const c = Number(current) || 0;
    const p = Number(previous) || 0;
        if (p === 0) return c === 0 ? 0 : null;
        return ((c - p) / p) * 100;
}

export function summarize(orders) {
    const completed = orders.filter((o) => statusIs(o, 'Completed'));
    const noShow = orders.filter((o) => statusIs(o, 'NoShow'));
    const settled = [...completed, ...noShow];
    const cancelled = orders.filter((o) => statusIs(o, 'Cancelled'));
    const sales = sumAmount(settled);
    const countedCancelled = cancelled.filter((o) => !isPaymentRejected(o));
    const grossSales = sumAmount([...settled, ...countedCancelled]);
    const cancelledValue = sumMoney(cancelled);
    const rejectedCancelledCount = cancelled.length - countedCancelled.length;
    const totalRecorded = settled.length + cancelled.length;

    return {
        sales,
        grossSales,
        completedCount: settled.length,
        cancelledCount: cancelled.length,
        cancelledValue,
        rejectedCancelledCount,
        cancelRate: totalRecorded > 0
            ? (cancelled.length / totalRecorded) * 100
            : null,
        avgOrder: settled.length
            ? sales / settled.length
            : 0,
        completed,
        noShow,
        settled,
        cancelled
    };
}

export function buildBuckets(completedOrders, anchorISO, days) {
    const { start } = periodBounds(anchorISO, days);
    const buckets = [];
    if (days === 1) {
        for (let h = 0; h < 24; h += 1) {
            buckets.push({ key: `h${h}`, label: `${pad2(h)}:00`, sales: 0, count: 0, byStore: {} });
        }
        completedOrders.forEach((o) => {
            const at = parseOrderDate(o.CreatedAt);
            if (!at)
                return;
            addToBucket(buckets[at.getHours()], o);
        });
        return buckets;
    }
    const indexByKey = {};
    for (let i = 0; i < days; i += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = toISODate(d);
        indexByKey[key] = i;
        buckets.push({
            key,
            label: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`,
            sales: 0,
            count: 0,
            byStore: {}
        });
    }
    completedOrders.forEach((o) => {
        const at = parseOrderDate(o.CreatedAt);
        if (!at)
            return;
        const idx = indexByKey[toISODate(at)];
        if (idx !== undefined)
            addToBucket(buckets[idx], o);
    });
    return buckets;
}

export function buildBucketsForRange(completedOrders, startISO, endISO) {
    const days = rangeDayCount(startISO, endISO);
    if (days === 1) return buildBuckets(completedOrders, endISO, 1);
    const buckets = [];
    const indexByKey = {};
    const start = new Date(`${startISO}T00:00:00`);
    for (let i = 0; i < days; i += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = toISODate(d);
        indexByKey[key] = i;
        buckets.push({ key, label: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`, sales: 0, count: 0, byStore: {} });
    }
    completedOrders.forEach((o) => {
        const at = parseOrderDate(o.CreatedAt);
        if (!at) return;
        const idx = indexByKey[toISODate(at)];
        if (idx !== undefined) addToBucket(buckets[idx], o);
    });
    return buckets;
}

export function addToBucket(bucket, order) {
    if (!bucket)
        return;
    const amount = Number(order.TotalAmount || 0);
    bucket.sales += amount;
    bucket.count += 1;
    const id = String(order.StoreId);
    if (!bucket.byStore[id]) {
        bucket.byStore[id] = { name: order.StoreName || `ร้าน #${id}`, sales: 0 };
    }
    bucket.byStore[id].sales += amount;
}

export function bucketExtremes(bucket) {
    const rows = Object.values(bucket.byStore || {}).filter((r) => r.sales > 0);
    if (!rows.length)
        return { best: null, worst: null };
    const sorted = [...rows].sort((a, b) => b.sales - a.sales);
    return {
        best: sorted[0],
        worst: sorted.length > 1 ? sorted[sorted.length - 1] : null
    };
}

export function summarizeMenus(completedOrders) {
    const map = {};
    completedOrders.forEach((o) => {
        (o.items || []).forEach((it) => {
            const id = String(it.ProductId);
            const name = it.ProductName || `สินค้า #${id}`;
            if (!map[id])
                map[id] = { id,name, qty: 0, amount: 0 };
            map[id].qty += Number(it.Qty || 0);
            map[id].amount += Number(it.Qty || 0) * Number(it.UnitPrice || 0);
        });
    });
    const rows = Object.values(map);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    rows.forEach((r) => {
        r.share = total ? (r.amount / total) * 100 : 0;
    });
    return rows.sort((a, b) => { if (b.qty !== a.qty) return b.qty - a.qty; 
      return Number(a.id) - Number(b.id); });
}

// เตือนอัตรายกเลิก : เกิน 10% (เท่ากับ 10 ไม่เตือน) ; ไม่มีออเดอร์ = N/A ไม่เตือน
export const CANCEL_ALERT_RATE = 10;

export const isCancelAlert = (rate) => rate !== null && rate !== undefined && rate > CANCEL_ALERT_RATE;

// สัญญาใกล้หมด : ยังใช้ได้อยู่ (ACTIVE) และเหลือไม่เกิน 30 วัน (ใช้ทั้ง Dashboard / จัดการร้าน / ยอดขายรายร้าน / ติดตามสัญญา)
export const CONTRACT_SOON_DAYS = 30;

export const isContractSoon = (store) => store?.ContractState === 'ACTIVE'
    && store.ContractDaysLeft !== null && store.ContractDaysLeft !== undefined
    && Number(store.ContractDaysLeft) <= CONTRACT_SOON_DAYS;

export const contractLeftLabel = (days) => (Number(days) === 0 ? 'หมดคืนนี้' : `เหลือ ${days} วัน`);

// ===== วิเคราะห์การยกเลิก (Cancellation): อัตรายกเลิกรายร้าน + ร้านที่ต้องจับตา + รายงานออเดอร์ยกเลิก =====
// ทุกตัวเลขคิดตาม "ช่วงเวลาที่เลือก" แบบเดียวกับหน้าภาพรวม (ไม่ใช้ 30 วันตายตัวแบบฝ่ายบัญชี)
export const CANCEL_WARN_RATE = 5;

// ตั้งแต่ 5% = เฝ้าระวัง (แค่ใช้แสดงสีเหลือง ตัวแจ้งเตือนจริงยังเป็น > CANCEL_ALERT_RATE)
export const cancelRateTone = (rate) => rate === null || rate === undefined ? 'na'
    : isCancelAlert(rate) ? 'bad'
    : rate >= CANCEL_WARN_RATE ? 'warn'
    : 'ok';

export const CANCEL_REASON_FALLBACK = 'ไม่ระบุเหตุผล';

export function summarizeCancelReasons(cancelledOrders) {
    const map = {};
    cancelledOrders.forEach((o) => {
        const reason = String(o.CancelReason || '').trim() || CANCEL_REASON_FALLBACK;
        if (!map[reason])
            map[reason] = { reason, count: 0, amount: 0 };
        map[reason].count += 1;
        map[reason].amount += moneyOf(o);
    });
    const rows = Object.values(map);
    const total = rows.reduce((s, r) => s + r.count, 0);
    rows.forEach((r) => {
        r.share = total ? (r.count / total) * 100 : 0;
    });
    return rows.sort((a, b) => b.count - a.count);
}
