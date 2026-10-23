// คำนวณยอดขาย/รายงานร้าน (สูตรเดียวกับ backend reports.dashboard / v_order_net)
import { parseOrderDate } from './dates';
import { pad2, toISODate } from '../../../lib/dates';

export function orderIs(order, status) {
  return String(order.Status || '').toLowerCase() === status.toLowerCase();
}

// ---- ยอดขาย: นิยามเดียวกับ backend (reports.dashboard / v_order_net) ใช้ทุกหน้า ----
// ออเดอร์ที่นับเป็นยอดขาย = สำเร็จ + ไม่มารับ (ลูกค้าจ่ายแล้ว ร้านทำแล้ว ไม่มีการคืนเงิน) ; ยกเลิกไม่นับ
export const isNoShowOrder = (o) => o.StatusCode === 'NO_SHOW' || orderIs(o, 'NoShow');

export const isRevenueOrder = (o) => o.StatusCode === 'COMPLETED' || o.StatusCode === 'NO_SHOW' || orderIs(o, 'Completed') || orderIs(o, 'NoShow');

// เงินที่รับจริง = การชำระที่ยืนยันแล้วทุกใบ (ค่าอาหาร + ส่วนต่างที่โอนเพิ่ม) ; ไม่มีข้อมูลการชำระ -> TotalAmount
// (ไม่ใช้ TotalAmount ตรง ๆ เพราะเปลี่ยนเมนูถูกลงแล้ว TotalAmount ลดทันที ทั้งที่ยังไม่ได้คืนเงินจริง)
export function orderReceived(o) {
  const paid = (o.Payments || []).filter(p => p.PaymentStatus === 'VERIFIED');
  return paid.length ? paid.reduce((acc, p) => acc + Number(p.Amount || 0), 0) : Number(o.TotalAmount || 0);
}

// ยอดสุทธิของออเดอร์ = เงินที่รับจริง − เงินคืน (refundedByOrder: { OrderId: ยอดคืนที่คืนแล้ว + รอลูกค้ามารับ })
export const orderNet = (o, refundedByOrder) => orderReceived(o) - Number(refundedByOrder?.[o.OrderID] || 0);

