// คัดกรอง/สรุปออเดอร์ ยอดขายรายร้าน แนวโน้ม เมนูขายดี
import { RATE_WARN, RATE_ALERT } from './constants';
import { colorForStore, dateOnly, daysInclusive, shiftDay, parseOrderDate } from './format';

// นักบัญชีบันทึกยอด/จำนวนออเดอร์ เฉพาะออเดอร์ที่ "จบ/กึ่งจบ" หรือ "ถูกยกเลิก" เท่านั้น
export const SETTLED_STATUSES = ['Completed', 'NoShow'];

// ส่งมอบสำเร็จ / กึ่งจบ (ลูกค้าไม่มารับ ร้านได้เงินแล้ว)
export const RECORDED_STATUSES = [...SETTLED_STATUSES, 'Cancelled'];

// สถานะที่นับเข้าบัญชี
export const normStatus = (st) => {
  const t = String(st || '').trim();
  const hit = RECORDED_STATUSES.concat(['Pending', 'Cooking', 'Ready', 'Verifying_Slip', 'Pending_Cancellation'])
    .find(x => x.toLowerCase() === t.toLowerCase());
  return hit || t;
};

export const isSettled = (o) => SETTLED_STATUSES.includes(normStatus(o.Status));

// กติกาบัญชีกลาง (ใช้ร่วมกันทุกหน้า: Dashboard / Sales Summary / Cancellation / รายงาน)
//  - ออเดอร์ที่สลิปถูกปฏิเสธ (PaymentStatus === 'REJECTED') = ร้านไม่เคยได้รับเงิน : ยังนับเป็น "จำนวนออเดอร์" ได้ แต่ห้ามนับเป็น "ยอดเงิน"
export const isPaymentRejected = (o) => Boolean(o) && o.PaymentStatus === 'REJECTED';

export const moneyOf = (o) => (!o || isPaymentRejected(o) ? 0 : Number(o.TotalAmount || 0));

