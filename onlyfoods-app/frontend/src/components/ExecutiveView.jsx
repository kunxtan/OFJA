import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

/* ============================================================
   OF Executive — แดชบอร์ดผู้บริหาร (Berry Theme Layout + Exec Colors)
   ============================================================ */

const fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const money2 = (v) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

const ORDER_TIME_IS_UTC = true;
const MAX_IMAGE_MB = 5;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const FONT_STACK = '"Roboto", "Sarabun", sans-serif';
const FOOD_CATEGORIES = ['อาหารจานเดียว', 'ก๋วยเตี๋ยว / เส้น', 'ตามสั่ง', 'อาหารอีสาน', 'เครื่องดื่ม', 'ของหวาน / เบเกอรี', 'ทานเล่น', 'อื่น ๆ'];

// --- Utils ---
function pad2(n) { return String(n).padStart(2, '0'); }
function toISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function todayISO() { return toISODate(new Date()); }
function nowStamp() { const d = new Date(); return `${toISODate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }

function parseOrderDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const normalized = String(value).trim().replace(' ', 'T');
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(hasTz || !ORDER_TIME_IS_UTC ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function thaiDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d.getDate()} ${m[d.getMonth()]} ${(d.getFullYear() + 543) % 100}`;
}

function thaiDateTime(value) {
  const d = parseOrderDate(value);
  if (!d) return '-';
  const m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d.getDate()} ${m[d.getMonth()]} ${(d.getFullYear() + 543) % 100} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function shortNumber(value) {
  const n = Number(value) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

function periodBounds(anchorISO, days) {
  const end = new Date(`${anchorISO}T00:00:00`);
  end.setDate(end.getDate() + 1);
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { start, end };
}

function previousBounds(anchorISO, days) {
  const { start } = periodBounds(anchorISO, days);
  const prevEnd = new Date(start);
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - days);
  return { start: prevStart, end: prevEnd };
}

const statusIs = (order, status) => String(order?.Status || '').toLowerCase() === status.toLowerCase();

function inRange(order, bounds, storeId = null) {
  const at = parseOrderDate(order.CreatedAt);
  if (!at) return false;
  if (at < bounds.start || at >= bounds.end) return false;
  if (storeId !== null && String(order.StoreId) !== String(storeId)) return false;
  return true;
}

const sumAmount = (orders) => orders.reduce((s, o) => s + Number(o.TotalAmount || 0), 0);

function changePct(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c === 0 ? 0 : null;
  const raw = ((c - p) / p) * 100;
  return Math.max(-100, Math.min(100, raw));
}

function summarize(orders) {
  const completed = orders.filter((o) => statusIs(o, 'Completed'));
  const cancelled = orders.filter((o) => statusIs(o, 'Cancelled'));
  const finished = completed.length + cancelled.length;
  const sales = sumAmount(completed);
  return {
    sales,
    completedCount: completed.length,
    cancelledCount: cancelled.length,
    cancelRate: finished ? (cancelled.length / finished) * 100 : 0,
    avgOrder: completed.length ? sales / completed.length : 0,
    completed,
    cancelled
  };
}

function buildBuckets(completedOrders, anchorISO, days) {
  const { start } = periodBounds(anchorISO, days);
  const buckets = [];

  if (days === 1) {
    for (let h = 0; h < 24; h += 1) {
      buckets.push({ key: `h${h}`, label: `${pad2(h)}:00`, sales: 0, count: 0, byStore: {} });
    }
    completedOrders.forEach((o) => {
      const at = parseOrderDate(o.CreatedAt);
      if (!at) return;
      const amount = Number(o.TotalAmount || 0);
      const b = buckets[at.getHours()];
      b.sales += amount;
      b.count += 1;
      const id = String(o.StoreId);
      if (!b.byStore[id]) b.byStore[id] = { name: o.StoreName || `ร้าน #${id}`, sales: 0 };
      b.byStore[id].sales += amount;
    });
    return buckets;
  }

  const indexByKey = {};
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
    if (idx !== undefined) {
      const amount = Number(o.TotalAmount || 0);
      const b = buckets[idx];
      b.sales += amount;
      b.count += 1;
      const id = String(o.StoreId);
      if (!b.byStore[id]) b.byStore[id] = { name: o.StoreName || `ร้าน #${id}`, sales: 0 };
      b.byStore[id].sales += amount;
    }
  });
  return buckets;
}

function bucketExtremes(bucket) {
  const rows = Object.values(bucket.byStore || {}).filter((r) => r.sales > 0);
  if (!rows.length) return { best: null, worst: null };
  const sorted = [...rows].sort((a, b) => b.sales - a.sales);
  return { best: sorted[0], worst: sorted.length > 1 ? sorted[sorted.length - 1] : null };
}

function summarizeMenus(completedOrders) {
  const map = {};
  completedOrders.forEach((o) => {
    (o.items || []).forEach((it) => {
      const name = it.ProductName || `สินค้า #${it.ProductId}`;
      if (!map[name]) map[name] = { name, qty: 0, amount: 0 };
      map[name].qty += Number(it.Qty || 0);
      map[name].amount += Number(it.Qty || 0) * Number(it.UnitPrice || 0);
    });
  });
  const rows = Object.values(map);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  rows.forEach((r) => { r.share = total ? (r.amount / total) * 100 : 0; });
  return rows.sort((a, b) => b.amount - a.amount);
}

function toneOf(delta) {
  if (delta === null || delta === undefined) return 'flat';
  return delta >= 0 ? 'up' : 'down';
}

