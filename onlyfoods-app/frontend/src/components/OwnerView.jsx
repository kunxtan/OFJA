import React, { useState, useEffect, useMemo } from 'react';

/* ============================================================
   OF Shop Owner — แดชบอร์ดเจ้าของร้านค้า
   ============================================================ */

const fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// --- Helper Functions สำหรับคำนวณกราฟแบบ Executive ---
function parseOrderDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const normalized = String(value).trim().replace(' ', 'T');
  const alreadyHasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(alreadyHasTimezone ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getPeriodBounds(days) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { start, end };
}

function ordersInsidePeriod(orders, days, storeId = null) {
  const { start, end } = getPeriodBounds(days);
  return (orders || []).filter(order => {
    const createdAt = parseOrderDate(order.CreatedAt);
    const correctStore = storeId === null || String(order.StoreId) === String(storeId);
    return createdAt && createdAt >= start && createdAt < end && correctStore;
  });
}

function orderIs(order, status) {
  return String(order.Status || '').toLowerCase() === status.toLowerCase();
}

function buildTrend(completedOrders, days) {
  const { start } = getPeriodBounds(days);
  if (days === 1) {
    return Array.from({ length: 24 }, (_, hour) => {
      const sales = completedOrders
        .filter(order => parseOrderDate(order.CreatedAt)?.getHours() === hour)
        .reduce((sum, order) => sum + Number(order.TotalAmount || 0), 0);
      return { label: `${String(hour).padStart(2, '0')}:00`, sales };
    });
  }
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const sales = completedOrders
      .filter(order => {
        const createdAt = parseOrderDate(order.CreatedAt);
        return createdAt && createdAt.getFullYear() === year &&
          createdAt.getMonth() === month && createdAt.getDate() === day;
      })
      .reduce((sum, order) => sum + Number(order.TotalAmount || 0), 0);
    return {
      label: `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}`,
      sales
    };
  });
}

function buildStoreReport(orders, storeId, days) {
  const periodOrders = ordersInsidePeriod(orders, days, storeId);
  const completed = periodOrders.filter(order => orderIs(order, 'Completed'));
  const cancelled = periodOrders.filter(order => orderIs(order, 'Cancelled'));
  const totalSales = completed.reduce((sum, order) => sum + Number(order.TotalAmount || 0), 0);
  const finishedCount = completed.length + cancelled.length;

  return {
    total_sales: totalSales,
    total_orders: completed.length,
    total_cancelled: cancelled.length,
    average_order: completed.length ? totalSales / completed.length : 0,
    cancellation_rate: finishedCount ? Number(((cancelled.length / finishedCount) * 100).toFixed(1)) : 0,
    trend: buildTrend(completed, days)
  };
}

// ฟังก์ชันแปลงสถานะเป็นภาษาไทย
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

const getStatusTone = (status) => {
  if (status === 'Completed') return 'ok';
  if (status === 'Cancelled') return 'bad';
  return 'warn';
};

function Icon({ name, size = 18 }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>,
    menu: <><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></>,
    cancel: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
    history: <><path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="9" /></>, 
    check: <><path d="M20 6 9 17l-5-5" /></>,
    hamburger: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    power: <><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Badge({ tone, children }) {
  return <span className={`avx-badge tone-${tone}`}><span className="avx-badge-dot" />{children}</span>;
}

// --- Component กราฟแบบ Executive ---
function PeriodButtons({ days, setDays }) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {[1, 7, 14, 30].map(value => (
        <button
          key={value}
          type="button"
          onClick={() => setDays(value)}
          style={{
            padding: '7px 12px',
            border: '1px solid #c7d2fe',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '12.5px',
            background: days === value ? '#2563eb' : 'white',
            color: days === value ? 'white' : '#334155'
          }}
        >
          {value === 1 ? 'วันนี้' : `${value} วัน`}
        </button>
      ))}
    </div>
  );
}