// วันเดียว = รายชั่วโมง 24 จุด ; หลายวัน = รายวัน
// วันเดียว = รายชั่วโมง (เฉพาะช่วงเวลาทำการของศูนย์อาหาร) ; หลายวัน = รายวัน
export function buildBuckets(completedOrders, period, hourRange, valueOf = (o) => Number(o.TotalAmount || 0)) {
  const buckets = [];
  const indexByKey = {};
  if (period.days === 1) {
    let from = hourRange ? hourRange.from : 0;
    let to = hourRange ? hourRange.to : 23;
    // ถ้ามีออเดอร์นอกเวลาทำการ (เช่นผู้บริหารเปิดศูนย์อาหารเพิ่ม) ขยายแกนให้ครอบคลุม
    completedOrders.forEach(order => {
      const at = parseOrderDate(order.CreatedAt);
      if (!at) return;
      from = Math.min(from, at.getHours());
      to = Math.max(to, at.getHours());
    });
    for (let h = from; h <= to; h += 1) {
      indexByKey[`h${h}`] = buckets.length;
      buckets.push({ key: `h${h}`, label: `${pad2(h)}:00`, sales: 0, count: 0 });
    }
  } else {
    for (let i = 0; i < period.days; i += 1) {
      const d = new Date(period.start);
      d.setDate(period.start.getDate() + i);
      indexByKey[toISODate(d)] = i;
      buckets.push({ key: toISODate(d), label: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`, sales: 0, count: 0 });
    }
  }
  completedOrders.forEach(order => {
    const at = parseOrderDate(order.CreatedAt);
    if (!at) return;
    const key = period.days === 1 ? `h${at.getHours()}` : toISODate(at);
    const bucket = buckets[indexByKey[key]];
    if (!bucket) return;
    bucket.sales += valueOf(order);
    bucket.count += 1;
  });
  return buckets;
}

// "08:00"/"20:00" -> ช่วงชั่วโมงที่แสดงบนกราฟ { from: 8, to: 19 }
export function hoursFromSchedule(openTime, closeTime) {
  const toMin = (t) => {
    const [h, m] = String(t || '').split(':').map(Number);
    return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
  };
  const o = toMin(openTime);
  const c = toMin(closeTime);
  if (o === null || c === null || c <= o) return null;
  return { from: Math.floor(o / 60), to: Math.max(Math.floor(o / 60), Math.ceil(c / 60) - 1) };
}

// เปอร์เซ็นต์เปลี่ยนแปลงเทียบช่วงก่อนหน้า (null = เทียบไม่ได้)
export function changePct(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return null;
  return ((c - p) / p) * 100;
}

// สรุปตัวเลขหลักของชุดออเดอร์ (สูตรเดียวกับหน้า Executive)
export function summarizeOrders(orders, refundedByOrder) {
  const revenue = orders.filter(isRevenueOrder);           // สำเร็จ + ไม่มารับ
  const noShow = revenue.filter(isNoShowOrder);
  const cancelled = orders.filter(o => orderIs(o, 'Cancelled'));
  const received = revenue.reduce((acc, o) => acc + orderReceived(o), 0);
  const refunded = revenue.reduce((acc, o) => acc + Number(refundedByOrder?.[o.OrderID] || 0), 0);
  const sales = received - refunded;
  const finished = revenue.length + cancelled.length;
  return {
    sales,                                                   // ยอดขายสุทธิ = รับจริง − เงินคืน (สำเร็จ + ไม่มารับ)
    received,                                                // เงินที่รับจริงก่อนหักคืน
    refunded,                                                // เงินคืน ทั้งคืนแล้วและรอลูกค้ามารับ (ของออเดอร์ที่นับยอด)
    noShowCount: noShow.length,
    noShowSales: noShow.reduce((acc, o) => acc + orderNet(o, refundedByOrder), 0),
    grossSales: revenue.concat(cancelled).reduce((acc, o) => acc + Number(o.TotalAmount || 0), 0), // มูลค่าออเดอร์รวมก่อนหักยกเลิก
    completedCount: revenue.length - noShow.length,
    revenueCount: revenue.length,
    cancelledCount: cancelled.length,
    cancelRate: finished ? (cancelled.length / finished) * 100 : null, // ยกเลิก / ออเดอร์ที่จบแล้ว
    avgOrder: revenue.length ? sales / revenue.length : 0,
    completed: revenue,
  };
}

// ยอดขายแยกตามเมนู จากออเดอร์ที่สำเร็จ
export function summarizeMenus(completedOrders) {
  const map = {};
  completedOrders.forEach(order => {
    const seen = new Set();
    (order.items || []).forEach(item => {
      const id = String(item.ProductId);
      if (!map[id]) map[id] = { id, name: item.ProductName || `เมนู #${id}`, qty: 0, amount: 0, orderCount: 0 };
      map[id].qty += Number(item.Qty || 0);
      map[id].amount += Number(item.Qty || 0) * Number(item.UnitPrice || 0);
      if (!seen.has(id)) { map[id].orderCount += 1; seen.add(id); }
    });
  });
  const rows = Object.values(map);
  const total = rows.reduce((acc, r) => acc + r.amount, 0);
  rows.forEach(r => { r.share = total ? (r.amount / total) * 100 : 0; });
  return rows.sort((a, b) => (b.qty - a.qty) || (b.amount - a.amount) || (Number(a.id) - Number(b.id)));
}

// คำนวณจากออเดอร์ของร้านตัวเองเท่านั้น (กรอง StoreId ซ้ำอีกชั้น แม้ API จะส่งมาเฉพาะร้านนี้อยู่แล้ว)
export function buildStoreReport(orders, storeId, period, hourRange, refundedByOrder) {
  const inRange = (start, end) => (orders || []).filter(order => {
    const createdAt = parseOrderDate(order.CreatedAt);
    return createdAt && createdAt >= start && createdAt < end && String(order.StoreId) === String(storeId);
  });
  const prevStart = new Date(period.start);
  prevStart.setDate(prevStart.getDate() - period.days);
  const currentOrders = inRange(period.start, period.end);
  const previousOrders = inRange(prevStart, period.start);
  const now = summarizeOrders(currentOrders, refundedByOrder);
  const before = summarizeOrders(previousOrders, refundedByOrder);
  return {
    now,
    before,
    hasPreviousData: previousOrders.length > 0,
    menus: summarizeMenus(now.completed),
    buckets: buildBuckets(now.completed, period, hourRange, (o) => orderNet(o, refundedByOrder)),
  };
}

export const getStatusLabel = (status) => {
  const statusMap = {
    'Verifying_Slip': 'รอตรวจสอบสลิป',
    'Pending': 'รอดำเนินการ',
    'Cooking': 'กำลังปรุง',
    'Ready': 'รอรับอาหาร',
    'Completed': 'สำเร็จ',
    'Cancelled': 'ยกเลิก'
  };
  return statusMap[status] || status;
};