function describeDelta(delta, label) {
  if (delta === null || delta === undefined) return 'ไม่มีข้อมูลช่วงก่อนหน้า';
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% ${label}`;
}

async function callApi(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบว่า backend รันอยู่');
  }
  let data = null;
  const raw = await response.text();
  try { data = raw ? JSON.parse(raw) : null; } catch (err) {}
  if (!response.ok) {
    const detail = data && (data.detail || data.message);
    throw new Error(typeof detail === 'string' ? detail : `ทำรายการไม่สำเร็จ (HTTP ${response.status})`);
  }
  return data;
}

// --- Icons ---
function Icon({ name, size = 20 }) {
  const paths = {
    dashboard: <><path d="M4 4h6v8H4z" /><path d="M4 16h6v4H4z" /><path d="M14 12h6v8h-6z" /><path d="M14 4h6v4h-6z" /></>,
    trend: <><path d="M3 17l6-6 4 4 8-8M21 7v5h-5" /></>,
    store: <><path d="M3 21l18 0" /><path d="M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4" /><path d="M5 21l0 -10.15" /><path d="M19 21l0 -10.15" /><path d="M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4" /></>,
    account: <><path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" /></>,
    menu: <><path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" /></>,
    cancel: <><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M9 12l6 0" /></>,
    history: <><path d="M12 8l0 4l2 2" /><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" /></>,
    check: <><path d="M5 12l5 5l10 -10" /></>,
    power: <><path d="M7 6a7.75 7.75 0 1 0 10 0" /><line x1="12" y1="4" x2="12" y2="12" /></>,
    settings: <><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0 -2.573-1.066c-1.543 .94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0 -1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543 .826-3.31 2.37-2.37c1 .608 2.296 .07 2.572-1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></>,
    bell: <><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/></>,
    user: <><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></>,
    logout: <><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></>,
    plus: <><path d="M12 5l0 14" /><path d="M5 12l14 0" /></>,
    trash: <><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></>,
    edit: <><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" /></>,
    search: <><path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></>,
    download: <><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" /></>,
    calendar: <><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z" /><path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h16" /><path d="M11 15h1" /><path d="M12 15v3" /></>,
    info: <><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 9h.01" /><path d="M11 12h1v4h1" /></>,
    ban: <><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M5.7 5.7l12.6 12.6" /></>,
    key: <><path d="M14 7a4 4 0 1 1 -3.6 5.8l-6.4 6.2v3h3l1 -1h2v-2h2v-2l1.4 -1.4a4 4 0 0 1 1.6 -8.6z" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths['info']}</svg>;
}

function Badge({ tone, children }) {
  return <span className={`berry-badge tone-${tone}`}>{children}</span>;
}

// --- Components ย่อย ---
function PeriodButtons({ days, setDays, anchor, setAnchor }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      <div className="berry-date-picker">
        <Icon name="calendar" size={16} />
        <input type="date" value={anchor} max={todayISO()} onChange={(e) => setAnchor(e.target.value || todayISO())} />
      </div>
      <div style={{ display: 'flex', gap: '4px', background: 'var(--berry-purple-light)', padding: '4px', borderRadius: '8px' }}>
        {[1, 7, 14, 30].map(v => (
          <button key={v} type="button" onClick={() => setDays(v)} className={`berry-period-btn ${days === v ? 'active' : ''}`}>
            {v === 1 ? 'Today' : `${v} Days`}
          </button>
        ))}
      </div>
    </div>
  );
}

function DashboardSmallCard({ label, value, hint, icon, tone }) {
  return (
    <div className="berry-card berry-small-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div className={`berry-avatar-box tone-${tone}`}>
          <Icon name={icon} size={24} />
        </div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--berry-text-dark)' }}>{value}</div>
          <div style={{ color: 'var(--berry-text-muted)', fontSize: '13px', marginTop: '2px' }}>{label}</div>
          {hint && <div style={{ color: 'var(--berry-text-muted)', fontSize: '11.5px', marginTop: '4px' }}>{hint}</div>}
        </div>
      </div>
    </div>
  );
}

function SalesLineChart({ buckets, showStoreDetail = true }) {
  const [hover, setHover] = useState(null);
  const data = buckets || [];
  if (!data.length) return <div className="empty-state" style={{ minHeight: '260px' }}>ช่วงเวลานี้ยังไม่มีออเดอร์ที่สำเร็จ</div>;

  const W = 880, H = 320, L = 66, R = 22, TOP = 22, BOT = 46;
  const gw = W - L - R, gh = H - TOP - BOT;
  const maxValue = Math.max(...data.map((b) => b.sales), 1);
  const xAt = (i) => (data.length === 1 ? L + gw / 2 : L + (i / (data.length - 1)) * gw);
  const yAt = (v) => TOP + gh - (v / maxValue) * gh;

  const linePath = data.map((b, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(b.sales)}`).join(' ');
  const areaPath = `${linePath} L ${xAt(data.length - 1)} ${TOP + gh} L ${xAt(0)} ${TOP + gh} Z`;
  const labelStep = Math.max(1, Math.ceil(data.length / 10));
  const hoverBucket = hover !== null ? data[hover] : null;
  const extremes = hoverBucket ? bucketExtremes(hoverBucket) : { best: null, worst: null };

  return (
    <div style={{ position: 'relative', marginTop: '10px' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="ofAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--berry-purple)" stopOpacity="0.26" />
            <stop offset="100%" stopColor="var(--berry-purple)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map((i) => {
          const ratio = i / 4, y = TOP + gh * ratio;
          return (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y} y2={y} stroke="var(--berry-border)" strokeDasharray="4 4" strokeWidth="1" />
              <text x={L - 12} y={y + 4} textAnchor="end" fontSize="11" fill="var(--berry-text-muted)">{shortNumber(maxValue * (1 - ratio))}</text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#ofAreaFill)" />
        <path d={linePath} fill="none" stroke="var(--berry-purple)" strokeWidth="2.4" strokeLinejoin="round" />

        {data.map((b, i) => (
          <g key={b.key}>
            {(i % labelStep === 0 || i === data.length - 1) && (
              <text x={xAt(i)} y={H - 16} textAnchor="middle" fontSize="11" fill="var(--berry-text-muted)">{b.label}</text>
            )}
            <circle cx={xAt(i)} cy={yAt(b.sales)} r={hover === i ? 5.5 : 3} fill={hover === i ? 'var(--berry-purple)' : 'var(--berry-paper)'} stroke="var(--berry-purple)" strokeWidth="2" />
            <rect x={xAt(i) - gw / Math.max(data.length, 1) / 2} y={TOP} width={Math.max(gw / Math.max(data.length, 1), 10)} height={gh} fill="transparent" onMouseEnter={() => setHover(i)} style={{ cursor: 'pointer' }} />
          </g>
        ))}
        {hover !== null && <line x1={xAt(hover)} x2={xAt(hover)} y1={TOP} y2={TOP + gh} stroke="var(--berry-purple)" strokeDasharray="4 4" strokeWidth="1" />}
        <line x1={L} x2={W - R} y1={TOP + gh} y2={TOP + gh} stroke="var(--berry-border)" />
      </svg>

      {hoverBucket && (
        <div className="berry-chart-tooltip" style={{ left: `${(xAt(hover) / W) * 100}%`, transform: xAt(hover) / W > 0.7 ? 'translateX(-92%)' : xAt(hover) / W < 0.3 ? 'translateX(-8%)' : 'translateX(-50%)' }}>
          <div style={{ color: 'var(--berry-text-dark)', fontWeight: 700, fontSize: '13px' }}>{hoverBucket.label}</div>
          <div style={{ color: 'var(--berry-text-muted)', fontSize: '13px', marginTop: '4px' }}>ยอดขาย {fmtMoney(hoverBucket.sales)} บาท · {fmtMoney(hoverBucket.count)} ออเดอร์</div>
          {showStoreDetail && (
            <div style={{ marginTop: '7px', borderTop: '1px solid var(--berry-border)', paddingTop: '7px' }}>
              {extremes.best ? (
                <div style={{ fontSize: '12.5px', color: 'var(--berry-text-dark)' }}>ขายดีสุด: <strong>{extremes.best.name}</strong> {fmtMoney(extremes.best.sales)} บาท</div>
              ) : <div style={{ fontSize: '12.5px', color: 'var(--berry-text-muted)' }}>ช่วงนี้ยังไม่มียอดขาย</div>}
              {extremes.worst && (
                <div style={{ fontSize: '12.5px', color: 'var(--berry-text-muted)', marginTop: '2px' }}>น้อยสุด: {extremes.worst.name} {fmtMoney(extremes.worst.sales)} บาท</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StoreDonutChart({ rows }) {
  const raw = (rows || []).filter((r) => Number(r.sales) > 0);
  if (!raw.length) return <div className="empty-state" style={{ minHeight: '260px' }}>ช่วงเวลานี้ยังไม่มียอดขาย</div>;

  const top = raw.slice(0, 8);
  const restSales = raw.slice(8).reduce((sum, r) => sum + Number(r.sales || 0), 0);
  const list = restSales > 0 ? [...top, { StoreId: 'other', StoreName: 'ร้านอื่น ๆ', sales: restSales }] : top;
  const total = list.reduce((sum, r) => sum + Number(r.sales || 0), 0) || 1;
  const COLORS = ['#FF724C', '#FDBF50', '#2A2C41', '#FF9E84', '#FFD98C', '#585B78', '#E8552D', '#D19A28', '#B9BCCD'];
  const radius = 72, circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'center', marginTop: '8px' }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: '200px', margin: '0 auto', flex: '1 1 180px' }}>
        <svg viewBox="0 0 200 200" style={{ width: '100%', display: 'block', transform: 'rotate(-90deg)' }}>
          <circle cx="100" cy="100" r={radius} fill="none" stroke="var(--berry-border)" strokeWidth="30" />
          {list.map((r, i) => {
            const length = (Number(r.sales || 0) / total) * circumference;
            const currentOffset = offset;
            offset += length;
            return (
              <circle key={r.StoreId ?? r.StoreName} cx="100" cy="100" r={radius} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="30" strokeDasharray={`${length} ${Math.max(circumference - length, 0)}`} strokeDashoffset={-currentOffset} strokeLinecap="butt" />
            );
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--berry-text-muted)', margin: 0 }}>ยอดขายรวม</div>
            <strong style={{ display: 'block', color: 'var(--berry-text-dark)', fontSize: '20px', marginTop: '3px' }}>{fmtMoney(total)}</strong>
            <span style={{ color: 'var(--berry-text-muted)', fontSize: '12px' }}>บาท</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: '1 1 200px' }}>
        {list.map((r, i) => {
          const share = (Number(r.sales || 0) / total) * 100;
          return (
            <div key={r.StoreId ?? r.StoreName} style={{ display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr) auto', gap: '8px', alignItems: 'center' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS[i % COLORS.length] }} />
              <span style={{ color: 'var(--berry-text-dark)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.StoreName}</span>
              <span style={{ color: 'var(--berry-text-dark)', fontSize: '13px', fontWeight: 700 }}>{share.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SearchableStorePicker({ stores, value, onChange }) {
  const selected = stores.find((s) => String(s.StoreId) === String(value));
  const [query, setQuery] = useState(selected?.StoreName || '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const next = stores.find((s) => String(s.StoreId) === String(value));
    setQuery(next?.StoreName || '');
  }, [value, stores]);

  const filtered = stores.filter((s) => String(s.StoreName || '').toLowerCase().includes(query.trim().toLowerCase()));

  const choose = (store) => {
    onChange(String(store.StoreId));
    setQuery(store.StoreName || '');
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
      <div className="berry-search-box" style={{ width: '100%' }}>
        <Icon name="search" size={16} color="var(--berry-text-muted)" />
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange('');
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="พิมพ์เพื่อค้นหาร้านค้า..."
        />
      </div>
      {open && (
        <div className="berry-dropdown-menu">
          {filtered.length ? filtered.map((s) => (
            <div key={s.StoreId} className="berry-dropdown-item" onClick={() => choose(s)} style={{ background: String(s.StoreId) === String(value) ? 'var(--berry-purple-light)' : 'transparent', color: String(s.StoreId) === String(value) ? 'var(--berry-purple)' : 'inherit' }}>
              {s.StoreName}
            </div>
          )) : <div style={{ padding: '12px', color: 'var(--berry-text-muted)', fontSize: '13px' }}>ไม่พบร้านค้า</div>}
        </div>
      )}
    </div>
  );
}

function MenuRankList({ rows, tone = 'primary', emptyText }) {
  if (!rows.length) return <div className="empty-state" style={{ minHeight: '120px' }}>{emptyText || 'ยังไม่มีข้อมูลเมนู'}</div>;
  const maxValue = Math.max(...rows.map((r) => r.amount), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
      {rows.map((r) => (
        <div key={r.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
            <span style={{ color: 'var(--berry-text-dark)', fontSize: '14px', fontWeight: '500' }}>{r.name}</span>
            <strong style={{ color: 'var(--berry-text-dark)', fontSize: '14px' }}>{fmtMoney(r.amount)} บาท</strong>
          </div>
          <div style={{ height: '8px', background: 'var(--berry-border)', borderRadius: '999px', marginTop: '5px' }}>
            <div style={{ height: '100%', width: `${Math.max((r.amount / maxValue) * 100, 3)}%`, borderRadius: '999px', background: tone === 'primary' ? 'var(--berry-purple)' : 'var(--berry-amber)' }} />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--berry-text-muted)', marginTop: '6px' }}>
            ขายได้ {fmtMoney(r.qty)} จาน · คิดเป็น {r.share.toFixed(1)}% ของยอดขายร้าน
          </div>
        </div>
      ))}
    </div>
  );
}

function StarRating({ value, size = 14 }) {
  const rounded = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return (
    <span style={{ fontSize: size, letterSpacing: '1px', whiteSpace: 'nowrap' }}>
      <span style={{ color: 'var(--berry-amber)' }}>{'★★★★★'.slice(0, rounded)}</span>
      <span style={{ color: 'var(--berry-border)' }}>{'★★★★★'.slice(rounded)}</span>
    </span>
  );
}

function ReviewRow({ review }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: `1px solid var(--berry-border)` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--berry-text-dark)' }}>{review.ReviewerName || 'ลูกค้าไม่ระบุชื่อ'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StarRating value={review.Rating} />
          <span style={{ fontSize: '12px', color: 'var(--berry-text-muted)' }}>{thaiDateTime(review.CreatedAt)}</span>
        </div>
      </div>
      {review.Comment && <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--berry-text-muted)', lineHeight: 1.6 }}>{review.Comment}</p>}
    </div>
  );
}

function StoreReviewSection({ ctx, storeId }) {
  const { API } = ctx;
  const [state, setState] = useState({ loading: false, error: null, data: null });

  useEffect(() => {
    if (!storeId) {
      setState({ loading: false, error: null, data: null });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    callApi(`${API}/api/stores/${storeId}/reviews`)
      .then((data) => { if (!cancelled) setState({ loading: false, error: null, data }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, error: err.message, data: null }); });
    return () => { cancelled = true; };
  }, [API, storeId]);

  const summary = state.data?.summary || { total: 0, average: 0 };
  const reviews = state.data?.reviews || [];

  return (
    <div className="berry-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>รีวิวจากลูกค้า</h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--berry-text-muted)' }}>คะแนนและความคิดเห็นล่าสุดของร้านนี้</p>
        </div>
        {summary.total > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--berry-text-dark)', lineHeight: 1.2 }}>
              {summary.average.toFixed(1)} <span style={{ fontSize: '13px', color: 'var(--berry-text-muted)', fontWeight: 500 }}>/ 5</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--berry-text-muted)' }}>{fmtMoney(summary.total)} รีวิว</div>
          </div>
        )}
      </div>

      {state.loading && <div className="empty-state">กำลังโหลดรีวิว...</div>}
      {!state.loading && state.error && <div className="empty-state">{state.error}</div>}
      {!state.loading && !state.error && reviews.length === 0 && <div className="empty-state">ร้านนี้ยังไม่มีรีวิวจากลูกค้า</div>}
      {!state.loading && !state.error && reviews.length > 0 && (
        <div>{reviews.map((r) => <ReviewRow key={r.ReviewId} review={r} />)}</div>
      )}
    </div>
  );
}

// --- PDF & CSV EXPORT FUNCTIONS ---
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportCsv(filename, rows) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(',')).join('\r\n');
  saveBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }), filename);
}

const PDF_W = 595, PDF_H = 842, CANVAS_W = 1190, CANVAS_H = 1684;
function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
function buildPdfBlob(jpegPages) {
  const encoder = new TextEncoder();
  const chunks = [];
  let length = 0;
  const offsets = [];
  const push = (u8) => { chunks.push(u8); length += u8.length; };
  const pushText = (s) => push(encoder.encode(s));
  const mark = (n) => { offsets[n] = length; };

  const objectCount = 2 + jpegPages.length * 3;
  pushText('%PDF-1.4\n');
  mark(1);
  pushText('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  const kids = jpegPages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  mark(2);
  pushText(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${jpegPages.length} >>\nendobj\n`);

  jpegPages.forEach((jpeg, i) => {
    const pageNo = 3 + i * 3, imgNo = pageNo + 1, contentNo = pageNo + 2;
    const content = `q ${PDF_W} 0 0 ${PDF_H} 0 0 cm /Im0 Do Q\n`;

    mark(pageNo);
    pushText(`${pageNo} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_W} ${PDF_H}] /Resources << /XObject << /Im0 ${imgNo} 0 R >> >> /Contents ${contentNo} 0 R >>\nendobj\n`);
    mark(imgNo);
    pushText(`${imgNo} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${CANVAS_W} /Height ${CANVAS_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    pushText('\nendstream\nendobj\n');
    mark(contentNo);
    pushText(`${contentNo} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);
  });

  const xrefPos = length;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objectCount; i += 1) { xref += `${String(offsets[i] || 0).padStart(10, '0')} 00000 n \n`; }
  xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  pushText(xref);

  const out = new Uint8Array(length);
  let pos = 0;
  chunks.forEach((c) => { out.set(c, pos); pos += c.length; });
  return new Blob([out], { type: 'application/pdf' });
}

function drawReportPage({ title, subtitle, kpis, tableTitle, columns, rows, pageNo, pageCount }) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W; canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  const font = (size, weight = 'normal') => { ctx.font = `${weight} ${size}px ${FONT_STACK}`; };

  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#FF724C'; ctx.fillRect(0, 0, CANVAS_W, 14);

  const M = 70; let y = 92;
  ctx.fillStyle = '#2A2C41'; font(38, 'bold'); ctx.fillText(title, M, y);
  y += 34; ctx.fillStyle = '#8A8FA6'; font(20); ctx.fillText(subtitle, M, y);
  y += 22; ctx.fillText(`ออกรายงานเมื่อ ${nowStamp()} น. · Only Foods Food Court`, M, y);

  if (kpis && kpis.length) {
    y += 40;
    const cardW = (CANVAS_W - M * 2 - 24 * 2) / 3;
    kpis.forEach((k, i) => {
      const col = i % 3, row = Math.floor(i / 3), x = M + col * (cardW + 24), cy = y + row * 150;
      ctx.fillStyle = '#FAFAFC'; ctx.strokeStyle = '#E6E8F0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(x, cy, cardW, 126); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8A8FA6'; font(19); ctx.fillText(k.label, x + 22, cy + 40);
      ctx.fillStyle = '#2A2C41'; font(32, 'bold'); ctx.fillText(k.value, x + 22, cy + 82);
      if (k.note) {
        ctx.fillStyle = k.tone === 'up' ? '#17A673' : k.tone === 'down' ? '#E2452F' : '#8A8FA6';
        font(18); ctx.fillText(k.note, x + 22, cy + 110);
      }
    });
    y += Math.ceil(kpis.length / 3) * 150 + 20;
  }

  if (tableTitle) {
    y += 24; ctx.fillStyle = '#2A2C41'; font(26, 'bold'); ctx.fillText(tableTitle, M, y); y += 26;
  }

  if (columns && columns.length) {
    const tableW = CANVAS_W - M * 2;
    const colW = columns.map((c) => tableW * c.width);
    const colX = []; let acc = M;
    colW.forEach((w) => { colX.push(acc); acc += w; });

    ctx.fillStyle = '#F3F3F8'; ctx.fillRect(M, y, tableW, 46);
    ctx.fillStyle = '#4B4E66'; font(20, 'bold');
    columns.forEach((c, i) => {
      const tx = c.align === 'right' ? colX[i] + colW[i] - 16 : colX[i] + 16;
      ctx.textAlign = c.align === 'right' ? 'right' : 'left';
      ctx.fillText(c.title, tx, y + 30);
    });
    ctx.textAlign = 'left'; y += 46;

    rows.forEach((row, ri) => {
      if (ri % 2 === 1) { ctx.fillStyle = '#FAFAFD'; ctx.fillRect(M, y, tableW, 42); }
      ctx.fillStyle = '#4B4E66'; font(19);
      row.forEach((cell, i) => {
        const c = columns[i];
        const tx = c.align === 'right' ? colX[i] + colW[i] - 16 : colX[i] + 16;
        ctx.textAlign = c.align === 'right' ? 'right' : 'left';
        ctx.fillText(String(cell), tx, y + 28);
      });
      ctx.textAlign = 'left'; ctx.strokeStyle = '#E6E8F0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(M, y + 42); ctx.lineTo(M + tableW, y + 42); ctx.stroke();
      y += 42;
    });
  }

  ctx.fillStyle = '#8A8FA6'; font(17); ctx.fillText(`หน้า ${pageNo}/${pageCount}`, M, CANVAS_H - 50);
  ctx.textAlign = 'right'; ctx.fillText('รายงานสร้างจากระบบ Only Foods', CANVAS_W - M, CANVAS_H - 50); ctx.textAlign = 'left';
  return canvas;
}

function exportPdf(filename, spec) {
  const ROWS_FIRST_PAGE = 14, ROWS_PER_PAGE = 26;
  const rows = spec.rows || [];
  const pagesRows = [];
  if (rows.length <= ROWS_FIRST_PAGE) { pagesRows.push(rows); } 
  else {
    pagesRows.push(rows.slice(0, ROWS_FIRST_PAGE));
    for (let i = ROWS_FIRST_PAGE; i < rows.length; i += ROWS_PER_PAGE) { pagesRows.push(rows.slice(i, i + ROWS_PER_PAGE)); }
  }
  const pageCount = pagesRows.length;
  const jpegs = pagesRows.map((chunkRows, i) => {
    const canvas = drawReportPage({
      title: spec.title, subtitle: i === 0 ? spec.subtitle : `${spec.subtitle} (ต่อ)`,
      kpis: i === 0 ? spec.kpis : null, tableTitle: i === 0 ? spec.tableTitle : `${spec.tableTitle} (ต่อ)`,
      columns: spec.columns, rows: chunkRows, pageNo: i + 1, pageCount
    });
    return dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92));
  });
  saveBlob(buildPdfBlob(jpegs), filename);
}

// =====================================================================
// MAIN EXPORT COMPONENT
// =====================================================================
export default function ExecutiveView({ apiBase, user, onLogout }) {
  const API = apiBase || 'http://localhost:8000';
  
  const [activeMenu, setActiveMenu] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);

  const [stores, setStores] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [foodCourtOpen, setFoodCourtOpen] = useState(true);
  const [switchingCourt, setSwitchingCourt] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const [locallyRead, setLocallyRead] = useState([]); 

  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolver = useRef(null);

  const pushToast = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const ask = useCallback((options) => {
    setConfirmState(options);
    return new Promise((resolve) => { confirmResolver.current = resolve; });
  }, []);

  const closeConfirm = (result) => {
    setConfirmState(null);
    confirmResolver.current?.(result);
    confirmResolver.current = null;
  };

  const loadStores = useCallback(async (silent = false) => {
    try {
      const data = await callApi(`${API}/api/reports/dashboard`);
      setStores(Array.isArray(data) ? data : []);
    } catch (err) { if (!silent) pushToast(err.message, 'error'); }
  }, [API, pushToast]);

  const loadOrders = useCallback(async (silent = false) => {
    try {
      const data = await callApi(`${API}/api/orders`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) { if (!silent) pushToast(err.message, 'error'); } 
    finally { setLoading(false); }
  }, [API, pushToast]);

  const loadFoodCourt = useCallback(async (silent = true) => {
    try {
      const data = await callApi(`${API}/api/food-court/status`);
      setFoodCourtOpen(Boolean(data?.is_open));
    } catch (err) { if (!silent) pushToast(err.message, 'error'); }
  }, [API, pushToast]);

  const loadNotifications = useCallback(async (silent = true) => {
    const userId = user?.UserId || user?.id;
    if (!userId) return;
    try {
      const data = await callApi(`${API}/api/notifications/${userId}`);
      setNotifications(Array.isArray(data) ? data : []);
    } catch (err) { if (!silent) pushToast(err.message, 'error'); }
  }, [API, user, pushToast]);

  useEffect(() => {
    loadStores(); loadOrders(); loadFoodCourt(true); loadNotifications(true);
    const timer = setInterval(() => {
      loadStores(true); loadOrders(true); loadFoodCourt(true); loadNotifications(true);
    }, 15000);
    return () => clearInterval(timer);
  }, [loadStores, loadOrders, loadFoodCourt, loadNotifications]);

  const toggleFoodCourt = async () => {
    const closing = foodCourtOpen;
    const ok = await ask({
      title: closing ? 'ปิดศูนย์อาหาร' : 'เปิดศูนย์อาหาร',
      message: closing ? 'ยืนยันปิดศูนย์อาหารทั้งหมดใช่หรือไม่' : 'ยืนยันเปิดศูนย์อาหารให้กลับมาให้บริการใช่หรือไม่',
      warning: closing ? 'ระหว่างปิด ลูกค้าจะสั่งอาหารไม่ได้ทุกร้าน และพนักงานทุกโรลจะเห็นสถานะปิดบนหน้าจอ' : null,
      confirmText: closing ? 'ปิดศูนย์อาหาร' : 'เปิดศูนย์อาหาร',
      danger: closing
    });
    if (!ok) return;
    setSwitchingCourt(true);
    try {
      const data = await callApi(`${API}/api/food-court/toggle`, { method: 'PUT' });
      setFoodCourtOpen(Boolean(data?.is_open));
      pushToast(data?.message || 'อัปเดตสถานะศูนย์อาหารแล้ว');
    } catch (err) { pushToast(err.message, 'error'); } 
    finally { setSwitchingCourt(false); }
  };

  const isRead = (n) => Boolean(n.IsRead) || locallyRead.includes(n.NotifId);
  const unreadCount = notifications.filter((n) => !isRead(n)).length;

  const markRead = async (notif) => {
    if (isRead(notif)) return;
    setLocallyRead((prev) => [...prev, notif.NotifId]);
    try {
      await callApi(`${API}/api/notifications/${notif.NotifId}/read`, { method: 'PUT' });
      loadNotifications(true);
    } catch (err) { }
  };

  const markAllRead = async () => {
    const userId = user?.UserId || user?.id;
    setLocallyRead(notifications.map((n) => n.NotifId));
    try {
      await callApi(`${API}/api/notifications/${userId}/read-all`, { method: 'PUT' });
      loadNotifications(true);
      pushToast('อ่านแจ้งเตือนทั้งหมดแล้ว');
    } catch (err) {
      pushToast('ทำเครื่องหมายอ่านแล้วเฉพาะหน้าจอนี้', 'warn');
    }
  };

  const accountName = user?.FullName || user?.Username || user?.name || 'ผู้บริหาร';
  const accountRole = user?.Role || user?.role || 'Executive';

  const handleLogoutClick = () => {
    setProfileOpen(false);
    if (typeof onLogout === 'function') { onLogout(); return; }
    try { window.localStorage.clear(); window.sessionStorage.clear(); } catch (err) {}
    window.location.reload();
  };

  const MENUS = [
    { id: 'overview', icon: 'dashboard', label: 'Dashboard', caption: 'ภาพรวมศูนย์อาหาร' },
    { id: 'store-sales', icon: 'trend', label: 'Store Sales', caption: 'ยอดขายรายร้าน' },
    { id: 'store-manage', icon: 'store', label: 'Manage Stores', caption: 'จัดการร้านค้า' },
    { id: 'store-accounts', icon: 'users', label: 'Store Accounts', caption: 'บัญชีร้านค้า' }
  ];

  const ctx = { API, user, stores, orders, loading, search: search.trim().toLowerCase(), pushToast, ask, reloadStores: loadStores, reloadOrders: loadOrders };

  return (
    <div className="berry-root">
      <style>{BERRY_STYLES}</style>
      
      {/* ===== TOPBAR ===== */}
      <header className="berry-topbar">
        <div className="berry-topbar-left">
          <div className="berry-brand">
            <div className="brand-title">
              <span className="brand-icon">🍽️</span> 
              <span>Only Foods</span>
            </div>
            <div className="brand-subtitle">
              สถานะศูนย์อาหาร: 
              <span className="status-dot" style={{ background: foodCourtOpen ? 'var(--berry-green)' : 'var(--berry-red)'}}></span> 
              <span className="status-text" style={{ color: foodCourtOpen ? 'var(--berry-green)' : 'var(--berry-red)'}}>
                 {foodCourtOpen ? 'เปิดให้บริการ' : 'ปิดให้บริการ'}
              </span>
            </div>
          </div>

          <button className="berry-icon-btn purple-light" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Icon name="menu" size={20} />
          </button>
          
          {(activeMenu === 'store-manage' || activeMenu === 'store-accounts') && (
            <div className="berry-search-box">
              <Icon name="search" size={16} />
              <input type="text" placeholder="ค้นหา..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          )}
        </div>

        <div className="berry-topbar-right">
          
          {/* Notifications */}
          <div style={{ position: 'relative' }}>
             <button className="berry-icon-btn amber-light" onClick={() => setNotifOpen(!notifOpen)}>
               <Icon name="bell" size={20} />
               {unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
             </button>
             {notifOpen && (
               <div className="berry-profile-dropdown" style={{ width: '320px', padding: 0 }}>
                 <div style={{ padding: '16px', borderBottom: '1px solid var(--berry-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '15px' }}>การแจ้งเตือน</h4>
                      <div style={{ fontSize: '12px', color: 'var(--berry-text-muted)' }}>ยังไม่ได้อ่าน {unreadCount} รายการ</div>
                    </div>
                    {unreadCount > 0 && <button className="berry-btn-small btn-primary-light" onClick={markAllRead}>อ่านทั้งหมด</button>}
                 </div>
                 <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {notifications.length === 0 && <div className="empty-state">ยังไม่มีการแจ้งเตือน</div>}
                    {notifications.map(n => (
                      <div key={n.NotifId} className="berry-dropdown-item" onClick={() => markRead(n)} style={{ background: isRead(n) ? 'transparent' : 'var(--berry-purple-light)' }}>
                         <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isRead(n) ? 'var(--berry-border)' : 'var(--berry-purple)', flexShrink: 0, marginTop: '6px' }} />
                         <div style={{ minWidth: 0, paddingLeft: '8px' }}>
                            <div style={{ fontSize: '13px', color: 'var(--berry-text-dark)', whiteSpace: 'normal' }}>{n.Message}</div>
                            <div style={{ fontSize: '11px', color: 'var(--berry-text-muted)', marginTop: '4px' }}>{parseOrderDate(n.CreatedAt)?.toLocaleString('th-TH') || ''}</div>
                         </div>
                      </div>
                    ))}
                 </div>
               </div>
             )}
          </div>
          
          {/* Profile Dropdown */}
          <div className="berry-profile-container" ref={profileRef}>
            <div className="berry-user-chip" onClick={() => setProfileOpen(!profileOpen)}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--berry-blue-dark)', padding: '0 8px' }}>
                {accountName}
              </span>
              <div style={{ color: 'var(--berry-blue-dark)', display: 'flex', alignItems: 'center' }}>
                <Icon name="settings" size={18} />
              </div>
            </div>

            {profileOpen && (
              <div className="berry-profile-dropdown">
                <div className="dropdown-header">
                  <h4>{greetingText()}, {accountName}</h4>
                  <p>{accountRole} (ผู้บริหารศูนย์อาหาร)</p>
                </div>
                <hr className="berry-divider" style={{ margin: '0 0 16px' }} />
                <div className="dropdown-item" onClick={handleLogoutClick}>
                  <Icon name="logout" size={18} /> ออกจากระบบ
                </div>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* ===== BODY (Sidebar + Main Content) ===== */}
      <div className="berry-body">
        
        {/* ===== SIDEBAR ===== */}
        <aside className={`berry-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          <nav className="berry-nav">
            <div className="berry-nav-group">
              <div className="berry-nav-label hide-on-collapse">Main Menu</div>
              {MENUS.map(m => (
                <div 
                  key={m.id} 
                  className={`berry-nav-item ${activeMenu === m.id ? 'active' : ''}`} 
                  onClick={() => { setActiveMenu(m.id); setSearch(''); if (window.innerWidth <= 768) setSidebarOpen(false); }}
                  title={!sidebarOpen ? m.label : ""}
                >
                  <div className="berry-nav-icon"><Icon name={m.icon} size={20} /></div>
                  <div className="berry-nav-text hide-on-collapse">
                    <div className="title">{m.label}</div>
                    <div className="caption">{m.caption}</div>
                  </div>
                </div>
              ))}
            </div>
          </nav>
        </aside>

        {/* ===== MAIN CONTENT ===== */}
        <main className="berry-content">
          {activeMenu === 'overview' && <OverviewPage ctx={ctx} foodCourtOpen={foodCourtOpen} switchingCourt={switchingCourt} onToggleCourt={toggleFoodCourt} />}
          {activeMenu === 'store-sales' && <StoreSalesPage ctx={ctx} />}
          {activeMenu === 'store-manage' && <StoreManagePage ctx={ctx} />}
          {activeMenu === 'store-accounts' && <StoreAccountsPage ctx={ctx} />}
        </main>
      </div>

      {/* ===== CONFIRM DIALOG ===== */}
      {confirmState && (
        <div className="berry-modal-overlay">
          <div className="berry-modal" style={{ width: '460px' }}>
            <h3>{confirmState.title}</h3>
            <p style={{ fontSize: '14px', color: 'var(--berry-text-dark)', lineHeight: 1.5 }}>{confirmState.message}</p>
            {confirmState.warning && <p style={{ fontSize: '13px', color: 'var(--berry-red)', marginTop: '10px' }}>{confirmState.warning}</p>}
            <div className="berry-modal-actions">
              <button className="berry-btn btn-error-light" onClick={() => closeConfirm(false)}>ยกเลิก</button>
              <button className={`berry-btn ${confirmState.danger ? 'btn-error' : 'btn-primary'}`} onClick={() => closeConfirm(true)}>{confirmState.confirmText || 'ยืนยัน'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Toast ===== */}
      <div className={`berry-toast ${toasts.length > 0 ? 'show' : ''}`}>
        {toasts.length > 0 && (
           <>
            <div className="icon-wrapper" style={{ background: toasts[toasts.length-1].type === 'error' ? 'var(--berry-red-light)' : toasts[toasts.length-1].type === 'warn' ? 'var(--berry-amber-light)' : 'var(--berry-green-light)', color: toasts[toasts.length-1].type === 'error' ? 'var(--berry-red)' : toasts[toasts.length-1].type === 'warn' ? 'var(--berry-amber)' : 'var(--berry-green)' }}>
              <Icon name={toasts[toasts.length-1].type === 'error' ? 'ban' : toasts[toasts.length-1].type === 'warn' ? 'info' : 'check'} size={16} />
            </div>
            {toasts[toasts.length-1].message}
           </>
        )}
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------
// PAGES
// ---------------------------------------------------------------------

function OverviewPage({ ctx, foodCourtOpen, switchingCourt, onToggleCourt }) {
  const { orders, stores, loading, pushToast } = ctx;
  const [anchor, setAnchor] = useState(todayISO());
  const [days, setDays] = useState(1);
  const [exportPreview, setExportPreview] = useState(null);

  const report = useMemo(() => {
    const bounds = periodBounds(anchor, days);
    const prevBounds = previousBounds(anchor, days);
    const current = orders.filter((o) => inRange(o, bounds));
    const previous = orders.filter((o) => inRange(o, prevBounds));
    const now = summarize(current);
    const before = summarize(previous);

    const storeRows = stores.map((s) => {
        const mine = now.completed.filter((o) => String(o.StoreId) === String(s.StoreId));
        const minePrev = before.completed.filter((o) => String(o.StoreId) === String(s.StoreId));
        const cancelled = now.cancelled.filter((o) => String(o.StoreId) === String(s.StoreId));
        const sales = sumAmount(mine);
        const prevSales = sumAmount(minePrev);
        return { ...s, sales, prevSales, delta: changePct(sales, prevSales), completedCount: mine.length, cancelledCount: cancelled.length, avg: mine.length ? sales / mine.length : 0 };
      }).sort((a, b) => b.sales - a.sales);

    const byHour = Array.from({ length: 24 }, () => 0);
    now.completed.forEach((o) => {
      const at = parseOrderDate(o.CreatedAt);
      if (at) byHour[at.getHours()] += Number(o.TotalAmount || 0);
    });
    const peakHour = byHour.indexOf(Math.max(...byHour));
    const peakSales = byHour[peakHour] || 0;

    return { now, before, storeRows, buckets: buildBuckets(now.completed, anchor, days), peakHour: peakSales > 0 ? peakHour : null, peakSales, activeStores: stores.filter((s) => s.IsOpen && !s.IsSuspended).length };
  }, [orders, stores, anchor, days]);

  const periodLabel = days === 1 ? `วันที่ ${thaiDate(anchor)}` : `${days} วันย้อนหลังถึง ${thaiDate(anchor)}`;
  const compareLabel = days === 1 ? 'เทียบเมื่อวาน' : `เทียบ ${days} วันก่อนหน้า`;
  const visibleStoreRows = report.storeRows;
  const maxStoreSales = Math.max(...report.storeRows.map((s) => Number(s.sales) || 0), 1);
  const bestStore = report.storeRows.find((s) => s.sales > 0) || null;

  const saveCsv = () => {
    const rows = [
      ['รายงานภาพรวมศูนย์อาหาร Only Foods'], ['ช่วงข้อมูล', periodLabel], ['ออกรายงานเมื่อ', nowStamp()], [],
      ['ตัวชี้วัด', 'ค่า', 'ช่วงก่อนหน้า'],
      ['ยอดขายสุทธิ (บาท)', Math.round(report.now.sales), Math.round(report.before.sales)],
      ['ออเดอร์สำเร็จ', report.now.completedCount, report.before.completedCount],
      ['ออเดอร์ยกเลิก', report.now.cancelledCount, report.before.cancelledCount],
      ['อัตราการยกเลิก (%)', report.now.cancelRate.toFixed(1), report.before.cancelRate.toFixed(1)],
      ['ยอดเฉลี่ยต่อออเดอร์ (บาท)', report.now.avgOrder.toFixed(2), report.before.avgOrder.toFixed(2)], [],
      ['ร้านค้า', 'ออเดอร์สำเร็จ', 'ยอดขาย (บาท)', 'ยกเลิก', 'ยอดเฉลี่ย/ออเดอร์', 'เทียบช่วงก่อน (%)'],
      ...report.storeRows.map((s) => [s.StoreName, s.completedCount, Math.round(s.sales), s.cancelledCount, s.avg.toFixed(2), s.delta === null ? '-' : s.delta.toFixed(1)]), [],
      [days === 1 ? 'ช่วงเวลา' : 'วันที่', 'ยอดขาย (บาท)', 'ออเดอร์'],
      ...report.buckets.map((b) => [b.label, Math.round(b.sales), b.count])
    ];
    exportCsv(`onlyfoods-overview-${anchor}-${days}d.csv`, rows);
    setExportPreview(null);
    pushToast('บันทึกไฟล์ CSV เรียบร้อยแล้ว');
  };

  const savePdf = () => {
    try {
      exportPdf(`onlyfoods-overview-${anchor}-${days}d.pdf`, {
        title: 'รายงานภาพรวมศูนย์อาหาร', subtitle: `ช่วงข้อมูล: ${periodLabel}`,
        kpis: [
          { label: 'ยอดขายสุทธิ', value: `${fmtMoney(report.now.sales)} บาท`, note: describeDelta(changePct(report.now.sales, report.before.sales), compareLabel), tone: toneOf(changePct(report.now.sales, report.before.sales)) },
          { label: 'ออเดอร์สำเร็จ', value: `${fmtMoney(report.now.completedCount)} ออเดอร์`, note: describeDelta(changePct(report.now.completedCount, report.before.completedCount), compareLabel), tone: toneOf(changePct(report.now.completedCount, report.before.completedCount)) },
          { label: 'ยอดเฉลี่ยต่อออเดอร์', value: `${money2(report.now.avgOrder)} บาท`, note: `${fmtMoney(report.activeStores)} ร้านเปิดให้บริการ` },
          { label: 'ออเดอร์ยกเลิก', value: `${fmtMoney(report.now.cancelledCount)} ออเดอร์`, note: `อัตรายกเลิก ${report.now.cancelRate.toFixed(1)}%`, tone: report.now.cancelRate > 10 ? 'down' : 'flat' },
          { label: 'ร้านขายดีที่สุด', value: bestStore ? bestStore.StoreName : '-', note: bestStore ? `${fmtMoney(bestStore.sales)} บาท` : 'ยังไม่มียอดขาย' },
          { label: 'ช่วงเวลาขายดี', value: report.peakHour === null ? '-' : `${pad2(report.peakHour)}:00 น.`, note: report.peakHour === null ? 'ยังไม่มีข้อมูล' : `${fmtMoney(report.peakSales)} บาท` }
        ],
        tableTitle: 'สรุปผลรายร้าน',
        columns: [
          { title: 'ร้านค้า', width: 0.34 }, { title: 'ออเดอร์สำเร็จ', width: 0.15, align: 'right' },
          { title: 'ยอดขาย (บาท)', width: 0.19, align: 'right' }, { title: 'ยกเลิก', width: 0.12, align: 'right' }, { title: 'เทียบช่วงก่อน', width: 0.2, align: 'right' }
        ],
        rows: report.storeRows.map((s) => [s.StoreName, fmtMoney(s.completedCount), fmtMoney(s.sales), fmtMoney(s.cancelledCount), s.delta === null ? '-' : `${s.delta >= 0 ? '+' : ''}${s.delta.toFixed(1)}%`])
      });
      setExportPreview(null);
      pushToast('บันทึกไฟล์ PDF เรียบร้อยแล้ว');
    } catch (err) { pushToast('สร้างไฟล์ PDF ไม่สำเร็จ', 'error'); }
  };

  return (
    <div className="berry-dashboard-grid">
      <div className="berry-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className={`berry-avatar-box tone-${foodCourtOpen ? 'success' : 'danger'}`}>
              <Icon name="power" size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>การควบคุมศูนย์อาหาร</h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--berry-text-muted)' }}>
                สถานะปัจจุบัน: <strong style={{ color: foodCourtOpen ? 'var(--berry-green)' : 'var(--berry-red)' }}>{foodCourtOpen ? 'เปิดให้บริการ' : 'ปิดให้บริการ'}</strong>
              </p>
            </div>
        </div>
        <button className={`berry-btn ${foodCourtOpen ? 'btn-error' : 'btn-primary'}`} onClick={onToggleCourt} disabled={switchingCourt}>
          {switchingCourt ? 'กำลังบันทึก...' : foodCourtOpen ? 'ปิดศูนย์อาหาร' : 'เปิดศูนย์อาหาร'}
        </button>
      </div>

      <div className="berry-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
         <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>ช่วงข้อมูลที่กำลังดู</h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--berry-text-muted)' }}>{periodLabel} · อัปเดตล่าสุด {nowStamp()} น.</p>
         </div>
         <div style={{ display: 'flex', gap: '10px' }}>
            <button className="berry-btn btn-primary-light" onClick={() => setExportPreview('csv')}><Icon name="download" size={16}/> CSV</button>
            <button className="berry-btn" style={{ background: 'var(--berry-blue)', color: '#fff' }} onClick={() => setExportPreview('pdf')}><Icon name="download" size={16}/> PDF</button>
         </div>
      </div>

      <div className="berry-stat-row">
        <div className="berry-card berry-bg-purple">
           <div className="berry-decor-circle-1"></div>
           <div className="berry-decor-circle-2"></div>
           <div className="berry-card-header" style={{ marginBottom: '16px' }}>
             <div className="berry-icon-box dark"><Icon name="trend" size={24} /></div>
           </div>
           <div className="berry-card-body">
             <h2 style={{ fontSize: '32px', margin: '0 0 4px', fontWeight: 600 }}>฿{fmtMoney(report.now.sales)}</h2>
             <p>ยอดขายสุทธิ</p>
             <div style={{ marginTop: '12px', display: 'inline-block', background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: 'bold' }}>
                {describeDelta(changePct(report.now.sales, report.before.sales), compareLabel)}
             </div>
           </div>
        </div>

        <div className="berry-card berry-bg-blue">
           <div className="berry-decor-wave">
              <svg viewBox="0 0 200 100" preserveAspectRatio="none"><path d="M0 50 C 40 10, 60 90, 100 50 C 140 10, 160 90, 200 50 L 200 100 L 0 100 Z" fill="rgba(255,255,255,0.1)"/></svg>
           </div>
           <div className="berry-card-header" style={{ marginBottom: '16px' }}>
             <div className="berry-icon-box dark blue"><Icon name="check" size={24} /></div>
           </div>
           <div className="berry-card-body">
             <h2 style={{ fontSize: '32px', margin: '0 0 4px', fontWeight: 600 }}>{fmtMoney(report.now.completedCount)}</h2>
             <p>ออเดอร์สำเร็จ</p>
             <div style={{ marginTop: '12px', display: 'inline-block', background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: 'bold' }}>
                {describeDelta(changePct(report.now.completedCount, report.before.completedCount), compareLabel)}
             </div>
           </div>
        </div>

        <div className="berry-stat-col">
           <DashboardSmallCard label="ยอดเฉลี่ยต่อออเดอร์" value={`฿${money2(report.now.avgOrder)}`} hint={describeDelta(changePct(report.now.avgOrder, report.before.avgOrder), compareLabel)} icon="trend" tone="blue" />
           <DashboardSmallCard label="ออเดอร์ยกเลิก" value={`${fmtMoney(report.now.cancelledCount)} ออเดอร์`} hint={`อัตราการยกเลิก ${report.now.cancelRate.toFixed(1)}%`} icon="cancel" tone="amber" />
        </div>
      </div>

      <div className="berry-chart-row">
         <div className="berry-card" style={{ flex: '2 1 600px' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
             <div>
               <div style={{ color: 'var(--berry-text-muted)', fontSize: '14px' }}>{days === 1 ? 'แนวโน้มยอดขายรายชั่วโมง' : 'แนวโน้มยอดขายรายวัน'}</div>
               <h3 style={{ margin: '6px 0 0', fontSize: '24px' }}>฿{fmtMoney(report.now.sales)}</h3>
             </div>
             <PeriodButtons days={days} setDays={setDays} anchor={anchor} setAnchor={setAnchor} />
           </div>
           {loading ? <div className="empty-state">กำลังโหลดข้อมูล...</div> : <SalesLineChart buckets={report.buckets} />}
         </div>
         <div className="berry-card" style={{ flex: '1 1 300px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>ยอดขายแยกร้าน</h3>
            {loading ? <div className="empty-state">กำลังโหลดข้อมูล...</div> : <StoreDonutChart rows={report.storeRows} />}
         </div>
      </div>

      <div className="berry-card">
         <div style={{ marginBottom: '16px' }}>
           <h3 style={{ margin: 0, fontSize: '18px' }}>สรุปผลรายร้าน</h3>
           <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--berry-text-muted)' }}>ทั้งหมด {stores.length} ร้าน · เปิดให้บริการ {report.activeStores} ร้าน</p>
         </div>
         <div className="berry-table-container">
            <table className="berry-table">
               <thead>
                  <tr>
                     <th>ร้านค้า</th>
                     <th style={{textAlign: 'right'}}>ออเดอร์สำเร็จ</th>
                     <th style={{textAlign: 'right'}}>ยอดขาย</th>
                     <th style={{textAlign: 'right'}}>{compareLabel}</th>
                     <th style={{textAlign: 'right'}}>ยกเลิก</th>
                     <th>สถานะ</th>
                  </tr>
               </thead>
               <tbody>
                  {visibleStoreRows.map((s) => (
                    <tr key={s.StoreId}>
                      <td style={{ fontWeight: 600, color: 'var(--berry-text-dark)' }}>{s.StoreName}</td>
                      <td className="mono" style={{textAlign: 'right'}}>{fmtMoney(s.completedCount)}</td>
                      <td className="mono bold" style={{textAlign: 'right', color: 'var(--berry-purple)'}}>฿{fmtMoney(s.sales)}</td>
                      <td className="mono" style={{textAlign: 'right', color: s.delta >= 0 ? 'var(--berry-green)' : 'var(--berry-red)'}}>
                        {s.delta === null ? '—' : `${s.delta >= 0 ? '▲' : '▼'} ${Math.abs(s.delta).toFixed(1)}%`}
                      </td>
                      <td className="mono" style={{textAlign: 'right'}}>{fmtMoney(s.cancelledCount)}</td>
                      <td>
                        <Badge tone={s.IsSuspended ? 'danger' : s.IsOpen ? 'success' : 'warning'}>
                          {s.IsSuspended ? 'ระงับสิทธิ์' : s.IsOpen ? 'เปิดบริการ' : 'ปิดร้าน'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {visibleStoreRows.length === 0 && <tr><td colSpan="6" className="empty-state">ไม่พบข้อมูลร้านค้า</td></tr>}
               </tbody>
            </table>
         </div>
      </div>

      {exportPreview && (
        <div className="berry-modal-overlay">
          <div className="berry-modal" style={{ width: '800px' }}>
             <h3>พรีวิวก่อนบันทึก {exportPreview.toUpperCase()}</h3>
             <p style={{ fontSize: '13px', color: 'var(--berry-text-muted)', marginBottom: '16px' }}>รายงานภาพรวมศูนย์อาหาร · {periodLabel}</p>
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                <div style={{ border: '1px solid var(--berry-border)', padding: '12px', borderRadius: '8px' }}>
                   <div style={{ fontSize: '12px', color: 'var(--berry-text-muted)' }}>ยอดขายสุทธิ</div>
                   <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '4px' }}>฿{fmtMoney(report.now.sales)}</div>
                </div>
                <div style={{ border: '1px solid var(--berry-border)', padding: '12px', borderRadius: '8px' }}>
                   <div style={{ fontSize: '12px', color: 'var(--berry-text-muted)' }}>ออเดอร์สำเร็จ</div>
                   <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '4px' }}>{fmtMoney(report.now.completedCount)}</div>
                </div>
                <div style={{ border: '1px solid var(--berry-border)', padding: '12px', borderRadius: '8px' }}>
                   <div style={{ fontSize: '12px', color: 'var(--berry-text-muted)' }}>ออเดอร์ยกเลิก</div>
                   <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '4px' }}>{fmtMoney(report.now.cancelledCount)}</div>
                </div>
                <div style={{ border: '1px solid var(--berry-border)', padding: '12px', borderRadius: '8px' }}>
                   <div style={{ fontSize: '12px', color: 'var(--berry-text-muted)' }}>เฉลี่ย/ออเดอร์</div>
                   <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '4px' }}>฿{money2(report.now.avgOrder)}</div>
                </div>
             </div>
             <div className="berry-modal-actions">
               <button className="berry-btn btn-error-light" onClick={() => setExportPreview(null)}>ยกเลิก</button>
               <button className="berry-btn btn-primary" onClick={exportPreview === 'pdf' ? savePdf : saveCsv}>
                 <Icon name="download" size={16}/> บันทึก {exportPreview.toUpperCase()}
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StoreSalesPage({ ctx }) {
  const { orders, stores, pushToast } = ctx;
  const [storeId, setStoreId] = useState('');
  const [anchor, setAnchor] = useState(todayISO());
  const [days, setDays] = useState(1);

  const store = stores.find((s) => String(s.StoreId) === String(storeId)) || null;

  const report = useMemo(() => {
    if (!storeId) return null;
    const bounds = periodBounds(anchor, days);
    const prevBounds = previousBounds(anchor, days);
    const current = orders.filter((o) => inRange(o, bounds, storeId));
    const previous = orders.filter((o) => inRange(o, prevBounds, storeId));
    const now = summarize(current);
    const before = summarize(previous);
    const menus = summarizeMenus(now.completed);
    return {
      now, before, buckets: buildBuckets(now.completed, anchor, days),
      bestMenus: menus.slice(0, 2), worstMenus: [...menus].reverse().slice(0, 2), menuCount: menus.length
    };
  }, [orders, storeId, anchor, days]);

  const periodLabel = days === 1 ? `วันที่ ${thaiDate(anchor)}` : `${days} วันย้อนหลังถึง ${thaiDate(anchor)}`;
  
  return (
    <div className="berry-dashboard-grid">
      <div className="berry-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
         <div style={{ flex: 1, minWidth: '240px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>เลือกร้านค้าเพื่อดูยอดขาย</h3>
            <SearchableStorePicker stores={stores} value={storeId} onChange={setStoreId} />
         </div>
      </div>

      {!storeId && <div className="berry-card empty-state" style={{ padding: '60px 20px' }}>เลือกร้านจากช่องด้านบนเพื่อดูยอดขายและเมนูของร้านนั้น</div>}

      {storeId && report && store && (
        <>
          <div className="berry-stat-row">
            <div className="berry-card berry-bg-purple">
               <div className="berry-decor-circle-1"></div>
               <div className="berry-decor-circle-2"></div>
               <div className="berry-card-header" style={{ marginBottom: '16px' }}>
                 <div className="berry-icon-box dark"><Icon name="trend" size={24} /></div>
               </div>
               <div className="berry-card-body">
                 <h2 style={{ fontSize: '32px', margin: '0 0 4px', fontWeight: 600 }}>฿{fmtMoney(report.now.sales)}</h2>
                 <p>ยอดขายสุทธิของร้าน</p>
               </div>
            </div>

            <div className="berry-card berry-bg-blue">
               <div className="berry-decor-wave">
                  <svg viewBox="0 0 200 100" preserveAspectRatio="none"><path d="M0 50 C 40 10, 60 90, 100 50 C 140 10, 160 90, 200 50 L 200 100 L 0 100 Z" fill="rgba(255,255,255,0.1)"/></svg>
               </div>
               <div className="berry-card-header" style={{ marginBottom: '16px' }}>
                 <div className="berry-icon-box dark blue"><Icon name="check" size={24} /></div>
               </div>
               <div className="berry-card-body">
                 <h2 style={{ fontSize: '32px', margin: '0 0 4px', fontWeight: 600 }}>{fmtMoney(report.now.completedCount)}</h2>
                 <p>ออเดอร์สำเร็จ</p>
               </div>
            </div>

            <div className="berry-stat-col">
               <DashboardSmallCard label="ยอดเฉลี่ยต่อออเดอร์" value={`฿${money2(report.now.avgOrder)}`} icon="trend" tone="blue" />
               <DashboardSmallCard label="ออเดอร์ยกเลิก" value={`${fmtMoney(report.now.cancelledCount)} ออเดอร์`} icon="cancel" tone="amber" />
            </div>
          </div>

          <div className="berry-chart-row">
             <div className="berry-card" style={{ flex: '2 1 600px' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                 <div>
                   <div style={{ color: 'var(--berry-text-muted)', fontSize: '14px' }}>{days === 1 ? 'แนวโน้มยอดขายรายชั่วโมง' : 'แนวโน้มยอดขายรายวัน'}</div>
                   <h3 style={{ margin: '6px 0 0', fontSize: '24px' }}>฿{fmtMoney(report.now.sales)}</h3>
                 </div>
                 <PeriodButtons days={days} setDays={setDays} anchor={anchor} setAnchor={setAnchor} />
               </div>
               <SalesLineChart buckets={report.buckets} showStoreDetail={false} />
             </div>
             
             <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="berry-card">
                   <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>เมนูขายดี 2 อันดับแรก</h3>
                   <MenuRankList rows={report.bestMenus} emptyText="ช่วงนี้ยังไม่มีเมนูที่ขายได้" tone="primary" />
                </div>
                <div className="berry-card">
                   <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>เมนูที่ขายได้น้อย 2 อันดับ</h3>
                   <MenuRankList rows={report.worstMenus} emptyText="ช่วงนี้ยังไม่มีเมนูที่ขายได้" tone="warning" />
                </div>
             </div>
          </div>

          <StoreReviewSection ctx={ctx} storeId={storeId} />
        </>
      )}
    </div>
  );
}

function StoreManagePage({ ctx }) {
  const { API, user, stores, search, pushToast, ask, reloadStores } = ctx;
  const [details, setDetails] = useState([]); 
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState('create');
  const [form, setForm] = useState(EMPTY_STORE_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const loadDetails = useCallback(async () => {
    try {
      const data = await callApi(`${API}/api/stores`);
      setDetails(Array.isArray(data) ? data : []);
    } catch (err) {}
  }, [API]);

  useEffect(() => { loadDetails(); }, [loadDetails]);

  const detailOf = (storeId) => details.find((d) => String(d.StoreId) === String(storeId)) || {};
  const rows = stores.filter((s) => String(s.StoreName || '').toLowerCase().includes(search));

  const openCreate = () => {
    setMode('create');
    setForm(EMPTY_STORE_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (store) => {
    const d = detailOf(store.StoreId);
    setMode('edit');
    setForm({
      StoreId: store.StoreId, name: store.StoreName || '', category: d.Category || '',
      contactName: d.ContactName || '', phone: d.ContactPhone || '', lineId: d.ContactLine || '',
      email: d.ContactEmail || '', description: d.Description || '', imageData: d.ImageUrl || '', imageName: ''
    });
    setErrors({});
    setModalOpen(true);
  };

  const submitForm = async (e) => {
    e.preventDefault();
    const found = validateStoreForm(form);
    setErrors(found);
    if (Object.keys(found).length) { pushToast('ข้อมูลไม่ครบถ้วน', 'error'); return; }

    const payload = {
      store_name: form.name.trim(), category: form.category, contact_name: form.contactName.trim(),
      contact_phone: form.phone, contact_line: form.lineId.trim(), contact_email: form.email.trim(),
      description: form.description.trim(), image_url: form.imageData, performed_by: user?.FullName || user?.Username || 'Executive'
    };

    setSaving(true);
    try {
      const isEdit = mode === 'edit';
      const fullPath = isEdit ? `/api/stores/${form.StoreId}/full` : '/api/stores/full';
      const basicPath = isEdit ? `/api/stores/${form.StoreId}` : '/api/stores';
      const method = isEdit ? 'PUT' : 'POST';

      try {
        await callApi(`${API}${fullPath}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        pushToast(isEdit ? 'บันทึกการแก้ไขร้านค้าแล้ว' : 'เพิ่มร้านค้าเข้าระบบเรียบร้อยแล้ว');
      } catch (fullError) {
        if (!/endpoint/i.test(fullError.message)) throw fullError;
        await callApi(`${API}${basicPath}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        pushToast('บันทึกได้เฉพาะชื่อร้าน', 'warn');
      }
      setModalOpen(false);
      await reloadStores();
      await loadDetails();
    } catch (err) { pushToast(err.message, 'error'); } finally { setSaving(false); }
  };

  const toggleStore = async (store) => {
    const closing = Boolean(store.IsOpen);
    const ok = await ask({
      title: closing ? 'ปิดร้านค้า' : 'เปิดร้านค้า',
      message: `ยืนยัน${closing ? 'ปิด' : 'เปิด'}ร้าน "${store.StoreName}" ใช่หรือไม่`,
      warning: closing ? 'ลูกค้าจะสั่งอาหารจากร้านนี้ไม่ได้จนกว่าจะเปิดใหม่' : null,
      confirmText: closing ? 'ปิดร้าน' : 'เปิดร้าน',
      danger: closing
    });
    if (!ok) return;
    try {
      await callApi(`${API}/api/stores/${store.StoreId}/toggle`, { method: 'PUT' });
      pushToast(`${closing ? 'ปิด' : 'เปิด'}ร้าน ${store.StoreName} แล้ว`);
      await reloadStores();
    } catch (err) { pushToast(err.message, 'error'); }
  };

  const suspendStore = async (store) => {
    const suspending = !store.IsSuspended;
    const ok = await ask({
      title: suspending ? 'ระงับสิทธิ์ร้านค้า' : 'ปลดระงับสิทธิ์',
      message: `ยืนยัน${suspending ? 'ระงับสิทธิ์' : 'ปลดระงับสิทธิ์'}ร้าน "${store.StoreName}" ใช่หรือไม่`,
      confirmText: suspending ? 'ระงับสิทธิ์' : 'ปลดระงับ',
      danger: suspending
    });
    if (!ok) return;
    try {
      await callApi(`${API}/api/stores/${store.StoreId}/suspend`, { method: 'PUT' });
      pushToast(`${suspending ? 'ระงับสิทธิ์' : 'ปลดระงับ'}ร้าน ${store.StoreName} แล้ว`);
      await reloadStores();
    } catch (err) { pushToast(err.message, 'error'); }
  };

  const deleteStore = async (store) => {
    const ok = await ask({
      title: 'ลบร้านค้าออกจากระบบ',
      message: `ยืนยันลบร้าน "${store.StoreName}" ออกจากระบบใช่หรือไม่`,
      warning: 'เมนูของร้านจะถูกลบไปด้วย',
      confirmText: 'ลบร้านค้า',
      danger: true
    });
    if (!ok) return;
    try {
      await callApi(`${API}/api/stores/${store.StoreId}`, { method: 'DELETE' });
      pushToast(`ลบร้าน ${store.StoreName} แล้ว`);
      await reloadStores();
    } catch (err) { pushToast(err.message, 'error'); }
  };

  return (
    <>
      <div className="berry-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>รายชื่อร้านค้าทั้งหมด</h3>
          <button className="berry-btn btn-primary" onClick={openCreate}><Icon name="plus" size={16} /> เพิ่มร้านค้า</button>
        </div>

        <div className="berry-table-container">
          <table className="berry-table">
            <thead>
              <tr>
                <th>ร้านค้า</th>
                <th>สถานะ</th>
                <th style={{textAlign: 'right'}}>ยอดขายสะสม</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.StoreId}>
                  <td style={{ fontWeight: '600', color: 'var(--berry-text-dark)' }}>{s.StoreName}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Badge tone={s.IsOpen ? 'success' : 'neutral'}>{s.IsOpen ? 'เปิด' : 'ปิด'}</Badge>
                      {Boolean(s.IsSuspended) && <Badge tone="danger">ระงับสิทธิ์</Badge>}
                    </div>
                  </td>
                  <td className="mono" style={{textAlign: 'right'}}>฿{fmtMoney(s.net_sales)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="berry-btn-small btn-primary-light" onClick={() => openEdit(s)}>แก้ไข</button>
                      <button className="berry-btn-small btn-primary-light" onClick={() => toggleStore(s)}>{s.IsOpen ? 'ปิดร้าน' : 'เปิดร้าน'}</button>
                      <button className="berry-btn-small btn-error-light" onClick={() => suspendStore(s)}>{s.IsSuspended ? 'ปลดระงับ' : 'ระงับสิทธิ์'}</button>
                      <button className="berry-btn-small btn-error" onClick={() => deleteStore(s)}><Icon name="trash" size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan="4" className="empty-state">ไม่พบข้อมูลร้านค้า</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="berry-modal-overlay">
          <div className="berry-modal" style={{ width: '600px' }}>
            <h3>{mode === 'edit' ? 'แก้ไขร้านค้า' : 'เพิ่มร้านค้าใหม่'}</h3>
            <form onSubmit={submitForm}>
              <div className="berry-form-group">
                <label>ชื่อร้านค้า *</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div className="berry-form-group">
                <label>ประเภทอาหาร *</label>
                <select className="berry-select" value={form.category} onChange={e => setForm({...form, category: e.target.value})} required>
                  <option value="">— เลือกประเภท —</option>
                  {FOOD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                 <div className="berry-form-group">
                   <label>ผู้ติดต่อ *</label>
                   <input type="text" value={form.contactName} onChange={e => setForm({...form, contactName: e.target.value})} required />
                 </div>
                 <div className="berry-form-group">
                   <label>เบอร์โทร *</label>
                   <input type="text" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} required />
                 </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                 <div className="berry-form-group">
                   <label>LINE ID *</label>
                   <input type="text" value={form.lineId} onChange={e => setForm({...form, lineId: e.target.value})} required />
                 </div>
                 <div className="berry-form-group">
                   <label>อีเมล *</label>
                   <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
                 </div>
              </div>
              <div className="berry-modal-actions">
                <button type="button" className="berry-btn btn-error-light" onClick={() => setModalOpen(false)}>ยกเลิก</button>
                <button type="submit" className="berry-btn btn-primary" disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function StoreAccountsPage({ ctx }) {
  const { API, user, stores, search, pushToast, ask } = ctx;
  const [accounts, setAccounts] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState('create');
  const [form, setForm] = useState(EMPTY_ACCOUNT_FORM);
  const [saving, setSaving] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await callApi(`${API}/api/store-accounts`);
      setAccounts(Array.isArray(data) ? data : []);
    } catch (err) {}
  }, [API]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const storeName = (id) => stores.find((s) => String(s.StoreId) === String(id))?.StoreName || '—';
  const rows = accounts.filter((a) => `${a.Username} ${a.FullName}`.toLowerCase().includes(search));

  const openCreate = () => {
    setMode('create'); setForm(EMPTY_ACCOUNT_FORM); setModalOpen(true);
  };
  const openResetPassword = (account) => {
    setMode('password');
    setForm({ storeId: account.StoreId || '', role: account.Role, fullName: account.FullName, username: account.Username, password: '', confirm: '', userId: account.UserId });
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { pushToast('รหัสผ่านไม่ตรงกัน', 'error'); return; }
    setSaving(true);
    try {
      if (mode === 'password') {
        await callApi(`${API}/api/store-accounts/${form.userId}/password`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: form.password, full_name: form.fullName.trim(), role: form.role, store_id: Number(form.storeId), performed_by: user?.FullName || 'Executive' }) });
        pushToast('อัปเดตบัญชีร้านค้าเรียบร้อยแล้ว');
      } else {
        await callApi(`${API}/api/store-accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.username.trim(), password: form.password, full_name: form.fullName.trim(), role: form.role, store_id: Number(form.storeId), performed_by: user?.FullName || 'Executive' }) });
        pushToast('สร้างบัญชีให้ร้านค้าเรียบร้อยแล้ว');
      }
      setModalOpen(false); await loadAccounts();
    } catch (err) { pushToast(err.message, 'error'); } finally { setSaving(false); }
  };

  const removeAccount = async (account) => {
    const ok = await ask({ title: 'ลบบัญชีผู้ใช้', message: `ยืนยันลบบัญชี "${account.Username}" ใช่หรือไม่`, confirmText: 'ลบบัญชี', danger: true });
    if (!ok) return;
    try {
      await callApi(`${API}/api/store-accounts/${account.UserId}`, { method: 'DELETE' });
      pushToast('ลบบัญชีเรียบร้อยแล้ว'); await loadAccounts();
    } catch (err) { pushToast(err.message, 'error'); }
  };

  return (
    <>
      <div className="berry-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>บัญชีร้านค้า</h3>
          <button className="berry-btn btn-primary" onClick={openCreate}><Icon name="plus" size={16} /> สร้างบัญชี</button>
        </div>

        <div className="berry-table-container">
          <table className="berry-table">
            <thead>
              <tr>
                <th>ชื่อผู้ใช้</th>
                <th>ชื่อ-นามสกุล</th>
                <th>ร้านค้า</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.UserId}>
                  <td className="bold" style={{ color: 'var(--berry-purple)' }}>{a.Username}</td>
                  <td>{a.FullName}</td>
                  <td>{storeName(a.StoreId)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="berry-btn-small btn-primary-light" onClick={() => openResetPassword(a)}>แก้ไข</button>
                      <button className="berry-btn-small btn-error" onClick={() => removeAccount(a)}><Icon name="trash" size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan="4" className="empty-state">ไม่มีบัญชีร้านค้า</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="berry-modal-overlay">
          <div className="berry-modal">
            <h3>{mode === 'password' ? 'แก้ไขบัญชี' : 'สร้างบัญชี'}</h3>
            <form onSubmit={submit}>
              <div className="berry-form-group">
                <label>ร้านค้า *</label>
                <select className="berry-select" value={form.storeId} onChange={e => setForm({...form, storeId: e.target.value})} required>
                  <option value="">— เลือกร้านค้า —</option>
                  {stores.map(s => <option key={s.StoreId} value={s.StoreId}>{s.StoreName}</option>)}
                </select>
              </div>
              <div className="berry-form-group">
                <label>ชื่อ-นามสกุลผู้ใช้ *</label>
                <input type="text" value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})} required />
              </div>
              <div className="berry-form-group">
                <label>Username *</label>
                <input type="text" value={form.username} disabled={mode === 'password'} onChange={e => setForm({...form, username: e.target.value})} required style={{ background: mode === 'password' ? 'var(--berry-border)' : 'inherit' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                 <div className="berry-form-group">
                   <label>Password *</label>
                   <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
                 </div>
                 <div className="berry-form-group">
                   <label>Confirm Password *</label>
                   <input type="password" value={form.confirm} onChange={e => setForm({...form, confirm: e.target.value})} required />
                 </div>
              </div>
              <div className="berry-modal-actions">
                <button type="button" className="berry-btn btn-error-light" onClick={() => setModalOpen(false)}>ยกเลิก</button>
                <button type="submit" className="berry-btn btn-primary" disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================
   BERRY CSS STYLES (EXEC COLORS)
   ============================================================ */
const BERRY_STYLES = `
/* --- ซ่อน SCROLLBAR --- */
::-webkit-scrollbar { width: 0px; background: transparent; display: none; }
* { scrollbar-width: none; -ms-overflow-style: none; }
body, html { overflow: hidden; margin: 0; padding: 0; }

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

  --radius-lg: 14px;
  --radius-md: 9px;
  --shadow-sm: 0 2px 10px rgba(42,44,65,0.05);
  
  font-family: 'Roboto', 'Sarabun', sans-serif;
  color: var(--berry-text-dark);
  
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column; background: var(--berry-bg); z-index: 9999; 
}
.berry-root * { box-sizing: border-box; }

.berry-topbar { height: 80px; background: var(--berry-paper); display: flex; align-items: center; justify-content: space-between; padding: 0 24px; border-bottom: 1px solid var(--berry-border); flex-shrink: 0; z-index: 110; }
.berry-topbar-left, .berry-topbar-right { display: flex; align-items: center; gap: 16px; }

.berry-brand { width: 236px; flex-shrink: 0; display: flex; flex-direction: column; justify-content: center; white-space: nowrap; }
.brand-title { font-size: 20px; color: var(--berry-blue); font-weight: 700; display: flex; align-items: center; gap: 8px; }
.brand-subtitle { font-size: 12px; margin-top: 4px; color: var(--berry-text-muted); display: flex; align-items: center; gap: 6px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.status-text { font-weight: 600; }

.berry-icon-btn { width: 34px; height: 34px; border-radius: var(--radius-md); border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; }
.berry-icon-btn.purple-light { background: var(--berry-purple-light); color: var(--berry-purple); }
.berry-icon-btn.purple-light:hover { background: var(--berry-purple); color: white; }
.berry-icon-btn.amber-light { background: var(--berry-amber-light); color: #f59e0b; }
.berry-icon-btn.amber-light:hover { background: #f59e0b; color: white; }

.berry-search-box { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--berry-border); padding: 8px 16px; border-radius: var(--radius-md); width: 300px; }
.berry-search-box input { border: none; outline: none; background: transparent; width: 100%; font-size: 14px; font-family: inherit; }

.berry-profile-container { position: relative; }
.berry-user-chip { background: var(--berry-blue-light); padding: 6px 12px; border-radius: 20px; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s ease; }
.berry-user-chip:hover { background: #d0e8fc; }
.berry-profile-dropdown { position: absolute; top: calc(100% + 10px); right: 0; background: var(--berry-paper); width: 280px; border-radius: var(--radius-lg); box-shadow: 0px 8px 24px rgba(0,0,0,0.1); border: 1px solid var(--berry-border); padding: 20px; z-index: 1000; animation: slideDown 0.2s ease-out forwards; }
@keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
.dropdown-header h4 { margin: 0; font-size: 15px; font-weight: 600; color: var(--berry-text-dark); }
.dropdown-header p { margin: 4px 0 16px; font-size: 13px; color: var(--berry-text-muted); }
.dropdown-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 6px; cursor: pointer; font-size: 14px; color: var(--berry-text-dark); transition: background 0.2s; margin-bottom: 2px; }
.dropdown-item:hover { background: var(--berry-purple-light); color: var(--berry-purple); }

.notif-badge { position: absolute; top: -6px; right: -6px; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 999px; background: var(--berry-red); color: white; font-size: 11px; font-weight: 700; display: grid; place-items: center; }

.berry-body { display: flex; flex: 1; overflow: hidden; }
.berry-sidebar { width: 260px; background: var(--berry-paper); border-right: 1px solid var(--berry-border); display: flex; flex-direction: column; transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); z-index: 100; overflow-x: hidden; flex-shrink: 0; }
.berry-nav { padding: 16px; flex: 1; overflow-y: auto; overflow-x: hidden; }
.berry-nav-group { margin-bottom: 24px; }
.berry-nav-label { font-size: 14px; font-weight: 500; color: var(--berry-text-dark); padding: 12px 16px; margin-bottom: 4px; white-space: nowrap; }
.berry-nav-item { display: flex; align-items: center; gap: 16px; padding: 10px 16px; margin-bottom: 8px; border-radius: var(--radius-md); cursor: pointer; color: var(--berry-text-dark); transition: all 0.2s ease; white-space: nowrap; }
.berry-nav-item:hover, .berry-nav-item.active { background: var(--berry-purple-light); color: var(--berry-purple); }
.berry-nav-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.berry-nav-text .title { font-size: 14px; font-weight: 500; }
.berry-nav-text .caption { font-size: 12px; color: var(--berry-text-muted); margin-top: 2px; }
.berry-nav-item:hover .caption, .berry-nav-item.active .caption { color: var(--berry-purple); opacity: 0.8; }

@media (min-width: 769px) {
  .berry-sidebar.collapsed { width: 88px; }
  .berry-sidebar.collapsed .hide-on-collapse { display: none !important; }
  .berry-sidebar.collapsed .berry-nav-item { justify-content: center; padding: 12px; }
  .berry-sidebar.collapsed .berry-nav-icon { margin: 0; }
}
@media (max-width: 768px) {
  .berry-sidebar { position: fixed; left: 0; top: 80px; bottom: 0; width: 260px !important; transform: translateX(-100%); box-shadow: none; }
  .berry-sidebar.open { transform: translateX(0); box-shadow: 4px 0 24px rgba(0,0,0,0.1); }
}

.berry-content { flex: 1; padding: 24px; overflow-y: auto; }
.berry-dashboard-grid { display: flex; flex-direction: column; gap: 24px; }
.berry-stat-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
.berry-stat-col { display: flex; flex-direction: column; gap: 24px; }
.berry-chart-row { display: flex; flex-wrap: wrap; gap: 24px; }

.berry-card { background: var(--berry-paper); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 24px; position: relative; overflow: hidden; }
.berry-bg-purple { background: var(--berry-purple); color: white; }
.berry-bg-blue { background: var(--berry-blue); color: white; }
.berry-decor-circle-1 { position: absolute; width: 210px; height: 210px; background: var(--berry-purple-dark); border-radius: 50%; top: -85px; right: -95px; opacity: 0.5; }
.berry-decor-circle-2 { position: absolute; width: 210px; height: 210px; background: var(--berry-purple-dark); border-radius: 50%; top: -125px; right: -15px; opacity: 0.5; }
.berry-decor-wave { position: absolute; bottom: 0; right: 0; width: 100%; height: 100%; pointer-events: none; }
.berry-icon-box { width: 44px; height: 44px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; position: relative; z-index: 2; }
.berry-icon-box.dark { background: var(--berry-purple-dark); }
.berry-icon-box.dark.blue { background: var(--berry-blue-dark); }
.berry-card-body { position: relative; z-index: 2; }

.berry-small-card { padding: 20px; display: flex; align-items: center; }
.berry-avatar-box { width: 48px; height: 48px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; }
.berry-avatar-box.tone-blue { background: var(--berry-blue-light); color: var(--berry-blue); }
.berry-avatar-box.tone-amber { background: var(--berry-amber-light); color: var(--berry-amber); }

.berry-period-btn { background: transparent; border: none; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; color: var(--berry-text-muted); cursor: pointer; transition: all 0.2s ease; }
.berry-period-btn:hover { color: var(--berry-text-dark); }
.berry-period-btn.active { background: #fff; color: var(--berry-text-dark); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.berry-date-picker { display: flex; alignItems: center; gap: 7px; padding: 4px 10px; border: 1px solid var(--berry-border); borderRadius: var(--radius-md); background: var(--berry-paper); }
.berry-date-picker input { border: none; outline: none; color: var(--berry-text-muted); font-size: 13px; font-family: inherit; }

.berry-table-container { overflow-x: auto; margin-top: 16px; }
.berry-table { width: 100%; border-collapse: collapse; }
.berry-table th { text-align: left; padding: 14px 16px; font-size: 13px; font-weight: 600; color: var(--berry-text-muted); border-bottom: 1px solid var(--berry-border); text-transform: uppercase; }
.berry-table td { padding: 16px; border-bottom: 1px solid var(--berry-border); font-size: 14px; vertical-align: middle; }
.berry-table tr:last-child td { border-bottom: none; }
.berry-table .mono { font-family: 'Roboto', monospace; }
.berry-table .bold { font-weight: 600; }
.berry-table .muted { color: var(--berry-text-muted); font-size: 13px; }
.empty-state { text-align: center; color: var(--berry-text-muted); padding: 32px !important; font-size: 14px; }

.berry-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 20px; border-radius: var(--radius-md); border: none; font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.2s ease; }
.btn-primary { background: var(--berry-purple); color: white; }
.btn-primary:hover { background: var(--berry-purple-dark); }
.btn-error { background: var(--berry-red); color: white; }
.btn-error:hover { opacity: 0.9; }
.berry-btn-small { padding: 6px 12px; border-radius: 6px; border: none; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; }
.btn-primary-light { background: var(--berry-purple-light); color: var(--berry-purple); }
.btn-primary-light:hover { background: var(--berry-purple); color: white; }
.btn-error-light { background: var(--berry-red-light); color: var(--berry-red); }
.btn-error-light:hover { background: var(--berry-red); color: white; }
.berry-btn-icon { width: 32px; height: 32px; border-radius: 6px; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; }

.berry-badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 16px; font-size: 12px; font-weight: 600; }
.berry-badge.tone-success { background: var(--berry-green-light); color: var(--berry-green); }
.berry-badge.tone-danger { background: var(--berry-red-light); color: var(--berry-red); }
.berry-badge.tone-warning { background: var(--berry-amber-light); color: var(--berry-amber); }
.berry-badge.tone-primary { background: var(--berry-blue-light); color: var(--berry-blue); }
.berry-badge.tone-neutral { background: var(--berry-blue-light); color: var(--berry-text-muted); }

.berry-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; }
.berry-modal { background: var(--berry-paper); padding: 24px; border-radius: var(--radius-lg); width: 440px; max-width: 90%; box-shadow: 0 10px 25px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; }
.berry-modal h3 { margin: 0 0 20px; font-size: 18px; color: var(--berry-text-dark); }
.berry-form-group { margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; }
.berry-form-group label { font-size: 13px; font-weight: 600; color: var(--berry-text-dark); }
.berry-form-group input[type="text"], .berry-form-group input[type="password"], .berry-form-group input[type="number"], .berry-form-group input[type="email"], .berry-select, .berry-form-group textarea { padding: 10px 14px; border: 1px solid var(--berry-border); border-radius: var(--radius-md); font-family: inherit; font-size: 14px; outline: none; width: 100%; box-sizing: border-box; }
.berry-form-group input:focus, .berry-select:focus, .berry-form-group textarea:focus { border-color: var(--berry-purple); }
.berry-modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }

.berry-dropdown-menu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--berry-paper); border: 1px solid var(--berry-border); border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-height: 250px; overflow-y: auto; z-index: 100; }
.berry-dropdown-item { padding: 10px 12px; cursor: pointer; font-size: 14px; color: var(--berry-text-dark); border-bottom: 1px solid var(--berry-border); }
.berry-dropdown-item:hover { background: var(--berry-purple-light); color: var(--berry-purple); }

.berry-chart-tooltip { position: absolute; top: 8px; padding: 10px 14px; background: var(--berry-paper); border: 1px solid var(--berry-border); border-radius: var(--radius-md); box-shadow: 0 8px 24px rgba(0,0,0,0.12); pointer-events: none; min-width: 190px; z-index: 10; }

.berry-toast { position: fixed; bottom: 24px; right: 24px; background: var(--berry-paper); color: var(--berry-text-dark); padding: 12px 20px; border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 12px; z-index: 1000; opacity: 0; transform: translateY(20px); pointer-events: none; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid var(--berry-border); }
.berry-toast.show { opacity: 1; transform: translateY(0); }
.berry-toast .icon-wrapper { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }

@media (max-width: 1024px) {
  .berry-stat-row { grid-template-columns: 1fr 1fr; }
  .berry-stat-col { grid-column: span 2; flex-direction: row; }
  .berry-stat-col > div { flex: 1; }
}
@media (max-width: 768px) {
  .berry-stat-row { grid-template-columns: 1fr; }
  .berry-stat-col { grid-column: span 1; flex-direction: column; }
}
`;