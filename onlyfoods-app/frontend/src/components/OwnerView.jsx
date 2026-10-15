import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

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

// วันเดียว = รายชั่วโมง 24 จุด ; หลายวัน = รายวัน
// วันเดียว = รายชั่วโมง (เฉพาะช่วงเวลาทำการของศูนย์อาหาร) ; หลายวัน = รายวัน
function buildBuckets(completedOrders, period, hourRange) {
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
    bucket.sales += Number(order.TotalAmount || 0);
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
function summarizeOrders(orders) {
  const completed = orders.filter(o => orderIs(o, 'Completed'));
  const cancelled = orders.filter(o => orderIs(o, 'Cancelled'));
  const sum = (list) => list.reduce((acc, o) => acc + Number(o.TotalAmount || 0), 0);
  const sales = sum(completed);
  const finished = completed.length + cancelled.length;
  return {
    sales,                                           // ยอดขายสุทธิ (เฉพาะออเดอร์สำเร็จ)
    grossSales: sales + sum(cancelled),              // มูลค่าออเดอร์รวมก่อนหักยกเลิก
    completedCount: completed.length,
    cancelledCount: cancelled.length,
    cancelRate: finished ? (cancelled.length / finished) * 100 : null, // ยกเลิก / (สำเร็จ + ยกเลิก)
    avgOrder: completed.length ? sales / completed.length : 0,
    completed,
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
function buildStoreReport(orders, storeId, period, hourRange) {
  const inRange = (start, end) => (orders || []).filter(order => {
    const createdAt = parseOrderDate(order.CreatedAt);
    return createdAt && createdAt >= start && createdAt < end && String(order.StoreId) === String(storeId);
  });
  const prevStart = new Date(period.start);
  prevStart.setDate(prevStart.getDate() - period.days);
  const currentOrders = inRange(period.start, period.end);
  const previousOrders = inRange(prevStart, period.start);
  const now = summarizeOrders(currentOrders);
  const before = summarizeOrders(previousOrders);
  return {
    now,
    before,
    hasPreviousData: previousOrders.length > 0,
    menus: summarizeMenus(now.completed),
    buckets: buildBuckets(now.completed, period, hourRange),
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
            ยกเลิก
          </button>
          <button type="button" className="berry-confirm-btn danger" onClick={onConfirm} disabled={busy}>
            {busy ? <span className="berry-spinner" /> : <Icon name={state.icon || 'trash'} size={16} />}
            {busy ? (state.busyText || 'กำลังลบ...') : state.confirmText || 'ยืนยันการลบ'}
          </button>
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

function ImageCropper({ src, onCancel, onConfirm }) {
  const [natural, setNatural] = useState(null); // { w, h }
  const [loadError, setLoadError] = useState('');
  const [ratioId, setRatioId] = useState('4:3');
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [frameW, setFrameW] = useState(440);
  const [busy, setBusy] = useState(false);
  const stageRef = useRef(null);
  const dragRef = useRef(null);

  const ratio = (CROP_RATIOS.find(r => r.id === ratioId) || CROP_RATIOS[0]).value;
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
      const outW = Math.max(1, Math.round(Math.min(CROP_OUTPUT_MAX, sw)));
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
      <div className="crop-modal" role="dialog" aria-modal="true" aria-label="ครอปรูปเมนู" onClick={e => e.stopPropagation()}>
        <div className="crop-head">
          <div>
            <h3>ครอปรูปเมนู</h3>
            <p>ลากรูปเพื่อจัดตำแหน่ง และซูมให้ได้ส่วนที่ต้องการ</p>
          </div>
          <div className="crop-ratios" role="group" aria-label="สัดส่วนรูป">
            {CROP_RATIOS.map(r => (
              <button key={r.id} type="button" className={ratioId === r.id ? 'active' : ''} onClick={() => setRatioId(r.id)} disabled={busy}>
                {r.label}
              </button>
            ))}
          </div>
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
  const [loaded, setLoaded] = useState({ history: false, products: false, dash: false });
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
  const notifRef = useRef(null);

  const [notifications, setNotifications] = useState([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const [unreadCancels, setUnreadCancels] = useState(0);
  const [knownCancelsCount, setKnownCancelsCount] = useState(0);
  const isFirstFetch = useRef(true);

  // --- Modal States ---
  // menuModal: null | { mode: 'add' } | { mode: 'edit', product }
  const [menuModal, setMenuModal] = useState(null);

  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [newStaff, setNewStaff] = useState({ username: '', password: '', fullName: '', role: 'Front Staff' });

  // --- Filter States ---
  const [reviewFilter, setReviewFilter] = useState('all');
  const [issueFilter, setIssueFilter] = useState('all');

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
    fetch(`${apiBase}/api/stores/${storeId}/reviews`).then(r => r.json()).then(d => setReviewsData(d)).catch(err => console.error(err));
    fetch(`${apiBase}/api/reports/issue/store/${storeId}`).then(r => r.json()).then(d => setIssues(Array.isArray(d) ? d : [])).catch(err => console.error(err));
    
    fetch(`${apiBase}/api/reports/cancellations?store_id=${storeId}`)
      .then(r => r.json())
      .then(data => {
        setCancels(data);
        if (isFirstFetch.current) {
          setKnownCancelsCount(data.length);
          isFirstFetch.current = false;
        }
      });

    fetch(`${apiBase}/api/products?store_id=${storeId}`).then(r => r.json()).then(d => { setProducts(Array.isArray(d) ? d : []); markLoaded('products'); }).catch(err => console.error(err));
    fetch(`${apiBase}/api/orders?store_id=${storeId}`).then(r => r.json()).then(d => { setHistory(Array.isArray(d) ? d : []); markLoaded('history'); }).catch(err => console.error(err));
    fetch(`${apiBase}/api/stores/${storeId}/staff`).then(r => r.json()).then(setStaffList).catch(err => console.error(err));

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
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [storeId, apiBase, uid]);

  useEffect(() => {
    if (history) {
      const hourRange = foodCourtHours ? hoursFromSchedule(foodCourtHours.open, foodCourtHours.close) : null;
      setStoreReport(buildStoreReport(history, storeId, storePeriod, hourRange));
    }
  }, [history, storeId, storeDays, storeAnchor, customRange, customStart, customEnd, foodCourtHours]);

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
      waiting: count('Verifying_Slip', 'Pending'),
      cooking: count('Cooking'),
      ready: count('Ready'),
      outOfStock: (products || []).filter(p => p.IsOutOfStock).length,
      todayOrders: todayOrders.length,
    };
  }, [history, products]);

  useEffect(() => {
    if (!isFirstFetch.current && cancels.length > knownCancelsCount) {
      if (page !== 'cancel') {
        setUnreadCancels(cancels.length - knownCancelsCount);
      } else {
        setKnownCancelsCount(cancels.length);
      }
    }
  }, [cancels.length, page, knownCancelsCount]);

  useEffect(() => {
    if (page === 'cancel') {
      setUnreadCancels(0);
      setKnownCancelsCount(cancels.length);
    }
  }, [page, cancels.length]);

  const markNotifRead = (notifId) => {
    fetch(`${apiBase}/api/notifications/${notifId}/read`, { method: 'PUT' }).then(() => fetchData());
  };

  const showToast = (msg) => {
    setToast({ show: true, msg });
    clearTimeout(window.__avxToastTimer);
    window.__avxToastTimer = setTimeout(() => setToast({ show: false, msg: '' }), 2600);
  };

  const toggleStore = async () => {
    try {
      const res = await fetch(`${apiBase}/api/stores/${storeId}/toggle`, { method: 'PUT' });
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
  const requestToggleStore = () => {
    if (toggleDisabled) return;
    if (!storeOpen) { toggleStore(); return; }
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
      targets.map(p => fetch(`${apiBase}/api/products/${p.ProductId}/toggle-stock`, { method: 'PUT' })
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

  const toggleStock = (id, pName, isOutOfStock) => {
    fetch(`${apiBase}/api/products/${id}/toggle-stock`, { method: 'PUT' }).then(() => {
      fetchData();
      showToast(`อัปเดตสถานะ "${pName}" เป็น ${isOutOfStock ? 'มีสินค้า' : 'สินค้าหมด'} แล้ว`);
    });
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
    const url = type === 'staff' ? `${apiBase}/api/staff/${id}` : `${apiBase}/api/products/${id}`;
    setDeleting(true);
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.message || (type === 'staff' ? 'เกิดข้อผิดพลาดในการลบพนักงาน' : 'เกิดข้อผิดพลาดในการลบเมนู'));
      }
      setConfirmDelete(null);
      showSuccess('ลบสำเร็จ', type === 'staff' ? `ลบพนักงาน "${name}" เรียบร้อยแล้ว` : `ลบเมนู "${name}" เรียบร้อยแล้ว`);
      fetchData();
    } catch (err) {
      console.error(err);
      setConfirmDelete(null);
      showToast(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiBase}/api/stores/${storeId}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStaff)
      });
      if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Failed to add staff');
      }
      showToast('เพิ่มพนักงานสำเร็จ');
      setNewStaff({ username: '', password: '', fullName: '', role: 'Front Staff' });
      setIsStaffModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const handleDeleteStaff = (userId, name) => {
    setConfirmDelete({
      type: 'staff', id: userId, name,
      title: 'ลบพนักงานคนนี้?',
      prefix: 'คุณต้องการลบพนักงาน',
      suffix: 'ออกจากระบบใช่หรือไม่',
      confirmText: 'ลบพนักงาน',
    });
  };

  const handleLogout = () => {
    if (onLogout) onLogout();
  };

  const navItemsAll = [
    { id: 'dashboard', label: 'Dashboard', caption: 'ภาพรวมร้านค้า', icon: 'dashboard' },
    { id: 'menu', label: 'Manage Menu', caption: 'จัดการเมนู/สต็อก', icon: 'menu' },
    { id: 'staff', label: 'Manage Staff', caption: 'จัดการพนักงาน', icon: 'users' },
    { id: 'history', label: 'Sales History', caption: 'ประวัติการขาย', icon: 'history' },
    { id: 'cancel', label: 'Cancellations', caption: 'ประวัติยกเลิกออเดอร์', icon: 'cancel', badge: unreadCancels > 0 ? unreadCancels : null },
    { id: 'reviews', label: 'Customer Reviews', caption: 'รีวิวจากลูกค้า', icon: 'star' },
    { id: 'issues', label: 'Issue Reports', caption: 'ประวัติการแจ้งปัญหา', icon: 'alert' },
  ];
  const navById = Object.fromEntries(navItemsAll.map(n => [n.id, n]));
  const navGroups = [
    { label: 'ภาพรวม', items: ['dashboard'] },
    { label: 'จัดการร้าน', items: ['menu', 'staff'] },
    { label: 'ประวัติและความคิดเห็น', items: ['history', 'cancel', 'reviews', 'issues'] },
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

  const getReviewCount = (star) => (reviewsData.reviews || []).filter(r => String(r.Rating) === String(star)).length;
  const filteredReviews = reviewFilter === 'all' ? (reviewsData.reviews || []) : (reviewsData.reviews || []).filter(r => String(r.Rating) === reviewFilter);
  
  const issueTypes = [...new Set(issues.map(i => i.IssueType))].filter(Boolean);
  const getIssueCount = (type) => issues.filter(i => i.IssueType === type).length;
  const filteredIssues = issueFilter === 'all' ? issues : issues.filter(i => i.IssueType === issueFilter);

  return (
    <div className="berry-root">
      <style>{BERRY_STYLES}</style>
      
      {/* ===== TOPBAR (HEADER) ===== */}
      <header className="berry-topbar">
        <div className="berry-topbar-left">
          <button className="berry-icon-btn purple-light" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label={sidebarOpen ? 'ซ่อนแถบเมนู' : 'แสดงแถบเมนู'}>
            <Icon name="menu" size={19} />
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
              className="berry-icon-btn amber-light" 
              onClick={() => setNotifOpen(!notifOpen)}
              style={{ position: 'relative' }}
            >
              <Icon name="bell" size={20} />
              {totalBadgeUnread > 0 && (
                <span className="notif-badge-top">
                  {totalBadgeUnread}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="berry-profile-dropdown" style={{ right: '0', width: '320px', padding: '0', zIndex: 1000 }}>
                <div className="dropdown-header" style={{ padding: '16px', borderBottom: '1px solid var(--berry-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    การแจ้งเตือน
                    {totalBadgeUnread > 0 && <Badge tone="danger">{totalBadgeUnread} ใหม่</Badge>}
                  </h4>
                </div>
                
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {notifications.length > 0 || cancels.length > 0 || isSuspended ? (
                    <>
                      {isSuspended && (
                        <div 
                          key="notif-suspended" 
                          style={{ padding: '12px 16px', borderBottom: '1px solid var(--berry-border)', cursor: 'default', background: 'var(--berry-red-light)' }} 
                        >
                          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--berry-red)' }}>
                            ⚠️ ร้านค้าของคุณถูกระงับสิทธิ์
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--berry-text-dark)', marginTop: '4px' }}>
                            คุณไม่สามารถเปิดรับออเดอร์ใหม่ได้ กรุณาติดต่อผู้ดูแลระบบ (Executive)
                          </div>
                        </div>
                      )}

                      {notifications.map(n => (
                        <div 
                          key={`notif-${n.NotifId}`} 
                          style={{ padding: '12px 16px', borderBottom: '1px solid var(--berry-border)', cursor: 'pointer', background: n.IsRead ? 'transparent' : 'var(--berry-purple-light)' }} 
                          className="notif-item-hover"
                          onClick={() => markNotifRead(n.NotifId)}
                        >
                          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--berry-text-dark)' }}>
                            {n.Message}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--berry-text-muted)', marginTop: '6px' }}>
                            {n.CreatedAt ? new Date(n.CreatedAt).toLocaleString('th-TH') : '-'}
                          </div>
                        </div>
                      ))}

                      {cancels.slice(0, 5).map(c => (
                        <div 
                          key={`cancel-${c.OrderID}`} 
                          style={{ padding: '12px 16px', borderBottom: '1px solid var(--berry-border)', cursor: 'pointer' }} 
                          className="notif-item-hover"
                          onClick={() => { setPage('cancel'); setNotifOpen(false); }}
                        >
                          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--berry-text-dark)' }}>
                            ออเดอร์ถูกยกเลิก (คิว: {c.QueueNo})
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--berry-text-muted)', marginTop: '4px' }}>
                            เหตุผล: {c.CancelReason || '-'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--berry-text-muted)', marginTop: '6px' }}>
                            {c.CreatedAt ? new Date(c.CreatedAt).toLocaleString('th-TH') : '-'}
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--berry-text-muted)', fontSize: '13px' }}>
                      ไม่มีการแจ้งเตือนใหม่
                    </div>
                  )}
                </div>
                
                <div 
                  style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: 'var(--berry-purple)', cursor: 'pointer', fontWeight: '600', borderTop: '1px solid var(--berry-border)' }} 
                  onClick={() => { setPage('cancel'); setNotifOpen(false); }}
                >
                  ดูประวัติยกเลิกทั้งหมด
                </div>
              </div>
            )}
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
                  <span className="muted">อัปเดตอัตโนมัติ · วันนี้ {fmtMoney(liveStats.todayOrders)} ออเดอร์</span>
                </div>
                <div className="od-live-grid">
                  {live.map(item => (
                    <button key={item.key} type="button" className={`od-live-item tone-${item.tone} ${item.value > 0 ? 'has' : ''}`} onClick={() => {
                      if (item.go === 'menu') setMenuFilter(item.key === 'out' ? 'out' : 'all');
                      setPage(item.go);
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
                      <DeltaChip solid delta={changePct(now.sales, before.sales)} label={compareLabel} hasPreviousData={hasPrev} />
                    </div>
                    <div className="od-summary-divider" />
                    <div className="od-summary-block">
                      <div className="od-summary-label"><Icon name="check" size={16} /> ออเดอร์สำเร็จ</div>
                      <div className="od-summary-value">{fmtMoney(now.completedCount)}<small>ออเดอร์</small></div>
                      <DeltaChip solid delta={changePct(now.completedCount, before.completedCount)} label={compareLabel} hasPreviousData={hasPrev} />
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

          {page === 'staff' && (
            <>
            <PageHeader title="จัดการพนักงาน" subtitle={`บัญชีพนักงานหน้าร้านและคนครัว · ${staffList.length} คน`} icon="users">
              <button className="berry-btn btn-primary" onClick={() => setIsStaffModalOpen(true)}>
                <Icon name="plus" size={16} /> เพิ่มพนักงาน
              </button>
            </PageHeader>
            <div className="berry-card">

              <div className="berry-table-container">
                <table className="berry-table">
                  <thead>
                    <tr>
                      <th>รหัส</th>
                      <th>ชื่อผู้ใช้</th>
                      <th>ชื่อ-นามสกุล</th>
                      <th>ตำแหน่ง</th>
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.length === 0 && <tr><td colSpan="5" className="empty-state">ยังไม่มีบัญชีพนักงาน</td></tr>}
                    {staffList.map(s => (
                      <tr key={s.UserId}>
                        <td className="mono muted" data-label="รหัส">#{s.UserId}</td>
                        <td className="bold" data-label="ชื่อผู้ใช้">{s.Username}</td>
                        <td data-label="ชื่อ-นามสกุล">{s.FullName}</td>
                        <td data-label="ตำแหน่ง">
                          <Badge tone={s.Role === 'Front Staff' ? 'primary' : 'warning'}>
                            {s.Role === 'Front Staff' ? 'หน้าร้าน (Front)' : 'คนครัว (Kitchen)'}
                          </Badge>
                        </td>
                        <td data-label="จัดการ" className="op-td-actions">
                          <button 
                            className="berry-btn-icon btn-error-light" 
                            title="ลบพนักงาน"
                            onClick={() => handleDeleteStaff(s.UserId, s.FullName)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}

          {page === 'history' && (
            <>
            <PageHeader title="ประวัติการขาย" subtitle="ออเดอร์ทั้งหมดของร้าน เรียงจากล่าสุด" icon="history">
              <span className="op-count-chip">{fmtMoney(history.length)} ออเดอร์</span>
            </PageHeader>
            <div className="berry-card">
              <div className="berry-table-container">
                <table className="berry-table">
                  <thead>
                    <tr>
                      <th>วันที่ / เวลา</th>
                      <th>คิว</th>
                      <th>รายการอาหาร</th>
                      <th>ยอดรวม</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 && <tr><td colSpan="5" className="empty-state">{loaded.history ? 'ยังไม่มีประวัติการขาย' : 'กำลังโหลดข้อมูล...'}</td></tr>}
                    {history.map(h => (
                      <tr key={h.OrderID}>
                        <td className="mono muted" data-label="วันที่ / เวลา">
                          {h.CreatedAt ? new Date(h.CreatedAt).toLocaleString('th-TH') : '-'}
                        </td>
                        <td className="mono" data-label="คิว" style={{ color: 'var(--berry-purple)', fontWeight: '600' }}>{h.QueueNo}</td>
                        <td data-label="รายการอาหาร" className="op-td-block">
                          {h.items?.map((item, idx) => (
                            <div key={idx} style={{ fontSize: '13px', marginBottom: '4px', color: 'var(--berry-text-dark)' }}>
                              • {item.ProductName} <span style={{ color: 'var(--berry-text-muted)' }}>(x{item.Qty})</span>
                            </div>
                          ))}
                        </td>
                        <td className="mono bold" data-label="ยอดรวม">฿{fmtMoney(h.TotalAmount)}</td>
                        <td data-label="สถานะ">
                          <Badge tone={h.Status === 'Completed' ? 'success' : h.Status === 'Cancelled' ? 'danger' : 'warning'}>
                            {getStatusLabel(h.Status)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}

          {page === 'cancel' && (
            <>
            <PageHeader title="ประวัติการยกเลิกออเดอร์" subtitle="ออเดอร์ที่ถูกยกเลิกพร้อมเหตุผล" icon="cancel">
              <span className="op-count-chip danger">{fmtMoney(cancels.length)} ออเดอร์</span>
            </PageHeader>
            <div className="berry-card">
              <div className="berry-table-container">
                <table className="berry-table">
                  <thead>
                    <tr>
                      <th>วันที่ / เวลา</th>
                      <th>คิว</th>
                      <th>ยอดรวม</th>
                      <th>เหตุผลที่ยกเลิก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancels.length === 0 && <tr><td colSpan="4" className="empty-state">ยังไม่มีออเดอร์ที่ถูกยกเลิก</td></tr>}
                    {cancels.map(c => (
                      <tr key={c.OrderID}>
                        <td className="mono muted" data-label="วันที่ / เวลา">
                          {c.CreatedAt ? new Date(c.CreatedAt).toLocaleString('th-TH') : '-'}
                        </td>
                        <td className="mono" data-label="คิว" style={{ color: 'var(--berry-purple)', fontWeight: '600' }}>{c.QueueNo}</td>
                        <td className="mono bold" data-label="ยอดรวม">฿{fmtMoney(c.TotalAmount)}</td>
                        <td data-label="เหตุผล" style={{ color: 'var(--berry-red)', fontWeight: '500' }}>{c.CancelReason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}

          {page === 'reviews' && (
            <>
            <PageHeader title="รีวิวจากลูกค้า" subtitle="คะแนนและความคิดเห็นที่ลูกค้าให้ร้านของคุณ" icon="star">
              <div className="op-rating-chip">
                <span className="star">★</span>
                <strong>{reviewsData.summary?.average?.toFixed(1) || '0.0'}</strong>
                <span>/ 5 · {fmtMoney((reviewsData.reviews || []).length)} รีวิว</span>
              </div>
            </PageHeader>
            <div className="berry-card">
              {/* ปุ่มกรองคะแนน */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '0 0 16px', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--berry-text-muted)', marginRight: '4px' }}>กรองคะแนน:</span>
                <button 
                  onClick={() => setReviewFilter('all')} 
                  className={`berry-period-btn ${reviewFilter === 'all' ? 'active' : ''}`} 
                  style={{ border: reviewFilter === 'all' ? '1px solid var(--berry-purple)' : '1px solid var(--berry-border)', borderRadius: '20px', padding: '6px 14px' }}
                >
                  ทั้งหมด ({(reviewsData.reviews || []).length})
                </button>
                {[5, 4, 3, 2, 1].map(star => (
                  <button 
                    key={star} 
                    onClick={() => setReviewFilter(String(star))} 
                    className={`berry-period-btn ${reviewFilter === String(star) ? 'active' : ''}`} 
                    style={{ border: reviewFilter === String(star) ? '1px solid var(--berry-purple)' : '1px solid var(--berry-border)', borderRadius: '20px', padding: '6px 14px' }}
                  >
                    {star} ★ ({getReviewCount(star)})
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {filteredReviews.length === 0 ? (
                  <div className="empty-state">ไม่มีรีวิวในหมวดหมู่นี้</div>
                ) : (
                  filteredReviews.map(r => (
                    <div key={r.ReviewId} style={{ padding: '16px 0', borderBottom: '1px solid var(--berry-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--berry-text-dark)' }}>
                        {r.ReviewerName || "P'1"}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: 'var(--berry-amber)', fontSize: '16px', letterSpacing: '2px' }}>
                          {'★'.repeat(r.Rating)}{'☆'.repeat(5 - r.Rating)}
                        </span>
                        <span style={{ color: 'var(--berry-text-muted)', fontSize: '12px' }}>
                          {new Date(r.CreatedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} · {new Date(r.CreatedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            </>
          )}

          {page === 'issues' && (
            <>
            <PageHeader title="รายงานปัญหาจากลูกค้า" subtitle="ปัญหาที่ลูกค้าแจ้งเข้ามาเกี่ยวกับร้านของคุณ" icon="alert">
              <span className="op-count-chip">{fmtMoney(issues.length)} รายการ</span>
            </PageHeader>
            <div className="berry-card">
              {/* ปุ่มกรองประเภทปัญหา */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '0 0 16px', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--berry-text-muted)', marginRight: '4px' }}>ประเภทปัญหา:</span>
                <button 
                  onClick={() => setIssueFilter('all')} 
                  className={`berry-period-btn ${issueFilter === 'all' ? 'active' : ''}`} 
                  style={{ border: issueFilter === 'all' ? '1px solid var(--berry-purple)' : '1px solid var(--berry-border)', borderRadius: '20px', padding: '6px 14px' }}
                >
                  ทั้งหมด ({issues.length})
                </button>
                {issueTypes.map(type => (
                  <button 
                    key={type} 
                    onClick={() => setIssueFilter(type)} 
                    className={`berry-period-btn ${issueFilter === type ? 'active' : ''}`} 
                    style={{ border: issueFilter === type ? '1px solid var(--berry-purple)' : '1px solid var(--berry-border)', borderRadius: '20px', padding: '6px 14px' }}
                  >
                    {type} ({getIssueCount(type)})
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {filteredIssues.length === 0 ? (
                  <div className="empty-state">ไม่มีรายงานปัญหาในหมวดหมู่นี้</div>
                ) : (
                  filteredIssues.map(issue => (
                    <div key={issue.ReportID} style={{ border: '1px solid var(--berry-border)', borderRadius: '12px', padding: '16px', background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontWeight: '600', color: 'var(--berry-text-dark)', fontSize: '15px' }}>{issue.IssueType}</span>
                            {issue.QueueNo ? (
                              <span style={{ background: 'var(--berry-blue-light)', color: 'var(--berry-text-muted)', padding: '2px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: '500' }}>คิว {issue.QueueNo}</span>
                            ) : issue.OrderID ? (
                              <span style={{ background: 'var(--berry-blue-light)', color: 'var(--berry-text-muted)', padding: '2px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: '500' }}>คิว OF-{issue.OrderID}</span>
                            ) : null}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--berry-text-muted)', marginBottom: '12px' }}>
                            ผู้แจ้ง: {issue.CustomerName || "P'1"} · ออเดอร์ #{issue.OrderID}
                          </div>
                        </div>
                        <div style={{ color: 'var(--berry-text-muted)', fontSize: '13px' }}>
                          {new Date(issue.CreatedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} · {new Date(issue.CreatedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ fontSize: '14px', color: 'var(--berry-text-dark)', lineHeight: '1.5' }}>
                        {issue.Description || "-"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            </>
          )}

        </main>
      </div>

      {/* ===== ADD STAFF MODAL ===== */}
      {isStaffModalOpen && (
        <div className="berry-modal-overlay">
          <div className="berry-modal">
            <h3>Add New Staff</h3>
            <form onSubmit={handleAddStaff}>
              <div className="berry-form-group">
                <label>Username (ชื่อผู้ใช้เข้าสู่ระบบ)</label>
                <input 
                  type="text" 
                  value={newStaff.username} 
                  onChange={e => setNewStaff({...newStaff, username: e.target.value})} 
                  placeholder="เช่น front01"
                  required 
                />
              </div>
              <div className="berry-form-group">
                <label>Password (รหัสผ่าน)</label>
                <input 
                  type="password" 
                  value={newStaff.password} 
                  onChange={e => setNewStaff({...newStaff, password: e.target.value})} 
                  placeholder="รหัสผ่าน"
                  required 
                />
              </div>
              <div className="berry-form-group">
                <label>Full Name (ชื่อ-นามสกุล)</label>
                <input 
                  type="text" 
                  value={newStaff.fullName} 
                  onChange={e => setNewStaff({...newStaff, fullName: e.target.value})} 
                  placeholder="เช่น สมหมาย หน้าร้าน"
                  required 
                />
              </div>
              <div className="berry-form-group">
                <label>Role (ตำแหน่ง)</label>
                <select 
                  className="berry-select"
                  value={newStaff.role} 
                  onChange={e => setNewStaff({...newStaff, role: e.target.value})}
                >
                  <option value="Front Staff">พนักงานหน้าร้าน (Front Staff)</option>
                  <option value="Kitchen Staff">คนครัว (Kitchen Staff)</option>
                </select>
              </div>
              
              <div className="berry-modal-actions">
                <button type="button" className="berry-btn btn-error-light" onClick={() => setIsStaffModalOpen(false)}>Cancel</button>
                <button type="submit" className="berry-btn btn-primary">Save Staff</button>
              </div>
            </form>
          </div>
        </div>
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
.berry-icon-btn.purple-light:hover { background: var(--berry-purple); color: white; }
.berry-icon-btn.amber-light { background: var(--berry-amber-light); color: var(--berry-amber); }
.berry-icon-btn.amber-light:hover { background: var(--berry-amber); color: white; }

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
`;