// กันออเดอร์ซ้ำ (OrderID เดียวกัน) ไม่ให้ถูกนับจำนวน/ยอดเงินซ้ำ
export const dedupeOrders = (list) => {
  const seen = new Set();
  return (list || []).filter(o => {
    if (!o) return false;
    if (o.OrderID === undefined || o.OrderID === null) return true;
    const k = String(o.OrderID);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

// เดาประเภทการยกเลิกจากเหตุผลที่เก็บในออเดอร์
export function classifyCancelledOrder(o) {
  const reason = String(o.CancelReason || '');
  if (reason.includes('สลิป')) return 'VERIFY_SLIP_REJECT';
  if (reason.includes('ลูกค้า')) return 'CUSTOMER_CANCEL_ORDER';
  return 'STORE_CANCEL_ORDER';
}

export const orderItemsOf = (o) => (o && (o.items || o.OrderItems || o.Items || o.orderItems)) || [];

export function itemsText(order, max = 3) {
  const items = orderItemsOf(order);
  if (!items.length) return '';
  const txt = items.slice(0, max).map(it => `${it.ProductName || it.MenuName || '-'} ×${it.Qty ?? it.Quantity ?? 1}`).join(', ');
  return items.length > max ? `${txt} และอีก ${items.length - max} รายการ` : txt;
}

export const customerNameOf = (o) => o.CustomerName || o.UserName || (Number(o.IsWalkIn) === 1 ? 'ลูกค้าหน้าร้าน (Walk-in)' : (o.UserId ? `ลูกค้า #${o.UserId}` : 'ไม่ระบุ'));

// rangeStart (YYYY-MM-DD) ใช้ตัดสินว่าร้านที่ถูกลบแล้วควรแสดงในช่วงวันที่นั้นหรือไม่:
//  - ร้านที่ถูกลบ จะแสดงถ้าช่วงวันที่เริ่มก่อน/ตรงกับวันที่ลบ หรือมีออเดอร์อยู่ในช่วงนั้น
//  - ถ้าช่วงวันที่เริ่มหลังวันที่ลบ (เช่นวันถัดจากวันที่ลบ) ร้านจะไม่ขึ้น
//  - ไม่ส่ง rangeStart = มุมมองตลอดเวลา (ร้านที่ถูกลบยังแสดงเพื่อย้อนดูประวัติ)
export function buildStoreSummary(stores, orders, rangeStart) {
  const map = {};
  const blank = (id, name, isDeleted, deletedAt) => ({
    storeId: id,
    storeName: isDeleted ? `${name} (Deleted)` : name,
    isDeleted: Boolean(isDeleted),
    deletedDay: deletedAt ? dateOnly(deletedAt) : '',
    color: colorForStore(id),
    totalOrders: 0, completedOrders: 0, cancelledOrders: 0, grossSales: 0, cancelledAmount: 0,
  });
  (stores || []).forEach(s => { map[s.StoreId] = blank(s.StoreId, s.StoreName, Number(s.IsDeleted) === 1 || s.IsDeleted === true, s.DeletedAt); });
  (orders || []).forEach(o => {
    // บันทึกเฉพาะออเดอร์ที่จบ/กึ่งจบ หรือถูกยกเลิก — ออเดอร์ที่ยังดำเนินการอยู่ไม่นับ
    const st = normStatus(o.Status);
    if (!RECORDED_STATUSES.includes(st)) return;
    if (!map[o.StoreId]) map[o.StoreId] = blank(o.StoreId, o.StoreName || `ร้าน #${o.StoreId}`, false);
    const row = map[o.StoreId];
    // สลิปถูกปฏิเสธ = ร้านไม่เคยรับเงินนี้ : ไม่นับเข้ายอด (เดิมทำให้ GROSS สูงเกินจริง) — ยังนับเป็นจำนวนออเดอร์
    const amount = moneyOf(o);
    row.totalOrders += 1;
    row.grossSales += amount;
    if (isSettled(o)) row.completedOrders += 1;
    if (st === 'Cancelled') {
      row.cancelledOrders += 1;
      row.cancelledAmount += amount;
    }
  });
  return Object.values(map)
    .filter(r => {
      if (!r.isDeleted || !rangeStart) return true;
      if (r.totalOrders > 0) return true;                       // มีประวัติในช่วงนี้ -> แสดง
      return !r.deletedDay || rangeStart <= r.deletedDay;       // ช่วงนี้เริ่มก่อน/ตรงวันที่ลบ -> ร้านยังมีอยู่ในช่วงนั้น
    })
    .map(r => {
      // ไม่มีออเดอร์ = ไม่มีข้อมูลให้คำนวณ -> rate เป็น null (แสดง N/A)
      const hasData = r.totalOrders > 0;
      const rate = hasData ? (r.cancelledOrders / r.totalOrders) * 100 : null;
      const status = !hasData ? 'na' : rate > RATE_ALERT ? 'bad' : rate >= RATE_WARN ? 'warn' : 'ok';
      // รายได้สุทธิ = ยอดที่บันทึกทั้งหมด - ยอดที่ถูกยกเลิก
      return { ...r, rate: hasData ? +rate.toFixed(1) : null, status, netSales: r.grossSales - r.cancelledAmount };
    })
    .sort((a, b) => b.netSales - a.netSales);
}

export function filterOrdersByRange(orders, start, end, storeId) {
  return (orders || []).filter(o => {
    if (storeId && storeId !== 'all' && String(o.StoreId) !== String(storeId)) return false;
    const d = dateOnly(o.CreatedAt);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

// range = 'today' | จำนวนวัน | 'month' (ใช้ month = 'YYYY-MM' ; ช่วงก่อนหน้า = เดือนก่อน) | 'custom' (ใช้ custom = { start, end } ; ช่วงก่อนหน้า = ช่วงที่ยาวเท่ากันก่อนวันเริ่ม)
export function getPeriodBounds(range, month, custom) {
  if (range === 'custom' && custom && custom.start && custom.end && custom.start <= custom.end) {
    const n = daysInclusive(custom.start, custom.end);
    const prevEnd = shiftDay(custom.start, -1);
    return { currStart: custom.start, currEnd: custom.end, prevStart: shiftDay(prevEnd, -(n - 1)), prevEnd };
  }
  if (range === 'month' && /^\d{4}-\d{2}$/.test(month || '')) {
    const [y, m] = month.split('-').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    const lastDay = (yy, mm) => new Date(yy, mm, 0).getDate();
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    return {
      currStart: `${month}-01`, currEnd: `${month}-${pad(lastDay(y, m))}`,
      prevStart: `${py}-${pad(pm)}-01`, prevEnd: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}`,
    };
  }
  const days = range === 'today' ? 1 : (Number(range) || 7);
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return {
    currStart: dateOnly(start), currEnd: dateOnly(end),
    prevStart: dateOnly(prevStart), prevEnd: dateOnly(prevEnd),
  };
}

export function buildSalesTrend(orders, range) {
  const completed = (orders || []).filter(isSettled);
  if (range === 'today') {
    const todayStr = dateOnly(new Date());
    const buckets = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, '0')}:00`, value: 0 }));
    completed.forEach(o => {
      const dt = parseOrderDate(o.CreatedAt);
      if (!dt || dateOnly(dt) !== todayStr) return;
      buckets[dt.getHours()].value += moneyOf(o);
    });
    return buckets;
  }
  const days = Number(range) || 7;
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets.push({ label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, key: dateOnly(d), value: 0 });
  }
  completed.forEach(o => {
    const key = dateOnly(o.CreatedAt);
    const bucket = buckets.find(b => b.key === key);
    if (bucket) bucket.value += moneyOf(o);
  });
  return buckets;
}

export function buildTopMenu(orders, storeId, limit = 10, stores = []) {
  const map = {};
  const storeNameById = {};
  (stores || []).forEach(s => { storeNameById[s.StoreId] = s.StoreName; });
  (orders || []).forEach(o => {
    if (!isSettled(o)) return;
    if (storeId && storeId !== 'all' && String(o.StoreId) !== String(storeId)) return;
    const items = o.OrderItems || o.Items || o.orderItems || o.items || [];
    items.forEach(it => {
      const name = it.MenuName || it.ItemName || it.ProductName || it.Name || it.menuName || '-';
      const qty = Number(it.Quantity || it.Qty || it.quantity || 1);
      // แยกนับตามร้าน: เมนูชื่อเดียวกันแต่คนละร้านจะไม่ถูกรวมกัน
      const key = `${o.StoreId}||${name}`;
      if (!map[key]) map[key] = { name, qty: 0, storeId: o.StoreId, storeName: o.StoreName || storeNameById[o.StoreId] || `ร้าน #${o.StoreId}` };
      map[key].qty += qty;
    });
  });
  return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, limit);
}

// แยกรายการเมนูของร้านที่เลือก (Sales Summary) — orders ควรผ่านการกรองช่วงวันที่มาแล้ว
//  - ขายได้ = ออเดอร์ Completed/NoShow ; ยกเลิก = ออเดอร์ Cancelled (ไม่รวมออเดอร์ที่ยังดำเนินการ/รอยืนยันยกเลิก)
//  - จำนวนที่ยกเลิก นับทุกออเดอร์ Cancelled (รวมสลิปถูกปฏิเสธ) แต่ยอดเงินตัดออเดอร์ REJECTED ออก (moneyOf) เหมือน buildStoreSummary
//  - ยอดเงินต่อเมนู = แบ่งสัดส่วนจาก TotalAmount ของออเดอร์ตามมูลค่าแต่ละรายการ จึงรวมแล้วเท่ากับยอดร้านเสมอ (ไม่นับซ้ำ/ไม่ตกหล่น)
//  - recorded = ยอดรวมก่อนหักยกเลิก (สำเร็จ + ยกเลิก ที่ไม่ใช่ REJECTED) = grossSales ระดับร้าน → คอลัมน์ "ยอดขาย"
//  - ยอดสุทธิ = recorded - cancelledAmount เช่นเดียวกับ netSales ระดับร้าน (หักยกเลิกครั้งเดียว)
//  - salesAmount = เฉพาะออเดอร์ที่สำเร็จ (ไม่ได้แสดงในตารางแล้ว แต่คงไว้เป็นข้อมูลอ้างอิง)
export const MENU_NAME_UNKNOWN = 'ไม่พบรายการเมนูในออเดอร์';

export function buildMenuBreakdown(orders, storeId) {
  const map = {};
  const rowOf = (name, unknown) => {
    if (!map[name]) map[name] = { name, unknown: Boolean(unknown), soldQty: 0, salesAmount: 0, cancelledQty: 0, cancelledAmount: 0, recorded: 0 };
    return map[name];
  };
  dedupeOrders(orders).forEach(o => {
    if (storeId && storeId !== 'all' && String(o.StoreId) !== String(storeId)) return;
    const st = normStatus(o.Status);
    if (!RECORDED_STATUSES.includes(st)) return;
    const settled = SETTLED_STATUSES.includes(st);
    const total = moneyOf(o);
    // รวมรายการเมนูชื่อเดียวกันในออเดอร์เดียวกัน และข้ามแถวที่ซ้ำ id เดียวกัน
    const seenItem = new Set();
    const lines = {};
    orderItemsOf(o).forEach(it => {
      const iid = it.OrderItemId ?? it.OrderItemID ?? it.OrderDetailId ?? it.OrderDetailID;
      if (iid !== undefined && iid !== null) { if (seenItem.has(String(iid))) return; seenItem.add(String(iid)); }
      const name = String(it.MenuName || it.ItemName || it.ProductName || it.Name || it.menuName || '-');
      const qty = Number(it.Quantity ?? it.Qty ?? it.quantity ?? 1) || 0;
      const unit = Number(it.UnitPrice ?? it.Price ?? it.unitPrice ?? 0) || 0;
      const lineVal = Number(it.LineTotal ?? it.Subtotal ?? it.TotalPrice ?? qty * unit) || 0;
      if (!lines[name]) lines[name] = { qty: 0, val: 0 };
      lines[name].qty += qty;
      lines[name].val += lineVal;
    });
    const names = Object.keys(lines);
    const alloc = {};
    if (names.length === 0) {
      alloc[MENU_NAME_UNKNOWN] = { qty: 0, amt: total, unknown: true };
    } else {
      const sumVal = names.reduce((a, n) => a + lines[n].val, 0);
      const sumQty = names.reduce((a, n) => a + lines[n].qty, 0);
      names.forEach(n => {
        const w = sumVal > 0 ? lines[n].val / sumVal : sumQty > 0 ? lines[n].qty / sumQty : 1 / names.length;
        alloc[n] = { qty: lines[n].qty, amt: total * w };
      });
    }
    Object.keys(alloc).forEach(n => {
      const r = rowOf(n, alloc[n].unknown);
      if (settled) { r.soldQty += alloc[n].qty; r.salesAmount += alloc[n].amt; }
      else { r.cancelledQty += alloc[n].qty; r.cancelledAmount += alloc[n].amt; }
      r.recorded += alloc[n].amt;
    });
  });
  return Object.values(map)
    .map(r => ({ ...r, netSales: r.recorded - r.cancelledAmount }))
    .sort((a, b) => b.netSales - a.netSales || b.salesAmount - a.salesAmount || b.soldQty - a.soldQty || String(a.name).localeCompare(String(b.name), 'th'));
}

// ยอดขายตามช่วงวันที่ที่เลือก (Sales Summary): วันเดียว = รายชั่วโมง, หลายวัน = รายวัน
export function buildRangeTrend(orders, start, end) {
  const completed = (orders || []).filter(isSettled);
  if (!start || !end || start > end) return [];
  if (start === end) {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, '0')}:00`, value: 0 }));
    completed.forEach(o => {
      const dt = parseOrderDate(o.CreatedAt);
      if (!dt || dateOnly(dt) !== start) return;
      buckets[dt.getHours()].value += moneyOf(o);
    });
    return buckets;
  }
  const buckets = [];
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cur <= last && buckets.length < 366) {
    buckets.push({ label: `${String(cur.getDate()).padStart(2, '0')}/${String(cur.getMonth() + 1).padStart(2, '0')}`, key: dateOnly(cur), value: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  const index = {};
  buckets.forEach(b => { index[b.key] = b; });
  completed.forEach(o => {
    const b = index[dateOnly(o.CreatedAt)];
    if (b) b.value += moneyOf(o);
  });
  return buckets;
}
