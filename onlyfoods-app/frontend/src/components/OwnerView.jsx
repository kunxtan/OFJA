import React, { useState, useEffect, useRef, useMemo } from 'react';
import { startPolling } from '../utils/polling';
import { createPortal } from 'react-dom';
import RefundLog from './RefundLog';

/* ============================================================
   OF Shop Owner — แดชบอร์ดเจ้าของร้านค้า (Executive Theme Colors)
   ============================================================ */

const fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// --- Helper Functions สำหรับคำนวณกราฟแบบ Executive ---
function parseOrderDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const normalized = String(value).trim().replace(' ', 'T');
  const alreadyHasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  // backend ส่งเวลาไทยแบบไม่มี timezone (เช่น 2026-10-10T15:14:47) : ต้องอ่านเป็น +07:00
  // เดิมเติม Z (UTC) ทำให้เวลาบนกราฟ/รายงานเลื่อนไป 7 ชั่วโมง
  const parsed = new Date(alreadyHasTimezone ? normalized : `${normalized}+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const pad2 = (n) => String(n).padStart(2, '0');
function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function todayISO() {
  return toISODate(new Date());
}
function rangeDayCount(startISO, endISO) {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

// ช่วงเวลาที่กำลังดู (เหมือนหน้า Executive): ย้อนหลัง N วันถึงวันที่เลือก หรือช่วงที่กำหนดเอง
function resolvePeriod({ anchor, days, custom, customStart, customEnd }) {
  const startISO = custom
    ? customStart
    : toISODate(new Date(new Date(`${anchor}T00:00:00`).setDate(new Date(`${anchor}T00:00:00`).getDate() - days + 1)));
  const endISO = custom ? customEnd : anchor;
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return { start, end, days: rangeDayCount(startISO, endISO), startISO, endISO };
}

function orderIs(order, status) {
  return String(order.Status || '').toLowerCase() === status.toLowerCase();
}

// ---- ยอดขาย: นิยามเดียวกับ backend (reports.dashboard / v_order_net) ใช้ทุกหน้า ----
// ออเดอร์ที่นับเป็นยอดขาย = สำเร็จ + ไม่มารับ (ลูกค้าจ่ายแล้ว ร้านทำแล้ว ไม่มีการคืนเงิน) ; ยกเลิกไม่นับ
const isNoShowOrder = (o) => o.StatusCode === 'NO_SHOW' || orderIs(o, 'NoShow');
const isRevenueOrder = (o) => o.StatusCode === 'COMPLETED' || o.StatusCode === 'NO_SHOW' || orderIs(o, 'Completed') || orderIs(o, 'NoShow');
// เงินที่รับจริง = การชำระที่ยืนยันแล้วทุกใบ (ค่าอาหาร + ส่วนต่างที่โอนเพิ่ม) ; ไม่มีข้อมูลการชำระ -> TotalAmount
// (ไม่ใช้ TotalAmount ตรง ๆ เพราะเปลี่ยนเมนูถูกลงแล้ว TotalAmount ลดทันที ทั้งที่ยังไม่ได้คืนเงินจริง)
function orderReceived(o) {
  const paid = (o.Payments || []).filter(p => p.PaymentStatus === 'VERIFIED');
  return paid.length ? paid.reduce((acc, p) => acc + Number(p.Amount || 0), 0) : Number(o.TotalAmount || 0);
}
// ยอดสุทธิของออเดอร์ = เงินที่รับจริง − เงินคืน (refundedByOrder: { OrderId: ยอดคืนที่คืนแล้ว + รอลูกค้ามารับ })
const orderNet = (o, refundedByOrder) => orderReceived(o) - Number(refundedByOrder?.[o.OrderID] || 0);

// วันเดียว = รายชั่วโมง 24 จุด ; หลายวัน = รายวัน
// วันเดียว = รายชั่วโมง (เฉพาะช่วงเวลาทำการของศูนย์อาหาร) ; หลายวัน = รายวัน
function buildBuckets(completedOrders, period, hourRange, valueOf = (o) => Number(o.TotalAmount || 0)) {
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
function hoursFromSchedule(openTime, closeTime) {
  const toMin = (t) => {
    const [h, m] = String(t || '').split(':').map(Number);
    return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
  };
  const o = toMin(openTime);
  const c = toMin(closeTime);
  if (o === null || c === null || c <= o) return null;
  return { from: Math.floor(o / 60), to: Math.max(Math.floor(o / 60), Math.ceil(c / 60) - 1) };
}

// "เมื่อสักครู่" / "5 นาทีที่แล้ว" / "3 ชั่วโมงที่แล้ว" / "2 วันที่แล้ว" / วันที่
function timeAgo(value) {
  const d = parseOrderDate(value);
  if (!d) return '-';
  const diff = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'เมื่อสักครู่';
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} วันที่แล้ว`;
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

function thaiDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d.getDate()} ${m[d.getMonth()]} ${(d.getFullYear() + 543) % 100}`;
}

// เปอร์เซ็นต์เปลี่ยนแปลงเทียบช่วงก่อนหน้า (null = เทียบไม่ได้)
function changePct(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return null;
  return ((c - p) / p) * 100;
}

// สรุปตัวเลขหลักของชุดออเดอร์ (สูตรเดียวกับหน้า Executive)
function summarizeOrders(orders, refundedByOrder) {
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
function summarizeMenus(completedOrders) {
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
function buildStoreReport(orders, storeId, period, hourRange, refundedByOrder) {
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

const getStatusLabel = (status) => {
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

// --- Icons ---
function Icon({ name, size = 20 }) {
  const paths = {
    dashboard: <><path d="M4 4h6v8H4z" /><path d="M4 16h6v4H4z" /><path d="M14 12h6v8h-6z" /><path d="M14 4h6v4h-6z" /></>,
    menu: <><path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" /></>,
    cancel: <><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M9 12l6 0" /></>,
    history: <><path d="M12 8l0 4l2 2" /><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" /></>,
    check: <><path d="M5 12l5 5l10 -10" /></>,
    power: <><path d="M7 6a7.75 7.75 0 1 0 10 0" /><line x1="12" y1="4" x2="12" y2="12" /></>,
    settings: <><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0 -2.573-1.066c-1.543 .94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0 -1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543 .826-3.31 2.37-2.37c1 .608 2.296 .07 2.572-1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></>,
    clock: <><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 7v5l3 3" /></>,
    flame: <><path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z" /></>,
    bell: <><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/></>,
    user: <><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></>,
    logout: <><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></>,
    plus: <><path d="M12 5l0 14" /><path d="M5 12l14 0" /></>,
    crop: <><path d="M8 5v10a1 1 0 0 0 1 1h10" /><path d="M5 8h10a1 1 0 0 1 1 1v10" /></>,
    trend: <><path d="M3 17l6 -6l4 4l8 -8" /><path d="M14 7l7 0l0 7" /></>,
    arrowUp: <><path d="M12 5l0 14" /><path d="M18 11l-6 -6" /><path d="M6 11l6 -6" /></>,
    arrowDown: <><path d="M12 5l0 14" /><path d="M18 13l-6 6" /><path d="M6 13l6 6" /></>,
    arrowRight: <><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></>,
    receipt: <><path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2" /><path d="M9 7h6" /><path d="M9 11h6" /><path d="M13 15h2" /></>,
    percent: <><path d="M17 17m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M7 7m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M6 18l12 -12" /></>,
    coin: <><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M14.8 9a2 2 0 0 0 -1.8 -1h-2a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4h-2a2 2 0 0 1 -1.8 -1" /><path d="M12 7v10" /></>,
    pie: <><path d="M10 3.2a9 9 0 1 0 10.8 10.8a1 1 0 0 0 -1 -1h-6.8a2 2 0 0 1 -2 -2v-7a.9 .9 0 0 0 -1 -.8" /><path d="M15 3.5a9 9 0 0 1 5.5 5.5h-4.5a1 1 0 0 1 -1 -1v-4.5" /></>,
    award: <><path d="M12 9m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0" /><path d="M12 15l3.4 5.89l1.598 -3.233l3.598 .232l-3.4 -5.889" /><path d="M6.802 12l-3.4 5.89l3.598 -.233l1.598 3.232l3.4 -5.889" /></>,
    grid: <><path d="M4 4h6v6h-6z" /><path d="M14 4h6v6h-6z" /><path d="M4 14h6v6h-6z" /><path d="M14 14h6v6h-6z" /></>,
    list: <><path d="M9 6l11 0" /><path d="M9 12l11 0" /><path d="M9 18l11 0" /><path d="M5 6l0 .01" /><path d="M5 12l0 .01" /><path d="M5 18l0 .01" /></>,
    close: <><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></>,
    upload: <><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 9l5 -5l5 5" /><path d="M12 4l0 12" /></>,
    search: <><path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></>,
    box: <><path d="M12 3l8 4.5v9l-8 4.5l-8 -4.5v-9l8 -4.5" /><path d="M12 12l8 -4.5" /><path d="M12 12v9" /><path d="M12 12l-8 -4.5" /></>,
    soldout: <><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M5.7 5.7l12.6 12.6" /></>,
    photo: <><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" /></>,
    trash: <><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></>,
    edit: <><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" /></>,
    users: <><path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" /></>,
    star: <><path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z" /></>,
    alert: <><path d="M12 9v2m0 4v.01M5.07 19H18.93c1.93 0 2.89-2.34 1.53-3.71L13.53 4.29c-.77-1.34-2.29-1.34-3.06 0L3.54 15.29c-1.36 1.37-.4 3.71 1.53 3.71z"/></>,
    calendar: <><path d="M7 3v4M17 3v4M3 9h18M5 5h14v16H5z" /></>,
    phone: <><path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" /></>,
    mail: <><path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10z" /><path d="M3 7l9 6l9 -6" /></>,
    key: <><path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0z" /><path d="M15 9h.01" /></>,
    lock: <><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></>,
    eye: <><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" /></>,
    eyeOff: <><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" /><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" /><path d="M3 3l18 18" /></>,
    activity: <><path d="M3 12h4l3 8l4 -16l3 8h4" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Badge({ tone, children }) {
  return <span className={`berry-badge tone-${tone}`}>{children}</span>;
}

function StorePeriodPicker({ anchor, setAnchor, days, setDays, custom, setCustom, startDate, setStartDate, endDate, setEndDate }) {
  const choosePreset = (value) => { setCustom(false); setDays(value); };
  return (
    <div className="berry-period-picker">
      <div className="berry-period-group">
        {[1, 7, 14, 30].map(value => (
          <button
            key={value}
            type="button"
            onClick={() => choosePreset(value)}
            className={`berry-period-btn ${!custom && days === value ? 'active' : ''}`}
          >
            {value === 1 ? 'วันนี้' : `${value} วัน`}
          </button>
        ))}
        <button type="button" onClick={() => setCustom(true)} className={`berry-period-btn ${custom ? 'active' : ''}`}>
          กำหนดเอง
        </button>
      </div>
      {custom ? (
        <div className="berry-date-range">
          <label>
            ตั้งแต่วันที่
            <input
              type="date"
              value={startDate}
              max={endDate || todayISO()}
              onChange={e => { const v = e.target.value || todayISO(); setStartDate(v); if (v > endDate) setEndDate(v); }}
              aria-label="ตั้งแต่วันที่"
            />
          </label>
          <label>
            ถึงวันที่
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={todayISO()}
              onChange={e => setEndDate(e.target.value || todayISO())}
              aria-label="ถึงวันที่"
            />
          </label>
        </div>
      ) : (
        <div className="berry-date-wrap">
          <Icon name="calendar" size={16} />
          <input type="date" value={anchor} max={todayISO()} onChange={e => setAnchor(e.target.value || todayISO())} aria-label="เลือกวันที่สิ้นสุด" />
        </div>
      )}
    </div>
  );
}

// หัวหน้าแบบเดียวกันทุกหน้า: ชื่อหน้า + คำอธิบาย + ปุ่ม/ข้อมูลด้านขวา
function PageHeader({ title, subtitle, icon, children }) {
  return (
    <div className="op-page-head">
      <div className="op-page-title">
        {icon && <span className="op-page-icon"><Icon name={icon} size={22} /></span>}
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children && <div className="op-page-actions">{children}</div>}
    </div>
  );
}

// กล่องเทาวิ่งระหว่างโหลดข้อมูลครั้งแรก
function Skeleton({ height = 16, width = '100%', radius = 8, style }) {
  return <span className="op-skel" style={{ height, width, borderRadius: radius, ...style }} />;
}

// กราฟเส้นเล็กในการ์ดสรุป
function Sparkline({ buckets }) {
  const data = (buckets || []).map(b => b.sales);
  if (data.length < 2 || !data.some(v => v > 0)) {
    return <div className="od-spark-empty">ยังไม่มียอดขายในช่วงนี้</div>;
  }
  const W = 260, H = 70, P = 4;
  const max = Math.max(...data, 1);
  const x = (i) => P + (i / (data.length - 1)) * (W - P * 2);
  const y = (v) => H - P - (v / max) * (H - P * 2);
  const line = data.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="od-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line} L ${x(data.length - 1)} ${H} L ${x(0)} ${H} Z`} fill="rgba(255,255,255,0.18)" />
      <path d={line} fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ป้ายเปรียบเทียบกับช่วงก่อนหน้า (▲ เขียว / ▼ แดง ; invert = ยิ่งน้อยยิ่งดี เช่นการยกเลิก)
function DeltaChip({ delta, label, suffix = '%', invert = false, solid = false, hasPreviousData, hint }) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) {
    return <div className={`od-delta-empty ${solid ? 'on-solid' : ''}`}>{hint || (hasPreviousData === false ? 'ไม่มีข้อมูลช่วงก่อนหน้าให้เทียบ' : 'ไม่มีข้อมูลช่วงก่อนหน้าให้เทียบ')}</div>;
  }
  const flat = Math.abs(delta) < 0.05;
  const good = invert ? delta <= 0 : delta >= 0;
  const tone = flat ? 'flat' : good ? 'up' : 'down';
  const abs = Math.abs(delta);
  return (
    <div className={`od-delta ${tone} ${solid ? 'on-solid' : ''}`}>
      <Icon name={flat ? 'arrowRight' : delta > 0 ? 'arrowUp' : 'arrowDown'} size={13} />
      {delta < 0 ? '-' : ''}{Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(1)}{suffix}
      <span>{label}</span>
    </div>
  );
}

function KpiSmall({ tone, icon, value, unit, label, children }) {
  return (
    <div className="od-kpi">
      <div className="od-kpi-main">
        <div className={`od-kpi-icon tone-${tone}`}><Icon name={icon} size={20} /></div>
        <div style={{ minWidth: 0 }}>
          <div className="od-kpi-value">{value}{unit && <small>{unit}</small>}</div>
          <div className="od-kpi-label">{label}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

const MENU_COLORS = ['#FF724C', '#FDBF50', '#2A2C41', '#17A673', '#FF9E84', '#585B78', '#E8552D', '#B9BCCD'];

// แผนภาพวงกลม: สัดส่วนยอดขายแยกตามเมนู (7 อันดับแรก + เมนูอื่น ๆ)
function MenuDonutChart({ rows }) {
  const [hovered, setHovered] = useState(null);
  const raw = (rows || []).filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount);
  if (!raw.length) {
    return (
      <div className="od-empty">
        <Icon name="pie" size={30} />
        <span>ช่วงเวลานี้ยังไม่มียอดขาย</span>
      </div>
    );
  }
  const top = raw.slice(0, 7);
  const rest = raw.slice(7).reduce((acc, r) => acc + r.amount, 0);
  const list = rest > 0 ? [...top, { id: 'other', name: 'เมนูอื่น ๆ', amount: rest, qty: raw.slice(7).reduce((a, r) => a + r.qty, 0) }] : top;
  const total = list.reduce((acc, r) => acc + r.amount, 0) || 1;
  let cumulative = 0;
  const stops = list.map((r, i) => {
    const from = cumulative;
    cumulative += (r.amount / total) * 100;
    return `${MENU_COLORS[i % MENU_COLORS.length]} ${from}% ${cumulative}%`;
  }).join(', ');

  const hoverDonut = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist < rect.width * 0.33 || dist > rect.width / 2) { setHovered(null); return; }
    const pct = ((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360) / 3.6;
    let acc = 0;
    setHovered(list.find(r => { acc += (r.amount / total) * 100; return pct <= acc; }) || list[list.length - 1]);
  };

  return (
    <div className="od-donut-wrap">
      <div className="od-donut-box">
        <div className="od-donut" style={{ background: `conic-gradient(${stops})` }} onMouseMove={hoverDonut} onMouseLeave={() => setHovered(null)}>
          <div className="od-donut-hole" />
        </div>
        <div className="od-donut-center">
          {hovered ? (
            <>
              <div className="name">{hovered.name}</div>
              <strong>{fmtMoney(hovered.amount)}</strong>
              <span>บาท · {((hovered.amount / total) * 100).toFixed(1)}%</span>
            </>
          ) : (
            <>
              <div className="name muted">ยอดขายรวม</div>
              <strong>{fmtMoney(total)}</strong>
              <span>บาท</span>
            </>
          )}
        </div>
      </div>
      <div className="od-legend">
        {list.map((r, i) => {
          const active = hovered && hovered.id === r.id;
          return (
            <div key={r.id} className={`od-legend-row ${active ? 'active' : ''}`} onMouseEnter={() => setHovered(r)} onMouseLeave={() => setHovered(null)}>
              <span className="swatch" style={{ background: MENU_COLORS[i % MENU_COLORS.length] }} />
              <span className="name" title={r.name}>{r.name}</span>
              <span className="amount">{fmtMoney(r.amount)} ฿</span>
              <span className="pct">{((r.amount / total) * 100).toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// เมนูขายดี 5 อันดับแรก พร้อมรายละเอียด
function TopMenuList({ rows, products }) {
  const top = (rows || []).slice(0, 5);
  if (!top.length) {
    return (
      <div className="od-empty">
        <Icon name="award" size={30} />
        <span>ช่วงเวลานี้ยังไม่มีเมนูที่ขายได้</span>
      </div>
    );
  }
  const maxQty = Math.max(...top.map(r => r.qty), 1);
  const productById = Object.fromEntries((products || []).map(p => [String(p.ProductId), p]));
  return (
    <div className="od-top-list">
      {top.map((r, i) => {
        const product = productById[r.id];
        const avgPrice = r.qty ? r.amount / r.qty : 0;
        return (
          <div key={r.id} className="od-top-row">
            <div className={`od-rank rank-${i + 1}`}>{i + 1}</div>
            <div className="od-top-thumb">
              {product?.img ? <img src={product.img} alt="" /> : <Icon name="photo" size={20} />}
            </div>
            <div className="od-top-info">
              <div className="od-top-head">
                <div className="od-top-name" title={r.name}>{r.name}</div>
                <div className="od-top-qty"><strong>{fmtMoney(r.qty)}</strong> จาน</div>
              </div>
              <div className="od-top-bar"><div style={{ width: `${Math.max((r.qty / maxQty) * 100, 4)}%` }} /></div>
              <div className="od-top-meta">
                <span>ยอดขาย <b>{fmtMoney(r.amount)} บาท</b></span>
                <span>สัดส่วน <b>{r.share.toFixed(1)}%</b></span>
                <span>{fmtMoney(r.orderCount)} ออเดอร์</span>
                <span>เฉลี่ย {fmtMoney(avgPrice)} บาท/จาน</span>
                {product?.IsOutOfStock ? <span className="out">สินค้าหมดอยู่</span> : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// กราฟเส้นแนวโน้มยอดขาย (แบบเดียวกับหน้า Executive) ชี้ที่จุดเพื่อดูยอดขายของช่วงนั้น
function SalesLineChart({ buckets }) {
  const [hover, setHover] = useState(null);
  // จอแคบ: ใช้ผืนวาดเล็กลง ตัวหนังสือบนแกนจะได้ไม่เล็กเกินอ่าน
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 600);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= 600);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const data = buckets || [];
  if (!data.length) {
    return <div style={{ minHeight: '300px', display: 'grid', placeItems: 'center', color: 'var(--berry-text-muted)' }}>ช่วงเวลานี้ยังไม่มีออเดอร์ที่สำเร็จ</div>;
  }
  const W = narrow ? 380 : 880, H = narrow ? 240 : 320, L = narrow ? 40 : 66, R = narrow ? 12 : 22, TOP = 18, BOT = narrow ? 34 : 46;
  const gw = W - L - R, gh = H - TOP - BOT;
  const maxValue = Math.max(...data.map(b => b.sales), 1);
  const xAt = (i) => (data.length === 1 ? L + gw / 2 : L + (i / (data.length - 1)) * gw);
  const yAt = (v) => TOP + gh - (v / maxValue) * gh;
  const linePath = data.map((b, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(b.sales)}`).join(' ');
  const areaPath = `${linePath} L ${xAt(data.length - 1)} ${TOP + gh} L ${xAt(0)} ${TOP + gh} Z`;
  const labelStep = Math.max(1, Math.ceil(data.length / (narrow ? 5 : 10)));
  const shortNumber = (n) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(Math.round(n));
  const hoverBucket = hover !== null ? data[hover] : null;
  const hoverRatio = hover !== null ? xAt(hover) / W : 0;

  return (
    <div style={{ position: 'relative', marginTop: '10px' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="ownerAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF724C" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#FF724C" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map(i => {
          const ratio = i / 4;
          const y = TOP + gh * ratio;
          return (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y} y2={y} stroke="var(--berry-border)" strokeWidth="1" />
              <text x={L - 12} y={y + 4} textAnchor="end" fontSize="11" fill="var(--berry-text-muted)">{shortNumber(maxValue * (1 - ratio))}</text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#ownerAreaFill)" />
        <path d={linePath} fill="none" stroke="var(--berry-purple)" strokeWidth="2.4" strokeLinejoin="round" />

        {data.map((b, i) => (
          <g key={b.key}>
            {(i === data.length - 1 || (i % labelStep === 0 && data.length - 1 - i >= labelStep / 2)) && (
              <text x={xAt(i)} y={H - 16} textAnchor={data.length > 1 && i === 0 ? 'start' : data.length > 1 && i === data.length - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--berry-text-muted)">{b.label}</text>
            )}
            <circle cx={xAt(i)} cy={yAt(b.sales)} r={hover === i ? 5.5 : 3} fill={hover === i ? 'var(--berry-purple)' : 'var(--berry-paper)'} stroke="var(--berry-purple)" strokeWidth="2" />
            <rect
              x={xAt(i) - gw / data.length / 2}
              y={TOP}
              width={Math.max(gw / data.length, 10)}
              height={gh}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onTouchStart={() => setHover(i)}
              style={{ cursor: 'pointer' }}
            />
          </g>
        ))}

        {hover !== null && <line x1={xAt(hover)} x2={xAt(hover)} y1={TOP} y2={TOP + gh} stroke="var(--berry-purple)" strokeDasharray="4 4" strokeWidth="1" />}
        <line x1={L} x2={W - R} y1={TOP + gh} y2={TOP + gh} stroke="var(--berry-border)" />
      </svg>

      {hoverBucket && (
        <div
          className="berry-chart-tooltip"
          style={{
            left: `${hoverRatio * 100}%`,
            transform: hoverRatio > 0.7 ? 'translateX(-92%)' : hoverRatio < 0.3 ? 'translateX(-8%)' : 'translateX(-50%)'
          }}
        >
          <div style={{ color: 'var(--berry-text-dark)', fontWeight: 700, fontSize: '13px' }}>{hoverBucket.label}</div>
          <div style={{ color: 'var(--berry-text-dark)', fontSize: '13px', marginTop: '4px' }}>
            ยอดขาย {fmtMoney(hoverBucket.sales)} บาท · {fmtMoney(hoverBucket.count)} ออเดอร์
          </div>
        </div>
      )}
    </div>
  );
}

// --- กล่องยืนยันการลบ (แทน window.confirm ของเบราว์เซอร์) ---
function ConfirmDeleteDialog({ state, busy, onCancel, onConfirm }) {
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, busy, onCancel]);

  if (!state) return null;
  return (
    <div className="berry-confirm-overlay" onClick={() => { if (!busy) onCancel(); }}>
      <div className="berry-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="berry-confirm-title" onClick={e => e.stopPropagation()}>
        <div className={`berry-confirm-icon tone-${state.tone || 'danger'}`}><Icon name={state.icon || 'trash'} size={28} /></div>
        <h3 id="berry-confirm-title">{state.title}</h3>
        <p>
          {state.prefix} <strong>"{state.name}"</strong> {state.suffix}
        </p>
        {state.warn !== null && <div className="berry-confirm-warn">{state.warn || 'การลบนี้ไม่สามารถย้อนกลับได้'}</div>}
        <div className="berry-confirm-actions">
          <button type="button" className="berry-confirm-btn cancel" onClick={onCancel} disabled={busy} autoFocus>
            {state.blocked ? 'รับทราบ' : 'ยกเลิก'}
          </button>
          {!state.blocked && (
            <button type="button" className="berry-confirm-btn danger" onClick={onConfirm} disabled={busy}>
              {busy ? <span className="berry-spinner" /> : <Icon name={state.icon || 'trash'} size={16} />}
              {busy ? (state.busyText || 'กำลังลบ...') : state.confirmText || 'ยืนยันการลบ'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- แอนิเมชันติ๊กถูกกลางจอ หลังทำรายการสำเร็จ ---
function SuccessOverlay({ state }) {
  if (!state) return null;
  return (
    <div className={`berry-success-overlay ${state.leaving ? 'leaving' : ''}`} role="status" aria-live="polite">
      <div className="berry-success-card">
        <svg className="berry-success-check" viewBox="0 0 52 52" aria-hidden="true">
          <circle className="circle" cx="26" cy="26" r="24" fill="none" />
          <path className="tick" fill="none" d="M15 27 l7 7 l15 -15" />
        </svg>
        <div className="berry-success-title">{state.title}</div>
        {state.detail && <div className="berry-success-detail">{state.detail}</div>}
      </div>
    </div>
  );
}

// --- อัปโหลดรูปเมนู: ไม่บังคับใส่ แต่ถ้าใส่ต้องผ่านการตรวจจริง ---
// ต้องตรงกับที่ backend รับ (utils.save_image): png / jpeg / webp / gif และไม่เกิน MAX_IMAGE_BYTES (5 MB)
const MAX_IMAGE_MB = 5;
const DESCRIPTION_MAX = 500; // ตรงกับ Product.Description VARCHAR(500)
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const formatBytes = (bytes) => bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// อ่านไฟล์ + ตรวจชนิด ขนาด และว่าเปิดเป็นรูปได้จริง (กันไฟล์เสีย/เปลี่ยนนามสกุล)
function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      reject(new Error('รองรับเฉพาะไฟล์ PNG, JPG, WEBP หรือ GIF'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error(`ไฟล์มีขนาด ${formatBytes(file.size)} เกินกำหนด ${MAX_IMAGE_MB} MB`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์นี้ได้'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve({
        dataUrl: reader.result,
        info: { name: file.name, size: file.size, width: img.naturalWidth, height: img.naturalHeight },
      });
      img.onerror = () => reject(new Error('ไฟล์รูปเสียหรือไม่ใช่รูปภาพ'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// --- ครอปรูป: ลากเพื่อเลื่อน, เลื่อนแถบ/ล้อเมาส์เพื่อซูม, เลือกสัดส่วนได้ ---
const CROP_RATIOS = [
  { id: '4:3', label: '4:3', value: 4 / 3 },
  { id: '1:1', label: '1:1', value: 1 },
  { id: '16:9', label: '16:9', value: 16 / 9 },
];
const CROP_OUTPUT_MAX = 1200; // ความกว้างสูงสุดของรูปที่ส่งขึ้น server (px)

// ratios / title / outputMax / round : ใช้ซ้ำกับรูปโปรไฟล์พนักงาน (1:1 วงกลม) ได้
function ImageCropper({ src, onCancel, onConfirm, ratios = CROP_RATIOS, title = 'ครอปรูปเมนู', outputMax = CROP_OUTPUT_MAX, round = false }) {
  const [natural, setNatural] = useState(null); // { w, h }
  const [loadError, setLoadError] = useState('');
  const [ratioId, setRatioId] = useState(ratios[0].id);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [frameW, setFrameW] = useState(440);
  const [busy, setBusy] = useState(false);
  const stageRef = useRef(null);
  const dragRef = useRef(null);

  const ratio = (ratios.find(r => r.id === ratioId) || ratios[0]).value;
  const frameH = Math.round(frameW / ratio);
  const baseScale = natural ? Math.max(frameW / natural.w, frameH / natural.h) : 1;
  const scale = baseScale * zoom;

  const clamp = (p, sc = scale) => {
    if (!natural) return p;
    const minX = frameW - natural.w * sc;
    const minY = frameH - natural.h * sc;
    return { x: Math.min(0, Math.max(minX, p.x)), y: Math.min(0, Math.max(minY, p.y)) };
  };

  // วางรูปให้อยู่กลางกรอบ (ตอนโหลดเสร็จ / เปลี่ยนสัดส่วน / ปรับขนาดจอ)
  const centerImage = () => {
    if (!natural) return;
    const sc = Math.max(frameW / natural.w, frameH / natural.h);
    setZoom(1);
    setPos({ x: (frameW - natural.w * sc) / 2, y: (frameH - natural.h * sc) / 2 });
  };

  useEffect(() => {
    const measure = () => {
      const max = Math.min(460, window.innerWidth - 64);
      setFrameW(Math.max(220, Math.round(max)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => { centerImage(); }, [natural, ratioId, frameW]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onCancel(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onCancel]);

  // ซูมโดยรักษาจุดกึ่งกลางกรอบไว้ที่เดิม
  const applyZoom = (nextZoom) => {
    if (!natural) return;
    const z = Math.min(4, Math.max(1, nextZoom));
    const nextScale = baseScale * z;
    const cx = (frameW / 2 - pos.x) / scale;
    const cy = (frameH / 2 - pos.y) / scale;
    setZoom(z);
    setPos(clamp({ x: frameW / 2 - cx * nextScale, y: frameH / 2 - cy * nextScale }, nextScale));
  };

  const onPointerDown = (e) => {
    if (!natural) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: pos };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    setPos(clamp({ x: d.origin.x + (e.clientX - d.startX), y: d.origin.y + (e.clientY - d.startY) }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  // ล้อเมาส์ซูม (ต้องผูกแบบ passive: false จึงกัน scroll หน้าได้)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const confirmCrop = () => {
    if (!natural) return;
    setBusy(true);
    const img = new Image();
    img.onload = () => {
      const sx = -pos.x / scale;
      const sy = -pos.y / scale;
      const sw = frameW / scale;
      const sh = frameH / scale;
      const outW = Math.max(1, Math.round(Math.min(outputMax, sw)));
      const outH = Math.max(1, Math.round(outW / ratio));
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; // พื้นขาวแทนส่วนโปร่งใส (บันทึกเป็น JPG)
      ctx.fillRect(0, 0, outW, outH);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      let dataUrl;
      try {
        dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      } catch (err) {
        setBusy(false);
        setLoadError('ไม่สามารถครอปรูปนี้ได้ กรุณาเลือกไฟล์รูปใหม่');
        return;
      }
      const bytes = Math.round(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);
      setBusy(false);
      onConfirm(dataUrl, { width: outW, height: outH, size: bytes });
    };
    img.onerror = () => { setBusy(false); setLoadError('ไม่สามารถครอปรูปนี้ได้'); };
    img.src = src;
  };

  // render ไว้ท้าย .berry-root (ได้ตัวแปรสีของธีม) เพื่อให้ลอยเหนือฟอร์มเมนูเสมอ
  return createPortal(
    <div className="crop-overlay" onClick={() => { if (!busy) onCancel(); }}>
      <div className="crop-modal" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="crop-head">
          <div>
            <h3>{title}</h3>
            <p>ลากรูปเพื่อจัดตำแหน่ง และซูมให้ได้ส่วนที่ต้องการ</p>
          </div>
          {ratios.length > 1 && (
            <div className="crop-ratios" role="group" aria-label="สัดส่วนรูป">
              {ratios.map(r => (
                <button key={r.id} type="button" className={ratioId === r.id ? 'active' : ''} onClick={() => setRatioId(r.id)} disabled={busy}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          ref={stageRef}
          className="crop-stage"
          style={{ width: frameW, height: frameH }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onError={() => setLoadError('ไม่สามารถเปิดรูปนี้ได้')}
            style={natural ? {
              width: natural.w * scale,
              height: natural.h * scale,
              transform: `translate(${pos.x}px, ${pos.y}px)`,
            } : { opacity: 0 }}
          />
          <div className="crop-grid" aria-hidden="true">
            <span /><span /><span /><span />
          </div>
          {round && <div className="crop-round-mask" aria-hidden="true" />}
        </div>

        <div className="crop-zoom">
          <button type="button" onClick={() => applyZoom(zoom - 0.25)} disabled={busy || zoom <= 1} aria-label="ซูมออก">−</button>
          <input
            type="range"
            min="1"
            max="4"
            step="0.01"
            value={zoom}
            onChange={e => applyZoom(Number(e.target.value))}
            disabled={busy || !natural}
            aria-label="ระดับการซูม"
          />
          <button type="button" onClick={() => applyZoom(zoom + 0.25)} disabled={busy || zoom >= 4} aria-label="ซูมเข้า">+</button>
          <button type="button" className="crop-reset" onClick={centerImage} disabled={busy || !natural}>รีเซ็ต</button>
        </div>

        {loadError && <div className="mf-field-error" style={{ textAlign: 'center' }}>{loadError}</div>}

        <div className="crop-footer">
          <button type="button" className="mf-btn ghost" onClick={onCancel} disabled={busy}>ยกเลิก</button>
          <button type="button" className="mf-btn primary" onClick={confirmCrop} disabled={busy || !natural}>
            {busy ? <span className="berry-spinner" /> : <Icon name="crop" size={17} />}
            {busy ? 'กำลังครอป...' : 'ใช้รูปนี้'}
          </button>
        </div>
      </div>
    </div>,
    document.querySelector('.berry-root') || document.body
  );
}

function ImageUploadZone({ image, originalImage = '', onChange, disabled }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  const [cropSrc, setCropSrc] = useState(null); // รูปที่กำลังครอปอยู่
  const fileInputRef = useRef(null);
  const isNewImage = Boolean(image) && image !== originalImage;

  // เลือกไฟล์ -> ตรวจชนิด/ขนาด/เปิดได้จริง -> เปิดหน้าครอปทันที
  const processFile = async (file) => {
    if (!file || disabled) return;
    try {
      const result = await readImageFile(file);
      setError('');
      setCropSrc(result.dataUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  const openPicker = () => { if (!disabled) fileInputRef.current?.click(); };
  const resetImage = () => { setInfo(null); setError(''); onChange(originalImage || ''); };

  const handleCropped = (dataUrl, meta) => {
    if (meta.size > MAX_IMAGE_BYTES) {
      setError(`รูปหลังครอปมีขนาด ${formatBytes(meta.size)} เกินกำหนด ${MAX_IMAGE_MB} MB`);
      setCropSrc(null);
      return;
    }
    setError('');
    setInfo(meta);
    setCropSrc(null);
    onChange(dataUrl);
  };

  return (
    <div>
      <input
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={e => { processFile(e.target.files[0]); e.target.value = ''; }}
      />

      {image ? (
        <div className="mf-image-preview">
          <img src={image} alt="ตัวอย่างรูปเมนู" />
          <div className="mf-image-meta">
            <div className="mf-image-name">
              {isNewImage ? 'รูปใหม่ (ครอปแล้ว)' : 'รูปปัจจุบันของเมนู'}
            </div>
            <div className="mf-image-sub">
              {isNewImage && info ? `${formatBytes(info.size)} · ${info.width}×${info.height}px` : 'อัปโหลดไว้แล้ว'}
            </div>
            <div className="mf-image-actions">
              <button type="button" className="mf-link-btn" onClick={() => setCropSrc(image)} disabled={disabled}>
                <Icon name="crop" size={15} /> ครอปรูป
              </button>
              <button type="button" className="mf-link-btn" onClick={openPicker} disabled={disabled}>
                <Icon name="upload" size={15} /> เปลี่ยนรูป
              </button>
              {(isNewImage || !originalImage) && (
                <button type="button" className="mf-link-btn danger" onClick={resetImage} disabled={disabled}>
                  <Icon name="close" size={15} /> {originalImage ? 'ใช้รูปเดิม' : 'นำรูปออก'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`mf-dropzone ${isDragging ? 'dragging' : ''} ${error ? 'has-error' : ''}`}
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]); }}
        >
          <div className="mf-dropzone-icon"><Icon name="photo" size={26} /></div>
          <div className="mf-dropzone-title">
            <span>คลิกเพื่อเลือกรูป</span> หรือลากไฟล์มาวางที่นี่
          </div>
          <div className="mf-dropzone-hint">PNG, JPG, WEBP, GIF · ไม่เกิน {MAX_IMAGE_MB} MB · ครอปได้หลังเลือก</div>
        </div>
      )}

      {error && <div className="mf-field-error">{error}</div>}

      {cropSrc && (
        <ImageCropper src={cropSrc} onCancel={() => setCropSrc(null)} onConfirm={handleCropped} />
      )}
    </div>
  );
}

// --- ฟอร์มเพิ่ม/แก้ไขเมนู (ใช้ร่วมกันทั้งสองโหมด) ---
function MenuFormModal({ mode, product, onClose, onSubmit }) {
  const isEdit = mode === 'edit';
  const originalImage = isEdit ? (product?.img || '') : '';
  const [name, setName] = useState(isEdit ? product?.ProductName || '' : '');
  const [price, setPrice] = useState(isEdit ? String(product?.UnitPrice ?? '') : '');
  const [description, setDescription] = useState(isEdit ? product?.Description || '' : '');
  const [image, setImage] = useState(originalImage);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    const trimmed = name.trim();
    const priceNum = Number(price);
    if (!trimmed) next.name = 'กรุณาระบุชื่อเมนู';
    else if (trimmed.length > 100) next.name = 'ชื่อเมนูต้องไม่เกิน 100 ตัวอักษร';
    if (price === '' || Number.isNaN(priceNum)) next.price = 'กรุณาระบุราคา';
    else if (priceNum < 0) next.price = 'ราคาต้องไม่ติดลบ';
    else if (priceNum > 99999999) next.price = 'ราคาสูงเกินไป';
    if (description.trim().length > DESCRIPTION_MAX) next.description = `รายละเอียดต้องไม่เกิน ${DESCRIPTION_MAX} ตัวอักษร`;
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      await onSubmit({ name: trimmed, price: priceNum, img: image, description: description.trim() });
    } catch (err) {
      setErrors({ form: err.message || 'บันทึกไม่สำเร็จ' });
      setSaving(false);
    }
  };

  return (
    <div className="berry-modal-overlay mf-overlay" onClick={() => { if (!saving) onClose(); }}>
      <div className="mf-modal" role="dialog" aria-modal="true" aria-labelledby="mf-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head">
          <div className="mf-head-icon"><Icon name={isEdit ? 'edit' : 'plus'} size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="mf-title">{isEdit ? 'แก้ไขเมนู' : 'เพิ่มเมนูใหม่'}</h3>
            <p>{isEdit ? 'ปรับชื่อ รายละเอียด ราคา หรือรูปของเมนูนี้' : 'กรอกข้อมูลเมนูที่จะเปิดขายในร้าน'}</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} disabled={saving} aria-label="ปิด">
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="mf-body">
            <div className="mf-field">
              <label htmlFor="mf-name">ชื่อเมนู <span className="req">*</span></label>
              <input
                id="mf-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="เช่น ข้าวกะเพราหมูสับ"
                maxLength={100}
                className={errors.name ? 'invalid' : ''}
                disabled={saving}
                autoFocus
              />
              {errors.name && <div className="mf-field-error">{errors.name}</div>}
            </div>

            <div className="mf-field">
              <label htmlFor="mf-desc">
                รายละเอียดเมนู <span className="optional">ไม่บังคับ</span>
                <span className={`mf-counter ${description.length > DESCRIPTION_MAX ? 'over' : ''}`}>{description.length}/{DESCRIPTION_MAX}</span>
              </label>
              <textarea
                id="mf-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="เช่น ไข่ดาวเพิ่ม 10 บาท, เผ็ดน้อย/เผ็ดมากได้"
                maxLength={DESCRIPTION_MAX}
                rows={3}
                className={errors.description ? 'invalid' : ''}
                disabled={saving}
              />
              <div className="mf-hint">ลูกค้าจะเห็นข้อความนี้ใต้ชื่อเมนูตอนสั่งอาหาร</div>
              {errors.description && <div className="mf-field-error">{errors.description}</div>}
            </div>

            <div className="mf-field">
              <label htmlFor="mf-price">ราคา <span className="req">*</span></label>
              <div className={`mf-price ${errors.price ? 'invalid' : ''}`}>
                <span>฿</span>
                <input
                  id="mf-price"
                  type="number"
                  inputMode="decimal"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="1"
                  disabled={saving}
                />
                <span className="unit">บาท</span>
              </div>
              {errors.price && <div className="mf-field-error">{errors.price}</div>}
            </div>

            <div className="mf-field">
              <label>รูปภาพเมนู <span className="optional">ไม่บังคับ</span></label>
              <ImageUploadZone image={image} originalImage={originalImage} onChange={setImage} disabled={saving} />
            </div>

            {errors.form && <div className="mf-form-error">{errors.form}</div>}
          </div>

          <div className="mf-footer">
            <button type="button" className="mf-btn ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
            <button type="submit" className="mf-btn primary" disabled={saving}>
              {saving ? <span className="berry-spinner" /> : <Icon name="check" size={17} />}
              {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มเมนู'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   จัดการพนักงาน (sf-*)
   ============================================================ */
// กติกาต้องตรงกับ backend: utils.validate_username / validate_password / validate_phone / validate_email
const STAFF_USERNAME_RE = /^[A-Za-z0-9_]{4,20}$/;
const STAFF_PHONE_RE = /^0\d{8,9}$/;
const STAFF_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STAFF_PASSWORD_MIN = 8;
const STAFF_PASSWORD_MAX = 72; // ขีดจำกัดของ bcrypt

const STAFF_ROLE_INFO = {
  'Front Staff': {
    label: 'พนักงานหน้าร้าน', short: 'หน้าร้าน', tone: 'primary', icon: 'receipt',
    desc: 'รับออเดอร์ walk-in ตรวจสลิป เรียกคิว และส่งมอบอาหาร',
  },
  'Kitchen Staff': {
    label: 'พนักงานครัว', short: 'ครัว', tone: 'warning', icon: 'flame',
    desc: 'ดูคิวที่ต้องทำ อัปเดตสถานะการปรุง และปรับเมนูที่ของหมด',
  },
};
const staffRoleInfo = (role) => STAFF_ROLE_INFO[role] || STAFF_ROLE_INFO['Front Staff'];

const AVATAR_CROP = [{ id: '1:1', label: '1:1', value: 1 }];
const AVATAR_COLORS = ['#FF724C', '#2A2C41', '#17A673', '#E2A430', '#5B6CF0', '#C2185B'];

const phoneDigits = (value) => String(value || '').replace(/[\s-]/g, '');

// 0812345678 -> 081-234-5678 ; 021234567 -> 02-123-4567
function formatPhone(value) {
  const d = phoneDigits(value);
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (/^0\d{8}$/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return value || '';
}

// อักษรย่อจากชื่อ (ข้ามสระหน้า เ แ โ ใ ไ ของชื่อไทย)
function staffInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.slice(0, 2).map(p => (p.replace(/^[เแโใไ]/, '') || p)[0]).join('').toUpperCase();
}

function thaiDateTime(value, withTime = false) {
  const d = parseOrderDate(value);
  if (!d) return '-';
  const date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  return withTime ? `${date} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.` : date;
}

function staffStatus(s) {
  if (!s.IsActive) return { key: 'inactive', label: 'ปิดใช้งาน', tone: 'neutral' };
  if (s.IsLocked) return { key: 'locked', label: 'ถูกล็อกชั่วคราว', tone: 'warning' };
  return { key: 'active', label: 'ใช้งานอยู่', tone: 'success' };
}

function passwordChecks(password, confirm) {
  return [
    { id: 'len', ok: password.length >= STAFF_PASSWORD_MIN && password.length <= STAFF_PASSWORD_MAX, label: `${STAFF_PASSWORD_MIN}–${STAFF_PASSWORD_MAX} ตัวอักษร` },
    { id: 'space', ok: password.length > 0 && !/\s/.test(password), label: 'ไม่มีช่องว่าง' },
    { id: 'match', ok: password.length > 0 && password === confirm, label: 'ยืนยันรหัสผ่านตรงกัน' },
  ];
}

function useEscapeToClose(onClose, disabled) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !disabled) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, disabled]);
}

function StaffAvatar({ name, src, id, size = 56 }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  const showImage = Boolean(src) && !broken;
  return (
    <span
      className="sf-avatar"
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.36),
        background: showImage ? '#ECEEF5' : AVATAR_COLORS[Number(id || 0) % AVATAR_COLORS.length],
      }}
    >
      {showImage
        ? <img src={src} alt="" onError={() => setBroken(true)} />
        : staffInitials(name) || <Icon name="user" size={Math.round(size * 0.46)} />}
    </span>
  );
}

function PasswordInput({ id, value, onChange, show, onToggleShow, invalid, disabled, placeholder, autoComplete = 'new-password' }) {
  return (
    <div className="sf-input-wrap with-icon has-eye">
      <span className="sf-input-icon"><Icon name="lock" size={16} /></span>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        maxLength={STAFF_PASSWORD_MAX}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={invalid ? 'invalid' : ''}
        disabled={disabled}
      />
      <button type="button" className="sf-eye" onClick={onToggleShow} aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} tabIndex={-1}>
        <Icon name={show ? 'eyeOff' : 'eye'} size={17} />
      </button>
    </div>
  );
}

function PasswordRules({ password, confirm }) {
  return (
    <ul className="sf-pw-rules" aria-live="polite">
      {passwordChecks(password, confirm).map(c => (
        <li key={c.id} className={c.ok ? 'ok' : ''}>
          <span className="mark"><Icon name="check" size={11} /></span>{c.label}
        </li>
      ))}
    </ul>
  );
}

// รูปโปรไฟล์: เลือกไฟล์ -> ตรวจ -> ครอป 1:1 (วงกลม) -> ส่ง data URL ให้ฟอร์ม
function AvatarUpload({ image, name, onChange, disabled }) {
  const [error, setError] = useState('');
  const [cropSrc, setCropSrc] = useState(null);
  const inputRef = useRef(null);
  const pick = () => { if (!disabled) inputRef.current?.click(); };

  const processFile = async (file) => {
    if (!file || disabled) return;
    try {
      const result = await readImageFile(file);
      setError('');
      setCropSrc(result.dataUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCropped = (dataUrl, meta) => {
    setCropSrc(null);
    if (meta.size > MAX_IMAGE_BYTES) {
      setError(`รูปหลังครอปมีขนาด ${formatBytes(meta.size)} เกินกำหนด ${MAX_IMAGE_MB} MB`);
      return;
    }
    setError('');
    onChange(dataUrl);
  };

  return (
    <div className="sf-avatar-upload">
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        style={{ display: 'none' }}
        onChange={e => { processFile(e.target.files[0]); e.target.value = ''; }}
      />
      <button type="button" className="sf-avatar-btn" onClick={pick} disabled={disabled} aria-label="เลือกรูปโปรไฟล์">
        <StaffAvatar name={name} src={image} size={88} />
        <span className="sf-avatar-cam"><Icon name="photo" size={15} /></span>
      </button>
      <div className="sf-avatar-meta">
        <div className="title">รูปโปรไฟล์ <span className="optional">ไม่บังคับ</span></div>
        <div className="hint">รูปหน้าตรงช่วยให้จำพนักงานได้ง่าย · PNG, JPG, WEBP, GIF ไม่เกิน {MAX_IMAGE_MB} MB</div>
        <div className="mf-image-actions">
          <button type="button" className="mf-link-btn" onClick={pick} disabled={disabled}>
            <Icon name="upload" size={15} /> {image ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
          </button>
          {image && (
            <>
              <button type="button" className="mf-link-btn" onClick={() => setCropSrc(image)} disabled={disabled}>
                <Icon name="crop" size={15} /> ครอปใหม่
              </button>
              <button type="button" className="mf-link-btn danger" onClick={() => { setError(''); onChange(''); }} disabled={disabled}>
                <Icon name="close" size={15} /> นำรูปออก
              </button>
            </>
          )}
        </div>
        {error && <div className="mf-field-error">{error}</div>}
      </div>
      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          ratios={AVATAR_CROP}
          title="ครอปรูปโปรไฟล์"
          outputMax={512}
          round
          onCancel={() => setCropSrc(null)}
          onConfirm={handleCropped}
        />
      )}
    </div>
  );
}

// --- ฟอร์มเพิ่ม/แก้ไขพนักงาน (ฟิลด์ตามตาราง User: ชื่อ, เบอร์, อีเมล, รูป, ตำแหน่ง, ชื่อผู้ใช้, รหัสผ่าน) ---
function StaffFormModal({ mode, staff, onClose, onSubmit }) {
  const isEdit = mode === 'edit';
  const originalImage = isEdit ? (staff?.ProfileImageUrl || '') : '';
  const [form, setForm] = useState(() => ({
    fullName: isEdit ? staff.FullName || '' : '',
    phone: isEdit ? formatPhone(staff.Phone || '') : '',
    email: isEdit ? staff.Email || '' : '',
    role: isEdit && STAFF_ROLE_INFO[staff.Role] ? staff.Role : 'Front Staff',
    username: isEdit ? staff.Username || '' : '',
    password: '',
    confirm: '',
  }));
  const [image, setImage] = useState(originalImage);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEscapeToClose(onClose, saving);

  const update = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
    // แก้ช่องไหน ล้าง error ของช่องนั้น (รหัสผ่านล้างช่องยืนยันด้วย)
    setErrors(prev => {
      const related = key === 'password' ? ['password', 'confirm'] : [key];
      if (!related.some(k => prev[k]) && !prev.form) return prev;
      const next = { ...prev, form: undefined };
      related.forEach(k => { next[k] = undefined; });
      return next;
    });
  };
  const set = (key) => (e) => update(key, e.target.value);

  const validate = () => {
    const next = {};
    const name = form.fullName.trim();
    if (!name) next.fullName = 'กรุณากรอกชื่อ-นามสกุล';
    else if (name.length > 100) next.fullName = 'ชื่อ-นามสกุลต้องไม่เกิน 100 ตัวอักษร';
    const phone = phoneDigits(form.phone);
    if (!phone) next.phone = 'กรุณากรอกเบอร์โทรศัพท์';
    else if (!STAFF_PHONE_RE.test(phone)) next.phone = 'เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0';
    const email = form.email.trim();
    if (email && (email.length > 100 || !STAFF_EMAIL_RE.test(email))) next.email = 'รูปแบบอีเมลไม่ถูกต้อง';
    if (!isEdit) {
      const username = form.username.trim();
      if (!username) next.username = 'กรุณากรอกชื่อผู้ใช้';
      else if (!STAFF_USERNAME_RE.test(username)) next.username = 'ชื่อผู้ใช้ไม่ถูกต้อง: ใช้ได้เฉพาะ a-z, 0-9 และ _ ยาว 4–20 ตัว';
      if (!form.password) next.password = 'กรุณาตั้งรหัสผ่าน';
      else if (!passwordChecks(form.password, form.password).slice(0, 2).every(c => c.ok)) {
        next.password = `รหัสผ่านต้องยาว ${STAFF_PASSWORD_MIN}–${STAFF_PASSWORD_MAX} ตัว และห้ามมีช่องว่าง`;
      }
      if (form.password !== form.confirm) next.confirm = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
    }
    return next;
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) return;
    const payload = {
      fullName: form.fullName.trim(),
      phone: phoneDigits(form.phone),
      email: form.email.trim(),
      role: form.role,
    };
    if (isEdit) {
      // null = ไม่เปลี่ยนรูป ; '' = ลบรูป ; data URL = รูปใหม่
      payload.profile_img = image === originalImage ? null : image;
    } else {
      payload.username = form.username.trim();
      payload.password = form.password;
      payload.profile_img = image || null;
    }
    setSaving(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setErrors({ form: err.message || 'บันทึกไม่สำเร็จ' });
      setSaving(false);
    }
  };

  return (
    <div className="berry-modal-overlay mf-overlay" onClick={() => { if (!saving) onClose(); }}>
      <div className="mf-modal sf-modal" role="dialog" aria-modal="true" aria-labelledby="sf-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head">
          <div className="mf-head-icon"><Icon name={isEdit ? 'edit' : 'users'} size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="sf-title">{isEdit ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่'}</h3>
            <p>{isEdit ? `บัญชี @${staff.Username} · สร้างเมื่อ ${thaiDateTime(staff.CreatedAt)}` : 'กรอกข้อมูลพนักงานและตั้งบัญชีสำหรับเข้าสู่ระบบ'}</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} disabled={saving} aria-label="ปิด">
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="mf-body">
            <section className="sf-section">
              <AvatarUpload image={image} name={form.fullName} onChange={setImage} disabled={saving} />
            </section>

            <section className="sf-section">
              <h4 className="sf-section-title"><Icon name="user" size={16} /> ข้อมูลส่วนตัว</h4>
              <div className="sf-grid-2">
                <div className="mf-field full">
                  <label htmlFor="sf-name">ชื่อ-นามสกุล <span className="req">*</span></label>
                  <input id="sf-name" type="text" value={form.fullName} onChange={set('fullName')} maxLength={100}
                    placeholder="เช่น สมหมาย ใจดี" className={errors.fullName ? 'invalid' : ''} disabled={saving} autoFocus />
                  {errors.fullName && <div className="mf-field-error">{errors.fullName}</div>}
                </div>
                <div className="mf-field">
                  <label htmlFor="sf-phone">เบอร์โทรศัพท์ <span className="req">*</span></label>
                  <div className="sf-input-wrap with-icon">
                    <span className="sf-input-icon"><Icon name="phone" size={16} /></span>
                    <input id="sf-phone" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')}
                      onBlur={() => setForm(prev => ({ ...prev, phone: formatPhone(prev.phone) }))} maxLength={14}
                      placeholder="08X-XXX-XXXX" className={errors.phone ? 'invalid' : ''} disabled={saving} autoComplete="off" />
                  </div>
                  {errors.phone && <div className="mf-field-error">{errors.phone}</div>}
                </div>
                <div className="mf-field">
                  <label htmlFor="sf-email">อีเมล <span className="optional">ไม่บังคับ</span></label>
                  <div className="sf-input-wrap with-icon">
                    <span className="sf-input-icon"><Icon name="mail" size={16} /></span>
                    <input id="sf-email" type="email" value={form.email} onChange={set('email')} maxLength={100}
                      placeholder="name@example.com" className={errors.email ? 'invalid' : ''} disabled={saving} autoComplete="off" />
                  </div>
                  {errors.email && <div className="mf-field-error">{errors.email}</div>}
                </div>
              </div>
            </section>

            <section className="sf-section">
              <h4 className="sf-section-title"><Icon name="award" size={16} /> ตำแหน่ง</h4>
              <div className="sf-roles" role="radiogroup" aria-label="ตำแหน่งพนักงาน">
                {Object.entries(STAFF_ROLE_INFO).map(([value, info]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={form.role === value}
                    className={`sf-role tone-${info.tone} ${form.role === value ? 'active' : ''}`}
                    onClick={() => update('role', value)}
                    disabled={saving}
                  >
                    <span className="sf-role-icon"><Icon name={info.icon} size={18} /></span>
                    <span className="sf-role-text">
                      <strong>{info.label}</strong>
                      <small>{info.desc}</small>
                    </span>
                    <span className="sf-role-check"><Icon name="check" size={12} /></span>
                  </button>
                ))}
              </div>
            </section>

            <section className="sf-section">
              <h4 className="sf-section-title"><Icon name="key" size={16} /> บัญชีเข้าสู่ระบบ</h4>
              <div className="mf-field">
                <label htmlFor="sf-username">ชื่อผู้ใช้ (username) {!isEdit && <span className="req">*</span>}</label>
                <div className="sf-input-wrap with-icon">
                  <span className="sf-input-icon"><Icon name="user" size={16} /></span>
                  <input id="sf-username" type="text" value={form.username}
                    onChange={e => update('username', e.target.value.replace(/\s/g, ''))}
                    maxLength={20} placeholder="เช่น front01" className={errors.username ? 'invalid' : ''}
                    disabled={saving || isEdit} autoComplete="off" />
                </div>
                {errors.username
                  ? <div className="mf-field-error">{errors.username}</div>
                  : <div className="mf-hint">{isEdit ? 'ชื่อผู้ใช้เปลี่ยนไม่ได้หลังสร้างบัญชี' : 'ใช้ a-z, 0-9 และ _ ความยาว 4–20 ตัว (ใช้ตอนเข้าสู่ระบบ)'}</div>}
              </div>

              {isEdit ? (
                <div className="sf-note"><Icon name="lock" size={16} /> ถ้าพนักงานลืมรหัสผ่าน ใช้ปุ่ม "รีเซ็ตรหัสผ่าน" ที่การ์ดของพนักงาน</div>
              ) : (
                <>
                  <div className="sf-grid-2">
                    <div className="mf-field">
                      <label htmlFor="sf-password">รหัสผ่าน <span className="req">*</span></label>
                      <PasswordInput id="sf-password" value={form.password} onChange={set('password')} show={showPassword}
                        onToggleShow={() => setShowPassword(v => !v)} invalid={errors.password} disabled={saving} placeholder="อย่างน้อย 8 ตัว" />
                      {errors.password && <div className="mf-field-error">{errors.password}</div>}
                    </div>
                    <div className="mf-field">
                      <label htmlFor="sf-confirm">ยืนยันรหัสผ่าน <span className="req">*</span></label>
                      <PasswordInput id="sf-confirm" value={form.confirm} onChange={set('confirm')} show={showPassword}
                        onToggleShow={() => setShowPassword(v => !v)} invalid={errors.confirm} disabled={saving} placeholder="พิมพ์อีกครั้ง" />
                      {errors.confirm && <div className="mf-field-error">{errors.confirm}</div>}
                    </div>
                  </div>
                  <PasswordRules password={form.password} confirm={form.confirm} />
                </>
              )}
            </section>

            {errors.form && <div className="mf-form-error">{errors.form}</div>}
          </div>

          <div className="mf-footer">
            <button type="button" className="mf-btn ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
            <button type="submit" className="mf-btn primary" disabled={saving}>
              {saving ? <span className="berry-spinner" /> : <Icon name="check" size={17} />}
              {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มพนักงาน'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- เจ้าของร้านตั้งรหัสผ่านใหม่ให้พนักงาน (ปลดล็อกบัญชีด้วย) ---
function StaffPasswordModal({ staff, onClose, onSubmit }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEscapeToClose(onClose, saving);

  const submit = async (e) => {
    e.preventDefault();
    if (!passwordChecks(password, confirm).every(c => c.ok)) {
      setError('กรุณาตั้งรหัสผ่านให้ผ่านทุกเงื่อนไขด้านล่าง');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err.message || 'ตั้งรหัสผ่านไม่สำเร็จ');
      setSaving(false);
    }
  };

  return (
    <div className="berry-modal-overlay mf-overlay" onClick={() => { if (!saving) onClose(); }}>
      <div className="mf-modal" role="dialog" aria-modal="true" aria-labelledby="sf-pw-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head">
          <StaffAvatar name={staff.FullName} src={staff.ProfileImageUrl} id={staff.UserId} size={42} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="sf-pw-title">รีเซ็ตรหัสผ่าน</h3>
            <p>{staff.FullName} · @{staff.Username}</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} disabled={saving} aria-label="ปิด">
            <Icon name="close" size={18} />
          </button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="mf-body sf-modal">
            {staff.IsLocked && (
              <div className="sf-lock-note"><Icon name="lock" size={16} /> บัญชีนี้ถูกล็อกจากการใส่รหัสผิดหลายครั้ง ตั้งรหัสใหม่แล้วจะปลดล็อกทันที</div>
            )}
            <div className="mf-field">
              <label htmlFor="sf-new-pw">รหัสผ่านใหม่ <span className="req">*</span></label>
              <PasswordInput id="sf-new-pw" value={password} onChange={e => setPassword(e.target.value)} show={show}
                onToggleShow={() => setShow(v => !v)} disabled={saving} placeholder="อย่างน้อย 8 ตัว" />
            </div>
            <div className="mf-field">
              <label htmlFor="sf-new-pw2">ยืนยันรหัสผ่านใหม่ <span className="req">*</span></label>
              <PasswordInput id="sf-new-pw2" value={confirm} onChange={e => setConfirm(e.target.value)} show={show}
                onToggleShow={() => setShow(v => !v)} disabled={saving} placeholder="พิมพ์อีกครั้ง" />
            </div>
            <PasswordRules password={password} confirm={confirm} />
            <div className="sf-note"><Icon name="alert" size={16} /> แจ้งรหัสผ่านใหม่ให้พนักงานโดยตรง และแนะนำให้เปลี่ยนเองหลังเข้าสู่ระบบ</div>
            {error && <div className="mf-form-error">{error}</div>}
          </div>
          <div className="mf-footer">
            <button type="button" className="mf-btn ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
            <button type="submit" className="mf-btn primary" disabled={saving}>
              {saving ? <span className="berry-spinner" /> : <Icon name="key" size={17} />}
              {saving ? 'กำลังบันทึก...' : 'ตั้งรหัสผ่านใหม่'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- ลบถาวร: ลบข้อมูลส่วนตัวทิ้ง (เก็บแถวไว้ให้ประวัติออเดอร์อ้างถึง) ต้องพิมพ์ชื่อผู้ใช้ยืนยัน ---
function StaffEraseModal({ staff, onClose, onSubmit }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEscapeToClose(onClose, saving);
  const matches = typed.trim() === staff.Username;

  const submit = async (e) => {
    e.preventDefault();
    if (!matches) {
      setError('ชื่อผู้ใช้ที่พิมพ์ไม่ตรงกับบัญชีนี้');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(typed.trim());
    } catch (err) {
      setError(err.message || 'ลบไม่สำเร็จ');
      setSaving(false);
    }
  };

  return (
    <div className="berry-modal-overlay mf-overlay" onClick={() => { if (!saving) onClose(); }}>
      <div className="mf-modal" role="alertdialog" aria-modal="true" aria-labelledby="sf-erase-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head">
          <div className="mf-head-icon sf-danger-icon"><Icon name="trash" size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="sf-erase-title">ลบพนักงานถาวร</h3>
            <p>{staff.FullName} · @{staff.Username}</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} disabled={saving} aria-label="ปิด">
            <Icon name="close" size={18} />
          </button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="mf-body sf-modal">
            <div className="sf-erase-warn">
              <strong><Icon name="alert" size={16} /> การลบนี้ย้อนกลับไม่ได้</strong>
              <ul>
                <li>ลบชื่อ เบอร์โทร อีเมล รูปโปรไฟล์ และรหัสผ่านของพนักงานคนนี้ออกจากระบบ</li>
                <li>บัญชีจะเข้าสู่ระบบไม่ได้อีก และเปิดใช้งานกลับไม่ได้</li>
                <li>ชื่อผู้ใช้ <b>@{staff.Username}</b> จะว่าง นำไปตั้งให้พนักงานคนใหม่ได้</li>
              </ul>
            </div>
            <div className="sf-note">
              <Icon name="history" size={16} />
              ประวัติออเดอร์ที่พนักงานคนนี้เคยดำเนินการยังอยู่ครบ จะแสดงเป็น "พนักงานที่ถูกลบ #{staff.UserId}"
            </div>
            <div className="mf-field">
              <label htmlFor="sf-erase-confirm">พิมพ์ <b className="sf-mono">{staff.Username}</b> เพื่อยืนยัน</label>
              <input
                id="sf-erase-confirm"
                type="text"
                value={typed}
                onChange={e => { setTyped(e.target.value); setError(''); }}
                placeholder="พิมพ์ชื่อผู้ใช้ด้านบนให้ตรงทุกตัวอักษร"
                autoComplete="off"
                spellCheck={false}
                className={error ? 'invalid' : ''}
                disabled={saving}
                autoFocus
              />
            </div>
            {error && <div className="mf-form-error">{error}</div>}
          </div>
          <div className="mf-footer">
            <button type="button" className="mf-btn ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
            <button type="submit" className="mf-btn danger" disabled={saving || !matches}>
              {saving ? <span className="berry-spinner" /> : <Icon name="trash" size={17} />}
              {saving ? 'กำลังลบ...' : 'ลบถาวร'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StaffCard({ staff, busy, onEdit, onResetPassword, onToggleActive, onErase }) {
  const info = staffRoleInfo(staff.Role);
  const status = staffStatus(staff);
  const lockedUntil = parseOrderDate(staff.LockedUntil);
  return (
    <article className={`sf-card ${status.key}`}>
      <div className="sf-card-top">
        <StaffAvatar name={staff.FullName} src={staff.ProfileImageUrl} id={staff.UserId} size={58} />
        <div className="sf-card-id">
          <div className="name" title={staff.FullName}>{staff.FullName}</div>
          <div className="user">@{staff.Username} · รหัส #{staff.UserId}</div>
          <div className="sf-badges">
            <Badge tone={info.tone}><Icon name={info.icon} size={13} /> {info.short}</Badge>
            <span className={`sf-status tone-${status.tone}`}><span className="dot" />{status.label}</span>
          </div>
        </div>
      </div>

      <dl className="sf-info">
        <div>
          <dt title="เบอร์โทร"><Icon name="phone" size={15} /></dt>
          <dd>{staff.Phone ? <a href={`tel:${staff.Phone}`}>{formatPhone(staff.Phone)}</a> : <span className="missing">ยังไม่มีเบอร์โทร</span>}</dd>
        </div>
        <div>
          <dt title="อีเมล"><Icon name="mail" size={15} /></dt>
          <dd>{staff.Email ? <a href={`mailto:${staff.Email}`} title={staff.Email}>{staff.Email}</a> : <span className="missing">ไม่ได้ระบุอีเมล</span>}</dd>
        </div>
        <div>
          <dt title="วันที่สร้างบัญชี"><Icon name="calendar" size={15} /></dt>
          <dd title={`สร้างบัญชี ${thaiDateTime(staff.CreatedAt, true)}${staff.CreatedByName ? ` โดย ${staff.CreatedByName}` : ''}`}>
            สร้างบัญชี {thaiDateTime(staff.CreatedAt)}
            {staff.CreatedByName && <span className="by"> · โดย {staff.CreatedByName}</span>}
          </dd>
        </div>
      </dl>

      <div className="sf-activity">
        <div>
          <strong>{staff.OrdersToday}</strong>
          <span>ออเดอร์ที่ดำเนินการวันนี้</span>
        </div>
        <div title={staff.LastActiveAt ? thaiDateTime(staff.LastActiveAt, true) : ''}>
          <strong>{staff.LastActiveAt ? timeAgo(staff.LastActiveAt) : '—'}</strong>
          <span>อัปเดตออเดอร์ล่าสุด</span>
        </div>
      </div>

      {status.key === 'locked' && (
        <div className="sf-lock-note">
          <Icon name="lock" size={16} />
          <span>ใส่รหัสผ่านผิดหลายครั้ง ล็อกถึง {lockedUntil ? lockedUntil.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'} น. · รีเซ็ตรหัสผ่านเพื่อปลดล็อกทันที</span>
        </div>
      )}

      <div className="sf-card-actions">
        {staff.IsActive ? (
          <>
            <button type="button" className="sf-act" onClick={onEdit} disabled={busy}><Icon name="edit" size={15} /> แก้ไข</button>
            <button type="button" className="sf-act" onClick={onResetPassword} disabled={busy}><Icon name="key" size={15} /> รีเซ็ตรหัสผ่าน</button>
            <button type="button" className="sf-act danger icon-only" onClick={onToggleActive} disabled={busy} title="ปิดใช้งานบัญชี" aria-label={`ปิดใช้งานบัญชี ${staff.FullName}`}>
              <Icon name="power" size={16} />
            </button>
          </>
        ) : (
          <>
            <button type="button" className="sf-act success" onClick={onToggleActive} disabled={busy}>
              {busy ? <span className="berry-spinner" /> : <Icon name="power" size={15} />} เปิดใช้งานอีกครั้ง
            </button>
            <button type="button" className="sf-act danger icon-only" onClick={onErase} disabled={busy} title="ลบถาวร" aria-label={`ลบบัญชี ${staff.FullName} ถาวร`}>
              <Icon name="trash" size={16} />
            </button>
          </>
        )}
      </div>
    </article>
  );
}

/* ============================================================
   รายละเอียดการแจ้งเตือน (nd-*)
   ============================================================ */
const NOTIF_KIND_LABEL = {
  cancel: 'ออเดอร์ถูกยกเลิก',
  issue: 'รายงานปัญหาจากลูกค้า',
  stock: 'สินค้าหมด',
  system: 'ประกาศจากระบบ',
};
const NOTIF_GO = {
  cancel: { page: 'history', label: 'ดูรายละเอียดในประวัติการขาย' },
  issue: { page: 'issues', label: 'ไปที่รายงานปัญหา' },
  stock: { page: 'menu', label: 'ไปที่จัดการเมนู' },
};
const ISSUE_STATUS = {
  OPEN: { label: 'รอดำเนินการ', tone: 'warning' },
  IN_PROGRESS: { label: 'กำลังดำเนินการ', tone: 'primary' },
  RESOLVED: { label: 'แก้ไขแล้ว', tone: 'success' },
  REJECTED: { label: 'ปฏิเสธ', tone: 'neutral' },
};
const ORDER_STATUS_TONE = { COMPLETED: 'success', CANCELLED: 'danger', NO_SHOW: 'neutral' };

function NotifOrderBlock({ order }) {
  const items = Array.isArray(order.items) ? order.items : [];
  return (
    <section className="nd-section">
      <h4 className="sf-section-title"><Icon name="receipt" size={16} /> รายละเอียดออเดอร์</h4>
      <div className="nd-card">
        <div className="nd-order-head">
          <div>
            <span className="nd-queue">คิว {order.QueueNo || '-'}</span>
            <span className="nd-muted">ออเดอร์ #{order.OrderID}</span>
          </div>
          <Badge tone={ORDER_STATUS_TONE[order.StatusCode] || 'warning'}>{order.StatusNameTh || order.Status || '-'}</Badge>
        </div>
        <dl className="nd-grid">
          <div>
            <dt>ลูกค้า</dt>
            <dd>{order.IsWalkIn ? 'ลูกค้า Walk-in' : (order.CustomerName || '-')}</dd>
          </div>
          <div>
            <dt>เบอร์โทร</dt>
            <dd>{order.CustomerPhone ? <a href={`tel:${order.CustomerPhone}`}>{formatPhone(order.CustomerPhone)}</a> : '-'}</dd>
          </div>
          <div>
            <dt>เวลาสั่ง</dt>
            <dd>{thaiDateTime(order.CreatedAt, true)}</dd>
          </div>
          <div>
            <dt>ชำระเงิน</dt>
            <dd>{order.PaymentMethod || (order.IsWalkIn ? 'เงินสด' : '-')}</dd>
          </div>
          {order.CancelReason && (
            <div className="full">
              <dt>เหตุผลที่ยกเลิก</dt>
              <dd className="nd-danger-text">{order.CancelReason}</dd>
            </div>
          )}
          {order.Note && (
            <div className="full">
              <dt>หมายเหตุจากลูกค้า</dt>
              <dd>{order.Note}</dd>
            </div>
          )}
        </dl>
        {items.length > 0 && (
          <ul className="nd-items">
            {items.map(i => (
              <li key={i.OrderItemId || `${i.ProductId}-${i.Qty}`}>
                <span>
                  {i.ProductName} <b>× {i.Qty}</b>
                  {i.ItemStatus === 'OUT_OF_STOCK' && <em className="nd-tag">ของหมด</em>}
                  {i.ItemNote && <small>{i.ItemNote}</small>}
                </span>
                <span>฿{fmtMoney(Number(i.UnitPrice || 0) * Number(i.Qty || 0))}</span>
              </li>
            ))}
            <li className="total"><span>รวมทั้งหมด</span><span>฿{fmtMoney(order.TotalAmount)}</span></li>
          </ul>
        )}
        {items.length === 0 && (
          <div className="nd-total-only"><span>ยอดรวม</span><b>฿{fmtMoney(order.TotalAmount)}</b></div>
        )}
      </div>
    </section>
  );
}

function NotifDetailModal({ item, order, issue, product, onClose, onGo }) {
  useEscapeToClose(onClose, false);
  const go = NOTIF_GO[item.kind];
  const issueStatus = issue ? (ISSUE_STATUS[issue.IssueStatus] || { label: issue.IssueStatus, tone: 'neutral' }) : null;
  return (
    <div className="berry-modal-overlay mf-overlay" onClick={onClose}>
      <div className="mf-modal nd-modal" role="dialog" aria-modal="true" aria-labelledby="nd-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head">
          <div className={`nd-icon tone-${item.tone}`}><Icon name={item.icon} size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className={`nd-kind tone-${item.tone}`}>{NOTIF_KIND_LABEL[item.kind] || 'การแจ้งเตือน'}</span>
            <h3 id="nd-title">{item.title}</h3>
            <p><Icon name="clock" size={12} /> {thaiDateTime(item.at, true)} · {timeAgo(item.at)}</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} aria-label="ปิด">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="mf-body">
          {item.message && <div className="nd-message">{item.message}</div>}

          {item.kind === 'issue' && (issue ? (
            <section className="nd-section">
              <h4 className="sf-section-title"><Icon name="alert" size={16} /> รายงานปัญหา</h4>
              <div className="nd-card">
                <div className="nd-order-head">
                  <div><span className="nd-queue">{issue.IssueType || 'ไม่ระบุประเภท'}</span></div>
                  <Badge tone={issueStatus.tone}>{issueStatus.label}</Badge>
                </div>
                <dl className="nd-grid">
                  <div><dt>ผู้แจ้ง</dt><dd>{issue.CustomerName || '-'}</dd></div>
                  <div><dt>แจ้งเมื่อ</dt><dd>{thaiDateTime(issue.CreatedAt, true)}</dd></div>
                  <div className="full"><dt>รายละเอียดจากลูกค้า</dt><dd className="nd-quote">{issue.Description || '-'}</dd></div>
                  {issue.AdminNote && <div className="full"><dt>หมายเหตุจากผู้ดูแล</dt><dd>{issue.AdminNote}</dd></div>}
                </dl>
              </div>
            </section>
          ) : (
            <div className="sf-note"><Icon name="alert" size={16} /> ไม่พบรายละเอียดของรายงานนี้แล้ว ดูรายงานทั้งหมดได้ที่หน้ารายงานปัญหา</div>
          ))}

          {order && <NotifOrderBlock order={order} />}
          {item.kind === 'cancel' && !order && (
            <div className="sf-note"><Icon name="receipt" size={16} /> ไม่พบรายละเอียดออเดอร์นี้ในประวัติที่โหลดไว้</div>
          )}

          {item.kind === 'stock' && (product ? (
            <section className="nd-section">
              <h4 className="sf-section-title"><Icon name="box" size={16} /> เมนูที่เกี่ยวข้อง</h4>
              <div className="nd-card nd-product">
                <span className="nd-product-img">{product.img ? <img src={product.img} alt="" /> : <Icon name="photo" size={22} />}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nd-product-name">{product.ProductName}</div>
                  <div className="nd-muted">฿{fmtMoney(product.UnitPrice)}</div>
                </div>
                <Badge tone={product.IsOutOfStock ? 'danger' : 'success'}>{product.IsOutOfStock ? 'ยังหมดอยู่' : 'กลับมาขายแล้ว'}</Badge>
              </div>
            </section>
          ) : (
            <div className="sf-note"><Icon name="box" size={16} /> เมนูนี้อาจถูกลบหรือเปลี่ยนชื่อไปแล้ว</div>
          ))}
        </div>

        <div className="mf-footer" style={go ? undefined : { gridTemplateColumns: '1fr' }}>
          <button type="button" className="mf-btn ghost" onClick={onClose}>ปิด</button>
          {go && (
            <button type="button" className="mf-btn primary" onClick={() => onGo(go.page)}>
              {go.label} <Icon name="arrowRight" size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ประวัติการขาย (sh-*)
   ============================================================ */
const ORDER_STATUS_META = {
  VERIFYING_SLIP: { label: 'รอตรวจสลิป', tone: 'warning' },
  PENDING: { label: 'รอร้านรับ', tone: 'warning' },
  COOKING: { label: 'กำลังทำ', tone: 'primary' },
  COOKED: { label: 'ทำเสร็จแล้ว', tone: 'primary' },
  READY: { label: 'เรียกคิวแล้ว', tone: 'primary' },
  COMPLETED: { label: 'สำเร็จ', tone: 'success' },
  PENDING_CANCELLATION: { label: 'รอยืนยันยกเลิก', tone: 'warning' },
  AWAITING_TOP_UP: { label: 'รอโอนส่วนต่าง', tone: 'warning' },
  CANCELLED: { label: 'ยกเลิก', tone: 'danger' },
  NO_SHOW: { label: 'ไม่มารับ', tone: 'neutral' },
};
const orderStatusMeta = (code) => ORDER_STATUS_META[code] || { label: code || '-', tone: 'neutral' };

const ROLE_TH = {
  CUSTOMER: 'ลูกค้า',
  FRONT_STAFF: 'พนักงานหน้าร้าน',
  KITCHEN_STAFF: 'พนักงานครัว',
  STORE_OWNER: 'เจ้าของร้าน',
  ACCOUNTANT: 'ฝ่ายบัญชี',
  EXECUTIVE: 'ผู้บริหาร',
};
const PAYMENT_STATUS_META = {
  PENDING: { label: 'รอตรวจ', tone: 'warning' },
  VERIFIED: { label: 'ยืนยันแล้ว', tone: 'success' },
  REJECTED: { label: 'ปฏิเสธ', tone: 'danger' },
};
const REFUND_TYPE_TH = { FULL_CANCEL: 'คืนเงินทั้งออเดอร์', PRICE_DIFF: 'คืนส่วนต่างราคา', ITEM_CANCEL: 'คืนเงินบางรายการ' };
const REFUND_STATUS_META = {
  PENDING: { label: 'รอลูกค้ามารับ', tone: 'warning' },
  DONE: { label: 'คืนเงินแล้ว', tone: 'success' },
  FAILED: { label: 'ไม่สำเร็จ', tone: 'danger' },
};
const PRINT_TYPE_TH = { CUSTOMER: 'ใบรับอาหาร', KITCHEN: 'ใบครัว', REPRINT: 'พิมพ์ซ้ำ' };

function minutesBetween(a, b) {
  const x = parseOrderDate(a);
  const y = parseOrderDate(b);
  if (!x || !y) return null;
  return Math.max(0, Math.round((y - x) / 60000));
}

function formatDuration(mins) {
  if (mins === null || mins === undefined) return '—';
  if (mins < 1) return 'ไม่ถึง 1 นาที';
  if (mins < 60) return `${mins} นาที`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

const timeHM = (value) => {
  const d = parseOrderDate(value);
  return d ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-';
};

function SalesPersonCard({ label, icon, person, extra, empty = 'ยังไม่ถึงขั้นนี้' }) {
  return (
    <div className={`sh-person ${person ? '' : 'empty'}`}>
      <div className="sh-person-label"><Icon name={icon} size={14} /> {label}</div>
      {person ? (
        <div className="sh-person-body">
          {person.IsSystem
            ? <span className="sh-system-avatar"><Icon name="settings" size={18} /></span>
            : <StaffAvatar name={person.Name} id={person.UserId} size={36} />}
          <div style={{ minWidth: 0 }}>
            <div className="sh-person-name" title={person.Name}>{person.Name || '-'}</div>
            <div className="sh-person-sub">{person.IsSystem ? 'อัตโนมัติ' : (ROLE_TH[person.RoleCode] || person.RoleCode || '')}</div>
            {person.At && <div className="sh-person-time"><Icon name="clock" size={11} /> {timeHM(person.At)} น.</div>}
            {extra && <div className="sh-person-extra">{extra}</div>}
          </div>
        </div>
      ) : (
        <div className="sh-person-empty">{empty}</div>
      )}
    </div>
  );
}

// --- รายละเอียดเชิงลึกของออเดอร์ (ดึงจาก GET /api/orders/{id}/detail) ---
function SalesOrderDetailModal({ orderId, statusCode, apiBase, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  useEscapeToClose(onClose, false);

  // โหลดใหม่เมื่อสถานะออเดอร์เปลี่ยน (หน้าหลัก polling ทุก 4 วินาที)
  useEffect(() => {
    let alive = true;
    fetch(`${apiBase}/api/orders/${orderId}/detail`)
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.detail || 'โหลดรายละเอียดออเดอร์ไม่สำเร็จ');
        return data;
      })
      .then(d => { if (alive) { setDetail(d); setError(''); } })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [apiBase, orderId, statusCode]);

  const o = detail?.order;
  const people = detail?.people || {};
  const meta = orderStatusMeta(o?.StatusCode || statusCode);
  const items = detail?.order?.items || [];
  const replacedBy = Object.fromEntries(items.filter(i => i.ReplacesItemId).map(i => [i.ReplacesItemId, i]));
  const calledAt = people.called?.At;
  const stats = o ? [
    { label: 'สั่ง → เรียกคิว', value: calledAt ? formatDuration(minutesBetween(o.CreatedAt, calledAt)) : '—' },
    { label: 'เวลาทำอาหาร', value: people.cooking && people.cooked ? formatDuration(minutesBetween(people.cooking.At, people.cooked.At)) : '—' },
    { label: 'เรียกคิว → ลูกค้ารับ', value: calledAt && people.handed_over ? formatDuration(minutesBetween(calledAt, people.handed_over.At)) : '—' },
  ] : [];

  return (
    <div className="berry-modal-overlay mf-overlay sh-overlay" onClick={onClose}>
      <div className="mf-modal sh-modal" role="dialog" aria-modal="true" aria-labelledby="sh-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head sh-head">
          <div className="sh-queue-big">{o?.QueueNo || '…'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sh-head-badges">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {o && <span className={`sh-type ${o.IsWalkIn ? 'walkin' : 'online'}`}>{o.IsWalkIn ? 'Walk-in หน้าร้าน' : 'สั่งออนไลน์'}</span>}
            </div>
            <h3 id="sh-title">ออเดอร์ #{orderId}</h3>
            <p>{o ? `สั่งเมื่อ ${thaiDateTime(o.CreatedAt, true)}` : 'กำลังโหลด...'}{o?.PickupTime ? ` · นัดรับ ${o.PickupTime}` : ''}{o?.DeliveredAt ? ` · ส่งมอบ ${thaiDateTime(o.DeliveredAt, true)}` : ''}</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} aria-label="ปิด"><Icon name="close" size={18} /></button>
        </div>

        <div className="mf-body sh-body">
          {error && <div className="mf-form-error">{error}</div>}
          {!detail && !error && (
            <div className="sh-loading">
              <Skeleton height={86} radius={14} />
              <Skeleton height={120} radius={14} />
              <Skeleton height={160} radius={14} />
            </div>
          )}

          {detail && (
            <>
              <section className="sh-section">
                <h4 className="sf-section-title"><Icon name="users" size={16} /> ผู้เกี่ยวข้องกับออเดอร์นี้</h4>
                <div className="sh-people">
                  <div className="sh-person">
                    <div className="sh-person-label"><Icon name="user" size={14} /> ลูกค้า</div>
                    <div className="sh-person-body">
                      <StaffAvatar name={o.IsWalkIn ? 'Walk in' : o.CustomerName} id={o.CustomerId || 0} size={36} />
                      <div style={{ minWidth: 0 }}>
                        <div className="sh-person-name">{o.IsWalkIn ? 'ลูกค้า Walk-in' : (o.CustomerName || '-')}</div>
                        <div className="sh-person-sub">
                          {o.CustomerPhone ? <a href={`tel:${o.CustomerPhone}`}>{formatPhone(o.CustomerPhone)}</a> : (o.IsWalkIn ? 'สั่งที่หน้าร้าน' : '-')}
                        </div>
                      </div>
                    </div>
                  </div>
                  <SalesPersonCard
                    label={o.IsWalkIn ? 'คีย์ออเดอร์ / รับเงิน' : 'รับออเดอร์ (ยืนยันสลิป)'}
                    icon="check"
                    person={people.accepted}
                    empty={o.StatusCode === 'VERIFYING_SLIP' ? 'รอตรวจสลิป' : 'ยังไม่มีคนรับ'}
                  />
                  <SalesPersonCard
                    label="ทำอาหาร"
                    icon="flame"
                    person={people.cooking || people.cooked}
                    extra={people.cooked && people.cooking && people.cooked.UserId !== people.cooking.UserId
                      ? `ทำเสร็จโดย ${people.cooked.Name}` : (people.cooked ? `เสร็จ ${timeHM(people.cooked.At)} น.` : null)}
                  />
                  <SalesPersonCard label="เรียกคิว" icon="bell" person={people.called} />
                  {people.cancelled ? (
                    <SalesPersonCard label="ยกเลิกโดย" icon="soldout" person={people.cancelled} />
                  ) : people.no_show ? (
                    <SalesPersonCard label="ตัดเป็นไม่มารับโดย" icon="soldout" person={people.no_show} />
                  ) : (
                    <SalesPersonCard label="ส่งมอบอาหาร" icon="award" person={people.handed_over} />
                  )}
                </div>
                <div className="sh-stats">
                  {stats.map(s => (
                    <div key={s.label}><strong>{s.value}</strong><span>{s.label}</span></div>
                  ))}
                </div>
              </section>

              <section className="sh-section">
                <h4 className="sf-section-title"><Icon name="receipt" size={16} /> รายการอาหาร</h4>
                <div className="nd-card">
                  <ul className="sh-items">
                    {items.map(i => {
                      const replaced = i.ItemStatus === 'REPLACED';
                      return (
                        <li key={i.OrderItemId} className={replaced ? 'replaced' : ''}>
                          <span className="sh-item-img">{i.ImageUrl ? <img src={i.ImageUrl} alt="" /> : <Icon name="photo" size={16} />}</span>
                          <span className="sh-item-name">
                            {i.ProductName} <b>× {i.Qty}</b>
                            {i.ItemStatus === 'OUT_OF_STOCK' && <em className="nd-tag">ของหมด</em>}
                            {i.ItemStatus === 'CANCELLED' && <em className="nd-tag">ยกเลิก</em>}
                            {replaced && <small>ลูกค้าเปลี่ยนเป็น “{replacedBy[i.OrderItemId]?.ProductName || 'เมนูอื่น'}”</small>}
                            {i.ReplacesItemId && <small className="sh-swap">เมนูที่เปลี่ยนมาแทน</small>}
                            {i.ItemNote && <small>หมายเหตุ: {i.ItemNote}</small>}
                          </span>
                          <span className="sh-item-price">฿{fmtMoney(Number(i.UnitPrice) * Number(i.Qty))}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {o.Note && <div className="sh-note"><Icon name="edit" size={14} /> หมายเหตุจากลูกค้า: {o.Note}</div>}
                  <div className="sh-total"><span>ยอดรวม</span><b>฿{fmtMoney(o.TotalAmount)}</b></div>
                  {o.CancelReason && <div className="sh-cancel-reason"><Icon name="soldout" size={14} /> เหตุผลที่ยกเลิก: {o.CancelReason}</div>}
                </div>
              </section>

              <section className="sh-section">
                <h4 className="sf-section-title"><Icon name="coin" size={16} /> การชำระเงิน</h4>
                {detail.payments.length === 0 ? (
                  <div className="sf-note">ไม่มีข้อมูลการชำระเงิน</div>
                ) : detail.payments.map(p => {
                  const ps = PAYMENT_STATUS_META[p.PaymentStatus] || { label: p.PaymentStatus, tone: 'neutral' };
                  return (
                    <div key={p.PaymentId} className="nd-card sh-pay">
                      {p.SlipUrl ? (
                        <a className="sh-slip" href={p.SlipUrl} target="_blank" rel="noopener noreferrer" title="เปิดสลิปขนาดเต็ม">
                          <img src={p.SlipUrl} alt="สลิปการโอน" />
                        </a>
                      ) : (
                        <span className="sh-slip none"><Icon name={p.MethodCode === 'CASH' ? 'coin' : 'receipt'} size={20} /></span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="sh-pay-head">
                          <strong>{p.PaymentType === 'TOP_UP' ? 'ส่วนต่างค่าอาหาร' : 'ค่าอาหาร'} · ฿{fmtMoney(p.Amount)}</strong>
                          <Badge tone={ps.tone}>{ps.label}</Badge>
                        </div>
                        <div className="sh-pay-sub">{p.MethodNameTh}{p.SlipUrl ? '' : (p.MethodCode === 'CASH' ? '' : ' · ไม่มีสลิปแนบ')}</div>
                        {p.CashReceived != null && (
                          <div className="sh-pay-sub">รับเงินสด <b>฿{fmtMoney(p.CashReceived)}</b> · ทอน <b>฿{fmtMoney(p.ChangeGiven || 0)}</b></div>
                        )}
                        <div className="sh-pay-sub">
                          {p.VerifiedByName
                            ? <>{p.PaymentStatus === 'REJECTED' ? 'ปฏิเสธโดย' : 'ตรวจโดย'} <b>{p.VerifiedByName}</b> ({ROLE_TH[p.VerifiedByRole] || p.VerifiedByRoleTh}){p.PaidAt ? ` · ${thaiDateTime(p.PaidAt, true)}` : ''}</>
                            : 'ยังไม่มีคนตรวจ'}
                        </div>
                        {p.RejectReason && <div className="sh-pay-reject">เหตุผลที่ปฏิเสธ: {p.RejectReason}</div>}
                      </div>
                    </div>
                  );
                })}
              </section>

              <section className="sh-section">
                <h4 className="sf-section-title"><Icon name="history" size={16} /> ไทม์ไลน์</h4>
                <ol className="sh-timeline">
                  {detail.timeline.map((t, idx) => {
                    const tm = orderStatusMeta(t.NewStatusCode);
                    const prev = detail.timeline[idx - 1];
                    const gap = prev ? minutesBetween(prev.CreatedAt, t.CreatedAt) : null;
                    return (
                      <li key={t.LogId} className={`tone-${tm.tone}`}>
                        <span className="dot" />
                        <div className="sh-tl-head">
                          <strong>{t.OldStatusCode ? t.NewStatusNameTh : `สร้างออเดอร์ · ${t.NewStatusNameTh}`}</strong>
                          <span>{thaiDateTime(t.CreatedAt, true)}</span>
                        </div>
                        <div className="sh-tl-sub">
                          {t.ChangedByType === 'SYSTEM'
                            ? 'โดยระบบอัตโนมัติ'
                            : <>โดย <b>{t.ChangedByName || '-'}</b> ({ROLE_TH[t.ChangedByRole] || t.ChangedByRoleTh || '-'})</>}
                          {gap !== null && <span className="sh-gap">+{formatDuration(gap)}</span>}
                        </div>
                        {t.Reason && <div className="sh-tl-reason">{t.Reason}</div>}
                      </li>
                    );
                  })}
                </ol>
              </section>

              {detail.refunds.length > 0 && (
                <section className="sh-section">
                  <h4 className="sf-section-title"><Icon name="coin" size={16} /> การคืนเงิน</h4>
                  {detail.refunds.map(r => {
                    const rs = REFUND_STATUS_META[r.RefundStatus] || { label: r.RefundStatus, tone: 'neutral' };
                    return (
                      <div key={r.RefundId} className="nd-card sh-row-card">
                        <div style={{ minWidth: 0 }}>
                          <strong>{REFUND_TYPE_TH[r.RefundType] || r.RefundType} · ฿{fmtMoney(r.Amount)}</strong>
                          <div className="sh-pay-sub">{r.Reason || '-'}</div>
                          <div className="sh-pay-sub">
                            ขอคืน {thaiDateTime(r.RequestedAt, true)}
                            {r.RefundedAt && ` · คืนแล้ว ${thaiDateTime(r.RefundedAt, true)}${r.RefundedByName ? ` โดย ${r.RefundedByName}` : ''}`}
                          </div>
                        </div>
                        <Badge tone={rs.tone}>{rs.label}</Badge>
                      </div>
                    );
                  })}
                </section>
              )}

              {(detail.review || detail.issues.length > 0) && (
                <section className="sh-section">
                  <h4 className="sf-section-title"><Icon name="star" size={16} /> ความเห็นจากลูกค้า</h4>
                  {detail.review && (
                    <div className="nd-card sh-row-card">
                      <div style={{ minWidth: 0 }}>
                        <div className="sh-stars" aria-label={`${detail.review.Rating} ดาว`}>
                          {[1, 2, 3, 4, 5].map(n => <span key={n} className={n <= detail.review.Rating ? 'on' : ''}>★</span>)}
                        </div>
                        <div className="sh-pay-sub">{detail.review.Comment || 'ไม่ได้เขียนความเห็น'}</div>
                      </div>
                      <span className="nd-muted">{thaiDateTime(detail.review.CreatedAt)}</span>
                    </div>
                  )}
                  {detail.issues.map(is => (
                    <div key={is.IssueReportId} className="nd-card sh-row-card">
                      <div style={{ minWidth: 0 }}>
                        <strong>รายงานปัญหา: {is.IssueType}</strong>
                        <div className="sh-pay-sub">{is.Description}</div>
                      </div>
                      <Badge tone={(ISSUE_STATUS[is.IssueStatus] || {}).tone || 'neutral'}>{(ISSUE_STATUS[is.IssueStatus] || {}).label || is.IssueStatus}</Badge>
                    </div>
                  ))}
                </section>
              )}

              {detail.prints.length > 0 && (
                <section className="sh-section">
                  <h4 className="sf-section-title"><Icon name="receipt" size={16} /> การพิมพ์</h4>
                  <div className="nd-card">
                    <ul className="sh-prints">
                      {detail.prints.map(pj => (
                        <li key={pj.PrintJobId}>
                          <span>{PRINT_TYPE_TH[pj.PrintType] || pj.PrintType}{pj.PerformedByName ? ` · โดย ${pj.PerformedByName}` : ''}</span>
                          <span className="nd-muted">{pj.PrintStatus === 'PRINTED' ? thaiDateTime(pj.PrintedAt, true) : 'รอพิมพ์'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="mf-footer" style={{ gridTemplateColumns: '1fr' }}>
          <button type="button" className="mf-btn ghost" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   รีวิวจากลูกค้า (rv-*)
   ============================================================ */
const RATING_LABEL = { 5: 'ยอดเยี่ยม', 4: 'ดี', 3: 'พอใช้', 2: 'ควรปรับปรุง', 1: 'แย่' };
const RATING_TONE = { 5: 'green', 4: 'green', 3: 'amber', 2: 'red', 1: 'red' };

function Stars({ value, size = 16 }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <span className="rv-stars" style={{ fontSize: size }} aria-label={`${v.toFixed(1)} จาก 5 ดาว`}>
      {[1, 2, 3, 4, 5].map(n => {
        const fill = Math.max(0, Math.min(1, v - (n - 1)));
        return (
          <span key={n} className="rv-star">
            ★<span className="rv-star-fill" style={{ width: `${fill * 100}%` }}>★</span>
          </span>
        );
      })}
    </span>
  );
}

// รูปรีวิวขนาดเต็ม
function ReviewPhotoLightbox({ src, onClose }) {
  useEscapeToClose(onClose, false);
  return (
    <div className="rv-lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label="รูปจากรีวิว">
      <img src={src} alt="รูปจากรีวิว" onClick={e => e.stopPropagation()} />
      <button type="button" className="rv-lightbox-close" onClick={onClose} aria-label="ปิด"><Icon name="close" size={20} /></button>
    </div>
  );
}

function ReviewCard({ review, onPhoto }) {
  const r = review;
  const keyNum = parseInt(String(r.ReviewerKey || '0').slice(0, 6), 16) || 0;
  const comment = (r.Comment || '').trim();
  return (
    <article className={`rv-card tone-${RATING_TONE[r.Rating]}`}>
      <header className="rv-card-head">
        <StaffAvatar name={r.ReviewerName} id={keyNum} size={42} />
        <div className="rv-who">
          <div className="rv-name">
            {r.ReviewerName}
            {r.Visits >= 3 && <span className="rv-regular" title={`สั่งร้านนี้สำเร็จ ${r.Visits} ครั้ง`}><Icon name="award" size={12} /> ลูกค้าประจำ</span>}
          </div>
          <div className="rv-sub">
            สั่งร้านนี้ {fmtMoney(r.Visits)} ครั้ง
            {r.ReviewerReviewCount > 1 && <> · รีวิว {r.ReviewerReviewCount} ครั้ง</>}
          </div>
        </div>
        <div className="rv-rating">
          <Stars value={r.Rating} size={15} />
          <span className={`rv-rating-label tone-${RATING_TONE[r.Rating]}`}>{RATING_LABEL[r.Rating]}</span>
        </div>
      </header>

      <div className="rv-body">
        {comment
          ? <p className="rv-comment">{comment}</p>
          : <p className="rv-comment empty">ลูกค้าให้คะแนนโดยไม่ได้เขียนความเห็น</p>}
        {r.ImageUrl && (
          <button type="button" className="rv-photo" onClick={() => onPhoto(r.ImageUrl)} aria-label="ดูรูปขนาดเต็ม">
            <img src={r.ImageUrl} alt="รูปจากรีวิว" />
            <span><Icon name="photo" size={13} /> ดูรูป</span>
          </button>
        )}
      </div>

      <footer className="rv-order">
        <div className="rv-order-meta">
          <span className="rv-queue">คิว {r.QueueNo}</span>
          <span>สั่งเมื่อ {thaiDateTime(r.OrderedAt)}</span>
          <span>฿{fmtMoney(r.TotalAmount)}</span>
          <span className="rv-time" title={thaiDateTime(r.CreatedAt, true)}>รีวิว {timeAgo(r.CreatedAt)}</span>
        </div>
        {r.items?.length > 0 && (
          <div className="rv-items">
            {r.items.map((it, i) => (
              <span key={`${it.ProductId}-${i}`} className="rv-item">
                <span className="rv-item-img">{it.ImageUrl ? <img src={it.ImageUrl} alt="" /> : <Icon name="photo" size={11} />}</span>
                {it.ProductName} ×{it.Qty}
              </span>
            ))}
          </div>
        )}
      </footer>
    </article>
  );
}

/* ============================================================
   รายงานปัญหาจากลูกค้า (is-*)
   ============================================================ */
const ISSUE_TYPE_ICON = {
  WRONG_ORDER: 'receipt', MISSING_ITEM: 'box', FOOD_QUALITY: 'flame', SLOW_SERVICE: 'clock',
  PAYMENT_ISSUE: 'coin', STAFF_BEHAVIOR: 'users', OTHER: 'alert',
};
const ISSUE_STATUS_UI = {
  OPEN: { label: 'รอดำเนินการ', tone: 'red', badge: 'danger' },
  IN_PROGRESS: { label: 'กำลังดำเนินการ', tone: 'amber', badge: 'warning' },
  RESOLVED: { label: 'แก้ไขแล้ว', tone: 'green', badge: 'success' },
  REJECTED: { label: 'ไม่รับเรื่อง', tone: 'neutral', badge: 'neutral' },
};
const ISSUE_OPEN_STATES = ['OPEN', 'IN_PROGRESS'];
const ISSUE_STALE_HOURS = 24; // ค้างเกินนี้ขึ้นป้ายเตือน

// ข้อความตอบกลับสำเร็จรูป (กดแล้วเติมลงช่อง แก้ต่อได้)
const ISSUE_QUICK_REPLIES = {
  IN_PROGRESS: ['ร้านรับเรื่องแล้ว กำลังตรวจสอบให้นะคะ', 'ขออภัยในความไม่สะดวก ร้านกำลังแก้ไขให้ค่ะ'],
  RESOLVED: ['ร้านแก้ไขเรียบร้อยแล้ว ขอบคุณที่แจ้งให้ทราบค่ะ', 'ร้านได้ปรับปรุงขั้นตอนแล้ว ขออภัยอีกครั้งค่ะ', 'ร้านติดต่อคืนเงินให้เรียบร้อยแล้วค่ะ'],
  REJECTED: ['ตรวจสอบแล้วไม่พบปัญหาตามที่แจ้งค่ะ', 'เรื่องนี้ไม่เกี่ยวข้องกับทางร้าน รบกวนติดต่อศูนย์อาหารค่ะ'],
  OPEN: [],
};

function hoursSince(value) {
  const d = parseOrderDate(value);
  return d ? (Date.now() - d.getTime()) / 3600000 : 0;
}

function formatHours(h) {
  if (h === null || h === undefined) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} นาที`;
  if (h < 48) return `${Math.round(h * 10) / 10} ชม.`;
  return `${Math.round(h / 24)} วัน`;
}

// --- อัปเดตสถานะ + ข้อความตอบกลับลูกค้า ---
function IssueRespondModal({ issue, target, onClose, onSubmit }) {
  const st = ISSUE_STATUS_UI[target];
  const [note, setNote] = useState(issue.AdminNote || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEscapeToClose(onClose, saving);
  const needNote = target === 'REJECTED';

  const submit = async (e) => {
    e.preventDefault();
    if (needNote && !note.trim()) { setError('กรุณาระบุเหตุผลที่ไม่รับเรื่อง ลูกค้าจะเห็นข้อความนี้'); return; }
    setSaving(true);
    try {
      await onSubmit(target, note.trim());
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ');
      setSaving(false);
    }
  };

  return (
    <div className="berry-modal-overlay mf-overlay" onClick={() => { if (!saving) onClose(); }}>
      <div className="mf-modal" role="dialog" aria-modal="true" aria-labelledby="is-respond-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head">
          <div className={`is-type-icon tone-${st.tone}`}><Icon name={ISSUE_TYPE_ICON[issue.TypeCode] || 'alert'} size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="is-respond-title">เปลี่ยนเป็น “{st.label}”</h3>
            <p>{issue.IssueType}{issue.QueueNo ? ` · คิว ${issue.QueueNo}` : ''} · ผู้แจ้ง {issue.ReporterName}</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} disabled={saving} aria-label="ปิด"><Icon name="close" size={18} /></button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="mf-body">
            <div className="is-quote small">{issue.Description}</div>
            <div className="mf-field">
              <label htmlFor="is-note">
                ข้อความตอบกลับลูกค้า {needNote ? <span className="req">*</span> : <span className="optional">ไม่บังคับ</span>}
                <span className="mf-counter">{note.length}/500</span>
              </label>
              <textarea id="is-note" rows={4} maxLength={500} value={note} disabled={saving}
                onChange={e => { setNote(e.target.value); setError(''); }}
                placeholder={needNote ? 'เช่น ตรวจสอบแล้วไม่พบปัญหาตามที่แจ้ง' : 'เช่น ร้านแก้ไขเรียบร้อยแล้ว ขอบคุณที่แจ้งค่ะ'} autoFocus />
              {(ISSUE_QUICK_REPLIES[target] || []).length > 0 && (
                <div className="is-quick">
                  {ISSUE_QUICK_REPLIES[target].map(t => (
                    <button key={t} type="button" className="is-quick-btn" onClick={() => { setNote(t); setError(''); }} disabled={saving}>{t}</button>
                  ))}
                </div>
              )}
              <div className="mf-hint">ลูกค้าจะได้รับการแจ้งเตือน และเห็นข้อความนี้ในหน้าประวัติการแจ้งปัญหา</div>
            </div>
            {error && <div className="mf-form-error">{error}</div>}
          </div>
          <div className="mf-footer">
            <button type="button" className="mf-btn ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
            <button type="submit" className={`mf-btn ${target === 'REJECTED' ? 'danger' : 'primary'}`} disabled={saving}>
              {saving ? <span className="berry-spinner" /> : <Icon name="check" size={17} />}
              {saving ? 'กำลังบันทึก...' : 'บันทึกและแจ้งลูกค้า'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IssueCard({ issue, busy, onAction }) {
  const i = issue;
  const st = ISSUE_STATUS_UI[i.IssueStatus] || ISSUE_STATUS_UI.OPEN;
  const keyNum = parseInt(String(i.ReporterKey || '0').slice(0, 6), 16) || 0;
  const isOpen = ISSUE_OPEN_STATES.includes(i.IssueStatus);
  const age = hoursSince(i.CreatedAt);
  const stale = isOpen && age >= ISSUE_STALE_HOURS;
  return (
    <article className={`is-card tone-${st.tone} ${stale ? 'stale' : ''}`}>
      <header className="is-card-head">
        <span className={`is-type-icon tone-${st.tone}`}><Icon name={ISSUE_TYPE_ICON[i.TypeCode] || 'alert'} size={18} /></span>
        <div className="is-title">
          <strong>{i.IssueType}</strong>
          <span title={thaiDateTime(i.CreatedAt, true)}>แจ้งเมื่อ {timeAgo(i.CreatedAt)} · #{i.IssueReportId}</span>
        </div>
        <div className="is-head-right">
          <Badge tone={st.badge}>{st.label}</Badge>
          {stale && <span className="is-stale"><Icon name="clock" size={12} /> ค้าง {formatHours(age)}</span>}
        </div>
      </header>

      <div className="is-reporter">
        <StaffAvatar name={i.ReporterName} id={keyNum} size={32} />
        <div style={{ minWidth: 0 }}>
          <div className="is-reporter-name">{i.ReporterName}{i.Visits >= 3 && <span className="rv-regular"><Icon name="award" size={11} /> ลูกค้าประจำ</span>}</div>
          <div className="is-reporter-sub">สั่งร้านนี้ {fmtMoney(i.Visits)} ครั้ง · แจ้งปัญหา {fmtMoney(i.ReporterIssueCount)} ครั้ง</div>
        </div>
      </div>

      <p className="is-quote">{i.Description}</p>

      {i.OrderID ? (
        <div className="is-order">
          <div className="is-order-meta">
            <span className="rv-queue">คิว {i.QueueNo}</span>
            <span>สั่ง {thaiDateTime(i.OrderedAt, true)}</span>
            {i.TotalAmount !== null && <span>฿{fmtMoney(i.TotalAmount)}</span>}
            {i.OrderStatusNameTh && <span className="is-order-status">{i.OrderStatusNameTh}</span>}
            {i.ReadyMinutes !== null && (
              <span className={`is-ready ${i.TypeCode === 'SLOW_SERVICE' ? 'hl' : ''}`}><Icon name="clock" size={12} /> สั่ง → เรียกคิว {formatDuration(i.ReadyMinutes)}</span>
            )}
          </div>
          {i.items?.length > 0 && (
            <div className="rv-items">
              {i.items.map((it, idx) => (
                <span key={`${it.ProductId}-${idx}`} className="rv-item">
                  <span className="rv-item-img">{it.ImageUrl ? <img src={it.ImageUrl} alt="" /> : <Icon name="photo" size={11} />}</span>
                  {it.ProductName} ×{it.Qty}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="is-order none"><Icon name="receipt" size={14} /> ไม่ได้ระบุออเดอร์ (ปัญหาทั่วไปของร้าน)</div>
      )}

      {(i.AdminNote || i.HandledByName) && (
        <div className={`is-reply tone-${st.tone}`}>
          <div className="is-reply-head">
            <Icon name={i.AdminNote ? 'check' : 'user'} size={13} />
            {i.AdminNote ? 'ตอบกลับลูกค้า' : 'รับเรื่องโดย'}{i.HandledByName ? ` ${i.AdminNote ? '· โดย ' : ''}${i.HandledByName}` : ''}
          </div>
          {i.AdminNote && <div>{i.AdminNote}</div>}
          {i.ResolvedAt && <div className="is-reply-time">ปิดเรื่องเมื่อ {thaiDateTime(i.ResolvedAt, true)}</div>}
        </div>
      )}

      <footer className="is-actions">
        {i.IssueStatus === 'OPEN' && (
          <button type="button" className="sf-act" onClick={() => onAction(i, 'IN_PROGRESS')} disabled={busy}><Icon name="clock" size={15} /> รับเรื่อง</button>
        )}
        {isOpen && (
          <>
            <button type="button" className="sf-act success" onClick={() => onAction(i, 'RESOLVED')} disabled={busy}><Icon name="check" size={15} /> แก้ไขแล้ว</button>
            <button type="button" className="sf-act danger" onClick={() => onAction(i, 'REJECTED')} disabled={busy}><Icon name="close" size={15} /> ไม่รับเรื่อง</button>
          </>
        )}
        {!isOpen && (
          <button type="button" className="sf-act" onClick={() => onAction(i, 'IN_PROGRESS')} disabled={busy}><Icon name="history" size={15} /> เปิดเรื่องอีกครั้ง</button>
        )}
      </footer>
    </article>
  );
}

export default function OwnerView({ user, apiBase, onLogout }) {
  useEffect(() => {
    if (!document.getElementById('berry-font-link')) {
      const link = document.createElement('link');
      link.id = 'berry-font-link';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Sarabun:wght@400;500;600;700&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const storeId = user?.storeId || 1;
  const uid = user?.id || user?.UserId;
  const [dash, setDash] = useState({});
  const [storeDetail, setStoreDetail] = useState(null);
  const [cancels, setCancels] = useState([]);
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]); 
  const [staffList, setStaffList] = useState([]); 
  const [foodCourtOpen, setFoodCourtOpen] = useState(true);
  const [foodCourtHours, setFoodCourtHours] = useState(null); // { open: '08:00', close: '20:00' }
  // โหลดข้อมูลครั้งแรกเสร็จหรือยัง (ใช้แสดง skeleton แทนเลข 0)
  const [loaded, setLoaded] = useState({ history: false, products: false, dash: false, staff: false, reviews: false, issues: false });
  const markLoaded = (key) => setLoaded(prev => (prev[key] ? prev : { ...prev, [key]: true }));
  // หน้าเมนู: การเรียง + โหมดเลือกหลายเมนู
  const [menuSort, setMenuSort] = useState('default');
  // มุมมองหน้าเมนู: การ์ด / รายการ (จำค่าไว้ในเบราว์เซอร์)
  const [menuView, setMenuViewState] = useState(() => {
    try { return localStorage.getItem('owner.menuView') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const setMenuView = (v) => {
    setMenuViewState(v);
    try { localStorage.setItem('owner.menuView', v); } catch { /* ไม่เป็นไร */ }
  };
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reviewsData, setReviewsData] = useState({ reviews: [], summary: {} });
  const [refunds, setRefunds] = useState([]); // รายการคืนเงินของร้าน (ใช้หักยอดขายสุทธิ)
  // { OrderId: ยอดเงินคืน } ; หักทั้งที่คืนแล้ว (DONE) และที่รอลูกค้ามารับ (PENDING) เพราะเงินคืนไม่ใช่รายได้
  const refundedByOrder = useMemo(() => refunds.reduce((acc, r) => {
    if (r.RefundStatus === 'DONE' || r.RefundStatus === 'PENDING') acc[r.OrderId] = (acc[r.OrderId] || 0) + Number(r.Amount || 0);
    return acc;
  }, {}), [refunds]);
  const pendingRefundCount = useMemo(() => refunds.filter(r => r.RefundStatus === 'PENDING').length, [refunds]);
  const [issues, setIssues] = useState([]);
  
  const [storeDays, setStoreDays] = useState(1);
  const [storeAnchor, setStoreAnchor] = useState(todayISO());
  const [customRange, setCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [storeReport, setStoreReport] = useState(null);
  const [menuFilter, setMenuFilter] = useState('all');
  // --- ยืนยันการลบ + แอนิเมชันลบสำเร็จ ---
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [successState, setSuccessState] = useState(null);
  const successTimers = useRef([]);
  const [menuSearch, setMenuSearch] = useState('');
  const storePeriod = resolvePeriod({ anchor: storeAnchor, days: storeDays, custom: customRange, customStart, customEnd });
  
  const [page, setPage] = useState('dashboard');
  
  // มือถือ (≤768px): ปิดแถบเมนูไว้ก่อน ; จอใหญ่: เปิดไว้
  const isMobileWidth = () => typeof window !== 'undefined' && window.innerWidth <= 768;
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobileWidth());
  useEffect(() => {
    let wasMobile = isMobileWidth();
    const onResize = () => {
      const mobile = isMobileWidth();
      if (mobile !== wasMobile) setSidebarOpen(!mobile); // เปลี่ยนขนาดข้ามจุดตัด -> ปรับให้เหมาะกับจอใหม่
      wasMobile = mobile;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [toast, setToast] = useState({ show: false, msg: '' });

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTab, setNotifTab] = useState('all'); // all | unread
  const [burgerSpin, setBurgerSpin] = useState(0);  // องศาที่ไอคอน ☰ หมุนสะสม
  const notifRef = useRef(null);

  const [notifications, setNotifications] = useState([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const [unreadCancels, setUnreadCancels] = useState(0);
  const [knownCancelsCount, setKnownCancelsCount] = useState(0);
  const isFirstFetch = useRef(true);

  // --- Modal States ---
  // menuModal: null | { mode: 'add' } | { mode: 'edit', product }
  const [menuModal, setMenuModal] = useState(null);

  // staffModal: null | { mode: 'add' } | { mode: 'edit', staff }
  const [staffModal, setStaffModal] = useState(null);
  const [passwordStaff, setPasswordStaff] = useState(null);
  const [staffFilter, setStaffFilter] = useState('all'); // all | front | kitchen | inactive
  const [staffSearch, setStaffSearch] = useState('');
  const [staffBusyId, setStaffBusyId] = useState(null);
  const [eraseStaff, setEraseStaff] = useState(null);
  const [notifDetail, setNotifDetail] = useState(null); // รายการแจ้งเตือนที่เปิดดูรายละเอียด
  // หน้าประวัติการขาย
  const [salesRange, setSalesRange] = useState('7'); // today | 7 | 30 | all | custom
  const [salesFrom, setSalesFrom] = useState(todayISO());
  const [salesTo, setSalesTo] = useState(todayISO());
  const [salesStatus, setSalesStatus] = useState('all'); // all | done | active | cancelled | noshow
  const [salesSearch, setSalesSearch] = useState('');
  const [salesLimit, setSalesLimit] = useState(60);
  const [salesDetailId, setSalesDetailId] = useState(null); // ออเดอร์ที่เปิดดูรายละเอียด
  // ไปหน้าประวัติการขายพร้อมตั้งตัวกรอง (ใช้จากการแจ้งเตือน / แดชบอร์ด) ; orderId = เปิดรายละเอียดออเดอร์นั้นเลย
  const openSalesHistory = ({ status = 'all', range = '7', orderId = null } = {}) => {
    setSalesStatus(status);
    setSalesRange(range);
    setSalesSearch('');
    setSalesLimit(60);
    setPage('history');
    if (orderId) setSalesDetailId(orderId);
  };

  // --- Filter States ---
  const [reviewFilter, setReviewFilter] = useState('all');
  const [reviewOnly, setReviewOnly] = useState(null); // null | comment | photo
  const [reviewSort, setReviewSort] = useState('new'); // new | low | high
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewPhoto, setReviewPhoto] = useState(null); // รูปที่เปิดดูขนาดเต็ม
  const [issueFilter, setIssueFilter] = useState('all'); // 'all' | TypeCode
  const [issueStatusFilter, setIssueStatusFilter] = useState('all'); // all | pending | IN_PROGRESS | RESOLVED | REJECTED
  const [issueRange, setIssueRange] = useState('all'); // 7 | 30 | all
  const [issueSort, setIssueSort] = useState('new'); // new | old
  const [issueSearch, setIssueSearch] = useState('');
  const [issueRespond, setIssueRespond] = useState(null); // { issue, target }
  const [issueBusyId, setIssueBusyId] = useState(null);
  const [issuesSummary, setIssuesSummary] = useState(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(event.target)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchData = () => {
    fetch(`${apiBase}/api/reports/dashboard?store_id=${storeId}`).then(r => r.json()).then(d => { setDash(d[0] || {}); markLoaded('dash'); }).catch(err => console.error(err));
    
    // อัปเดตการดึงข้อมูลเพื่อให้ได้ข้อมูลที่ถูกต้อง
    fetch(`${apiBase}/api/stores`)
      .then(r => r.json())
      .then(d => {
        const allStores = Array.isArray(d) ? d : [];
        const myStore = allStores.find(s => String(s.StoreId) === String(storeId));
        setStoreDetail(myStore || null);
      })
      .catch(err => console.error(err));

    fetch(`${apiBase}/api/food-court/status`)
      .then(r => r.json())
      .then(d => {
        setFoodCourtOpen(d.is_open ?? true);
        if (d.open_time && d.close_time) {
          setFoodCourtHours(prev => (prev && prev.open === d.open_time && prev.close === d.close_time) ? prev : { open: d.open_time, close: d.close_time });
        }
      })
      .catch(err => console.error(err));
    fetch(`${apiBase}/api/refunds?limit=1000`).then(r => r.json()).then(d => { if (Array.isArray(d)) setRefunds(d); }).catch(err => console.error(err));
    fetch(`${apiBase}/api/stores/${storeId}/reviews/detail`).then(r => r.json()).then(d => { if (d && Array.isArray(d.reviews)) { setReviewsData(d); markLoaded('reviews'); } }).catch(err => console.error(err));
    // รายงานปัญหาแบบละเอียด (ชื่อผู้แจ้งแบบย่อ ไม่มีข้อมูลติดต่อ)
    fetch(`${apiBase}/api/stores/${storeId}/issues/detail`).then(r => r.json()).then(d => {
      if (d && Array.isArray(d.issues)) { setIssues(d.issues); setIssuesSummary(d.summary); markLoaded('issues'); }
    }).catch(err => console.error(err));
    
    // ตอบ error (เช่น 500 ชั่วคราว) : คงข้อมูลเดิมไว้ ไม่ให้หน้าพังหรือ KPI/ลิ้นชักเงินสดกลายเป็น 0
    fetch(`${apiBase}/api/reports/cancellations?store_id=${storeId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!Array.isArray(data)) return;
        setCancels(data);
        if (isFirstFetch.current) {
          setKnownCancelsCount(data.length);
          isFirstFetch.current = false;
        }
      })
      .catch(err => console.error(err));

    fetch(`${apiBase}/api/products?store_id=${storeId}`).then(r => (r.ok ? r.json() : null)).then(d => { if (Array.isArray(d)) { setProducts(d); markLoaded('products'); } }).catch(err => console.error(err));
    fetch(`${apiBase}/api/orders?store_id=${storeId}`).then(r => (r.ok ? r.json() : null)).then(d => { if (Array.isArray(d)) { setHistory(d); markLoaded('history'); } }).catch(err => console.error(err));
    fetch(`${apiBase}/api/stores/${storeId}/staff?include_inactive=true`).then(r => (r.ok ? r.json() : null)).then(d => { if (Array.isArray(d)) { setStaffList(d); markLoaded('staff'); } }).catch(err => console.error(err));

    if (uid) {
      fetch(`${apiBase}/api/notifications/${uid}`)
        .then(r => r.json())
        .then(data => {
          const arr = Array.isArray(data) ? data : [];
          setNotifications(arr);
          setUnreadNotifs(arr.filter(n => !n.IsRead).length);
        }).catch(err => console.error(err));
    }
  };

  useEffect(() => {
    fetchData();
    // เดิม 4 วิ (ยิง 11 endpoint ต่อรอบ) ; หยุดเมื่อแท็บซ่อน
    return startPolling(fetchData, 10000);
  }, [storeId, apiBase, uid]);

  useEffect(() => {
    if (history) {
      const hourRange = foodCourtHours ? hoursFromSchedule(foodCourtHours.open, foodCourtHours.close) : null;
      setStoreReport(buildStoreReport(history, storeId, storePeriod, hourRange, refundedByOrder));
    }
  }, [history, storeId, storeDays, storeAnchor, customRange, customStart, customEnd, foodCourtHours, refundedByOrder]);

  useEffect(() => {
    if (page !== 'menu') { setSelectMode(false); setSelectedIds([]); }
  }, [page]);

  // จำนวนจานที่ขายได้วันนี้ของแต่ละเมนู (ออเดอร์สำเร็จ)
  const todaySold = useMemo(() => {
    const today = todayISO();
    const map = {};
    (history || []).forEach(order => {
      if (!orderIs(order, 'Completed')) return;
      const at = parseOrderDate(order.CreatedAt);
      if (!at || toISODate(at) !== today) return;
      (order.items || []).forEach(item => {
        const id = String(item.ProductId);
        map[id] = (map[id] || 0) + Number(item.Qty || 0);
      });
    });
    return map;
  }, [history]);

  // ตัวเลข "ตอนนี้ในร้าน" (ไม่ขึ้นกับช่วงวันที่เลือก)
  const liveStats = useMemo(() => {
    const count = (...statuses) => (history || []).filter(o => statuses.includes(o.Status)).length;
    const today = todayISO();
    const todayOrders = (history || []).filter(o => {
      const at = parseOrderDate(o.CreatedAt);
      return at && toISODate(at) === today;
    });
    return {
      // ครัวกดแค่ "ปรุงเสร็จ" : รอดำเนินการ = รอร้านตรวจสลิป ; ร้านรับแล้ว (Pending/Cooking) = กำลังปรุง
      waiting: count('Verifying_Slip'),
      cooking: count('Pending', 'Cooking'),
      ready: count('Ready'),
      outOfStock: (products || []).filter(p => p.IsOutOfStock).length,
      todayOrders: todayOrders.length,
      // เงินสดที่ควรอยู่ในลิ้นชักวันนี้ = เงินสดที่รับวันนี้ (ค่าอาหารสุทธิหลังทอน รวมออเดอร์ที่ถูกยกเลิก)
      // − เงินสดที่จ่ายคืนลูกค้าวันนี้ ; คืนแบบโอนไม่ผ่านลิ้นชัก จึงไม่หัก
      cashToday: todayOrders
        .flatMap(o => o.Payments || [])
        .filter(p => p.MethodCode === 'CASH' && p.PaymentStatus === 'VERIFIED')
        .reduce((acc, p) => acc + Number(p.Amount || 0), 0)
        - refunds
          .filter(r => r.RefundStatus === 'DONE' && r.PaidMethod !== 'TRANSFER' && r.RefundedAt
            && toISODate(parseOrderDate(r.RefundedAt)) === today)
          .reduce((acc, r) => acc + Number(r.Amount || 0), 0),
      // ลูกค้าที่รอรับเงินสดคืนที่ร้าน (ต้องเตรียมเงินไว้ในลิ้นชัก)
      cashRefundOwed: refunds
        .filter(r => r.RefundStatus === 'PENDING' && r.PayoutMethod !== 'TRANSFER')
        .reduce((acc, r) => acc + Number(r.Amount || 0), 0),
    };
  }, [history, products, refunds]);

  // ยกเลิกใหม่ที่ยังไม่ได้ดู : เทียบด้วยเลขออเดอร์ (เดิมเทียบจำนวนรายการ ซึ่งตันที่ 500 ตาม limit แล้วไม่เตือนอีกเลย)
  const seenCancelIdsRef = useRef(null);
  useEffect(() => {
    const ids = cancels.map(c => c.OrderID);
    if (seenCancelIdsRef.current === null) {
      if (!isFirstFetch.current) seenCancelIdsRef.current = new Set(ids); // ของที่มีอยู่ตอนเปิดหน้า = ดูแล้ว
      return;
    }
    if (page === 'history') {
      ids.forEach(id => seenCancelIdsRef.current.add(id));
      setUnreadCancels(0);
    } else {
      setUnreadCancels(ids.filter(id => !seenCancelIdsRef.current.has(id)).length);
    }
  }, [cancels, page]);

  const markAllRead = async () => {
    setUnreadCancels(0);
    setKnownCancelsCount(cancels.length);
    if (seenCancelIdsRef.current) cancels.forEach(c => seenCancelIdsRef.current.add(c.OrderID));
    if (uid && unreadNotifs > 0) {
      setNotifications(prev => prev.map(n => ({ ...n, IsRead: true })));
      setUnreadNotifs(0);
      try { await fetch(`${apiBase}/api/notifications/${uid}/read-all`, { method: 'PUT' }); } catch (err) { console.error(err); }
      fetchData();
    }
  };

  useEffect(() => {
    if (!notifOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setNotifOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notifOpen]);

  const markNotifRead = (notifId) => {
    fetch(`${apiBase}/api/notifications/${notifId}/read`, { method: 'PUT' }).then(() => fetchData());
  };

  // กดรายการแจ้งเตือน -> ปิดกล่อง เปิดหน้ารายละเอียด และนับว่าอ่านแล้ว
  const openNotifDetail = (item) => {
    setNotifOpen(false);
    setNotifDetail(item);
    if (item.notif && !item.notif.IsRead) markNotifRead(item.notif.NotifId);
  };

  // หาข้อมูลประกอบจากที่โหลดไว้แล้ว (ออเดอร์ + รายการอาหาร, รายงานปัญหา, เมนู) ไม่ต้องเรียก API เพิ่ม
  const resolveNotifContext = (item) => {
    const orderId = item.orderId || item.notif?.OrderId || null;
    let issue = null;
    if (item.kind === 'issue') {
      // ตาราง Notification ไม่ได้เก็บ IssueReportId : จับคู่จากออเดอร์ หรือรายงานที่เวลาใกล้ที่สุด (ภายใน 2 นาที)
      const at = parseOrderDate(item.at)?.getTime() || 0;
      const nearest = (list) => list
        .map(r => ({ r, d: Math.abs((parseOrderDate(r.CreatedAt)?.getTime() || 0) - at) }))
        .sort((a, b) => a.d - b.d)[0];
      const byOrder = orderId ? issues.filter(r => String(r.OrderID) === String(orderId)) : [];
      const hit = nearest(byOrder.length ? byOrder : issues);
      issue = hit && (byOrder.length || hit.d <= 120000) ? hit.r : null;
    }
    const issueOrderId = issue?.OrderID || orderId;
    const order = issueOrderId
      ? history.find(o => String(o.OrderID) === String(issueOrderId)) || cancels.find(o => String(o.OrderID) === String(issueOrderId)) || null
      : null;
    let product = null;
    if (item.kind === 'stock') {
      const name = (String(item.message || '').match(/'([^']+)'/) || [])[1];
      product = name ? products.find(p => p.ProductName === name) || null : null;
    }
    return { order, issue, product };
  };

  const showToast = (msg) => {
    setToast({ show: true, msg });
    clearTimeout(window.__avxToastTimer);
    window.__avxToastTimer = setTimeout(() => setToast({ show: false, msg: '' }), 2600);
  };

  const toggleStore = async () => {
    try {
      const res = await fetch(`${apiBase}/api/stores/${storeId}/toggle?open=${!dash.IsOpen}`, { method: 'PUT' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.detail || data.message || 'ไม่สามารถเปลี่ยนสถานะร้านได้');
        return;
      }
      showToast(data.is_open ? 'เปิดรับออเดอร์แล้ว!' : 'ปิดร้านชั่วคราวแล้ว');
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการเปลี่ยนสถานะร้าน');
    } finally {
      fetchData();
    }
  };

  // สวิตช์บน topbar: เปิดร้านได้ทันที แต่ถามยืนยันก่อนปิด (กันกดโดนโดยไม่ตั้งใจ)
  const requestToggleStore = async () => {
    if (toggleDisabled) return;
    if (!storeOpen) { toggleStore(); return; }
    // กฎ PO 1: ยังมีออเดอร์ที่ยังไม่จบ = ปิดร้านไม่ได้ (backend ตรวจซ้ำอีกชั้น)
    try {
      const res = await fetch(`${apiBase}/api/stores/${storeId}/open-orders`);
      const pending = res.ok ? await res.json() : [];
      if (Array.isArray(pending) && pending.length) {
        const queues = pending.slice(0, 10).map(o => `${o.queue} (${o.status_label})`).join(', ');
        setConfirmDelete({
          type: 'closeBlocked',
          blocked: true,
          name: dash.StoreName || 'ร้านของคุณ',
          title: 'ยังปิดร้านไม่ได้',
          prefix: 'ร้าน',
          suffix: `ยังมีออเดอร์ที่ยังไม่จบ ${pending.length} ออเดอร์`,
          warn: `${queues}${pending.length > 10 ? ` และอีก ${pending.length - 10} คิว` : ''} — กรุณาทำและส่งมอบให้ครบก่อนปิดร้าน ถ้าไม่อยากรับออเดอร์เพิ่ม ให้กด "ของหมด" ที่เมนูแทน`,
          icon: 'power',
          tone: 'danger',
        });
        return;
      }
    } catch (err) {
      console.error(err);
    }
    setConfirmDelete({
      type: 'closeStore',
      name: dash.StoreName || 'ร้านของคุณ',
      title: 'ปิดรับออเดอร์ชั่วคราว?',
      prefix: 'ลูกค้าจะสั่งอาหารจากร้าน',
      suffix: 'ไม่ได้จนกว่าจะเปิดอีกครั้ง',
      warn: 'ออเดอร์ที่รับไว้แล้วยังทำต่อได้ตามปกติ',
      icon: 'power',
      tone: 'danger',
      confirmText: 'ปิดรับออเดอร์',
      busyText: 'กำลังปิดร้าน...',
    });
  };

  // ปรับสต็อกหลายเมนูพร้อมกัน (เรียก toggle เฉพาะเมนูที่สถานะยังไม่ตรง)
  const bulkSetStock = async (makeOut) => {
    const targets = products.filter(p => selectedIds.includes(p.ProductId) && Boolean(p.IsOutOfStock) !== makeOut);
    if (!targets.length) {
      showToast(makeOut ? 'เมนูที่เลือกเป็นสินค้าหมดอยู่แล้ว' : 'เมนูที่เลือกพร้อมขายอยู่แล้ว');
      return;
    }
    setBulkBusy(true);
    const results = await Promise.allSettled(
      targets.map(p => fetch(`${apiBase}/api/products/${p.ProductId}/toggle-stock?out_of_stock=${makeOut}`, { method: 'PUT' })
        .then(res => { if (!res.ok) throw new Error(p.ProductName); return p; }))
    );
    setBulkBusy(false);
    const done = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - done;
    fetchData();
    setSelectedIds([]);
    setSelectMode(false);
    if (done) showSuccess('อัปเดตสต็อกสำเร็จ', `ปรับ ${done} เมนูเป็น${makeOut ? 'สินค้าหมด' : 'พร้อมขาย'}แล้ว`);
    if (failed) showToast(`ปรับไม่สำเร็จ ${failed} เมนู กรุณาลองใหม่`);
  };

  const toggleSelected = (id) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds([]); };

  const toggleStock = async (id, pName, isOutOfStock) => {
    try {
      const res = await fetch(`${apiBase}/api/products/${id}/toggle-stock?out_of_stock=${!isOutOfStock}`, { method: 'PUT' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === 'string' ? data.detail : 'อัปเดตสถานะไม่สำเร็จ');
      }
      showToast(`อัปเดตสถานะ "${pName}" เป็น ${isOutOfStock ? 'มีสินค้า' : 'สินค้าหมด'} แล้ว`);
    } catch (err) {
      showToast(`⚠️ ${err.message || 'อัปเดตสถานะไม่สำเร็จ'} ("${pName}")`);
    } finally {
      fetchData();
    }
  };

  const openAddModal = () => setMenuModal({ mode: 'add' });
  const openEditModal = (product) => setMenuModal({ mode: 'edit', product });
  const closeMenuModal = () => setMenuModal(null);

  // โยน error กลับไปให้ฟอร์มแสดง ถ้าสำเร็จจะปิดฟอร์มแล้วขึ้นแอนิเมชันติ๊กถูก
  const saveMenu = async ({ name, price, img, description }) => {
    const isEdit = menuModal?.mode === 'edit';
    const res = await fetch(
      isEdit ? `${apiBase}/api/products/${menuModal.product.ProductId}` : `${apiBase}/api/products`,
      {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit
          ? { ProductName: name, Description: description, UnitPrice: price, img: img || '' }
          : { StoreId: storeId, ProductName: name, Description: description, UnitPrice: price, IsOutOfStock: false, img: img || '' }),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const detail = Array.isArray(data.detail) ? data.detail.map(d => d.msg).join(', ') : data.detail;
      throw new Error(detail || data.message || (isEdit ? 'แก้ไขเมนูไม่สำเร็จ' : 'เพิ่มเมนูไม่สำเร็จ'));
    }
    setMenuModal(null);
    showSuccess(
      isEdit ? 'บันทึกสำเร็จ' : 'เพิ่มเมนูสำเร็จ',
      isEdit ? `แก้ไขเมนู "${name}" เรียบร้อยแล้ว` : `เพิ่มเมนู "${name}" เรียบร้อยแล้ว`
    );
    fetchData();
  };

  // แสดงติ๊กถูกกลางจอ ~1.4 วินาที แล้วค่อย ๆ จางหาย
  const showSuccess = (title, detail) => {
    successTimers.current.forEach(clearTimeout);
    setSuccessState({ title, detail, leaving: false });
    successTimers.current = [
      setTimeout(() => setSuccessState(prev => (prev ? { ...prev, leaving: true } : prev)), 1400),
      setTimeout(() => setSuccessState(null), 1750),
    ];
  };
  useEffect(() => () => successTimers.current.forEach(clearTimeout), []);

  const handleDeleteMenu = (id, name) => {
    setConfirmDelete({
      type: 'menu', id, name,
      title: 'ลบเมนูนี้?',
      prefix: 'คุณต้องการลบเมนู',
      suffix: 'ออกจากร้านใช่หรือไม่',
      confirmText: 'ลบเมนู',
    });
  };

  const cancelDelete = () => {
    if (!deleting) setConfirmDelete(null);
  };

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return;
    const { type, id, name } = confirmDelete;
    if (type === 'closeStore') {
      setDeleting(true);
      await toggleStore();
      setDeleting(false);
      setConfirmDelete(null);
      return;
    }
    if (type === 'staff') {
      // ปิดใช้งาน (ไม่ลบจริง ข้อมูลและประวัติยังอยู่ เปิดกลับได้)
      setDeleting(true);
      await setStaffActive({ UserId: id, FullName: name }, false);
      setDeleting(false);
      setConfirmDelete(null);
      return;
    }
    const url = `${apiBase}/api/products/${id}`;
    setDeleting(true);
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 400 && data.detail) {
          // กฎ PO 3: เมนูยังอยู่ในออเดอร์ที่ไม่จบ -> แสดงเหตุผลค้างไว้ให้อ่าน (toast หายเร็วเกิน)
          setConfirmDelete({ type: 'deleteBlocked', blocked: true, name, title: 'ยังลบเมนูนี้ไม่ได้',
            prefix: 'เมนู', suffix: '', warn: data.detail, icon: 'trash', tone: 'danger' });
          return;
        }
        throw new Error(data.detail || data.message || 'เกิดข้อผิดพลาดในการลบเมนู');
      }
      setConfirmDelete(null);
      showSuccess('ลบสำเร็จ', `ลบเมนู "${name}" เรียบร้อยแล้ว`);
      fetchData();
    } catch (err) {
      console.error(err);
      setConfirmDelete(null);
      showToast(err.message);
    } finally {
      setDeleting(false);
    }
  };

  // --- จัดการพนักงาน ---
  const apiError = async (res, fallback) => {
    const data = await res.json().catch(() => ({}));
    return new Error(data.detail || data.message || fallback);
  };

  // ฟอร์มเรียกใช้: error ถูก throw กลับไปแสดงในฟอร์ม
  const saveStaff = async (payload) => {
    const isEdit = staffModal?.mode === 'edit';
    const res = await fetch(
      isEdit ? `${apiBase}/api/staff/${staffModal.staff.UserId}` : `${apiBase}/api/stores/${storeId}/staff`,
      { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    );
    if (!res.ok) throw await apiError(res, isEdit ? 'บันทึกข้อมูลพนักงานไม่สำเร็จ' : 'เพิ่มพนักงานไม่สำเร็จ');
    setStaffModal(null);
    showSuccess(isEdit ? 'บันทึกเรียบร้อย' : 'เพิ่มพนักงานแล้ว', payload.fullName);
    fetchData();
  };

  const resetStaffPassword = async (newPassword) => {
    const target = passwordStaff;
    const res = await fetch(`${apiBase}/api/staff/${target.UserId}/reset-password`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_password: newPassword }),
    });
    if (!res.ok) throw await apiError(res, 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ');
    setPasswordStaff(null);
    showSuccess('ตั้งรหัสผ่านใหม่แล้ว', `แจ้งรหัสผ่านใหม่ให้ ${target.FullName}`);
    fetchData();
  };

  const setStaffActive = async (target, isActive) => {
    setStaffBusyId(target.UserId);
    try {
      const res = await fetch(`${apiBase}/api/staff/${target.UserId}/active`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) throw await apiError(res, isActive ? 'เปิดใช้งานไม่สำเร็จ' : 'ปิดใช้งานไม่สำเร็จ');
      showSuccess(isActive ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว', target.FullName);
      fetchData();
    } catch (err) {
      showToast(err.message);
    } finally {
      setStaffBusyId(null);
    }
  };

  const eraseStaffAccount = async (confirmUsername) => {
    const target = eraseStaff;
    const res = await fetch(`${apiBase}/api/staff/${target.UserId}/erase`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm_username: confirmUsername }),
    });
    if (!res.ok) throw await apiError(res, 'ลบพนักงานไม่สำเร็จ');
    setEraseStaff(null);
    showSuccess('ลบถาวรแล้ว', target.FullName);
    fetchData();
  };

  // เปลี่ยนสถานะรายงานปัญหา (+ ข้อความตอบกลับ) ; fromModal = ให้ error กลับไปแสดงในหน้าต่าง
  const updateIssueStatus = async (issue, status, note, fromModal = false) => {
    setIssueBusyId(issue.IssueReportId);
    try {
      const res = await fetch(`${apiBase}/api/issues/${issue.IssueReportId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note }),
      });
      if (!res.ok) throw await apiError(res, 'อัปเดตรายงานปัญหาไม่สำเร็จ');
      showSuccess(`${ISSUE_STATUS_UI[status].label}`, 'แจ้งลูกค้าเรียบร้อยแล้ว');
      fetchData();
    } catch (err) {
      if (fromModal) throw err;
      showToast(err.message);
    } finally {
      setIssueBusyId(null);
    }
  };

  const askDeactivateStaff = (target) => {
    setConfirmDelete({
      type: 'staff', id: target.UserId, name: target.FullName,
      icon: 'power',
      title: 'ปิดใช้งานพนักงานคนนี้?',
      prefix: 'ต้องการปิดใช้งานบัญชีของ',
      suffix: 'ใช่หรือไม่',
      warn: 'พนักงานจะเข้าสู่ระบบไม่ได้ทันที ข้อมูลและประวัติการทำงานยังอยู่ครบ และเปิดใช้งานอีกครั้งได้ทุกเมื่อ',
      confirmText: 'ปิดใช้งาน',
      busyText: 'กำลังปิดใช้งาน...',
    });
  };

  const handleLogout = () => {
    if (onLogout) onLogout();
  };

  const navItemsAll = [
    { id: 'dashboard', label: 'Dashboard', caption: 'ภาพรวมร้านค้า', icon: 'dashboard' },
    { id: 'menu', label: 'Manage Menu', caption: 'จัดการเมนู/สต็อก', icon: 'menu' },
    { id: 'staff', label: 'Manage Staff', caption: 'จัดการพนักงาน', icon: 'users' },
    // ออเดอร์ที่ยกเลิกรวมอยู่ในประวัติการขายแล้ว (แท็บ "ยกเลิก") : badge ยกเลิกใหม่จึงย้ายมาอยู่ที่นี่
    { id: 'history', label: 'Sales History', caption: 'ประวัติการขาย', icon: 'history', badge: unreadCancels > 0 ? unreadCancels : null },
    { id: 'reviews', label: 'Customer Reviews', caption: 'รีวิวจากลูกค้า', icon: 'star' },
    { id: 'issues', label: 'Issue Reports', caption: 'ประวัติการแจ้งปัญหา', icon: 'alert' },
    { id: 'refunds', label: 'คืนเงินลูกค้า', caption: 'รอคืน / คืนแล้ว', icon: 'coin', badge: pendingRefundCount || null },
  ];
  const navById = Object.fromEntries(navItemsAll.map(n => [n.id, n]));
  const navGroups = [
    { label: 'ภาพรวม', items: ['dashboard'] },
    { label: 'จัดการร้าน', items: ['menu', 'staff'] },
    { label: 'ประวัติและความคิดเห็น', items: ['history', 'refunds', 'reviews', 'issues'] },
  ].map(g => ({ ...g, items: g.items.map(id => navById[id]) }));

  const isSuspended = Boolean(storeDetail?.IsSuspended);
  // ร้านจะถือว่า "เปิด" ได้ก็ต่อเมื่อศูนย์อาหารเปิดด้วย ถ้าศูนย์อาหารปิด ร้านถูกบังคับปิดเสมอ
  const storeOpen = Boolean(dash.IsOpen) && foodCourtOpen && !isSuspended;
  const toggleDisabled = !foodCourtOpen || isSuspended;
  const unreadSuspendedAlert = isSuspended ? 1 : 0;
  const totalBadgeUnread = unreadCancels + unreadNotifs + unreadSuspendedAlert;
  
  // -- Helper functions for filtering and contracts --
  const getDaysLeft = (endDate) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((end - today) / 86400000);
  };
  const daysLeft = getDaysLeft(storeDetail?.ContractEndDate);

  const formatContractDate = (value) => value
    ? new Date(value).toLocaleDateString('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' })
    : '-';
  const contractTone = daysLeft === null ? 'neutral' : daysLeft > 30 ? 'success' : daysLeft > 0 ? 'warning' : 'danger';
  const contractLabel = daysLeft === null ? 'ยังไม่ระบุ' : daysLeft > 30 ? 'ปกติ' : daysLeft > 0 ? 'ใกล้หมดอายุ' : 'หมดอายุแล้ว';
  // สัดส่วนเวลาที่ผ่านไปแล้วของสัญญา (0-100) ใช้วาดแถบความคืบหน้า
  const contractProgress = (() => {
    if (!storeDetail?.ContractStartDate || !storeDetail?.ContractEndDate) return null;
    const start = new Date(storeDetail.ContractStartDate).getTime();
    const end = new Date(storeDetail.ContractEndDate).getTime();
    if (!(end > start)) return null;
    return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
  })();
  const scrollToContract = () => {
    document.getElementById('owner-contract')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  

  return (
    <div className="berry-root">
      <style>{BERRY_STYLES}</style>
      
      {/* ===== TOPBAR (HEADER) ===== */}
      <header className="berry-topbar">
        <div className="berry-topbar-left">
          <button
            className={`berry-icon-btn purple-light op-burger ${sidebarOpen ? 'is-open' : ''}`}
            onClick={() => { setBurgerSpin(d => d + 180); setSidebarOpen(!sidebarOpen); }}
            aria-label={sidebarOpen ? 'ซ่อนแถบเมนู' : 'แสดงแถบเมนู'}
            aria-expanded={sidebarOpen}
          >
            <span className="lines" style={{ transform: `rotate(${burgerSpin}deg)` }} aria-hidden="true">
              <span /><span /><span />
            </span>
          </button>

          {/* โลโก้ + สถานะศูนย์อาหาร (แบบเดียวกับหน้าลูกค้า) */}
          <div className="berry-brand">
            <button type="button" className="brand-logo" onClick={() => setPage('dashboard')} title="กลับหน้า Dashboard">
              Only<span>Foods</span>
            </button>
            <div
              className={`brand-status ${foodCourtOpen ? 'open' : 'closed'}`}
              title={foodCourtOpen ? 'ศูนย์อาหารเปิดให้บริการ' : 'ศูนย์อาหารปิดให้บริการ'}
            >
              <span className="dot" />
              <span className="full">{foodCourtOpen ? 'ศูนย์อาหารเปิดให้บริการ' : 'ศูนย์อาหารปิดให้บริการ'}</span>
              <span className="short">{foodCourtOpen ? 'เปิด' : 'ปิด'}</span>
            </div>

            {/* สวิตช์เปิด/ปิดรับออเดอร์ของร้าน กดได้จากทุกหน้า */}
            <button
              type="button"
              role="switch"
              aria-checked={storeOpen}
              className={`store-switch ${storeOpen ? 'on' : 'off'}`}
              onClick={requestToggleStore}
              disabled={toggleDisabled}
              title={
                !foodCourtOpen ? 'ศูนย์อาหารปิดอยู่ ร้านเปิดรับออเดอร์ไม่ได้'
                  : isSuspended ? 'ร้านถูกระงับสิทธิ์'
                  : storeOpen ? 'กดเพื่อปิดรับออเดอร์ชั่วคราว' : 'กดเพื่อเปิดรับออเดอร์'
              }
            >
              <span className="track"><span className="thumb" /></span>
              <span className="label">{storeOpen ? 'ร้านเปิดรับออเดอร์' : 'ร้านปิดรับออเดอร์'}</span>
            </button>
          </div>
        </div>

        <div className="berry-topbar-right">
          
          <div className="berry-notif-container" ref={notifRef} style={{ position: 'relative' }}>
            <button
              className={`berry-icon-btn amber-light op-bell ${notifOpen ? 'active' : ''} ${totalBadgeUnread > 0 ? 'has-unread' : ''}`}
              onClick={() => setNotifOpen(!notifOpen)}
              style={{ position: 'relative' }}
              aria-label={totalBadgeUnread > 0 ? `การแจ้งเตือน ${totalBadgeUnread} รายการใหม่` : 'การแจ้งเตือน'}
              aria-expanded={notifOpen}
            >
              <span className="bell-icon" key={totalBadgeUnread}><Icon name="bell" size={20} /></span>
              {totalBadgeUnread > 0 && (
                <span className="notif-badge-top">{totalBadgeUnread > 99 ? '99+' : totalBadgeUnread}</span>
              )}
            </button>

            {notifOpen && (() => {
              const NOTIF_STYLE = {
                ORDER_STATUS: { icon: 'receipt', tone: 'orange' },
                QUEUE_CALLED: { icon: 'bell', tone: 'green' },
                PAYMENT: { icon: 'coin', tone: 'green' },
                CONTRACT: { icon: 'calendar', tone: 'amber' },
                ISSUE: { icon: 'alert', tone: 'red' },
                SYSTEM: { icon: 'bell', tone: 'blue' },
              };
              const items = [
                ...notifications.map(n => ({
                  key: `n-${n.NotifId}`,
                  ...(NOTIF_STYLE[n.NotificationType] || NOTIF_STYLE.SYSTEM),
                  kind: n.NotificationType === 'ISSUE' ? 'issue' : n.Title === 'สินค้าหมด' ? 'stock' : 'system',
                  notif: n,
                  title: n.Title || 'การแจ้งเตือน',
                  message: n.Message,
                  at: n.CreatedAt,
                  unread: !n.IsRead,
                })),
                ...cancels.slice(0, 5).map((c, i) => ({
                  key: `c-${c.OrderID}`,
                  icon: 'soldout',
                  tone: 'red',
                  title: `ออเดอร์ถูกยกเลิก · คิว ${c.QueueNo || '-'}`,
                  message: c.CancelReason ? `เหตุผล: ${c.CancelReason}` : 'ไม่ได้ระบุเหตุผล',
                  at: c.CreatedAt,
                  unread: i < unreadCancels,
                  amount: c.TotalAmount,
                  kind: 'cancel',
                  orderId: c.OrderID,
                })),
              ].sort((a, b) => (parseOrderDate(b.at)?.getTime() || 0) - (parseOrderDate(a.at)?.getTime() || 0));
              const shown = notifTab === 'unread' ? items.filter(it => it.unread) : items;
              return (
                <>
                  <div className="op-notif-backdrop" onClick={() => setNotifOpen(false)} aria-hidden="true" />
                  <div className="op-notif-panel" role="dialog" aria-label="การแจ้งเตือน">
                    <div className="op-notif-head">
                      <div className="title">
                        <h4>การแจ้งเตือน</h4>
                        {totalBadgeUnread > 0 && <span className="count">{totalBadgeUnread} ใหม่</span>}
                      </div>
                      <div className="head-actions">
                        {(unreadCancels > 0 || unreadNotifs > 0) && (
                          <button type="button" className="op-notif-link" onClick={markAllRead}>
                            <Icon name="check" size={14} /> อ่านทั้งหมด
                          </button>
                        )}
                        <button type="button" className="op-notif-close" onClick={() => setNotifOpen(false)} aria-label="ปิด">
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="op-notif-tabs" role="tablist">
                      <button type="button" role="tab" aria-selected={notifTab === 'all'} className={notifTab === 'all' ? 'active' : ''} onClick={() => setNotifTab('all')}>
                        ทั้งหมด <span>{items.length}</span>
                      </button>
                      <button type="button" role="tab" aria-selected={notifTab === 'unread'} className={notifTab === 'unread' ? 'active' : ''} onClick={() => setNotifTab('unread')}>
                        ยังไม่อ่าน <span>{items.filter(it => it.unread).length}</span>
                      </button>
                    </div>

                    <div className="op-notif-list">
                      {isSuspended && (
                        <div className="op-notif-alert">
                          <span className="icon"><Icon name="alert" size={18} /></span>
                          <div>
                            <div className="t">ร้านของคุณถูกระงับสิทธิ์</div>
                            <div className="m">เปิดรับออเดอร์ใหม่ไม่ได้ชั่วคราว กรุณาติดต่อผู้บริหารศูนย์อาหาร</div>
                          </div>
                        </div>
                      )}

                      {shown.length === 0 && !isSuspended ? (
                        <div className="op-notif-empty">
                          <div className="icon"><Icon name="bell" size={26} /></div>
                          <div className="t">{notifTab === 'unread' ? 'อ่านครบทุกรายการแล้ว' : 'ยังไม่มีการแจ้งเตือน'}</div>
                          <div className="m">{notifTab === 'unread' ? 'ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่าน' : 'เมื่อมีออเดอร์ถูกยกเลิกหรือข่าวจากระบบ จะแสดงที่นี่'}</div>
                        </div>
                      ) : shown.map(it => (
                        <button key={it.key} type="button" className={`op-notif-item ${it.unread ? 'unread' : ''}`} onClick={() => openNotifDetail(it)}>
                          <span className={`icon tone-${it.tone}`}><Icon name={it.icon} size={17} /></span>
                          <span className="body">
                            <span className="t">{it.title}</span>
                            {it.message && <span className="m">{it.message}</span>}
                            <span className="meta">
                              <Icon name="clock" size={12} /> {timeAgo(it.at)}
                              {it.amount !== undefined && <> · ฿{fmtMoney(it.amount)}</>}
                            </span>
                          </span>
                          {it.unread && <span className="unread-dot" aria-label="ยังไม่อ่าน" />}
                        </button>
                      ))}
                    </div>

                    <button type="button" className="op-notif-foot" onClick={() => { openSalesHistory({ status: 'cancelled', range: 'all' }); setNotifOpen(false); }}>
                      ดูออเดอร์ที่ยกเลิกทั้งหมดในประวัติการขาย <Icon name="arrowRight" size={15} />
                    </button>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="berry-profile-container" ref={profileRef}>
            <button type="button" className="berry-user-chip" onClick={() => setProfileOpen(!profileOpen)} aria-label="เมนูบัญชีผู้ใช้">
              <div className="berry-avatar">
                {String(user?.name || user?.FullName || 'O').trim().replace(/^[เแโใไ]+/, '').charAt(0).toUpperCase() || 'O'}
              </div>
              <div className="berry-user-text">
                <div className="berry-user-name">{user?.name || user?.FullName || 'Shop Owner'}</div>
                <div className="berry-user-role">Shop Owner</div>
              </div>
              <Icon name="settings" size={17} />
            </button>

            {profileOpen && (
              <div className="berry-profile-dropdown">
                <div className="dropdown-header">
                  <h4>Good Morning, {user?.name || user?.FullName || 'Owner'}</h4>
                  <p>Shop Owner (เจ้าของร้าน)</p>
                </div>
                
                <hr className="berry-divider" style={{ margin: '0 0 16px' }} />

                <div className="dropdown-item" onClick={handleLogout}>
                  <Icon name="logout" size={18} /> Logout
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* มือถือ: แถบสถานะศูนย์อาหาร + สวิตช์ร้าน (บน topbar ไม่พอที่) */}
      <div className="op-mobile-status">
        <span className={`op-ms-court ${foodCourtOpen ? 'open' : 'closed'}`}>
          <span className="dot" />
          {foodCourtOpen ? 'ศูนย์อาหารเปิด' : 'ศูนย์อาหารปิด'}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={storeOpen}
          className={`store-switch mobile ${storeOpen ? 'on' : 'off'}`}
          onClick={requestToggleStore}
          disabled={toggleDisabled}
        >
          <span className="label">{storeOpen ? 'ร้านเปิดรับออเดอร์' : 'ร้านปิดรับออเดอร์'}</span>
          <span className="track"><span className="thumb" /></span>
        </button>
      </div>

      {/* ===== BODY (Sidebar + Main Content) ===== */}
      <div className="berry-body">
        
        {/* ฉากหลังมืดตอนเปิดแถบเมนูบนมือถือ (แตะเพื่อปิด) */}
        {sidebarOpen && <div className="berry-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

        {/* ===== SIDEBAR ===== */}
        <aside className={`berry-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          <nav className="berry-nav">
            {navGroups.map(group => (
            <div className="berry-nav-group" key={group.label}>
              <div className="berry-nav-label hide-on-collapse">{group.label}</div>
              <div className="berry-nav-divider show-on-collapse" />
              {group.items.map(n => (
                <div 
                  key={n.id} 
                  className={`berry-nav-item ${page === n.id ? 'active' : ''}`} 
                  onClick={() => { 
                    setPage(n.id); 
                    if (window.innerWidth <= 768) setSidebarOpen(false); 
                  }}
                  title={!sidebarOpen ? n.label : ""}
                >
                  <div className="berry-nav-icon"><Icon name={n.icon} size={20} /></div>
                  <div className="berry-nav-text hide-on-collapse">
                    <div className="title">{n.label}</div>
                    <div className="caption">{n.caption}</div>
                  </div>
                  {n.badge ? <span className="berry-nav-badge hide-on-collapse">{n.badge}</span> : null}
                </div>
              ))}
            </div>
            ))}
          </nav>
        </aside>

        {/* ===== MAIN CONTENT ===== */}
        <main className="berry-content">
          {page === 'dashboard' && (() => {
            const now = storeReport?.now || { sales: 0, grossSales: 0, completedCount: 0, cancelledCount: 0, cancelRate: null, avgOrder: 0 };
            const before = storeReport?.before || {};
            const hasPrev = Boolean(storeReport?.hasPreviousData);
            const ready = loaded.history && storeReport;
            const periodLabel = customRange
              ? (storePeriod.days === 1 ? `วันที่ ${thaiDate(customStart)}` : `${thaiDate(customStart)} – ${thaiDate(customEnd)}`)
              : (storeDays === 1 ? `วันที่ ${thaiDate(storeAnchor)}` : `${storeDays} วันย้อนหลังถึง ${thaiDate(storeAnchor)}`);
            const compareLabel = storePeriod.days === 1 ? 'เทียบวันก่อนหน้า' : `เทียบ ${storePeriod.days} วันก่อนหน้า`;
            const rateDelta = now.cancelRate !== null && before.cancelRate !== null && before.cancelRate !== undefined
              ? now.cancelRate - before.cancelRate : null;
            const hoursNote = storePeriod.days === 1 && foodCourtHours ? ` · แสดงช่วง ${foodCourtHours.open}–${foodCourtHours.close} น.` : '';
            const live = [
              { key: 'waiting', label: 'รอดำเนินการ', value: liveStats.waiting, icon: 'clock', tone: 'amber', go: 'history' },
              { key: 'cooking', label: 'กำลังปรุง', value: liveStats.cooking, icon: 'flame', tone: 'orange', go: 'history' },
              { key: 'ready', label: 'รอลูกค้ารับ', value: liveStats.ready, icon: 'bell', tone: 'green', go: 'history' },
              { key: 'out', label: 'เมนูที่หมดอยู่', value: liveStats.outOfStock, icon: 'soldout', tone: 'red', go: 'menu' },
            ];
            return (
            <div className="berry-dashboard-grid">
              <PageHeader title="ภาพรวมร้าน" subtitle={dash.StoreName ? `${dash.StoreName} · ยอดขาย แนวโน้ม และเมนูขายดี` : 'ยอดขาย แนวโน้ม และเมนูขายดีของร้าน'} icon="dashboard">
                <Badge tone={storeDetail?.IsSuspended ? 'danger' : 'success'}>
                  {storeDetail?.IsSuspended ? 'ถูกระงับสิทธิ์' : 'สิทธิ์ปกติ'}
                </Badge>
                {daysLeft !== null && (
                  <button onClick={scrollToContract} className={`berry-badge tone-${contractTone} od-badge-btn`}>
                    สัญญา: {daysLeft < 0 ? 'หมดอายุแล้ว' : `เหลือ ${daysLeft} วัน`}
                  </button>
                )}
              </PageHeader>

              {/* ===== ตอนนี้ในร้าน (ไม่ขึ้นกับช่วงวันที่) ===== */}
              <section className="od-live">
                <div className="od-live-head">
                  <span className="pulse" />
                  <strong>ตอนนี้ในร้าน</strong>
                  <span className="muted">อัปเดตอัตโนมัติ · วันนี้ {fmtMoney(liveStats.todayOrders)} ออเดอร์ · เงินสดที่ควรมีในลิ้นชัก <b>฿{fmtMoney(liveStats.cashToday)}</b>{liveStats.cashRefundOwed > 0 && <> · รอคืนเงินสดลูกค้าอีก <b>฿{fmtMoney(liveStats.cashRefundOwed)}</b></>}</span>
                </div>
                <div className="od-live-grid">
                  {live.map(item => (
                    <button key={item.key} type="button" className={`od-live-item tone-${item.tone} ${item.value > 0 ? 'has' : ''}`} onClick={() => {
                      if (item.go === 'menu') { setMenuFilter(item.key === 'out' ? 'out' : 'all'); setPage('menu'); }
                      else openSalesHistory({ status: 'active', range: 'today' });
                    }}>
                      <span className="icon"><Icon name={item.icon} size={18} /></span>
                      <span className="text">
                        {loaded.history && loaded.products ? <strong>{fmtMoney(item.value)}</strong> : <Skeleton height={22} width={34} />}
                        <span>{item.label}</span>
                      </span>
                      <Icon name="arrowRight" size={15} />
                    </button>
                  ))}
                </div>
              </section>

              {/* ===== แถบช่วงเวลา (ติดด้านบนเวลาเลื่อน) ===== */}
              <div className="od-period-bar">
                <div className="od-period-text">
                  <Icon name="calendar" size={16} />
                  <span><strong>{periodLabel}</strong> · {compareLabel}</span>
                </div>
                <StorePeriodPicker
                  anchor={storeAnchor} setAnchor={setStoreAnchor}
                  days={storeDays} setDays={setStoreDays}
                  custom={customRange} setCustom={setCustomRange}
                  startDate={customStart} setStartDate={setCustomStart}
                  endDate={customEnd} setEndDate={setCustomEnd}
                />
              </div>

              {/* ===== การ์ดสรุปยอดขาย (รวมยอดขาย + ออเดอร์ + กราฟเล็ก) ===== */}
              <div className="od-summary">
                <span className="od-hero-circle one" />
                <span className="od-hero-circle two" />
                {ready ? (
                  <>
                    <div className="od-summary-block">
                      <div className="od-summary-label"><Icon name="trend" size={16} /> ยอดขายสุทธิ</div>
                      <div className="od-summary-value">{fmtMoney(now.sales)}<small>บาท</small></div>
                      {(now.noShowCount > 0 || now.refunded > 0) && (
                        <div className="od-summary-note">
                          {now.noShowCount > 0 && <span>รวมไม่มารับ {fmtMoney(now.noShowCount)} ออเดอร์ ฿{fmtMoney(now.noShowSales)}</span>}
                          {now.refunded > 0 && <span>หักคืนเงินแล้ว ฿{fmtMoney(now.refunded)}</span>}
                        </div>
                      )}
                      <DeltaChip solid delta={changePct(now.sales, before.sales)} label={compareLabel} hasPreviousData={hasPrev} />
                    </div>
                    <div className="od-summary-divider" />
                    <div className="od-summary-block">
                      <div className="od-summary-label"><Icon name="check" size={16} /> ออเดอร์ที่ขายได้</div>
                      <div className="od-summary-value">{fmtMoney(now.revenueCount)}<small>ออเดอร์</small></div>
                      {now.noShowCount > 0 && (
                        <div className="od-summary-note"><span>สำเร็จ {fmtMoney(now.completedCount)} · ไม่มารับ {fmtMoney(now.noShowCount)}</span></div>
                      )}
                      <DeltaChip solid delta={changePct(now.revenueCount, before.revenueCount)} label={compareLabel} hasPreviousData={hasPrev} />
                    </div>
                    <div className="od-summary-spark">
                      <Sparkline buckets={storeReport?.buckets} />
                      <span>{storePeriod.days === 1 ? 'ยอดขายรายชั่วโมง' : 'ยอดขายรายวัน'}</span>
                    </div>
                  </>
                ) : (
                  <div className="od-summary-skel">
                    <Skeleton height={14} width={110} style={{ opacity: 0.5 }} />
                    <Skeleton height={34} width={180} style={{ opacity: 0.5 }} />
                    <Skeleton height={22} width={150} style={{ opacity: 0.5 }} />
                  </div>
                )}
              </div>

              <div className="od-kpi-grid">
                {ready ? (
                  <>
                    <KpiSmall tone="blue" icon="receipt" value={fmtMoney(now.grossSales)} unit="บาท" label="มูลค่าออเดอร์รวมก่อนหักยกเลิก">
                      <DeltaChip delta={changePct(now.grossSales, before.grossSales)} label={compareLabel} hasPreviousData={hasPrev} />
                    </KpiSmall>
                    <KpiSmall tone="amber" icon="soldout" value={fmtMoney(now.cancelledCount)} unit="ออเดอร์" label="ออเดอร์ที่ถูกยกเลิก">
                      <DeltaChip invert delta={changePct(now.cancelledCount, before.cancelledCount)} label={compareLabel} hasPreviousData={hasPrev} />
                    </KpiSmall>
                    <KpiSmall tone="red" icon="percent" value={now.cancelRate === null ? 'N/A' : `${now.cancelRate.toFixed(1)}%`} label="อัตราการยกเลิก">
                      <DeltaChip invert suffix=" จุด" delta={rateDelta} label={compareLabel} hasPreviousData={hasPrev}
                        hint={now.cancelRate === null ? 'ยังไม่มีออเดอร์ที่จบในช่วงนี้' : undefined} />
                    </KpiSmall>
                    <KpiSmall tone="green" icon="coin" value={fmtMoney(now.avgOrder)} unit="บาท" label="มูลค่าเฉลี่ยต่อออเดอร์">
                      <DeltaChip delta={changePct(now.avgOrder, before.avgOrder)} label={compareLabel} hasPreviousData={hasPrev} />
                    </KpiSmall>
                  </>
                ) : [0, 1, 2, 3].map(i => (
                  <div key={i} className="od-kpi">
                    <div className="od-kpi-main">
                      <Skeleton height={46} width={46} radius={10} />
                      <div style={{ flex: 1, display: 'grid', gap: 8 }}><Skeleton height={20} width="60%" /><Skeleton height={12} width="85%" /></div>
                    </div>
                    <Skeleton height={20} width={140} radius={999} style={{ marginTop: 14 }} />
                  </div>
                ))}
              </div>

              {/* ===== กราฟแนวโน้ม + ข้อมูลร้าน ===== */}
              <div className="od-row two-one">
                <div className="berry-card">
                  <div className="od-card-head">
                    <div>
                      <h3>{storePeriod.days === 1 ? 'แนวโน้มยอดขายรายชั่วโมง' : 'แนวโน้มยอดขายรายวัน'}</h3>
                      <p>ชี้ที่จุดบนกราฟเพื่อดูยอดขายของช่วงเวลานั้น{hoursNote}</p>
                    </div>
                    {ready && <div className="od-head-total">{fmtMoney(now.sales)} <small>บาท</small></div>}
                  </div>
                  {ready ? <SalesLineChart buckets={storeReport?.buckets || []} /> : <Skeleton height={300} radius={12} style={{ marginTop: 16 }} />}
                </div>

                <div className="berry-card">
                  <div className="od-card-head">
                    <div>
                      <h3>ข้อมูลร้าน</h3>
                      <p>สถานะการรับออเดอร์และสัญญาเช่า</p>
                    </div>
                  </div>

                  <div className={`od-store-status ${storeOpen ? 'open' : 'closed'}`}>
                    <span className="dot" />
                    <div>
                      <div className="title">{storeOpen ? 'กำลังเปิดรับออเดอร์' : 'ปิดรับออเดอร์อยู่'}</div>
                      <div className="caption">
                        {!foodCourtOpen ? 'ศูนย์อาหารปิดทำการ ร้านถูกปิดรับออเดอร์อัตโนมัติ'
                          : isSuspended ? 'ร้านถูกระงับสิทธิ์ ไม่สามารถเปิดรับออเดอร์ได้'
                          : 'เปิด/ปิดรับออเดอร์ได้จากสวิตช์ที่แถบด้านบน'}
                      </div>
                    </div>
                  </div>

                    {/* ===== สัญญาเช่า (ย้ายมาจากหน้า Contract Tracking) ===== */}
                    <div id="owner-contract" className={`berry-contract tone-${contractTone}`}>
                      <div className="berry-contract-head">
                        <div className="berry-contract-title">
                          <span className="berry-contract-icon"><Icon name="calendar" size={18} /></span>
                          <div>
                            <div className="title">สัญญาเช่า</div>
                            <div className="caption">ร้าน ID #{storeId}</div>
                          </div>
                        </div>
                        <Badge tone={contractTone}>{contractLabel}</Badge>
                      </div>

                      {daysLeft === null ? (
                        <div className="berry-contract-empty">ยังไม่มีข้อมูลสัญญาของร้าน</div>
                      ) : (
                        <>
                          <div className="berry-contract-days">
                            {daysLeft < 0 ? (
                              <>หมดอายุมาแล้ว <strong>{Math.abs(daysLeft)}</strong> วัน</>
                            ) : (
                              <>เหลืออีก <strong>{daysLeft}</strong> วัน</>
                            )}
                          </div>
                          {contractProgress !== null && (
                            <div className="berry-contract-bar" role="progressbar" aria-valuenow={Math.round(contractProgress)} aria-valuemin={0} aria-valuemax={100}>
                              <div style={{ width: `${contractProgress}%` }} />
                            </div>
                          )}
                          <div className="berry-contract-dates">
                            <div>
                              <div className="caption">เริ่มสัญญา</div>
                              <div className="date">{formatContractDate(storeDetail?.ContractStartDate)}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div className="caption">สิ้นสุดสัญญา</div>
                              <div className="date">{formatContractDate(storeDetail?.ContractEndDate)}</div>
                            </div>
                          </div>
                          {daysLeft <= 30 && (
                            <div className="berry-contract-note">
                              {daysLeft < 0
                                ? 'สัญญาหมดอายุแล้ว ร้านจะไม่สามารถรับออเดอร์ใหม่ได้ กรุณาติดต่อผู้บริหารเพื่อต่อสัญญา'
                                : 'สัญญาใกล้หมดอายุ กรุณาติดต่อผู้บริหารเพื่อต่อสัญญา'}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                </div>
              </div>

              {/* ===== ยอดขายแยกเมนู + เมนูขายดี ===== */}
              <div className="od-row one-one">
                <div className="berry-card">
                  <div className="od-card-head">
                    <div>
                      <h3>สัดส่วนยอดขายแยกตามเมนู</h3>
                      <p>{periodLabel} · ชี้ที่วงกลมหรือชื่อเมนูเพื่อดูยอดขาย</p>
                    </div>
                  </div>
                  {ready ? <MenuDonutChart rows={storeReport?.menus || []} /> : (
                    <div className="od-donut-wrap">
                      <Skeleton height={220} width={220} radius={999} style={{ margin: '0 auto' }} />
                      <div style={{ flex: '1 1 220px', display: 'grid', gap: 10 }}>{[0, 1, 2, 3].map(i => <Skeleton key={i} height={16} />)}</div>
                    </div>
                  )}
                </div>

                <div className="berry-card">
                  <div className="od-card-head">
                    <div>
                      <h3>เมนูขายดี 5 อันดับแรก</h3>
                      <p>เรียงตามจำนวนจานที่ขายได้ในช่วงที่เลือก</p>
                    </div>
                    {ready && (storeReport?.menus || []).length > 0 && (
                      <span className="od-chip">{fmtMoney((storeReport?.menus || []).length)} เมนูที่ขายได้</span>
                    )}
                  </div>
                  {ready ? <TopMenuList rows={storeReport?.menus || []} products={products} /> : (
                    <div className="od-top-list">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} height={66} radius={12} />)}</div>
                  )}
                </div>
              </div>
            </div>
            );
          })()}

          {page === 'menu' && (() => {
            const inStockCount = products.filter(p => !p.IsOutOfStock).length;
            const outOfStockCount = products.length - inStockCount;
            const keyword = menuSearch.trim().toLowerCase();
            const visibleProducts = products.filter(p => {
              if (menuFilter === 'in' && p.IsOutOfStock) return false;
              if (menuFilter === 'out' && !p.IsOutOfStock) return false;
              return !keyword || `${p.ProductName || ''} ${p.Description || ''}`.toLowerCase().includes(keyword);
            });
            const sold = (p) => todaySold[String(p.ProductId)] || 0;
            const sorters = {
              best: (a, b) => sold(b) - sold(a) || String(a.ProductName).localeCompare(String(b.ProductName), 'th'),
              priceAsc: (a, b) => Number(a.UnitPrice) - Number(b.UnitPrice),
              priceDesc: (a, b) => Number(b.UnitPrice) - Number(a.UnitPrice),
              name: (a, b) => String(a.ProductName).localeCompare(String(b.ProductName), 'th'),
            };
            if (sorters[menuSort]) visibleProducts.sort(sorters[menuSort]);
            const visibleIds = visibleProducts.map(p => p.ProductId);
            const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
            const soldTodayTotal = products.reduce((acc, p) => acc + sold(p), 0);
            const filters = [
              { id: 'all', label: 'ทั้งหมด', count: products.length },
              { id: 'in', label: 'พร้อมขาย', count: inStockCount, tone: 'green' },
              { id: 'out', label: 'สินค้าหมด', count: outOfStockCount, tone: 'red' },
            ];
            // props ที่ใช้ร่วมกันของการ์ด/แถว เวลาอยู่ในโหมดเลือก
            const selectProps = (p) => {
              const selected = selectedIds.includes(p.ProductId);
              return selectMode ? {
                onClick: () => toggleSelected(p.ProductId),
                role: 'checkbox',
                'aria-checked': selected,
                tabIndex: 0,
                onKeyDown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleSelected(p.ProductId); } },
              } : {};
            };
            const stockButton = (p, compact = false) => (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleStock(p.ProductId, p.ProductName, p.IsOutOfStock); }}
                className={`mm-stock-btn ${p.IsOutOfStock ? 'to-in' : 'to-out'} ${compact ? 'compact' : ''}`}
                title={p.IsOutOfStock ? 'กดเพื่อเปิดขายเมนูนี้' : 'กดเมื่อเมนูนี้หมด'}
              >
                <Icon name={p.IsOutOfStock ? 'check' : 'soldout'} size={15} />
                {p.IsOutOfStock ? 'ปรับเป็นพร้อมขาย' : 'ปรับเป็นสินค้าหมด'}
              </button>
            );
            const actionButtons = (p) => (
              <>
                <button type="button" className="mm-icon-btn" title="แก้ไขเมนู" aria-label={`แก้ไข ${p.ProductName}`} onClick={(e) => { e.stopPropagation(); openEditModal(p); }}>
                  <Icon name="edit" size={16} />
                </button>
                <button type="button" className="mm-icon-btn danger" title="ลบเมนู" aria-label={`ลบ ${p.ProductName}`} onClick={(e) => { e.stopPropagation(); handleDeleteMenu(p.ProductId, p.ProductName); }}>
                  <Icon name="trash" size={16} />
                </button>
              </>
            );
            const thumb = (p, cls) => p.img
              ? <img src={p.img} alt="" className={cls} />
              : <div className={`${cls} mm-noimg`}><Icon name="photo" size={cls === 'mm-card-img' ? 30 : 18} /></div>;

            return (
              <div className="mm-page" style={{ paddingBottom: selectMode ? '110px' : '40px' }}>
                <PageHeader
                  title="จัดการเมนูและสต็อก"
                  subtitle={loaded.products
                    ? `${fmtMoney(products.length)} เมนู · พร้อมขาย ${fmtMoney(inStockCount)} · หมด ${fmtMoney(outOfStockCount)} · วันนี้ขายไป ${fmtMoney(soldTodayTotal)} จาน`
                    : 'กำลังโหลดเมนู...'}
                  icon="menu"
                >
                  <button type="button" className="berry-btn btn-primary berry-add-menu-btn" onClick={openAddModal}>
                    <Icon name="plus" size={16} /> เพิ่มเมนูใหม่
                  </button>
                </PageHeader>

                {/* ===== แถบเครื่องมือ ===== */}
                <div className="mm-toolbar">
                  <div className="mm-tabs" role="tablist" aria-label="กรองตามสถานะสต็อก">
                    {filters.map(f => (
                      <button
                        key={f.id}
                        type="button"
                        role="tab"
                        aria-selected={menuFilter === f.id}
                        onClick={() => setMenuFilter(f.id)}
                        className={`mm-tab ${menuFilter === f.id ? 'active' : ''} ${f.tone ? `tone-${f.tone}` : ''}`}
                      >
                        {f.tone && <span className="dot" />}
                        {f.label}
                        <span className="count">{f.count}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mm-search">
                    <Icon name="search" size={16} />
                    <input value={menuSearch} onChange={e => setMenuSearch(e.target.value)} placeholder="ค้นหาชื่อหรือรายละเอียดเมนู..." aria-label="ค้นหาเมนู" />
                    {menuSearch && (
                      <button type="button" onClick={() => setMenuSearch('')} aria-label="ล้างคำค้นหา"><Icon name="close" size={14} /></button>
                    )}
                  </div>

                  <div className="mm-tool-group">
                    <select className="mm-select" value={menuSort} onChange={e => setMenuSort(e.target.value)} aria-label="เรียงเมนู">
                      <option value="default">เรียง: ค่าเริ่มต้น</option>
                      <option value="best">เรียง: ขายดีวันนี้</option>
                      <option value="priceAsc">เรียง: ราคาต่ำ → สูง</option>
                      <option value="priceDesc">เรียง: ราคาสูง → ต่ำ</option>
                      <option value="name">เรียง: ชื่อ ก–ฮ</option>
                    </select>

                    <div className="mm-view-toggle" role="group" aria-label="รูปแบบการแสดงผล">
                      <button type="button" className={menuView === 'grid' ? 'active' : ''} onClick={() => setMenuView('grid')} title="แสดงเป็นการ์ด" aria-pressed={menuView === 'grid'}>
                        <Icon name="grid" size={16} />
                      </button>
                      <button type="button" className={menuView === 'list' ? 'active' : ''} onClick={() => setMenuView('list')} title="แสดงเป็นรายการ" aria-pressed={menuView === 'list'}>
                        <Icon name="list" size={16} />
                      </button>
                    </div>

                    <button
                      type="button"
                      className={`mm-select-btn ${selectMode ? 'active' : ''}`}
                      onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                      disabled={!products.length}
                    >
                      <Icon name={selectMode ? 'close' : 'check'} size={15} />
                      {selectMode ? 'ยกเลิกเลือก' : 'เลือกหลายเมนู'}
                    </button>
                  </div>
                </div>

                {/* ===== แจ้งเตือนเมนูหมด ===== */}
                {loaded.products && outOfStockCount > 0 && menuFilter !== 'out' && (
                  <div className="mm-alert">
                    <Icon name="soldout" size={17} />
                    <span>มี <strong>{outOfStockCount}</strong> เมนูที่หมดอยู่ ลูกค้าจะสั่งเมนูเหล่านี้ไม่ได้</span>
                    <button type="button" onClick={() => setMenuFilter('out')}>ดูเมนูที่หมด <Icon name="arrowRight" size={14} /></button>
                  </div>
                )}

                {/* ===== เนื้อหา ===== */}
                {!loaded.products ? (
                  menuView === 'grid' ? (
                    <div className="mm-grid">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
                        <div key={i} className="mm-card">
                          <Skeleton height={140} radius={0} />
                          <div className="mm-card-body">
                            <Skeleton height={15} width="70%" />
                            <Skeleton height={11} width="90%" />
                            <Skeleton height={34} style={{ marginTop: 10 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mm-list">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="mm-row"><Skeleton height={48} /></div>)}</div>
                  )
                ) : products.length === 0 ? (
                  <div className="mm-empty">
                    <div className="icon"><Icon name="box" size={32} /></div>
                    <div className="title">ยังไม่มีเมนูในร้าน</div>
                    <div className="caption">เพิ่มเมนูแรกเพื่อให้ลูกค้าเริ่มสั่งอาหารได้</div>
                    <button type="button" className="berry-btn btn-primary" onClick={openAddModal}><Icon name="plus" size={16} /> เพิ่มเมนูใหม่</button>
                  </div>
                ) : visibleProducts.length === 0 ? (
                  <div className="mm-empty">
                    <div className="icon"><Icon name="search" size={30} /></div>
                    <div className="title">ไม่พบเมนูที่ตรงกับเงื่อนไข</div>
                    <div className="caption">ลองเปลี่ยนตัวกรองหรือคำค้นหา</div>
                    <button type="button" className="mm-select-btn" onClick={() => { setMenuFilter('all'); setMenuSearch(''); }}>ล้างตัวกรอง</button>
                  </div>
                ) : menuView === 'grid' ? (
                  /* ----- มุมมองการ์ด ----- */
                  <div className="mm-grid">
                    {visibleProducts.map(p => {
                      const selected = selectedIds.includes(p.ProductId);
                      return (
                        <div
                          key={p.ProductId}
                          className={`mm-card ${p.IsOutOfStock ? 'is-out' : ''} ${selectMode ? 'selectable' : ''} ${selected ? 'selected' : ''}`}
                          {...selectProps(p)}
                        >
                          <div className="mm-card-media">
                            {thumb(p, 'mm-card-img')}
                            <span className={`mm-status ${p.IsOutOfStock ? 'out' : 'in'}`}>
                              <span className="dot" />{p.IsOutOfStock ? 'สินค้าหมด' : 'พร้อมขาย'}
                            </span>
                            {sold(p) > 0 && <span className="mm-sold-badge"><Icon name="trend" size={12} /> {fmtMoney(sold(p))} จานวันนี้</span>}
                            {selectMode && <span className="mm-check">{selected && <Icon name="check" size={15} />}</span>}
                            {!selectMode && <div className="mm-card-hover-actions">{actionButtons(p)}</div>}
                          </div>
                          <div className="mm-card-body">
                            <div className="mm-card-title-row">
                              <h4 title={p.ProductName}>{p.ProductName}</h4>
                              <span className="mm-price">฿{fmtMoney(p.UnitPrice)}</span>
                            </div>
                            <p className={`mm-desc ${p.Description ? '' : 'empty'}`} title={p.Description || ''}>
                              {p.Description || 'ยังไม่มีรายละเอียดเมนู'}
                            </p>
                            {!selectMode && <div className="mm-card-footer">{stockButton(p)}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ----- มุมมองรายการ ----- */
                  <div className="mm-list">
                    <div className="mm-row mm-row-head">
                      {selectMode && <span className="col-check" />}
                      <span className="col-menu">เมนู</span>
                      <span className="col-price">ราคา</span>
                      <span className="col-sold">ขายวันนี้</span>
                      <span className="col-status">สถานะ</span>
                      <span className="col-actions">จัดการ</span>
                    </div>
                    {visibleProducts.map(p => {
                      const selected = selectedIds.includes(p.ProductId);
                      return (
                        <div
                          key={p.ProductId}
                          className={`mm-row ${p.IsOutOfStock ? 'is-out' : ''} ${selectMode ? 'selectable' : ''} ${selected ? 'selected' : ''}`}
                          {...selectProps(p)}
                        >
                          {selectMode && <span className="col-check"><span className="mm-check inline">{selected && <Icon name="check" size={14} />}</span></span>}
                          <div className="col-menu">
                            {thumb(p, 'mm-row-img')}
                            <div className="mm-row-text">
                              <div className="name" title={p.ProductName}>{p.ProductName}</div>
                              <div className={`desc ${p.Description ? '' : 'empty'}`} title={p.Description || ''}>{p.Description || 'ยังไม่มีรายละเอียด'}</div>
                            </div>
                          </div>
                          <span className="col-price mm-price">฿{fmtMoney(p.UnitPrice)}</span>
                          <span className={`col-sold ${sold(p) ? '' : 'zero'}`}>{fmtMoney(sold(p))} จาน</span>
                          <span className="col-status">
                            <span className={`mm-status inline ${p.IsOutOfStock ? 'out' : 'in'}`}><span className="dot" />{p.IsOutOfStock ? 'สินค้าหมด' : 'พร้อมขาย'}</span>
                          </span>
                          <span className="col-actions">
                            {!selectMode && <>{stockButton(p, true)}{actionButtons(p)}</>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ===== แถบจัดการหลายเมนู ===== */}
                {selectMode && (
                  <div className="berry-bulk-bar" role="region" aria-label="จัดการหลายเมนู">
                    <div className="info">
                      <strong>{selectedIds.length}</strong> เมนูที่เลือก
                      <button
                        type="button"
                        className="link"
                        onClick={() => setSelectedIds(allVisibleSelected ? selectedIds.filter(id => !visibleIds.includes(id)) : Array.from(new Set([...selectedIds, ...visibleIds])))}
                        disabled={!visibleIds.length}
                      >
                        {allVisibleSelected ? 'ไม่เลือกทั้งหมด' : `เลือกทั้งหมดที่แสดง (${visibleIds.length})`}
                      </button>
                    </div>
                    <div className="actions">
                      <button type="button" className="mm-stock-btn to-out" disabled={!selectedIds.length || bulkBusy} onClick={() => bulkSetStock(true)}>
                        {bulkBusy ? <span className="berry-spinner" /> : <Icon name="soldout" size={16} />} ปรับเป็นสินค้าหมด
                      </button>
                      <button type="button" className="mm-stock-btn to-in" disabled={!selectedIds.length || bulkBusy} onClick={() => bulkSetStock(false)}>
                        {bulkBusy ? <span className="berry-spinner" /> : <Icon name="check" size={16} />} ปรับเป็นพร้อมขาย
                      </button>
                      <button type="button" className="mm-icon-btn on-dark" onClick={exitSelectMode} disabled={bulkBusy} title="ปิดโหมดเลือก" aria-label="ปิดโหมดเลือก">
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {page === 'staff' && (() => {
            const activeStaff = staffList.filter(s => s.IsActive);
            const counts = {
              all: activeStaff.length,
              front: activeStaff.filter(s => s.Role === 'Front Staff').length,
              kitchen: activeStaff.filter(s => s.Role === 'Kitchen Staff').length,
              inactive: staffList.length - activeStaff.length,
            };
            const workingToday = activeStaff.filter(s => s.OrdersToday > 0).length;
            const lockedCount = activeStaff.filter(s => s.IsLocked).length;
            const tabs = [
              { id: 'all', label: 'ทั้งหมด', count: counts.all },
              { id: 'front', label: 'หน้าร้าน', count: counts.front },
              { id: 'kitchen', label: 'ครัว', count: counts.kitchen },
              { id: 'inactive', label: 'ปิดใช้งาน', count: counts.inactive, tone: 'red' },
            ];
            const q = staffSearch.trim().toLowerCase();
            const qDigits = phoneDigits(q);
            const shown = staffList
              .filter(s => (staffFilter === 'inactive' ? !s.IsActive : s.IsActive))
              .filter(s => staffFilter === 'front' ? s.Role === 'Front Staff' : staffFilter === 'kitchen' ? s.Role === 'Kitchen Staff' : true)
              .filter(s => !q
                || [s.FullName, s.Username, s.Email].some(v => String(v || '').toLowerCase().includes(q))
                || (/^\d+$/.test(qDigits) && String(s.Phone || '').includes(qDigits)));
            const stats = [
              { tone: 'orange', icon: 'users', value: counts.all, label: 'พนักงานที่ใช้งานอยู่' },
              { tone: 'blue', icon: 'receipt', value: counts.front, label: 'พนักงานหน้าร้าน' },
              { tone: 'amber', icon: 'flame', value: counts.kitchen, label: 'พนักงานครัว' },
              { tone: 'green', icon: 'activity', value: workingToday, label: 'ทำรายการวันนี้', sub: lockedCount ? `บัญชีถูกล็อก ${lockedCount} คน` : null },
            ];
            return (
              <>
                <PageHeader title="จัดการพนักงาน" subtitle={`พนักงานหน้าร้านและพนักงานครัวของร้าน · ใช้งานอยู่ ${counts.all} คน`} icon="users">
                  <button className="berry-btn btn-primary" onClick={() => setStaffModal({ mode: 'add' })}>
                    <Icon name="plus" size={16} /> เพิ่มพนักงาน
                  </button>
                </PageHeader>

                <div className="sf-stats">
                  {stats.map(st => (
                    <div key={st.label} className={`sf-stat tone-${st.tone}`}>
                      <span className="icon"><Icon name={st.icon} size={20} /></span>
                      <div>
                        <div className="value">{loaded.staff ? st.value : <Skeleton height={22} width={36} />}</div>
                        <div className="label">{st.label}</div>
                        {st.sub && <div className="sub">{st.sub}</div>}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mm-toolbar mm-wrap-tabs">
                  <div className="mm-tabs" role="tablist" aria-label="กรองพนักงาน">
                    {tabs.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={staffFilter === t.id}
                        onClick={() => setStaffFilter(t.id)}
                        className={`mm-tab ${staffFilter === t.id ? 'active' : ''} ${t.tone ? `tone-${t.tone}` : ''}`}
                      >
                        {t.tone && <span className="dot" />}
                        {t.label}
                        <span className="count">{t.count}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mm-search">
                    <Icon name="search" size={16} />
                    <input value={staffSearch} onChange={e => setStaffSearch(e.target.value)} placeholder="ค้นหาชื่อ ชื่อผู้ใช้ เบอร์โทร หรืออีเมล..." aria-label="ค้นหาพนักงาน" />
                    {staffSearch && (
                      <button type="button" onClick={() => setStaffSearch('')} aria-label="ล้างคำค้นหา"><Icon name="close" size={14} /></button>
                    )}
                  </div>
                </div>

                {!loaded.staff ? (
                  <div className="sf-grid">
                    {[0, 1, 2].map(i => <Skeleton key={i} height={330} radius={16} />)}
                  </div>
                ) : shown.length === 0 ? (
                  <div className="sf-empty">
                    <span className="icon"><Icon name={q ? 'search' : 'users'} size={28} /></span>
                    <h3>
                      {q ? 'ไม่พบพนักงานที่ตรงกับการค้นหา'
                        : staffFilter === 'inactive' ? 'ไม่มีบัญชีที่ปิดใช้งาน'
                        : staffList.length === 0 ? 'ยังไม่มีพนักงานในร้าน' : 'ไม่มีพนักงานในกลุ่มนี้'}
                    </h3>
                    <p>
                      {q ? 'ลองค้นด้วยชื่อ ชื่อผู้ใช้ หรือเบอร์โทรอื่น'
                        : staffFilter === 'inactive' ? 'พนักงานที่ถูกปิดใช้งานจะแสดงที่นี่ และเปิดใช้งานกลับได้'
                        : 'เพิ่มบัญชีให้พนักงานหน้าร้านหรือพนักงานครัว เพื่อให้เข้าระบบรับออเดอร์ได้'}
                    </p>
                    {!q && staffFilter !== 'inactive' && (
                      <button className="berry-btn btn-primary" onClick={() => setStaffModal({ mode: 'add' })}>
                        <Icon name="plus" size={16} /> เพิ่มพนักงาน
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="sf-grid">
                    {shown.map(s => (
                      <StaffCard
                        key={s.UserId}
                        staff={s}
                        busy={staffBusyId === s.UserId}
                        onEdit={() => setStaffModal({ mode: 'edit', staff: s })}
                        onResetPassword={() => setPasswordStaff(s)}
                        onToggleActive={() => (s.IsActive ? askDeactivateStaff(s) : setStaffActive(s, true))}
                        onErase={() => setEraseStaff(s)}
                      />
                    ))}
                  </div>
                )}
              </>
            );
          })()}

          {page === 'history' && (() => {
            // ---- ช่วงวันที่ ----
            const today = todayISO();
            const shiftDays = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return toISODate(d); };
            const range = salesRange === 'custom'
              ? { from: salesFrom || today, to: salesTo || today }
              : salesRange === 'all' ? null
              : { from: salesRange === 'today' ? today : shiftDays(Number(salesRange) - 1), to: today };
            const inRange = history.filter(o => {
              if (!range) return true;
              const d = parseOrderDate(o.CreatedAt);
              const iso = d ? toISODate(d) : '';
              return iso >= range.from && iso <= range.to;
            });

            // ---- สถานะ + ค้นหา ----
            const group = (o) => (o.StatusCode === 'COMPLETED' ? 'done'
              : o.StatusCode === 'CANCELLED' ? 'cancelled'
              : o.StatusCode === 'NO_SHOW' ? 'noshow' : 'active');
            const counts = inRange.reduce((acc, o) => { acc[group(o)] += 1; return acc; }, { done: 0, active: 0, cancelled: 0, noshow: 0 });
            const q = salesSearch.trim().toLowerCase();
            const shown = inRange
              .filter(o => salesStatus === 'all' || group(o) === salesStatus)
              .filter(o => !q
                || String(o.QueueNo || '').toLowerCase().includes(q)
                || String(o.OrderID).includes(q)
                || String(o.CustomerName || '').toLowerCase().includes(q)
                || (o.items || []).some(i => String(i.ProductName || '').toLowerCase().includes(q)))
              // เรียงตามเวลาสั่งล่าสุดก่อน (API เรียงตามเลขออเดอร์) : ต้องเรียงก่อนจัดกลุ่มวัน ไม่งั้นวันเดียวกันแตกเป็นหลายกลุ่ม
              .sort((x, y) => (parseOrderDate(y.CreatedAt)?.getTime() || 0) - (parseOrderDate(x.CreatedAt)?.getTime() || 0)
                || y.OrderID - x.OrderID);

            // ---- สรุปยอดของช่วงที่เลือก ----
            const revenueOrders = inRange.filter(isRevenueOrder);
            const revenue = revenueOrders.reduce((s, o) => s + orderNet(o, refundedByOrder), 0);
            const noShowSales = revenueOrders.filter(isNoShowOrder).reduce((s, o) => s + orderNet(o, refundedByOrder), 0);
            const refundedSum = revenueOrders.reduce((s, o) => s + Number(refundedByOrder[o.OrderID] || 0), 0);
            // อัตรายกเลิก = ยกเลิก ÷ ออเดอร์ที่จบแล้ว (สำเร็จ + ไม่มารับ + ยกเลิก) เหมือนแดชบอร์ด
            const finishedCount = revenueOrders.length + counts.cancelled;
            const cancelRate = finishedCount ? Math.round((counts.cancelled / finishedCount) * 100) : 0;
            const kpis = [
              { tone: 'orange', icon: 'receipt', value: fmtMoney(inRange.length), label: 'ออเดอร์ทั้งหมด', sub: counts.active ? `กำลังดำเนินการ ${counts.active}` : null },
              { tone: 'green', icon: 'coin', value: `฿${fmtMoney(revenue)}`, label: 'ยอดขายสุทธิ (สำเร็จ + ไม่มารับ)',
                sub: [counts.noshow ? `รวมไม่มารับ ฿${fmtMoney(noShowSales)}` : null, refundedSum ? `หักคืนเงิน ฿${fmtMoney(refundedSum)}` : null].filter(Boolean).join(' · ') || null },
              { tone: 'blue', icon: 'trend', value: `฿${fmtMoney(revenueOrders.length ? revenue / revenueOrders.length : 0)}`, label: 'เฉลี่ยต่อออเดอร์' },
              { tone: 'amber', icon: 'soldout', value: fmtMoney(counts.cancelled), label: 'ยกเลิก', sub: finishedCount ? `${cancelRate}% ของออเดอร์ที่จบแล้ว` : null },
            ];
            const statusTabs = [
              { id: 'all', label: 'ทั้งหมด', count: inRange.length },
              { id: 'done', label: 'สำเร็จ', count: counts.done, tone: 'green' },
              { id: 'active', label: 'กำลังดำเนินการ', count: counts.active },
              { id: 'cancelled', label: 'ยกเลิก', count: counts.cancelled, tone: 'red' },
              { id: 'noshow', label: 'ไม่มารับ', count: counts.noshow },
            ];
            const rangeChips = [
              { id: 'today', label: 'วันนี้' }, { id: '7', label: '7 วัน' }, { id: '30', label: '30 วัน' },
              { id: 'all', label: 'ทั้งหมด' }, { id: 'custom', label: 'กำหนดเอง' },
            ];

            // ---- จัดกลุ่มตามวัน (แสดงทีละ salesLimit รายการ) ----
            const visible = shown.slice(0, salesLimit);
            const days = [];
            visible.forEach(o => {
              const d = parseOrderDate(o.CreatedAt);
              const key = d ? toISODate(d) : 'unknown';
              let day = days[days.length - 1];
              if (!day || day.key !== key) { day = { key, date: d, orders: [] }; days.push(day); }
              day.orders.push(o);
            });
            const daySummary = (key) => {
              const list = shown.filter(o => { const d = parseOrderDate(o.CreatedAt); return (d ? toISODate(d) : 'unknown') === key; });
              return { count: list.length, sales: list.filter(isRevenueOrder).reduce((s, o) => s + orderNet(o, refundedByOrder), 0) };
            };

            return (
              <>
                <PageHeader title="ประวัติการขาย" subtitle="ออเดอร์ทั้งหมดของร้าน กดที่ออเดอร์เพื่อดูรายละเอียด ใครรับ ใครทำ และไทม์ไลน์" icon="history">
                  <span className="op-count-chip">{fmtMoney(shown.length)} ออเดอร์</span>
                </PageHeader>

                <div className="sh-filter-bar">
                  <div className="sh-range" role="group" aria-label="ช่วงวันที่">
                    <Icon name="calendar" size={16} />
                    {rangeChips.map(c => (
                      <button key={c.id} type="button" className={salesRange === c.id ? 'active' : ''}
                        onClick={() => { setSalesRange(c.id); setSalesLimit(60); }}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {salesRange === 'custom' && (
                    <div className="berry-date-range sh-dates">
                      <label>
                        ตั้งแต่
                        <input type="date" value={salesFrom} max={salesTo || today}
                          onChange={e => { const v = e.target.value || today; setSalesFrom(v); if (v > salesTo) setSalesTo(v); setSalesLimit(60); }} />
                      </label>
                      <label>
                        ถึง
                        <input type="date" value={salesTo} min={salesFrom} max={today}
                          onChange={e => { setSalesTo(e.target.value || today); setSalesLimit(60); }} />
                      </label>
                    </div>
                  )}
                  <span className="sh-range-label">
                    {range ? (range.from === range.to ? thaiDate(range.from) : `${thaiDate(range.from)} – ${thaiDate(range.to)}`) : 'ทุกช่วงเวลา'}
                  </span>
                </div>

                <div className="sf-stats">
                  {kpis.map(k => (
                    <div key={k.label} className={`sf-stat tone-${k.tone}`}>
                      <span className="icon"><Icon name={k.icon} size={20} /></span>
                      <div style={{ minWidth: 0 }}>
                        <div className="value">{loaded.history ? k.value : <Skeleton height={22} width={60} />}</div>
                        <div className="label">{k.label}</div>
                        {k.sub && <div className="sub">{k.sub}</div>}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mm-toolbar mm-wrap-tabs">
                  <div className="mm-tabs" role="tablist" aria-label="กรองตามสถานะ">
                    {statusTabs.map(t => (
                      <button key={t.id} type="button" role="tab" aria-selected={salesStatus === t.id}
                        onClick={() => { setSalesStatus(t.id); setSalesLimit(60); }}
                        className={`mm-tab ${salesStatus === t.id ? 'active' : ''} ${t.tone ? `tone-${t.tone}` : ''}`}>
                        {t.tone && <span className="dot" />}
                        {t.label}
                        <span className="count">{t.count}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mm-search">
                    <Icon name="search" size={16} />
                    <input value={salesSearch} onChange={e => { setSalesSearch(e.target.value); setSalesLimit(60); }}
                      placeholder="ค้นหาเลขคิว เลขออเดอร์ ชื่อลูกค้า หรือเมนู..." aria-label="ค้นหาออเดอร์" />
                    {salesSearch && (
                      <button type="button" onClick={() => setSalesSearch('')} aria-label="ล้างคำค้นหา"><Icon name="close" size={14} /></button>
                    )}
                  </div>
                </div>

                {!loaded.history ? (
                  <div className="sh-list">{[0, 1, 2, 3].map(i => <Skeleton key={i} height={72} radius={14} />)}</div>
                ) : shown.length === 0 ? (
                  <div className="sf-empty">
                    <span className="icon"><Icon name={q ? 'search' : 'history'} size={28} /></span>
                    <h3>{q ? 'ไม่พบออเดอร์ที่ตรงกับการค้นหา' : 'ไม่มีออเดอร์ในช่วงนี้'}</h3>
                    <p>{q ? 'ลองค้นด้วยเลขคิว ชื่อลูกค้า หรือชื่อเมนูอื่น' : 'ลองเลือกช่วงวันที่ที่กว้างขึ้น หรือเปลี่ยนตัวกรองสถานะ'}</p>
                  </div>
                ) : (
                  <div className="sh-list">
                    {days.map(day => {
                      const sum = daySummary(day.key);
                      return (
                        <section key={day.key} className="sh-day">
                          <div className="sh-day-head">
                            <strong>{day.date ? day.date.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'ไม่ทราบวันที่'}</strong>
                            <span>{sum.count} ออเดอร์ · ยอดขาย ฿{fmtMoney(sum.sales)}</span>
                          </div>
                          <div className="sh-day-card">
                            {day.orders.map(o => {
                              const sm = orderStatusMeta(o.StatusCode);
                              const its = o.items || [];
                              const itemText = its.slice(0, 2).map(i => `${i.ProductName} ×${i.Qty}`).join(', ');
                              return (
                                <button key={o.OrderID} type="button" className={`sh-row status-${group(o)}`} onClick={() => setSalesDetailId(o.OrderID)}>
                                  <span className="sh-time">{timeHM(o.CreatedAt)}</span>
                                  <span className="sh-queue">{o.QueueNo}</span>
                                  <span className="sh-main">
                                    <span className="sh-who">
                                      {o.IsWalkIn ? <span className="sh-type walkin">Walk-in</span> : (o.CustomerName || 'ลูกค้า')}
                                      <span className="sh-order-id">#{o.OrderID}</span>
                                    </span>
                                    <span className="sh-items-text">
                                      {itemText || 'ไม่มีรายการอาหาร'}{its.length > 2 ? ` และอีก ${its.length - 2} รายการ` : ''}
                                    </span>
                                  </span>
                                  <span className="sh-pay-method" title={o.PaymentMethod || ''}>
                                    <Icon name={o.PaymentMethodCode === 'CASH' ? 'coin' : 'receipt'} size={14} />
                                    {o.PaymentMethodCode === 'CASH' ? 'เงินสด' : 'โอน'}
                                  </span>
                                  <span className="sh-amount">฿{fmtMoney(o.TotalAmount)}</span>
                                  <span className="sh-status">
                                    <Badge tone={sm.tone}>{sm.label}</Badge>
                                    {o.DeliveredAt && <span className="sh-delivered" title="เวลาที่ส่งมอบอาหาร">ส่งมอบ {timeHM(o.DeliveredAt)}</span>}
                                  </span>
                                  <span className="sh-chevron"><Icon name="arrowRight" size={16} /></span>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                    {shown.length > salesLimit && (
                      <button type="button" className="sh-more" onClick={() => setSalesLimit(n => n + 60)}>
                        แสดงเพิ่ม ({fmtMoney(shown.length - salesLimit)} ออเดอร์ที่เหลือ)
                      </button>
                    )}
                  </div>
                )}
              </>
            );
          })()}

          {page === 'reviews' && (() => {
            const all = reviewsData.reviews || [];
            const sm = reviewsData.summary || {};
            const total = sm.total || 0;
            const breakdown = sm.breakdown || {};
            const last30 = sm.last30 || {};
            const prev30 = sm.prev30 || {};
            const trend = last30.average != null && prev30.average != null ? last30.average - prev30.average : null;
            const q = reviewSearch.trim().toLowerCase();
            const shown = all
              .filter(r => reviewFilter === 'all' || String(r.Rating) === reviewFilter)
              .filter(r => reviewOnly !== 'comment' || (r.Comment || '').trim())
              .filter(r => reviewOnly !== 'photo' || r.ImageUrl)
              .filter(r => !q || (r.Comment || '').toLowerCase().includes(q)
                || (r.items || []).some(i => String(i.ProductName || '').toLowerCase().includes(q))
                || String(r.QueueNo || '').toLowerCase().includes(q))
              .sort((a, b) => (reviewSort === 'low' ? a.Rating - b.Rating : reviewSort === 'high' ? b.Rating - a.Rating : 0)
                || (parseOrderDate(b.CreatedAt)?.getTime() || 0) - (parseOrderDate(a.CreatedAt)?.getTime() || 0));
            const menu = reviewsData.menu || [];
            const insights = [
              {
                icon: 'trend', tone: trend == null ? 'blue' : trend >= 0 ? 'green' : 'red',
                value: last30.average != null ? last30.average.toFixed(1) : '—',
                label: `เฉลี่ย 30 วันล่าสุด (${fmtMoney(last30.count || 0)} รีวิว)`,
                sub: trend == null ? 'ยังไม่มีข้อมูลเทียบช่วงก่อน' : `${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend).toFixed(1)} จาก 30 วันก่อนหน้า`,
              },
              { icon: 'award', tone: 'green', value: total ? `${Math.round(((sm.positive || 0) / total) * 100)}%` : '—', label: 'รีวิวดี (4–5 ดาว)' },
              { icon: 'edit', tone: 'orange', value: fmtMoney(sm.with_comment || 0), label: 'รีวิวที่มีความเห็น' },
              { icon: 'photo', tone: 'amber', value: fmtMoney(sm.with_photo || 0), label: 'รีวิวที่มีรูป' },
            ];
            return (
              <>
                <PageHeader title="รีวิวจากลูกค้า" subtitle="คะแนน ความเห็น และเมนูที่ลูกค้ารีวิว" icon="star">
                  <div className="op-rating-chip">
                    <span className="star">★</span>
                    <strong>{(sm.average || 0).toFixed(1)}</strong>
                    <span>/ 5 · {fmtMoney(total)} รีวิว</span>
                  </div>
                </PageHeader>

                <div className="rv-privacy"><Icon name="lock" size={15} /> เพื่อความเป็นส่วนตัวของลูกค้า ระบบแสดงชื่อแบบย่อ และไม่แสดงเบอร์โทรหรืออีเมลของคนรีวิว</div>

                <div className="rv-overview">
                  <section className="rv-score">
                    <div className="rv-score-big">{(sm.average || 0).toFixed(1)}</div>
                    <Stars value={sm.average || 0} size={22} />
                    <div className="rv-score-sub">จาก {fmtMoney(total)} รีวิว</div>
                  </section>
                  <section className="rv-bars" aria-label="จำนวนรีวิวแยกตามดาว">
                    {[5, 4, 3, 2, 1].map(n => {
                      const c = breakdown[String(n)] || 0;
                      const pct = total ? Math.round((c / total) * 100) : 0;
                      const active = reviewFilter === String(n);
                      return (
                        <button key={n} type="button" className={`rv-bar ${active ? 'active' : ''}`}
                          onClick={() => setReviewFilter(active ? 'all' : String(n))} title={active ? 'แสดงทั้งหมด' : `กรองเฉพาะ ${n} ดาว`}>
                          <span className="rv-bar-label">{n} ★</span>
                          <span className="rv-bar-track"><span className={`rv-bar-fill tone-${RATING_TONE[n]}`} style={{ width: `${pct}%` }} /></span>
                          <span className="rv-bar-count">{fmtMoney(c)}</span>
                        </button>
                      );
                    })}
                  </section>
                  <section className="rv-insights">
                    {insights.map(it => (
                      <div key={it.label} className={`rv-insight tone-${it.tone}`}>
                        <span className="icon"><Icon name={it.icon} size={17} /></span>
                        <div style={{ minWidth: 0 }}>
                          <strong>{it.value}</strong>
                          <span>{it.label}</span>
                          {it.sub && <em>{it.sub}</em>}
                        </div>
                      </div>
                    ))}
                  </section>
                </div>

                {menu.length > 0 && (
                  <section className="rv-menu-card">
                    <h4 className="sf-section-title"><Icon name="menu" size={16} /> คะแนนตามเมนู <span className="rv-hint">คำนวณจากคะแนนของออเดอร์ที่มีเมนูนั้น</span></h4>
                    <div className="rv-menu-list">
                      {menu.slice(0, 8).map(m => (
                        <button key={m.ProductId} type="button" className="rv-menu-item" onClick={() => setReviewSearch(m.ProductName)} title="ดูรีวิวของเมนูนี้">
                          <span className="rv-item-img lg">{m.ImageUrl ? <img src={m.ImageUrl} alt="" /> : <Icon name="photo" size={16} />}</span>
                          <span className="rv-menu-text">
                            <strong>{m.ProductName}</strong>
                            <span><Stars value={m.average} size={12} /> {m.average.toFixed(1)} · {fmtMoney(m.count)} รีวิว</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <div className="mm-toolbar mm-wrap-tabs">
                  <div className="mm-tabs" role="tablist" aria-label="กรองตามคะแนน">
                    {['all', '5', '4', '3', '2', '1'].map(f => (
                      <button key={f} type="button" role="tab" aria-selected={reviewFilter === f}
                        className={`mm-tab ${reviewFilter === f ? 'active' : ''}`} onClick={() => setReviewFilter(f)}>
                        {f === 'all' ? 'ทั้งหมด' : `${f} ★`}
                        <span className="count">{f === 'all' ? total : (breakdown[f] || 0)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="rv-chips">
                    {[{ id: 'comment', label: 'มีความเห็น', icon: 'edit' }, { id: 'photo', label: 'มีรูป', icon: 'photo' }].map(c => (
                      <button key={c.id} type="button" className={`rv-chip ${reviewOnly === c.id ? 'active' : ''}`}
                        onClick={() => setReviewOnly(reviewOnly === c.id ? null : c.id)}>
                        <Icon name={c.icon} size={13} /> {c.label}
                      </button>
                    ))}
                    <select className="mm-select" value={reviewSort} onChange={e => setReviewSort(e.target.value)} aria-label="เรียงรีวิว">
                      <option value="new">ล่าสุดก่อน</option>
                      <option value="low">คะแนนต่ำก่อน</option>
                      <option value="high">คะแนนสูงก่อน</option>
                    </select>
                  </div>
                  <div className="mm-search">
                    <Icon name="search" size={16} />
                    <input value={reviewSearch} onChange={e => setReviewSearch(e.target.value)} placeholder="ค้นหาในความเห็น ชื่อเมนู หรือเลขคิว..." aria-label="ค้นหารีวิว" />
                    {reviewSearch && <button type="button" onClick={() => setReviewSearch('')} aria-label="ล้างคำค้นหา"><Icon name="close" size={14} /></button>}
                  </div>
                </div>

                {!loaded.reviews ? (
                  <div className="rv-grid">{[0, 1, 2, 3].map(i => <Skeleton key={i} height={210} radius={16} />)}</div>
                ) : shown.length === 0 ? (
                  <div className="sf-empty">
                    <span className="icon"><Icon name="star" size={28} /></span>
                    <h3>{total === 0 ? 'ยังไม่มีรีวิว' : 'ไม่มีรีวิวที่ตรงกับตัวกรอง'}</h3>
                    <p>{total === 0 ? 'เมื่อลูกค้ารับอาหารแล้วรีวิวร้าน คะแนนและความเห็นจะแสดงที่นี่' : 'ลองเปลี่ยนตัวกรองคะแนน หรือล้างคำค้นหา'}</p>
                  </div>
                ) : (
                  <div className="rv-grid">
                    {shown.map(r => <ReviewCard key={r.ReviewId} review={r} onPhoto={setReviewPhoto} />)}
                  </div>
                )}
                {reviewPhoto && <ReviewPhotoLightbox src={reviewPhoto} onClose={() => setReviewPhoto(null)} />}
              </>
            );
          })()}

          {page === 'refunds' && (
            <RefundLog apiBase={apiBase} canConfirm isOwner onChanged={fetchData} />
          )}

          {page === 'issues' && (() => {
            const sm = issuesSummary || {};
            const byStatus = sm.by_status || {};
            const pending = (byStatus.OPEN || 0) + (byStatus.IN_PROGRESS || 0);
            const days = issueRange === 'all' ? null : Number(issueRange);
            const q = issueSearch.trim().toLowerCase();
            const inRange = issues.filter(i => days === null || hoursSince(i.CreatedAt) <= days * 24);
            const shown = inRange
              .filter(i => issueStatusFilter === 'all'
                || (issueStatusFilter === 'pending' ? ISSUE_OPEN_STATES.includes(i.IssueStatus) : i.IssueStatus === issueStatusFilter))
              .filter(i => issueFilter === 'all' || i.TypeCode === issueFilter)
              .filter(i => !q || String(i.Description || '').toLowerCase().includes(q)
                || String(i.QueueNo || '').toLowerCase().includes(q)
                || (i.items || []).some(it => String(it.ProductName || '').toLowerCase().includes(q)))
              .sort((a, b) => {
                const ta = parseOrderDate(a.CreatedAt)?.getTime() || 0;
                const tb = parseOrderDate(b.CreatedAt)?.getTime() || 0;
                return issueSort === 'old' ? ta - tb : tb - ta;
              });
            const statusCount = (id) => inRange.filter(i => id === 'all' ? true
              : id === 'pending' ? ISSUE_OPEN_STATES.includes(i.IssueStatus) : i.IssueStatus === id).length;
            const statusTabs = [
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'pending', label: 'ต้องจัดการ', tone: 'red' },
              { id: 'IN_PROGRESS', label: 'กำลังดำเนินการ' },
              { id: 'RESOLVED', label: 'แก้ไขแล้ว', tone: 'green' },
              { id: 'REJECTED', label: 'ไม่รับเรื่อง' },
            ];
            const trend = (sm.last30 || 0) - (sm.prev30 || 0);
            const kpis = [
              { tone: 'red', icon: 'alert', value: fmtMoney(pending), label: 'เรื่องที่ต้องจัดการ', sub: byStatus.OPEN ? `ยังไม่รับเรื่อง ${byStatus.OPEN}` : null },
              { tone: 'green', icon: 'check', value: fmtMoney(byStatus.RESOLVED || 0), label: 'แก้ไขแล้ว' },
              { tone: 'blue', icon: 'clock', value: formatHours(sm.avg_resolve_hours), label: 'เวลาปิดเรื่องเฉลี่ย' },
              { tone: 'amber', icon: 'trend', value: fmtMoney(sm.last30 || 0), label: 'เรื่องใหม่ 30 วันล่าสุด',
                sub: sm.prev30 || sm.last30 ? `${trend > 0 ? '▲' : trend < 0 ? '▼' : '='} ${Math.abs(trend)} จาก 30 วันก่อน` : null },
            ];
            const maxType = Math.max(1, ...(sm.by_type || []).map(t => t.count));
            return (
              <>
                <PageHeader title="รายงานปัญหาจากลูกค้า" subtitle="ติดตาม ตอบกลับ และปิดเรื่องที่ลูกค้าแจ้งเข้ามา" icon="alert">
                  <span className={`op-count-chip ${pending ? 'danger' : ''}`}>{pending ? `ต้องจัดการ ${fmtMoney(pending)} เรื่อง` : `${fmtMoney(issues.length)} รายการ`}</span>
                </PageHeader>

                <div className="rv-privacy"><Icon name="lock" size={15} /> เพื่อความเป็นส่วนตัวของลูกค้า ระบบแสดงชื่อผู้แจ้งแบบย่อ และไม่แสดงเบอร์โทรหรืออีเมล ตอบกลับลูกค้าได้ผ่านปุ่มในแต่ละเรื่อง</div>

                <div className="sf-stats">
                  {kpis.map(k => (
                    <div key={k.label} className={`sf-stat tone-${k.tone === 'red' ? 'orange' : k.tone}`}>
                      <span className="icon"><Icon name={k.icon} size={20} /></span>
                      <div style={{ minWidth: 0 }}>
                        <div className="value">{loaded.issues ? k.value : <Skeleton height={22} width={40} />}</div>
                        <div className="label">{k.label}</div>
                        {k.sub && <div className="sub">{k.sub}</div>}
                      </div>
                    </div>
                  ))}
                </div>

                {(sm.by_type || []).length > 0 && (
                  <section className="rv-menu-card">
                    <h4 className="sf-section-title"><Icon name="pie" size={16} /> ประเภทปัญหาที่พบ <span className="rv-hint">กดเพื่อกรองเฉพาะประเภทนั้น</span></h4>
                    <div className="is-types">
                      {sm.by_type.map(t => {
                        const active = issueFilter === t.TypeCode;
                        return (
                          <button key={t.TypeCode} type="button" className={`is-type-row ${active ? 'active' : ''}`}
                            onClick={() => setIssueFilter(active ? 'all' : t.TypeCode)}>
                            <span className="is-type-name"><Icon name={ISSUE_TYPE_ICON[t.TypeCode] || 'alert'} size={14} /> {t.IssueType}</span>
                            <span className="rv-bar-track"><span className="rv-bar-fill tone-amber" style={{ width: `${(t.count / maxType) * 100}%` }} /></span>
                            <span className="is-type-count">{t.count}{t.open > 0 && <em> · ค้าง {t.open}</em>}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                <div className="mm-toolbar mm-wrap-tabs">
                  <div className="mm-tabs" role="tablist" aria-label="กรองตามสถานะ">
                    {statusTabs.map(t => (
                      <button key={t.id} type="button" role="tab" aria-selected={issueStatusFilter === t.id}
                        className={`mm-tab ${issueStatusFilter === t.id ? 'active' : ''} ${t.tone ? `tone-${t.tone}` : ''}`}
                        onClick={() => setIssueStatusFilter(t.id)}>
                        {t.tone && <span className="dot" />}{t.label}<span className="count">{statusCount(t.id)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="rv-chips">
                    <select className="mm-select" value={issueFilter} onChange={e => setIssueFilter(e.target.value)} aria-label="ประเภทปัญหา">
                      <option value="all">ทุกประเภท</option>
                      {(sm.by_type || []).map(t => <option key={t.TypeCode} value={t.TypeCode}>{t.IssueType}</option>)}
                    </select>
                    <select className="mm-select" value={issueRange} onChange={e => setIssueRange(e.target.value)} aria-label="ช่วงเวลา">
                      <option value="7">7 วันล่าสุด</option>
                      <option value="30">30 วันล่าสุด</option>
                      <option value="all">ทุกช่วงเวลา</option>
                    </select>
                    <select className="mm-select" value={issueSort} onChange={e => setIssueSort(e.target.value)} aria-label="เรียงลำดับ">
                      <option value="new">ใหม่ก่อน</option>
                      <option value="old">ค้างนานก่อน</option>
                    </select>
                  </div>
                  <div className="mm-search">
                    <Icon name="search" size={16} />
                    <input value={issueSearch} onChange={e => setIssueSearch(e.target.value)} placeholder="ค้นหาในรายละเอียด เลขคิว หรือชื่อเมนู..." aria-label="ค้นหารายงานปัญหา" />
                    {issueSearch && <button type="button" onClick={() => setIssueSearch('')} aria-label="ล้างคำค้นหา"><Icon name="close" size={14} /></button>}
                  </div>
                </div>

                {!loaded.issues ? (
                  <div className="rv-grid">{[0, 1, 2].map(k => <Skeleton key={k} height={260} radius={16} />)}</div>
                ) : shown.length === 0 ? (
                  <div className="sf-empty">
                    <span className="icon"><Icon name={issues.length ? 'search' : 'check'} size={28} /></span>
                    <h3>{issues.length === 0 ? 'ยังไม่มีลูกค้าแจ้งปัญหา' : issueStatusFilter === 'pending' ? 'ไม่มีเรื่องค้าง เยี่ยมมาก!' : 'ไม่มีรายงานที่ตรงกับตัวกรอง'}</h3>
                    <p>{issues.length === 0 ? 'เมื่อลูกค้าแจ้งปัญหาเกี่ยวกับร้าน จะแสดงที่นี่ พร้อมปุ่มตอบกลับ' : 'ลองเปลี่ยนช่วงเวลา สถานะ หรือประเภทปัญหา'}</p>
                  </div>
                ) : (
                  <div className="rv-grid">
                    {shown.map(i => (
                      <IssueCard key={i.IssueReportId} issue={i} busy={issueBusyId === i.IssueReportId}
                        onAction={(issue, target) => (target === 'IN_PROGRESS' && issue.IssueStatus === 'OPEN'
                          ? updateIssueStatus(issue, 'IN_PROGRESS', issue.AdminNote || '')
                          : setIssueRespond({ issue, target }))} />
                    ))}
                  </div>
                )}
                {issueRespond && (
                  <IssueRespondModal issue={issueRespond.issue} target={issueRespond.target}
                    onClose={() => setIssueRespond(null)}
                    onSubmit={async (target, note) => { await updateIssueStatus(issueRespond.issue, target, note, true); setIssueRespond(null); }} />
                )}
              </>
            );
          })()}


        </main>
      </div>

      {/* ===== เพิ่ม / แก้ไขพนักงาน + รีเซ็ตรหัสผ่าน ===== */}
      {staffModal && (
        <StaffFormModal
          key={staffModal.mode === 'edit' ? `edit-${staffModal.staff.UserId}` : 'add'}
          mode={staffModal.mode}
          staff={staffModal.staff}
          onClose={() => setStaffModal(null)}
          onSubmit={saveStaff}
        />
      )}
      {passwordStaff && (
        <StaffPasswordModal staff={passwordStaff} onClose={() => setPasswordStaff(null)} onSubmit={resetStaffPassword} />
      )}
      {eraseStaff && (
        <StaffEraseModal staff={eraseStaff} onClose={() => setEraseStaff(null)} onSubmit={eraseStaffAccount} />
      )}
      {salesDetailId && (
        <SalesOrderDetailModal
          key={salesDetailId}
          orderId={salesDetailId}
          statusCode={history.find(o => o.OrderID === salesDetailId)?.StatusCode}
          apiBase={apiBase}
          onClose={() => setSalesDetailId(null)}
        />
      )}
      {notifDetail && (
        <NotifDetailModal
          item={notifDetail}
          {...resolveNotifContext(notifDetail)}
          onClose={() => setNotifDetail(null)}
          onGo={(target) => {
            const it = notifDetail;
            setNotifDetail(null);
            if (target === 'history') openSalesHistory({ status: 'all', range: 'all', orderId: it.orderId });
            else setPage(target);
          }}
        />
      )}

      {/* ===== เพิ่ม / แก้ไขเมนู ===== */}
      {menuModal && (
        <MenuFormModal
          key={menuModal.mode === 'edit' ? `edit-${menuModal.product.ProductId}` : 'add'}
          mode={menuModal.mode}
          product={menuModal.product}
          onClose={closeMenuModal}
          onSubmit={saveMenu}
        />
      )}

      {/* ===== ยืนยันการลบ / ลบสำเร็จ ===== */}
      <ConfirmDeleteDialog state={confirmDelete} busy={deleting} onCancel={cancelDelete} onConfirm={confirmDeleteAction} />
      <SuccessOverlay state={successState} />

      {/* ===== Toast ===== */}
      <div className={`berry-toast ${toast.show ? 'show' : ''}`}>
        <div className="icon-wrapper"><Icon name="check" size={16} /></div>
        {toast.msg}
      </div>
    </div>
  );
}

/* ============================================================
   BERRY CSS STYLES
   ============================================================ */
const BERRY_STYLES = `
/* --- ซ่อน SCROLLBAR ทั้งหน้าเว็บ --- */
::-webkit-scrollbar {
  width: 0px;
  background: transparent;
  display: none;
}
* {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}
body, html {
  overflow: hidden; /* ป้องกันไม่ให้หน้าหลัก (body) เลื่อน */
  margin: 0;
  padding: 0;
}

.berry-root {
  --berry-bg: #F6F7FB;
  --berry-paper: #FFFFFF;
  
  /* Primary (Mapped from Executive Orange) */
  --berry-purple: #FF724C;
  --berry-purple-light: #FFEAE3;
  --berry-purple-dark: #E8552D;
  
  /* Secondary/Deep (Mapped from Executive Navy) */
  --berry-blue: #2A2C41;
  --berry-blue-light: #EDEEF4;
  --berry-blue-dark: #1D1F2F;
  
  /* Typography */
  --berry-text-dark: #2A2C41;
  --berry-text-muted: #8A8FA6;
  --berry-border: #E6E8F0;
  
  /* Status Colors */
  --berry-red: #E2452F;
  --berry-red-light: #FDEAE6;
  --berry-green: #17A673;
  --berry-green-light: #E3F6EE;
  --berry-amber: #E2A430;
  --berry-amber-light: #FFF4DE;

  /* Shadows/Radius */
  --radius-lg: 14px;
  --radius-md: 9px;
  --shadow-sm: 0 2px 10px rgba(42,44,65,0.05);
  
  font-family: 'Roboto', 'Sarabun', sans-serif;
  color: var(--berry-text-dark);
  
  /* FIXED LAYOUT TO PREVENT PAGE SCROLL */
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--berry-bg);
  z-index: 9999; 
}

.berry-root * { box-sizing: border-box; }

/* -------------------------------------------
   Top Header (Topbar)
   ------------------------------------------- */
.berry-topbar {
  height: 80px;
  background: var(--berry-paper);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid var(--berry-border);
  flex-shrink: 0;
  z-index: 110;
}
.berry-topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* Brand Logo Container (Inside Topbar) — แบบเดียวกับหน้าลูกค้า */
.berry-brand {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  white-space: nowrap;
  min-width: 0;
}
.brand-logo {
  padding: 0;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 27px;
  font-weight: 900;
  letter-spacing: -0.5px;
  line-height: 1;
  color: var(--berry-blue);
  cursor: pointer;
}
.brand-logo span { color: var(--berry-purple); }
.brand-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 13px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 700;
  border: 1px solid transparent;
  transition: background 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}
.brand-status.open { background: var(--berry-green-light); color: var(--berry-green); border-color: rgba(23,166,115,0.25); }
.brand-status.closed { background: var(--berry-red-light); color: var(--berry-red); border-color: rgba(226,69,47,0.25); }
.brand-status .dot { position: relative; width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
/* จุดสถานะกระพริบเบา ๆ ตอนเปิด */
.brand-status.open .dot::after {
  content: '';
  position: absolute; inset: 0;
  border-radius: 50%;
  background: currentColor;
  animation: brandPulse 1.8s ease-out infinite;
}
@keyframes brandPulse {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(2.6); opacity: 0; }
}
.brand-status .short { display: none; }
@media (prefers-reduced-motion: reduce) { .brand-status.open .dot::after { animation: none; } }

/* Topbar Components */
.berry-icon-btn {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}
.berry-icon-btn.purple-light { background: var(--berry-purple-light); color: var(--berry-purple); }
@media (hover: hover) { .berry-icon-btn.purple-light:hover { background: var(--berry-purple); color: white; } }
.berry-icon-btn.amber-light { background: var(--berry-amber-light); color: var(--berry-amber); }
@media (hover: hover) { .berry-icon-btn.amber-light:hover { background: var(--berry-amber); color: white; } }

.berry-topbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* Profile Dropdown */
.berry-profile-container {
  position: relative;
}
.berry-user-chip {
  background: var(--berry-blue-light);
  padding: 6px 12px 6px 6px;
  border: none;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: 250px;
  cursor: pointer;
  font-family: inherit;
  color: var(--berry-text-dark);
  transition: background 0.2s ease;
}
.berry-user-chip:hover {
  background: #E2E4EE;
}
.berry-avatar {
  width: 34px;
  height: 34px;
  min-width: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--berry-purple);
  color: #FFFFFF;
  font-weight: 700;
  font-size: 14px;
}
.berry-user-text { min-width: 0; text-align: left; }
.berry-user-name {
  color: var(--berry-text-dark);
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.berry-user-role { color: var(--berry-text-muted); font-size: 11.5px; }
@media (max-width: 600px) {
  .berry-user-chip { padding: 5px; }
  .berry-user-text, .berry-user-chip > svg { display: none; }
  .brand-logo { font-size: 22px; }
  .berry-brand { gap: 8px; }
  .brand-status { padding: 5px 9px; font-size: 11.5px; }
  .brand-status .full { display: none; }
  .brand-status .short { display: inline; }
}
.berry-profile-dropdown {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  background: var(--berry-paper);
  width: 280px;
  border-radius: var(--radius-lg);
  box-shadow: 0px 8px 24px rgba(0,0,0,0.1);
  border: 1px solid var(--berry-border);
  padding: 20px;
  z-index: 1000;
  animation: slideDown 0.2s ease-out forwards;
}
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
.dropdown-header h4 { margin: 0; font-size: 15px; font-weight: 600; color: var(--berry-text-dark); }
.dropdown-header p { margin: 4px 0 16px; font-size: 13px; color: var(--berry-text-muted); }
.dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--berry-text-dark);
  transition: background 0.2s;
  margin-bottom: 2px;
}
.dropdown-item:hover { background: var(--berry-purple-light); color: var(--berry-purple); }
.dropdown-badge { margin-left: auto; background: var(--berry-amber-light); color: var(--berry-amber); font-size: 11px; padding: 2px 6px; border-radius: 10px; font-weight: 600; }

/* -------------------------------------------
   Body (Sidebar + Content Container)
   ------------------------------------------- */
.berry-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* -------------------------------------------
   Sidebar 
   ------------------------------------------- */
.berry-sidebar {
  width: 260px;
  background: var(--berry-paper);
  border-right: 1px solid var(--berry-border);
  display: flex;
  flex-direction: column;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
  overflow-x: hidden;
  flex-shrink: 0;
}
.berry-nav { padding: 16px; flex: 1; overflow-y: auto; overflow-x: hidden; }
.berry-nav-group { margin-bottom: 24px; }
.berry-nav-label { font-size: 14px; font-weight: 500; color: var(--berry-text-dark); padding: 12px 16px; margin-bottom: 4px; white-space: nowrap; }
.berry-nav-item { display: flex; align-items: center; gap: 16px; padding: 10px 16px; margin-bottom: 8px; border-radius: var(--radius-md); cursor: pointer; color: var(--berry-text-dark); transition: all 0.2s ease; white-space: nowrap; }
.berry-nav-item:hover, .berry-nav-item.active { background: var(--berry-purple-light); color: var(--berry-purple); }
.berry-nav-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.berry-nav-text .title { font-size: 14px; font-weight: 500; }
.berry-nav-text .caption { font-size: 12px; color: var(--berry-text-muted); margin-top: 2px; }
.berry-nav-item:hover .caption, .berry-nav-item.active .caption { color: var(--berry-purple); opacity: 0.8; }
.berry-nav-badge { margin-left: auto; background: var(--berry-blue); color: white; font-size: 12px; padding: 2px 8px; border-radius: 12px; font-weight: bold; }

/* -------------------------------------------
   Sidebar States (Collapsed & Mobile)
   ------------------------------------------- */
@media (min-width: 769px) {
  .berry-sidebar.collapsed { width: 88px; }
  .berry-sidebar.collapsed .hide-on-collapse { display: none !important; }
  .berry-sidebar.collapsed .show-on-collapse { display: block !important; }
  .berry-sidebar.collapsed .berry-nav-item { justify-content: center; padding: 12px; }
  .berry-sidebar.collapsed .berry-nav-icon { margin: 0; }
}

@media (max-width: 768px) {
  .berry-sidebar {
    position: fixed;
    left: 0;
    top: 80px; /* ยึดไว้ใต้ Topbar */
    bottom: 0;
    width: 260px !important;
    transform: translateX(-100%);
    box-shadow: none;
  }
  .berry-sidebar.open {
    transform: translateX(0);
    box-shadow: 4px 0 24px rgba(0,0,0,0.1);
  }
  .berry-brand { width: auto; }
}

/* -------------------------------------------
   Main Content Area
   ------------------------------------------- */
.berry-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

/* Dashboard Grid */
.berry-dashboard-grid { display: flex; flex-direction: column; gap: 24px; }
.berry-stat-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
.berry-stat-col { display: flex; flex-direction: column; gap: 24px; }
.berry-chart-row { display: flex; flex-wrap: wrap; gap: 24px; }

/* Cards */
.berry-card { background: var(--berry-paper); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 24px; position: relative; overflow: hidden; }
.berry-card-header-simple h3 { margin: 0 0 20px; font-size: 18px; font-weight: 600; }
.berry-bg-purple { background: var(--berry-purple); color: white; }
.berry-bg-blue { background: var(--berry-blue); color: white; }
.berry-decor-circle-1 { position: absolute; width: 210px; height: 210px; background: var(--berry-purple-dark); border-radius: 50%; top: -85px; right: -95px; opacity: 0.5; }
.berry-decor-circle-2 { position: absolute; width: 210px; height: 210px; background: var(--berry-purple-dark); border-radius: 50%; top: -125px; right: -15px; opacity: 0.5; }
.berry-decor-wave { position: absolute; bottom: 0; right: 0; width: 100%; height: 100%; pointer-events: none; }
.berry-decor-wave svg { width: 100%; height: 100%; }
.berry-icon-box { width: 44px; height: 44px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; margin-bottom: 16px; position: relative; z-index: 2; }
.berry-icon-box.dark { background: var(--berry-purple-dark); }
.berry-icon-box.dark.blue { background: var(--berry-blue-dark); }
.berry-card-body { position: relative; z-index: 2; }
.berry-card-body h2 { margin: 0 0 4px; font-size: 30px; font-weight: 500; }
.berry-card-body p { margin: 0; font-size: 14px; opacity: 0.9; }

/* Small Card */
.berry-small-card { padding: 20px; display: flex; align-items: center; }
.berry-avatar-box { width: 48px; height: 48px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; }
.berry-avatar-box.tone-blue { background: var(--berry-blue-light); color: var(--berry-blue); }
.berry-avatar-box.tone-amber { background: var(--berry-amber-light); color: var(--berry-amber); }

/* Period Buttons */
.berry-period-btn { background: transparent; border: none; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; color: var(--berry-text-muted); cursor: pointer; font-family: inherit; transition: all 0.2s ease; }
.berry-period-btn:hover { color: var(--berry-text-dark); }
.berry-period-picker { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.berry-period-group { display: flex; gap: 4px; flex-wrap: wrap; background: var(--berry-purple-light); padding: 4px; border-radius: var(--radius-md); }
.berry-period-group .berry-period-btn { font-weight: 600; }
.berry-period-group .berry-period-btn.active { color: var(--berry-purple); }
.berry-date-wrap { display: flex; align-items: center; gap: 7px; padding: 7px 12px; border: 1px solid var(--berry-border); border-radius: var(--radius-md); background: var(--berry-paper); color: var(--berry-text-muted); }
.berry-date-wrap input { min-width: 0; border: none; outline: none; background: transparent; color: var(--berry-text-dark); font-size: 13px; font-family: inherit; }
.berry-date-range { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 8px 10px; border: 1px solid var(--berry-border); border-radius: var(--radius-md); background: var(--berry-paper); }
.berry-date-range label { display: flex; align-items: center; gap: 8px; color: var(--berry-text-dark); font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.berry-date-range input { width: 136px; box-sizing: border-box; padding: 8px 9px; border: 1px solid var(--berry-border); border-radius: 7px; background: #FFFFFF; color: var(--berry-text-dark); font-size: 12.5px; font-family: inherit; }
.berry-chart-tooltip { position: absolute; top: 8px; padding: 10px 13px; background: var(--berry-paper); border: 1px solid var(--berry-border); border-radius: var(--radius-lg); box-shadow: 0 12px 28px rgba(42,44,65,0.16); pointer-events: none; min-width: 190px; z-index: 5; }
.berry-period-btn.active { background: var(--berry-paper); color: var(--berry-text-dark); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

/* -------------------------------------------
   Product Grid (Card Layout)
   ------------------------------------------- */
.berry-product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 20px;
}
.berry-product-card {
  background: var(--berry-paper);
  border: 1px solid var(--berry-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.berry-product-card:hover {
  transform: translateY(-3px);
  border-color: var(--berry-purple-light);
  box-shadow: 0 10px 26px rgba(42,44,65,0.08);
}
.berry-product-media { position: relative; height: 170px; background: #F1F2F7; border-bottom: 1px solid var(--berry-border); }
.berry-product-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: filter 0.2s ease; }
.berry-product-noimg {
  height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  color: #B9BCCD; font-size: 12.5px;
  background: linear-gradient(135deg, #F6F7FB 0%, #ECEEF5 100%);
}
.berry-product-card.is-out .berry-product-img,
.berry-product-card.is-out .berry-product-noimg { filter: grayscale(1); opacity: 0.6; }
.berry-stock-pill {
  position: absolute; top: 12px; left: 12px;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 600;
  background: rgba(255,255,255,0.95);
  box-shadow: 0 2px 8px rgba(42,44,65,0.12);
}
.berry-stock-pill .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.berry-stock-pill.in { color: var(--berry-green); }
.berry-stock-pill.out { color: #FFFFFF; background: var(--berry-red); }
.berry-product-body {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 6px;
}
.berry-product-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--berry-text-dark);
  line-height: 1.4;
}
.berry-product-desc {
  margin: 0;
  min-height: 36px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--berry-text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.berry-product-desc.empty { color: #C2C5D3; font-style: italic; }
.berry-product-price {
  font-size: 20px;
  font-weight: 700;
  color: var(--berry-purple);
}
.berry-product-card.is-out .berry-product-price { color: var(--berry-text-muted); }
.berry-product-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--berry-border);
}

/* ปุ่มสลับสต็อก: สีทึบให้เด่นชัด */
.berry-stock-btn {
  flex: 1;
  min-width: 0;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 10px;
  border: none; border-radius: var(--radius-md);
  font-family: inherit; font-size: 13px; font-weight: 600;
  color: #FFFFFF; cursor: pointer; white-space: nowrap;
  transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
}
.berry-stock-btn.to-out { background: var(--berry-red); box-shadow: 0 4px 12px rgba(226,69,47,0.28); }
.berry-stock-btn.to-out:hover { background: #C93A26; box-shadow: 0 6px 16px rgba(226,69,47,0.36); }
.berry-stock-btn.to-in { background: var(--berry-green); box-shadow: 0 4px 12px rgba(23,166,115,0.28); }
.berry-stock-btn.to-in:hover { background: #12895F; box-shadow: 0 6px 16px rgba(23,166,115,0.36); }
.berry-stock-btn:active { transform: translateY(1px); }

/* ปุ่มแก้ไข/ลบ แบบเส้นขอบ ไม่แย่งความเด่นจากปุ่มสต็อก */
.berry-icon-action {
  width: 38px; height: 38px; min-width: 38px;
  display: grid; place-items: center;
  border: 1px solid var(--berry-border); border-radius: var(--radius-md);
  background: var(--berry-paper); color: var(--berry-text-muted);
  cursor: pointer; transition: all 0.2s ease;
}
.berry-icon-action:hover { border-color: var(--berry-purple); color: var(--berry-purple); background: var(--berry-purple-light); }
.berry-icon-action.danger:hover { border-color: var(--berry-red); color: var(--berry-red); background: var(--berry-red-light); }

/* หัวหน้า Menu & Stock */
.berry-menu-header { margin-bottom: 20px; }
.berry-menu-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
.berry-menu-heading h3 { margin: 0; font-size: 20px; font-weight: 600; color: var(--berry-text-dark); }
.berry-menu-heading p { margin: 4px 0 0; font-size: 13px; color: var(--berry-text-muted); }
.berry-root .berry-btn.btn-primary.berry-add-menu-btn { width: auto; flex: 0 0 auto; padding: 10px 18px; font-size: 14px; font-weight: 600; }
.berry-menu-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 20px; }
.berry-menu-stat { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--berry-border); border-radius: var(--radius-md); background: var(--berry-bg); }
.berry-menu-stat .icon { width: 36px; height: 36px; min-width: 36px; display: grid; place-items: center; border-radius: var(--radius-md); }
.berry-menu-stat .icon.tone-primary { background: var(--berry-purple-light); color: var(--berry-purple); }
.berry-menu-stat .icon.tone-success { background: var(--berry-green-light); color: var(--berry-green); }
.berry-menu-stat .icon.tone-danger { background: var(--berry-red-light); color: var(--berry-red); }
.berry-menu-stat strong { display: block; font-size: 18px; color: var(--berry-text-dark); line-height: 1.2; }
.berry-menu-stat span { font-size: 12px; color: var(--berry-text-muted); }
.berry-menu-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
.berry-menu-toolbar .berry-period-btn.active { color: var(--berry-purple); }
.berry-menu-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.berry-sort { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--berry-text-muted); }
.berry-sort select { padding: 8px 30px 8px 12px; border: 1px solid var(--berry-border); border-radius: var(--radius-md); background: var(--berry-paper) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23697586' stroke-width='2'%3E%3Cpath d='M6 9l6 6l6 -6'/%3E%3C/svg%3E") no-repeat right 10px center; -webkit-appearance: none; appearance: none; font-family: inherit; font-size: 13px; color: var(--berry-text-dark); cursor: pointer; outline: none; }
.berry-sort select:focus { border-color: var(--berry-purple); }
.berry-select-toggle { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border: 1px solid var(--berry-border); border-radius: var(--radius-md); background: var(--berry-paper); color: var(--berry-text-dark); font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; white-space: nowrap; }
.berry-select-toggle:hover:not(:disabled) { border-color: var(--berry-purple); color: var(--berry-purple); }
.berry-select-toggle.active { background: var(--berry-purple-light); border-color: var(--berry-purple); color: var(--berry-purple); }
.berry-select-toggle:disabled { opacity: 0.5; cursor: not-allowed; }
.berry-product-card.selectable { cursor: pointer; }
.berry-product-card.selectable:focus-visible { outline: 2px solid var(--berry-purple); outline-offset: 2px; }
.berry-product-card.selected { border-color: var(--berry-purple); box-shadow: 0 0 0 3px var(--berry-purple-light); }
.berry-select-check { position: absolute; top: 12px; right: 12px; z-index: 2; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 8px; border: 2px solid #FFFFFF; background: rgba(42,44,65,0.35); color: #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
.berry-product-card.selected .berry-select-check { background: var(--berry-purple); border-color: var(--berry-purple); }
.berry-product-price-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.berry-sold-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 999px; background: var(--berry-green-light); color: var(--berry-green); font-size: 11.5px; font-weight: 600; white-space: nowrap; }
.berry-sold-chip.zero { background: var(--berry-blue-light); color: var(--berry-text-muted); font-weight: 500; }
.berry-bulk-bar {
  position: sticky; bottom: 0; z-index: 40;
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
  margin-top: 20px; padding: 12px 16px;
  background: var(--berry-blue); color: #FFFFFF; border-radius: 16px;
  box-shadow: 0 14px 34px rgba(29,31,47,0.3);
  animation: berryPopIn 0.22s ease-out;
}
.berry-bulk-bar .info { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 13.5px; }
.berry-bulk-bar .info strong { font-size: 18px; }
.berry-bulk-bar .link { padding: 0; border: none; background: none; color: #FFB59F; font-family: inherit; font-size: 13px; text-decoration: underline; cursor: pointer; }
.berry-bulk-bar .actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.berry-bulk-bar .berry-stock-btn { flex: 0 0 auto; }
.berry-bulk-bar .berry-stock-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
.berry-bulk-bar .berry-icon-action { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.25); color: #FFFFFF; }
.berry-filter-count { display: inline-block; min-width: 18px; margin-left: 4px; padding: 0 6px; border-radius: 999px; background: rgba(42,44,65,0.06); font-size: 11px; line-height: 18px; text-align: center; }
.berry-search-box { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--berry-border); border-radius: var(--radius-md); background: var(--berry-paper); color: var(--berry-text-muted); flex: 0 1 260px; min-width: 180px; }
.berry-search-box:focus-within { border-color: var(--berry-purple); }
.berry-search-box input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-family: inherit; font-size: 13px; color: var(--berry-text-dark); }
.berry-menu-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 56px 20px; color: #B9BCCD; text-align: center; }
.berry-menu-empty .title { margin-top: 6px; font-size: 15px; font-weight: 600; color: var(--berry-text-dark); }
.berry-menu-empty .caption { font-size: 13px; color: var(--berry-text-muted); }
@media (max-width: 600px) {
  .berry-menu-summary { grid-template-columns: 1fr; }
  .berry-search-box { flex: 1 1 100%; }
}

.berry-btn-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

/* -------------------------------------------
   Drag & Drop Upload Zone
   ------------------------------------------- */
.berry-upload-zone {
  border: 2px dashed #b0bec5;
  border-radius: 12px;
  background-color: #f8fafc;
  padding: 24px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}
.berry-upload-zone.dragging {
  border-color: var(--berry-blue);
  background-color: var(--berry-blue-light);
}
.berry-upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.berry-btn-browse {
  background-color: #1565c0;
  color: white;
  border: none;
  padding: 8px 24px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(21, 101, 192, 0.2);
  transition: background-color 0.2s;
}
.berry-btn-browse:hover {
  background-color: #0d47a1;
}
.berry-upload-placeholder p {
  margin: 0;
  font-size: 12px;
  color: #546e7a;
}
.berry-upload-preview-container {
  position: relative;
  width: 100%;
  height: 140px;
  border-radius: 8px;
  overflow: hidden;
}
.berry-upload-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: transparent;
}
.berry-upload-change-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  font-weight: 500;
  opacity: 0;
  transition: opacity 0.2s;
}
.berry-upload-zone:hover .berry-upload-change-overlay {
  opacity: 1;
}

/* Lists & Tables */
.berry-list-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; }
.berry-list-item .title { font-size: 14px; font-weight: 500; color: var(--berry-text-dark); }
.berry-list-item .caption { font-size: 12px; color: var(--berry-text-muted); }
.berry-list-item .value { font-size: 14px; font-weight: 600; }
/* ===== หน้าจัดการเมนู (mm-*) ===== */
.mm-toolbar {
  position: sticky; top: -24px; z-index: 30;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin-bottom: 16px; padding: 12px;
  background: rgba(255,255,255,0.92); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--berry-border); border-radius: 16px;
  box-shadow: 0 6px 18px rgba(42,44,65,0.06);
}
.mm-tabs { display: flex; gap: 4px; padding: 4px; border-radius: 12px; background: var(--berry-bg); }
.mm-tab { display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border: none; border-radius: 9px; background: transparent; color: var(--berry-text-muted); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.15s ease; }
.mm-tab:hover { color: var(--berry-text-dark); }
.mm-tab .dot { width: 7px; height: 7px; border-radius: 50%; }
.mm-tab.tone-green .dot { background: var(--berry-green); }
.mm-tab.tone-red .dot { background: var(--berry-red); }
.mm-tab .count { min-width: 20px; padding: 0 6px; border-radius: 999px; background: rgba(42,44,65,0.07); font-size: 11.5px; line-height: 20px; text-align: center; }
.mm-tab.active { background: var(--berry-paper); color: var(--berry-text-dark); box-shadow: 0 1px 4px rgba(42,44,65,0.12); }
.mm-tab.active .count { background: var(--berry-purple); color: #FFFFFF; }
.mm-tab.active.tone-red .count { background: var(--berry-red); }
.mm-tab.active.tone-green .count { background: var(--berry-green); }
.mm-search { flex: 1 1 220px; min-width: 180px; display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 40px; border: 1px solid var(--berry-border); border-radius: 10px; background: var(--berry-paper); color: var(--berry-text-muted); transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.mm-search:focus-within { border-color: var(--berry-purple); box-shadow: 0 0 0 3px var(--berry-purple-light); }
.mm-search input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-family: inherit; font-size: 13.5px; color: var(--berry-text-dark); }
.mm-search button { width: 24px; height: 24px; display: grid; place-items: center; border: none; border-radius: 6px; background: var(--berry-bg); color: var(--berry-text-muted); cursor: pointer; }
.mm-tool-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mm-select { height: 40px; padding: 0 32px 0 12px; border: 1px solid var(--berry-border); border-radius: 10px; background: var(--berry-paper) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23697586' stroke-width='2'%3E%3Cpath d='M6 9l6 6l6 -6'/%3E%3C/svg%3E") no-repeat right 11px center; -webkit-appearance: none; appearance: none; font-family: inherit; font-size: 13px; color: var(--berry-text-dark); cursor: pointer; outline: none; }
.mm-select:focus { border-color: var(--berry-purple); }
.mm-view-toggle { display: flex; padding: 3px; border-radius: 10px; background: var(--berry-bg); }
.mm-view-toggle button { width: 34px; height: 34px; display: grid; place-items: center; border: none; border-radius: 8px; background: transparent; color: var(--berry-text-muted); cursor: pointer; }
.mm-view-toggle button.active { background: var(--berry-paper); color: var(--berry-purple); box-shadow: 0 1px 4px rgba(42,44,65,0.12); }
.mm-select-btn { height: 40px; display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; border: 1px solid var(--berry-border); border-radius: 10px; background: var(--berry-paper); color: var(--berry-text-dark); font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: all 0.2s ease; }
.mm-select-btn:hover:not(:disabled) { border-color: var(--berry-purple); color: var(--berry-purple); }
.mm-select-btn.active { background: var(--berry-purple); border-color: var(--berry-purple); color: #FFFFFF; }
.mm-select-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.mm-alert { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; padding: 10px 14px; border-radius: 12px; background: var(--berry-red-light); color: var(--berry-red); font-size: 13px; }
.mm-alert span { flex: 1; color: var(--berry-text-dark); }
.mm-alert strong { color: var(--berry-red); }
.mm-alert button { display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; border: none; border-radius: 8px; background: var(--berry-paper); color: var(--berry-red); font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }

/* การ์ด */
.mm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 16px; }
.mm-card { position: relative; display: flex; flex-direction: column; overflow: hidden; background: var(--berry-paper); border: 1px solid var(--berry-border); border-radius: 16px; transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
.mm-card:hover { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(42,44,65,0.09); border-color: transparent; }
.mm-card-media { position: relative; height: 140px; background: #F1F2F7; }
.mm-card-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: filter 0.2s ease, transform 0.35s ease; }
.mm-card:hover .mm-card-img { transform: scale(1.04); }
.mm-noimg { display: grid; place-items: center; color: #C2C5D3; background: linear-gradient(135deg, #F6F7FB 0%, #ECEEF5 100%); }
.mm-card.is-out .mm-card-img { filter: grayscale(1); opacity: 0.55; }
.mm-card.is-out { background: #FCFCFD; }
.mm-status { position: absolute; top: 10px; left: 10px; display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 700; background: rgba(255,255,255,0.95); box-shadow: 0 2px 8px rgba(42,44,65,0.12); }
.mm-status .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.mm-status.in { color: var(--berry-green); }
.mm-status.out { color: #FFFFFF; background: var(--berry-red); }
.mm-status.inline { position: static; box-shadow: none; }
.mm-status.inline.in { background: var(--berry-green-light); }
.mm-sold-badge { position: absolute; bottom: 10px; left: 10px; display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px; background: rgba(42,44,65,0.78); color: #FFFFFF; font-size: 11px; font-weight: 600; backdrop-filter: blur(4px); }
.mm-card-hover-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 6px; opacity: 0; transform: translateY(-4px); transition: opacity 0.2s ease, transform 0.2s ease; }
.mm-card:hover .mm-card-hover-actions, .mm-card:focus-within .mm-card-hover-actions { opacity: 1; transform: none; }
@media (hover: none) { .mm-card-hover-actions { opacity: 1; transform: none; } }
.mm-card-hover-actions .mm-icon-btn { width: 32px; height: 32px; min-width: 32px; background: rgba(255,255,255,0.95); border-color: transparent; box-shadow: 0 2px 8px rgba(42,44,65,0.15); }
.mm-card-body { flex: 1; display: flex; flex-direction: column; gap: 6px; padding: 12px 14px 14px; }
.mm-card-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.mm-card-title-row h4 { margin: 0; font-size: 14.5px; font-weight: 600; line-height: 1.4; color: var(--berry-text-dark); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.mm-price { font-size: 16px; font-weight: 700; color: var(--berry-purple); white-space: nowrap; }
.mm-card.is-out .mm-price, .mm-row.is-out .mm-price { color: var(--berry-text-muted); }
.mm-desc { margin: 0; min-height: 34px; font-size: 12px; line-height: 1.45; color: var(--berry-text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
.mm-desc.empty, .mm-row-text .desc.empty { color: #C2C5D3; font-style: italic; }
.mm-card-footer { margin-top: auto; padding-top: 8px; }

/* ปุ่มสต็อก (สีทึบให้เด่น) + ปุ่มไอคอน */
.mm-stock-btn { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 10px; border: none; border-radius: 10px; color: #FFFFFF; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease; }
.mm-stock-btn.to-out { background: var(--berry-red); box-shadow: 0 4px 12px rgba(226,69,47,0.25); }
.mm-stock-btn.to-out:hover:not(:disabled) { background: #C93A26; }
.mm-stock-btn.to-in { background: var(--berry-green); box-shadow: 0 4px 12px rgba(23,166,115,0.25); }
.mm-stock-btn.to-in:hover:not(:disabled) { background: #12895F; }
.mm-stock-btn:active { transform: translateY(1px); }
.mm-stock-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
.mm-stock-btn.compact { width: auto; padding: 7px 12px; font-size: 12.5px; box-shadow: none; }
.berry-bulk-bar .mm-stock-btn { width: auto; }
.mm-icon-btn { width: 36px; height: 36px; min-width: 36px; display: grid; place-items: center; border: 1px solid var(--berry-border); border-radius: 10px; background: var(--berry-paper); color: var(--berry-text-muted); cursor: pointer; transition: all 0.2s ease; }
.mm-icon-btn:hover { color: var(--berry-purple); border-color: var(--berry-purple); }
.mm-icon-btn.danger:hover { color: var(--berry-red); border-color: var(--berry-red); background: var(--berry-red-light); }
.mm-icon-btn.on-dark { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.25); color: #FFFFFF; }

/* โหมดเลือก */
.mm-card.selectable, .mm-row.selectable { cursor: pointer; }
.mm-card.selectable:focus-visible, .mm-row.selectable:focus-visible { outline: 2px solid var(--berry-purple); outline-offset: 2px; }
.mm-card.selected { border-color: var(--berry-purple); box-shadow: 0 0 0 3px var(--berry-purple-light); }
.mm-row.selected { background: #FFF6F2; }
.mm-check { position: absolute; top: 10px; right: 10px; z-index: 2; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 7px; border: 2px solid #FFFFFF; background: rgba(42,44,65,0.35); color: #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
.mm-check.inline { position: static; border-color: var(--berry-border); background: var(--berry-paper); box-shadow: none; }
.mm-card.selected .mm-check, .mm-row.selected .mm-check { background: var(--berry-purple); border-color: var(--berry-purple); }

/* รายการ */
.mm-list { background: var(--berry-paper); border: 1px solid var(--berry-border); border-radius: 16px; overflow: hidden; }
.mm-row { display: grid; grid-template-columns: minmax(0, 1fr) 90px 90px 120px 260px; align-items: center; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--berry-border); transition: background 0.15s ease; }
.mm-list .mm-row:first-child { border-top: none; }
.mm-row:has(.col-check) { grid-template-columns: 28px minmax(0, 1fr) 90px 90px 120px 260px; }
.mm-row:not(.mm-row-head):hover { background: #FCFCFE; }
.mm-row.is-out { background: #FFFBFA; }
.mm-row-head { padding: 10px 16px; background: var(--berry-bg); font-size: 12px; font-weight: 600; color: var(--berry-text-muted); }
.mm-row .col-menu { display: flex; align-items: center; gap: 12px; min-width: 0; }
.mm-row-img { width: 48px; height: 48px; min-width: 48px; border-radius: 10px; object-fit: cover; overflow: hidden; }
.mm-row.is-out .mm-row-img { filter: grayscale(1); opacity: 0.6; }
.mm-row-text { min-width: 0; }
.mm-row-text .name { font-size: 14px; font-weight: 600; color: var(--berry-text-dark); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-row-text .desc { margin-top: 2px; font-size: 12px; color: var(--berry-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-row .col-sold { font-size: 13px; font-weight: 600; color: var(--berry-green); }
.mm-row .col-sold.zero { color: var(--berry-text-muted); font-weight: 400; }
.mm-row-head .col-sold { font-size: 12px; color: var(--berry-text-muted); }
.mm-row .col-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.mm-row-head .col-actions { justify-content: flex-end; }

.mm-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 56px 20px; background: var(--berry-paper); border: 1px dashed var(--berry-border); border-radius: 16px; text-align: center; }
.mm-empty .icon { width: 64px; height: 64px; display: grid; place-items: center; border-radius: 50%; background: var(--berry-purple-light); color: var(--berry-purple); margin-bottom: 6px; }
.mm-empty .title { font-size: 16px; font-weight: 600; color: var(--berry-text-dark); }
.mm-empty .caption { font-size: 13px; color: var(--berry-text-muted); margin-bottom: 10px; }

@media (max-width: 1100px) {
  .mm-row, .mm-row:has(.col-check) { grid-template-columns: minmax(0, 1fr) auto; }
  .mm-row:has(.col-check) { grid-template-columns: 28px minmax(0, 1fr) auto; }
  .mm-row .col-price, .mm-row .col-sold, .mm-row .col-status, .mm-row-head { display: none; }
  .mm-row .col-actions { flex-wrap: wrap; }
}
@media (max-width: 700px) {
  .mm-toolbar { position: static; }
  .mm-tabs { width: 100%; }
  .mm-tab { flex: 1; justify-content: center; padding: 7px 6px; }
  .mm-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  .mm-stock-btn.compact { font-size: 0; gap: 0; padding: 8px; }
}

/* ===== หัวหน้าเพจ (ทุกหน้าใช้แบบเดียวกัน) ===== */
.op-page-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px 20px; margin-bottom: 20px; }
.berry-dashboard-grid > .op-page-head { margin-bottom: 0; }
.op-page-title { display: flex; align-items: center; gap: 14px; min-width: 0; }
.op-page-icon { width: 46px; height: 46px; min-width: 46px; display: grid; place-items: center; border-radius: 14px; background: var(--berry-paper); color: var(--berry-purple); box-shadow: var(--shadow-sm); }
.op-page-head h1 { margin: 0; font-size: 24px; font-weight: 700; color: var(--berry-text-dark); line-height: 1.25; }
.op-page-head p { margin: 3px 0 0; font-size: 13.5px; color: var(--berry-text-muted); }
.op-page-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.op-count-chip { padding: 7px 14px; border-radius: 999px; background: var(--berry-paper); box-shadow: var(--shadow-sm); font-size: 13px; font-weight: 600; color: var(--berry-text-dark); }
.op-count-chip.danger { color: var(--berry-red); }
.op-rating-chip { display: inline-flex; align-items: baseline; gap: 6px; padding: 8px 16px; border-radius: 999px; background: var(--berry-paper); box-shadow: var(--shadow-sm); font-size: 13px; color: var(--berry-text-muted); }
.op-rating-chip .star { color: var(--berry-amber); font-size: 16px; }
.op-rating-chip strong { font-size: 20px; color: var(--berry-text-dark); }
.berry-nav-divider { display: none; height: 1px; margin: 4px 18px 10px; background: var(--berry-border); }
.berry-nav-group { margin-bottom: 16px; }
.berry-nav-label { font-size: 11.5px !important; font-weight: 600 !important; letter-spacing: 0.4px; color: var(--berry-text-muted) !important; padding: 8px 16px 6px !important; }

/* ===== Skeleton ===== */
.op-skel { display: block; background: linear-gradient(90deg, #ECEEF4 0%, #F6F7FB 50%, #ECEEF4 100%); background-size: 200% 100%; animation: opShimmer 1.2s ease-in-out infinite; }
@keyframes opShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

/* ===== สวิตช์เปิด/ปิดร้านบน topbar ===== */
.store-switch { display: inline-flex; align-items: center; gap: 8px; padding: 5px 12px 5px 6px; border: 1px solid var(--berry-border); border-radius: 999px; background: var(--berry-paper); font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: border-color 0.2s ease, background 0.2s ease; white-space: nowrap; }
.store-switch .track { position: relative; width: 38px; height: 22px; border-radius: 999px; background: #CDD0DC; transition: background 0.25s ease; flex-shrink: 0; }
.store-switch .thumb { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.25); transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
.store-switch.on { border-color: rgba(23,166,115,0.35); background: var(--berry-green-light); color: var(--berry-green); }
.store-switch.on .track { background: var(--berry-green); }
.store-switch.on .thumb { transform: translateX(16px); }
.store-switch.off { color: var(--berry-text-muted); }
.store-switch:hover:not(:disabled) { border-color: var(--berry-purple); }
.store-switch:disabled { opacity: 0.55; cursor: not-allowed; }
.store-switch:focus-visible { outline: 2px solid var(--berry-purple); outline-offset: 2px; }
@media (max-width: 1100px) { .store-switch .label { display: none; } .store-switch { padding: 5px; } }

/* ===== ตอนนี้ในร้าน ===== */
.od-live { background: var(--berry-paper); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 16px 20px; }
.od-live-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px; color: var(--berry-text-dark); }
.od-live-head .muted { font-size: 12.5px; color: var(--berry-text-muted); }
.od-live-head .pulse { position: relative; width: 9px; height: 9px; border-radius: 50%; background: var(--berry-green); }
.od-live-head .pulse::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: var(--berry-green); animation: brandPulse 1.8s ease-out infinite; }
.od-live-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
.od-live-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--berry-border); border-radius: 12px; background: var(--berry-paper); font-family: inherit; text-align: left; cursor: pointer; color: var(--berry-text-muted); transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease; }
.od-live-item:hover { transform: translateY(-2px); border-color: var(--berry-purple); }
.od-live-item .icon { width: 38px; height: 38px; min-width: 38px; display: grid; place-items: center; border-radius: 10px; }
.od-live-item .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.od-live-item .text strong { font-size: 22px; line-height: 1.15; color: var(--berry-text-dark); }
.od-live-item .text span { font-size: 12.5px; }
.od-live-item.tone-amber .icon { background: var(--berry-amber-light); color: var(--berry-amber); }
.od-live-item.tone-orange .icon { background: var(--berry-purple-light); color: var(--berry-purple); }
.od-live-item.tone-green .icon { background: var(--berry-green-light); color: var(--berry-green); }
.od-live-item.tone-red .icon { background: var(--berry-red-light); color: var(--berry-red); }
.od-live-item.tone-amber.has { border-color: rgba(245,166,35,0.45); background: #FFFCF4; }
.od-live-item.tone-red.has { border-color: rgba(226,69,47,0.35); background: #FFF8F6; }
.od-live-item.tone-red.has .text strong { color: var(--berry-red); }

/* ===== แถบช่วงเวลา (sticky) ===== */
.od-period-bar {
  position: sticky; top: -24px; z-index: 30;
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px 16px;
  margin: 0 -8px; padding: 10px 16px;
  background: rgba(255,255,255,0.88); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--berry-border); border-radius: var(--radius-lg);
  box-shadow: 0 6px 18px rgba(42,44,65,0.07);
}
.od-period-text { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--berry-text-muted); }
.od-period-text svg { color: var(--berry-purple); }
.od-period-text strong { color: var(--berry-text-dark); }

/* ===== การ์ดสรุปยอดขาย ===== */
.od-summary { position: relative; overflow: hidden; display: flex; align-items: center; gap: 28px; flex-wrap: wrap; min-height: 150px; padding: 24px 28px; border-radius: var(--radius-lg); color: #FFFFFF; background: linear-gradient(120deg, #FF724C 0%, #E8552D 55%, #2A2C41 140%); box-shadow: 0 12px 28px rgba(232,85,45,0.22); }
.od-summary-block { position: relative; z-index: 1; display: flex; flex-direction: column; min-width: 170px; }
.od-summary-label { display: flex; align-items: center; gap: 6px; font-size: 13.5px; opacity: 0.9; }
.od-summary-value { margin-top: 4px; font-size: 34px; font-weight: 700; line-height: 1.15; }
.od-summary-note { display: flex; flex-wrap: wrap; gap: 2px 10px; margin: 2px 0 4px; font-size: 12px; font-weight: 600; opacity: 0.92; }
.od-summary-value small { margin-left: 6px; font-size: 14px; font-weight: 500; opacity: 0.85; }
.od-summary-divider { position: relative; z-index: 1; width: 1px; align-self: stretch; background: rgba(255,255,255,0.25); }
.od-summary-spark { position: relative; z-index: 1; flex: 1 1 240px; min-width: 200px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.od-summary-spark span { font-size: 11.5px; opacity: 0.8; }
.od-spark { width: 100%; height: 70px; display: block; }
.od-spark-empty { width: 100%; height: 70px; display: grid; place-items: center; border: 1px dashed rgba(255,255,255,0.35); border-radius: 10px; font-size: 12px; opacity: 0.85; }
.od-summary-skel { position: relative; z-index: 1; display: grid; gap: 10px; }
.od-summary .od-delta, .od-summary .od-delta-empty { margin-top: 10px; }

@media (max-width: 1100px) { .od-live-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) {
  .od-summary { gap: 18px; padding: 20px; }
  .od-summary-divider { display: none; }
  .od-summary-value { font-size: 28px; }
  .od-period-bar { top: -16px; margin: 0; }
  .op-page-head h1 { font-size: 20px; }
}

/* ===== Dashboard (od-*) ===== */
.od-banner { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; padding: 20px 24px; background: linear-gradient(120deg, #FFFFFF 0%, #FFFFFF 55%, var(--berry-purple-light) 100%); }
.od-banner h2 { margin: 0; font-size: 22px; font-weight: 700; color: var(--berry-text-dark); }
.od-banner p { margin: 4px 0 0; font-size: 13px; color: var(--berry-text-muted); }
.od-banner-badges { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.od-outline-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--berry-border) !important; background: var(--berry-paper) !important; color: var(--berry-text-dark) !important; padding: 6px 12px !important; font-family: inherit; }
.od-outline-btn:hover { border-color: var(--berry-purple) !important; color: var(--berry-purple) !important; }
.od-badge-btn { cursor: pointer; border: none; font-family: inherit; padding: 6px 12px; }
.od-period { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; padding: 18px 24px; }
.od-period h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--berry-text-dark); }
.od-period p { margin: 3px 0 0; font-size: 13px; color: var(--berry-text-muted); }

.od-hero-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.od-hero { position: relative; overflow: hidden; min-height: 172px; padding: 24px; border-radius: var(--radius-lg); color: #FFFFFF; display: flex; flex-direction: column; justify-content: center; box-shadow: 0 10px 24px rgba(42,44,65,0.10); }
.od-hero.orange { background: linear-gradient(135deg, #FF724C 0%, #E8552D 100%); }
.od-hero.navy { background: linear-gradient(135deg, #2A2C41 0%, #1D1F2F 100%); }
.od-hero-circle { position: absolute; border-radius: 50%; pointer-events: none; }
.od-hero-circle.one { width: 240px; height: 240px; top: -110px; right: -60px; background: rgba(255,255,255,0.08); }
.od-hero-circle.two { width: 190px; height: 190px; top: -40px; right: -110px; background: rgba(255,255,255,0.07); }
.od-hero-main { position: relative; z-index: 1; display: flex; align-items: center; gap: 16px; }
.od-hero-icon { width: 54px; height: 54px; min-width: 54px; display: grid; place-items: center; border-radius: 12px; background: rgba(0,0,0,0.18); color: #FFFFFF; }
.od-hero-value { font-size: 32px; font-weight: 700; line-height: 1.15; }
.od-hero-value small { margin-left: 6px; font-size: 14px; font-weight: 500; opacity: 0.85; }
.od-hero-label { margin-top: 3px; font-size: 14px; opacity: 0.9; }
.od-hero .od-delta, .od-hero .od-delta-empty { position: relative; z-index: 1; }

.od-kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
.od-kpi { background: var(--berry-paper); border-radius: var(--radius-lg); padding: 18px 20px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; justify-content: center; min-height: 128px; transition: transform 0.2s ease, box-shadow 0.2s ease; }
.od-kpi:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(42,44,65,0.08); }
.od-kpi-main { display: flex; align-items: center; gap: 14px; }
.od-kpi-icon { width: 46px; height: 46px; min-width: 46px; display: grid; place-items: center; border-radius: var(--radius-md); }
.od-kpi-icon.tone-blue { background: var(--berry-blue-light); color: var(--berry-blue); }
.od-kpi-icon.tone-amber { background: var(--berry-amber-light); color: var(--berry-amber); }
.od-kpi-icon.tone-red { background: var(--berry-red-light); color: var(--berry-red); }
.od-kpi-icon.tone-green { background: var(--berry-green-light); color: var(--berry-green); }
.od-kpi-value { font-size: 23px; font-weight: 700; line-height: 1.2; color: var(--berry-text-dark); white-space: nowrap; }
.od-kpi-value small { margin-left: 5px; font-size: 13px; font-weight: 500; color: var(--berry-text-muted); }
.od-kpi-label { margin-top: 2px; font-size: 12.5px; color: var(--berry-text-muted); }

.od-delta { margin-top: 12px; align-self: flex-start; display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.od-delta span { font-weight: 500; }
.od-delta.up { background: var(--berry-green-light); color: var(--berry-green); }
.od-delta.down { background: var(--berry-red-light); color: var(--berry-red); }
.od-delta.flat { background: #F1F3F7; color: var(--berry-text-muted); }
.od-delta.on-solid.up { background: rgba(227,246,238,0.96); }
.od-delta.on-solid.down { background: rgba(253,234,230,0.96); }
.od-delta.on-solid.flat { background: rgba(255,255,255,0.18); color: #FFFFFF; }
.od-delta-empty { margin-top: 12px; font-size: 12px; color: var(--berry-text-muted); }
.od-delta-empty.on-solid { color: rgba(255,255,255,0.8); margin-top: 14px; }

.od-row { display: grid; gap: 20px; align-items: stretch; }
.od-row.two-one { grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr); }
.od-row.one-one { grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); }
.od-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 6px; }
.od-card-head h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--berry-text-dark); }
.od-card-head p { margin: 3px 0 0; font-size: 12.5px; color: var(--berry-text-muted); }
.od-head-total { font-size: 22px; font-weight: 700; color: var(--berry-purple); white-space: nowrap; }
.od-head-total small { font-size: 13px; font-weight: 500; color: var(--berry-text-muted); }
.od-chip { padding: 4px 10px; border-radius: 999px; background: var(--berry-purple-light); color: var(--berry-purple); font-size: 12px; font-weight: 600; white-space: nowrap; }

.od-store-status { display: flex; align-items: flex-start; gap: 12px; margin-top: 12px; padding: 14px; border-radius: var(--radius-md); }
.od-store-status.open { background: var(--berry-green-light); }
.od-store-status.closed { background: var(--berry-red-light); }
.od-store-status .dot { width: 10px; height: 10px; min-width: 10px; margin-top: 6px; border-radius: 50%; }
.od-store-status.open .dot { background: var(--berry-green); box-shadow: 0 0 0 4px rgba(23,166,115,0.18); }
.od-store-status.closed .dot { background: var(--berry-red); box-shadow: 0 0 0 4px rgba(226,69,47,0.15); }
.od-store-status .title { font-size: 15px; font-weight: 700; }
.od-store-status.open .title { color: var(--berry-green); }
.od-store-status.closed .title { color: var(--berry-red); }
.od-store-status .caption { margin-top: 2px; font-size: 12.5px; color: var(--berry-text-dark); opacity: 0.75; }

.od-empty { min-height: 240px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #C2C5D3; font-size: 13px; }
.od-empty span { color: var(--berry-text-muted); }

.od-donut-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 22px; margin-top: 14px; }
.od-donut-box { position: relative; flex: 0 0 220px; width: 220px; height: 220px; margin: 0 auto; }
.od-donut { position: absolute; inset: 0; border-radius: 50%; cursor: pointer; }
.od-donut-hole { position: absolute; inset: 17%; border-radius: 50%; background: var(--berry-paper); pointer-events: none; }
.od-donut-center { position: absolute; inset: 22%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; pointer-events: none; }
.od-donut-center .name { font-size: 12px; font-weight: 700; color: var(--berry-text-dark); line-height: 1.3; max-width: 100%; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.od-donut-center .name.muted { font-weight: 500; color: var(--berry-text-muted); }
.od-donut-center strong { margin-top: 3px; font-size: 22px; color: var(--berry-text-dark); }
.od-donut-center span { font-size: 11.5px; color: var(--berry-text-muted); }
.od-legend { flex: 1 1 220px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.od-legend-row { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto 52px; gap: 10px; align-items: center; padding: 6px 8px; border-radius: 8px; cursor: pointer; transition: background 0.15s ease; }
.od-legend-row.active, .od-legend-row:hover { background: var(--berry-purple-light); }
.od-legend-row .swatch { width: 11px; height: 11px; border-radius: 3px; }
.od-legend-row .name { font-size: 13px; color: var(--berry-text-dark); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.od-legend-row .amount { font-size: 12px; color: var(--berry-text-muted); white-space: nowrap; }
.od-legend-row .pct { font-size: 13px; font-weight: 700; color: var(--berry-text-dark); text-align: right; }

.od-top-list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
.od-top-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--berry-border); border-radius: 12px; transition: border-color 0.2s ease, background 0.2s ease; }
.od-top-row:hover { border-color: var(--berry-purple-light); background: #FFFBF9; }
.od-rank { width: 30px; height: 30px; min-width: 30px; display: grid; place-items: center; border-radius: 50%; font-size: 13px; font-weight: 700; background: var(--berry-blue-light); color: var(--berry-text-muted); }
.od-rank.rank-1 { background: linear-gradient(135deg, #FDBF50, #E2A430); color: #FFFFFF; box-shadow: 0 4px 10px rgba(226,164,48,0.35); }
.od-rank.rank-2 { background: linear-gradient(135deg, #C9CCD8, #9EA2B5); color: #FFFFFF; }
.od-rank.rank-3 { background: linear-gradient(135deg, #F0A27A, #C97A4E); color: #FFFFFF; }
.od-top-thumb { width: 48px; height: 48px; min-width: 48px; display: grid; place-items: center; overflow: hidden; border-radius: 10px; background: #F1F2F7; color: #B9BCCD; }
.od-top-thumb img { width: 100%; height: 100%; object-fit: cover; }
.od-top-info { flex: 1; min-width: 0; }
.od-top-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.od-top-name { font-size: 14px; font-weight: 600; color: var(--berry-text-dark); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.od-top-qty { font-size: 12px; color: var(--berry-text-muted); white-space: nowrap; }
.od-top-qty strong { font-size: 16px; color: var(--berry-purple); margin-right: 2px; }
.od-top-bar { height: 6px; margin-top: 6px; border-radius: 999px; background: var(--berry-blue-light); overflow: hidden; }
.od-top-bar > div { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #FF9E84, #FF724C); }
.od-top-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; font-size: 11.5px; color: var(--berry-text-muted); }
.od-top-meta b { color: var(--berry-text-dark); font-weight: 600; }
.od-top-meta .out { color: var(--berry-red); font-weight: 600; }

@media (max-width: 1280px) {
  .od-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 1100px) {
  .od-row.two-one, .od-row.one-one { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 700px) {
  .od-hero-grid, .od-kpi-grid { grid-template-columns: minmax(0, 1fr); }
  .od-hero-value { font-size: 26px; }
}

/* การ์ดสัญญาเช่าบน Dashboard */
.berry-contract {
  --contract-color: var(--berry-green);
  --contract-soft: var(--berry-green-light);
  margin-top: 20px;
  padding: 16px;
  border: 1px solid var(--berry-border);
  border-radius: var(--radius-md);
  background: var(--berry-bg);
  scroll-margin-top: 100px;
}
.berry-contract.tone-warning { --contract-color: var(--berry-amber); --contract-soft: var(--berry-amber-light); }
.berry-contract.tone-danger { --contract-color: var(--berry-red); --contract-soft: var(--berry-red-light); }
.berry-contract.tone-neutral { --contract-color: var(--berry-text-muted); --contract-soft: var(--berry-blue-light); }
.berry-contract-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.berry-contract-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.berry-contract-title .title { font-size: 14px; font-weight: 600; color: var(--berry-text-dark); }
.berry-contract-title .caption { font-size: 12px; color: var(--berry-text-muted); }
.berry-contract-icon { width: 34px; height: 34px; min-width: 34px; display: grid; place-items: center; border-radius: var(--radius-md); background: var(--contract-soft); color: var(--contract-color); }
.berry-contract-days { margin-top: 14px; font-size: 13px; color: var(--berry-text-muted); }
.berry-contract-days strong { font-size: 24px; font-weight: 700; color: var(--contract-color); margin: 0 2px; }
.berry-contract-bar { margin-top: 10px; height: 6px; border-radius: 999px; background: var(--berry-border); overflow: hidden; }
.berry-contract-bar > div { height: 100%; border-radius: 999px; background: var(--contract-color); transition: width 0.4s ease; }
.berry-contract-dates { display: flex; justify-content: space-between; gap: 12px; margin-top: 10px; }
.berry-contract-dates .caption { font-size: 11.5px; color: var(--berry-text-muted); }
.berry-contract-dates .date { font-size: 13px; font-weight: 600; color: var(--berry-text-dark); margin-top: 2px; }
.berry-contract-note { margin-top: 12px; padding: 9px 11px; border-radius: var(--radius-md); background: var(--contract-soft); color: var(--contract-color); font-size: 12px; line-height: 1.5; }
.berry-contract-empty { margin-top: 12px; font-size: 13px; color: var(--berry-text-muted); }

.berry-divider { border: none; border-top: 1px solid var(--berry-border); margin: 4px 0; }

.berry-table-container { overflow-x: auto; }
.berry-table { width: 100%; border-collapse: collapse; }
.berry-table th { text-align: left; padding: 16px; font-size: 14px; font-weight: 600; color: var(--berry-text-dark); border-bottom: 1px solid var(--berry-border); }
.berry-table td { padding: 16px; border-bottom: 1px solid var(--berry-border); font-size: 14px; vertical-align: middle; }
.berry-table tr:last-child td { border-bottom: none; }
.berry-table .mono { font-family: 'Roboto', monospace; }
.berry-table .bold { font-weight: 600; }
.berry-table .muted { color: var(--berry-text-muted); font-size: 13px; }
.empty-state { text-align: center; color: var(--berry-text-muted); padding: 32px !important; font-size: 14px; }

/* Buttons */
.berry-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 20px; border-radius: var(--radius-md); border: none; font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.2s ease; }
.btn-primary { background: var(--berry-purple); color: white; }
.btn-primary:hover { background: var(--berry-purple-dark); }
/* App.jsx มี .btn-primary (หน้า login) แบบ global width:100% + gradient + เงา รั่วมาถึงหน้านี้ -> รีเซ็ตเฉพาะในหน้า owner */
.berry-root .berry-btn.btn-primary {
  width: auto;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  background: var(--berry-purple);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(255,114,76,0.25);
  overflow: visible;
  transform: none;
  display: inline-flex;
  gap: 8px;
}
.berry-root .berry-btn.btn-primary:hover { background: var(--berry-purple-dark); transform: none; box-shadow: 0 6px 16px rgba(255,114,76,0.32); }
.btn-error { background: var(--berry-red); color: white; }
.btn-error:hover { opacity: 0.9; }

.berry-btn-small { padding: 6px 12px; border-radius: 6px; border: none; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; }
.btn-primary-light { background: var(--berry-purple-light); color: var(--berry-purple); }
.btn-primary-light:hover { background: var(--berry-purple); color: white; }
.btn-error-light { background: var(--berry-red-light); color: var(--berry-red); }
.btn-error-light:hover { background: var(--berry-red); color: white; }

/* Badges */
.berry-badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 16px; font-size: 12px; font-weight: 600; }
.berry-badge.tone-success { background: var(--berry-green-light); color: var(--berry-green); }
.berry-badge.tone-danger { background: var(--berry-red-light); color: var(--berry-red); }
.berry-badge.tone-warning { background: var(--berry-amber-light); color: var(--berry-amber); }
.berry-badge.tone-primary { background: var(--berry-blue-light); color: var(--berry-blue); }
.berry-badge.tone-neutral { background: var(--berry-blue-light); color: var(--berry-text-muted); }

/* Modal */
.berry-modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.berry-modal {
  background: var(--berry-paper);
  padding: 24px;
  border-radius: var(--radius-lg);
  width: 440px;
  max-width: 90%;
  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
}
.berry-modal h3 {
  margin: 0 0 20px;
  font-size: 18px;
  color: var(--berry-text-dark);
}
.berry-form-group {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.berry-form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--berry-text-dark);
}
.berry-form-group input[type="text"],
.berry-form-group input[type="password"],
.berry-form-group input[type="number"],
.berry-select {
  padding: 10px 14px;
  border: 1px solid var(--berry-border);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 14px;
  outline: none;
}
.berry-form-group input:focus,
.berry-select:focus {
  border-color: var(--berry-purple);
}
.berry-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

/* ฟอร์มเพิ่ม/แก้ไขเมนู */
.mf-overlay { padding: 16px; box-sizing: border-box; background: rgba(29,31,47,0.45); backdrop-filter: blur(2px); animation: berryFadeIn 0.18s ease-out; }
.mf-modal {
  width: 100%; max-width: 480px; max-height: calc(100vh - 32px);
  display: flex; flex-direction: column;
  background: var(--berry-paper); border-radius: 18px;
  box-shadow: 0 24px 60px rgba(29,31,47,0.25);
  overflow: hidden;
  animation: berryPopIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.mf-modal form { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.mf-head { display: flex; align-items: flex-start; gap: 12px; padding: 20px 22px 16px; border-bottom: 1px solid var(--berry-border); }
.mf-head-icon { width: 42px; height: 42px; min-width: 42px; display: grid; place-items: center; border-radius: 12px; background: var(--berry-purple-light); color: var(--berry-purple); }
.mf-head h3 { margin: 0; font-size: 18px; font-weight: 700; color: var(--berry-text-dark); }
.mf-head p { margin: 3px 0 0; font-size: 13px; color: var(--berry-text-muted); }
.mf-close { width: 36px; height: 36px; min-width: 36px; display: grid; place-items: center; border: none; border-radius: var(--radius-md); background: transparent; color: var(--berry-text-muted); cursor: pointer; transition: all 0.2s ease; }
.mf-close:hover:not(:disabled) { background: var(--berry-red-light); color: var(--berry-red); }
.mf-body { padding: 18px 22px 6px; overflow-y: auto; }
.mf-field { margin-bottom: 16px; }
.mf-field label { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; font-size: 13px; font-weight: 600; color: var(--berry-text-dark); }
.mf-field .req { color: var(--berry-red); }
.mf-field .optional { padding: 1px 8px; border-radius: 999px; background: var(--berry-blue-light); color: var(--berry-text-muted); font-size: 11px; font-weight: 500; }
.mf-field > input[type="text"] {
  width: 100%; box-sizing: border-box; padding: 11px 14px;
  border: 1px solid var(--berry-border); border-radius: var(--radius-md);
  font-family: inherit; font-size: 14px; color: var(--berry-text-dark); outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.mf-field > input[type="text"]:focus { border-color: var(--berry-purple); box-shadow: 0 0 0 3px var(--berry-purple-light); }
.mf-field > input.invalid, .mf-price.invalid { border-color: var(--berry-red) !important; }
.mf-price {
  display: flex; align-items: center; gap: 8px; padding: 0 14px;
  border: 1px solid var(--berry-border); border-radius: var(--radius-md);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.mf-price:focus-within { border-color: var(--berry-purple); box-shadow: 0 0 0 3px var(--berry-purple-light); }
.mf-price span { font-weight: 700; color: var(--berry-purple); }
.mf-price .unit { font-weight: 500; font-size: 13px; color: var(--berry-text-muted); }
.mf-price input { flex: 1; min-width: 0; padding: 11px 0; border: none; outline: none; background: transparent; font-family: inherit; font-size: 15px; font-weight: 600; color: var(--berry-text-dark); }
.mf-field textarea {
  width: 100%; box-sizing: border-box; padding: 11px 14px; resize: vertical; min-height: 76px;
  border: 1px solid var(--berry-border); border-radius: var(--radius-md);
  font-family: inherit; font-size: 14px; line-height: 1.5; color: var(--berry-text-dark); outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.mf-field textarea:focus { border-color: var(--berry-purple); box-shadow: 0 0 0 3px var(--berry-purple-light); }
.mf-field textarea.invalid { border-color: var(--berry-red); }
.mf-counter { margin-left: auto; font-size: 11.5px; font-weight: 500; color: var(--berry-text-muted); }
.mf-counter.over { color: var(--berry-red); }
.mf-hint { margin-top: 5px; font-size: 12px; color: var(--berry-text-muted); }
.mf-field-error { margin-top: 6px; font-size: 12.5px; color: var(--berry-red); }
.mf-form-error { margin-bottom: 12px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--berry-red-light); color: var(--berry-red); font-size: 13px; }
.mf-dropzone {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 24px 16px; border: 2px dashed var(--berry-border); border-radius: 14px;
  background: var(--berry-bg); text-align: center; cursor: pointer; outline: none;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.mf-dropzone:hover, .mf-dropzone:focus-visible, .mf-dropzone.dragging { border-color: var(--berry-purple); background: var(--berry-purple-light); }
.mf-dropzone.has-error { border-color: var(--berry-red); }
.mf-dropzone-icon { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 50%; background: var(--berry-paper); color: var(--berry-purple); box-shadow: 0 4px 12px rgba(42,44,65,0.08); }
.mf-dropzone-title { margin-top: 4px; font-size: 13.5px; color: var(--berry-text-dark); }
.mf-dropzone-title span { color: var(--berry-purple); font-weight: 600; }
.mf-dropzone-hint { font-size: 12px; color: var(--berry-text-muted); }
.mf-image-preview { display: flex; gap: 14px; align-items: center; padding: 10px; border: 1px solid var(--berry-border); border-radius: 14px; background: var(--berry-bg); }
.mf-image-preview img { width: 96px; height: 96px; min-width: 96px; object-fit: cover; border-radius: 10px; background: #ECEEF5; }
.mf-image-meta { min-width: 0; }
.mf-image-name { font-size: 13.5px; font-weight: 600; color: var(--berry-text-dark); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mf-image-sub { margin-top: 2px; font-size: 12px; color: var(--berry-text-muted); }
.mf-image-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.mf-link-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 10px; border: 1px solid var(--berry-border); border-radius: 8px; background: var(--berry-paper); color: var(--berry-text-dark); font-family: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; }
.mf-link-btn:hover:not(:disabled) { border-color: var(--berry-purple); color: var(--berry-purple); }
.mf-link-btn.danger:hover:not(:disabled) { border-color: var(--berry-red); color: var(--berry-red); }
.mf-footer { display: grid; grid-template-columns: 1fr 1.4fr; gap: 10px; padding: 14px 22px 20px; border-top: 1px solid var(--berry-border); }
.mf-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 14px; border-radius: var(--radius-md); font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
.mf-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.mf-btn.ghost { background: var(--berry-paper); color: var(--berry-text-dark); border: 1px solid var(--berry-border); }
.mf-btn.ghost:hover:not(:disabled) { border-color: var(--berry-text-muted); }
.mf-btn.primary { background: var(--berry-purple); color: #FFFFFF; border: 1px solid var(--berry-purple); box-shadow: 0 6px 16px rgba(255,114,76,0.3); }
.mf-btn.primary:hover:not(:disabled) { background: var(--berry-purple-dark); }
/* ซ่อนลูกศรเลื่อนตัวเลขในช่องราคา */
.mf-price input::-webkit-outer-spin-button, .mf-price input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.mf-price input[type=number] { -moz-appearance: textfield; }

/* ===== หน้าจัดการพนักงาน (sf-*) ===== */
.crop-round-mask { position: absolute; inset: 0; border-radius: 50%; box-shadow: 0 0 0 9999px rgba(15,16,26,0.55); pointer-events: none; }

.sf-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; }
.sf-stat { display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--berry-paper); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.sf-stat .icon { width: 44px; height: 44px; min-width: 44px; display: grid; place-items: center; border-radius: 12px; }
.sf-stat.tone-orange .icon { background: var(--berry-purple-light); color: var(--berry-purple); }
.sf-stat.tone-blue .icon { background: var(--berry-blue-light); color: var(--berry-blue); }
.sf-stat.tone-amber .icon { background: var(--berry-amber-light); color: var(--berry-amber); }
.sf-stat.tone-green .icon { background: var(--berry-green-light); color: var(--berry-green); }
.sf-stat .value { font-size: 22px; font-weight: 700; line-height: 1.15; color: var(--berry-text-dark); }
.sf-stat .label { margin-top: 2px; font-size: 12.5px; color: var(--berry-text-muted); }
.sf-stat .sub { margin-top: 3px; font-size: 11.5px; font-weight: 600; color: #B7791F; }

.sf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.sf-card { display: flex; flex-direction: column; gap: 14px; padding: 18px; background: var(--berry-paper); border: 1px solid var(--berry-border); border-radius: 16px; box-shadow: var(--shadow-sm); transition: box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease; animation: berryFadeIn 0.25s ease-out; }
.sf-card:hover { box-shadow: 0 10px 28px rgba(42,44,65,0.09); transform: translateY(-2px); }
.sf-card.locked { border-color: rgba(226,164,48,0.6); }
.sf-card.inactive { background: #FAFAFC; }
.sf-card.inactive .sf-avatar { filter: grayscale(1); opacity: 0.65; }
.sf-card.inactive .sf-card-id .name { color: var(--berry-text-muted); }
.sf-card-top { display: flex; gap: 14px; align-items: center; min-width: 0; }
.sf-card-id { flex: 1; min-width: 0; }
.sf-card-id .name { font-size: 16px; font-weight: 700; color: var(--berry-text-dark); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sf-card-id .user { margin-top: 2px; font-size: 12.5px; color: var(--berry-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sf-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.sf-badges .berry-badge { gap: 5px; }
.sf-status { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 16px; font-size: 12px; font-weight: 600; }
.sf-status .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.sf-status.tone-success { background: var(--berry-green-light); color: var(--berry-green); }
.sf-status.tone-success .dot { box-shadow: 0 0 0 3px rgba(23,166,115,0.18); }
.sf-status.tone-warning { background: var(--berry-amber-light); color: #B7791F; }
.sf-status.tone-neutral { background: var(--berry-blue-light); color: var(--berry-text-muted); }

.sf-avatar { position: relative; display: inline-grid; place-items: center; flex-shrink: 0; border-radius: 50%; overflow: hidden; color: #FFFFFF; font-weight: 700; letter-spacing: 0.5px; box-shadow: 0 0 0 3px var(--berry-paper), 0 0 0 4px var(--berry-border); }
.sf-avatar img { width: 100%; height: 100%; object-fit: cover; }

.sf-info { display: grid; gap: 8px; margin: 0; padding: 12px; border-radius: 12px; background: var(--berry-bg); }
.sf-info > div { display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 13px; }
.sf-info dt { width: 28px; height: 28px; min-width: 28px; display: grid; place-items: center; border-radius: 8px; background: var(--berry-paper); color: var(--berry-text-muted); }
.sf-info dd { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--berry-text-dark); }
.sf-info a { color: var(--berry-text-dark); font-weight: 500; text-decoration: none; }
.sf-info a:hover { color: var(--berry-purple); }
.sf-info .missing { color: var(--berry-text-muted); font-style: italic; }
.sf-info .by { color: var(--berry-text-muted); }

.sf-activity { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.sf-activity > div { min-width: 0; padding: 10px 12px; border: 1px dashed var(--berry-border); border-radius: 12px; }
.sf-activity strong { display: block; font-size: 15px; font-weight: 700; color: var(--berry-text-dark); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sf-activity span { font-size: 11.5px; color: var(--berry-text-muted); }
.sf-lock-note { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 0; padding: 10px 12px; border-radius: 12px; background: var(--berry-amber-light); color: #8A5A00; font-size: 12.5px; line-height: 1.45; }
.sf-lock-note svg { flex-shrink: 0; margin-top: 1px; }
.mf-body .sf-lock-note { margin-bottom: 14px; }

.sf-card-actions { display: flex; gap: 8px; margin-top: auto; }
.sf-act { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 10px; border: 1px solid var(--berry-border); border-radius: 10px; background: var(--berry-paper); color: var(--berry-text-dark); font-family: inherit; font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: all 0.2s ease; }
.sf-act:hover:not(:disabled) { border-color: var(--berry-purple); color: var(--berry-purple); background: #FFF8F5; }
.sf-act.icon-only { flex: 0 0 40px; padding: 9px 0; }
.sf-act.danger:hover:not(:disabled) { border-color: var(--berry-red); color: var(--berry-red); background: var(--berry-red-light); }
.sf-act.success { border-color: rgba(23,166,115,0.35); color: var(--berry-green); background: var(--berry-green-light); }
.sf-act.success:hover:not(:disabled) { border-color: var(--berry-green); color: #FFFFFF; background: var(--berry-green); }
.sf-act:disabled { opacity: 0.6; cursor: not-allowed; }

.sf-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px 20px; text-align: center; background: var(--berry-paper); border: 1px dashed var(--berry-border); border-radius: 16px; color: var(--berry-text-muted); }
.sf-empty .icon { width: 64px; height: 64px; display: grid; place-items: center; border-radius: 50%; background: var(--berry-purple-light); color: var(--berry-purple); }
.sf-empty h3 { margin: 4px 0 0; font-size: 16px; color: var(--berry-text-dark); }
.sf-empty p { max-width: 380px; margin: 0 0 6px; font-size: 13px; line-height: 1.5; }

/* ฟอร์มพนักงาน */
.sf-modal.mf-modal { max-width: 620px; }
.sf-section { padding: 16px 0 2px; border-top: 1px solid var(--berry-border); }
.sf-section:first-child { padding-top: 0; border-top: none; }
.sf-section-title { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 13px; font-weight: 700; color: var(--berry-text-muted); }
.sf-section-title svg { color: var(--berry-purple); }
.sf-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
.sf-grid-2 .full { grid-column: 1 / -1; }
.sf-modal .mf-field input {
  width: 100%; box-sizing: border-box; padding: 11px 14px;
  border: 1px solid var(--berry-border); border-radius: var(--radius-md); background: var(--berry-paper);
  font-family: inherit; font-size: 14px; color: var(--berry-text-dark); outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.sf-modal .mf-field input:focus { border-color: var(--berry-purple); box-shadow: 0 0 0 3px var(--berry-purple-light); }
.sf-modal .mf-field input.invalid { border-color: var(--berry-red); }
.sf-modal .mf-field input:disabled { background: var(--berry-bg); color: var(--berry-text-muted); cursor: not-allowed; }
.sf-input-wrap { position: relative; }
.sf-input-wrap.with-icon input { padding-left: 38px !important; }
.sf-input-wrap.has-eye input { padding-right: 44px !important; }
.sf-input-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); display: grid; color: var(--berry-text-muted); pointer-events: none; }
.sf-eye { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 32px; height: 32px; display: grid; place-items: center; border: none; border-radius: 8px; background: transparent; color: var(--berry-text-muted); cursor: pointer; }
.sf-eye:hover { background: var(--berry-bg); color: var(--berry-text-dark); }

.sf-avatar-upload { display: flex; align-items: center; gap: 18px; padding: 14px 16px; border: 1px solid var(--berry-border); border-radius: 14px; background: linear-gradient(135deg, #FFF8F5 0%, var(--berry-bg) 100%); }
.sf-avatar-btn { position: relative; padding: 0; border: none; border-radius: 50%; background: none; cursor: pointer; }
.sf-avatar-btn:focus-visible { outline: 3px solid var(--berry-purple-light); outline-offset: 3px; }
.sf-avatar-btn:disabled { cursor: not-allowed; }
.sf-avatar-cam { position: absolute; right: -2px; bottom: -2px; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; background: var(--berry-purple); color: #FFFFFF; box-shadow: 0 0 0 3px var(--berry-paper); transition: transform 0.2s ease; }
.sf-avatar-btn:hover:not(:disabled) .sf-avatar-cam { transform: scale(1.1); }
.sf-avatar-meta { min-width: 0; }
.sf-avatar-meta .title { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 700; color: var(--berry-text-dark); }
.sf-avatar-meta .title .optional { padding: 1px 8px; border-radius: 999px; background: var(--berry-blue-light); color: var(--berry-text-muted); font-size: 11px; font-weight: 500; }
.sf-avatar-meta .hint { margin-top: 3px; font-size: 12px; line-height: 1.45; color: var(--berry-text-muted); }

.sf-roles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
.sf-role { position: relative; display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1.5px solid var(--berry-border); border-radius: 12px; background: var(--berry-paper); text-align: left; font-family: inherit; cursor: pointer; transition: all 0.2s ease; }
.sf-role:hover:not(:disabled) { border-color: var(--berry-text-muted); }
.sf-role.active { border-color: var(--berry-purple); background: #FFF8F5; box-shadow: 0 0 0 3px var(--berry-purple-light); }
.sf-role-icon { width: 36px; height: 36px; min-width: 36px; display: grid; place-items: center; border-radius: 10px; background: var(--berry-blue-light); color: var(--berry-blue); }
.sf-role.tone-warning .sf-role-icon { background: var(--berry-amber-light); color: var(--berry-amber); }
.sf-role-text { padding-right: 18px; }
.sf-role strong { display: block; font-size: 13.5px; color: var(--berry-text-dark); }
.sf-role small { display: block; margin-top: 2px; font-size: 11.5px; line-height: 1.4; color: var(--berry-text-muted); }
.sf-role-check { position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; background: var(--berry-purple); color: #FFFFFF; opacity: 0; transform: scale(0.6); transition: all 0.2s ease; }
.sf-role.active .sf-role-check { opacity: 1; transform: scale(1); }

.sf-pw-rules { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: -4px 0 14px; padding: 0; list-style: none; }
.sf-pw-rules li { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--berry-text-muted); transition: color 0.2s ease; }
.sf-pw-rules .mark { width: 16px; height: 16px; display: grid; place-items: center; border-radius: 50%; background: var(--berry-blue-light); color: transparent; transition: all 0.2s ease; }
.sf-pw-rules li.ok { color: var(--berry-green); }
.sf-pw-rules li.ok .mark { background: var(--berry-green); color: #FFFFFF; }
.sf-note { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 14px; padding: 10px 12px; border-radius: 10px; background: var(--berry-blue-light); color: var(--berry-text-muted); font-size: 12.5px; line-height: 1.45; }
.sf-note svg { flex-shrink: 0; margin-top: 1px; }
/* ===== รายละเอียดการแจ้งเตือน (nd-*) ===== */
.op-notif-item .body { min-width: 0; }
.nd-modal.mf-modal { max-width: 560px; }
.nd-icon { width: 42px; height: 42px; min-width: 42px; display: grid; place-items: center; border-radius: 12px; }
.nd-icon.tone-red { background: var(--berry-red-light); color: var(--berry-red); }
.nd-icon.tone-orange { background: var(--berry-purple-light); color: var(--berry-purple); }
.nd-icon.tone-green { background: var(--berry-green-light); color: var(--berry-green); }
.nd-icon.tone-amber { background: var(--berry-amber-light); color: var(--berry-amber); }
.nd-icon.tone-blue { background: var(--berry-blue-light); color: var(--berry-blue); }
.nd-kind { display: inline-block; margin-bottom: 4px; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; background: var(--berry-blue-light); color: var(--berry-text-muted); }
.nd-kind.tone-red { background: var(--berry-red-light); color: var(--berry-red); }
.nd-kind.tone-orange { background: var(--berry-purple-light); color: var(--berry-purple); }
.nd-kind.tone-amber { background: var(--berry-amber-light); color: #B7791F; }
.nd-modal .mf-head p { display: flex; align-items: center; gap: 5px; }
.nd-message { margin-bottom: 16px; padding: 12px 14px; border-left: 3px solid var(--berry-purple); border-radius: 0 10px 10px 0; background: var(--berry-bg); font-size: 14px; line-height: 1.55; color: var(--berry-text-dark); white-space: pre-wrap; word-break: break-word; }
.nd-section { margin-bottom: 14px; }
.nd-card { padding: 14px; border: 1px solid var(--berry-border); border-radius: 14px; background: var(--berry-paper); }
.nd-order-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.nd-queue { margin-right: 8px; font-size: 16px; font-weight: 700; color: var(--berry-text-dark); }
.nd-muted { font-size: 12.5px; color: var(--berry-text-muted); }
.nd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; margin: 0; }
.nd-grid > div { min-width: 0; }
.nd-grid .full { grid-column: 1 / -1; }
.nd-grid dt { font-size: 11.5px; color: var(--berry-text-muted); }
.nd-grid dd { margin: 2px 0 0; font-size: 13.5px; font-weight: 500; color: var(--berry-text-dark); word-break: break-word; }
.nd-grid dd a { color: var(--berry-text-dark); text-decoration: none; }
.nd-grid dd a:hover { color: var(--berry-purple); }
.nd-danger-text { color: var(--berry-red) !important; }
.nd-quote { padding: 10px 12px; border-radius: 10px; background: var(--berry-bg); font-weight: 400 !important; line-height: 1.55; white-space: pre-wrap; }
.nd-items { margin: 12px 0 0; padding: 10px 0 0; list-style: none; border-top: 1px dashed var(--berry-border); }
.nd-items li { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; font-size: 13.5px; color: var(--berry-text-dark); }
.nd-items li > span:first-child { min-width: 0; }
.nd-items li b { font-weight: 600; color: var(--berry-text-muted); }
.nd-items li small { display: block; font-size: 11.5px; color: var(--berry-text-muted); }
.nd-items li.total { margin-top: 4px; padding-top: 9px; border-top: 1px solid var(--berry-border); font-weight: 700; }
.nd-tag { margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: var(--berry-red-light); color: var(--berry-red); font-size: 11px; font-style: normal; font-weight: 600; }
.nd-total-only { display: flex; justify-content: space-between; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--berry-border); font-size: 13.5px; }
.nd-product { display: flex; align-items: center; gap: 12px; }
.nd-product-img { width: 56px; height: 56px; min-width: 56px; display: grid; place-items: center; overflow: hidden; border-radius: 12px; background: var(--berry-bg); color: var(--berry-text-muted); }
.nd-product-img img { width: 100%; height: 100%; object-fit: cover; }
.nd-product-name { font-size: 15px; font-weight: 700; color: var(--berry-text-dark); }
@media (max-width: 600px) { .nd-grid { grid-template-columns: 1fr; } }
/* ===== ประวัติการขาย (sh-*) ===== */
.sh-filter-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.sh-range { display: inline-flex; align-items: center; gap: 4px; padding: 4px 4px 4px 12px; border-radius: 12px; background: var(--berry-paper); box-shadow: var(--shadow-sm); color: var(--berry-text-muted); }
.sh-range button { padding: 7px 12px; border: none; border-radius: 9px; background: transparent; color: var(--berry-text-muted); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.15s ease; }
.sh-range button:hover { color: var(--berry-text-dark); }
.sh-range button.active { background: var(--berry-purple); color: #FFFFFF; box-shadow: 0 4px 10px rgba(255,114,76,0.3); }
.sh-dates { margin: 0; }
.sh-range-label { margin-left: auto; font-size: 13px; font-weight: 600; color: var(--berry-text-muted); }

.sh-list { display: flex; flex-direction: column; gap: 18px; }
.sh-day-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin: 0 4px 8px; }
.sh-day-head strong { font-size: 14px; color: var(--berry-text-dark); }
.sh-day-head span { font-size: 12.5px; font-weight: 600; color: var(--berry-text-muted); }
.sh-day-card { overflow: hidden; background: var(--berry-paper); border: 1px solid var(--berry-border); border-radius: 16px; box-shadow: var(--shadow-sm); }
.sh-row { position: relative; width: 100%; display: grid; grid-template-columns: 52px 64px minmax(0, 1fr) 74px 96px 128px 20px; align-items: center; gap: 12px; padding: 14px 18px; border: none; border-bottom: 1px solid var(--berry-border); background: transparent; font-family: inherit; text-align: left; cursor: pointer; transition: background 0.15s ease; }
.sh-row:last-child { border-bottom: none; }
.sh-row:hover { background: #FFF8F5; }
.sh-row:hover .sh-chevron { color: var(--berry-purple); transform: translateX(2px); }
.sh-row::before { content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; background: transparent; }
.sh-row.status-done::before { background: var(--berry-green); }
.sh-row.status-cancelled::before { background: var(--berry-red); }
.sh-row.status-active::before { background: var(--berry-amber); }
.sh-row.status-noshow::before { background: var(--berry-text-muted); }
.sh-time { font-size: 13px; font-weight: 600; color: var(--berry-text-muted); font-variant-numeric: tabular-nums; }
.sh-queue { justify-self: start; padding: 4px 9px; border-radius: 8px; background: var(--berry-purple-light); color: var(--berry-purple); font-size: 13px; font-weight: 700; letter-spacing: 0.3px; }
.sh-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sh-who { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 14px; font-weight: 600; color: var(--berry-text-dark); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.sh-order-id { font-size: 12px; font-weight: 500; color: var(--berry-text-muted); }
.sh-items-text { font-size: 12.5px; color: var(--berry-text-muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.sh-type { display: inline-flex; padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 700; }
.sh-type.walkin { background: var(--berry-blue-light); color: var(--berry-blue); }
.sh-type.online { background: var(--berry-green-light); color: var(--berry-green); }
.sh-pay-method { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--berry-text-muted); }
.sh-amount { justify-self: end; font-size: 15px; font-weight: 700; color: var(--berry-text-dark); font-variant-numeric: tabular-nums; }
.sh-status { justify-self: end; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.sh-delivered { font-size: 11px; color: var(--berry-text-muted, #6b7280); white-space: nowrap; }
.sh-chevron { color: #C3C6D4; transition: all 0.15s ease; }
.sh-more { align-self: center; padding: 10px 18px; border: 1px solid var(--berry-border); border-radius: 999px; background: var(--berry-paper); color: var(--berry-text-dark); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.sh-more:hover { border-color: var(--berry-purple); color: var(--berry-purple); }

/* หน้าต่างรายละเอียดออเดอร์ */
.sh-modal.mf-modal { max-width: 880px; }
.sh-head { align-items: center; }
.sh-queue-big { min-width: 74px; padding: 10px 12px; border-radius: 14px; background: linear-gradient(135deg, var(--berry-purple), var(--berry-purple-dark)); color: #FFFFFF; font-size: 20px; font-weight: 800; text-align: center; letter-spacing: 0.5px; box-shadow: 0 8px 18px rgba(255,114,76,0.3); }
.sh-head-badges { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.sh-body { background: #FBFBFD; }
.sh-loading { display: grid; gap: 12px; }
.sh-section { margin-bottom: 18px; }
.sh-section .nd-card + .nd-card { margin-top: 8px; }
.sh-people { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.sh-person { min-width: 0; padding: 12px; border: 1px solid var(--berry-border); border-radius: 14px; background: var(--berry-paper); }
.sh-person.empty { background: transparent; border-style: dashed; }
.sh-person-label { display: flex; align-items: center; gap: 5px; margin-bottom: 8px; font-size: 11.5px; font-weight: 700; color: var(--berry-text-muted); }
.sh-person-label svg { color: var(--berry-purple); }
.sh-person-body { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
.sh-person-body .sf-avatar { box-shadow: none; }
.sh-person-name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 13px; font-weight: 700; line-height: 1.3; color: var(--berry-text-dark); word-break: break-word; }
.sh-person-time { display: flex; align-items: center; gap: 3px; margin-top: 1px; font-size: 11px; color: var(--berry-text-muted); }
.sh-person-sub { font-size: 11.5px; color: var(--berry-text-muted); }
.sh-person-sub a { color: var(--berry-text-muted); text-decoration: none; }
.sh-person-sub a:hover { color: var(--berry-purple); }
.sh-person-extra { margin-top: 2px; font-size: 11px; font-weight: 600; color: var(--berry-green); }
.sh-person-empty { font-size: 12px; color: var(--berry-text-muted); font-style: italic; }
.sh-system-avatar { width: 36px; height: 36px; min-width: 36px; display: grid; place-items: center; border-radius: 50%; background: var(--berry-blue-light); color: var(--berry-blue); }
.sh-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.sh-stats > div { padding: 10px 12px; border-radius: 12px; background: var(--berry-blue-light); }
.sh-stats strong { display: block; font-size: 15px; color: var(--berry-text-dark); }
.sh-stats span { font-size: 11.5px; color: var(--berry-text-muted); }

.sh-items { margin: 0; padding: 0; list-style: none; }
.sh-items li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--berry-border); }
.sh-items li:last-child { border-bottom: none; }
.sh-items li.replaced { opacity: 0.6; }
.sh-items li.replaced .sh-item-name > b, .sh-items li.replaced .sh-item-price { text-decoration: line-through; }
.sh-item-img { width: 40px; height: 40px; min-width: 40px; display: grid; place-items: center; overflow: hidden; border-radius: 10px; background: var(--berry-bg); color: var(--berry-text-muted); }
.sh-item-img img { width: 100%; height: 100%; object-fit: cover; }
.sh-item-name { flex: 1; min-width: 0; font-size: 13.5px; color: var(--berry-text-dark); }
.sh-item-name b { font-weight: 600; color: var(--berry-text-muted); }
.sh-item-name small { display: block; font-size: 11.5px; color: var(--berry-text-muted); }
.sh-item-name small.sh-swap { color: var(--berry-green); font-weight: 600; }
.sh-item-price { font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.sh-note { display: flex; align-items: center; gap: 6px; margin-top: 10px; padding: 8px 10px; border-radius: 10px; background: var(--berry-amber-light); color: #8A5A00; font-size: 12.5px; }
.sh-total { display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--berry-border); font-size: 14px; }
.sh-total b { font-size: 17px; color: var(--berry-text-dark); }
.sh-cancel-reason { display: flex; align-items: center; gap: 6px; margin-top: 10px; padding: 8px 10px; border-radius: 10px; background: var(--berry-red-light); color: var(--berry-red); font-size: 12.5px; font-weight: 600; }

.sh-pay { display: flex; gap: 12px; align-items: flex-start; }
.sh-slip { width: 64px; height: 84px; min-width: 64px; display: grid; place-items: center; overflow: hidden; border: 1px solid var(--berry-border); border-radius: 10px; background: var(--berry-bg); color: var(--berry-text-muted); }
.sh-slip img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s ease; }
.sh-slip:hover img { transform: scale(1.06); }
.sh-slip.none { height: 64px; }
.sh-pay-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.sh-pay-head strong { font-size: 14px; color: var(--berry-text-dark); }
.sh-pay-sub { margin-top: 3px; font-size: 12.5px; color: var(--berry-text-muted); line-height: 1.5; }
.sh-pay-sub b { color: var(--berry-text-dark); font-weight: 600; }
.sh-pay-reject { margin-top: 6px; padding: 6px 9px; border-radius: 8px; background: var(--berry-red-light); color: var(--berry-red); font-size: 12px; }
.sh-row-card { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.sh-row-card strong { font-size: 13.5px; color: var(--berry-text-dark); }

.sh-timeline { position: relative; margin: 0; padding: 4px 0 0 22px; list-style: none; }
.sh-timeline::before { content: ''; position: absolute; left: 6px; top: 10px; bottom: 10px; width: 2px; background: var(--berry-border); }
.sh-timeline li { position: relative; padding: 0 0 14px; }
.sh-timeline li:last-child { padding-bottom: 0; }
.sh-timeline .dot { position: absolute; left: -22px; top: 4px; width: 14px; height: 14px; border-radius: 50%; background: var(--berry-paper); border: 3px solid var(--berry-amber); }
.sh-timeline li.tone-success .dot { border-color: var(--berry-green); }
.sh-timeline li.tone-danger .dot { border-color: var(--berry-red); }
.sh-timeline li.tone-primary .dot { border-color: var(--berry-blue); }
.sh-timeline li.tone-neutral .dot { border-color: var(--berry-text-muted); }
.sh-timeline li:last-child .dot { box-shadow: 0 0 0 4px var(--berry-purple-light); }
.sh-tl-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.sh-tl-head strong { font-size: 13.5px; color: var(--berry-text-dark); }
.sh-tl-head span { font-size: 12px; color: var(--berry-text-muted); }
.sh-tl-sub { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px; font-size: 12.5px; color: var(--berry-text-muted); }
.sh-tl-sub b { color: var(--berry-text-dark); font-weight: 600; }
.sh-gap { padding: 1px 7px; border-radius: 999px; background: var(--berry-blue-light); font-size: 11px; font-weight: 600; }
.sh-tl-reason { margin-top: 4px; padding: 6px 9px; border-radius: 8px; background: var(--berry-bg); font-size: 12px; color: var(--berry-text-dark); }
.sh-stars span { color: #D7DAE5; font-size: 16px; }
.sh-stars span.on { color: #F5B301; }
.sh-prints { margin: 0; padding: 0; list-style: none; }
.sh-prints li { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; font-size: 13px; border-bottom: 1px dashed var(--berry-border); }
.sh-prints li:last-child { border-bottom: none; }

@media (max-width: 1100px) {
  .sh-row { grid-template-columns: 48px 60px minmax(0, 1fr) 90px 120px 18px; }
  .sh-pay-method { display: none; }
  .sh-people { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .sh-filter-bar { gap: 8px; }
  .sh-range { width: 100%; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); padding: 4px; }
  .sh-range > svg { display: none; }
  .sh-range button { padding: 8px 2px; font-size: 12.5px; }
  .sh-dates { width: 100%; }
  .sh-range-label { margin-left: 4px; }
  /* แท็บหลายอัน (ประวัติการขาย / พนักงาน) ตัดบรรทัดได้ ไม่ดันหน้าให้กว้างเกินจอ */
  .mm-wrap-tabs { padding: 10px; }
  .mm-wrap-tabs .mm-tabs { flex-wrap: wrap; }
  .mm-wrap-tabs .mm-tab { flex: 1 1 auto; padding: 7px 8px; }
  .mm-wrap-tabs .mm-search { flex-basis: 100%; }
  .sh-row { grid-template-columns: 56px minmax(0, 1fr) auto; grid-template-areas: "queue main amount" "time main status"; row-gap: 4px; padding: 12px 14px; }
  .sh-queue { grid-area: queue; }
  .sh-time { grid-area: time; font-size: 12px; }
  .sh-main { grid-area: main; }
  .sh-amount { grid-area: amount; }
  .sh-status { grid-area: status; }
  .sh-chevron { display: none; }
  .sh-people { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sh-stats { gap: 6px; }
  .sh-stats > div { padding: 8px 10px; }
  .sh-stats strong { font-size: 13px; }
  .sh-stats span { font-size: 10.5px; }
  .sh-queue-big { min-width: 60px; font-size: 17px; padding: 8px; }
}
@media (max-width: 600px) {
  .sh-overlay { padding: 0; }
  .sh-modal.mf-modal { width: 100%; max-width: 100%; height: 100%; max-height: 100dvh; border-radius: 0; }
  .sh-modal .mf-head { padding: 14px 16px 12px; gap: 10px; }
  .sh-modal .mf-head h3 { font-size: 17px; }
  .sh-modal .mf-body { padding: 14px 14px 8px; }
  .sh-modal .mf-footer { padding: 10px 14px calc(12px + env(safe-area-inset-bottom)); }
  .sh-section { margin-bottom: 16px; }
  .sh-people { gap: 6px; }
  .sh-person { padding: 10px; }
  .sh-tl-head { flex-direction: column; gap: 1px; }
  .sh-tl-head span { font-size: 11.5px; }
  .sh-pay { gap: 10px; }
  .sh-slip { width: 54px; height: 70px; min-width: 54px; }
  .sh-items li { gap: 8px; }
}
/* ===== รีวิวจากลูกค้า (rv-*) ===== */
.rv-stars { display: inline-flex; gap: 1px; line-height: 1; letter-spacing: 0; }
.rv-star { position: relative; color: #DADDE7; }
.rv-star-fill { position: absolute; left: 0; top: 0; overflow: hidden; color: #F5B301; white-space: nowrap; }
.rv-privacy { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; padding: 10px 14px; border-radius: 12px; background: var(--berry-blue-light); color: var(--berry-text-muted); font-size: 12.5px; }
.rv-privacy svg { color: var(--berry-green); flex-shrink: 0; }

.rv-overview { display: grid; grid-template-columns: 200px minmax(0, 1.1fr) minmax(0, 1fr); gap: 16px; margin-bottom: 16px; padding: 20px; background: var(--berry-paper); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.rv-score { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding-right: 16px; border-right: 1px solid var(--berry-border); }
.rv-score-big { font-size: 52px; font-weight: 800; line-height: 1; color: var(--berry-text-dark); }
.rv-score-sub { font-size: 12.5px; color: var(--berry-text-muted); }
.rv-bars { display: flex; flex-direction: column; justify-content: center; gap: 6px; }
.rv-bar { display: grid; grid-template-columns: 34px minmax(0, 1fr) 34px; align-items: center; gap: 10px; padding: 4px 8px; border: none; border-radius: 8px; background: transparent; font-family: inherit; cursor: pointer; transition: background 0.15s ease; }
.rv-bar:hover, .rv-bar.active { background: var(--berry-bg); }
.rv-bar.active .rv-bar-label { color: var(--berry-purple); }
.rv-bar-label { font-size: 12.5px; font-weight: 700; color: var(--berry-text-dark); text-align: left; }
.rv-bar-track { height: 9px; border-radius: 999px; background: var(--berry-blue-light); overflow: hidden; }
.rv-bar-fill { display: block; height: 100%; border-radius: 999px; transition: width 0.4s ease; }
.rv-bar-fill.tone-green { background: var(--berry-green); }
.rv-bar-fill.tone-amber { background: var(--berry-amber); }
.rv-bar-fill.tone-red { background: var(--berry-red); }
.rv-bar-count { font-size: 12px; font-weight: 600; color: var(--berry-text-muted); text-align: right; }
.rv-insights { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rv-insight { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: var(--berry-bg); }
.rv-insight .icon { width: 32px; height: 32px; min-width: 32px; display: grid; place-items: center; border-radius: 9px; }
.rv-insight.tone-green .icon { background: var(--berry-green-light); color: var(--berry-green); }
.rv-insight.tone-red .icon { background: var(--berry-red-light); color: var(--berry-red); }
.rv-insight.tone-blue .icon { background: var(--berry-blue-light); color: var(--berry-blue); }
.rv-insight.tone-orange .icon { background: var(--berry-purple-light); color: var(--berry-purple); }
.rv-insight.tone-amber .icon { background: var(--berry-amber-light); color: var(--berry-amber); }
.rv-insight strong { display: block; font-size: 17px; color: var(--berry-text-dark); line-height: 1.2; }
.rv-insight span { display: block; font-size: 11.5px; color: var(--berry-text-muted); }
.rv-insight em { display: block; margin-top: 2px; font-size: 11px; font-style: normal; font-weight: 600; color: var(--berry-text-muted); }
.rv-insight.tone-green em { color: var(--berry-green); }
.rv-insight.tone-red em { color: var(--berry-red); }

.rv-menu-card { margin-bottom: 16px; padding: 16px 18px; background: var(--berry-paper); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.rv-hint { margin-left: 4px; font-size: 11.5px; font-weight: 500; color: var(--berry-text-muted); }
.rv-menu-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.rv-menu-item { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--berry-border); border-radius: 12px; background: var(--berry-paper); font-family: inherit; text-align: left; cursor: pointer; transition: all 0.15s ease; }
.rv-menu-item:hover { border-color: var(--berry-purple); background: #FFF8F5; }
.rv-menu-text { min-width: 0; }
.rv-menu-text strong { display: block; font-size: 13px; color: var(--berry-text-dark); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.rv-menu-text > span { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--berry-text-muted); }

.rv-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rv-chip { display: inline-flex; align-items: center; gap: 5px; height: 36px; padding: 0 12px; border: 1px solid var(--berry-border); border-radius: 999px; background: var(--berry-paper); color: var(--berry-text-muted); font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.rv-chip.active { border-color: var(--berry-purple); background: var(--berry-purple-light); color: var(--berry-purple); }

.rv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
.rv-card { position: relative; display: flex; flex-direction: column; gap: 12px; padding: 18px; background: var(--berry-paper); border: 1px solid var(--berry-border); border-radius: 16px; box-shadow: var(--shadow-sm); overflow: hidden; animation: berryFadeIn 0.25s ease-out; }
.rv-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
.rv-card.tone-green::before { background: var(--berry-green); }
.rv-card.tone-amber::before { background: var(--berry-amber); }
.rv-card.tone-red::before { background: var(--berry-red); }
.rv-card-head { display: flex; align-items: center; gap: 12px; min-width: 0; }
.rv-card-head .sf-avatar { box-shadow: none; }
.rv-who { flex: 1; min-width: 0; }
.rv-name { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 14.5px; font-weight: 700; color: var(--berry-text-dark); }
.rv-regular { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 999px; background: var(--berry-amber-light); color: #B7791F; font-size: 11px; font-weight: 700; }
.rv-sub { margin-top: 2px; font-size: 12px; color: var(--berry-text-muted); }
.rv-rating { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.rv-rating-label { font-size: 11.5px; font-weight: 700; }
.rv-rating-label.tone-green { color: var(--berry-green); }
.rv-rating-label.tone-amber { color: #B7791F; }
.rv-rating-label.tone-red { color: var(--berry-red); }
.rv-body { display: flex; gap: 12px; align-items: flex-start; }
.rv-comment { flex: 1; margin: 0; padding: 12px 14px; border-radius: 12px; background: var(--berry-bg); font-size: 14px; line-height: 1.6; color: var(--berry-text-dark); white-space: pre-wrap; word-break: break-word; }
.rv-comment.empty { background: transparent; padding: 4px 0; color: var(--berry-text-muted); font-size: 13px; font-style: italic; }
.rv-photo { position: relative; width: 88px; height: 88px; min-width: 88px; padding: 0; overflow: hidden; border: 1px solid var(--berry-border); border-radius: 12px; background: var(--berry-bg); cursor: zoom-in; }
.rv-photo img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s ease; }
.rv-photo:hover img { transform: scale(1.06); }
.rv-photo span { position: absolute; left: 4px; bottom: 4px; display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 999px; background: rgba(29,31,47,0.65); color: #FFFFFF; font-size: 10.5px; font-weight: 600; }
.rv-order { margin-top: auto; padding-top: 10px; border-top: 1px dashed var(--berry-border); }
.rv-order-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--berry-text-muted); }
.rv-queue { font-weight: 700; color: var(--berry-purple); }
.rv-time { margin-left: auto; }
.rv-items { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.rv-item { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px 3px 3px; border-radius: 999px; background: var(--berry-bg); font-size: 12px; color: var(--berry-text-dark); }
.rv-item-img { width: 22px; height: 22px; min-width: 22px; display: grid; place-items: center; overflow: hidden; border-radius: 50%; background: var(--berry-paper); color: var(--berry-text-muted); }
.rv-item-img img { width: 100%; height: 100%; object-fit: cover; }
.rv-item-img.lg { width: 40px; height: 40px; min-width: 40px; border-radius: 10px; background: var(--berry-bg); }

.rv-lightbox { position: fixed; inset: 0; z-index: 10050; display: grid; place-items: center; padding: 24px; background: rgba(15,16,26,0.82); animation: berryFadeIn 0.18s ease-out; cursor: zoom-out; }
.rv-lightbox img { max-width: min(92vw, 900px); max-height: 86vh; border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,0.45); cursor: default; }
.rv-lightbox-close { position: absolute; top: 16px; right: 16px; width: 42px; height: 42px; display: grid; place-items: center; border: none; border-radius: 50%; background: rgba(255,255,255,0.15); color: #FFFFFF; cursor: pointer; }
.rv-lightbox-close:hover { background: rgba(255,255,255,0.28); }

@media (max-width: 1100px) {
  .rv-overview { grid-template-columns: 170px minmax(0, 1fr); }
  .rv-insights { grid-column: 1 / -1; grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .rv-overview { grid-template-columns: 1fr; padding: 16px; }
  .rv-score { padding: 0 0 12px; border-right: none; border-bottom: 1px solid var(--berry-border); }
  .rv-score-big { font-size: 44px; }
  .rv-insights { grid-template-columns: 1fr 1fr; }
  .rv-grid { grid-template-columns: 1fr; }
  .rv-card { padding: 14px; }
  .rv-photo { width: 72px; height: 72px; min-width: 72px; }
  .rv-chips { width: 100%; }
  .rv-chips .mm-select { margin-left: auto; }
  .rv-time { margin-left: 0; }
}
/* ===== รายงานปัญหา (is-*) ===== */
.is-type-icon { width: 38px; height: 38px; min-width: 38px; display: grid; place-items: center; border-radius: 11px; }
.is-type-icon.tone-red { background: var(--berry-red-light); color: var(--berry-red); }
.is-type-icon.tone-amber { background: var(--berry-amber-light); color: var(--berry-amber); }
.is-type-icon.tone-green { background: var(--berry-green-light); color: var(--berry-green); }
.is-type-icon.tone-neutral { background: var(--berry-blue-light); color: var(--berry-text-muted); }
.is-types { display: grid; gap: 4px; }
.is-type-row { display: grid; grid-template-columns: minmax(150px, 220px) minmax(0, 1fr) 110px; align-items: center; gap: 12px; padding: 6px 8px; border: none; border-radius: 8px; background: transparent; font-family: inherit; text-align: left; cursor: pointer; }
.is-type-row:hover, .is-type-row.active { background: var(--berry-bg); }
.is-type-row.active .is-type-name { color: var(--berry-purple); }
.is-type-name { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--berry-text-dark); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.is-type-name svg { color: var(--berry-text-muted); flex-shrink: 0; }
.is-type-count { font-size: 12.5px; font-weight: 700; color: var(--berry-text-dark); text-align: right; }
.is-type-count em { font-style: normal; font-weight: 600; color: var(--berry-red); }

.is-card { position: relative; display: flex; flex-direction: column; gap: 12px; padding: 18px; background: var(--berry-paper); border: 1px solid var(--berry-border); border-radius: 16px; box-shadow: var(--shadow-sm); overflow: hidden; animation: berryFadeIn 0.25s ease-out; }
.is-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
.is-card.tone-red::before { background: var(--berry-red); }
.is-card.tone-amber::before { background: var(--berry-amber); }
.is-card.tone-green::before { background: var(--berry-green); }
.is-card.tone-neutral::before { background: #C3C6D4; }
.is-card.stale { border-color: rgba(226,69,47,0.4); }
.is-card-head { display: flex; align-items: flex-start; gap: 12px; }
.is-title { flex: 1; min-width: 0; }
.is-title strong { display: block; font-size: 15px; color: var(--berry-text-dark); }
.is-title span { font-size: 12px; color: var(--berry-text-muted); }
.is-head-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.is-stale { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 700; color: var(--berry-red); }
.is-reporter { display: flex; align-items: center; gap: 10px; }
.is-reporter .sf-avatar { box-shadow: none; }
.is-reporter-name { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13.5px; font-weight: 700; color: var(--berry-text-dark); }
.is-reporter-sub { font-size: 11.5px; color: var(--berry-text-muted); }
.is-quote { margin: 0; padding: 12px 14px; border-left: 3px solid var(--berry-red); border-radius: 0 12px 12px 0; background: #FFF7F5; font-size: 14px; line-height: 1.6; color: var(--berry-text-dark); white-space: pre-wrap; word-break: break-word; }
.is-quote.small { margin-bottom: 14px; font-size: 13px; }
.is-order { padding: 10px 12px; border: 1px dashed var(--berry-border); border-radius: 12px; }
.is-order.none { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--berry-text-muted); }
.is-order-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--berry-text-muted); }
.is-order-status { padding: 0 8px; border-radius: 999px; background: var(--berry-blue-light); font-weight: 600; }
.is-ready { display: inline-flex; align-items: center; gap: 3px; }
.is-ready.hl { color: var(--berry-red); font-weight: 700; }
.is-reply { padding: 10px 12px; border-radius: 12px; background: var(--berry-bg); font-size: 13px; line-height: 1.5; color: var(--berry-text-dark); }
.is-reply.tone-green { background: var(--berry-green-light); }
.is-reply-head { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 3px; font-size: 11.5px; font-weight: 700; color: var(--berry-text-muted); }
.is-reply-time { margin-top: 4px; font-size: 11.5px; color: var(--berry-text-muted); }
.is-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; }
.is-actions .sf-act { flex: 1 1 auto; }
.is-quick { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.is-quick-btn { padding: 5px 10px; border: 1px solid var(--berry-border); border-radius: 999px; background: var(--berry-paper); color: var(--berry-text-dark); font-family: inherit; font-size: 12px; cursor: pointer; text-align: left; }
.is-quick-btn:hover:not(:disabled) { border-color: var(--berry-purple); color: var(--berry-purple); }
@media (max-width: 700px) {
  .is-type-row { grid-template-columns: minmax(0, 1fr) 70px; }
  .is-type-row .rv-bar-track { display: none; }
  .is-card { padding: 14px; }
}
.mf-btn.danger { background: var(--berry-red); color: #FFFFFF; border: 1px solid var(--berry-red); box-shadow: 0 6px 16px rgba(226,69,47,0.28); }
.mf-btn.danger:hover:not(:disabled) { background: #C93A26; }
.mf-btn.danger:disabled { background: #F0A79B; border-color: #F0A79B; box-shadow: none; opacity: 1; }
.mf-head-icon.sf-danger-icon { background: var(--berry-red-light); color: var(--berry-red); }
.sf-erase-warn { margin-bottom: 14px; padding: 12px 14px; border: 1px solid rgba(226,69,47,0.25); border-radius: 12px; background: var(--berry-red-light); color: #9B2C1C; font-size: 13px; line-height: 1.5; }
.sf-erase-warn strong { display: flex; align-items: center; gap: 6px; color: var(--berry-red); font-size: 13.5px; }
.sf-erase-warn ul { margin: 6px 0 0; padding-left: 20px; }
.sf-erase-warn li + li { margin-top: 2px; }
.sf-mono { font-family: 'Roboto Mono', ui-monospace, monospace; padding: 1px 6px; border-radius: 6px; background: var(--berry-blue-light); color: var(--berry-text-dark); }

@media (max-width: 1100px) { .sf-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) {
  .sf-grid, .sf-grid-2, .sf-roles { grid-template-columns: 1fr; }
  .sf-stats { gap: 10px; }
  .sf-stat { padding: 12px; gap: 10px; }
  .sf-stat .icon { width: 38px; height: 38px; min-width: 38px; }
  .sf-avatar-upload { flex-direction: column; text-align: center; }
  .sf-avatar-meta .title, .sf-avatar-upload .mf-image-actions { justify-content: center; }
  .sf-act { font-size: 12.5px; padding: 9px 8px; }
}

/* หน้าครอปรูป */
.crop-overlay { position: fixed; inset: 0; z-index: 10040; display: grid; place-items: center; padding: 16px; background: rgba(15,16,26,0.6); animation: berryFadeIn 0.18s ease-out; }
.crop-modal { box-sizing: border-box; max-width: calc(100vw - 32px); padding: 20px; background: var(--berry-paper); border-radius: 18px; box-shadow: 0 24px 60px rgba(15,16,26,0.35); animation: berryPopIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1); }
.crop-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.crop-head h3 { margin: 0; font-size: 17px; font-weight: 700; color: var(--berry-text-dark); }
.crop-head p { margin: 3px 0 0; font-size: 12.5px; color: var(--berry-text-muted); }
.crop-ratios { display: flex; gap: 4px; padding: 4px; border-radius: var(--radius-md); background: var(--berry-purple-light); }
.crop-ratios button { padding: 5px 10px; border: none; border-radius: 6px; background: transparent; color: var(--berry-text-muted); font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.crop-ratios button.active { background: var(--berry-paper); color: var(--berry-purple); box-shadow: 0 1px 3px rgba(18,25,38,.12); }
.crop-stage { position: relative; margin: 0 auto; overflow: hidden; border-radius: 12px; background: #1D1F2F; cursor: grab; touch-action: none; user-select: none; transition: height 0.2s ease; }
.crop-stage:active { cursor: grabbing; }
.crop-stage img { position: absolute; top: 0; left: 0; max-width: none; transform-origin: 0 0; pointer-events: none; }
.crop-grid { position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 0 2px rgba(255,255,255,0.85); border-radius: 12px; }
.crop-grid span { position: absolute; background: rgba(255,255,255,0.35); }
.crop-grid span:nth-child(1) { left: 33.33%; top: 0; bottom: 0; width: 1px; }
.crop-grid span:nth-child(2) { left: 66.66%; top: 0; bottom: 0; width: 1px; }
.crop-grid span:nth-child(3) { top: 33.33%; left: 0; right: 0; height: 1px; }
.crop-grid span:nth-child(4) { top: 66.66%; left: 0; right: 0; height: 1px; }
.crop-zoom { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
.crop-zoom > button { width: 32px; height: 32px; min-width: 32px; display: grid; place-items: center; border: 1px solid var(--berry-border); border-radius: 8px; background: var(--berry-paper); color: var(--berry-text-dark); font-size: 18px; line-height: 1; cursor: pointer; }
.crop-zoom > button:disabled { opacity: 0.45; cursor: not-allowed; }
.crop-zoom > button.crop-reset { width: auto; padding: 0 12px; font-size: 12.5px; font-family: inherit; font-weight: 500; }
.crop-zoom input[type="range"] { flex: 1; min-width: 0; accent-color: var(--berry-purple); }
.crop-footer { display: grid; grid-template-columns: 1fr 1.4fr; gap: 10px; margin-top: 16px; }

/* กล่องยืนยันการลบ */
.berry-confirm-overlay {
  position: fixed; inset: 0; z-index: 10050;
  display: grid; place-items: center; padding: 16px;
  background: rgba(29,31,47,0.45);
  backdrop-filter: blur(2px);
  animation: berryFadeIn 0.18s ease-out;
}
.berry-confirm-dialog {
  width: 100%; max-width: 400px; box-sizing: border-box;
  padding: 28px 24px 22px;
  background: var(--berry-paper);
  border-radius: 18px;
  box-shadow: 0 24px 60px rgba(29,31,47,0.25);
  text-align: center;
  animation: berryPopIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.berry-confirm-icon {
  width: 64px; height: 64px; margin: 0 auto 14px;
  display: grid; place-items: center; border-radius: 50%;
  background: var(--berry-red-light); color: var(--berry-red);
  box-shadow: 0 0 0 8px rgba(226,69,47,0.08);
}
.berry-confirm-dialog h3 { margin: 0; font-size: 19px; font-weight: 700; color: var(--berry-text-dark); }
.berry-confirm-dialog p { margin: 10px 0 0; font-size: 14px; line-height: 1.6; color: var(--berry-text-muted); word-break: break-word; }
.berry-confirm-dialog p strong { color: var(--berry-text-dark); }
.berry-confirm-warn { display: inline-block; margin-top: 12px; padding: 5px 12px; border-radius: 999px; background: var(--berry-amber-light); color: #8A5A00; font-size: 12px; font-weight: 500; }
.berry-confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 22px; }
.berry-confirm-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 14px; border-radius: var(--radius-md);
  font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
  transition: background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.berry-confirm-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.berry-confirm-btn.cancel { background: var(--berry-paper); color: var(--berry-text-dark); border: 1px solid var(--berry-border); }
.berry-confirm-btn.cancel:hover:not(:disabled) { border-color: var(--berry-text-muted); }
.berry-confirm-btn.danger { background: var(--berry-red); color: #FFFFFF; border: 1px solid var(--berry-red); box-shadow: 0 6px 16px rgba(226,69,47,0.3); }
.berry-confirm-btn.danger:hover:not(:disabled) { background: #C93A26; }
.berry-spinner { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.45); border-top-color: #FFFFFF; animation: berrySpin 0.7s linear infinite; }

/* ติ๊กถูกกลางจอเมื่อสำเร็จ */
.berry-success-overlay {
  position: fixed; inset: 0; z-index: 10060;
  display: grid; place-items: center;
  background: rgba(29,31,47,0.25);
  pointer-events: none;
  animation: berryFadeIn 0.2s ease-out;
}
.berry-success-overlay.leaving { animation: berryFadeOut 0.35s ease-in forwards; }
.berry-success-card {
  min-width: 220px; max-width: min(320px, calc(100vw - 32px)); box-sizing: border-box;
  padding: 28px 28px 24px;
  background: var(--berry-paper); border-radius: 20px;
  box-shadow: 0 24px 60px rgba(29,31,47,0.25);
  text-align: center;
  animation: berryPopIn 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.berry-success-check { width: 76px; height: 76px; display: block; margin: 0 auto; }
.berry-success-check .circle {
  stroke: var(--berry-green); stroke-width: 3; stroke-linecap: round;
  stroke-dasharray: 151; stroke-dashoffset: 151;
  transform: rotate(-90deg); transform-origin: center;
  animation: berryDraw 0.5s cubic-bezier(0.65, 0, 0.45, 1) 0.1s forwards;
}
.berry-success-check .tick {
  stroke: var(--berry-green); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round;
  stroke-dasharray: 36; stroke-dashoffset: 36;
  animation: berryDraw 0.35s cubic-bezier(0.65, 0, 0.45, 1) 0.55s forwards;
}
.berry-success-title { margin-top: 14px; font-size: 18px; font-weight: 700; color: var(--berry-text-dark); }
.berry-success-detail { margin-top: 4px; font-size: 13px; color: var(--berry-text-muted); line-height: 1.5; word-break: break-word; }

@keyframes berryFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes berryFadeOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes berryPopIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
@keyframes berryDraw { to { stroke-dashoffset: 0; } }
@keyframes berrySpin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .berry-confirm-overlay, .berry-confirm-dialog, .berry-success-overlay, .berry-success-card { animation: none; }
  .berry-success-check .circle, .berry-success-check .tick { animation: none; stroke-dashoffset: 0; }
}

/* Toast */
.berry-toast { position: fixed; bottom: 24px; right: 24px; background: var(--berry-paper); color: var(--berry-text-dark); padding: 12px 20px; border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 12px; z-index: 1000; opacity: 0; transform: translateY(20px); pointer-events: none; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid var(--berry-border); }
.berry-toast.show { opacity: 1; transform: translateY(0); }
.berry-toast .icon-wrapper { background: var(--berry-green-light); color: var(--berry-green); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }

/* Responsive Grid */
@media (max-width: 1024px) {
  .berry-stat-row { grid-template-columns: 1fr 1fr; }
  .berry-stat-col { grid-column: span 2; flex-direction: row; }
  .berry-stat-col > div { flex: 1; }
}

@media (max-width: 768px) {
  .berry-stat-row { grid-template-columns: 1fr; }
  .berry-stat-col { grid-column: span 1; flex-direction: column; }
}

/* แจ้งเตือนกระดิ่ง */
.notif-badge-top {
  position: absolute;
  top: -6px;
  right: -6px;
  background: var(--berry-red);
  color: white;
  font-size: 10px;
  font-weight: 700;
  height: 18px;
  min-width: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border: 2px solid var(--berry-paper);
}
.notif-item-hover:hover {
  background: var(--berry-purple-light);
}

/* ================================================================
   มือถือ (ปรับให้อ่านง่ายบนจอเล็ก)
   ================================================================ */
.berry-sidebar-backdrop { display: none; }
.op-mobile-status { display: none; }

@media (max-width: 768px) {
  .berry-sidebar-backdrop { display: block; position: fixed; inset: 0; top: 64px; z-index: 99; background: rgba(29,31,47,0.38); animation: berryFadeIn 0.2s ease-out; }
  .berry-sidebar { z-index: 100; top: 64px !important; width: 280px !important; max-width: 85vw; border-radius: 0 18px 18px 0; transition: transform 0.25s ease, box-shadow 0.25s ease; }
  .berry-topbar { height: 64px; padding: 0 14px; }
  .berry-content { padding: 16px 14px; }
}

@media (max-width: 600px) {
  /* topbar: เหลือ เมนู / โลโก้ / กระดิ่ง / รูปโปรไฟล์ */
  .berry-topbar-left { gap: 10px; min-width: 0; }
  .berry-topbar-right { gap: 8px; }
  .berry-brand .brand-status, .berry-topbar .store-switch { display: none; }
  .brand-logo { font-size: 21px; }
  .berry-icon-btn { width: 38px; height: 38px; }

  /* แถบสถานะใต้ topbar */
  .op-mobile-status { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 14px; background: var(--berry-paper); border-bottom: 1px solid var(--berry-border); flex-shrink: 0; }
  .op-ms-court { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .op-ms-court .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .op-ms-court.open { background: var(--berry-green-light); color: var(--berry-green); }
  .op-ms-court.closed { background: var(--berry-red-light); color: var(--berry-red); }
  .store-switch.mobile { display: inline-flex; padding: 4px 6px 4px 12px; font-size: 12px; }
  .store-switch.mobile .label { display: inline !important; }

  /* หัวหน้าเพจ */
  .op-page-head { gap: 12px; margin-bottom: 14px; }
  .op-page-title { gap: 10px; align-items: flex-start; }
  .op-page-icon { width: 38px; height: 38px; min-width: 38px; border-radius: 11px; }
  .op-page-icon svg { width: 19px; height: 19px; }
  .op-page-head h1 { font-size: 19px; }
  .op-page-head p { font-size: 12.5px; line-height: 1.5; }
  .op-page-actions { width: 100%; }
  .op-page-actions > .berry-btn { flex: 1; justify-content: center; }
  .berry-dashboard-grid { gap: 14px; }
  .berry-card { padding: 16px; border-radius: 14px; }

  /* ตอนนี้ในร้าน: การ์ดแนวตั้งเล็ก ๆ อ่านง่าย */
  .od-live { padding: 14px; }
  .od-live-head { font-size: 13.5px; gap: 6px 8px; }
  .od-live-head .muted { width: 100%; font-size: 12px; }
  .od-live-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
  .od-live-item { position: relative; flex-direction: column; align-items: flex-start; gap: 6px; padding: 10px 12px; }
  .od-live-item .icon { width: 30px; height: 30px; min-width: 30px; border-radius: 8px; }
  .od-live-item .icon svg { width: 16px; height: 16px; }
  .od-live-item > svg:last-child { position: absolute; top: 12px; right: 10px; opacity: 0.5; }
  .od-live-item .text strong { font-size: 20px; }
  .od-live-item .text span { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* แถบช่วงเวลา: ปุ่มเลื่อนแนวนอนได้ ไม่ตกบรรทัด */
  .od-period-bar { position: static; margin: 0; padding: 12px; gap: 10px; }
  .od-period-text { font-size: 12.5px; width: 100%; }
  .berry-period-picker { width: 100%; flex-direction: column; align-items: stretch; }
  .berry-period-group { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .berry-period-group::-webkit-scrollbar { display: none; }
  .berry-period-group .berry-period-btn { flex: 1 0 auto; white-space: nowrap; text-align: center; }
  .berry-date-wrap { justify-content: center; }
  .berry-date-range { flex-direction: column; align-items: stretch; }
  .berry-date-range label { justify-content: space-between; }

  /* การ์ดสรุปยอดขาย */
  .od-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 18px; min-height: 0; }
  .od-summary-block { min-width: 0; }
  .od-summary-value { font-size: 24px; }
  .od-summary-value small { font-size: 12px; margin-left: 4px; }
  .od-summary-label { font-size: 12.5px; }
  .od-summary .od-delta, .od-summary .od-delta-empty { font-size: 11px; }
  .od-summary .od-delta span { display: none; }
  .od-summary-spark { grid-column: 1 / -1; min-width: 0; }
  .od-spark, .od-spark-empty { height: 56px; }

  /* การ์ดตัวเลขเล็ก: 2 คอลัมน์ */
  .od-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .od-kpi { padding: 12px; min-height: 0; }
  .od-kpi-main { flex-direction: column; align-items: flex-start; gap: 8px; }
  .od-kpi-icon { width: 34px; height: 34px; min-width: 34px; }
  .od-kpi-icon svg { width: 17px; height: 17px; }
  .od-kpi-value { font-size: 19px; }
  .od-kpi-value small { font-size: 11.5px; }
  .od-kpi-label { font-size: 11.5px; line-height: 1.4; }
  .od-kpi .od-delta { margin-top: 8px; padding: 3px 8px; font-size: 11px; }
  .od-kpi .od-delta span { display: none; }
  .od-kpi .od-delta-empty { margin-top: 8px; font-size: 11px; }
  .od-row { gap: 14px; }
  .od-card-head { flex-direction: column; gap: 4px; }
  .od-head-total { font-size: 18px; }
  .od-donut-box { flex-basis: 180px; width: 180px; height: 180px; }
  .od-legend { flex-basis: 100%; }
  .od-top-row { padding: 10px; gap: 10px; }
  .od-top-thumb { display: none; }
  .od-top-meta span:nth-child(n+3) { display: none; }

  /* ตาราง -> การ์ด (พนักงาน / ประวัติการขาย / ยกเลิก) */
  .berry-table thead { display: none; }
  .berry-table, .berry-table tbody, .berry-table tr, .berry-table td { display: block; width: 100%; box-sizing: border-box; }
  .berry-table tr { margin-bottom: 10px; padding: 10px 14px; border: 1px solid var(--berry-border); border-radius: 12px; background: var(--berry-paper); }
  .berry-table tr:last-child { margin-bottom: 0; }
  .berry-table td { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 6px 0 !important; border-bottom: none !important; font-size: 13.5px; text-align: right; }
  .berry-table td::before { content: attr(data-label); flex-shrink: 0; font-size: 12px; font-weight: 500; color: var(--berry-text-muted); text-align: left; }
  .berry-table td:not([data-label])::before { content: none; }
  .berry-table td.empty-state { justify-content: center; text-align: center; padding: 24px 0 !important; }
  .berry-table td.op-td-block { flex-direction: column; align-items: flex-start; text-align: left; }
  .berry-table td.op-td-actions { justify-content: flex-end; }
  .berry-table td.op-td-actions::before { margin-right: auto; }
  .berry-card:has(> .berry-table-container) { padding: 12px; background: transparent; box-shadow: none; }

  /* หน้าเมนู */
  .mm-toolbar { padding: 10px; gap: 8px; }
  .mm-tool-group { width: 100%; flex-wrap: nowrap; }
  .mm-select { flex: 1; min-width: 0; }
  .mm-select-btn { padding: 0 12px; }
  .mm-card-title-row { flex-direction: column; gap: 2px; }
  .mm-card-title-row h4 { font-size: 13.5px; }
  .mm-price { font-size: 15px; }
  .mm-card-media { height: 118px; }
  .mm-card-body { padding: 10px 10px 12px; }
  .mm-desc { min-height: 0; font-size: 11.5px; }
  .mm-stock-btn { font-size: 12px; padding: 8px 6px; }
  .mm-alert { font-size: 12.5px; }
  .berry-bulk-bar { padding: 10px 12px; }
  .berry-bulk-bar .actions { width: 100%; }
  .berry-bulk-bar .actions .mm-stock-btn { flex: 1; }
}

/* ================================================================
   ปุ่ม ☰ (หมุนเมื่อกด / กลายเป็น X ตอนเปิดเมนูบนมือถือ)
   ================================================================ */
.op-burger .lines { position: relative; display: block; width: 18px; height: 14px; transition: transform 0.5s cubic-bezier(0.68, -0.4, 0.27, 1.4); }
.op-burger .lines span { position: absolute; left: 0; width: 100%; height: 2px; border-radius: 2px; background: currentColor; transition: top 0.3s ease 0.1s, transform 0.3s ease, opacity 0.2s ease, width 0.3s ease; }
.op-burger .lines span:nth-child(1) { top: 0; }
.op-burger .lines span:nth-child(2) { top: 6px; width: 72%; }
.op-burger .lines span:nth-child(3) { top: 12px; }
@media (hover: hover) { .op-burger:hover .lines span:nth-child(2) { width: 100%; } }
.op-burger { -webkit-tap-highlight-color: transparent; transition: background 0.25s ease, color 0.25s ease, transform 0.15s ease; }
.op-burger:focus { outline: none; }
.op-burger:focus-visible { outline: 2px solid var(--berry-purple); outline-offset: 2px; }
.op-burger:active { transform: scale(0.92); }
@media (max-width: 768px) {
  .op-burger.is-open { background: var(--berry-purple) !important; color: #FFFFFF !important; }
  .op-burger.is-open .lines span { transition: top 0.3s ease, transform 0.3s ease 0.15s, opacity 0.2s ease; }
  .op-burger.is-open .lines span:nth-child(1) { top: 6px; transform: rotate(45deg); }
  .op-burger.is-open .lines span:nth-child(2) { opacity: 0; transform: scaleX(0); }
  .op-burger.is-open .lines span:nth-child(3) { top: 6px; transform: rotate(-45deg); }
}
@media (prefers-reduced-motion: reduce) { .op-burger .lines, .op-burger .lines span { transition: none !important; } }

/* ================================================================
   การแจ้งเตือน
   ================================================================ */
.op-bell .bell-icon { display: grid; place-items: center; }
.op-bell.has-unread .bell-icon { animation: opBellRing 1s ease-in-out; transform-origin: 50% 10%; }
.op-bell.active { background: var(--berry-amber) !important; color: #FFFFFF !important; }
@keyframes opBellRing {
  0%, 100% { transform: rotate(0); }
  15% { transform: rotate(14deg); } 30% { transform: rotate(-12deg); }
  45% { transform: rotate(9deg); } 60% { transform: rotate(-6deg); } 75% { transform: rotate(3deg); }
}
.op-notif-backdrop { display: none; }
.op-notif-panel {
  position: absolute; top: calc(100% + 12px); right: -8px; z-index: 1000;
  width: 380px; max-height: min(560px, calc(100vh - 110px));
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--berry-paper); border: 1px solid var(--berry-border); border-radius: 18px;
  box-shadow: 0 20px 50px rgba(29,31,47,0.18);
  transform-origin: top right;
  animation: opNotifIn 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
}
@keyframes opNotifIn { from { opacity: 0; transform: translateY(-8px) scale(0.96); } to { opacity: 1; transform: none; } }
.op-notif-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px 16px 10px; }
.op-notif-head .title { display: flex; align-items: center; gap: 8px; }
.op-notif-head h4 { margin: 0; font-size: 16px; font-weight: 700; color: var(--berry-text-dark); }
.op-notif-head .count { padding: 2px 8px; border-radius: 999px; background: var(--berry-red); color: #FFFFFF; font-size: 11px; font-weight: 700; }
.op-notif-head .head-actions { display: flex; align-items: center; gap: 4px; }
.op-notif-link { display: inline-flex; align-items: center; gap: 4px; padding: 6px 8px; border: none; border-radius: 8px; background: transparent; color: var(--berry-purple); font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.op-notif-link:hover { background: var(--berry-purple-light); }
.op-notif-close { width: 30px; height: 30px; display: grid; place-items: center; border: none; border-radius: 8px; background: transparent; color: var(--berry-text-muted); cursor: pointer; }
.op-notif-close:hover { background: var(--berry-bg); color: var(--berry-text-dark); }
.op-notif-tabs { display: flex; gap: 6px; padding: 0 16px 10px; border-bottom: 1px solid var(--berry-border); }
.op-notif-tabs button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid var(--berry-border); border-radius: 999px; background: var(--berry-paper); color: var(--berry-text-muted); font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.op-notif-tabs button span { min-width: 18px; padding: 0 5px; border-radius: 999px; background: var(--berry-bg); font-size: 11px; line-height: 18px; text-align: center; }
.op-notif-tabs button.active { background: var(--berry-blue); border-color: var(--berry-blue); color: #FFFFFF; }
.op-notif-tabs button.active span { background: rgba(255,255,255,0.2); }
.op-notif-list { flex: 1; overflow-y: auto; padding: 6px; overscroll-behavior: contain; }
.op-notif-alert { display: flex; gap: 10px; margin: 4px 4px 8px; padding: 12px; border-radius: 12px; background: var(--berry-red-light); }
.op-notif-alert .icon { width: 34px; height: 34px; min-width: 34px; display: grid; place-items: center; border-radius: 10px; background: var(--berry-red); color: #FFFFFF; }
.op-notif-alert .t { font-size: 13.5px; font-weight: 700; color: var(--berry-red); }
.op-notif-alert .m { margin-top: 2px; font-size: 12px; color: var(--berry-text-dark); line-height: 1.5; }
.op-notif-item { position: relative; width: 100%; display: flex; align-items: flex-start; gap: 12px; padding: 12px 30px 12px 12px; border: none; border-radius: 12px; background: transparent; font-family: inherit; text-align: left; cursor: pointer; transition: background 0.15s ease; }
.op-notif-item + .op-notif-item { margin-top: 2px; }
.op-notif-item:hover { background: var(--berry-bg); }
.op-notif-item.unread { background: #FFF8F5; }
.op-notif-item.unread:hover { background: var(--berry-purple-light); }
.op-notif-item .icon { width: 38px; height: 38px; min-width: 38px; display: grid; place-items: center; border-radius: 12px; }
.op-notif-item .icon.tone-red { background: var(--berry-red-light); color: var(--berry-red); }
.op-notif-item .icon.tone-orange { background: var(--berry-purple-light); color: var(--berry-purple); }
.op-notif-item .icon.tone-green { background: var(--berry-green-light); color: var(--berry-green); }
.op-notif-item .icon.tone-amber { background: var(--berry-amber-light); color: var(--berry-amber); }
.op-notif-item .icon.tone-blue { background: var(--berry-blue-light); color: var(--berry-blue); }
.op-notif-item .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.op-notif-item .t { font-size: 13.5px; font-weight: 600; color: var(--berry-text-dark); line-height: 1.4; }
.op-notif-item.unread .t { font-weight: 700; }
.op-notif-item .m { font-size: 12.5px; color: var(--berry-text-muted); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.op-notif-item .meta { display: inline-flex; align-items: center; gap: 4px; margin-top: 3px; font-size: 11.5px; color: #A3A7BA; }
.op-notif-item .unread-dot { position: absolute; top: 18px; right: 12px; width: 8px; height: 8px; border-radius: 50%; background: var(--berry-purple); box-shadow: 0 0 0 3px var(--berry-purple-light); }
.op-notif-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 36px 20px; text-align: center; }
.op-notif-empty .icon { width: 60px; height: 60px; display: grid; place-items: center; margin-bottom: 8px; border-radius: 50%; background: var(--berry-amber-light); color: var(--berry-amber); }
.op-notif-empty .t { font-size: 14.5px; font-weight: 600; color: var(--berry-text-dark); }
.op-notif-empty .m { font-size: 12.5px; color: var(--berry-text-muted); line-height: 1.5; max-width: 240px; }
.op-notif-foot { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 13px; border: none; border-top: 1px solid var(--berry-border); background: var(--berry-paper); color: var(--berry-purple); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.op-notif-foot:hover { background: var(--berry-purple-light); }

@media (max-width: 600px) {
  .op-notif-backdrop { display: block; position: fixed; inset: 64px 0 0 0; z-index: 999; background: rgba(29,31,47,0.35); animation: berryFadeIn 0.2s ease-out; }
  .op-notif-panel { position: fixed; top: 72px; left: 10px; right: 10px; width: auto; max-height: calc(100vh - 92px); border-radius: 18px; transform-origin: top center; }
}
`;