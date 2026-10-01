import React, { useState, useEffect, useRef } from 'react';

// โทนสีเดิมของ Counter & Theme กลาง
const PALETTE = {
  coral: '#FF724C',        // --berry-purple (primary)
  coralLight: '#FFEAE3',   // --berry-purple-light
  coralDark: '#E8552D',    // --berry-purple-dark
  yellow: '#FDBF50',       // cloud-icon gradient start
  yellowLight: '#FFF4DE',  // --berry-amber-light
  amber: '#E2A430',        // --berry-amber
  white: '#FFFFFF',        // --berry-paper
  dark: '#2A2C41',         // --berry-blue / --berry-text-dark
  darkLight: '#1D1F2F',    // --berry-blue-dark
  bg: '#F6F7FB',           // --berry-bg
  bgSoft: '#EDEEF4',       // --berry-blue-light
  border: '#E6E8F0',       // --berry-border
  textSub: '#8A8FA6',      // --berry-text-muted
  green: '#17A673',        // --berry-green
  greenLight: '#E3F6EE',
  red: '#E2452F',          // --berry-red
  redLight: '#FDEAE6',
};

const fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function Icon({ name, size = 20 }) {
  const paths = {
    orders: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="m9 14 2 2 4-4" /></>,
    stale: <><circle cx="12" cy="12" r="9" /><polyline points="12 6 12 12 16 14" /></>,
    walkin: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>,
    menu: <><path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" /></>,
    bell: <><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" /></>,
    user: <><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></>,
    print: <><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
    check: <><polyline points="20 6 9 17 4 12" /></>,
    close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    warn: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
    store: <><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" /><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" /><path d="M2 7h20" /></>,
    logout: <><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></>
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
  const [rejectSlipModal, setRejectSlipModal] = useState(null);
  const [rejectSlipReason, setRejectSlipReason] = useState('สลิปไม่ถูกต้อง');
  const [foodCourtOpen, setFoodCourtOpen] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [reportCancellations, setReportCancellations] = useState([]);
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

  const fetchReports = () => {
    Promise.all([
      fetch(`${apiBase}/api/reports/dashboard?store_id=${activeStoreId}`).then(r => r.json()),
      fetch(`${apiBase}/api/reports/cancellations?store_id=${activeStoreId}`).then(r => r.json())
    ])
      .then(([dashboard, cancellations]) => {
        setReportData(Array.isArray(dashboard) ? dashboard[0] || null : null);
        setReportCancellations(Array.isArray(cancellations) ? cancellations : []);
      })
      .catch(err => console.error("Error reports:", err));
  };

  // โหลดข้อมูลร้านค้า และซิงก์สถานะร้านเป็นระยะ
  const fetchStores = async () => {
    try {
      const res = await fetch(`${apiBase}/api/stores`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setStores(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error stores:", err);
    }
  };

  // เช็กสถานะโรงอาหารแยกจาก fetchData เพื่อไม่ให้ request อื่นมาขัดการ sync
  const checkFoodCourtStatus = async () => {
    try {
      const res = await fetch(`${apiBase}/api/food-court/status`, {
        cache: 'no-store',
      });

      if (!res.ok) return;

      const data = await res.json();
      setFoodCourtOpen(Boolean(data?.is_open));
    } catch (err) {
      console.error("Error food court status:", err);
    }
  };

  useEffect(() => {
    fetchStores();
    checkFoodCourtStatus();

    const storeInterval = setInterval(fetchStores, 2000);
    const foodCourtInterval = setInterval(checkFoodCourtStatus, 2000);

    return () => {
      clearInterval(storeInterval);
      clearInterval(foodCourtInterval);
    };
  }, [apiBase]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3500);
    return () => clearInterval(interval);
  }, [activeStoreId, apiBase]);

  useEffect(() => {
    if (activeTab === 'reports') fetchReports();
  }, [activeTab, activeStoreId, apiBase]);

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
  const verifySlip = (id, approved, reason = '') => {
    fetch(`${apiBase}/api/orders/${id}/verify-slip`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved, reason })
    }).then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.detail || 'ไม่สามารถตรวจสอบสลิปได้');
        return;
      }
      showToast(approved ? 'อนุมัติสลิปแล้ว ส่งคิวเข้าครัว' : 'ปฏิเสธสลิปแล้ว');
      setViewingSlip(null);
      setRejectSlipModal(null);
      fetchData();
    }).catch(() => showToast('เชื่อมต่อระบบตรวจสลิปไม่สำเร็จ'));
  };

  const openRejectSlip = (order) => {
    setViewingSlip(null);
    setRejectSlipReason('สลิปไม่ถูกต้อง');
    setRejectSlipModal(order);
  };

  const submitRejectSlip = () => {
    if (!rejectSlipModal || !rejectSlipReason.trim()) return;
    verifySlip(rejectSlipModal.OrderID, false, rejectSlipReason.trim());
  };

  const updateStatus = (id, status, cancelReason = null) => {
    fetch(`${apiBase}/api/orders/${id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, user_role: 'Front Staff', cancel_reason: cancelReason })
    }).then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.detail || 'ไม่สามารถเปลี่ยนสถานะออเดอร์ได้');
        return;
      }
      showToast(`อัปเดตสถานะเป็น "${status}" สำเร็จ`);
      fetchData();
    }).catch(() => showToast('เชื่อมต่อระบบออเดอร์ไม่สำเร็จ'));
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
    // การปิดเมนูเป็นการจัดการ stock ระดับเมนู ไม่ผูกกับออเดอร์ที่ทำเสร็จแล้ว

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
    if (!foodCourtOpen) return showToast('โรงอาหารปิดอยู่ ไม่สามารถเปิดคิว Walk-in ได้');
    if (currentStore?.IsSuspended) return showToast('ร้านถูกระงับการขายชั่วคราว');
    if (currentStore && !currentStore.IsOpen) return showToast('ร้านปิดอยู่ ไม่สามารถเปิดคิว Walk-in ได้');
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
    { id: 'reports', label: 'Reports', caption: 'รายงานการขายและปัญหา', icon: 'orders' },
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
              โรงอาหาร: <span className={`status-dot ${foodCourtOpen ? 'open' : 'closed'}`}></span>
              <span className={`status-text ${foodCourtOpen ? 'open' : 'closed'}`}>{foodCourtOpen ? 'เปิดให้บริการ' : 'ปิดให้บริการ'}</span>
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
            <span className={`store-status-pill ${foodCourtOpen && currentStore?.IsOpen && !currentStore?.IsSuspended ? 'open' : 'closed'}`}>
              {currentStore?.IsSuspended ? 'ระงับ' : (foodCourtOpen && currentStore?.IsOpen ? 'เปิด' : 'ปิด')}
            </span>
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
          {!foodCourtOpen && (
            <div className="foodcourt-closed-banner">
              <span>🔒</span>
              <div><b>โรงอาหารปิดให้บริการ</b><small>ระบบยังจัดการออเดอร์เดิมได้ แต่ไม่สามารถเปิดออเดอร์ Walk-in ใหม่ได้</small></div>
            </div>
          )}
          {foodCourtOpen && currentStore && (!currentStore.IsOpen || currentStore.IsSuspended) && (
            <div className="store-closed-banner">
              <span>⚠️</span>
              <div><b>{currentStore.IsSuspended ? 'ร้านถูกระงับการขาย' : 'ร้านปิดให้บริการ'}</b><small>ไม่สามารถเปิดออเดอร์ Walk-in ใหม่ได้</small></div>
            </div>
          )}
          
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
                                <div onClick={() => setViewingSlip(o)} className="slip-thumb">
                                  <img src={o.SlipUrl} alt="Slip" />
                                  <span>ตรวจสลิป + รายการอาหาร</span>
                                </div>
                              ) : <span style={{ color: PALETTE.red, fontWeight: 'bold' }}>ไม่มีสลิป</span>}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button onClick={() => setViewingSlip(o)} className="cv-btn btn-dark" style={{ marginRight: '8px' }}>
                                🔎 ตรวจรายการ
                              </button>
                              <button onClick={() => verifySlip(o.OrderID, true)} className="cv-btn btn-success-light" style={{ marginRight: '8px' }}>
                                ✅ ยืนยัน
                              </button>
                              <button onClick={() => openRejectSlip(o)} className="cv-btn btn-danger-light">
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
                                  
                                  {/* ของหมด/ยกเลิกใช้ได้เฉพาะคิวที่ยังไม่เสร็จ */}
                                  {!isPendingCancel && ['Pending', 'Cooking'].includes(o.Status) && (
                                    <button onClick={() => openCancelModal(o, 'window')} className="cv-btn btn-warning-light">
                                      ⚠️ ของหมด
                                    </button>
                                  )}
                                  {['Pending', 'Cooking'].includes(o.Status) && (
                                    <button onClick={() => openCancelModal(o, 'immediate')} className="cv-btn btn-danger-light">
                                      ❌ ยกเลิก
                                    </button>
                                  )}
                                  {o.Status === 'Ready' && (
                                    <span className="action-lock-note">อาหารเสร็จแล้ว</span>
                                  )}
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
                    <div className="caption">เลือกเมนูเพื่อเพิ่มลงตะกร้า Walk-in {(!foodCourtOpen || currentStore?.IsSuspended || currentStore?.IsOpen === false) && '• ขณะนี้ปิดรับออเดอร์'}</div>
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

                    <button disabled={!foodCourtOpen || currentStore?.IsSuspended || currentStore?.IsOpen === false} onClick={submitWalkInOrder} className="cv-btn btn-dark" style={{ width: '100%', padding: '14px', fontSize: '16px' }}>
                      {!foodCourtOpen ? '🔒 โรงอาหารปิด — เปิดคิวไม่ได้' : currentStore?.IsSuspended ? '🔒 ร้านถูกระงับ' : currentStore?.IsOpen === false ? '🔒 ร้านปิด — เปิดคิวไม่ได้' : '💰 รับเงินสด & ออกคิวทันที'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: REPORTS */}
          {activeTab === 'reports' && (
            <div className="cv-stack">
              <div className="cv-card">
                <div className="cv-card-head">
                  <div>
                    <h3>📊 รายงานหน้าร้าน</h3>
                    <div className="caption">สรุปข้อมูลจากระบบของร้านนี้</div>
                  </div>
                  <button onClick={fetchReports} className="cv-btn btn-ghost">↻ รีเฟรช</button>
                </div>
                <div className="report-grid">
                  <div className="report-card"><span>ยอดขายสุทธิ</span><b>฿{fmtMoney(reportData?.net_sales)}</b><small>Completed + No-Show ตาม API รายงาน</small></div>
                  <div className="report-card"><span>จำนวนออเดอร์</span><b>{reportData?.total_orders ?? 0}</b><small>ออเดอร์ที่ถูกนับในรายงาน</small></div>
                  <div className="report-card"><span>ยกเลิก</span><b>{reportCancellations.length}</b><small>รายการสถานะ Cancelled</small></div>
                  <div className="report-card"><span>เมนูหมดตอนนี้</span><b>{products.filter(p => p.IsOutOfStock).length}</b><small>สถานะจาก Menu & Stock</small></div>
                </div>
              </div>

              <div className="cv-card">
                <div className="cv-card-head"><div><h3>ประวัติการยกเลิก</h3><div className="caption">ใช้ตรวจสอบปัญหาออเดอร์และเหตุผลที่ยกเลิก</div></div></div>
                <div className="cv-table-wrapper">
                  <table className="cv-table">
                    <thead><tr><th>คิว</th><th>ยอดเงิน</th><th>เหตุผล</th><th>Order ID</th></tr></thead>
                    <tbody>
                      {reportCancellations.length === 0 ? <tr><td colSpan="4" className="empty-state">ยังไม่มีประวัติการยกเลิก</td></tr> : reportCancellations.slice(0, 20).map(o => (
                        <tr key={o.OrderID}><td><span className="queue-pill">{o.QueueNo}</span></td><td>฿{fmtMoney(o.TotalAmount)}</td><td>{o.CancelReason || '-'}</td><td>#{o.OrderID}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: MENU & STOCK */}
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

      {/* ===== MODAL: SLIP + ORDER ITEMS ===== */}
      {viewingSlip && (
        <div className="cv-modal-overlay" onClick={() => setViewingSlip(null)}>
          <div className="cv-modal cv-slip-review-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <div><h3>🧾 ตรวจสอบสลิปและรายการอาหาร</h3><div className="caption">คิว <b style={{ color: PALETTE.coral }}>{viewingSlip.QueueNo}</b></div></div>
              <button onClick={() => setViewingSlip(null)} className="cv-modal-close">✖</button>
            </div>

            <div className="slip-order-summary">
              <div className="receipt-title">รายการที่ลูกค้าสั่ง</div>
              {viewingSlip.items?.map((it, idx) => (
                <div key={idx} className="receipt-item-row">
                  <span>{it.ProductName} × {it.Qty}</span>
                  <b>฿{fmtMoney(Number(it.UnitPrice) * Number(it.Qty))}</b>
                </div>
              ))}
              <div className="receipt-divider" />
              <div className="receipt-total-row"><span>ยอดรวม</span><span className="receipt-total-val">฿{fmtMoney(viewingSlip.TotalAmount)}</span></div>
            </div>

            {viewingSlip.SlipUrl ? <img src={viewingSlip.SlipUrl} alt="Slip" className="slip-full-img" /> : <div className="empty-state">ไม่มีรูปสลิป</div>}

            <div className="modal-footer-btns">
              <button onClick={() => openRejectSlip(viewingSlip)} className="cv-btn btn-danger-light">❌ ปฏิเสธสลิป</button>
              <button onClick={() => verifySlip(viewingSlip.OrderID, true)} className="cv-btn btn-success">✅ ยืนยันสลิปและส่งเข้าครัว</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: REJECT SLIP ===== */}
      {rejectSlipModal && (
        <div className="cv-modal-overlay" onClick={() => setRejectSlipModal(null)}>
          <div className="cv-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <div><h3>❌ ปฏิเสธสลิป</h3><div className="caption">คิว {rejectSlipModal.QueueNo} • ฿{fmtMoney(rejectSlipModal.TotalAmount)}</div></div>
              <button onClick={() => setRejectSlipModal(null)} className="cv-modal-close">✖</button>
            </div>
            <div className="reason-section">
              <label className="reason-label">เหตุผลที่ปฏิเสธ</label>
              <div className="reason-chips">
                {['สลิปไม่ถูกต้อง', 'ยอดเงินไม่ตรง', 'ไม่พบรายการโอนเงิน', 'สลิปซ้ำ', 'รูปสลิปไม่ชัดเจน', 'เหตุผลอื่นๆ'].map(r => (
                  <button key={r} type="button" className={`reason-chip ${rejectSlipReason === r ? 'active' : ''}`} onClick={() => setRejectSlipReason(r)}>{r}</button>
                ))}
              </div>
              <textarea value={rejectSlipReason} onChange={e => setRejectSlipReason(e.target.value)} className="cv-textarea" rows={3} placeholder="ระบุเหตุผลเพิ่มเติม" />
            </div>
            <div className="modal-footer-btns">
              <button onClick={() => setRejectSlipModal(null)} className="cv-btn btn-ghost">กลับ</button>
              <button onClick={submitRejectSlip} className="cv-btn btn-danger-solid">ยืนยันการปฏิเสธ</button>
            </div>
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
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Sarabun:wght@400;500;600;700&display=swap');
::-webkit-scrollbar { width: 0px; background: transparent; display: none; }
* { scrollbar-width: none; -ms-overflow-style: none; }

.cv-root {
  --radius-lg: 14px;
  --radius-md: 9px;
  --shadow-sm: 0 2px 10px rgba(42,44,65,0.05);
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column;
  background: ${PALETTE.bg};
  font-family: 'Roboto', 'Sarabun', sans-serif;
  color: ${PALETTE.dark};
  overflow: hidden; z-index: 1000;
}
.cv-root * { box-sizing: border-box; }

/* ---------- Topbar ---------- */
.cv-topbar {
  height: 80px; background: ${PALETTE.white}; display: flex; align-items: center;
  justify-content: space-between; padding: 0 24px; border-bottom: 1px solid ${PALETTE.border};
  flex-shrink: 0; z-index: 110;
}
.cv-topbar-left { display: flex; align-items: center; gap: 16px; }
.cv-brand { width: 236px; flex-shrink: 0; display: flex; flex-direction: column; justify-content: center; white-space: nowrap; }
.brand-title { font-size: 20px; color: ${PALETTE.dark}; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.brand-subtitle { font-size: 12px; margin-top: 4px; color: ${PALETTE.textSub}; display: flex; align-items: center; gap: 6px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: ${PALETTE.green}; display: inline-block; }
.status-dot.closed { background: ${PALETTE.red}; }
.status-text { color: ${PALETTE.green}; font-weight: 600; }
.status-text.closed { color: ${PALETTE.red}; }

.cv-icon-btn {
  width: 34px; height: 34px; border-radius: var(--radius-md); border: none;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  position: relative; transition: all 0.2s ease;
}
.cv-icon-btn.coral-light { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }
.cv-icon-btn.coral-light:hover { background: ${PALETTE.coral}; color: #fff; }
.cv-icon-btn.yellow-light { background: ${PALETTE.yellowLight}; color: #F59E0B; }
.cv-icon-btn.yellow-light:hover { background: #F59E0B; color: #fff; }
.cv-badge-dot-count {
  position: absolute; top: -6px; right: -6px; background: ${PALETTE.red}; color: #fff;
  font-size: 10px; font-weight: 700; min-width: 18px; height: 18px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center; padding: 0 4px;
}
.cv-topbar-right { display: flex; align-items: center; gap: 16px; }

.cv-store-chip {
  display: flex; align-items: center; gap: 8px; background: ${PALETTE.bgSoft};
  padding: 6px 12px; border-radius: 20px; font-size: 14px; font-weight: 500; color: ${PALETTE.dark};
}
.store-status-pill { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 12px; }
.store-status-pill.open { background: ${PALETTE.greenLight}; color: ${PALETTE.green}; }
.store-status-pill.closed { background: ${PALETTE.redLight}; color: ${PALETTE.red}; }

.cv-profile-container { position: relative; }
.cv-user-chip {
  background: ${PALETTE.bgSoft}; padding: 6px 12px; border-radius: 20px;
  display: flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s ease;
}
.cv-user-chip:hover { background: #E1E3EE; }
.cv-user-chip .user-name { font-size: 14px; font-weight: 500; color: ${PALETTE.dark}; }
.cv-user-chip .role-tag { font-size: 11px; background: ${PALETTE.dark}; color: #fff; padding: 2px 8px; border-radius: 10px; font-weight: 600; }

.cv-profile-dropdown {
  position: absolute; top: calc(100% + 10px); right: 0; background: ${PALETTE.white};
  width: 280px; border-radius: var(--radius-lg); box-shadow: 0px 8px 24px rgba(0,0,0,0.1);
  border: 1px solid ${PALETTE.border}; padding: 20px; z-index: 1000;
  animation: cvSlideDown 0.2s ease-out forwards;
}
@keyframes cvSlideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
.cv-profile-dropdown .dropdown-header h4 { margin: 0; font-size: 15px; font-weight: 600; color: ${PALETTE.dark}; }
.cv-profile-dropdown .dropdown-header p { margin: 4px 0 16px; font-size: 13px; color: ${PALETTE.textSub}; }
.cv-profile-dropdown .dropdown-item {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 6px;
  cursor: pointer; font-size: 14px; color: ${PALETTE.dark}; transition: background 0.2s; margin-bottom: 2px;
}
.cv-profile-dropdown .dropdown-item:hover { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }

/* ---------- Body / Sidebar ---------- */
.cv-body { display: flex; flex: 1; overflow: hidden; }
.cv-sidebar {
  width: 260px; background: ${PALETTE.white}; border-right: 1px solid ${PALETTE.border};
  display: flex; flex-direction: column; flex-shrink: 0; z-index: 100; overflow-x: hidden;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.cv-nav { padding: 16px; flex: 1; overflow-y: auto; overflow-x: hidden; }
.cv-nav-label { font-size: 14px; font-weight: 500; color: ${PALETTE.dark}; padding: 12px 16px; margin-bottom: 4px; white-space: nowrap; }
.cv-nav-item {
  display: flex; align-items: center; gap: 16px; padding: 10px 16px; margin-bottom: 8px;
  border-radius: var(--radius-md); cursor: pointer; color: ${PALETTE.dark}; transition: all 0.2s ease; white-space: nowrap;
}
.cv-nav-item:hover, .cv-nav-item.active { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }
.cv-nav-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cv-nav-text .title { font-size: 14px; font-weight: 500; }
.cv-nav-text .caption { font-size: 12px; color: ${PALETTE.textSub}; margin-top: 2px; }
.cv-nav-item:hover .caption, .cv-nav-item.active .caption { color: ${PALETTE.coral}; opacity: 0.8; }
.cv-nav-badge { margin-left: auto; background: ${PALETTE.dark}; color: #fff; font-size: 12px; padding: 2px 8px; border-radius: 12px; font-weight: bold; }

@media (min-width: 769px) {
  .cv-sidebar.collapsed { width: 88px; }
  .cv-sidebar.collapsed .hide-on-collapse { display: none !important; }
  .cv-sidebar.collapsed .cv-nav-item { justify-content: center; padding: 12px; }
}
@media (max-width: 768px) {
  .cv-sidebar { position: absolute; top: 0; bottom: 0; left: 0; transform: translateX(-100%); }
  .cv-sidebar.open { transform: translateX(0); box-shadow: 0 8px 24px rgba(0,0,0,0.1); }
  .cv-brand { width: auto; }
  .cv-stat-grid { grid-template-columns: 1fr; }
  .cv-pos-grid { grid-template-columns: 1fr; }
}

/* ---------- Content / Cards ---------- */
.cv-content { flex: 1; padding: 24px; overflow-y: auto; }
.cv-stack { display: flex; flex-direction: column; gap: 24px; }
.cv-card {
  background: ${PALETTE.white}; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);
  padding: 24px; position: relative; overflow: hidden;
}
.cv-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.cv-card-head h3 { margin: 0; font-size: 18px; font-weight: 600; color: ${PALETTE.dark}; }
.cv-card-head .caption { font-size: 12px; color: ${PALETTE.textSub}; margin-top: 4px; }

/* Stat cards (Owner: solid colour + decorative circles) */
.cv-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.cv-bg-coral { background: ${PALETTE.coral}; color: #fff; }
.cv-bg-yellow { background: ${PALETTE.yellowLight}; color: ${PALETTE.dark}; }
.cv-bg-dark { background: ${PALETTE.dark}; color: #fff; }
.cv-decor-circle-1 { position: absolute; width: 210px; height: 210px; background: ${PALETTE.coralDark}; border-radius: 50%; top: -85px; right: -95px; opacity: 0.5; }
.cv-bg-coral::after { content: ''; position: absolute; width: 210px; height: 210px; background: ${PALETTE.coralDark}; border-radius: 50%; top: -125px; right: -15px; opacity: 0.5; }
.cv-stat-body { position: relative; z-index: 2; }
.cv-stat-body h2 { margin: 0 0 4px; font-size: 30px; font-weight: 500; }
.cv-stat-body p { margin: 0; font-size: 14px; opacity: 0.9; }

.foodcourt-closed-banner, .store-closed-banner { display: flex; gap: 12px; align-items: center; padding: 14px 16px; border-radius: var(--radius-md); margin-bottom: 24px; }
.foodcourt-closed-banner { background: ${PALETTE.redLight}; color: ${PALETTE.red}; }
.store-closed-banner { background: ${PALETTE.yellowLight}; color: #9A6A12; }
.foodcourt-closed-banner b, .store-closed-banner b { display: block; font-size: 14px; font-weight: 600; }
.foodcourt-closed-banner small, .store-closed-banner small { display: block; margin-top: 2px; font-size: 12px; opacity: .85; }

/* ---------- Tables ---------- */
.cv-table-wrapper { overflow-x: auto; }
.cv-table { width: 100%; border-collapse: collapse; }
.cv-table th { text-align: left; padding: 16px; font-size: 14px; font-weight: 600; color: ${PALETTE.dark}; border-bottom: 1px solid ${PALETTE.border}; }
.cv-table td { padding: 16px; border-bottom: 1px solid ${PALETTE.border}; font-size: 14px; vertical-align: middle; }
.cv-table tr:last-child td { border-bottom: none; }
.empty-state { text-align: center; color: ${PALETTE.textSub}; padding: 32px !important; font-size: 14px; }
.queue-pill { font-family: 'Roboto', monospace; background: ${PALETTE.bgSoft}; padding: 4px 10px; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block; }
.walkin-tag { display: block; width: fit-content; margin-top: 4px; background: ${PALETTE.dark}; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.item-row { margin-bottom: 3px; font-size: 14px; }
.item-note { color: ${PALETTE.amber}; font-size: 12px; margin-left: 4px; }
.order-note { font-size: 12px; color: ${PALETTE.textSub}; background: ${PALETTE.bg}; padding: 4px 8px; border-radius: 6px; margin-top: 4px; }
.slip-thumb { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.slip-thumb img { width: 42px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid ${PALETTE.border}; }
.slip-thumb span { font-size: 12px; color: ${PALETTE.coral}; font-weight: 500; }
.cv-action-buttons { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.action-lock-note { font-size: 12px; color: ${PALETTE.textSub}; padding: 6px 8px; }

/* ---------- Buttons ---------- */
.cv-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 6px 12px; border-radius: 6px; border: none; font-size: 12px; font-weight: 500;
  cursor: pointer; font-family: inherit; transition: all 0.2s ease;
}
.cv-btn:disabled { opacity: .45; cursor: not-allowed; }
.cv-btn-icon {
  width: 32px; height: 32px; border-radius: 6px; border: none; background: ${PALETTE.bgSoft};
  display: flex; align-items: center; justify-content: center; cursor: pointer; color: ${PALETTE.dark}; transition: all 0.2s ease;
}
.cv-btn-icon:hover { background: ${PALETTE.coral}; color: #fff; }
.btn-coral { background: ${PALETTE.coral}; color: #fff; }
.btn-coral:hover { background: ${PALETTE.coralDark}; }
.btn-dark { background: ${PALETTE.dark}; color: #fff; }
.btn-dark:hover { background: ${PALETTE.darkLight}; }
.btn-success { background: ${PALETTE.green}; color: #fff; }
.btn-success:hover { opacity: .9; }
.btn-danger { background: ${PALETTE.red}; color: #fff; }
.btn-danger:hover { opacity: .9; }
.btn-success-light { background: ${PALETTE.greenLight}; color: ${PALETTE.green}; }
.btn-success-light:hover { background: ${PALETTE.green}; color: #fff; }
.btn-danger-light { background: ${PALETTE.redLight}; color: ${PALETTE.red}; }
.btn-danger-light:hover { background: ${PALETTE.red}; color: #fff; }
.btn-warning-light { background: ${PALETTE.yellowLight}; color: ${PALETTE.amber}; }
.btn-warning-light:hover { background: ${PALETTE.amber}; color: #fff; }
.btn-ghost { background: ${PALETTE.bgSoft}; color: ${PALETTE.dark}; }
.btn-ghost:hover { background: #E1E3EE; }
.btn-danger-solid { background: ${PALETTE.red}; color: #fff; }
.btn-danger-solid:hover { opacity: .9; }
.btn-del { background: none; border: none; color: ${PALETTE.red}; cursor: pointer; font-size: 14px; }

/* ---------- Badges ---------- */
.cv-badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 16px; font-size: 12px; font-weight: 600; }
.cv-badge.tone-success { background: ${PALETTE.greenLight}; color: ${PALETTE.green}; }
.cv-badge.tone-warning { background: ${PALETTE.yellowLight}; color: ${PALETTE.amber}; }
.cv-badge.tone-danger { background: ${PALETTE.redLight}; color: ${PALETTE.red}; }
.cv-badge.tone-coral { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }
.cv-badge.tone-neutral { background: ${PALETTE.bgSoft}; color: ${PALETTE.dark}; }

/* ---------- Walk-in POS ---------- */
.cv-pos-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 24px; }
.cv-product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
.cv-product-card {
  background: ${PALETTE.white}; border: 1px solid ${PALETTE.border}; border-radius: var(--radius-lg);
  padding: 16px; display: flex; flex-direction: column; justify-content: space-between;
  transition: transform 0.2s, box-shadow 0.2s;
}
.cv-product-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
.cv-product-info h4 { margin: 0 0 8px; font-size: 15px; font-weight: 600; color: ${PALETTE.dark}; line-height: 1.4; }
.cv-product-info .price { font-size: 18px; font-weight: 700; color: ${PALETTE.coral}; }
.out-of-stock-badge { background: ${PALETTE.redLight}; color: ${PALETTE.red}; padding: 8px; border-radius: 6px; text-align: center; font-size: 12px; font-weight: 600; margin-top: 8px; }
.cv-cart-card { display: flex; flex-direction: column; }
.cv-cart-body { display: flex; flex-direction: column; }
.cart-item-list { max-height: 280px; overflow-y: auto; margin-bottom: 14px; }
.cart-item { background: ${PALETTE.bg}; border-radius: var(--radius-md); padding: 10px 12px; margin-bottom: 8px; }
.cart-item .item-head { display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
.cart-item .price-del { display: flex; align-items: center; gap: 10px; }
.cv-input-note, .cv-input-main, .cv-textarea {
  width: 100%; border: 1px solid ${PALETTE.border}; border-radius: var(--radius-md);
  font-family: inherit; outline: none; background: #fff; color: ${PALETTE.dark};
}
.cv-input-note { padding: 8px 12px; font-size: 13px; margin-top: 8px; }
.cv-input-main { padding: 10px 14px; font-size: 14px; }
.cv-textarea { padding: 10px 14px; font-size: 14px; resize: none; }
.cv-input-note:focus, .cv-input-main:focus, .cv-textarea:focus { border-color: ${PALETTE.coral}; }
.cart-total-box { display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed ${PALETTE.border}; padding: 16px 0; margin-bottom: 12px; font-weight: 600; font-size: 14px; }
.cart-total-box .total-amount { font-size: 24px; color: ${PALETTE.coral}; font-weight: 700; }

/* ---------- Stock / Reports ---------- */
.cv-stock-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
.cv-stock-item { border: 1px solid ${PALETTE.border}; border-radius: var(--radius-lg); padding: 16px; display: flex; justify-content: space-between; align-items: center; }
.report-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.report-card { background: ${PALETTE.bg}; border-radius: var(--radius-lg); padding: 20px; }
.report-card span { display: block; font-size: 14px; color: ${PALETTE.textSub}; }
.report-card b { display: block; font-size: 24px; font-weight: 700; margin: 6px 0; color: ${PALETTE.dark}; }
.report-card small { display: block; font-size: 12px; color: ${PALETTE.textSub}; }
@media (max-width: 900px) { .report-grid { grid-template-columns: repeat(2, 1fr); } }

/* ---------- Modals ---------- */
.cv-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 16px; }
.cv-modal { background: ${PALETTE.white}; padding: 24px; border-radius: var(--radius-lg); width: 440px; max-width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
.cv-cancel-modal { width: 480px; max-height: 92vh; overflow-y: auto; }
.cv-slip-review-modal { width: 560px; max-height: 90vh; overflow-y: auto; }
.cv-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.cv-modal-head h3 { margin: 0; font-size: 18px; font-weight: 600; color: ${PALETTE.dark}; }
.cv-modal-head .caption { font-size: 12px; color: ${PALETTE.textSub}; margin-top: 2px; }
.cv-modal-close { background: none; border: none; font-size: 16px; cursor: pointer; color: ${PALETTE.textSub}; }
.slip-full-img { width: 100%; max-height: 55vh; object-fit: contain; border-radius: var(--radius-md); border: 1px solid ${PALETTE.border}; margin-bottom: 16px; }
.cv-customer-info .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid ${PALETTE.border}; font-size: 14px; }
.cv-customer-info .info-row span { color: ${PALETTE.textSub}; }
.cancel-icon-badge { width: 38px; height: 38px; border-radius: var(--radius-md); background: ${PALETTE.redLight}; color: ${PALETTE.red}; display: flex; align-items: center; justify-content: center; font-size: 18px; }

.receipt-summary-card, .slip-order-summary { background: ${PALETTE.bg}; border-radius: var(--radius-md); padding: 14px 16px; margin-bottom: 16px; }
.receipt-title { font-size: 12px; font-weight: 600; color: ${PALETTE.textSub}; margin-bottom: 8px; }
.receipt-items { max-height: 90px; overflow-y: auto; font-size: 14px; }
.receipt-item-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 14px; color: ${PALETTE.dark}; }
.receipt-divider { border-top: 1px solid ${PALETTE.border}; margin: 8px 0; }
.receipt-total-row { display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 600; }
.receipt-total-val { font-size: 18px; color: ${PALETTE.coral}; font-weight: 700; }

.cancel-action-selector { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.action-opt { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid ${PALETTE.border}; cursor: pointer; transition: all 0.2s ease; background: #fff; }
.action-opt input { margin-top: 3px; accent-color: ${PALETTE.coral}; }
.action-opt.active { border-color: ${PALETTE.coral}; background: ${PALETTE.coralLight}; }
.opt-title { font-size: 14px; font-weight: 500; color: ${PALETTE.dark}; }
.opt-desc { font-size: 12px; color: ${PALETTE.textSub}; margin-top: 2px; }

.reason-section { margin-bottom: 20px; }
.reason-label { display: block; font-size: 13px; font-weight: 600; color: ${PALETTE.dark}; margin-bottom: 8px; }
.reason-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.reason-chip { background: #fff; border: 1px solid ${PALETTE.border}; border-radius: 16px; padding: 5px 12px; font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer; transition: all 0.2s ease; color: ${PALETTE.dark}; }
.reason-chip:hover { border-color: ${PALETTE.coral}; color: ${PALETTE.coral}; }
.reason-chip.active { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; border-color: ${PALETTE.coral}; }

.modal-footer-btns { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.modal-footer-btns .cv-btn { padding: 10px 20px; font-size: 14px; border-radius: var(--radius-md); }

/* ---------- Toast ---------- */
.cv-toast {
  position: fixed; bottom: 24px; right: 24px; background: ${PALETTE.white}; color: ${PALETTE.dark};
  padding: 12px 20px; border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 12px; z-index: 10001;
  opacity: 0; transform: translateY(20px); pointer-events: none; border: 1px solid ${PALETTE.border};
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.cv-toast.show { opacity: 1; transform: translateY(0); }
.toast-icon { background: ${PALETTE.greenLight}; color: ${PALETTE.green}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }

.bold { font-weight: 600; }
.cv-divider { border: none; border-top: 1px solid ${PALETTE.border}; margin: 4px 0 8px; }
`;
