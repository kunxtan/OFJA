import React, { useState, useEffect, useMemo } from 'react';

/* ============================================================
   OF Accounting — เจ้าหน้าที่บัญชีสถาบัน
   หน้าเดียวใน React แต่แบ่งเป็น 5 "หน้าย่อย" ด้วย Sidebar Navigation
   ตามโครงสร้าง UI ที่ตกลงกันไว้ (Dashboard / Sales Summary /
   Cancellation Analysis / Audit Log / Financial Report)
   ใช้ endpoint เดิมทั้งหมดจาก main.py — ไม่มีการเพิ่ม dependency ใหม่
   ============================================================ */

const RATE_WARN = 5;  // %  -> เฝ้าระวัง
const RATE_BAD = 8;   // %  -> สูงผิดปกติ
const STORE_COLORS = ['#0E7C7B', '#2A5C87', '#C97F1E', '#7C5CBF', '#C4433D', '#2F8F62', '#0F8B8D', '#B4562B'];

/* ---------------- Pure helpers (ไม่ผูกกับ state) ---------------- */
const fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const colorForStore = (storeId) => STORE_COLORS[Number(storeId) % STORE_COLORS.length];
const statusLabel = (s) => (s === 'bad' ? 'สูงผิดปกติ' : s === 'warn' ? 'เฝ้าระวัง' : 'ปกติ');

// 1. เพิ่มฟังก์ชัน parseOrderDate ของคุณ (แก้ใส่ backtick ให้แล้ว)
function parseOrderDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const normalized = String(value).trim().replace(' ', 'T');
  const alreadyHasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);

  // เติม Z เพื่อให้ browser แปลงเป็นเวลาท้องถิ่น
  const parsed = new Date(
    alreadyHasTimezone ? normalized : `${normalized}Z` 
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// 2. ปรับ fmtDateTime ให้เรียกใช้ parseOrderDate
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

// 3. ปรับ dateOnly ให้เรียกใช้ parseOrderDate
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
    if (o.Status === 'Completed') { row.completedOrders += 1; row.grossSales += Number(o.TotalAmount || 0); }
    if (o.Status === 'Cancelled') { row.cancelledOrders += 1; row.cancelledAmount += Number(o.TotalAmount || 0); }
  });
  return Object.values(map).map(r => {
    const rate = r.totalOrders > 0 ? (r.cancelledOrders / r.totalOrders) * 100 : 0;
    const status = rate > RATE_BAD ? 'bad' : rate >= RATE_WARN ? 'warn' : 'ok';
    return { ...r, rate: +rate.toFixed(1), status, netSales: r.grossSales };
  }).sort((a, b) => b.grossSales - a.grossSales);
}

function buildDailyTrend(orders, days) {
  const map = {};
  (orders || []).forEach(o => {
    if (o.Status !== 'Completed') return;
    const d = dateOnly(o.CreatedAt);
    if (!d) return;
    map[d] = (map[d] || 0) + Number(o.TotalAmount || 0);
  });
  const sortedDays = Object.keys(map).sort().slice(-days);
  return sortedDays.map(d => ({ label: d.slice(5), amount: map[d] }));
}

