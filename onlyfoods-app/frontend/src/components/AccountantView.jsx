import React, { useState, useEffect, useMemo, useRef } from 'react';

/* ============================================================
   OF Accounting — เจ้าหน้าที่บัญชีสถาบัน (Foodka Theme)
   ปรับธีมสีตามภาพ: #FF724C, #FDBF50, #FFFFFF, #2A2C41
   และปฏิบัติตามหลัก Effective Dashboard Design
   ============================================================ */

const RATE_WARN = 5;  // % -> เฝ้าระวัง
const RATE_BAD = 8;   // % -> สูงผิดปกติ

// โทนสีสำหรับแต่ละร้านค้า (ใช้เนกทีฟ/ส้ม/เหลือง/เทา ไม่แย่งซีนสีแจ้งเตือน)
const STORE_COLORS = ['#FF724C', '#2A2C41', '#FDBF50', '#697586', '#E0532E', '#4A4D6B', '#8C91A4'];

/* ---------------- Pure helpers ---------------- */
const fmtMoney = (n) => {
  const num = Number(n || 0);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 10000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const colorForStore = (storeId) => STORE_COLORS[Number(storeId) % STORE_COLORS.length];
const statusLabel = (s) => (s === 'bad' ? 'สูงผิดปกติ' : s === 'warn' ? 'เฝ้าระวัง' : 'ปกติ');

function parseOrderDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const normalized = String(value).trim().replace(' ', 'T');
  const alreadyHasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(alreadyHasTimezone ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const fmtDateTime = (d) => {
  const dt = parseOrderDate(d);
  if (!dt) return '-';
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
};

const dateOnly = (d) => {
  const dt = parseOrderDate(d);
  if (!dt) return '';
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function buildStoreSummary(stores, orders) {
  const map = {};
  (stores || []).forEach(s => {
    map[s.StoreId] = {
      storeId: s.StoreId, storeName: s.StoreName, color: colorForStore(s.StoreId),
      totalOrders: 0, completedOrders: 0, cancelledOrders: 0, grossSales: 0, cancelledAmount: 0,
    };
  });
  (orders || []).forEach(o => {
    if (!map[o.StoreId]) {
      map[o.StoreId] = {
        storeId: o.StoreId, storeName: o.StoreName || `ร้าน #${o.StoreId}`, color: colorForStore(o.StoreId),
        totalOrders: 0, completedOrders: 0, cancelledOrders: 0, grossSales: 0, cancelledAmount: 0,
      };
    }
    const row = map[o.StoreId];
    row.totalOrders += 1;
    
    // บันทึกยอดขายรวม (Gross Sales) จากทุกออเดอร์ก่อน
    row.grossSales += Number(o.TotalAmount || 0);

    if (o.Status === 'Completed') { 
      row.completedOrders += 1; 
    }
    if (o.Status === 'Cancelled') { 
      row.cancelledOrders += 1; 
      // เก็บยอดที่ถูกยกเลิกไว้
      row.cancelledAmount += Number(o.TotalAmount || 0); 
    }
  });
  return Object.values(map).map(r => {
    const rate = r.totalOrders > 0 ? (r.cancelledOrders / r.totalOrders) * 100 : 0;
    const status = rate > RATE_BAD ? 'bad' : rate >= RATE_WARN ? 'warn' : 'ok';
    
    // คำนวณรายได้สุทธิ = ยอดขายรวม - ยอดที่ถูกยกเลิก
    return { ...r, rate: +rate.toFixed(1), status, netSales: r.grossSales - r.cancelledAmount };
  }).sort((a, b) => b.netSales - a.netSales);
}

function filterOrdersByRange(orders, start, end, storeId) {
  return (orders || []).filter(o => {
    if (storeId && storeId !== 'all' && String(o.StoreId) !== String(storeId)) return false;
    const d = dateOnly(o.CreatedAt);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

function getPeriodBounds(range) {
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

function buildSalesTrend(orders, range) {
  const completed = (orders || []).filter(o => o.Status === 'Completed');
  if (range === 'today') {
    const todayStr = dateOnly(new Date());
    const buckets = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, '0')}:00`, value: 0 }));
    completed.forEach(o => {
      const dt = parseOrderDate(o.CreatedAt);
      if (!dt || dateOnly(dt) !== todayStr) return;
      buckets[dt.getHours()].value += Number(o.TotalAmount || 0);
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
    if (bucket) bucket.value += Number(o.TotalAmount || 0);
  });
  return buckets;
}

function buildTopMenu(orders, storeId, limit = 10) {
  const map = {};
  (orders || []).forEach(o => {
    if (o.Status !== 'Completed') return;
    if (storeId && storeId !== 'all' && String(o.StoreId) !== String(storeId)) return;
    const items = o.OrderItems || o.Items || o.orderItems || o.items || [];
    items.forEach(it => {
      const name = it.MenuName || it.ItemName || it.ProductName || it.Name || it.menuName || '-';
      const qty = Number(it.Quantity || it.Qty || it.quantity || 1);
      map[name] = (map[name] || 0) + qty;
    });
  });
  return Object.entries(map).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, limit);
}

/* ---------------- Report Config ---------------- */
const REPORT_TYPES = [
  { id: 'store', title: 'Store Summary', sub: 'สรุปยอดรายร้านครบทุกมิติ' },
  { id: 'sales', title: 'Sales Report', sub: 'ยอดขายรวมทุกร้าน' },
  { id: 'net', title: 'Net Sales Report', sub: 'ยอดขายสุทธิ' },
  { id: 'cancel', title: 'Cancellation Report', sub: 'รายงานการยกเลิกออเดอร์' },
];

const REPORT_COLUMNS = {
  store: [
    { key: 'storeName', label: 'STORE' },
    { key: 'totalOrders', label: 'ORDERS' },
    { key: 'grossSales', label: 'GROSS SALES', money: true },
    { key: 'cancelledOrders', label: 'CANCEL' },
    { key: 'rate', label: 'RATE', percent: true },
    { key: 'netSales', label: 'NET SALES', money: true },
  ],
  sales: [
    { key: 'storeName', label: 'STORE' },
    { key: 'totalOrders', label: 'ORDERS' },
    { key: 'grossSales', label: 'GROSS SALES', money: true },
  ],
  net: [
    { key: 'storeName', label: 'STORE' },
    { key: 'netSales', label: 'NET SALES', money: true },
  ],
  cancel: [
    { key: 'storeName', label: 'STORE' },
    { key: 'totalOrders', label: 'ORDERS' },
    { key: 'cancelledOrders', label: 'CANCELLED' },
    { key: 'rate', label: 'RATE', percent: true },
  ],
};

/* ---------------- SVG Icon Helper ---------------- */
function Icon({ name, size = 18, color = 'currentColor' }) {
  const paths = {
    berry: <><circle cx="6" cy="12" r="3" fill="#FF724C"/><circle cx="12" cy="7" r="3" fill="#FDBF50"/><circle cx="18" cy="12" r="3" fill="#FF724C"/><circle cx="12" cy="17" r="3" fill="#2A2C41"/></>,
    dashboard: <><path d="M4 4h6v8H4z" /><path d="M4 16h6v4H4z" /><path d="M14 12h6v8h-6z" /><path d="M14 4h6v4h-6z" /></>,
    sales: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>,
    cancel: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
    audit: <><path d="M9 12h6M9 16h6M9 8h6" /><rect x="4" y="3" width="16" height="18" rx="2" /></>,
    report: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
    menu: <><path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" /></>,
    settings: <><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0 -2.573-1.066c-1.543 .94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0 -1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543 .826-3.31 2.37-2.37c1 .608 2.296 .07 2.572-1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></>,
    logout: <><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></>,
    dots: <><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></>,
    arrowUp: <><path d="M7 17L17 7M17 7H7M17 7V17"/></>,
    arrowDown: <><path d="M7 7l10 10M17 17H7M17 17V7"/></>,
    wallet: <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
    bag: <><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
    check_icon: <><path d="M5 12l5 5l10 -10" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.berry}</svg>;
}

function Badge({ tone, children }) {
  return <span className={`berry-badge tone-${tone}`}>{children}</span>;
}

/* ============================================================
   FOODKA THEME COMPONENTS
   ============================================================ */

function BerryStatCard({ label, value, tone, delta, deltaSuffix = '%', invertDelta = false, compareLabel, primary, bgTone }) {
  let deltaEl = null;
  
  // เช็คว่าพื้นหลังเป็นสีทึบหรือไม่
  const isDarkBg = bgTone === 'orange' || bgTone === 'dark';

  if (delta !== undefined && delta !== null) {
    const isFlat = delta === 0;
    const isPositive = delta > 0;
    const isGood = isFlat ? null : (invertDelta ? !isPositive : isPositive);
    
    // ปรับสียอด % ให้สว่างขึ้นเมื่อพื้นหลังสีทึบ
    let color = isFlat ? 'var(--berry-text-muted)' : isGood ? 'var(--berry-green)' : 'var(--berry-red)';
    if (isDarkBg) {
      color = isFlat ? 'rgba(255,255,255,0.7)' : isGood ? '#a7f3d0' : '#fecaca';
    }

    deltaEl = (
      <div className="berry-stat-delta" style={{ color }}>
        {!isFlat && <Icon name={isPositive ? 'arrowUp' : 'arrowDown'} size={12} color={color} />}
        <span>{isFlat ? 'ไม่เปลี่ยนแปลง' : `${Math.abs(delta)}${deltaSuffix}`}</span>
        {compareLabel && <span className="berry-stat-delta-caption" style={isDarkBg ? { color: 'rgba(255,255,255,0.6)' } : {}}>{compareLabel}</span>}
      </div>
    );
  }

  // สร้าง Style ให้แต่ละการ์ดตาม bgTone ที่กำหนด
  let cardStyle = {};
  let valStyle = tone ? { color: `var(--berry-${tone})` } : {};
  let labelStyle = {};

  if (bgTone === 'orange') {
    cardStyle = { backgroundColor: '#FF724C', color: '#FFFFFF', borderColor: '#FF724C' };
    valStyle = { color: '#FFFFFF' };
    labelStyle = { color: 'rgba(255, 255, 255, 0.9)' };
  } else if (bgTone === 'dark') {
    cardStyle = { backgroundColor: '#2A2C41', color: '#FFFFFF', borderColor: '#2A2C41' };
    valStyle = { color: '#FFFFFF' };
    labelStyle = { color: 'rgba(255, 255, 255, 0.9)' };
  }

  return (
    <div className={`berry-small-card berry-stat-card ${primary && !isDarkBg ? 'primary' : ''}`} style={cardStyle}>
      <div className="berry-stat-value" style={valStyle}>{value}</div>
      <div className="berry-stat-label" style={labelStyle}>{label}</div>
      {deltaEl}
    </div>
  );
}

/* Line chart — มีเส้น Grid + แกน Y มองเห็นตลอด และ มี Custom Tooltip เมื่อ Hover */
function BerryLineChart({ data, height = 220, valueFormat, color = '#FF724C' }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!data || data.length === 0) {
    return <div className="berry-empty-note" style={{ height }}>ยังไม่มีข้อมูล</div>;
  }

  const max = Math.max(1, ...data.map(d => d.value));
  const w = 600, h = 190, padX = 45, padY = 20, padBottom = 30;
  const stepX = data.length > 1 ? (w - padX * 2) / (data.length - 1) : 0;
  
  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    y: padY + (1 - d.value / max) * (h - padY - padBottom),
    ...d
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = points.length ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${h - padBottom} L ${points[0].x.toFixed(1)} ${h - padBottom} Z` : '';
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="themeLineArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 1. เส้น Grid และแกน Y */}
        {[0, 0.5, 1].map(ratio => {
          const yPos = padY + ratio * (h - padY - padBottom);
          const val = max * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={padX} y1={yPos} x2={w - padX} y2={yPos} stroke="rgba(42, 44, 65, 0.12)" strokeDasharray="4 4" />
              <text x={padX - 8} y={yPos + 4} fontSize="11" fill="rgba(42, 44, 65, 0.6)" textAnchor="end">
                {valueFormat ? valueFormat(val) : Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* 2. กราฟหลัก */}
        <path d={areaPath} fill="url(#themeLineArea)" stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" />

        {/* 3. จุดข้อมูล และพื้นที่รับเมาส์ */}
        {points.map((p, i) => (
          <g key={i}>
            {(i % labelEvery === 0 || i === points.length - 1) && (
              <text x={p.x} y={h - 10} fontSize="11" fill="rgba(42, 44, 65, 0.6)" textAnchor="middle">
                {p.label}
              </text>
            )}
            
            <circle 
              cx={p.x} cy={p.y} 
              r={hoverIndex === i ? 5 : 3} 
              fill={hoverIndex === i ? '#FFFFFF' : color}
              stroke={color} 
              strokeWidth={hoverIndex === i ? 2 : 0}
              style={{ transition: 'all 0.2s ease' }} 
            />
            
            <rect
              x={p.x - stepX / 2} y={0} 
              width={stepX || w} height={h} 
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              style={{ cursor: 'crosshair' }}
            />
          </g>
        ))}
      </svg>

      {/* 4. Custom Tooltip */}
      {hoverIndex !== null && (
        <div
          style={{
            position: 'absolute',
            left: `calc(${(points[hoverIndex].x / w) * 100}%)`,
            top: `calc(${(points[hoverIndex].y / h) * 100}%)`,
            transform: 'translate(-50%, -120%)',
            background: '#2A2C41',
            color: '#FFFFFF',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(42, 44, 65, 0.2)',
            zIndex: 10,
            transition: 'top 0.1s, left 0.1s'
          }}
        >
          <div style={{ color: '#FDBF50', fontSize: '11px', marginBottom: '2px', fontWeight: 'bold' }}>
            {points[hoverIndex].label}
          </div>
          <div style={{ fontWeight: '700', fontSize: '14px' }}>
            {valueFormat ? valueFormat(points[hoverIndex].value) : points[hoverIndex].value}
          </div>
          <div style={{
            position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)',
            width: '0', height: '0', borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderTop: '5px solid #2A2C41'
          }} />
        </div>
      )}
    </div>
  );
}

function BerryDonutChart({ data, valueFormat, height = 240 }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!data || data.length === 0) {
    return <div className="berry-empty-note" style={{ height }}>ยังไม่มีข้อมูล</div>;
  }

  const total = data.reduce((sum, d) => sum + Math.max(0, Number(d.value || 0)), 0);
  if (total === 0) {
    return <div className="berry-empty-note" style={{ height }}>ไม่มียอดขายสุทธิ</div>;
  }

  const size = 190;
  const center = size / 2;
  const radius = 62;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;

  let accumulatedAngle = 0;

  const slices = data.map((d, i) => {
    const val = Math.max(0, Number(d.value || 0));
    const pctRatio = val / total;
    const strokeLength = pctRatio * circumference;
    const gap = data.length > 1 ? 2 : 0;
    const adjustedLength = Math.max(0, strokeLength - gap);
    
    const strokeDashoffset = -accumulatedAngle * circumference;
    accumulatedAngle += pctRatio;

    return {
      ...d,
      pct: (pctRatio * 100).toFixed(1),
      dashArray: `${adjustedLength} ${circumference - adjustedLength}`,
      strokeDashoffset,
      color: d.color || STORE_COLORS[i % STORE_COLORS.length]
    };
  });

  const activeSlice = hoverIndex !== null ? slices[hoverIndex] : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', flexWrap: 'wrap', minHeight: height, padding: '10px 0' }}>
      {/* Donut SVG */}
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`rotate(-90 ${center} ${center})`}>
            {slices.map((slice, i) => (
              <circle
                key={i}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={slice.color}
                strokeWidth={hoverIndex === i ? strokeWidth + 5 : strokeWidth}
                strokeDasharray={slice.dashArray}
                strokeDashoffset={slice.strokeDashoffset}
                strokeLinecap="butt"
                style={{
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  opacity: hoverIndex === null || hoverIndex === i ? 1 : 0.4
                }}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            ))}
          </g>
        </svg>

        {/* ข้อความกลางวงโดนัท */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          textAlign: 'center',
          padding: '12px'
        }}>
          <span style={{ fontSize: '11px', color: 'var(--berry-text-muted)', fontWeight: '500', whiteSpace: 'nowrap' }}>
            {activeSlice ? activeSlice.label : 'ยอดสุทธิรวม'}
          </span>
          <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--berry-text-dark)', marginTop: '2px' }}>
            {activeSlice 
              ? (valueFormat ? valueFormat(activeSlice.value) : activeSlice.value)
              : (valueFormat ? valueFormat(total) : total)
            }
          </span>
          {activeSlice && (
            <span style={{ fontSize: '12px', color: activeSlice.color, fontWeight: '700', marginTop: '2px' }}>
              {activeSlice.pct}%
            </span>
          )}
        </div>
      </div>

      {/* Legend / คำอธิบายสี */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '150px', maxWidth: '220px' }}>
        {slices.map((slice, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              cursor: 'pointer',
              opacity: hoverIndex === null || hoverIndex === i ? 1 : 0.45,
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: slice.color, flexShrink: 0 }} />
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: hoverIndex === i ? '700' : '400', color: 'var(--berry-text-dark)' }}>
              {slice.label}
            </span>
            <span style={{ fontWeight: '700', color: 'var(--berry-text-dark)' }}>{slice.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Horizontal bar chart */
function BerryHBarChart({ data, colorFor, valueFormat }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="berry-hbar-list">
      {data.length === 0 ? (
        <div className="berry-empty-note">ยังไม่มีข้อมูล</div>
      ) : data.map((d, i) => (
        <div className="berry-hbar-row" key={i}>
          <div className="berry-hbar-label" title={d.label}>{d.label}</div>
          <div className="berry-hbar-track">
            <div
              className="berry-hbar-fill"
              style={{ width: `${(d.value / max) * 100}%`, background: colorFor ? colorFor(d, i) : 'var(--berry-purple)' }}
            />
          </div>
          <div className="berry-hbar-value">{valueFormat ? valueFormat(d.value) : d.value}</div>
        </div>
      ))}
    </div>
  );
}

/* Bullet chart */
function BerryBulletChart({ data, target = RATE_BAD, warn = RATE_WARN }) {
  const max = Math.max(20, target + 5, ...data.map(d => d.value));
  const pct = (v) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="berry-bullet-list">
      {data.length === 0 ? (
        <div className="berry-empty-note">ยังไม่มีข้อมูล</div>
      ) : data.map((d, i) => (
        <div className="berry-bullet-row" key={i}>
          <div className="berry-bullet-label" title={d.label}>{d.label}</div>
          <div className="berry-bullet-track">
            <div className="berry-bullet-zones">
              <div className="berry-bullet-zone zone-ok" style={{ width: pct(warn) }} />
              <div className="berry-bullet-zone zone-warn" style={{ width: `calc(${pct(target)} - ${pct(warn)})` }} />
              <div className="berry-bullet-zone zone-bad" style={{ width: `calc(100% - ${pct(target)})` }} />
            </div>
            <div
              className="berry-bullet-bar"
              style={{ width: pct(d.value), background: d.status === 'bad' ? 'var(--berry-red)' : d.status === 'warn' ? 'var(--berry-amber)' : 'var(--berry-green)' }}
            />
            <div className="berry-bullet-target" style={{ left: pct(target) }} title={`เกณฑ์สูงผิดปกติ ${target}%`} />
          </div>
          <div className="berry-bullet-value">{d.value}%</div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export default function AccountantView({ apiBase, user, onLogout }) {
  useEffect(() => {
    if (!document.getElementById('avx-font-link')) {
      const link = document.createElement('link');
      link.id = 'avx-font-link';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Sarabun:wght@400;500;600;700&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const [stores, setStores] = useState([]);
  const [orders, setOrders] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState({ show: false, msg: '' });
  
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const [notificationsRead, setNotificationsRead] = useState(false);
  const [dropdown, setDropdown] = useState('');

  const [trendDays, setTrendDays] = useState(7);
  const [netChartType, setNetChartType] = useState('bar'); // 📍 เปลี่ยนค่าเริ่มต้นเป็น bar ตรงนี้
  const [salesStoreFilter, setSalesStoreFilter] = useState('all');
  const [detailStoreId, setDetailStoreId] = useState(null);
  const [auditSearch, setAuditSearch] = useState('');
  
  const [reportType, setReportType] = useState('store');
  const [reportFormat, setReportFormat] = useState('csv');
  const [reportEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); });
  const [rangeStart, setRangeStart] = useState(reportStart);
  const [rangeEnd, setRangeEnd] = useState(reportEnd);
  const [reportStoreFilter, setReportStoreFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchData = () => {
    Promise.all([
      fetch(`${apiBase}/api/stores`).then(r => r.json()),
      fetch(`${apiBase}/api/orders`).then(r => r.json()),
      fetch(`${apiBase}/api/audit-logs`).then(r => r.json()),
    ]).then(([storesData, ordersData, logsData]) => {
      setStores(Array.isArray(storesData) ? storesData : []);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setLogs(Array.isArray(logsData) ? logsData : []);
      setLoading(false);
      setLastUpdated(new Date());
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [apiBase]);

  const showToast = (msg) => {
    setToast({ show: true, msg });
    clearTimeout(window.__avxToastTimer);
    window.__avxToastTimer = setTimeout(() => setToast({ show: false, msg: '' }), 2600);
  };
  
  const toggleDropdown = (name) => setDropdown(prev => (prev === name ? '' : name));

  const storeSummary = useMemo(() => buildStoreSummary(stores, orders), [stores, orders]);
  const overview = useMemo(() => {
    const totalGross = storeSummary.reduce((a, s) => a + s.grossSales, 0);
    const totalOrders = storeSummary.reduce((a, s) => a + s.totalOrders, 0);
    const totalCancelled = storeSummary.reduce((a, s) => a + s.cancelledOrders, 0);
    const rate = totalOrders > 0 ? (totalCancelled / totalOrders) * 100 : 0;
    return { totalGross, totalOrders, totalCancelled, rate: +rate.toFixed(1), abnormalStores: storeSummary.filter(s => s.status !== 'ok') };
  }, [storeSummary]);

  const salesFilteredRows = salesStoreFilter === 'all' ? storeSummary : storeSummary.filter(s => String(s.storeId) === String(salesStoreFilter));

  const salesTotals = useMemo(() => {
    const gross = salesFilteredRows.reduce((a, s) => a + s.grossSales, 0);
    const net = salesFilteredRows.reduce((a, s) => a + s.netSales, 0);
    const completed = salesFilteredRows.reduce((a, s) => a + s.completedOrders, 0);
    const cancelled = salesFilteredRows.reduce((a, s) => a + s.cancelledOrders, 0);
    return { gross, net, completed, cancelled };
  }, [salesFilteredRows]);

  const topMenu = useMemo(() => buildTopMenu(orders, salesStoreFilter, 10), [orders, salesStoreFilter]);
  const hourlyTrend = useMemo(() => buildSalesTrend(orders, trendDays), [orders, trendDays]);

  const periodStats = useMemo(() => {
    const { currStart, currEnd, prevStart, prevEnd } = getPeriodBounds(trendDays);
    const summarize = (ords) => {
      const s = buildStoreSummary(stores, ords);
      const gross = s.reduce((a, x) => a + x.grossSales, 0);
      const net = s.reduce((a, x) => a + x.netSales, 0); 
      const totalOrders = s.reduce((a, x) => a + x.totalOrders, 0);
      const cancelled = s.reduce((a, x) => a + x.cancelledOrders, 0);
      const rate = totalOrders > 0 ? +((cancelled / totalOrders) * 100).toFixed(1) : 0;
      return { gross, net, totalOrders, cancelled, rate, storesData: s }; 
    };
    
      const curr = summarize(filterOrdersByRange(orders, currStart, currEnd, 'all'));
      const prev = summarize(filterOrdersByRange(orders, prevStart, prevEnd, 'all'));
      const pctChange = (c, p) => (p > 0 ? +(((c - p) / p) * 100).toFixed(1) : (c > 0 ? 100 : 0));
      const compareLabel = trendDays === 'today' ? 'เทียบกับเมื่อวาน' : `เทียบกับ ${trendDays} วันก่อนหน้า`;
      return {
        curr, prev, compareLabel,
        deltaGross: pctChange(curr.gross, prev.gross),
        deltaNet: pctChange(curr.net, prev.net), // เพิ่มบรรทัดนี้เพื่อคำนวณการเติบโตยอดสุทธิ
        deltaOrders: pctChange(curr.totalOrders, prev.totalOrders),
        deltaCancelled: pctChange(curr.cancelled, prev.cancelled),
        deltaRate: +(curr.rate - prev.rate).toFixed(1),
      };
    }, [orders, stores, trendDays]);

  const filteredLogs = logs.filter(l => {
    if (!auditSearch.trim()) return true;
    const q = auditSearch.toLowerCase();
    return (l.Action || '').toLowerCase().includes(q) || (l.PerformedBy || '').toLowerCase().includes(q)
      || (l.Details || '').toLowerCase().includes(q) || fmtDateTime(l.CreatedAt).includes(q);
  });

  const reportOrders = useMemo(() => filterOrdersByRange(orders, rangeStart, rangeEnd, reportStoreFilter), [orders, rangeStart, rangeEnd, reportStoreFilter]);
  const reportSummary = useMemo(() => buildStoreSummary(stores, reportOrders), [stores, reportOrders]);
  const reportColumns = REPORT_COLUMNS[reportType] || REPORT_COLUMNS.store;

  const exportReport = () => {
    const header = reportColumns.map(c => c.label);
    const rows = reportSummary.map(s => reportColumns.map(c => s[c.key]));

    if (reportFormat === 'xlsx') {
      const tableHtml = `<table border="1"><thead><tr>${header.map(h => `<th>${h}</th>`).join('')}</tr></thead>` +
        `<tbody>${rows.map(r => `<tr>${r.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body>${tableHtml}</body></html>`;
      const url = URL.createObjectURL(new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url; a.download = `FinancialReport-${reportType}-${rangeStart}_${rangeEnd}.xls`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('ส่งออกรายงานเป็นไฟล์ Excel สำเร็จ');
      return;
    }

    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `FinancialReport-${reportType}-${rangeStart}_${rangeEnd}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`ส่งออกรายงานเป็นไฟล์ CSV สำเร็จ`);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', caption: 'ภาพรวมบัญชี', icon: 'dashboard' },
    { id: 'sales', label: 'Sales Summary', caption: 'สรุปยอดขาย', icon: 'sales' },
    { id: 'cancel', label: 'Cancellation', caption: 'วิเคราะห์การยกเลิก', icon: 'cancel', badge: overview.abnormalStores.length || null },
    { id: 'audit', label: 'Audit Log', caption: 'ประวัติการเปลี่ยนแปลง', icon: 'audit' },
    { id: 'report', label: 'Financial Report', caption: 'ออกรายงานการเงิน', icon: 'report' },
  ];

  if (loading) {
    return <div className="berry-root"><style>{STYLES}</style><div style={{padding: '24px'}}>กำลังโหลดข้อมูล...</div></div>;
  }

  return (
    <div className="berry-root">
      <style>{STYLES}</style>
      
      {/* ===== TOPBAR (HEADER) ===== */}
      <header className="berry-topbar">
        <div className="berry-topbar-left">
          <div className="berry-brand">
            <div className="brand-title">
              <span className="brand-icon">📈</span> 
              <span>Accountant</span>
            </div>
            <div className="brand-subtitle">
              ระบบจัดการบัญชีส่วนกลาง
            </div>
          </div>
          <button className="berry-icon-btn purple-light" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Icon name="menu" size={20} color="var(--berry-purple)" />
          </button>
        </div>

        <div className="berry-topbar-right">
          <div style={{ position: 'relative' }}>
            <button className="berry-icon-btn amber-light" onClick={() => { setNotificationsRead(true); toggleDropdown('notif');}}>
              <Icon name="bell" size={20} color="var(--berry-amber)" />
              {!notificationsRead && overview.abnormalStores.length > 0 && (
                <span className="berry-nav-badge" style={{ position: 'absolute', top: -5, right: -5 }}>{overview.abnormalStores.length}</span>
              )}
            </button>
            {dropdown === 'notif' && (
              <div className="berry-profile-dropdown" style={{ right: 0, width: '300px' }}>
                <div className="dropdown-header">
                  <h4>Notifications <span>({overview.abnormalStores.length})</span></h4>
                </div>
                <hr className="berry-divider" />
                {overview.abnormalStores.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--berry-text-muted)' }}>ไม่มีการแจ้งเตือน</div>
                ) : overview.abnormalStores.map(s => (
                  <div key={s.storeId} className="dropdown-item" onClick={() => { setPage('cancel'); setDropdown(''); }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600 }}>{s.storeName}</span>
                      <span style={{ fontSize: '12px', color: 'var(--berry-text-muted)' }}>อัตรายกเลิก {s.rate}% ({s.status})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="berry-profile-container" ref={profileRef}>
            <div className="berry-user-chip" onClick={() => setProfileOpen(!profileOpen)}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--berry-text-dark)' }}>
                {user?.name || 'Accountant'}
              </span>
              <Icon name="settings" size={18} color="var(--berry-text-dark)" />
            </div>

            {profileOpen && (
              <div className="berry-profile-dropdown">
                <div className="dropdown-header">
                  <h4>Welcome, {user?.name || user?.FullName || 'Accountant'}</h4>
                  <p>เจ้าหน้าที่บัญชี</p>
                </div>
                <hr className="berry-divider" />
                <div className="dropdown-item" onClick={() => { if(onLogout) onLogout(); }}>
                  <Icon name="logout" size={18} /> Logout
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== BODY ===== */}
      <div className="berry-body">
        
        {/* SIDEBAR */}
        <aside className={`berry-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          <nav className="berry-nav">
            <div className="berry-nav-group">
              <div className="berry-nav-label hide-on-collapse">Menu</div>
              {navItems.map(n => (
                <div 
                  key={n.id} 
                  className={`berry-nav-item ${page === n.id ? 'active' : ''}`} 
                  onClick={() => { setPage(n.id); if (window.innerWidth <= 768) setSidebarOpen(false); }}
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
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <main className="berry-content">
          
          {page === 'dashboard' && (
            <div className="berry-dashboard-grid">
              <div className="berry-dashboard-toprow">
                <div>
                  <h2 style={{ margin: 0 }}>ภาพรวมศูนย์อาหาร</h2>
                  <div style={{ color: 'var(--berry-text-muted)', fontSize: 13 }}>
                    ยอดขายและอัตรายกเลิกของ{trendDays === 'today' ? 'วันนี้' : `${trendDays} วันล่าสุด`}
                  </div>
                </div>
                {lastUpdated && (
                  <div className="berry-updated-stamp">อัปเดตล่าสุด: {fmtDateTime(lastUpdated)}</div>
                )}
              </div>

              <div className="berry-stats-row-4">
                <BerryStatCard
                  bgTone="orange"
                  label="ยอดขายสุทธิรวม"
                  value={`฿${fmtMoney(periodStats.curr.net)}`} 
                  delta={periodStats.deltaNet}
                  compareLabel={periodStats.compareLabel}
                />
                <BerryStatCard
                  bgTone="dark"
                  label="จำนวนออเดอร์ทั้งหมด"
                  value={fmtMoney(periodStats.curr.totalOrders)}
                  delta={periodStats.deltaOrders}
                  compareLabel={periodStats.compareLabel}
                />
                <BerryStatCard
                  label="จำนวนออเดอร์ที่ยกเลิก"
                  value={fmtMoney(periodStats.curr.cancelled)}
                  delta={periodStats.deltaCancelled}
                  invertDelta
                  compareLabel={periodStats.compareLabel}
                />
                <BerryStatCard
                  label="อัตราการยกเลิก"
                  value={`${periodStats.curr.rate}%`}
                  tone={periodStats.curr.rate > RATE_BAD ? 'red' : periodStats.curr.rate >= RATE_WARN ? 'amber' : 'green'}
                  delta={periodStats.deltaRate}
                  deltaSuffix="pp"
                  invertDelta
                  compareLabel={periodStats.compareLabel}
                />
              </div>

              <div className="berry-chart-row">
                <div className="berry-panel" style={{ flex: '2 1 600px' }}>
                  <div className="berry-panel-header">
                    <div>
                      <div className="berry-growth-title">ยอดขายตามช่วงเวลา</div>
                      <div className="berry-panel-caption">แนวโน้มยอดขายที่สำเร็จแล้ว — ใช้ดูว่าช่วงไหนขายดีหรือขายตก</div>
                    </div>
                    <div className="berry-toggle-pills">
                      {[['today', 'วันนี้'], [7, '7 วัน'], [14, '14 วัน'], [30, '30 วัน']].map(([val, label]) => (
                        <button
                          key={val}
                          className={trendDays === val ? 'active' : ''}
                          onClick={() => setTrendDays(val)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <BerryLineChart data={hourlyTrend} height={290} valueFormat={(v) => `฿${fmtMoney(v)}`} />
                </div>
                <div className="berry-panel" style={{ flex: '1 1 380px' }}>
                  <div className="berry-panel-header">
                    <div>
                      <div className="berry-growth-title">รายได้สุทธิแยกร้าน</div>
                      <div className="berry-panel-caption">สัดส่วนและรายได้สุทธิของแต่ละร้าน</div>
                    </div>
                    
                    {/* 📍 สลับปุ่ม Bar ขึ้นมาก่อน Donut ตรงนี้ */}
                    <div className="berry-toggle-pills">
                      <button
                        className={netChartType === 'bar' ? 'active' : ''}
                        onClick={() => setNetChartType('bar')}
                      >
                        Bar
                      </button>
                      <button
                        className={netChartType === 'donut' ? 'active' : ''}
                        onClick={() => setNetChartType('donut')}
                      >
                        Donut
                      </button>
                    </div>
                  </div>

                  {/* แสดงผลกราฟตามประเภทที่เลือก (ปรับให้เงื่อนไขเช็ค Bar ขึ้นก่อนด้วย) */}
                  {netChartType === 'bar' ? (
                    <BerryHBarChart
                      data={periodStats.curr.storesData.map(s => ({ label: s.storeName, value: s.netSales }))}
                      colorFor={(d, i) => periodStats.curr.storesData[i]?.color || 'var(--berry-purple)'}
                      valueFormat={(v) => `฿${fmtMoney(v)}`}
                    />
                  ) : (
                    <BerryDonutChart
                      data={periodStats.curr.storesData.map(s => ({
                        label: s.storeName,
                        value: s.netSales,
                        color: s.color
                      }))}
                      valueFormat={(v) => `฿${fmtMoney(v)}`}
                    />
                  )}
                </div>
              </div>

              <div className="berry-panel">
                <div className="berry-panel-header">
                  <div>
                    <h3 style={{ margin: 0 }}>ร้านค้าที่ต้องจับตา</h3>
                    <div className="berry-panel-caption">เรียงตามอัตรายกเลิกจากสูงไปต่ำ</div>
                  </div>
                  <span className="berry-link" onClick={() => setPage('cancel')}>ดูการวิเคราะห์ทั้งหมด →</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="berry-table">
                    <thead>
                      <tr>
                        <th>ร้าน</th>
                        <th>ORDERS</th>
                        <th>ยอดขายรวม</th> 
                        <th>ยอดขายสุทธิ</th> 
                        <th>CANCEL</th>
                        <th>RATE</th>
                        <th>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...storeSummary].sort((a, b) => b.rate - a.rate).map(s => (
                        <tr key={s.storeId}>
                          <td><b>{s.storeName}</b></td>
                          <td>{fmtMoney(s.totalOrders)}</td>
                          <td>฿{fmtMoney(s.grossSales)}</td> 
                          <td style={{ fontWeight: 600 }}>฿{fmtMoney(s.netSales)}</td> 
                          <td>{fmtMoney(s.cancelledOrders)}</td>
                          <td>{s.rate}%</td>
                          <td><Badge tone={s.status}>{statusLabel(s.status)}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {page === 'sales' && (
            <div className="berry-dashboard-grid">
              <div className="berry-panel berry-filter-row">
                <label>ร้านค้า:</label>
                <select className="berry-input" value={salesStoreFilter} onChange={e => { setSalesStoreFilter(e.target.value); setDetailStoreId(null); }}>
                  <option value="all">ทุกร้านค้า</option>
                  {storeSummary.map(s => <option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}
                </select>
                <button className="berry-btn primary" onClick={() => showToast('อัปเดตตารางยอดขายแล้ว')}>
                  ค้นหา
                </button>
              </div>

              <div className="berry-stats-row-4">
                <BerryStatCard label="ยอดขายรวม" value={`฿${fmtMoney(salesTotals.gross)}`} />
                <BerryStatCard label="ยอดขายสุทธิ" value={`฿${fmtMoney(salesTotals.net)}`} />
                <BerryStatCard label="Orders สำเร็จ" value={fmtMoney(salesTotals.completed)} />
                <BerryStatCard label="Orders ยกเลิก" value={fmtMoney(salesTotals.cancelled)} />
              </div>

              <div className="berry-panel">
                <div className="berry-panel-header">
                  <h3>ตารางยอดขายรายร้าน</h3>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="berry-table">
                    <thead>
                      <tr>
                        <th>ร้านค้า</th>
                        <th>ออเดอร์สำเร็จ</th>
                        <th>ยอดขายรวม</th>
                        <th>ยกเลิก</th>
                        <th>ยอดสุทธิ</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesFilteredRows.map(s => (
                        <tr key={s.storeId}>
                          <td><b>{s.storeName}</b></td>
                          <td>{fmtMoney(s.completedOrders)}</td>
                          <td>฿{fmtMoney(s.grossSales)}</td>
                          <td style={{ color: 'var(--berry-red)' }}>{fmtMoney(s.cancelledOrders)} ({s.rate}%)</td>
                          <td style={{ fontWeight: 700 }}>฿{fmtMoney(s.netSales)}</td>
                          <td>
                            <span className="berry-link" onClick={() => { setSalesStoreFilter(String(s.storeId)); setDetailStoreId(s.storeId); }}>
                              ดูรายละเอียด →
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="berry-panel">
                <div className="berry-panel-header"><h3>เมนูขายดี Top 10</h3></div>
                {topMenu.length === 0 ? (
                  <div className="berry-empty-note">ยังไม่มีข้อมูลรายการเมนูที่ขาย</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="berry-table">
                      <thead><tr><th>อันดับ</th><th>เมนู</th><th>จำนวนที่ขาย</th></tr></thead>
                      <tbody>
                        {topMenu.map((m, i) => (
                          <tr key={m.name}>
                            <td>#{i + 1}</td>
                            <td>{m.name}</td>
                            <td>{fmtMoney(m.qty)} ชิ้น</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {page === 'cancel' && (
            <div className="berry-dashboard-grid">
              <div className="berry-stats-row-4">
                <BerryStatCard label="Order ทั้งหมด" value={fmtMoney(overview.totalOrders)} />
                <BerryStatCard label="Cancelled" value={fmtMoney(overview.totalCancelled)} />
                <BerryStatCard label="Cancellation Rate เฉลี่ย" value={`${overview.rate}%`} />
                <BerryStatCard
                  label="ร้านที่ผิดปกติ"
                  value={`${overview.abnormalStores.length} ร้าน`}
                  tone={overview.abnormalStores.length ? 'red' : 'green'}
                />
              </div>

              <div className="berry-chart-row">
                <div className="berry-panel" style={{ flex: '2 1 500px' }}>
                  <div className="berry-panel-header">
                    <div>
                      <h3 style={{ margin: 0 }}>Cancellation Rate by Store</h3>
                      <div className="berry-panel-caption">แถบสีอ่อนคือช่วงเกณฑ์ (ปกติ/เฝ้าระวัง/สูงผิดปกติ) เส้นดำคือเกณฑ์สูงผิดปกติที่ {RATE_BAD}%</div>
                    </div>
                  </div>
                  <BerryBulletChart
                    data={storeSummary.map(s => ({ label: s.storeName, value: s.rate, status: s.status }))}
                  />
                  <div className="berry-legend">
                    <span><i style={{ background: '#e3f9e5' }}></i>ปกติ &lt; {RATE_WARN}%</span>
                    <span><i style={{ background: '#fff3d6' }}></i>เฝ้าระวัง {RATE_WARN}-{RATE_BAD}%</span>
                    <span><i style={{ background: '#fde2e1' }}></i>สูงผิดปกติ &gt; {RATE_BAD}%</span>
                  </div>
                </div>
                <div className="berry-panel" style={{ flex: '1 1 320px' }}>
                  <div className="berry-panel-header"><h3>Cancellation Alert</h3></div>
                  {overview.abnormalStores.length === 0 ? (
                    <div className="berry-empty-note">ไม่มีร้านที่ผิดปกติในขณะนี้</div>
                  ) : overview.abnormalStores.map(s => (
                    <div className="berry-alert-item" key={s.storeId}>
                      <Icon name="cancel" size={20} color="#FF4D4F" />
                      <div>
                        <div className="alert-title">{s.storeName}</div>
                        <div className="alert-sub">อัตราการยกเลิก {s.rate}% สูงกว่าเกณฑ์ {s.status === 'bad' ? '8%' : '5%'}</div>
                        <div className="alert-link" onClick={() => { setSalesStoreFilter(String(s.storeId)); setPage('sales'); }}>
                          ดูรายละเอียดร้าน →
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="berry-panel">
                <div className="berry-panel-header"><h3>ตารางอัตราการยกเลิกรายร้าน</h3></div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="berry-table">
                    <thead><tr><th>ร้าน</th><th>Orders</th><th>Cancelled</th><th>Rate</th><th>สถานะ</th></tr></thead>
                    <tbody>
                      {storeSummary.map(s => (
                        <tr key={s.storeId}>
                          <td><b>{s.storeName}</b></td>
                          <td>{fmtMoney(s.totalOrders)}</td>
                          <td>{fmtMoney(s.cancelledOrders)}</td>
                          <td>{s.rate}%</td>
                          <td><Badge tone={s.status}>{statusLabel(s.status)}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {page === 'audit' && (
            <div className="berry-dashboard-grid">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0 }}>ประวัติการยกเลิกออเดอร์ (Audit Log)</h2>
                  <div style={{ color: 'var(--berry-text-muted)', fontSize: 13 }}>ข้อมูลอ้างอิงเพื่อความโปร่งใส บันทึกแบบแก้ไขย้อนหลังไม่ได้</div>
                </div>
                <span className="berry-readonly-badge"><Icon name="audit" size={16} color="#fff" /> Read Only - แก้ไขย้อนหลังไม่ได้</span>
              </div>

              <div className="berry-panel">
                <input
                  className="berry-input"
                  style={{ width: '100%' }}
                  placeholder="การกระทำ, ผู้ทำรายการ, รายละเอียด หรือวันที่..."
                  value={auditSearch}
                  onChange={e => setAuditSearch(e.target.value)}
                />
              </div>

              <div className="berry-panel">
                <div className="berry-panel-header"><h3>ประวัติการทำรายการในระบบ</h3></div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="berry-table">
                    <thead><tr><th>เวลา</th><th>การกระทำ</th><th>ผู้ทำรายการ</th><th>รายละเอียดเพิ่มเติม</th></tr></thead>
                    <tbody>
                      {filteredLogs.map(l => (
                        <tr key={l.LogID}>
                          <td>{fmtDateTime(l.CreatedAt)}</td>
                          <td><Badge tone={String(l.Action || '').includes('REJECT') ? 'bad' : 'neutral'}>{l.Action}</Badge></td>
                          <td>{l.PerformedBy}</td>
                          <td>{l.Details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {page === 'report' && (
            <div className="berry-dashboard-grid">
              <div className="berry-panel">
                <div className="berry-panel-header"><h3>1. เลือกประเภทรายงาน</h3></div>
                <div className="berry-select-grid">
                  {REPORT_TYPES.map(rt => (
                    <div
                      key={rt.id}
                      className={`berry-select-card ${reportType === rt.id ? 'active' : ''}`}
                      onClick={() => setReportType(rt.id)}
                    >
                      <div className="sc-title">{rt.title}</div>
                      <div className="sc-sub">{rt.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="berry-panel berry-filter-row">
                <div>
                  <label style={{ display: 'block', marginBottom: 4 }}>ตั้งแต่วันที่</label>
                  <input type="date" className="berry-input" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 4 }}>ถึงวันที่</label>
                  <input type="date" className="berry-input" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 4 }}>ร้านค้า</label>
                  <select className="berry-input" value={reportStoreFilter} onChange={e => setReportStoreFilter(e.target.value)}>
                    <option value="all">ทุกร้านค้า</option>
                    {storeSummary.map(s => <option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}
                  </select>
                </div>
              </div>

              <div className="berry-panel">
                <div className="berry-panel-header">
                  <h3>2. ตัวอย่างรายงานก่อน Export</h3>
                  <span style={{ fontSize: 12, color: 'var(--berry-text-muted)' }}>{rangeStart} ถึง {rangeEnd}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="berry-table">
                    <thead><tr>{reportColumns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
                    <tbody>
                      {reportSummary.map(s => (
                        <tr key={s.storeId}>
                          {reportColumns.map(c => (
                            <td key={c.key}>
                              {c.money ? `฿${fmtMoney(s[c.key])}` : c.percent ? `${s[c.key]}%` : s[c.key]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="berry-panel">
                <div className="berry-panel-header"><h3>3. เลือกรูปแบบไฟล์ Export</h3></div>
                <div className="berry-select-grid">
                  <div
                    className={`berry-select-card ${reportFormat === 'csv' ? 'active' : ''}`}
                    style={{ textAlign: 'center' }}
                    onClick={() => setReportFormat('csv')}
                  >
                    <div className="sc-title">CSV (.csv)</div>
                    <div className="sc-sub">ไฟล์ข้อมูลสากล เปิดได้ทุกโปรแกรม</div>
                  </div>
                  <div
                    className={`berry-select-card ${reportFormat === 'xlsx' ? 'active' : ''}`}
                    style={{ textAlign: 'center' }}
                    onClick={() => setReportFormat('xlsx')}
                  >
                    <div className="sc-title">Excel (.xls)</div>
                    <div className="sc-sub">เปิดตรงใน Microsoft Excel</div>
                  </div>
                </div>
                <button className="berry-btn primary" style={{ width: '100%', marginTop: 20, padding: '12px' }} onClick={exportReport}>
                  Export Report
                </button>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Toast Notification */}
      <div className={`berry-toast ${toast.show ? 'show' : ''}`}><Icon name="check_icon" size={15} color="#00C853" /> {toast.msg}</div>
    </div>
  );
}

/* ============================================================
   FOODKA COLOR PALETTE CSS STYLES
   #FF724C (Primary Orange), #FDBF50 (Accent Yellow)
   #FFFFFF (Card BG), #2A2C41 (Dark Text / Dark Elements)
   ============================================================ */
const STYLES = `

:root {
  --berry-bg: #f8f9fb;
  --berry-purple: #FF724C;
  --berry-purple-dark: #E0532E;
  --berry-purple-light: #FFF0EC;
  --berry-blue: #2A2C41;
  --berry-blue-dark: #1D1F2E;
  --berry-blue-light: #EAECEF;
  --berry-amber: #FDBF50;
  --berry-amber-light: #FFF8E7;
  --berry-red: #FF4D4F;
  --berry-green: #00C853;
  --berry-text-dark: #2A2C41;
  --berry-text-muted: #697586;
  --berry-border: #E8ECEF;
  --berry-card-bg: #FFFFFF;
}

.berry-root {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  min-height: 100vh;
  margin: 0;
  padding: 0;
  
  background-color: var(--berry-bg);
  font-family: 'Roboto', 'Sarabun', sans-serif;
  color: var(--berry-text-dark);
  display: flex;
  flex-direction: column;
}

/* Topbar */
.berry-topbar {
  height: 70px;
  background: var(--berry-card-bg);
  border-bottom: 1px solid var(--berry-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 100;
}
.berry-topbar-left { display: flex; align-items: center; gap: 24px; }
.berry-brand { display: flex; flex-direction: column; }
.brand-title { font-size: 20px; font-weight: 700; color: var(--berry-purple); display: flex; align-items: center; gap: 8px; }
.brand-subtitle { font-size: 11px; color: var(--berry-text-muted); display: flex; align-items: center; gap: 4px; margin-top: 2px; }
.berry-topbar-right { display: flex; align-items: center; gap: 16px; }

/* Buttons & Chips */
.berry-icon-btn {
  width: 38px; height: 38px;
  border-radius: 12px;
  border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.berry-icon-btn.purple-light { background: var(--berry-purple-light); color: var(--berry-purple); }
.berry-icon-btn.amber-light { background: var(--berry-amber-light); color: var(--berry-amber); }
.berry-icon-btn:hover { filter: brightness(0.95); }

.berry-user-chip {
  background: var(--berry-blue-light);
  border-radius: 20px;
  padding: 6px 12px 6px 16px;
  display: flex; align-items: center; gap: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.berry-user-chip:hover { background: #dce0e5; }

.berry-profile-container { position: relative; }
.berry-profile-dropdown {
  position: absolute; top: 110%; right: 0;
  background: #fff; width: 260px;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(42, 44, 65, 0.1);
  border: 1px solid var(--berry-border);
  padding: 16px 0; z-index: 200;
}
.dropdown-header { padding: 0 16px 12px; }
.dropdown-header h4 { margin: 0; font-size: 16px; font-weight: 700; }
.dropdown-header p { margin: 4px 0 0; font-size: 13px; color: var(--berry-text-muted); }
.berry-divider { border: 0; border-top: 1px solid var(--berry-border); margin: 8px 0; }
.dropdown-item {
  padding: 10px 16px; display: flex; align-items: center; gap: 12px;
  font-size: 14px; cursor: pointer; color: var(--berry-text-dark);
}
.dropdown-item:hover { background: var(--berry-purple-light); color: var(--berry-purple); }

/* Body & Sidebar */
.berry-body { display: flex; flex: 1; overflow: hidden; }
.berry-sidebar {
  width: 260px; background: var(--berry-card-bg);
  border-right: 1px solid var(--berry-border);
  transition: width 0.3s;
  display: flex; flex-direction: column;
}
.berry-sidebar.collapsed { width: 80px; }
.berry-nav { padding: 16px; }
.berry-nav-label { font-size: 12px; font-weight: 700; color: var(--berry-text-muted); text-transform: uppercase; margin-bottom: 12px; padding-left: 8px; }
.berry-sidebar.collapsed .hide-on-collapse { display: none; }
.berry-nav-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px; border-radius: 12px; cursor: pointer; margin-bottom: 8px;
  transition: all 0.2s; color: var(--berry-text-dark);
}
.berry-nav-item:hover { background: var(--berry-bg); }
.berry-nav-item.active { background: var(--berry-purple-light); color: var(--berry-purple); font-weight: 600; }
.berry-nav-icon { display: flex; align-items: center; justify-content: center; }
.berry-nav-text .title { font-size: 14px; font-weight: 500; }
.berry-nav-text .caption { font-size: 11px; color: var(--berry-text-muted); }
.berry-nav-badge { margin-left: auto; background: var(--berry-purple); color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }

/* Main Content */
.berry-content { flex: 1; padding: 24px; overflow-y: auto; }
.berry-dashboard-grid { display: flex; flex-direction: column; gap: 24px; }

/* Small Card */
.berry-small-card { background: var(--berry-card-bg); border-radius: 16px; padding: 20px; border: 1px solid var(--berry-border); }

/* Panels */
.berry-panel { background: var(--berry-card-bg); border-radius: 16px; padding: 24px; border: 1px solid var(--berry-border); }
.berry-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.berry-chart-row { display: flex; gap: 24px; flex-wrap: wrap; }

/* Badges */
.berry-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
.tone-ok, .tone-green { background: #E6F9ED; color: var(--berry-green); }
.tone-warn { background: var(--berry-amber-light); color: #D99B00; }
.tone-bad, .tone-red { background: #FFF0F0; color: var(--berry-red); }
.tone-neutral { background: var(--berry-border); color: var(--berry-text-dark); }

/* Tables */
.berry-table { width: 100%; border-collapse: collapse; }
.berry-table th { text-align: left; padding: 12px; font-size: 13px; color: var(--berry-text-muted); border-bottom: 1px solid var(--berry-border); }
.berry-table td { padding: 12px; font-size: 14px; border-bottom: 1px solid #f8fafc; color: var(--berry-text-dark); }

/* Form Elements */
.berry-input { padding: 8px 12px; border: 1px solid var(--berry-border); border-radius: 8px; outline: none; font-family: inherit; }
.berry-btn { padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-family: inherit; transition: all 0.2s; }
.berry-btn.primary { background: var(--berry-purple); color: #fff; }
.berry-btn.primary:hover { background: var(--berry-purple-dark); }

/* Toggle Pills */
.berry-toggle-pills { display: flex; background: var(--berry-purple-light); border-radius: 8px; padding: 2px; }
.berry-toggle-pills button { background: transparent; border: none; color: var(--berry-purple); padding: 4px 12px; font-size: 12px; border-radius: 6px; cursor: pointer; }
.berry-toggle-pills button.active { background: var(--berry-purple); color: #fff; font-weight: 700; }

/* Toast */
.berry-toast { position: fixed; bottom: 24px; right: 24px; background: #fff; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(42, 44, 65, 0.15); display: flex; align-items: center; gap: 10px; font-weight: 600; opacity: 0; transform: translateY(20px); transition: all 0.3s; z-index: 9999; }
.berry-toast.show { opacity: 1; transform: translateY(0); }

/* Layout Grid & Stat Cards */
.berry-stats-row-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
@media (max-width: 900px) { .berry-stats-row-4 { grid-template-columns: repeat(2, 1fr); } }
.berry-stat-card { text-align: left; }
.berry-stat-value { font-size: 26px; font-weight: 700; color: var(--berry-text-dark); }
.berry-stat-label { font-size: 13px; color: var(--berry-text-muted); margin-top: 6px; }

/* Alert List */
.berry-alert-item { display: flex; gap: 12px; align-items: flex-start; background: #FFF0F0; border: 1px solid #FFD1D1; border-radius: 12px; padding: 14px; margin-bottom: 12px; }
.berry-alert-item .alert-title { font-weight: 700; color: var(--berry-red); font-size: 14px; }
.berry-alert-item .alert-sub { font-size: 12px; color: var(--berry-text-dark); margin: 4px 0 6px; }
.berry-alert-item .alert-link { font-size: 12px; color: var(--berry-purple); font-weight: 600; cursor: pointer; }
.berry-empty-note { text-align: center; color: var(--berry-text-muted); padding: 20px; font-size: 13px; }

/* Legend for Bullet Chart */
.berry-legend { display: flex; gap: 16px; font-size: 12px; color: var(--berry-text-muted); margin-top: 10px; flex-wrap: wrap; }
.berry-legend span { display: inline-flex; align-items: center; gap: 6px; }
.berry-legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }

/* Report Selection Grid */
.berry-select-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
@media (max-width: 700px) { .berry-select-grid { grid-template-columns: 1fr; } }
.berry-select-card { border: 1.5px solid var(--berry-border); border-radius: 12px; padding: 14px 16px; cursor: pointer; transition: all 0.15s; }
.berry-select-card.active { border-color: var(--berry-purple); background: var(--berry-purple-light); }
.berry-select-card .sc-title { font-weight: 700; font-size: 14px; color: var(--berry-text-dark); }
.berry-select-card .sc-sub { font-size: 12px; color: var(--berry-text-muted); margin-top: 2px; }
.berry-select-card.active .sc-title { color: var(--berry-purple-dark); }

.berry-filter-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }
.berry-filter-row label { font-weight: 600; font-size: 13px; color: var(--berry-text-muted); }

.berry-readonly-badge { display: inline-flex; align-items: center; gap: 8px; background: var(--berry-text-dark); color: #fff; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; }
.berry-link { color: var(--berry-purple); font-weight: 600; font-size: 13px; cursor: pointer; }

/* Header & Stat Cards Upgrades */
.berry-dashboard-toprow { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 8px; }
.berry-updated-stamp { font-size: 12px; color: var(--berry-text-muted); white-space: nowrap; }
.berry-panel-caption { font-size: 12px; color: var(--berry-text-muted); margin-top: 2px; }

.berry-stat-delta { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; margin-top: 8px; }
.berry-stat-delta-caption { font-weight: 500; color: var(--berry-text-muted); margin-left: 2px; }
.berry-stat-card.primary { border-left: 4px solid var(--berry-purple); }
.berry-stat-card.primary .berry-stat-value { font-size: 30px; color: var(--berry-purple); }

/* Horizontal Bar Chart */
.berry-hbar-list { display: flex; flex-direction: column; gap: 12px; }
.berry-hbar-row { display: flex; align-items: center; gap: 10px; }
.berry-hbar-label { width: 120px; flex-shrink: 0; font-size: 12px; color: var(--berry-text-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.berry-hbar-track { flex: 1; height: 14px; background: #f4f6f8; border-radius: 4px; overflow: hidden; }
.berry-hbar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
.berry-hbar-value { width: 90px; text-align: right; font-size: 12px; font-weight: 700; color: var(--berry-text-dark); flex-shrink: 0; }

/* Bullet Chart */
.berry-bullet-list { display: flex; flex-direction: column; gap: 14px; }
.berry-bullet-row { display: flex; align-items: center; gap: 12px; }
.berry-bullet-label { width: 140px; flex-shrink: 0; font-size: 13px; font-weight: 600; color: var(--berry-text-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.berry-bullet-track { position: relative; flex: 1; height: 22px; border-radius: 4px; overflow: hidden; }
.berry-bullet-zones { position: absolute; inset: 0; display: flex; }
.berry-bullet-zone { height: 100%; }
.berry-bullet-zone.zone-ok { background: #E6F9ED; }
.berry-bullet-zone.zone-warn { background: #FFF8E7; }
.berry-bullet-zone.zone-bad { background: #FFF0F0; }
.berry-bullet-bar { position: absolute; top: 6px; bottom: 6px; left: 0; border-radius: 3px; transition: width 0.3s; }
.berry-bullet-target { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--berry-text-dark); }
.berry-bullet-value { width: 52px; text-align: right; font-weight: 700; font-size: 13px; flex-shrink: 0; }

`;