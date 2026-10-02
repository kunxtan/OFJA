import { useCallback, useEffect, useRef, useState } from 'react';

const PALETTE = {
  coral: '#FF724C',
  coralHover: '#E85E38',
  emerald: '#10B981',
  slateDark: '#0F172A',
  cardDark: '#1E293B',
  borderDark: '#334155',
  lightBg: '#F8FAFC',
  cardLight: '#FFFFFF',
  borderLight: '#E2E8F0',
};

const KitchenIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>
    <path d="M7 2v20"/>
    <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
  </svg>
);

const SunIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const UndoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
  </svg>
);

const LogoutIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const UserIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

const CookingIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5Z"/>
  </svg>
);

const DoneCheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const PrinterIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"></polyline>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
    <rect x="6" y="14" width="12" height="8"></rect>
  </svg>
);

const getRoleLabel = (role) => {
  const roleMap = {
    'Kitchen Staff': 'พนักงานครัว',
    'Front Staff': 'พนักงานหน้าร้าน',
    'Shop Owner': 'เจ้าของร้าน',
    'Accountant': 'เจ้าหน้าที่บัญชี',
    'Executive': 'ผู้บริหาร',
    'Customer': 'ลูกค้า'
  };
  return roleMap[role] || role || 'ผู้ใช้งาน';
};