function buildTodayHourlyTrend(orders) {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const todaysOrders = (orders || []).filter(o => {
    // เปลี่ยนมาใช้ parseOrderDate
    const orderDate = parseOrderDate(o.CreatedAt); 
    if (!orderDate) return false;
    
    const orderDateString = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}-${String(orderDate.getDate()).padStart(2, '0')}`;
    return orderDateString === today;
  });

  const amountByHour = {};
  todaysOrders.forEach(o => {
    if (o.Status !== 'Completed') return;
    
    // เปลี่ยนมาใช้ parseOrderDate
    const h = parseOrderDate(o.CreatedAt).getHours(); 
    
    amountByHour[h] = (amountByHour[h] || 0) + Number(o.TotalAmount || 0);
  });

  const result = [];
  for (let h = 0; h <= 23; h++) {
    result.push({ 
      label: `${String(h).padStart(2, '0')}:00`, 
      amount: amountByHour[h] || 0 
    });
  }
  
  return result;
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

/* ---------------- Small presentational pieces ---------------- */
function Icon({ name, size = 18 }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>,
    sales: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>,
    cancel: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
    audit: <><path d="M9 12h6M9 16h6M9 8h6" /><rect x="4" y="3" width="16" height="18" rx="2" /></>,
    report: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
    refresh: <><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></>,
    back: <><path d="m15 18-6-6 6-6" /></>,
    close: <><path d="M18 6 6 18M6 6l12 12" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>,
    lock: <><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    check: <><path d="M20 6 9 17l-5-5" /></>,
    warn: <><path d="M10.3 3.9 2.5 17a1.8 1.8 0 0 0 1.5 2.7h16a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function StatCard({ label, value, tone }) {
  return (
    <div className="avx-stat-card">
      <div className="avx-stat-label">{label}</div>
      <div className={`avx-stat-value${tone ? ' tone-' + tone : ''}`}>{value}</div>
    </div>
  );
}
function MiniStat({ label, value }) {
  return (
    <div className="avx-mini-stat">
      <div className="avx-mini-label">{label}</div>
      <div className="avx-mini-value">{value}</div>
    </div>
  );
}
function Badge({ tone, children }) {
  return <span className={`avx-badge tone-${tone}`}><span className="avx-badge-dot" />{children}</span>;
}
function BarChart({ data, color = '#0E7C7B', money = false, perBarColor = false, small = false }) {
  if (!data || data.length === 0) return <div className="avx-empty">ยังไม่มีข้อมูลเพียงพอสำหรับแสดงกราฟ</div>;
  
  // 1. คำนวณเพดานยอดขายสูงสุด (Max) แบบปัดเศษให้เลขสวยๆ
  const rawMax = Math.max(1, ...data.map(d => d.amount));
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  let max = Math.ceil(rawMax / magnitude) * magnitude;
  if (max < rawMax) max += magnitude; 
  if (rawMax <= 10) max = 10; 

  // Helper สำหรับแปลงตัวเลขแกน Y ให้สั้นลง (เช่น 15000 -> 15k)
  const formatAxis = (val) => {
    if (val === 0) return '0';
    const num = val >= 1000 ? (val / 1000).toFixed(val % 1000 === 0 ? 0 : 1) + 'k' : Math.round(val);
    return money ? `฿${num}` : num;
  };

  return (
    <div className={`avx-barchart-wrapper${small ? ' small' : ''}`}>
      {/* 2. แกน Y ทางซ้ายมือ */}
      <div className="avx-y-axis">
        <span>{formatAxis(max)}</span>
        <span>{formatAxis(max * 0.75)}</span>
        <span>{formatAxis(max * 0.5)}</span>
        <span>{formatAxis(max * 0.25)}</span>
        <span>{formatAxis(0)}</span>
      </div>

      <div className="avx-bars">
        {/* 3. เส้น Grid แนวนอน */}
        <div className="avx-grid-lines">
          <div className="avx-grid-line" />
          <div className="avx-grid-line" />
          <div className="avx-grid-line" />
          <div className="avx-grid-line" />
          <div className="avx-grid-line" />
        </div>

        {/* 4. แท่งกราฟและแกน X */}
        {data.map((d, i) => (
          <div className="avx-bar-col" key={i} title={`${d.label}: ${money ? '฿' + fmtMoney(d.amount) : d.amount}`}>
            <div className="avx-bar-track">
              <div 
                className="avx-bar" 
                style={{ 
                  height: `${Math.max(0, (d.amount / max) * 100)}%`, 
                  background: perBarColor ? (d.color || color) : color 
                }} 
              />
            </div>
            <div className="avx-bar-label">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, color = '#0E7C7B', money = false }) {
  if (!data || data.length === 0) {
    return (
      <div className="avx-empty">
        วันนี้ยังไม่มีข้อมูลการขาย
      </div>
    );
  }

  const width = 700;
  const height = 220;

  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const max = Math.max(1, ...data.map(d => d.amount));

  const points = data.map((d, i) => {
    const x =
      data.length === 1
        ? paddingLeft + chartWidth / 2
        : paddingLeft + (i / (data.length - 1)) * chartWidth;

    const y =
      paddingTop +
      chartHeight -
      (d.amount / max) * chartHeight;

    return { ...d, x, y };
  });

  const polylinePoints = points
    .map(p => `${p.x},${p.y}`)
    .join(' ');

  return (
    <div className="avx-line-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="220"
        preserveAspectRatio="none"
      >

        {/* เส้น Grid */}
        {[0, 25, 50, 75, 100].map(v => {
          const y =
            paddingTop +
            chartHeight -
            (v / 100) * chartHeight;

          return (
            <line
              key={v}
              x1={paddingLeft}
              x2={width - paddingRight}
              y1={y}
              y2={y}
              stroke="#E2E7EE"
              strokeWidth="1"
            />
          );
        })}

        {/* เส้นกราฟ */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* จุด */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="4"
              fill="#fff"
              stroke={color}
              strokeWidth="2.5"
            />

            <text
              x={p.x}
              y={height - 12}
              textAnchor="middle"
              fontSize="10"
              fill="#8A94A6"
            >
              {p.label}
            </text>

            {p.amount > 0 && (
              <text
                x={p.x}
                y={p.y - 10}
                textAnchor="middle"
                fontSize="9"
                fill="#4B5768"
              >
                {money ? `฿${fmtMoney(p.amount)}` : p.amount}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ============================================================ */

export default function AccountantView({ apiBase, user }) {
  // โหลดฟอนต์ Sarabun ครั้งเดียว (ไม่แก้ไฟล์อื่น แค่ inject <link> ตอน runtime)
  useEffect(() => {
    if (!document.getElementById('avx-font-link')) {
      const link = document.createElement('link');
      link.id = 'avx-font-link';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const [stores, setStores] = useState([]);
  const [orders, setOrders] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [page, setPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dropdown, setDropdown] = useState('');
  const [toast, setToast] = useState({ show: false, msg: '' });
  const [notificationsRead, setNotificationsRead] = useState(false);

  const [trendDays, setTrendDays] = useState(7);
  const [salesStoreFilter, setSalesStoreFilter] = useState('all');
  const [detailStoreId, setDetailStoreId] = useState(null);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditModalLog, setAuditModalLog] = useState(null);

  const [reportType, setReportType] = useState('store');
  const [reportStoreFilter, setReportStoreFilter] = useState('all');
  const [reportFormat, setReportFormat] = useState('csv');
  const [reportEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); });
  const [rangeStart, setRangeStart] = useState(reportStart);
  const [rangeEnd, setRangeEnd] = useState(reportEnd);

  const fetchData = () => {
    Promise.all([
      fetch(`${apiBase}/api/stores`).then(r => r.json()),
      fetch(`${apiBase}/api/orders`).then(r => r.json()),
      fetch(`${apiBase}/api/audit-logs`).then(r => r.json()),
    ]).then(([storesData, ordersData, logsData]) => {
      setStores(Array.isArray(storesData) ? storesData : []);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setLogs(Array.isArray(logsData) ? logsData : []);
      setLastUpdated(new Date());
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const showToast = (msg) => {
    setToast({ show: true, msg });
    clearTimeout(window.__avxToastTimer);
    window.__avxToastTimer = setTimeout(() => setToast({ show: false, msg: '' }), 2600);
  };
  const goPage = (p) => { setPage(p); setSidebarOpen(false); setDropdown(''); };
  const toggleDropdown = (name) => setDropdown(prev => (prev === name ? '' : name));

  /* ---------------- ข้อมูลคำนวณ (ทั้งศูนย์อาหาร) ---------------- */
  const storeSummary = useMemo(() => buildStoreSummary(stores, orders), [stores, orders]);
  const overview = useMemo(() => {
    const totalGross = storeSummary.reduce((a, s) => a + s.grossSales, 0);
    const totalOrders = storeSummary.reduce((a, s) => a + s.totalOrders, 0);
    const totalCancelled = storeSummary.reduce((a, s) => a + s.cancelledOrders, 0);
    const rate = totalOrders > 0 ? (totalCancelled / totalOrders) * 100 : 0;
    return { totalGross, totalOrders, totalCancelled, rate: +rate.toFixed(1), abnormalStores: storeSummary.filter(s => s.status !== 'ok') };
  }, [storeSummary]);
  const notificationSignature = overview.abnormalStores
  .map(s => `${s.storeId}:${s.rate}:${s.status}`)
  .sort()
  .join('|');

const [lastNotificationSignature, setLastNotificationSignature] = useState('');

useEffect(() => {
  if (notificationSignature !== lastNotificationSignature) {
    setNotificationsRead(false);
    setLastNotificationSignature(notificationSignature);
  }
}, [notificationSignature, lastNotificationSignature]);
  const dashboardTrend = useMemo(
    () => (trendDays === 'today' ? buildTodayHourlyTrend(orders) : buildDailyTrend(orders, trendDays)),
    [orders, trendDays]
  );
  
  /* ---------------- Sales Summary ---------------- */
  const salesFilteredRows = salesStoreFilter === 'all' ? storeSummary : storeSummary.filter(s => String(s.storeId) === String(salesStoreFilter));
  const salesFilteredSum = useMemo(() => salesFilteredRows.reduce((a, s) => ({
    gross: a.gross + s.grossSales, net: a.net + s.netSales, completed: a.completed + s.completedOrders, cancelled: a.cancelled + s.cancelledOrders,
  }), { gross: 0, net: 0, completed: 0, cancelled: 0 }), [salesFilteredRows]);
  const detailStore = detailStoreId ? storeSummary.find(s => s.storeId === detailStoreId) : null;
  const detailTrend = useMemo(() => detailStoreId ? buildDailyTrend(orders.filter(o => o.StoreId === detailStoreId), 14) : [], [orders, detailStoreId]);
  const topSellingMenus = useMemo(() => {
  const menuMap = {};

  const targetOrders = orders.filter(o => {
    if (o.Status !== 'Completed') return false;

    if (
      salesStoreFilter !== 'all' &&
      String(o.StoreId) !== String(salesStoreFilter)
    ) {
      return false;
    }

    return true;
  });

  targetOrders.forEach(order => {
    (order.items || []).forEach(item => {
      const key = item.ProductId || item.ProductName;

      if (!menuMap[key]) {
        menuMap[key] = {
          productId: item.ProductId,
          productName: item.ProductName || '-',
          qty: 0
        };
      }

      menuMap[key].qty += Number(item.Qty || 0);
    });
  });

  return Object.values(menuMap)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);
  }, [orders, salesStoreFilter]);

  /* ---------------- Audit Log ---------------- */
  const filteredLogs = logs.filter(l => {
    if (!auditSearch.trim()) return true;
    const q = auditSearch.toLowerCase();
    return (l.Action || '').toLowerCase().includes(q) || (l.PerformedBy || '').toLowerCase().includes(q)
      || (l.Details || '').toLowerCase().includes(q) || fmtDateTime(l.CreatedAt).includes(q);
  });

  /* ---------------- Financial Report ---------------- */
  const reportOrders = useMemo(() => filterOrdersByRange(orders, rangeStart, rangeEnd, reportStoreFilter), [orders, rangeStart, rangeEnd, reportStoreFilter]);
  const reportSummary = useMemo(() => {
  const filteredStores =
    reportStoreFilter === 'all'
      ? stores
      : stores.filter(
          s => String(s.StoreId) === String(reportStoreFilter)
        );

  return buildStoreSummary(filteredStores, reportOrders);
}, [stores, reportOrders, reportStoreFilter]);

  const reportTypeDefs = [
    { id: 'store', name: 'Store Summary', desc: 'สรุปยอดรายร้านครบทุกมิติ' },
    { id: 'sales', name: 'Sales Report', desc: 'ยอดขายรวมทุกร้าน' },
    { id: 'net', name: 'Net Sales Report', desc: 'ยอดขายสุทธิ' },
    { id: 'cancel', name: 'Cancellation Report', desc: 'รายงานการยกเลิกออเดอร์' },
  ];

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const exportReport = () => {
    const header = ['รหัสร้าน', 'ชื่อร้านค้า', 'ออเดอร์ทั้งหมด', 'ออเดอร์สำเร็จ', 'ออเดอร์ยกเลิก', 'อัตรายกเลิก(%)', 'ยอดขายรวม', 'ยอดขายสุทธิ'];
    const rows = reportSummary.map(s => [s.storeId, s.storeName, s.totalOrders, s.completedOrders, s.cancelledOrders, s.rate, s.grossSales.toFixed(2), s.netSales.toFixed(2)]);
    const typeName = reportTypeDefs.find(r => r.id === reportType)?.name || 'Report';
    if (reportFormat === 'csv') {
      const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), `${typeName}-${rangeStart}_${rangeEnd}.csv`);
    } else {
      const trs = rows.map(r => `<tr>${r.map(v => `<td>${v}</td>`).join('')}</tr>`).join('');
      const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${header.map(h => `<th>${h}</th>`).join('')}</tr>${trs}</table></body></html>`;
      downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }), `${typeName}-${rangeStart}_${rangeEnd}.xls`);
    }
    showToast(`ส่งออก ${typeName} เป็นไฟล์ ${reportFormat.toUpperCase()} สำเร็จ`);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'sales', label: 'Sales Summary', icon: 'sales' },
    { id: 'cancel', label: 'Cancellation Analysis', icon: 'cancel', badge: overview.abnormalStores.length || null },
    { id: 'audit', label: 'Audit Log', icon: 'audit' },
    { id: 'report', label: 'Financial Report', icon: 'report' },
  ];
  const pageTitles = {
    dashboard: ['ภาพรวมศูนย์อาหาร', 'สรุปยอดขายและกระแสเงินหมุนเวียนของศูนย์อาหาร'],
    sales: ['สรุปยอดขายรายร้าน', 'เลือกร้านค้าเพื่อสรุปยอดคำสั่งซื้อและยอดขายสุทธิ ใช้อ้างอิงคำนวณค่าเช่า'],
    cancel: ['วิเคราะห์การยกเลิกคำสั่งซื้อ', 'คำนวณอัตราการยกเลิกของแต่ละร้าน พร้อมแจ้งเตือนอัตโนมัติเมื่อพบความผิดปกติ'],
    audit: ['ประวัติการยกเลิกออเดอร์ (Audit Log)', 'ข้อมูลอ้างอิงเพื่อความโปร่งใส บันทึกแบบแก้ไขย้อนหลังไม่ได้'],
    report: ['ส่งออกรายงานทางการเงิน', 'ส่งออกรายงานเป็นไฟล์สากลเพื่อนำไปใช้งานต่อ'],
  };

  if (loading) {
    return <div className="avx-root"><style>{STYLES}</style><div className="avx-loading">กำลังโหลดข้อมูล...</div></div>;
  }

  return (
    <div className="avx-root">
      <style>{STYLES}</style>
      <div className="avx-shell">
        {/* ===== SIDEBAR ===== */}
        <aside className={`avx-sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="avx-brand">
            <div className="avx-brand-mark">OF</div>
            <div>
              <div className="avx-brand-t1">OF Accounting</div>
              <div className="avx-brand-t2">Only Foods · ศูนย์อาหาร</div>
            </div>
          </div>
          <nav className="avx-nav">
            <div className="avx-nav-label">เมนูหลัก</div>
            {navItems.map(n => (
              <div key={n.id} className={`avx-nav-item${page === n.id ? ' active' : ''}`} onClick={() => goPage(n.id)}>
                <Icon name={n.icon} size={17} /> {n.label}
                {n.badge ? <span className="avx-nav-badge">{n.badge}</span> : null}
              </div>
            ))}
          </nav>
          <div className="avx-sidebar-foot">
            เข้าสู่ระบบในฐานะ<br /><strong>{user?.role || 'Accountant'}</strong><br />
            <span style={{ opacity: .8 }}>{user?.name || user?.FullName || 'เจ้าหน้าที่บัญชี'}</span>
          </div>
        </aside>

        {/* ===== MAIN ===== */}
        <div className="avx-main">
          <header className="avx-topbar">
            <button className="avx-hamburger" onClick={() => setSidebarOpen(o => !o)}><Icon name="menu" size={20} /></button>
            <div className="avx-search"><Icon name="search" size={15} /><span>ค้นหาร้านค้า, Order ID...</span></div>
            <div className="avx-topbar-right">
              <div style={{ position: 'relative' }}>
                <button className="avx-icon-btn" onClick={() => { setNotificationsRead(true); toggleDropdown('notif');}}>
                  <Icon name="bell" size={17} /> {!notificationsRead && overview.abnormalStores.length > 0 && (
                    <span className="avx-dot-badge">{overview.abnormalStores.length}</span>)}
                      </button>
                {dropdown === 'notif' && (
                  <div className="avx-dropdown">
                    <div className="avx-dropdown-head">Notifications <span>{overview.abnormalStores.length} รายการ</span></div>
                    {overview.abnormalStores.length === 0 ? (
                      <div className="avx-empty" style={{ padding: 20 }}>ไม่มีการแจ้งเตือนในขณะนี้</div>
                    ) : overview.abnormalStores.map(s => (
                      <div className="avx-notif-item" key={s.storeId} onClick={() => goPage('cancel')}>
                        <div className="avx-notif-dot" style={{ background: s.status === 'bad' ? 'var(--red)' : 'var(--amber)' }} />
                        <div>
                          <div className="avx-notif-title">{s.storeName} · อัตรายกเลิก {statusLabel(s.status)}</div>
                          <div className="avx-notif-sub">{s.rate}% ({s.cancelledOrders}/{s.totalOrders} ออเดอร์)</div>
                        </div>
                      </div>
                    ))}
                    <div className="avx-dropdown-foot" onClick={() => goPage('cancel')}>ดูการวิเคราะห์ทั้งหมด</div>
                  </div>
                )}
              </div>
              <div className="avx-user-chip">
                <div className="avx-user-avatar">{(user?.name || user?.FullName || 'บช').slice(0, 2)}</div>
                <div>
                  <div className="avx-user-name">{user?.name || user?.FullName || 'เจ้าหน้าที่บัญชี'}</div>
                  <div className="avx-user-role">{user?.role || 'Accountant'}</div>
                </div>
              </div>
            </div>
          </header>

          <main className="avx-content">
            <div className="avx-page-head">
              <div><h1>{pageTitles[page][0]}</h1><p>{pageTitles[page][1]}</p></div>
              {page === 'dashboard' && (
                <button className="avx-btn avx-btn-ghost" onClick={() => { fetchData(); showToast('รีเฟรชข้อมูลล่าสุดแล้ว'); }}>
                  <Icon name="refresh" size={14} /> รีเฟรชข้อมูล
                </button>
              )}
              {page !== 'dashboard' && lastUpdated && (
                <small style={{ color: 'var(--text-400)' }}>อัปเดตล่าสุด {lastUpdated.toLocaleTimeString('th-TH')}</small>
              )}
            </div>

            {/* ================= DASHBOARD ================= */}
            {page === 'dashboard' && (
              <>
                <div className="avx-cards-row">
                  <StatCard label="ยอดขายสุทธิรวม" value={`฿${fmtMoney(overview.totalGross)}`} />
                  <StatCard label="จำนวนออเดอร์ทั้งหมด" value={overview.totalOrders} />
                  <StatCard label="จำนวนออเดอร์ที่ยกเลิก" value={overview.totalCancelled} />
                  <StatCard label="อัตราการยกเลิกรวม" value={`${overview.rate}%`} tone={overview.rate > RATE_BAD ? 'bad' : overview.rate >= RATE_WARN ? 'warn' : 'ok'} />
                </div>
                <div className="avx-grid-2">
                  <div className="avx-panel">
                    <div className="avx-panel-head">
                      <div>
                        <h3>{trendDays === 'today' ? 'ยอดขายรายชั่วโมง (วันนี้)' : 'ยอดขายรายวัน'}</h3>
                        <div className="avx-sub">
                          {trendDays === 'today'
                            ? 'เฉพาะออเดอร์ที่สำเร็จ · เริ่มจากชั่วโมงของออเดอร์แรก ถึงชั่วโมงของออเดอร์สุดท้าย'
                            : 'เฉพาะออเดอร์ที่สำเร็จ'}
                        </div>
                      </div>
                      <div className="avx-seg">
                        <button className={trendDays === 'today' ? 'active' : ''} onClick={() => setTrendDays('today')}>วันนี้</button>
                        {[7, 14, 30].map(n => <button key={n} className={trendDays === n ? 'active' : ''} onClick={() => setTrendDays(n)}>{n} วัน</button>)}
                      </div>
                    </div>
                    {trendDays === 'today' && dashboardTrend.length === 0 ? (
                      <div className="avx-empty">วันนี้ยังไม่มีคำสั่งซื้อเข้ามา</div>
                    ) : (
                      <BarChart data={dashboardTrend} color="var(--teal)" money />
                    )}
                  </div>
                  <div className="avx-panel">
                    <div className="avx-panel-head"><div><h3>ยอดขายแยกร้าน</h3><div className="avx-sub">เรียงตามยอดขายสูงสุด</div></div></div>
                    <BarChart data={storeSummary.slice(0, 6).map(s => ({ label: s.storeName, amount: s.grossSales, color: s.color }))} perBarColor money />
                  </div>
                </div>
                <div className="avx-panel">
                  <div className="avx-panel-head">
                    <div><h3>ร้านค้าที่ต้องจับตา</h3><div className="avx-sub">คัดกรองจากอัตราการยกเลิก</div></div>
                    <button className="avx-btn avx-btn-ghost" onClick={() => goPage('cancel')}>ดูการวิเคราะห์ทั้งหมด</button>
                  </div>
                  <div className="avx-scroll-x">
                    <table className="avx-table">
                      <thead><tr><th>ร้าน</th><th>Orders</th><th>ยอดขาย</th><th>Cancel</th><th>Rate</th><th>สถานะ</th></tr></thead>
                      <tbody>
                        {storeSummary.length === 0 && <tr><td colSpan="6" className="avx-empty-row">ยังไม่มีข้อมูล</td></tr>}
                        {[...storeSummary].sort((a, b) => b.rate - a.rate).slice(0, 5).map(s => (
                          <tr key={s.storeId}>
                            <td><div className="avx-store-name"><span className="avx-dot" style={{ background: s.color }} /><b>{s.storeName}</b></div></td>
                            <td className="avx-num">{s.totalOrders}</td>
                            <td className="avx-num">฿{fmtMoney(s.grossSales)}</td>
                            <td className="avx-num">{s.cancelledOrders}</td>
                            <td className="avx-num">{s.rate}%</td>
                            <td><Badge tone={s.status}>{statusLabel(s.status)}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ================= SALES SUMMARY ================= */}
            {page === 'sales' && (
              <>
                <div className="avx-filter-bar">
                  <div className="avx-field">
                    <label>ร้านค้า</label>
                    <select
                      value={salesStoreFilter}
                      onChange={e => {
                        setSalesStoreFilter(e.target.value);
                        setDetailStoreId(null);
                      }}
                    >
                      <option value="all">ทุกร้านค้า</option>
                      {storeSummary.map(s => (
                        <option key={s.storeId} value={s.storeId}>
                          {s.storeName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    className="avx-btn avx-btn-primary"
                    onClick={() => showToast('อัปเดตตารางยอดขายแล้ว')}
                  >
                    <Icon name="search" size={14} /> ค้นหา
                  </button>
                </div>

                <div className="avx-cards-row">
                  <StatCard
                    label="ยอดขายรวม"
                    value={`฿${fmtMoney(salesFilteredSum.gross)}`}
                  />
                  <StatCard
                    label="ยอดขายสุทธิ"
                    value={`฿${fmtMoney(salesFilteredSum.net)}`}
                  />
                  <StatCard
                    label="Orders สำเร็จ"
                    value={salesFilteredSum.completed}
                  />
                  <StatCard
                    label="Orders ยกเลิก"
                    value={salesFilteredSum.cancelled}
                  />
                </div>

                {/* ================= SALES SUMMARY PANEL ================= */}
                <div className="avx-panel">
                  <div className="avx-panel-head">
                    <div>
                      <h3>ตารางยอดขายรายร้าน</h3>
                      <div className="avx-sub">
                        คลิกที่แถวเพื่อดูรายละเอียดเชิงลึกของร้าน
                      </div>
                    </div>
                  </div>

                  {/* ตารางยอดขาย */}
                  <div className="avx-scroll-x">
                    <table className="avx-table">
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
                        {salesFilteredRows.length === 0 && (
                          <tr>
                            <td colSpan="6" className="avx-empty-row">
                              ไม่พบข้อมูล
                            </td>
                          </tr>
                        )}

                        {salesFilteredRows.map(s => (
                          <tr
                            key={s.storeId}
                            className="avx-clickable"
                            onClick={() => setDetailStoreId(s.storeId)}
                          >
                            <td>
                              <div className="avx-store-name">
                                <span
                                  className="avx-dot"
                                  style={{ background: s.color }}
                                />
                                <b>{s.storeName}</b>
                              </div>
                            </td>

                            <td className="avx-num">
                              {s.completedOrders}
                            </td>

                            <td className="avx-num">
                              ฿{fmtMoney(s.grossSales)}
                            </td>

                            <td
                              className="avx-num"
                              style={{ color: 'var(--red)' }}
                            >
                              {s.cancelledOrders} ({s.rate}%)
                            </td>

                            <td
                              className="avx-num"
                              style={{ fontWeight: 700 }}
                            >
                              ฿{fmtMoney(s.netSales)}
                            </td>

                            <td>
                              <span className="avx-link">
                                ดูรายละเอียด →
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* ================= TOP 10 MENU ================= */}
                  <div
                    style={{
                      marginTop: 20,
                      paddingTop: 18,
                      borderTop: '1px solid var(--border-soft)',
                    }}
                  >
                    <div className="avx-panel-head">
                      <div>
                        <h3>เมนูขายดี Top 10</h3>
                        <div className="avx-sub">
                          จัดอันดับตามจำนวนที่ขายได้
                        </div>
                      </div>
                    </div>

                    {topSellingMenus.length === 0 ? (
                      <div className="avx-empty">
                        ยังไม่มีข้อมูลการขาย
                      </div>
                    ) : (
                      <div className="avx-scroll-x">
                        <table className="avx-table">
                          <thead>
                            <tr>
                              <th style={{ width: 70 }}>อันดับ</th>
                              <th>เมนู</th>
                              <th>จำนวนที่ขาย</th>
                            </tr>
                          </thead>

                          <tbody>
                            {topSellingMenus.map((item, index) => (
                              <tr key={item.productId || item.productName}>
                                <td className="avx-num">
                                  #{index + 1}
                                </td>

                                <td>
                                  <b>{item.productName}</b>
                                </td>

                                <td className="avx-num">
                                  {item.qty} ชิ้น
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* ================= STORE DETAIL ================= */}
                {detailStore && (
                  <div
                    className="avx-panel"
                    style={{ marginTop: 14 }}
                  >
                    <div
                      className="avx-back"
                      onClick={() => setDetailStoreId(null)}
                    >
                      <Icon name="back" size={14} /> กลับไปตารางสรุป
                    </div>

                    <div
                      className="avx-panel-head"
                      style={{ marginTop: 12 }}
                    >
                      <div>
                        <h3>{detailStore.storeName}</h3>
                        <div className="avx-sub">
                          รายละเอียดยอดขายรายวัน (14 วันล่าสุดที่มีออเดอร์)
                        </div>
                      </div>

                      <Badge tone={detailStore.status}>
                        {statusLabel(detailStore.status)}
                        {detailStore.status !== 'ok'
                          ? ` · Cancel ${detailStore.rate}%`
                          : ''}
                      </Badge>
                    </div>

                    <div className="avx-mini-stats">
                      <MiniStat
                        label="ยอดขายรวม"
                        value={`฿${fmtMoney(detailStore.grossSales)}`}
                      />
                      <MiniStat
                        label="ยอดสุทธิ"
                        value={`฿${fmtMoney(detailStore.netSales)}`}
                      />
                      <MiniStat
                        label="Orders"
                        value={detailStore.totalOrders}
                      />
                      <MiniStat
                        label="Canceled"
                        value={detailStore.cancelledOrders}
                      />
                    </div>

                    <BarChart
                      data={detailTrend}
                      color={detailStore.color}
                      money
                      small
                    />
                  </div>
                )}
              </>
            )}

            {/* ================= CANCELLATION ANALYSIS ================= */}
            {page === 'cancel' && (
              <>
                <p className="avx-hint">เกณฑ์: ปกติ &lt; {RATE_WARN}% · เฝ้าระวัง {RATE_WARN}–{RATE_BAD}% · สูงผิดปกติ &gt; {RATE_BAD}%</p>
                <div className="avx-cards-row">
                  <StatCard label="Order ทั้งหมด" value={overview.totalOrders} />
                  <StatCard label="Cancelled" value={overview.totalCancelled} />
                  <StatCard label="Cancellation Rate เฉลี่ย" value={`${overview.rate}%`} />
                  <StatCard label="ร้านที่ผิดปกติ" value={`${overview.abnormalStores.length} ร้าน`} tone={overview.abnormalStores.length ? 'bad' : 'ok'} />
                </div>
                <div className="avx-grid-2">
                  <div className="avx-panel">
                    <div className="avx-panel-head"><div><h3>Cancellation Rate by Store</h3><div className="avx-sub">สีบอกระดับความรุนแรง</div></div></div>
                    <BarChart data={storeSummary.map(s => ({ label: s.storeName, amount: s.rate, color: s.status === 'bad' ? '#C4433D' : s.status === 'warn' ? '#C97F1E' : '#2F8F62' }))} perBarColor />
                    <div className="avx-legend">
                      <span><i style={{ background: '#2F8F62' }} /> ปกติ &lt; {RATE_WARN}%</span>
                      <span><i style={{ background: '#C97F1E' }} /> เฝ้าระวัง {RATE_WARN}–{RATE_BAD}%</span>
                      <span><i style={{ background: '#C4433D' }} /> ผิดปกติ &gt; {RATE_BAD}%</span>
                    </div>
                  </div>
                  <div className="avx-panel">
                    <div className="avx-panel-head"><div><h3>Cancellation Alert</h3><div className="avx-sub">คำนวณสดจากข้อมูลล่าสุด</div></div></div>
                    {overview.abnormalStores.length === 0 ? (
                      <div className="avx-empty">ไม่พบร้านค้าที่มีอัตราการยกเลิกผิดปกติ</div>
                    ) : overview.abnormalStores.map(s => (
                      <div className={`avx-alert-item ${s.status}`} key={s.storeId}>
                        <div className="avx-alert-ico"><Icon name="warn" size={15} /></div>
                        <div>
                          <div className="avx-alert-title">{s.storeName}</div>
                          <div className="avx-alert-sub">อัตราการยกเลิก {s.rate}% {s.status === 'bad' ? `สูงกว่าเกณฑ์ ${RATE_BAD}%` : `อยู่ในช่วงเฝ้าระวัง (${RATE_WARN}–${RATE_BAD}%)`}</div>
                          <span className="avx-link" onClick={() => { setDetailStoreId(s.storeId); goPage('sales'); }}>ดูรายละเอียดร้าน →</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="avx-panel">
                  <div className="avx-panel-head"><div><h3>ตารางอัตราการยกเลิกรายร้าน</h3></div></div>
                  <div className="avx-scroll-x">
                    <table className="avx-table">
                      <thead><tr><th>ร้าน</th><th>Orders</th><th>Cancelled</th><th>Rate</th><th>สถานะ</th></tr></thead>
                      <tbody>
                        {storeSummary.map(s => (
                          <tr key={s.storeId}>
                            <td><div className="avx-store-name"><span className="avx-dot" style={{ background: s.color }} /><b>{s.storeName}</b></div></td>
                            <td className="avx-num">{s.totalOrders}</td>
                            <td className="avx-num">{s.cancelledOrders}</td>
                            <td className="avx-num">{s.rate}%</td>
                            <td><Badge tone={s.status}>{statusLabel(s.status)}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ================= AUDIT LOG ================= */}
            {page === 'audit' && (
              <>
                <div className="avx-page-flag"><span className="avx-readonly-flag"><Icon name="lock" size={12} /> Read Only · แก้ไขย้อนหลังไม่ได้</span></div>
                <div className="avx-filter-bar">
                  <div className="avx-field" style={{ flex: 1, minWidth: 240 }}>
                    <label>ค้นหา</label>
                    <input type="text" placeholder="การกระทำ, ผู้ทำรายการ, รายละเอียด หรือวันที่..." value={auditSearch} onChange={e => setAuditSearch(e.target.value)} />
                  </div>
                </div>
                <div className="avx-panel">
                  <div className="avx-panel-head"><div><h3>ประวัติการทำรายการในระบบ</h3><div className="avx-sub">คลิกที่แถวเพื่อดูรายละเอียด</div></div></div>
                  <div className="avx-scroll-x">
                    <table className="avx-table">
                      <thead><tr><th>เวลา</th><th>การกระทำ</th><th>ผู้ทำรายการ</th><th>รายละเอียดเพิ่มเติม</th></tr></thead>
                      <tbody>
                        {filteredLogs.length === 0 && <tr><td colSpan="4" className="avx-empty-row">ไม่พบรายการ</td></tr>}
                        {filteredLogs.map(l => (
                          <tr key={l.LogID} className="avx-clickable" onClick={() => setAuditModalLog(l)}>
                            <td className="avx-num">{fmtDateTime(l.CreatedAt)}</td>
                            <td><Badge tone={l.Action === 'CREATE_ORDER' ? 'ok' : l.Action?.includes('CANCEL') || l.Action?.includes('REJECT') ? 'bad' : 'neutral'}>{l.Action}</Badge></td>
                            <td>{l.PerformedBy}</td>
                            <td className="avx-truncate">{l.Details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ================= FINANCIAL REPORT ================= */}
            {page === 'report' && (
              <>
                <div className="avx-panel" style={{ marginBottom: 14 }}>
                  <div className="avx-panel-head"><div><h3>1. เลือกประเภทรายงาน</h3></div></div>
                  <div className="avx-report-types">
                    {reportTypeDefs.map(r => (
                      <div key={r.id} className={`avx-rt-option${reportType === r.id ? ' selected' : ''}`} onClick={() => setReportType(r.id)}>
                        <div className="avx-rt-radio" />
                        <div><div className="avx-rt-t1">{r.name}</div><div className="avx-rt-t2">{r.desc}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="avx-filter-bar" style={{ marginBottom: 14 }}>
                  <div className="avx-field"><label>ตั้งแต่วันที่</label><input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} /></div>
                  <div className="avx-field"><label>ถึงวันที่</label><input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} /></div>
                  <div className="avx-field">
                    <label>ร้านค้า</label>
                    <select value={reportStoreFilter} onChange={e => setReportStoreFilter(e.target.value)}>
                      <option value="all">ทุกร้านค้า</option>
                      {storeSummary.map(s => <option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}
                    </select>
                  </div>
                </div>
                <div className="avx-panel" style={{ marginBottom: 14 }}>
                  <div className="avx-panel-head"><div><h3>2. ตัวอย่างรายงานก่อน Export</h3><div className="avx-sub">{rangeStart} ถึง {rangeEnd}</div></div></div>
                  <div className="avx-scroll-x">
                    <table className="avx-table">
                      <thead>
                        <tr>
                          <th>Store</th><th>Orders</th>
                          {reportType !== 'net' && reportType !== 'cancel' && <th>Gross Sales</th>}
                          {(reportType === 'cancel' || reportType === 'store') && <><th>Cancel</th><th>Rate</th></>}
                          {reportType !== 'sales' && reportType !== 'cancel' && <th>Net Sales</th>}
                          {reportType === 'cancel' && <th>Status</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {reportSummary.length === 0 && <tr><td colSpan="7" className="avx-empty-row">ไม่พบข้อมูลในช่วงเวลาที่เลือก</td></tr>}
                        {reportSummary.map(s => (
                          <tr key={s.storeId}>
                            <td><div className="avx-store-name"><span className="avx-dot" style={{ background: s.color }} />{s.storeName}</div></td>
                            <td className="avx-num">{s.totalOrders}</td>
                            {reportType !== 'net' && reportType !== 'cancel' && <td className="avx-num">฿{fmtMoney(s.grossSales)}</td>}
                            {(reportType === 'cancel' || reportType === 'store') && <><td className="avx-num">{s.cancelledOrders}</td><td className="avx-num">{s.rate}%</td></>}
                            {reportType !== 'sales' && reportType !== 'cancel' && <td className="avx-num" style={{ fontWeight: 700 }}>฿{fmtMoney(s.netSales)}</td>}
                            {reportType === 'cancel' && <td><Badge tone={s.status}>{statusLabel(s.status)}</Badge></td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="avx-panel">
                  <div className="avx-panel-head"><div><h3>3. เลือกรูปแบบไฟล์ Export</h3></div></div>
                  <div className="avx-export-formats">
                    <div className={`avx-fmt-btn${reportFormat === 'csv' ? ' selected' : ''}`} onClick={() => setReportFormat('csv')}>
                      <Icon name="download" size={22} /><div className="avx-fmt-name">CSV (.csv)</div><div className="avx-fmt-desc">ไฟล์ข้อมูลสากล เปิดได้ทุกโปรแกรม</div>
                    </div>
                    <div className={`avx-fmt-btn${reportFormat === 'xls' ? ' selected' : ''}`} onClick={() => setReportFormat('xls')}>
                      <Icon name="download" size={22} /><div className="avx-fmt-name">Excel (.xls)</div><div className="avx-fmt-desc">เปิดตรงใน Microsoft Excel</div>
                    </div>
                  </div>
                  <button className="avx-btn avx-btn-primary avx-btn-block" onClick={exportReport}><Icon name="download" size={15} /> Export Report</button>
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      {/* ===== Audit detail modal ===== */}
      {auditModalLog && (
        <div className="avx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setAuditModalLog(null); }}>
          <div className="avx-modal-box">
            <div className="avx-modal-head">
              <h3>รายละเอียดรายการ</h3>
              <button className="avx-modal-close" onClick={() => setAuditModalLog(null)}><Icon name="close" size={18} /></button>
            </div>
            <div className="avx-modal-body">
              <div className="avx-kv"><span>Log ID</span><b>#{auditModalLog.LogID}</b></div>
              <div className="avx-kv"><span>การกระทำ</span><b>{auditModalLog.Action}</b></div>
              <div className="avx-kv"><span>ผู้ดำเนินการ</span><b>{auditModalLog.PerformedBy}</b></div>
              <div className="avx-kv"><span>รายละเอียด</span><b style={{ textAlign: 'right', maxWidth: 260 }}>{auditModalLog.Details}</b></div>
              <div className="avx-kv"><span>เวลาที่บันทึก</span><b>{fmtDateTime(auditModalLog.CreatedAt)}</b></div>
            </div>
            <div className="avx-modal-foot"><span className="avx-readonly-flag outline"><Icon name="lock" size={12} /> บันทึกนี้แก้ไขย้อนหลังไม่ได้</span></div>
          </div>
        </div>
      )}

      {/* ===== Toast ===== */}
      <div className={`avx-toast${toast.show ? ' show' : ''}`}><Icon name="check" size={15} />{toast.msg}</div>
    </div>
  );
}

/* ============================================================
   STYLES — ฝังใน component เดียว ไม่ต้องเพิ่มไฟล์ CSS ใหม่
   ============================================================ */
const STYLES = `
.avx-root{
  --navy-950:#0B1E33; --navy-900:#102943; --bg:#F3F5F8; --card:#FFFFFF;
  --border:#E2E7EE; --border-soft:#EDF0F4; --text-900:#131C2B; --text-600:#4B5768; --text-400:#8A94A6;
  --teal:#0E7C7B; --teal-dark:#0A5F5E; --teal-soft:#E4F3F2;
  --amber:#C97F1E; --amber-soft:#FBF0DD; --red:#C4433D; --red-soft:#FBEAE9; --green:#2F8F62; --green-soft:#E7F5EE;
  font-family:'Sarabun',-apple-system,sans-serif;
  color:var(--text-900);
  background:var(--bg);

  width:100%;
  min-height:100vh;

  border-radius:14px;
  overflow:hidden;
  box-shadow:0 1px 3px rgba(11,30,51,0.08);
}
.avx-loading{padding:60px;text-align:center;color:var(--text-400);}
.avx-shell{
  display:flex;
  min-height:100vh;
  height:100%;
}

.avx-sidebar{
  width:224px;
  flex-shrink:0;
  min-height:100vh;
  background:linear-gradient(185deg,var(--navy-950),var(--navy-900) 70%);
  color:#EAF1F8;
  display:flex;
  flex-direction:column;
}
.avx-brand{display:flex;align-items:center;gap:10px;padding:18px 16px;border-bottom:1px solid rgba(255,255,255,0.08);}
.avx-brand-mark{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--teal),#12A3A1);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;flex-shrink:0;}
.avx-brand-t1{font-weight:700;font-size:14px;}
.avx-brand-t2{font-size:10.5px;color:#9FB1C4;margin-top:1px;}
.avx-nav{padding:12px 10px;display:flex;flex-direction:column;gap:2px;flex:1;}
.avx-nav-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#7690A8;padding:8px 10px 4px;font-weight:600;}
.avx-nav-item{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:8px;color:#C7D5E3;font-size:13.5px;font-weight:500;cursor:pointer;border:1px solid transparent;}
.avx-nav-item:hover{background:rgba(255,255,255,0.06);color:#fff;}
.avx-nav-item.active{background:rgba(14,124,123,0.22);color:#fff;border-color:rgba(18,163,161,0.35);}
.avx-nav-badge{margin-left:auto;background:var(--red);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:20px;}
.avx-sidebar-foot{padding:12px 16px 16px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:#9FB1C4;line-height:1.6;}
.avx-main{flex:1;min-width:0;display:flex;flex-direction:column;}
.avx-topbar{display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border);background:rgba(255,255,255,0.6);}
.avx-hamburger{display:none;background:none;border:none;cursor:pointer;color:var(--text-900);}
.avx-search{flex:1;max-width:280px;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--border);border-radius:9px;padding:7px 11px;color:var(--text-400);font-size:13px;}
.avx-topbar-right{margin-left:auto;display:flex;align-items:center;gap:10px;}
.avx-icon-btn{position:relative;width:34px;height:34px;border-radius:9px;background:#fff;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-600);}
.avx-icon-btn:hover{border-color:var(--teal);color:var(--teal);}
.avx-dot-badge{position:absolute;top:-4px;right:-4px;background:var(--red);color:#fff;font-size:9.5px;font-weight:700;min-width:15px;height:15px;border-radius:20px;display:flex;align-items:center;justify-content:center;padding:0 3px;border:2px solid var(--bg);}
.avx-user-chip{display:flex;align-items:center;gap:8px;padding:4px 10px 4px 4px;background:#fff;border:1px solid var(--border);border-radius:30px;}
.avx-user-avatar{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#2A5C87,var(--teal));color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;}
.avx-user-name{font-size:12.5px;font-weight:600;}
.avx-user-role{font-size:10px;color:var(--text-400);}
.avx-dropdown{position:absolute;top:44px;right:0;width:300px;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 12px 32px rgba(11,30,51,0.16);z-index:50;overflow:hidden;}
.avx-dropdown-head{padding:12px 14px;border-bottom:1px solid var(--border-soft);font-weight:700;font-size:13px;display:flex;justify-content:space-between;align-items:center;}
.avx-dropdown-head span{font-size:11px;color:var(--text-400);font-weight:500;}
.avx-notif-item{padding:11px 14px;border-bottom:1px solid var(--border-soft);cursor:pointer;display:flex;gap:9px;}
.avx-notif-item:hover{background:var(--bg);}
.avx-notif-dot{width:7px;height:7px;border-radius:50%;margin-top:5px;flex-shrink:0;}
.avx-notif-title{font-size:12.5px;font-weight:600;}
.avx-notif-sub{font-size:11.5px;color:var(--text-600);margin-top:2px;}
.avx-dropdown-foot{padding:10px 14px;text-align:center;font-size:12px;font-weight:600;color:var(--teal-dark);cursor:pointer;}
.avx-dropdown-foot:hover{background:var(--teal-soft);}
.avx-content{padding:20px 24px 40px;overflow-y:auto;}
.avx-page-head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;gap:12px;flex-wrap:wrap;}
.avx-page-head h1{font-size:19px;margin:0 0 3px;font-weight:700;}
.avx-page-head p{margin:0;color:var(--text-600);font-size:12.5px;}
.avx-page-flag{margin-bottom:14px;}
.avx-btn{border:none;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit;}
.avx-btn-primary{background:var(--teal);color:#fff;}
.avx-btn-primary:hover{background:var(--teal-dark);}
.avx-btn-ghost{background:#fff;color:var(--text-900);border:1px solid var(--border);}
.avx-btn-ghost:hover{border-color:var(--teal);color:var(--teal);}
.avx-btn-block{width:100%;justify-content:center;padding:12px;margin-top:14px;}
.avx-cards-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px;}
.avx-stat-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;}
.avx-stat-label{font-size:11.5px;color:var(--text-600);font-weight:500;}
.avx-stat-value{font-size:20px;font-weight:700;margin-top:6px;}
.avx-stat-value.tone-bad{color:var(--red);} .avx-stat-value.tone-warn{color:var(--amber);} .avx-stat-value.tone-ok{color:var(--green);}
.avx-grid-2{display:grid;grid-template-columns:1.4fr 1fr;gap:12px;margin-bottom:14px;}
.avx-panel{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 18px;}
.avx-panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;flex-wrap:wrap;}
.avx-panel-head h3{font-size:14px;margin:0;font-weight:700;}
.avx-sub{font-size:11.5px;color:var(--text-400);margin-top:2px;}
.avx-seg{display:flex;background:var(--bg);border-radius:8px;padding:3px;gap:2px;}
.avx-seg button{border:none;background:none;font-family:inherit;font-size:11.5px;font-weight:600;color:var(--text-600);padding:5px 10px;border-radius:6px;cursor:pointer;}
.avx-seg button.active{background:#fff;color:var(--navy-900);box-shadow:0 1px 3px rgba(0,0,0,0.08);}
/* กราฟแท่งใหม่ (มีแกน Y + Grid) */
.avx-barchart-wrapper { display: flex; gap: 8px; height: 210px; margin-top: 10px; width: 100%; }
.avx-barchart-wrapper.small { height: 160px; }
.avx-y-axis { display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 24px; font-size: 10px; color: var(--text-400); text-align: right; min-width: 32px; font-family: 'JetBrains Mono', monospace; }
.avx-bars { flex: 1; display: flex; gap: 4px; position: relative; min-width: 0; }
.avx-grid-lines { position: absolute; top: 0; bottom: 24px; left: 0; right: 0; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; z-index: 0; }
.avx-grid-line { width: 100%; height: 1px; background: var(--border-soft); border-top: 1px dashed var(--border-soft); }
.avx-bar-col { flex: 1; min-width: 0; display: flex; flex-direction: column; z-index: 1; }
.avx-bar-track { flex: 1; display: flex; align-items: flex-end; }
.avx-bar { width: 100%; border-radius: 4px 4px 0 0; min-height: 2px; transition: height .3s; }
.avx-bar-label { height: 24px; font-size: 9.5px; color: var(--text-400); display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap; }
.avx-legend{display:flex;gap:14px;margin-top:10px;font-size:11px;color:var(--text-600);flex-wrap:wrap;}
.avx-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;}
.avx-table{width:100%;border-collapse:collapse;font-size:13px;}
.avx-table thead th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-400);font-weight:700;padding:0 10px 8px;border-bottom:1px solid var(--border);}
.avx-table tbody td{padding:10px;border-bottom:1px solid var(--border-soft);}
.avx-table tbody tr:last-child td{border-bottom:none;}
.avx-clickable{cursor:pointer;}
.avx-clickable:hover{background:var(--bg);}
.avx-empty-row{text-align:center;color:var(--text-400);padding:18px;}
.avx-num{font-family:'JetBrains Mono',monospace;font-size:12.5px;}
.avx-store-name{display:flex;align-items:center;gap:8px;}
.avx-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.avx-truncate{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.avx-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;}
.avx-badge.tone-ok{background:var(--green-soft);color:var(--green);}
.avx-badge.tone-warn{background:var(--amber-soft);color:var(--amber);}
.avx-badge.tone-bad{background:var(--red-soft);color:var(--red);}
.avx-badge.tone-neutral{background:var(--teal-soft);color:var(--teal-dark);}
.avx-badge-dot{width:5px;height:5px;border-radius:50%;background:currentColor;}
.avx-filter-bar{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;}
.avx-field{display:flex;flex-direction:column;gap:5px;}
.avx-field label{font-size:11px;font-weight:600;color:var(--text-600);}
.avx-field select,.avx-field input{border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-family:inherit;font-size:13px;color:var(--text-900);background:#fff;min-width:150px;}
.avx-field select:focus,.avx-field input:focus{outline:2px solid var(--teal);outline-offset:1px;border-color:var(--teal);}
.avx-hint{font-size:11.5px;color:var(--text-400);margin:-6px 0 14px;}
.avx-back{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--teal-dark);cursor:pointer;}
.avx-mini-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0 14px;}
.avx-mini-stat{background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:10px 12px;}
.avx-mini-label{font-size:10.5px;color:var(--text-400);font-weight:600;}
.avx-mini-value{font-size:16px;font-weight:700;margin-top:3px;}
.avx-alert-item{display:flex;gap:10px;align-items:flex-start;padding:11px 12px;border-radius:9px;border:1px solid var(--border-soft);margin-bottom:8px;}
.avx-alert-item:last-child{margin-bottom:0;}
.avx-alert-item.bad{border-left:3px solid var(--red);}
.avx-alert-item.warn{border-left:3px solid var(--amber);}
.avx-alert-ico{width:28px;height:28px;border-radius:7px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--red-soft);color:var(--red);}
.avx-alert-item.warn .avx-alert-ico{background:var(--amber-soft);color:var(--amber);}
.avx-alert-title{font-size:12.5px;font-weight:700;}
.avx-alert-sub{font-size:11.5px;color:var(--text-600);margin-top:2px;line-height:1.5;}
.avx-link{font-size:11.5px;font-weight:700;color:var(--teal-dark);margin-top:5px;cursor:pointer;display:inline-block;}
.avx-empty{font-size:12px;color:var(--text-400);text-align:center;padding:16px 0;}
.avx-scroll-x{overflow-x:auto;}
.avx-readonly-flag{display:inline-flex;align-items:center;gap:6px;background:var(--navy-950);color:#fff;font-size:11px;font-weight:700;padding:6px 11px;border-radius:8px;}
.avx-readonly-flag.outline{background:transparent;color:var(--text-600);border:1px dashed var(--border);}
.avx-report-types{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;}
.avx-rt-option{border:1.5px solid var(--border);border-radius:9px;padding:11px 12px;cursor:pointer;display:flex;align-items:center;gap:9px;background:#fff;}
.avx-rt-option:hover{border-color:var(--teal);}
.avx-rt-option.selected{border-color:var(--teal);background:var(--teal-soft);}
.avx-rt-radio{width:15px;height:15px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;position:relative;}
.avx-rt-option.selected .avx-rt-radio{border-color:var(--teal);}
.avx-rt-option.selected .avx-rt-radio::after{content:"";position:absolute;inset:2.5px;background:var(--teal);border-radius:50%;}
.avx-rt-t1{font-size:12.5px;font-weight:600;}
.avx-rt-t2{font-size:10.5px;color:var(--text-400);}
.avx-export-formats{display:flex;gap:10px;}
.avx-fmt-btn{flex:1;border:1.5px solid var(--border);border-radius:9px;padding:14px;text-align:center;cursor:pointer;background:#fff;color:var(--teal-dark);}
.avx-fmt-btn.selected{border-color:var(--teal);background:var(--teal-soft);}
.avx-fmt-name{font-size:12.5px;font-weight:700;color:var(--text-900);margin-top:4px;}
.avx-fmt-desc{font-size:10.5px;color:var(--text-400);margin-top:2px;}
.avx-modal-overlay{position:fixed;inset:0;background:rgba(11,30,51,0.45);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;}
.avx-modal-box{background:#fff;border-radius:14px;width:100%;max-width:440px;box-shadow:0 24px 60px rgba(11,30,51,0.25);overflow:hidden;font-family:'Sarabun',sans-serif;}
.avx-modal-head{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;}
.avx-modal-head h3{margin:0;font-size:15px;}
.avx-modal-close{cursor:pointer;color:var(--text-400);background:none;border:none;padding:4px;}
.avx-modal-body{padding:16px 20px;}
.avx-kv{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-soft);font-size:13px;}
.avx-kv:last-child{border-bottom:none;}
.avx-kv span{color:var(--text-600);flex-shrink:0;}
.avx-modal-foot{padding:14px 20px;background:var(--bg);border-top:1px solid var(--border);text-align:center;}
.avx-toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(16px);background:var(--navy-950);color:#fff;padding:11px 18px;border-radius:9px;font-size:12.5px;font-weight:600;box-shadow:0 12px 30px rgba(0,0,0,0.25);display:flex;align-items:center;gap:8px;z-index:300;opacity:0;pointer-events:none;transition:opacity .25s ease, transform .25s ease;font-family:'Sarabun',sans-serif;}
.avx-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
.avx-toast svg{color:#4FD6C9;}
@media (max-width:1000px){
  .avx-cards-row{grid-template-columns:repeat(2,1fr);}
  .avx-grid-2{grid-template-columns:1fr;}
  .avx-mini-stats{grid-template-columns:repeat(2,1fr);}
  .avx-report-types{grid-template-columns:1fr;}
}
@media (max-width:760px){
  .avx-sidebar{position:fixed;left:0;top:0;bottom:0;transform:translateX(-100%);z-index:100;height:100%;}
  .avx-sidebar.open{transform:translateX(0);}
  .avx-hamburger{display:flex;}
  .avx-search{display:none;}
  .avx-content{padding:16px;}
}
`;