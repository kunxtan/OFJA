import React, { useState, useEffect, useRef } from 'react';

// โทนสีเดิมของ Counter & Theme กลาง
const PALETTE = {
  coral: '#FF724C',
  coralLight: '#FFF0EB',
  coralDark: '#E85A33',
  yellow: '#FDBF50',
  yellowLight: '#FEF7E6',
  white: '#FFFFFF',
  dark: '#2A2C41',
  darkLight: '#373A56',
  bg: '#F5F6FA',
  border: '#EBEBF0',
  textSub: '#7E84A3',
  green: '#10B981',
  greenLight: '#D1FAE5',
  red: '#EF4444',
  redLight: '#FEE2E2',
};

const fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function Icon({ name, size = 20 }) {
  const paths = {
    orders: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="m9 14 2 2 4-4" /></>,
    stale: <><circle cx="12" cy="12" r="9" /><polyline points="12 6 12 12 16 14" /></>,
    walkin: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>,
    menu: <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>,
    bell: <><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" /></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    print: <><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
    check: <><polyline points="20 6 9 17 4 12" /></>,
    close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    warn: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
    store: <><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" /><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" /><path d="M2 7h20" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] || null}
    </svg>
  );
}

function Badge({ tone, children }) {
  return <span className={`cv-badge tone-${tone}`}>{children}</span>;
}

