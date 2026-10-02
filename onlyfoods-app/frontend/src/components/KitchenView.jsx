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

const LogoutIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
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

  // เรียงคิวตามลำดับเลขคิว / Order ID (คิวก่อนขึ้นก่อน)
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

  // เปลี่ยนสถานะออเดอร์ (ไม่เชื่อมเครื่องพิมพ์ และป้องกัน Undo หากหน้าร้านส่งมอบแล้ว)
  const updateOrderStatus = async (id, targetStatus, e) => {
    if (e) e.stopPropagation();
    
    const targetOrder = allOrders.find(o => o.OrderID === id);
    if (targetOrder?.Status === 'Completed') {
      alert('หน้าร้านได้ส่งมอบอาหารเรียบร้อยแล้ว ไม่สามารถย้อนกลับสถานะหรือกดอันดูได้');
      return;
    }

    isUpdatingRef.current = true;

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

  const getElapsedInfo = (timeStr) => {
    if (!timeStr) return { label: 'เพิ่งเข้า', isUrgent: false };
    const diffMins = Math.floor((new Date() - new Date(timeStr)) / 60000);
    if (diffMins < 1) return { label: 'เพิ่งเข้า', isUrgent: false };
    if (diffMins < 60) return { label: `${diffMins} นาทีที่แล้ว`, isUrgent: diffMins >= 5 };
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
      `}</style>

      {/* Top Navigation Bar */}
      <header style={{
        height: '64px',
        backgroundColor: theme.navBg,
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        zIndex: 20,
        boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: `${PALETTE.coral}15`,
            color: PALETTE.coral,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <KitchenIcon />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '700', letterSpacing: '-0.3px' }}>
              Only Foods Kitchen
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: theme.textMuted }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isStoreActive ? PALETTE.emerald : '#EF4444',
                display: 'inline-block'
              }} />
              {getStatusText()}
            </div>
          </div>
        </div>

        {/* Controls & Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => setIsDark(!isDark)}
            style={{
              background: 'transparent',
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              padding: '8px 12px',
              color: theme.textMain,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
            <span>{isDark ? 'โหมดสว่าง' : 'โหมดมืด'}</span>
          </button>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              style={{
                background: 'transparent',
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                padding: '6px 12px',
                color: theme.textMain,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: PALETTE.coral,
                color: '#FFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '13px'
              }}>
                {displayName.charAt(0)}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', lineHeight: '1.2' }}>{displayName}</div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>{displayRole}</div>
              </div>
            </button>

            {isDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '110%',
                right: 0,
                width: '200px',
                backgroundColor: theme.cardBg,
                border: `1px solid ${theme.border}`,
                borderRadius: '10px',
                padding: '6px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                zIndex: 30
              }}>
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    setShowLogoutModal(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: 'none',
                    background: 'transparent',
                    color: '#EF4444',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    fontSize: '13px',
                    textAlign: 'left'
                  }}
                >
                  <LogoutIcon />
                  <span>ออกจากระบบ</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* Left Side: Summary Panel */}
        <aside style={{
          width: '280px',
          borderRight: `1px solid ${theme.border}`,
          backgroundColor: theme.cardBg,
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          overflowY: 'auto'
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: '700', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px', color: theme.textMuted }}>
            สรุปรายการอาหารที่ต้องทำ
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {summary.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: theme.textMuted, fontSize: '13px' }}>
                ไม่มีรายการค้างปรุง
              </div>
            ) : (
              summary.map((item, idx) => (
                <div key={idx} style={{
                  padding: '12px',
                  backgroundColor: theme.cardInner,
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: `1px solid ${theme.border}`
                }}>
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>{item.ProductName}</span>
                  <span style={{
                    backgroundColor: PALETTE.coral,
                    color: '#FFF',
                    fontWeight: '700',
                    fontSize: '13px',
                    padding: '2px 8px',
                    borderRadius: '99px'
                  }}>
                    x{item.TotalQty}
                  </span>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Right Side: Order Cards View */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* Filter Tabs */}
          <div style={{
            padding: '16px 24px 0 24px',
            display: 'flex',
            gap: '12px',
            borderBottom: `1px solid ${theme.border}`
          }}>
            <button
              onClick={() => setFilterTab('Pending')}
              style={{
                padding: '10px 20px',
                borderRadius: '8px 8px 0 0',
                border: 'none',
                borderBottom: filterTab === 'Pending' ? `3px solid ${PALETTE.coral}` : '3px solid transparent',
                backgroundColor: filterTab === 'Pending' ? theme.cardBg : 'transparent',
                color: filterTab === 'Pending' ? PALETTE.coral : theme.textMuted,
                fontWeight: '700',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <CookingIcon />
              <span>กำลังรอปรุง ({pendingOrders.length})</span>
            </button>

            <button
              onClick={() => setFilterTab('Ready')}
              style={{
                padding: '10px 20px',
                borderRadius: '8px 8px 0 0',
                border: 'none',
                borderBottom: filterTab === 'Ready' ? `3px solid ${PALETTE.emerald}` : '3px solid transparent',
                backgroundColor: filterTab === 'Ready' ? theme.cardBg : 'transparent',
                color: filterTab === 'Ready' ? PALETTE.emerald : theme.textMuted,
                fontWeight: '700',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <DoneCheckIcon />
              <span>ปรุงเสร็จแล้ว ({readyOrders.length})</span>
            </button>
          </div>

          {/* Cards Grid */}
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
            {displayedOrders.length === 0 ? (
              <div style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.textMuted
              }}>
                <KitchenIcon />
                <p style={{ marginTop: '12px', fontSize: '15px' }}>ไม่มีรายการอาหารในหมวดนี้</p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px'
              }}>
                {displayedOrders.map(order => {
                  const timeInfo = getElapsedInfo(order.CreatedAt);
                  const isCooking = order.Status === 'Cooking';
                  const isReady = order.Status === 'Ready';
                  const isCompleted = order.Status === 'Completed';

                  return (
                    <div key={order.OrderID} style={{
                      backgroundColor: theme.cardBg,
                      borderRadius: '12px',
                      border: `2px solid ${isCooking ? PALETTE.coral : isReady ? PALETTE.emerald : theme.border}`,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                    }}>
                      {/* Card Header */}
                      <div style={{
                        padding: '12px 16px',
                        backgroundColor: theme.cardInner,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: `1px solid ${theme.border}`
                      }}>
                        <div>
                          <div style={{ fontSize: '22px', fontWeight: '900', color: PALETTE.coral }}>
                            #{order.QueueNo}
                          </div>
                          <div style={{ fontSize: '11px', color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <ClockIcon />
                            <span>{formatTime(order.CreatedAt)}</span>
                          </div>
                        </div>

                        {timeInfo.isUrgent && !isReady && !isCompleted && (
                          <span style={{
                            backgroundColor: '#EF4444',
                            color: '#FFF',
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '2px 8px',
                            borderRadius: '4px'
                          }}>
                            {timeInfo.label}
                          </span>
                        )}
                      </div>

                      {/* Items List */}
                      <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {(order.items || []).map((item, idx) => (
                          <div key={idx} style={{ fontSize: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600' }}>
                              <span>{item.ProductName}</span>
                              <span style={{ color: PALETTE.coral }}>x{item.Qty}</span>
                            </div>
                            {item.ItemNote && (
                              <div style={{ fontSize: '12px', color: '#D97706', marginTop: '2px' }}>
                                * {item.ItemNote}
                              </div>
                            )}
                          </div>
                        ))}

                        {order.Note && (
                          <div style={{
                            marginTop: '8px',
                            padding: '8px',
                            backgroundColor: 'rgba(217, 119, 6, 0.1)',
                            borderLeft: '3px solid #D97706',
                            borderRadius: '4px',
                            fontSize: '12px',
                            color: '#D97706'
                          }}>
                            <strong>หมายเหตุ:</strong> {order.Note}
                          </div>
                        )}
                      </div>

                      {/* Card Actions */}
                      <div style={{ padding: '12px 16px', borderTop: `1px solid ${theme.border}`, display: 'flex', gap: '8px' }}>
                        {order.Status === 'Pending' && (
                          <button
                            onClick={(e) => updateOrderStatus(order.OrderID, 'Cooking', e)}
                            style={{
                              flex: 1,
                              padding: '10px',
                              backgroundColor: PALETTE.coral,
                              color: '#FFF',
                              border: 'none',
                              borderRadius: '8px',
                              fontWeight: '700',
                              fontSize: '14px',
                              cursor: 'pointer'
                            }}
                          >
                            เริ่มปรุง
                          </button>
                        )}

                        {order.Status === 'Cooking' && (
                          <button
                            onClick={(e) => updateOrderStatus(order.OrderID, 'Ready', e)}
                            style={{
                              flex: 1,
                              padding: '10px',
                              backgroundColor: PALETTE.emerald,
                              color: '#FFF',
                              border: 'none',
                              borderRadius: '8px',
                              fontWeight: '700',
                              fontSize: '14px',
                              cursor: 'pointer'
                            }}
                          >
                            ปรุงเสร็จแล้ว
                          </button>
                        )}

                        {order.Status === 'Ready' && (
                          <div style={{
                            flex: 1,
                            textAlign: 'center',
                            padding: '8px',
                            backgroundColor: `${PALETTE.emerald}15`,
                            color: PALETTE.emerald,
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: '700'
                          }}>
                            รอหน้าร้านส่งมอบ
                          </div>
                        )}

                        {order.Status === 'Completed' && (
                          <div style={{
                            flex: 1,
                            textAlign: 'center',
                            padding: '8px',
                            backgroundColor: theme.cardInner,
                            color: theme.textMuted,
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: '600'
                          }}>
                            ส่งมอบเรียบร้อยแล้ว
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Logout Modal */}
      {showLogoutModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50
        }}>
          <div style={{
            backgroundColor: theme.cardBg,
            borderRadius: '12px',
            padding: '24px',
            width: '320px',
            textAlign: 'center',
            border: `1px solid ${theme.border}`
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>ยืนยันการออกจากระบบ?</h3>
            <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '20px' }}>
              คุณต้องการออกจากระบบห้องครัวใช่หรือไม่
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowLogoutModal(false)}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: theme.cardInner,
                  border: `1px solid ${theme.border}`,
                  color: theme.textMain,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
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
                  padding: '10px',
                  backgroundColor: '#EF4444',
                  border: 'none',
                  color: '#FFF',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
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