export default function KitchenView({ user, apiBase, onLogout }) {
  const [allOrders, setAllOrders] = useState([]);
  const [summary, setSummary] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isDark, setIsDark] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [filterTab, setFilterTab] = useState('Pending'); 
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const isUpdatingRef = useRef(false);

  const [foodCourtOpen, setFoodCourtOpen] = useState(true);
  const [storeOpen, setStoreOpen] = useState(true);
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    if (!document.getElementById('kitchen-font-link')) {
      const link = document.createElement('link');
      link.id = 'kitchen-font-link';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Sarabun:wght@400;500;600;700&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const displayName = user?.FullName || user?.Username || 'ผู้ใช้งานระบบ';
  const displayRole = getRoleLabel(user?.Role);

  const theme = {
    pageBg: isDark ? PALETTE.slateDark : PALETTE.lightBg,
    cardBg: isDark ? PALETTE.cardDark : PALETTE.cardLight,
    cardInner: isDark ? 'rgba(255,255,255,0.03)' : '#F1F5F9',
    navBg: isDark ? PALETTE.cardDark : PALETTE.cardLight,
    textMain: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    border: isDark ? PALETTE.borderDark : PALETTE.borderLight,
    primary: PALETTE.coral,
    emerald: PALETTE.emerald,
  };

  const fetchData = useCallback(() => {
    if (isUpdatingRef.current) return;
    const storeId = user?.StoreId || user?.storeId || 1; 
    
    fetch(`${apiBase}/api/orders?store_id=${storeId}`)
      .then(r => r.json())
      .then(data => setAllOrders(Array.isArray(data) ? data : []))
      .catch(err => console.error("Error fetching kitchen orders:", err));

    fetch(`${apiBase}/api/orders/kitchen-summary?store_id=${storeId}`)
      .then(r => r.json())
      .then(data => setSummary(Array.isArray(data) ? data : []))
      .catch(err => console.error("Error fetching summary:", err));

    fetch(`${apiBase}/api/food-court/status`)
      .then(r => r.json())
      .then(data => setFoodCourtOpen(Boolean(data?.is_open)))
      .catch(err => console.error("Error fetching food court status:", err));

    fetch(`${apiBase}/api/reports/dashboard?store_id=${storeId}`)
      .then(r => r.json())
      .then(data => {
        const storeData = Array.isArray(data) ? data[0] : data;
        if (storeData) {
          setStoreOpen(Boolean(storeData.IsOpen));
          setIsSuspended(Boolean(storeData.IsSuspended));
        }
      })
      .catch(err => console.error("Error fetching store status:", err));
  }, [user, apiBase]);

  useEffect(() => {
    if (!user) return;
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [user, fetchData]);

  // -------------------------------------------------------------
  // [ปรับปรุง] เรียงคิวตามลำดับเลขคิว / Order ID (คิวก่อนขึ้นก่อน)
  // -------------------------------------------------------------
  const pendingOrders = allOrders
    .filter(o => o.Status === 'Pending' || o.Status === 'Cooking')
    .sort((a, b) => (a.OrderID || 0) - (b.OrderID || 0));

  const readyOrders = allOrders
    .filter(o => o.Status === 'Ready' || o.Status === 'Completed')
    .sort((a, b) => (b.OrderID || 0) - (a.OrderID || 0));

  const displayedOrders = filterTab === 'Pending' ? pendingOrders : readyOrders;
  const isStoreActive = foodCourtOpen && storeOpen && !isSuspended;

  const getStatusText = () => {
    if (!foodCourtOpen) return 'ปิดให้บริการ (ศูนย์อาหารปิด)';
    if (isSuspended) return 'ปิดให้บริการ (ถูกระงับสิทธิ์)';
    if (!storeOpen) return 'ปิดให้บริการ (ร้านปิด)';
    return 'เปิดให้บริการ';
  };

  // -------------------------------------------------------------
  // [ปรับปรุง] พิมพ์ใบสั่งอาหารออกเครื่องพิมพ์
  // -------------------------------------------------------------
  const printOrderTicket = (order) => {
    const printWindow = window.open('', '_blank', 'width=380,height=550');
    if (!printWindow) return;

    const itemsHtml = (order.items || []).map(item => `
      <div style="display:flex; justify-content:space-between; margin-bottom: 6px; font-size:14px; font-weight:bold;">
        <span>${item.ProductName}</span>
        <span>x${item.Qty}</span>
      </div>
      ${item.ItemNote ? `<div style="font-size:12px; color:#D97706; margin-bottom: 6px; padding-left: 8px;">* ${item.ItemNote}</div>` : ''}
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Order Ticket #${order.QueueNo}</title>
          <style>
            body { font-family: 'Sarabun', sans-serif; padding: 10px; margin: 0; width: 280px; color: #000; }
            .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 10px; }
            .queue { font-size: 32px; font-weight: 900; margin: 4px 0; }
            .items { border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
            .note { font-size: 12px; background: #eee; padding: 6px; border-radius: 4px; margin-top: 8px; }
            .footer { font-size: 11px; text-align: center; margin-top: 10px; color: #555; }
          </style>
        </head>
        <body>
          <div class="header">
            <div style="font-size:12px; text-transform:uppercase;">ใบสั่งปรุงอาหาร (Kitchen Ticket)</div>
            <div class="queue">#${order.QueueNo}</div>
            <div style="font-size:12px;">เวลา: ${formatTime(order.CreatedAt)}</div>
          </div>
          <div class="items">
            ${itemsHtml}
            ${order.Note ? `<div class="note"><strong>หมายเหตุ:</strong> ${order.Note}</div>` : ''}
          </div>
          <div class="footer">Only Foods Kitchen System</div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // -------------------------------------------------------------
  // [ปรับปรุง] เปลี่ยนสถานะออเดอร์ + พิมพ์ใบสั่งอาหารเมื่อกดปรุง
  // -------------------------------------------------------------
  const updateOrderStatus = async (id, targetStatus, e) => {
    if (e) e.stopPropagation();
    
    // ตรวจจับออเดอร์ที่หน้าร้านส่งมอบไปแล้ว ห้ามกด Undo หรือเปลี่ยนสถานะ
    const targetOrder = allOrders.find(o => o.OrderID === id);
    if (targetOrder?.Status === 'Completed') {
      alert('หน้าร้านได้ส่งมอบอาหารเรียบร้อยแล้ว ไม่สามารถย้อนกลับสถานะหรือกดอันดูได้');
      return;
    }

    isUpdatingRef.current = true;
    
    // เชื่อมต่อเครื่องพิมพ์เมื่อกดปรุงอาหาร
    if (targetStatus === 'Cooking' && targetOrder) {
      printOrderTicket(targetOrder);
    }

    setAllOrders(prev => prev.map(o => o.OrderID === id ? { ...o, Status: targetStatus } : o));
    if (selectedOrder?.OrderID === id) setSelectedOrder(null);

    try {
      const res = await fetch(`${apiBase}/api/orders/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: targetStatus, 
          user_role: user?.Role || 'Kitchen Staff', 
          cancel_reason: null 
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.detail || 'ไม่สามารถอัปเดตสถานะได้');
      }
    } catch (err) {
      console.error("Update status error:", err);
    } finally {
      isUpdatingRef.current = false;
      fetchData();
    }
  };

  // -------------------------------------------------------------
  // [ปรับปรุง] แจ้งเตือนออเดอร์เร่งด่วน 5 นาที
  // -------------------------------------------------------------
  const getElapsedInfo = (timeStr) => {
    if (!timeStr) return { label: 'เพิ่งเข้า', isUrgent: false };
    const diffMins = Math.floor((new Date() - new Date(timeStr)) / 60000);
    if (diffMins < 1) return { label: 'เพิ่งเข้า', isUrgent: false };
    if (diffMins < 60) return { label: `${diffMins} นาทีที่แล้ว`, isUrgent: diffMins >= 5 }; // แจ้งเตือนเมื่อเกิน 5 นาที
    return { label: `${Math.floor(diffMins / 60)} ชม. ${diffMins % 60} น.`, isUrgent: true };
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    return new Date(timeStr).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
  };

  return (
    <div style={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: theme.pageBg, 
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden', 
      fontFamily: "'Roboto', 'Sarabun', sans-serif", 
      color: theme.textMain, 
      userSelect: 'none',
      WebkitUserSelect: 'none',
      transition: 'background-color 0.25s ease' 
    }}>
      
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: rgba(100, 116, 139, 0.25); border-radius: 99px; }
        ::-webkit-scrollbar-track { background: transparent; }
        button { 
          font-family: 'Roboto', 'Sarabun', sans-serif !important; 
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        button:active { transform: scale(0.98); }
        @keyframes statusPulse {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        @keyframes urgentBlink {
          0% { border-color: #EF4444; box-shadow: 0 0 10px rgba(239,68,68,0.4); }
          50% { border-color: #DC2626; box-shadow: 0 0 18px rgba(239,68,68,0.8); }
          100% { border-color: #EF4444; box-shadow: 0 0 10px rgba(239,68,68,0.4); }
        }
      `}</style>

      {/* Top Header Bar */}
      <header style={{ 
        background: theme.navBg, 
        borderBottom: `1px solid ${theme.border}`, 
        padding: '12px 28px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        width: '100%',
        boxSizing: 'border-box',
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
        flexShrink: 0,
        zIndex: 100
      }}>
        
        {/* Left Side: Brand Logo + Food Court Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ 
            width: '38px', 
            height: '38px', 
            borderRadius: '10px', 
            background: isDark ? 'rgba(255, 114, 76, 0.15)' : '#FFF0ED', 
            color: PALETTE.coral, 
            display: 'grid', 
            placeItems: 'center' 
          }}>
            <KitchenIcon />
          </div>

          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: theme.textMain, lineHeight: '1.2', letterSpacing: '-0.3px' }}>
              Only Foods Kitchen
            </div>
            <div style={{ fontSize: '12.5px', color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
              <span>สถานะศูนย์อาหาร:</span>
              <span style={{ 
                color: isStoreActive ? PALETTE.emerald : '#EF4444', 
                fontWeight: '700', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '5px' 
              }}>
                <span style={{ 
                  width: '7px', 
                  height: '7px', 
                  borderRadius: '50%', 
                  background: isStoreActive ? PALETTE.emerald : '#EF4444',
                  animation: isStoreActive ? 'statusPulse 2s infinite' : 'none'
                }} />
                {getStatusText()}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Realtime Counters & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
          <div style={{ 
            background: theme.cardInner, 
            border: `1px solid ${theme.border}`, 
            padding: '6px 14px', 
            borderRadius: '99px', 
            fontSize: '13px', 
            fontWeight: '600'
          }}>
            คิวรอปรุง: <span style={{ color: PALETTE.coral, fontWeight: '800', fontSize: '15px', marginLeft: '3px' }}>{pendingOrders.length}</span>
          </div>

          {summary.slice(0, 3).map((s, i) => (
            <div key={i} style={{ 
              background: theme.cardInner, 
              border: `1px solid ${theme.border}`, 
              padding: '6px 14px', 
              borderRadius: '99px', 
              fontSize: '12.5px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px' 
            }}>
              <span>{s.ProductName}</span>
              <span style={{ background: PALETTE.coral, color: '#FFF', borderRadius: '99px', padding: '1px 8px', fontSize: '11px', fontWeight: '800' }}>{s.TotalQty}</span>
            </div>
          ))}

          {/* Theme Switcher Button */}
          <button
            onClick={() => setIsDark(!isDark)}
            style={{
              background: theme.cardInner,
              color: theme.textMain,
              border: `1px solid ${theme.border}`,
              borderRadius: '10px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
            {isDark ? 'Light' : 'Dark'}
          </button>

          {/* User Profile Button */}
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            style={{
              background: theme.cardInner,
              color: theme.textMain,
              border: `1px solid ${theme.border}`,
              borderRadius: '99px',
              padding: '7px 16px',
              fontSize: '13.5px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            <UserIcon />
            <span>{displayName}</span>
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div 
              style={{
                position: 'absolute',
                top: 'calc(100% + 10px)',
                right: 0,
                background: theme.cardBg,
                border: `1px solid ${theme.border}`,
                borderRadius: '16px',
                width: '240px',
                padding: '16px',
                boxShadow: isDark ? '0 10px 30px rgba(0,0,0,0.5)' : '0 10px 30px rgba(0,0,0,0.08)',
                zIndex: 1000,
                boxSizing: 'border-box'
              }}
            >
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '14px', fontWeight: '800', color: theme.textMain }}>
                  {displayName}
                </div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                  {displayRole}
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: `1px solid ${theme.border}`, margin: '12px 0' }} />

              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  setShowLogoutModal(true);
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  color: '#EF4444',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  fontSize: '13.5px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  textAlign: 'left',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <LogoutIcon />
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Modern Segmented Control Tab */}
      <div style={{
        padding: '16px 28px 0',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0
      }}>
        <div style={{
          display: 'inline-flex',
          background: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0',
          padding: '4px',
          borderRadius: '14px',
          gap: '4px'
        }}>
          <button
            onClick={() => setFilterTab('Pending')}
            style={{
              padding: '9px 20px',
              borderRadius: '10px',
              border: 'none',
              background: filterTab === 'Pending' ? theme.cardBg : 'transparent',
              color: filterTab === 'Pending' ? PALETTE.coral : theme.textMuted,
              fontWeight: '700',
              fontSize: '13.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: filterTab === 'Pending' ? (isDark ? '0 2px 10px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.06)') : 'none',
              transition: 'all 0.2s'
            }}
          >
            <CookingIcon />
            <span>คิวรอปรุง</span>
            <span style={{
              background: filterTab === 'Pending' ? (isDark ? 'rgba(255,114,76,0.2)' : '#FFF0ED') : 'transparent',
              color: filterTab === 'Pending' ? PALETTE.coral : theme.textMuted,
              padding: '1px 8px',
              borderRadius: '99px',
              fontSize: '11.5px',
              fontWeight: '800'
            }}>
              {pendingOrders.length}
            </span>
          </button>

          <button
            onClick={() => setFilterTab('Ready')}
            style={{
              padding: '9px 20px',
              borderRadius: '10px',
              border: 'none',
              background: filterTab === 'Ready' ? theme.cardBg : 'transparent',
              color: filterTab === 'Ready' ? PALETTE.emerald : theme.textMuted,
              fontWeight: '700',
              fontSize: '13.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: filterTab === 'Ready' ? (isDark ? '0 2px 10px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.06)') : 'none',
              transition: 'all 0.2s'
            }}
          >
            <DoneCheckIcon />
            <span>ปรุงเสร็จแล้ว / ประวัติ</span>
            <span style={{
              background: filterTab === 'Ready' ? (isDark ? 'rgba(16,185,129,0.2)' : '#ECFDF5') : 'transparent',
              color: filterTab === 'Ready' ? PALETTE.emerald : theme.textMuted,
              padding: '1px 8px',
              borderRadius: '99px',
              fontSize: '11.5px',
              fontWeight: '800'
            }}>
              {readyOrders.length}
            </span>
          </button>
        </div>
      </div>

      {/* Main KDS Grid View */}
      <main style={{ 
        flex: 1, 
        padding: '16px 28px 24px', 
        boxSizing: 'border-box', 
        overflowY: 'auto',
        overflowX: 'hidden'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '20px' }}>
          {displayedOrders.length === 0 ? (
            <div style={{ 
              gridColumn: '1 / -1', 
              textAlign: 'center', 
              padding: '90px 20px', 
              background: theme.cardBg, 
              borderRadius: '18px', 
              border: `1px solid ${theme.border}` 
            }}>
              <h3 style={{ margin: 0, color: theme.textMuted, fontSize: '15px', fontWeight: '600' }}>
                {filterTab === 'Pending' ? 'ไม่มีรายการอาหารค้างปรุงในขณะนี้' : 'ไม่มีรายการออเดอร์ที่ปรุงเสร็จแล้ว'}
              </h3>
            </div>
          ) : (
            displayedOrders.map(o => {
              const timeInfo = getElapsedInfo(o.CreatedAt);
              const isUrgent5Min = filterTab === 'Pending' && timeInfo.isUrgent;

              return (
                <article
                  key={o.OrderID}
                  onClick={() => setSelectedOrder(o)}
                  style={{
                    background: theme.cardBg,
                    borderRadius: '18px',
                    border: isUrgent5Min ? '2px solid #EF4444' : `1px solid ${theme.border}`,
                    borderTop: filterTab === 'Pending' 
                      ? `6px solid ${isUrgent5Min ? '#EF4444' : PALETTE.coral}`
                      : `6px solid ${o.Status === 'Completed' ? '#64748B' : PALETTE.emerald}`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    boxShadow: isUrgent5Min 
                      ? '0 0 16px rgba(239, 68, 68, 0.3)' 
                      : (isDark ? '0 4px 20px rgba(0,0,0,0.2)' : '0 4px 16px rgba(15,23,42,0.03)'),
                    animation: isUrgent5Min ? 'urgentBlink 2s infinite' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Card Ticket Header */}
                  <div style={{ 
                    padding: '14px 20px', 
                    background: isUrgent5Min ? (isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2') : (isDark ? 'rgba(255,255,255,0.02)' : '#FAFAFC'), 
                    borderBottom: `1px solid ${theme.border}`, 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center' 
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', color: theme.textMuted, fontWeight: '800', letterSpacing: '1px' }}>QUEUE</span>
                        {isUrgent5Min && (
                          <span style={{ background: '#EF4444', color: '#FFF', fontSize: '10px', fontWeight: '800', padding: '1px 6px', borderRadius: '4px' }}>
                            ⚡ เร่งด่วน (>5 นาที)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '30px', fontWeight: '900', color: isUrgent5Min ? '#EF4444' : theme.textMain, lineHeight: '1', marginTop: '2px' }}>
                        #{o.QueueNo}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                        <ClockIcon /> {formatTime(o.CreatedAt)}
                      </div>
                      <span style={{ 
                        fontSize: '11.5px', 
                        fontWeight: '700', 
                        color: filterTab === 'Pending' ? (isUrgent5Min ? '#EF4444' : PALETTE.coral) : (o.Status === 'Completed' ? '#64748B' : PALETTE.emerald), 
                        marginTop: '4px', 
                        display: 'inline-block' 
                      }}>
                        {filterTab === 'Pending' ? timeInfo.label : (o.Status === 'Completed' ? 'ส่งมอบแล้ว' : 'พร้อมรับอาหาร')}
                      </span>
                    </div>
                  </div>

                  {/* Items List */}
                  <div style={{ padding: '16px 20px', flexGrow: 1 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {o.items?.map((item, idx) => (
                        <div key={idx} style={{ 
                          background: theme.cardInner, 
                          padding: '10px 12px', 
                          borderRadius: '10px', 
                          border: `1px solid ${theme.border}` 
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <span style={{ fontSize: '14.5px', fontWeight: '700', color: theme.textMain }}>{item.ProductName}</span>
                            <span style={{ 
                              background: isDark ? '#334155' : '#0F172A', 
                              color: '#FFF', 
                              padding: '2px 8px', 
                              borderRadius: '6px', 
                              fontSize: '12px', 
                              fontWeight: '800' 
                            }}>
                              x{item.Qty}
                            </span>
                          </div>

                          {item.ItemNote && (
                            <div style={{ 
                              marginTop: '6px', 
                              fontSize: '12px', 
                              color: '#D97706', 
                              background: isDark ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB', 
                              padding: '4px 8px', 
                              borderRadius: '6px', 
                              border: isDark ? '1px solid rgba(217, 119, 6, 0.3)' : '1px solid #FDE68A', 
                              whiteSpace: 'nowrap', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis' 
                            }}>
                              * {item.ItemNote}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {o.Note && (
                      <div style={{ 
                        marginTop: '12px', 
                        padding: '8px 10px', 
                        borderRadius: '8px', 
                        background: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF', 
                        border: isDark ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid #BFDBFE', 
                        fontSize: '12px', 
                        color: isDark ? '#93C5FD' : '#1E40AF' 
                      }}>
                        <strong>หมายเหตุลูกค้า:</strong> {o.Note}
                      </div>
                    )}
                  </div>

                  {/* Footer Actions */}
                  <div style={{ padding: '14px 20px', borderTop: `1px solid ${theme.border}`, display: 'flex', gap: '10px' }}>
                    {o.Status === 'Pending' && (
                      <button
                        onClick={(e) => updateOrderStatus(o.OrderID, 'Cooking', e)}
                        style={{
                          flex: 1,
                          background: PALETTE.coral,
                          color: '#FFF',
                          border: 'none',
                          padding: '12px',
                          borderRadius: '12px',
                          fontWeight: '800',
                          fontSize: '14px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: '0 4px 12px rgba(255, 114, 76, 0.3)'
                        }}
                      >
                        <CookingIcon /> เริ่มปรุง (พิมพ์ใบสั่ง)
                      </button>
                    )}

                    {o.Status === 'Cooking' && (
                      <button
                        onClick={(e) => updateOrderStatus(o.OrderID, 'Ready', e)}
                        style={{
                          flex: 1,
                          background: PALETTE.emerald,
                          color: '#FFF',
                          border: 'none',
                          padding: '12px',
                          borderRadius: '12px',
                          fontWeight: '800',
                          fontSize: '14px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                        }}
                      >
                        <CheckIcon /> ปรุงเสร็จแล้ว
                      </button>
                    )}

                    {o.Status === 'Ready' && (
                      <button
                        onClick={(e) => updateOrderStatus(o.OrderID, 'Cooking', e)}
                        style={{
                          flex: 1,
                          background: theme.cardInner,
                          color: theme.textMain,
                          border: `1px solid ${theme.border}`,
                          padding: '10px',
                          borderRadius: '10px',
                          fontWeight: '700',
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <UndoIcon /> ย้อนกลับ (อันดู)
                      </button>
                    )}

                    {/* [ปรับปรุง] ถ้าหน้าร้านส่งมอบไปแล้ว (Completed) ล็อกการอันดู */}
                    {o.Status === 'Completed' && (
                      <div style={{
                        flex: 1,
                        background: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0',
                        color: theme.textMuted,
                        textAlign: 'center',
                        padding: '10px',
                        borderRadius: '10px',
                        fontSize: '12.5px',
                        fontWeight: '700'
                      }}>
                        🔒 ส่งมอบอาหารแล้ว (แก้ไขไม่ได้)
                      </div>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        printOrderTicket(o);
                      }}
                      title="พิมพ์ใบสั่งอาหารอีกครั้ง"
                      style={{
                        background: theme.cardInner,
                        color: theme.textMain,
                        border: `1px solid ${theme.border}`,
                        padding: '10px 14px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        display: 'grid',
                        placeItems: 'center'
                      }}
                    >
                      <PrinterIcon />
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </main>

      {/* Modal ยืนยันออกจากระบบ */}
      {showLogoutModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'grid',
          placeItems: 'center',
          zIndex: 2000
        }}>
          <div style={{
            background: theme.cardBg,
            border: `1px solid ${theme.border}`,
            borderRadius: '20px',
            padding: '24px',
            width: '90%',
            maxWidth: '360px',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '800', color: theme.textMain }}>
              ยืนยันการออกจากระบบ
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '13.5px', color: theme.textMuted }}>
              คุณต้องการออกจากระบบห้องครัวใช่หรือไม่?
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowLogoutModal(false)}
                style={{
                  flex: 1,
                  background: theme.cardInner,
                  color: theme.textMain,
                  border: `1px solid ${theme.border}`,
                  padding: '10px',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  setShowLogoutModal(false);
                  if (onLogout) onLogout();
                }}
                style={{
                  flex: 1,
                  background: '#EF4444',
                  color: '#FFF',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}