export default function CounterView({ user, apiBase, onLogout }) {
  const activeStoreId = user?.StoreId || user?.storeId || 1;
  const [stores, setStores] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [orderNote, setOrderNote] = useState('');

  const [activeTab, setActiveTab] = useState('orders');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const [viewingSlip, setViewingSlip] = useState(null);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [toast, setToast] = useState({ show: false, msg: '' });

  // 🔴 Modal ยกเลิกคำสั่งซื้อแบบใหม่
  const [cancelModal, setCancelModal] = useState(null); // { order, actionType: 'immediate' | 'window' }
  const [cancelReasonTag, setCancelReasonTag] = useState('วัตถุดิบหมด');
  const [customReason, setCustomReason] = useState('');
  const [cancelActionChoice, setCancelActionChoice] = useState('immediate'); // 'immediate' หรือ 'window'

  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const showToast = (msg) => {
    setToast({ show: true, msg });
    clearTimeout(window.__cvToastTimer);
    window.__cvToastTimer = setTimeout(() => setToast({ show: false, msg: '' }), 2600);
  };

  const fetchData = () => {
    fetch(`${apiBase}/api/orders?store_id=${activeStoreId}`)
      .then(r => r.json())
      .then(d => setOrders(Array.isArray(d) ? d : []))
      .catch(err => console.error("Error orders:", err));

    fetch(`${apiBase}/api/products?store_id=${activeStoreId}`)
      .then(r => r.json())
      .then(d => setProducts(Array.isArray(d) ? d : []))
      .catch(err => console.error("Error products:", err));
  };

  useEffect(() => {
    fetch(`${apiBase}/api/stores`).then(r => r.json()).then(d => setStores(Array.isArray(d) ? d : []));
  }, [apiBase]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3500);
    return () => clearInterval(interval);
  }, [activeStoreId, apiBase]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentStore = stores.find(s => s.StoreId === activeStoreId);

  // --- Handlers ---
  const verifySlip = (id, approved) => {
    const reason = approved ? '' : prompt('ระบุเหตุผลที่ปฏิเสธสลิป:');
    if (!approved && !reason) return;
    fetch(`${apiBase}/api/orders/${id}/verify-slip`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved, reason })
    }).then(() => {
      showToast(approved ? 'อนุมัติสลิปแล้ว ส่งคิวเข้าครัว' : 'ปฏิเสธสลิปแล้ว');
      fetchData();
    });
  };

  const updateStatus = (id, status, cancelReason = null) => {
    fetch(`${apiBase}/api/orders/${id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, user_role: 'Front Staff', cancel_reason: cancelReason })
    }).then(() => {
      showToast(`อัปเดตสถานะเป็น "${status}" สำเร็จ`);
      fetchData();
    });
  };

  const printStub = (queueNo) => alert(`🖨️ กำลังพิมพ์ใบตั๋วอาหาร สำหรับคิว: ${queueNo}`);

  // 🔴 เปิด Modal ยกเลิกคำสั่งซื้อ (แทนการใช้ prompt)
  const openCancelModal = (order, defaultAction = 'immediate') => {
    setCancelModal({ order });
    setCancelActionChoice(defaultAction);
    setCancelReasonTag(defaultAction === 'window' ? 'วัตถุดิบหมด' : 'ลูกค้าขอยกเลิกเอง');
    setCustomReason('');
  };

  // 🔴 ยืนยันการยกเลิกจาก Modal
  const handleConfirmCancel = () => {
    if (!cancelModal) return;
    const finalReason = customReason.trim() ? `${cancelReasonTag}: ${customReason.trim()}` : cancelReasonTag;
    const orderId = cancelModal.order.OrderID;
    const queueNo = cancelModal.order.QueueNo;

    if (cancelActionChoice === 'window') {
      // เรียก API แจ้งของหมด นับถอยหลัง 30 นาที
      fetch(`${apiBase}/api/orders/${orderId}/cancel-request`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: finalReason, response_window_minutes: 30 })
      }).then(() => {
        showToast(`แจ้งเตือนคิว ${queueNo} แล้ว (รอเปลี่ยนเมนู 30 นาที)`);
        setCancelModal(null);
        fetchData();
      });
    } else {
      // ยกเลิกคำสั่งซื้อทันที
      updateStatus(orderId, 'Cancelled', finalReason);
      setCancelModal(null);
    }
  };

  const markNoShow = (order) => {
    if (!window.confirm(`ยืนยันว่าคิว ${order.QueueNo} เกินเวลา และต้องการเคลียร์เป็น No-Show (Food Waste)?`)) return;
    updateStatus(order.OrderID, 'NoShow', 'ลูกค้าไม่มารับอาหารเกินเวลา (ตัดจำหน่าย)');
  };

  const viewCustomerProfile = (order) => {
    if (!order.UserId) return alert('ออเดอร์นี้เป็นลูกค้า Walk-in ไม่มีข้อมูลโปรไฟล์');
    setViewingCustomer({ loading: true });
    fetch(`${apiBase}/api/customers/${order.UserId}`)
      .then(r => r.json())
      .then(data => setViewingCustomer(data))
      .catch(() => setViewingCustomer({ error: true }));
  };

  const toggleStock = (product) => {
    const turningOutOfStock = !product.IsOutOfStock;
    if (turningOutOfStock) {
      const affected = orders.filter(o =>
        o.Status !== 'Completed' && o.Status !== 'Cancelled' && o.Status !== 'NoShow' &&
        o.items?.some(i => i.ProductId === product.ProductId)
      );
      if (affected.length > 0) {
        if (window.confirm(`เมนูนี้อยู่ใน ${affected.length} ออเดอร์ที่กำลังดำเนินงาน\nต้องการแจ้งเตือนลูกค้ากลุ่มนี้ด้วยหรือไม่?`)) {
          fetch(`${apiBase}/api/products/${product.ProductId}/notify-out-of-stock`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response_window_minutes: 30 })
          }).catch(console.error);
        }
      }
    }
    fetch(`${apiBase}/api/products/${product.ProductId}/toggle-stock`, { method: 'PUT' }).then(() => {
      showToast(`เปลี่ยนสถานะ "${product.ProductName}" แล้ว`);
      fetchData();
    });
  };

  const addToCart = (p) => setCart([...cart, { ...p, note: '' }]);
  const removeFromCart = (idx) => setCart(cart.filter((_, i) => i !== idx));
  const updateCartNote = (idx, note) => {
    const updated = [...cart];
    updated[idx].note = note;
    setCart(updated);
  };
  const totalAmount = cart.reduce((sum, item) => sum + Number(item.UnitPrice), 0);

  const submitWalkInOrder = () => {
    if (cart.length === 0) return alert('กรุณาเลือกอาหารก่อนกดสั่งซื้อ');
    fetch(`${apiBase}/api/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: activeStoreId,
        user_id: null,
        items: cart.map(i => ({ product_id: i.ProductId, qty: 1, unit_price: i.UnitPrice, note: i.note || '' })),
        is_walk_in: true,
        note: orderNote || 'Walk-in'
      })
    }).then(async res => {
      const data = await res.json();
      if (!res.ok) alert(data.detail);
      else {
        showToast(`สั่งซื้อสำเร็จ! คิว: ${data.queue_no}`);
        setCart([]); setOrderNote(''); fetchData(); setActiveTab('orders');
      }
    });
  };

  const getStatusBadgeTone = (status) => {
    switch (status) {
      case 'Ready': return 'success';
      case 'Pending_Cancellation': return 'warning';
      case 'NoShow': return 'danger';
      case 'Cooking': return 'coral';
      default: return 'neutral';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'Ready': return 'พร้อมเสิร์ฟ';
      case 'Pending_Cancellation': return 'รอเปลี่ยนเมนู (30น.)';
      case 'NoShow': return 'ไม่มารับ (No-Show)';
      case 'Cooking': return 'กำลังปรุง';
      case 'Pending': return 'รอคิวเข้าครัว';
      default: return status;
    }
  };

  const getRemainingLabel = (deadline) => {
    if (!deadline) return '-';
    const diff = new Date(deadline).getTime() - nowTick;
    if (diff <= 0) return 'หมดเวลา';
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')} น.`;
  };

  const getElapsedLabel = (timestamp) => {
    if (!timestamp) return '-';
    return `${Math.max(0, Math.floor((nowTick - new Date(timestamp).getTime()) / 60000))} นาที`;
  };

  const isOverdue = (timestamp) => timestamp && ((nowTick - new Date(timestamp).getTime()) / 60000 > 120);

  const verifyingOrders = orders.filter(o => o.Status === 'Verifying_Slip');
  const activeOrders = orders.filter(o => o.Status !== 'Verifying_Slip' && o.Status !== 'Completed' && o.Status !== 'Cancelled' && o.Status !== 'NoShow');
  const staleOrders = orders.filter(o => o.Status === 'Ready').sort((a, b) => new Date(a.ReadyAt || 0) - new Date(b.ReadyAt || 0));

  const navItems = [
    { id: 'orders', label: 'Queue & Slips', caption: 'จัดการคิว & ตรวจสลิป', icon: 'orders', badge: verifyingOrders.length || null },
    { id: 'stale', label: 'Stale Orders', caption: 'ออเดอร์ตกค้าง (120น.)', icon: 'stale', badge: staleOrders.length || null },
    { id: 'walkin', label: 'Walk-in POS', caption: 'แคชเชียร์สั่งอาหารหน้าร้าน', icon: 'walkin' },
    { id: 'menu', label: 'Menu & Stock', caption: 'เปิด-ปิดสต็อกวัตถุดิบ', icon: 'menu' },
  ];

  const quickReasons = [
    'วัตถุดิบหมด',
    'ลูกค้าขอยกเลิกเอง',
    'ครัวปรุงไม่ทัน / คิวแน่น',
    'สั่งออเดอร์ซ้ำซ้อน',
    'ลูกค้าเปลี่ยนใจเปลี่ยนร้าน',
    'เหตุขัดข้องอื่นๆ'
  ];

  return (
    <div className="cv-root">
      <style>{CV_STYLES}</style>

      {/* ===== TOPBAR ===== */}
      <header className="cv-topbar">
        <div className="cv-topbar-left">
          <div className="cv-brand">
            <div className="brand-title">
              <span className="brand-icon">🍽️</span>
              <span>Only Foods</span>
            </div>
            <div className="brand-subtitle">
              จุดบริการ: <span className="status-dot"></span> <span className="status-text">หน้าร้านพร้อมบริการ</span>
            </div>
          </div>

          <button className="cv-icon-btn coral-light" onClick={() => setSidebarOpen(!sidebarOpen)} title="ย่อ/ขยายเมนู">
            <Icon name="menu" size={20} />
          </button>
        </div>

        <div className="cv-topbar-right">
          <div className="cv-store-chip">
            <Icon name="store" size={16} />
            <span>{currentStore?.StoreName || `ร้านค้า #${activeStoreId}`}</span>
          </div>

          <button className="cv-icon-btn yellow-light" onClick={() => setActiveTab('orders')} title="สลิปรอตรวจ">
            <Icon name="bell" size={19} />
            {verifyingOrders.length > 0 && <span className="cv-badge-dot-count">{verifyingOrders.length}</span>}
          </button>

          <div className="cv-profile-container" ref={profileRef}>
            <div className="cv-user-chip" onClick={() => setProfileOpen(!profileOpen)}>
              <span className="user-name">{user?.FullName || user?.name || 'พนักงานหน้าร้าน'}</span>
              <span className="role-tag">Front Staff</span>
            </div>

            {profileOpen && (
              <div className="cv-profile-dropdown">
                <div className="dropdown-header">
                  <h4>{user?.FullName || user?.name || 'Front Staff'}</h4>
                  <p>พนักงานบริการหน้าร้าน (เคาน์เตอร์)</p>
                </div>
                <hr className="cv-divider" />
                <div className="dropdown-item" onClick={() => { setActiveTab('orders'); setProfileOpen(false); }}>
                  <Icon name="orders" size={18} /> จัดการคิวอาหาร
                </div>
                <div className="dropdown-item" onClick={() => { setActiveTab('walkin'); setProfileOpen(false); }}>
                  <Icon name="walkin" size={18} /> สั่งอาหาร Walk-in
                </div>
                {onLogout && (
                  <div className="dropdown-item" onClick={onLogout} style={{ color: PALETTE.red }}>
                    <Icon name="logout" size={18} /> ออกจากระบบ
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== BODY ===== */}
      <div className="cv-body">
        <aside className={`cv-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          <nav className="cv-nav">
            <div className="cv-nav-label hide-on-collapse">Counter Controls</div>
            {navItems.map(n => (
              <div
                key={n.id}
                className={`cv-nav-item ${activeTab === n.id ? 'active' : ''}`}
                onClick={() => { setActiveTab(n.id); if (window.innerWidth <= 768) setSidebarOpen(false); }}
                title={!sidebarOpen ? n.label : ""}
              >
                <div className="cv-nav-icon"><Icon name={n.icon} size={20} /></div>
                <div className="cv-nav-text hide-on-collapse">
                  <div className="title">{n.label}</div>
                  <div className="caption">{n.caption}</div>
                </div>
                {n.badge ? <span className="cv-nav-badge hide-on-collapse">{n.badge}</span> : null}
              </div>
            ))}
          </nav>
        </aside>

        {/* ===== CONTENT AREA ===== */}
        <main className="cv-content">
          
          {/* TAB 1: QUEUE & SLIPS */}
          {activeTab === 'orders' && (
            <div className="cv-stack">
              <div className="cv-stat-grid">
                <div className="cv-card cv-bg-coral">
                  <div className="cv-decor-circle-1" />
                  <div className="cv-stat-body">
                    <h2>{verifyingOrders.length}</h2>
                    <p>สลิปที่ต้องตรวจสอบ</p>
                  </div>
                </div>
                <div className="cv-card cv-bg-yellow">
                  <div className="cv-stat-body">
                    <h2>{orders.filter(o => o.Status === 'Cooking').length}</h2>
                    <p>คิวที่ครัวกำลังปรุง</p>
                  </div>
                </div>
                <div className="cv-card cv-bg-dark">
                  <div className="cv-stat-body">
                    <h2>{orders.filter(o => o.Status === 'Ready').length}</h2>
                    <p>อาหารพร้อมส่งมอบ</p>
                  </div>
                </div>
              </div>

              {/* สลิปรอตรวจ */}
              <div className="cv-card">
                <div className="cv-card-head">
                  <div>
                    <h3>1. ตรวจสอบสลิปโอนเงิน (รอยืนยันเพื่อส่งเข้าครัว)</h3>
                    <div className="caption">ลูกค้าชำระเงินออนไลน์แล้ว รอการยืนยันยอดเงิน</div>
                  </div>
                </div>
                <div className="cv-table-wrapper">
                  <table className="cv-table">
                    <thead>
                      <tr>
                        <th>คิว</th>
                        <th>ยอดชำระ</th>
                        <th>หลักฐานสลิป</th>
                        <th style={{ textAlign: 'right' }}>การดำเนินการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verifyingOrders.length === 0 ? (
                        <tr><td colSpan="4" className="empty-state">ไม่มีรายการรอตรวจสอบสลิปในขณะนี้</td></tr>
                      ) : (
                        verifyingOrders.map(o => (
                          <tr key={o.OrderID}>
                            <td><span className="queue-pill">{o.QueueNo}</span></td>
                            <td className="bold" style={{ color: PALETTE.coral, fontSize: '16px' }}>฿{fmtMoney(o.TotalAmount)}</td>
                            <td>
                              {o.SlipUrl ? (
                                <div onClick={() => setViewingSlip(o.SlipUrl)} className="slip-thumb">
                                  <img src={o.SlipUrl} alt="Slip" />
                                  <span>คลิกดูรูป</span>
                                </div>
                              ) : <span style={{ color: PALETTE.red, fontWeight: 'bold' }}>ไม่มีสลิป</span>}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button onClick={() => verifySlip(o.OrderID, true)} className="cv-btn btn-success-light" style={{ marginRight: '8px' }}>
                                ✅ ยืนยันสลิป
                              </button>
                              <button onClick={() => verifySlip(o.OrderID, false)} className="cv-btn btn-danger-light">
                                ❌ ปฏิเสธ
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* คิวที่กำลังดำเนินการ */}
              <div className="cv-card">
                <div className="cv-card-head">
                  <div>
                    <h3>2. คิวคำสั่งซื้อที่กำลังดำเนินการ</h3>
                    <div className="caption">สถานะคิวล่าสุดของร้านค้าแบบเรียลไทม์</div>
                  </div>
                </div>
                <div className="cv-table-wrapper">
                  <table className="cv-table">
                    <thead>
                      <tr>
                        <th>คิว</th>
                        <th>รายการอาหาร</th>
                        <th>สถานะ</th>
                        <th>จัดการออเดอร์</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeOrders.length === 0 ? (
                        <tr><td colSpan="4" className="empty-state">ไม่มีคิวที่กำลังดำเนินการ</td></tr>
                      ) : (
                        activeOrders.map(o => {
                          const isPendingCancel = o.Status === 'Pending_Cancellation';
                          return (
                            <tr key={o.OrderID}>
                              <td>
                                <div className="queue-pill bold">{o.QueueNo}</div>
                                {o.IsWalkIn === 1 && <span className="walkin-tag">Walk-in</span>}
                              </td>
                              <td>
                                {o.items?.map((it, idx) => (
                                  <div key={idx} className="item-row">
                                    • {it.ProductName} <b style={{ color: PALETTE.coral }}>x{it.Qty}</b>
                                    {it.ItemNote && <span className="item-note">({it.ItemNote})</span>}
                                  </div>
                                ))}
                                {o.Note && <div className="order-note">โน้ต: {o.Note}</div>}
                              </td>
                              <td>
                                <Badge tone={getStatusBadgeTone(o.Status)}>{getStatusLabel(o.Status)}</Badge>
                                {isPendingCancel && (
                                  <div style={{ fontSize: '11px', color: PALETTE.coral, fontWeight: '700', marginTop: '4px' }}>
                                    เหลือเวลา: {getRemainingLabel(o.CancelDeadline)}
                                  </div>
                                )}
                              </td>
                              <td>
                                <div className="cv-action-buttons">
                                  {o.Status === 'Ready' && (
                                    <button onClick={() => updateStatus(o.OrderID, 'Completed')} className="cv-btn btn-success">
                                      ✅ ส่งมอบอาหาร
                                    </button>
                                  )}
                                  <button onClick={() => printStub(o.QueueNo)} className="cv-btn-icon" title="พิมพ์ตั๋วคิว"><Icon name="print" size={16} /></button>
                                  <button onClick={() => viewCustomerProfile(o)} className="cv-btn-icon" title="ข้อมูลลูกค้า"><Icon name="user" size={16} /></button>
                                  
                                  {/* 🔴 ปุ่มเรียก Modal ยกเลิก/ของหมด */}
                                  {!isPendingCancel && (
                                    <button onClick={() => openCancelModal(o, 'window')} className="cv-btn btn-warning-light">
                                      ⚠️ ของหมด
                                    </button>
                                  )}
                                  <button onClick={() => openCancelModal(o, 'immediate')} className="cv-btn btn-danger-light">
                                    ❌ ยกเลิก
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STALE ORDERS */}
          {activeTab === 'stale' && (
            <div className="cv-card">
              <div className="cv-card-head">
                <div>
                  <h3>ออเดอร์ตกค้าง (ลูกค้ายังไม่มารับอาหาร)</h3>
                  <div className="caption">เกณฑ์กำหนด: ปรุงเสร็จแล้ววางทิ้งไว้เกิน 120 นาที (2 ชม.) สามารถตัดจำหน่ายเป็น Food Waste</div>
                </div>
              </div>
              <div className="cv-table-wrapper">
                <table className="cv-table">
                  <thead>
                    <tr>
                      <th>คิว</th>
                      <th>รายการอาหาร</th>
                      <th>เวลาที่ปรุงเสร็จแล้ว</th>
                      <th>การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staleOrders.length === 0 ? (
                      <tr><td colSpan="4" className="empty-state">ไม่มีออเดอร์ตกค้างที่รอรับ</td></tr>
                    ) : (
                      staleOrders.map(o => {
                        const overdue = isOverdue(o.ReadyAt);
                        return (
                          <tr key={o.OrderID}>
                            <td><span className="queue-pill bold">{o.QueueNo}</span></td>
                            <td>{o.items?.map(i => `${i.ProductName} (x${i.Qty})`).join(', ')}</td>
                            <td>
                              <Badge tone={overdue ? 'danger' : 'warning'}>
                                รอมาแล้ว {getElapsedLabel(o.ReadyAt)} {overdue ? '⚠️ เกิน 2 ชม.' : ''}
                              </Badge>
                            </td>
                            <td>
                              <button onClick={() => markNoShow(o)} className="cv-btn btn-danger">
                                🚫 เคลียร์คิว (ไม่มารับ/ทิ้งอาหาร)
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: WALKIN POS */}
          {activeTab === 'walkin' && (
            <div className="cv-pos-grid">
              <div className="cv-card">
                <div className="cv-card-head">
                  <div>
                    <h3>เมนูอาหารพร้อมจำหน่าย</h3>
                    <div className="caption">เลือกเมนูเพื่อเพิ่มลงตะกร้า Walk-in</div>
                  </div>
                </div>
                <div className="cv-product-grid">
                  {products.map(p => (
                    <div key={p.ProductId} className="cv-product-card">
                      <div className="cv-product-info">
                        <h4>{p.ProductName}</h4>
                        <div className="price">฿{fmtMoney(p.UnitPrice)}</div>
                      </div>
                      {p.IsOutOfStock ? (
                        <div className="out-of-stock-badge">สินค้าหมด</div>
                      ) : (
                        <button onClick={() => addToCart(p)} className="cv-btn btn-coral" style={{ width: '100%', marginTop: '8px' }}>
                          + สั่งจานนี้
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="cv-card cv-cart-card">
                <div className="cv-card-head">
                  <div>
                    <h3>🛒 ตะกร้าหน้าร้าน</h3>
                    <div className="caption">ชำระเงินสดและเปิดคิวทันที</div>
                  </div>
                </div>

                {cart.length === 0 ? (
                  <div className="empty-state" style={{ padding: '60px 16px' }}>ยังไม่มีรายการอาหารในตะกร้า</div>
                ) : (
                  <div className="cv-cart-body">
                    <div className="cart-item-list">
                      {cart.map((item, idx) => (
                        <div key={idx} className="cart-item">
                          <div className="item-head">
                            <span className="bold">{item.ProductName}</span>
                            <div className="price-del">
                              <span className="bold" style={{ color: PALETTE.coral }}>฿{fmtMoney(item.UnitPrice)}</span>
                              <button onClick={() => removeFromCart(idx)} className="btn-del">✖</button>
                            </div>
                          </div>
                          <input
                            type="text"
                            placeholder="โน้ตพิเศษ เช่น ไม่ใส่ผัก, เผ็ดน้อย"
                            value={item.note || ''}
                            onChange={(e) => updateCartNote(idx, e.target.value)}
                            className="cv-input-note"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="cart-total-box">
                      <span>ยอดรวมสุทธิ</span>
                      <span className="total-amount">฿{fmtMoney(totalAmount)}</span>
                    </div>

                    <input
                      type="text"
                      placeholder="หมายเหตุออเดอร์ (ถ้ามี)"
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                      className="cv-input-main"
                      style={{ marginBottom: '14px' }}
                    />

                    <button onClick={submitWalkInOrder} className="cv-btn btn-dark" style={{ width: '100%', padding: '14px', fontSize: '16px' }}>
                      💰 รับเงินสด & ออกคิวทันที
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: MENU & STOCK */}
          {activeTab === 'menu' && (
            <div className="cv-card">
              <div className="cv-card-head">
                <div>
                  <h3>ตั้งค่าสถานะวัตถุดิบหน้าร้าน</h3>
                  <div className="caption">หากวัตถุดิบหมด ให้กดเพื่อระงับการขายชั่วคราว</div>
                </div>
              </div>
              <div className="cv-stock-grid">
                {products.map(p => (
                  <div key={p.ProductId} className="cv-stock-item">
                    <div>
                      <h4 style={{ margin: '0 0 4px', fontSize: '15px' }}>{p.ProductName}</h4>
                      <Badge tone={p.IsOutOfStock ? 'danger' : 'success'}>
                        {p.IsOutOfStock ? '● สินค้าหมด' : '● พร้อมขาย'}
                      </Badge>
                    </div>
                    <button
                      onClick={() => toggleStock(p)}
                      className={`cv-btn ${p.IsOutOfStock ? 'btn-success-light' : 'btn-danger-light'}`}
                    >
                      {p.IsOutOfStock ? 'เปิดขาย' : 'ของหมด'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* 🔴 NEW MODAL: CANCEL ORDER (RECEIPT & BILL BREAKDOWN STYLE) */}
      {cancelModal && (
        <div className="cv-modal-overlay" onClick={() => setCancelModal(null)}>
          <div className="cv-modal cv-cancel-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="cancel-icon-badge">❌</div>
                <div>
                  <h3 style={{ margin: 0 }}>จัดการยกเลิกคำสั่งซื้อ</h3>
                  <div className="caption">คิวหมายเลข: <b style={{ color: PALETTE.coral }}>{cancelModal.order.QueueNo}</b></div>
                </div>
              </div>
              <button onClick={() => setCancelModal(null)} className="cv-modal-close">✖</button>
            </div>

            {/* Receipt Summary Card */}
            <div className="receipt-summary-card">
              <div className="receipt-title">สรุปรายการคำสั่งซื้อ</div>
              <div className="receipt-items">
                {cancelModal.order.items?.map((it, idx) => (
                  <div key={idx} className="receipt-item-row">
                    <span>{it.ProductName} x{it.Qty}</span>
                    <span className="bold">฿{fmtMoney(it.UnitPrice * it.Qty)}</span>
                  </div>
                ))}
              </div>
              <div className="receipt-divider" />
              <div className="receipt-total-row">
                <span>ยอดเงินที่ชำระแล้ว</span>
                <span className="receipt-total-val">฿{fmtMoney(cancelModal.order.TotalAmount)}</span>
              </div>
            </div>

            {/* Action Mode Toggle */}
            <div className="cancel-action-selector">
              <label className={`action-opt ${cancelActionChoice === 'window' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="cancelAction"
                  checked={cancelActionChoice === 'window'}
                  onChange={() => setCancelActionChoice('window')}
                />
                <div>
                  <div className="opt-title">⚠️ แจ้งวัตถุดิบหมด (รอเปลี่ยนเมนู 30 นาที)</div>
                  <div className="opt-desc">ส่งแจ้งเตือนให้ลูกค้าเลือกเปลี่ยนเมนูหรือกดยกเลิกผ่านแอป</div>
                </div>
              </label>

              <label className={`action-opt ${cancelActionChoice === 'immediate' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="cancelAction"
                  checked={cancelActionChoice === 'immediate'}
                  onChange={() => setCancelActionChoice('immediate')}
                />
                <div>
                  <div className="opt-title">❌ ขอยกเลิกคำสั่งซื้อทันที</div>
                  <div className="opt-desc">ตัดคิวออกจากระบบทันที (ติดต่อคืนเงินสดให้ลูกค้า)</div>
                </div>
              </label>
            </div>

            {/* Quick Reason Chips */}
            <div className="reason-section">
              <label className="reason-label">เลือกเหตุผลอย่างรวดเร็ว:</label>
              <div className="reason-chips">
                {quickReasons.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`reason-chip ${cancelReasonTag === r ? 'active' : ''}`}
                    onClick={() => setCancelReasonTag(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <textarea
                placeholder="ระบุรายละเอียดเพิ่มเติม (ถ้ามี)..."
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                className="cv-textarea"
                rows={2}
              />
            </div>

            {/* Footer Buttons */}
            <div className="modal-footer-btns">
              <button onClick={() => setCancelModal(null)} className="cv-btn btn-ghost">
                ยกเลิก
              </button>
              <button onClick={handleConfirmCancel} className="cv-btn btn-danger-solid">
                {cancelActionChoice === 'window' ? 'ส่งแจ้งเตือนของหมด (30 นาที)' : 'ยืนยันการยกเลิกออเดอร์ทันที'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: SLIP ===== */}
      {viewingSlip && (
        <div className="cv-modal-overlay" onClick={() => setViewingSlip(null)}>
          <div className="cv-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <h3>📄 หลักฐานการโอนเงิน</h3>
              <button onClick={() => setViewingSlip(null)} className="cv-modal-close">✖</button>
            </div>
            <img src={viewingSlip} alt="Full Slip" className="slip-full-img" />
            <button onClick={() => setViewingSlip(null)} className="cv-btn btn-dark" style={{ width: '100%', marginTop: '16px' }}>ปิดหน้าต่าง</button>
          </div>
        </div>
      )}

      {/* ===== MODAL: CUSTOMER PROFILE ===== */}
      {viewingCustomer && (
        <div className="cv-modal-overlay" onClick={() => setViewingCustomer(null)}>
          <div className="cv-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <h3>👤 โปรไฟล์ลูกค้า</h3>
              <button onClick={() => setViewingCustomer(null)} className="cv-modal-close">✖</button>
            </div>
            {viewingCustomer.loading ? (
              <p className="empty-state">กำลังดึงข้อมูลโปรไฟล์...</p>
            ) : viewingCustomer.error ? (
              <p className="empty-state" style={{ color: PALETTE.red }}>ไม่สามารถโหลดข้อมูลลูกค้าได้</p>
            ) : (
              <div className="cv-customer-info">
                <div className="info-row"><span>ชื่อ-นามสกุล:</span> <b>{viewingCustomer.CustomerName || viewingCustomer.Name || '-'}</b></div>
                <div className="info-row"><span>เบอร์โทร:</span> <b style={{ color: PALETTE.coral }}>{viewingCustomer.Phone || '-'}</b></div>
                <div className="info-row"><span>อีเมล:</span> <b>{viewingCustomer.Email || '-'}</b></div>
                <div className="info-row"><span>เคยสั่งซื้อสำเร็จ:</span> <b>{viewingCustomer.TotalOrders ?? 0} ออเดอร์</b></div>
                {viewingCustomer.Phone && (
                  <a href={`tel:${viewingCustomer.Phone}`} className="cv-btn btn-coral" style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', textDecoration: 'none' }}>
                    กดเพื่อโทรหาลูกค้า
                  </a>
                )}
              </div>
            )}
            <button onClick={() => setViewingCustomer(null)} className="cv-btn btn-dark" style={{ width: '100%', marginTop: '14px' }}>ปิดหน้าต่าง</button>
          </div>
        </div>
      )}

      {/* ===== TOAST ===== */}
      <div className={`cv-toast ${toast.show ? 'show' : ''}`}>
        <span className="toast-icon"><Icon name="check" size={16} /></span>
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}

/* ============================================================
   STYLES: Berry Style Structure + Receipt Modal Additions
   ============================================================ */
const CV_STYLES = `
::-webkit-scrollbar { width: 0px; background: transparent; display: none; }
* { scrollbar-width: none; -ms-overflow-style: none; box-sizing: border-box; }

.cv-root {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  background: ${PALETTE.bg};
  font-family: 'Prompt', 'Roboto', sans-serif;
  color: ${PALETTE.dark};
  overflow: hidden;
  z-index: 1000;
}

/* Topbar */
.cv-topbar {
  height: 72px;
  background: ${PALETTE.white};
  border-bottom: 1px solid ${PALETTE.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
  z-index: 110;
}
.cv-topbar-left { display: flex; align-items: center; gap: 16px; }
.cv-brand { display: flex; flex-direction: column; justify-content: center; width: 220px; flex-shrink: 0; }
.brand-title { font-size: 19px; font-weight: 800; color: ${PALETTE.coral}; display: flex; align-items: center; gap: 8px; }
.brand-subtitle { font-size: 11.5px; color: ${PALETTE.textSub}; display: flex; align-items: center; gap: 6px; margin-top: 2px; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: ${PALETTE.green}; }
.status-text { color: ${PALETTE.green}; font-weight: 700; }

.cv-icon-btn {
  width: 36px; height: 36px; border-radius: 10px; border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; position: relative; transition: all 0.2s;
}
.cv-icon-btn.coral-light { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }
.cv-icon-btn.coral-light:hover { background: ${PALETTE.coral}; color: ${PALETTE.white}; }
.cv-icon-btn.yellow-light { background: ${PALETTE.yellowLight}; color: #D97706; }
.cv-badge-dot-count {
  position: absolute; top: -3px; right: -3px; background: ${PALETTE.red}; color: #fff;
  font-size: 10px; font-weight: 800; border-radius: 10px; padding: 1px 5px;
}

.cv-topbar-right { display: flex; align-items: center; gap: 14px; }
.cv-store-chip {
  display: flex; align-items: center; gap: 6px; background: ${PALETTE.bg};
  border: 1px solid ${PALETTE.border}; padding: 6px 14px; border-radius: 20px;
  font-size: 13px; font-weight: 700; color: ${PALETTE.dark};
}

.cv-profile-container { position: relative; }
.cv-user-chip {
  background: ${PALETTE.coralLight}; padding: 6px 14px; border-radius: 20px;
  display: flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s;
}
.cv-user-chip .user-name { font-size: 13px; font-weight: 700; color: ${PALETTE.dark}; }
.cv-user-chip .role-tag { font-size: 10px; background: ${PALETTE.coral}; color: #fff; padding: 2px 6px; border-radius: 8px; font-weight: 800; }

.cv-profile-dropdown {
  position: absolute; top: calc(100% + 8px); right: 0; background: ${PALETTE.white};
  width: 250px; border-radius: 14px; box-shadow: 0 10px 30px rgba(42,44,65,0.12);
  border: 1px solid ${PALETTE.border}; padding: 16px; z-index: 1000;
}
.cv-profile-dropdown .dropdown-header h4 { margin: 0; font-size: 14px; font-weight: 700; }
.cv-profile-dropdown .dropdown-header p { margin: 2px 0 10px; font-size: 11px; color: ${PALETTE.textSub}; }
.cv-profile-dropdown .dropdown-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px;
  border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s;
}
.cv-profile-dropdown .dropdown-item:hover { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }

/* Body Layout */
.cv-body { display: flex; flex: 1; overflow: hidden; }

/* Sidebar */
.cv-sidebar {
  width: 250px; background: ${PALETTE.white}; border-right: 1px solid ${PALETTE.border};
  display: flex; flex-direction: column; transition: width 0.25s ease; flex-shrink: 0;
}
.cv-nav { padding: 16px 12px; flex: 1; overflow-y: auto; }
.cv-nav-label { font-size: 11px; font-weight: 800; color: ${PALETTE.textSub}; text-transform: uppercase; padding: 8px 12px; }
.cv-nav-item {
  display: flex; align-items: center; gap: 14px; padding: 10px 12px; margin-bottom: 6px;
  border-radius: 10px; cursor: pointer; color: ${PALETTE.dark}; transition: all 0.15s;
}
.cv-nav-item:hover, .cv-nav-item.active { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }
.cv-nav-text .title { font-size: 13.5px; font-weight: 700; }
.cv-nav-text .caption { font-size: 11px; color: ${PALETTE.textSub}; margin-top: 1px; }
.cv-nav-item.active .caption { color: ${PALETTE.coral}; opacity: 0.8; }
.cv-nav-badge {
  margin-left: auto; background: ${PALETTE.coral}; color: #fff;
  font-size: 11px; padding: 2px 7px; border-radius: 10px; font-weight: 800;
}

@media (min-width: 769px) {
  .cv-sidebar.collapsed { width: 76px; }
  .cv-sidebar.collapsed .hide-on-collapse { display: none !important; }
  .cv-sidebar.collapsed .cv-nav-item { justify-content: center; }
}

/* Content Area */
.cv-content { flex: 1; padding: 20px 24px; overflow-y: auto; }
.cv-stack { display: flex; flex-direction: column; gap: 20px; }

/* Cards */
.cv-card {
  background: ${PALETTE.white}; border-radius: 16px; border: 1px solid ${PALETTE.border};
  padding: 20px; box-shadow: 0 2px 10px rgba(42,44,65,0.03);
}
.cv-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.cv-card-head h3 { margin: 0; font-size: 16px; font-weight: 800; color: ${PALETTE.dark}; }
.cv-card-head .caption { font-size: 12px; color: ${PALETTE.textSub}; margin-top: 2px; }

/* Stat Cards */
.cv-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.cv-bg-coral { background: linear-gradient(135deg, ${PALETTE.coral} 0%, #E85A33 100%); color: #fff; position: relative; overflow: hidden; }
.cv-bg-yellow { background: linear-gradient(135deg, ${PALETTE.yellow} 0%, #F59E0B 100%); color: ${PALETTE.dark}; }
.cv-bg-dark { background: ${PALETTE.dark}; color: #fff; }
.cv-decor-circle-1 { position: absolute; width: 140px; height: 140px; background: rgba(255,255,255,0.12); border-radius: 50%; top: -40px; right: -40px; }
.cv-stat-body h2 { margin: 0 0 4px; font-size: 32px; font-weight: 900; }
.cv-stat-body p { margin: 0; font-size: 13px; font-weight: 600; opacity: 0.9; }

/* Tables */
.cv-table-wrapper { overflow-x: auto; }
.cv-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.cv-table th { text-align: left; padding: 12px 14px; font-weight: 700; color: ${PALETTE.textSub}; border-bottom: 1px solid ${PALETTE.border}; font-size: 12px; }
.cv-table td { padding: 14px; border-bottom: 1px solid ${PALETTE.border}; vertical-align: middle; }
.cv-table tr:last-child td { border-bottom: none; }
.empty-state { text-align: center; color: ${PALETTE.textSub}; padding: 36px 0; font-size: 13.5px; }

.queue-pill {
  background: ${PALETTE.bg}; border: 1px solid ${PALETTE.border}; padding: 4px 10px;
  border-radius: 8px; font-weight: 800; font-size: 14px; display: inline-block;
}
.walkin-tag {
  display: block; width: fit-content; margin-top: 4px; background: ${PALETTE.dark};
  color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 800;
}
.item-row { margin-bottom: 3px; font-size: 13px; }
.item-note { color: #D97706; font-size: 11.5px; margin-left: 4px; }
.order-note { font-size: 11.5px; color: ${PALETTE.textSub}; background: ${PALETTE.bg}; padding: 4px 8px; border-radius: 6px; margin-top: 4px; }

.slip-thumb { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.slip-thumb img { width: 42px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid ${PALETTE.border}; }
.slip-thumb span { font-size: 11.5px; color: ${PALETTE.coral}; font-weight: 700; }

.cv-action-buttons { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }

/* Buttons */
.cv-btn {
  border: none; border-radius: 8px; padding: 8px 14px; font-size: 12.5px;
  font-weight: 700; cursor: pointer; transition: all 0.15s; font-family: inherit;
}
.cv-btn-icon {
  width: 32px; height: 32px; border-radius: 8px; border: 1px solid ${PALETTE.border};
  background: #fff; display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: ${PALETTE.dark}; transition: all 0.15s;
}
.cv-btn-icon:hover { border-color: ${PALETTE.coral}; color: ${PALETTE.coral}; }

.btn-coral { background: ${PALETTE.coral}; color: #fff; }
.btn-dark { background: ${PALETTE.dark}; color: #fff; }
.btn-success { background: ${PALETTE.green}; color: #fff; }
.btn-success-light { background: ${PALETTE.greenLight}; color: #065F46; }
.btn-danger-light { background: ${PALETTE.redLight}; color: #991B1B; }
.btn-warning-light { background: ${PALETTE.yellowLight}; color: #92400E; }
.btn-ghost { background: ${PALETTE.bg}; color: ${PALETTE.dark}; }
.btn-danger-solid { background: ${PALETTE.red}; color: #fff; }
.btn-del { background: none; border: none; color: ${PALETTE.red}; cursor: pointer; font-size: 14px; }

/* Badges */
.cv-badge { display: inline-flex; padding: 4px 10px; border-radius: 14px; font-size: 11.5px; font-weight: 700; }
.cv-badge.tone-success { background: ${PALETTE.greenLight}; color: #065F46; }
.cv-badge.tone-warning { background: ${PALETTE.yellowLight}; color: #92400E; }
.cv-badge.tone-danger { background: ${PALETTE.redLight}; color: #991B1B; }
.cv-badge.tone-coral { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }
.cv-badge.tone-neutral { background: ${PALETTE.bg}; color: ${PALETTE.textSub}; }

/* Walk-in POS Grid */
.cv-pos-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 20px; }
.cv-product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
.cv-product-card {
  border: 1px solid ${PALETTE.border}; border-radius: 12px; padding: 14px;
  background: ${PALETTE.white}; display: flex; flex-direction: column; justify-content: space-between;
}
.cv-product-info h4 { margin: 0 0 6px; font-size: 14px; font-weight: 700; color: ${PALETTE.dark}; }
.cv-product-info .price { font-size: 16px; font-weight: 900; color: ${PALETTE.coral}; }
.out-of-stock-badge {
  background: ${PALETTE.redLight}; color: ${PALETTE.red}; padding: 8px; border-radius: 8px;
  text-align: center; font-size: 12px; font-weight: 800; margin-top: 8px;
}

.cv-cart-card { display: flex; flex-direction: column; }
.cv-cart-body { display: flex; flex-direction: column; }
.cart-item-list { max-height: 280px; overflow-y: auto; margin-bottom: 14px; }
.cart-item { background: ${PALETTE.bg}; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
.cart-item .item-head { display: flex; justify-content: space-between; align-items: center; }
.cart-item .price-del { display: flex; align-items: center; gap: 10px; }
.cv-input-note {
  width: 100%; border: 1px solid ${PALETTE.border}; border-radius: 6px;
  padding: 6px 10px; font-size: 12px; margin-top: 6px; outline: none; background: #fff;
}
.cart-total-box {
  display: flex; justify-content: space-between; align-items: center;
  border-top: 2px dashed ${PALETTE.border}; padding: 14px 0; margin-bottom: 12px;
  font-weight: 800; font-size: 15px;
}
.cart-total-box .total-amount { font-size: 24px; color: ${PALETTE.coral}; font-weight: 900; }
.cv-input-main {
  width: 100%; border: 1px solid ${PALETTE.border}; border-radius: 8px;
  padding: 10px 12px; font-size: 13px; outline: none; background: #fff;
}

/* Stock Grid */
.cv-stock-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.cv-stock-item {
  border: 1px solid ${PALETTE.border}; border-radius: 12px; padding: 14px 16px;
  display: flex; justify-content: space-between; align-items: center;
}

/* Modals */
.cv-modal-overlay {
  position: fixed; inset: 0; background: rgba(42,44,65,0.65); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 16px;
}
.cv-modal {
  background: #fff; border-radius: 18px; padding: 24px; width: 100%;
  max-width: 440px; box-shadow: 0 20px 40px rgba(42,44,65,0.25);
}
.cv-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.cv-modal-head h3 { margin: 0; font-size: 17px; font-weight: 800; }
.cv-modal-close { background: none; border: none; font-size: 16px; cursor: pointer; color: ${PALETTE.textSub}; }
.slip-full-img { width: 100%; max-height: 55vh; object-fit: contain; border-radius: 10px; border: 1px solid ${PALETTE.border}; }
.cv-customer-info .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid ${PALETTE.border}; font-size: 13.5px; }

/* 🔴 New Cancel Modal Special Styles (Receipt / Invoice look) */
.cv-cancel-modal { max-width: 480px; }
.cancel-icon-badge {
  width: 38px; height: 38px; border-radius: 10px; background: ${PALETTE.redLight};
  color: ${PALETTE.red}; display: flex; align-items: center; justify-content: center; font-size: 18px;
}
.receipt-summary-card {
  background: ${PALETTE.bg}; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px;
  border: 1px dashed ${PALETTE.border};
}
.receipt-title { font-size: 11px; font-weight: 800; color: ${PALETTE.textSub}; text-transform: uppercase; margin-bottom: 8px; }
.receipt-items { max-height: 90px; overflow-y: auto; font-size: 13px; }
.receipt-item-row { display: flex; justify-content: space-between; margin-bottom: 4px; color: ${PALETTE.dark}; }
.receipt-divider { border-top: 1px solid ${PALETTE.border}; margin: 8px 0; }
.receipt-total-row { display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 700; }
.receipt-total-val { font-size: 18px; color: ${PALETTE.coral}; font-weight: 900; }

.cancel-action-selector { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.action-opt {
  display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 10px;
  border: 1.5px solid ${PALETTE.border}; cursor: pointer; transition: all 0.15s; background: #fff;
}
.action-opt input { margin-top: 3px; accent-color: ${PALETTE.coral}; }
.action-opt.active { border-color: ${PALETTE.coral}; background: ${PALETTE.coralLight}; }
.opt-title { font-size: 13px; font-weight: 700; color: ${PALETTE.dark}; }
.opt-desc { font-size: 11.5px; color: ${PALETTE.textSub}; margin-top: 2px; }

.reason-section { margin-bottom: 18px; }
.reason-label { display: block; font-size: 12px; font-weight: 700; color: ${PALETTE.dark}; margin-bottom: 8px; }
.reason-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.reason-chip {
  background: #fff; border: 1px solid ${PALETTE.border}; border-radius: 16px;
  padding: 5px 12px; font-size: 11.5px; font-weight: 600; cursor: pointer; transition: all 0.15s;
  color: ${PALETTE.dark};
}
.reason-chip:hover { border-color: ${PALETTE.coral}; }
.reason-chip.active { background: ${PALETTE.dark}; color: #fff; border-color: ${PALETTE.dark}; }

.cv-textarea {
  width: 100%; border: 1px solid ${PALETTE.border}; border-radius: 8px;
  padding: 8px 10px; font-size: 12.5px; outline: none; resize: none; font-family: inherit;
}
.cv-textarea:focus { border-color: ${PALETTE.coral}; }

.modal-footer-btns { display: flex; justify-content: flex-end; gap: 10px; }
.modal-footer-btns .cv-btn { padding: 10px 18px; font-size: 13px; }

/* Toast */
.cv-toast {
  position: fixed; bottom: 24px; right: 24px; background: ${PALETTE.dark}; color: #fff;
  padding: 12px 18px; border-radius: 10px; font-size: 13px; font-weight: 700;
  display: flex; align-items: center; gap: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  opacity: 0; transform: translateY(20px); pointer-events: none; transition: all 0.25s; z-index: 10001;
}
.cv-toast.show { opacity: 1; transform: translateY(0); }
.toast-icon { background: ${PALETTE.green}; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }

.bold { font-weight: 700; }
.cv-divider { border: none; border-top: 1px solid ${PALETTE.border}; margin: 8px 0; }
`;