function DashboardDetail({ label, value }) {
  return (
    <div style={{ background: 'white', padding: '14px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
      <div style={{ color: '#64748b', fontSize: '12px', fontWeight: '600' }}>{label}</div>
      <div style={{ marginTop: '6px', fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>{value}</div>
    </div>
  );
}

function OverviewSalesBarChart({ data }) {
  if (!data || data.length === 0) {
    return <div style={{ minHeight: '220px', display: 'grid', placeItems: 'center', color: '#64748b' }}>ช่วงเวลานี้ยังไม่มียอดขายสำเร็จ</div>;
  }
  const width = 850, height = 250, left = 65, right = 20, top = 30, bottom = 40;
  const graphWidth = width - left - right, graphHeight = height - top - bottom;
  const values = data.map(item => Number(item.sales || 0));
  const maxValue = Math.max(...values, 1);
  const slotWidth = graphWidth / data.length;
  const barWidth = Math.min(36, slotWidth * 0.62);
  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  const shortNumber = value => value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${Math.round(value / 1000)}K` : Math.round(value).toString();

  return (
    <div style={{ overflowX: 'auto', marginTop: '12px' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: '600px', display: 'block' }}>
        {[0, 1, 2, 3, 4].map(line => {
          const ratio = line / 4, y = top + graphHeight * ratio, amount = maxValue * (1 - ratio);
          return <g key={line}><line x1={left} x2={width-right} y1={y} y2={y} stroke="#e5e7eb"/><text x={left-10} y={y+4} textAnchor="end" fontSize="11" fill="#64748b">{shortNumber(amount)}</text></g>;
        })}
        {data.map((item, index) => {
          const sales = Number(item.sales || 0), barHeight = (sales / maxValue) * graphHeight;
          const x = left + index * slotWidth + (slotWidth - barWidth) / 2, y = top + graphHeight - barHeight;
          const showLabel = index % labelStep === 0 || index === data.length - 1;
          return (
            <g key={`${item.label}-${index}`}>
              <rect x={x} y={y} width={barWidth} height={Math.max(barHeight,2)} rx="4" fill="#C97F1E">
                <title>{item.label}: {sales.toLocaleString()} บาท</title>
              </rect>
              {sales > 0 && <text x={x+barWidth/2} y={Math.max(y-7,12)} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#B4562B">{shortNumber(sales)}</text>}
              {showLabel && <text x={x+barWidth/2} y={height-12} textAnchor="middle" fontSize="11" fill="#64748b">{item.label}</text>}
            </g>
          );
        })}
        <line x1={left} x2={width-right} y1={top+graphHeight} y2={top+graphHeight} stroke="#cbd5e1"/>
      </svg>
    </div>
  );
}

export default function OwnerView({ user, apiBase }) {
  useEffect(() => {
    if (!document.getElementById('avx-font-link')) {
      const link = document.createElement('link');
      link.id = 'avx-font-link';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const storeId = user?.storeId || 1;
  const [dash, setDash] = useState({});
  const [cancels, setCancels] = useState([]);
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]); 
  
  // States สำหรับ Dashboard กราฟใหม่
  const [storeDays, setStoreDays] = useState(1);
  const [storeReport, setStoreReport] = useState(null);
  
  const [page, setPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, msg: '' });

  const fetchData = () => {
    fetch(`${apiBase}/api/reports/dashboard?store_id=${storeId}`).then(r => r.json()).then(d => setDash(d[0] || {}));
    fetch(`${apiBase}/api/reports/cancellations?store_id=${storeId}`).then(r => r.json()).then(setCancels);
    fetch(`${apiBase}/api/products?store_id=${storeId}`).then(r => r.json()).then(setProducts);
    fetch(`${apiBase}/api/orders?store_id=${storeId}`).then(r => r.json()).then(setHistory).catch(err => console.error(err));
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [storeId, apiBase]);

  // คำนวณ Report เมื่อ History หรือ จำนวนวัน (storeDays) เปลี่ยน
  useEffect(() => {
    if (history) {
      setStoreReport(buildStoreReport(history, storeId, storeDays));
    }
  }, [history, storeId, storeDays]);

  const showToast = (msg) => {
    setToast({ show: true, msg });
    clearTimeout(window.__avxToastTimer);
    window.__avxToastTimer = setTimeout(() => setToast({ show: false, msg: '' }), 2600);
  };

  const toggleStore = () => {
    fetch(`${apiBase}/api/stores/${storeId}/toggle`, { method: 'PUT' }).then(() => {
      fetchData();
      showToast(dash.IsOpen ? 'ปิดร้านชั่วคราวแล้ว' : 'เปิดรับออเดอร์แล้ว!');
    });
  };

  const toggleStock = (id, pName, isOutOfStock) => {
    fetch(`${apiBase}/api/products/${id}/toggle-stock`, { method: 'PUT' }).then(() => {
      fetchData();
      showToast(`อัปเดตสถานะ "${pName}" เป็น ${isOutOfStock ? 'มีสินค้า' : 'สินค้าหมด'} แล้ว`);
    });
  };

  const navItems = [
    { id: 'dashboard', label: 'ภาพรวมร้านค้า', icon: 'dashboard' },
    { id: 'menu', label: 'จัดการเมนู/สต็อก', icon: 'menu' },
    { id: 'history', label: 'ประวัติการขาย', icon: 'history' },
    { id: 'cancel', label: 'ประวัติยกเลิกออเดอร์', icon: 'cancel', badge: cancels.length || null },
  ];

  const pageTitles = {
    dashboard: ['แดชบอร์ดร้านค้า', 'สรุปยอดขายและสถานะร้านค้าของคุณในวันนี้'],
    menu: ['จัดการสต็อกสินค้า', 'เปิด-ปิด สถานะเมนูอาหารเมื่อวัตถุดิบหมด'],
    history: ['ประวัติการขาย', 'รายการออเดอร์ที่เข้ามาทั้งหมดของร้านค้า'],
    cancel: ['ประวัติการยกเลิก', 'ตรวจสอบรายการออเดอร์ที่ถูกยกเลิกเพื่อวิเคราะห์ปัญหา'],
  };

  return (
    <div className="avx-root">
      <style>{STYLES}</style>
      <div className="avx-shell">
        {/* ===== SIDEBAR ===== */}
        <aside className={`avx-sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="avx-brand">
            <div className="avx-brand-mark" style={{ background: 'linear-gradient(135deg, #C97F1E, #F59E0B)' }}>OF</div>
            <div>
              <div className="avx-brand-t1">Shop Owner</div>
              <div className="avx-brand-t2">แดชบอร์ดเจ้าของร้าน</div>
            </div>
          </div>
          <nav className="avx-nav">
            <div className="avx-nav-label">เมนูจัดการร้าน</div>
            {navItems.map(n => (
              <div key={n.id} className={`avx-nav-item${page === n.id ? ' active' : ''}`} onClick={() => { setPage(n.id); setSidebarOpen(false); }}>
                <Icon name={n.icon} size={17} /> {n.label}
                {n.badge ? <span className="avx-nav-badge">{n.badge}</span> : null}
              </div>
            ))}
          </nav>
          <div className="avx-sidebar-foot">
            ร้านค้าสังกัด<br /><strong>{dash.StoreName || 'กำลังโหลด...'}</strong><br />
            <span style={{ opacity: .8 }}>ผู้ใช้งาน: {user?.name || user?.FullName || 'Owner'}</span>
          </div>
        </aside>

        {/* ===== MAIN ===== */}
        <div className="avx-main">
          <header className="avx-topbar">
            <button className="avx-hamburger" onClick={() => setSidebarOpen(o => !o)}><Icon name="hamburger" size={20} /></button>
            <div style={{ flex: 1 }}>
               <Badge tone={dash.IsOpen ? 'ok' : 'bad'}>
                 สถานะ: {dash.IsOpen ? '🟢 เปิดให้บริการ' : '🔴 ปิดรับออเดอร์ชั่วคราว'}
               </Badge>
            </div>
            <div className="avx-topbar-right">
              <div className="avx-user-chip">
                <div className="avx-user-avatar" style={{ background: 'linear-gradient(135deg, #C97F1E, #F59E0B)' }}>
                  {(user?.name || user?.FullName || 'OW').slice(0, 2)}
                </div>
                <div>
                  <div className="avx-user-name">{user?.name || user?.FullName || 'เจ้าของร้าน'}</div>
                  <div className="avx-user-role">Shop Owner</div>
                </div>
              </div>
            </div>
          </header>

          <main className="avx-content">
            <div className="avx-page-head" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '20px' }}>
              <div><h1>{pageTitles[page][0]}</h1><p>{pageTitles[page][1]}</p></div>
              {page === 'dashboard' && (
                <button 
                  onClick={toggleStore} 
                  className={`avx-btn ${dash.IsOpen ? 'avx-btn-danger' : 'avx-btn-success'}`}
                  style={{ gap: '8px' }}
                >
                  <Icon name="power" size={16} /> 
                  {dash.IsOpen ? 'ปิดรับออเดอร์ชั่วคราว' : 'เปิดรับออเดอร์ร้านค้า'}
                </button>
              )}
            </div>

            {/* ================= DASHBOARD (อัปเกรดเป็นกราฟแบบ Executive) ================= */}
            {page === 'dashboard' && (
              <div style={{ background: '#fffbeb', padding: '20px', borderRadius: '12px', border: '1px solid #fde68a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#92400e', fontSize: '18px' }}>สถิติและแนวโน้มยอดขาย</h3>
                    <div style={{ color: '#b45309', fontSize: '13px', marginTop: '4px' }}>วิเคราะห์ข้อมูลร้าน {dash.StoreName}</div>
                  </div>
                  <PeriodButtons days={storeDays} setDays={setStoreDays} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <DashboardDetail label={storeDays === 1 ? 'ยอดขายวันนี้' : `ยอดขาย ${storeDays} วัน`} value={`฿${fmtMoney(storeReport?.total_sales || 0)}`} />
                  <DashboardDetail label={storeDays === 1 ? 'ออเดอร์สำเร็จ' : `ออเดอร์สำเร็จ`} value={`${storeReport?.total_orders || 0} รายการ`} />
                  <DashboardDetail label="ออเดอร์ยกเลิก" value={`${storeReport?.total_cancelled || 0} รายการ`} />
                  <DashboardDetail label="ยอดเฉลี่ย/ออเดอร์" value={`฿${fmtMoney(storeReport?.average_order || 0)}`} />
                  <DashboardDetail label="อัตราการยกเลิก" value={`${storeReport?.cancellation_rate || 0}%`} />
                </div>

                <div style={{ marginTop: '20px', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                  <h4 style={{ margin: '0 0 4px', fontSize: '15px' }}>กราฟยอดขาย</h4>
                  <div style={{ color: '#64748b', fontSize: '12.5px' }}>
                    {storeDays === 1 ? 'ยอดขายแยกตามชั่วโมงของวันนี้' : `ยอดขายแยกตามวัน ย้อนหลัง ${storeDays} วัน`}
                  </div>
                  <OverviewSalesBarChart data={storeReport?.trend || []} />
                </div>
              </div>
            )}

            {/* ================= MENU & STOCK ================= */}
            {page === 'menu' && (
              <div className="avx-panel">
                <div className="avx-panel-head"><div><h3>รายการเมนูอาหาร</h3><div className="avx-sub">คลิกปุ่มเพื่อเปลี่ยนสถานะมีสินค้า/สินค้าหมด</div></div></div>
                <div className="avx-scroll-x">
                  <table className="avx-table">
                    <thead><tr><th>รหัสสินค้า</th><th>ชื่อเมนู</th><th>ราคา</th><th>สถานะปัจจุบัน</th><th>การจัดการ</th></tr></thead>
                    <tbody>
                      {products.length === 0 && <tr><td colSpan="5" className="avx-empty-row">ยังไม่มีข้อมูลเมนูอาหารในระบบ</td></tr>}
                      {products.map(p => (
                        <tr key={p.ProductId}>
                          <td className="avx-num">#{p.ProductId}</td>
                          <td><b>{p.ProductName}</b></td>
                          <td className="avx-num">฿{fmtMoney(p.UnitPrice)}</td>
                          <td>
                            {p.IsOutOfStock 
                              ? <Badge tone="bad">สินค้าหมด</Badge> 
                              : <Badge tone="ok">พร้อมขาย</Badge>}
                          </td>
                          <td>
                            <button 
                              onClick={() => toggleStock(p.ProductId, p.ProductName, p.IsOutOfStock)} 
                              className={`avx-btn ${p.IsOutOfStock ? 'avx-btn-success' : 'avx-btn-danger'}`}
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                            >
                              {p.IsOutOfStock ? 'ปรับเป็นมีสินค้า' : 'แจ้งสินค้าหมด'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ================= HISTORY ================= */}
            {page === 'history' && (
              <div className="avx-panel">
                <div className="avx-panel-head">
                  <div><h3>ประวัติการขายทั้งหมด</h3><div className="avx-sub">เรียงจากออเดอร์ล่าสุดไปเก่าสุด</div></div>
                </div>
                <div className="avx-scroll-x">
                  <table className="avx-table">
                    <thead>
                      <tr>
                        <th>วัน-เวลา</th>
                        <th>หมายเลขคิว</th>
                        <th>รายการอาหาร</th>
                        <th>ยอดเงิน</th>
                        <th>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.length === 0 && <tr><td colSpan="5" className="avx-empty-row">ไม่พบประวัติการสั่งซื้อ</td></tr>}
                      {history.map(h => (
                        <tr key={h.OrderID}>
                          <td className="avx-num" style={{ fontSize: '11px', color: 'var(--text-600)' }}>
                            {h.CreatedAt ? new Date(h.CreatedAt).toLocaleString('th-TH') : '-'}
                          </td>
                          <td className="avx-num" style={{ color: 'var(--teal)' }}><b>{h.QueueNo}</b></td>
                          <td>
                            {h.items?.map((item, idx) => (
                              <div key={idx} style={{ fontSize: '12.5px', marginBottom: '2px' }}>
                                • {item.ProductName} (x{item.Qty})
                              </div>
                            ))}
                          </td>
                          <td className="avx-num" style={{ fontWeight: 'bold' }}>฿{fmtMoney(h.TotalAmount)}</td>
                          <td>
                            <Badge tone={getStatusTone(h.Status)}>
                              {getStatusLabel(h.Status)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ================= CANCELLATIONS ================= */}
            {page === 'cancel' && (
              <div className="avx-panel">
                <div className="avx-panel-head"><div><h3>ประวัติการยกเลิกออเดอร์</h3><div className="avx-sub">รายการออเดอร์ที่ถูกปฏิเสธหรือลูกค้ายกเลิก</div></div></div>
                <div className="avx-scroll-x">
                  <table className="avx-table">
                    <thead><tr><th>วัน-เวลา</th><th>หมายเลขคิว</th><th>ยอดเงิน</th><th>เหตุผลที่ยกเลิก</th></tr></thead>
                    <tbody>
                      {cancels.length === 0 && <tr><td colSpan="4" className="avx-empty-row">ไม่พบประวัติการยกเลิก</td></tr>}
                      {cancels.map(c => (
                        <tr key={c.OrderID}>
                          <td className="avx-num" style={{ fontSize: '11px', color: 'var(--text-600)' }}>
                            {c.CreatedAt ? new Date(c.CreatedAt).toLocaleString('th-TH') : '-'}
                          </td>
                          <td className="avx-num" style={{ color: 'var(--teal)' }}><b>{c.QueueNo}</b></td>
                          <td className="avx-num">฿{fmtMoney(c.TotalAmount)}</td>
                          <td style={{ color: 'var(--red)' }}>{c.CancelReason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </main>
        </div>
      </div>

      {/* ===== Toast ===== */}
      <div className={`avx-toast${toast.show ? ' show' : ''}`}><Icon name="check" size={15} />{toast.msg}</div>
    </div>
  );
}

/* ============================================================
   STYLES — ชุดเดียวกับ Accountant เพื่อให้ Theme เหมือนกัน 100%
   ============================================================ */
const STYLES = `
.avx-root{
  --navy-950:#0B1E33; --navy-900:#102943; --bg:#F3F5F8; --card:#FFFFFF;
  --border:#E2E7EE; --border-soft:#EDF0F4; --text-900:#131C2B; --text-600:#4B5768; --text-400:#8A94A6;
  --teal:#0E7C7B; --teal-dark:#0A5F5E; --teal-soft:#E4F3F2;
  --amber:#C97F1E; --amber-soft:#FBF0DD; --red:#C4433D; --red-soft:#FBEAE9; --green:#2F8F62; --green-soft:#E7F5EE;
  font-family:'Sarabun',-apple-system,sans-serif; color:var(--text-900); background:var(--bg);
  border-radius:14px; box-shadow:0 1px 3px rgba(11,30,51,0.08);
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
}
.avx-root *{box-sizing:border-box;}
.avx-shell{display:flex; flex: 1; min-height: 0;}
.avx-sidebar{width:224px;flex-shrink:0;background:linear-gradient(185deg,var(--navy-950),var(--navy-900) 70%);color:#EAF1F8;display:flex;flex-direction:column; overflow-y:auto;}
.avx-brand{display:flex;align-items:center;gap:10px;padding:18px 16px;border-bottom:1px solid rgba(255,255,255,0.08);}
.avx-brand-mark{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;flex-shrink:0;}
.avx-brand-t1{font-weight:700;font-size:14px;}
.avx-brand-t2{font-size:10.5px;color:#9FB1C4;margin-top:1px;}
.avx-nav{padding:12px 10px;display:flex;flex-direction:column;gap:2px;flex:1;}
.avx-nav-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#7690A8;padding:8px 10px 4px;font-weight:600;}
.avx-nav-item{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:8px;color:#C7D5E3;font-size:13.5px;font-weight:500;cursor:pointer;border:1px solid transparent;}
.avx-nav-item:hover{background:rgba(255,255,255,0.06);color:#fff;}
.avx-nav-item.active{background:rgba(201,127,30,0.22);color:#fff;border-color:rgba(245,158,11,0.35);}
.avx-nav-badge{margin-left:auto;background:var(--red);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:20px;}
.avx-sidebar-foot{padding:12px 16px 16px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:#9FB1C4;line-height:1.6;}
.avx-main{flex:1;min-width:0;display:flex;flex-direction:column;}
.avx-topbar{display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border);background:rgba(255,255,255,0.6);}
.avx-hamburger{display:none;background:none;border:none;cursor:pointer;color:var(--text-900);padding:4px;}
.avx-topbar-right{margin-left:auto;display:flex;align-items:center;gap:10px;}
.avx-user-chip{display:flex;align-items:center;gap:8px;padding:4px 10px 4px 4px;background:#fff;border:1px solid var(--border);border-radius:30px;}
.avx-user-avatar{width:26px;height:26px;border-radius:50%;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;}
.avx-user-name{font-size:12.5px;font-weight:600;}
.avx-user-role{font-size:10px;color:var(--text-400);}
.avx-content{padding:20px 24px 40px;overflow-y:auto;flex:1;}
.avx-page-head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;gap:12px;flex-wrap:wrap;}
.avx-page-head h1{font-size:19px;margin:0 0 3px;font-weight:700;}
.avx-page-head p{margin:0;color:var(--text-600);font-size:12.5px;}
.avx-btn{border:none;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit;}
.avx-btn-success{background:var(--green);color:#fff;}
.avx-btn-success:hover{background:#23704C;}
.avx-btn-danger{background:var(--red);color:#fff;}
.avx-btn-danger:hover{background:#A33530;}
.avx-cards-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;}
.avx-stat-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;}
.avx-stat-label{font-size:11.5px;color:var(--text-600);font-weight:500;}
.avx-stat-value{font-size:20px;font-weight:700;margin-top:6px;}
.avx-stat-value.tone-bad{color:var(--red);} .avx-stat-value.tone-warn{color:var(--amber);} .avx-stat-value.tone-ok{color:var(--green);}
.avx-panel{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:14px;}
.avx-panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;flex-wrap:wrap;}
.avx-panel-head h3{font-size:14px;margin:0;font-weight:700;}
.avx-sub{font-size:11.5px;color:var(--text-400);margin-top:2px;}
.avx-table{width:100%;border-collapse:collapse;font-size:13px;}
.avx-table thead th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-400);font-weight:700;padding:0 10px 8px;border-bottom:1px solid var(--border);white-space:nowrap;}
.avx-table tbody td{padding:10px;border-bottom:1px solid var(--border-soft);vertical-align:middle;}
.avx-table tbody tr:last-child td{border-bottom:none;}
.avx-empty-row{text-align:center;color:var(--text-400);padding:18px;}
.avx-num{font-family:'JetBrains Mono',monospace;font-size:12.5px;}
.avx-scroll-x{overflow-x:auto;}
.avx-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;white-space:nowrap;}
.avx-badge.tone-ok{background:var(--green-soft);color:var(--green);}
.avx-badge.tone-warn{background:var(--amber-soft);color:var(--amber);}
.avx-badge.tone-bad{background:var(--red-soft);color:var(--red);}
.avx-badge.tone-neutral{background:var(--teal-soft);color:var(--teal-dark);}
.avx-badge-dot{width:5px;height:5px;border-radius:50%;background:currentColor;}
.avx-field{display:flex;flex-direction:column;gap:5px;}
.avx-field label{font-size:11px;font-weight:600;color:var(--text-600);}
.avx-field select,.avx-field input{border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-family:inherit;font-size:13px;color:var(--text-900);background:#fff;width:100%;}
.avx-field select:focus,.avx-field input:focus{outline:2px solid var(--teal);outline-offset:1px;border-color:var(--teal);}
.avx-toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(16px);background:var(--navy-950);color:#fff;padding:11px 18px;border-radius:9px;font-size:12.5px;font-weight:600;box-shadow:0 12px 30px rgba(0,0,0,0.25);display:flex;align-items:center;gap:8px;z-index:300;opacity:0;pointer-events:none;transition:opacity .25s ease, transform .25s ease;font-family:'Sarabun',sans-serif;}
.avx-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
.avx-toast svg{color:#4FD6C9;}

/* ปรับ UI เพื่อรองรับมือถือ */
@media (max-width:760px){
  .avx-sidebar{position:fixed;left:0;top:0;bottom:0;transform:translateX(-100%);z-index:100;height:100%;box-shadow:4px 0 24px rgba(0,0,0,0.2);transition:transform 0.3s ease;}
  .avx-sidebar.open{transform:translateX(0);}
  .avx-hamburger{display:flex;}
  .avx-cards-row{grid-template-columns:1fr;}
  .avx-content{padding: 16px 12px 30px;}
  .avx-page-head{flex-direction:column; align-items:flex-start;}
  .avx-btn{width: 100%; justify-content:center;}
  .avx-panel-head{flex-direction:column; align-items:flex-start;}
}
`;