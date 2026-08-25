import React, { useState, useEffect } from 'react';

/* ============================================================
   OF Shop Owner — แดชบอร์ดเจ้าของร้านค้า
   ใช้ Theme และ Sidebar Navigation แบบเดียวกับ Accountant
   ============================================================ */

const fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function Icon({ name, size = 18 }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>,
    menu: <><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></>,
    cancel: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
    check: <><path d="M20 6 9 17l-5-5" /></>,
    hamburger: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    power: <><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></>
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

function Badge({ tone, children }) {
  return <span className={`avx-badge tone-${tone}`}><span className="avx-badge-dot" />{children}</span>;
}

export default function OwnerView({ user, apiBase }) {
  // โหลดฟอนต์ Sarabun
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
  
  const [page, setPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, msg: '' });

  const fetchData = () => {
    fetch(`${apiBase}/api/reports/dashboard?store_id=${storeId}`).then(r => r.json()).then(d => setDash(d[0] || {}));
    fetch(`${apiBase}/api/reports/cancellations?store_id=${storeId}`).then(r => r.json()).then(setCancels);
    fetch(`${apiBase}/api/products?store_id=${storeId}`).then(r => r.json()).then(setProducts);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [storeId, apiBase]);

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
    { id: 'cancel', label: 'ประวัติยกเลิกออเดอร์', icon: 'cancel', badge: cancels.length || null },
  ];

  const pageTitles = {
    dashboard: ['แดชบอร์ดร้านค้า', 'สรุปยอดขายและสถานะร้านค้าของคุณในวันนี้'],
    menu: ['จัดการสต็อกสินค้า', 'เปิด-ปิด สถานะเมนูอาหารเมื่อวัตถุดิบหมด'],
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

            {/* ================= DASHBOARD ================= */}
            {page === 'dashboard' && (
              <>
                <div className="avx-cards-row">
                  <StatCard label="ยอดขายรวมสุทธิ" value={`฿${fmtMoney(dash.net_sales)}`} tone="ok" />
                  <StatCard label="ออเดอร์ที่สำเร็จแล้ว" value={`${dash.total_orders || 0} รายการ`} />
                  <StatCard label="ออเดอร์ที่ถูกยกเลิก" value={`${cancels.length} รายการ`} tone={cancels.length > 0 ? "bad" : "neutral"} />
                </div>
                <div className="avx-panel">
                  <div className="avx-panel-head"><div><h3>ประสิทธิภาพการขาย</h3><div className="avx-sub">สรุปข้อมูลเบื้องต้นของร้าน {dash.StoreName}</div></div></div>
                  <div style={{ padding: '20px 0', color: 'var(--text-600)', lineHeight: '1.8' }}>
                    <p>✨ <b>สถานะปัจจุบัน:</b> ร้านของคุณกำลัง <b>{dash.IsOpen ? 'เปิดรับออเดอร์' : 'ปิดร้านชั่วคราว'}</b></p>
                    <p>📈 <b>ยอดขายรวมวันนี้:</b> ทำยอดไปได้แล้ว <b>{fmtMoney(dash.net_sales)} บาท</b> จากการขายทั้งหมด <b>{dash.total_orders || 0}</b> ออเดอร์</p>
                    <p>⚠️ <b>อัตราการยกเลิก:</b> มีลูกค้ายกเลิกหรือสินค้าไม่พร้อมขายทั้งหมด <b>{cancels.length}</b> ออเดอร์ (สามารถดูรายละเอียดได้ที่แท็บ "ประวัติยกเลิกออเดอร์")</p>
                  </div>
                </div>
              </>
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

            {/* ================= CANCELLATIONS ================= */}
            {page === 'cancel' && (
              <div className="avx-panel">
                <div className="avx-panel-head"><div><h3>ประวัติการยกเลิกออเดอร์</h3><div className="avx-sub">รายการออเดอร์ที่ถูกปฏิเสธหรือลูกค้ายกเลิก</div></div></div>
                <div className="avx-scroll-x">
                  <table className="avx-table">
                    <thead><tr><th>หมายเลขคิว</th><th>ยอดเงิน</th><th>เหตุผลที่ยกเลิก</th></tr></thead>
                    <tbody>
                      {cancels.length === 0 && <tr><td colSpan="3" className="avx-empty-row">ไม่พบประวัติการยกเลิก</td></tr>}
                      {cancels.map(c => (
                        <tr key={c.OrderID}>
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
.avx-table tbody td{padding:10px;border-bottom:1px solid var(--border-soft);}
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