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

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
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

  const pendingOrders = allOrders.filter(o => o.Status === 'Pending' || o.Status === 'Cooking');
  const readyOrders = allOrders.filter(o => o.Status === 'Ready' || o.Status === 'Completed');
  const displayedOrders = filterTab === 'Pending' ? pendingOrders : readyOrders;

  const isStoreActive = foodCourtOpen && storeOpen && !isSuspended;

  const getStatusText = () => {
    if (!foodCourtOpen) return 'ปิดให้บริการ (ศูนย์อาหารปิด)';
    if (isSuspended) return 'ปิดให้บริการ (ถูกระงับสิทธิ์)';
    if (!storeOpen) return 'ปิดให้บริการ (ร้านปิด)';
    return 'เปิดให้บริการ';
  };

  // คนครัวกดได้เพียงสถานะเดียวเท่านั้น คือ 'Ready' (ปรุงเสร็จแล้ว)
  const updateOrderStatus = async (id, targetStatus = 'Ready', e) => {
    if (e) e.stopPropagation();
    isUpdatingRef.current = true;

    setAllOrders(prev => prev.map(o => o.OrderID === id ? { ...o, Status: targetStatus } : o));

    try {
      const res = await fetch(`${apiBase}/api/orders/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          user_role: 'Kitchen Staff',
          cancel_reason: null
        })
      });

      if (!res.ok) throw new Error('Backend อัปเดตสถานะไม่สำเร็จ');
    } catch (err) {
      console.error("Update status error:", err);
    } finally {
      isUpdatingRef.current = false;
      fetchData();
    }
  };

  // คำนวณความต่างเวลานัดรับจากลูกค้าเพื่อแสดงการแจ้งเตือนเมื่อ <= 5 นาที
  const getPickupAlert = (pickupTimeStr) => {
    if (!pickupTimeStr) return null;
    try {
      const now = new Date();
      let targetDate = new Date();

      if (pickupTimeStr.includes(':')) {
        const cleanTime = pickupTimeStr.replace('น.', '').trim();
        const [hours, minutes] = cleanTime.split(':').map(Number);
        targetDate.setHours(hours, minutes, 0, 0);
      } else {
        targetDate = new Date(pickupTimeStr);
      }

      const diffMins = Math.floor((targetDate - now) / 60000);

      // ถ้าเวลานัดรับเหลือไม่เกิน 5 นาที (และยังไม่เกินเวลาเกิน 60 นาที)
      if (diffMins <= 5 && diffMins >= -60) {
        return {
          isAlert: true,
          diffMins,
          label: diffMins <= 0 ? 'ถึงเวลานัดรับแล้ว!' : `เหลือเวลานัดรับอีก ${diffMins} นาที`
        };
      }
    } catch (e) {
      return null;
    }
    return null;
  };

  const getElapsedInfo = (timeStr) => {
    if (!timeStr) return { label: 'เพิ่งเข้า', isUrgent: false };
    const diffMins = Math.floor((new Date() - new Date(timeStr)) / 60000);
    if (diffMins < 1) return { label: 'เพิ่งเข้า', isUrgent: false };
    if (diffMins < 60) return { label: `${diffMins} นาทีที่แล้ว`, isUrgent: diffMins >= 15 };
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
        button:active {
          transform: scale(0.98);
        }
        @keyframes alertFlash {
          0% { background-color: rgba(239, 68, 68, 0.15); border-color: #EF4444; }
          50% { background-color: rgba(239, 68, 68, 0.35); border-color: #DC2626; }
          100% { background-color: rgba(239, 68, 68, 0.15); border-color: #EF4444; }
        }
        @keyframes statusPulse {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
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
              Only Foods - ส่วนงานครัว
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
              gap: '6px'
            }}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
            {isDark ? 'Light' : 'Dark'}
          </button>

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
              gap: '8px'
            }}
          >
            <UserIcon />
            <span>{displayName}</span>
          </button>

          {isDropdownOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              background: theme.cardBg,
              border: `1px solid ${theme.border}`,
              borderRadius: '16px',
              width: '240px',
              padding: '16px',
              boxShadow: isDark ? '0 10px 30px rgba(0,0,0,0.5)' : '0 10px 30px rgba(0,0,0,0.08)',
              zIndex: 1000
            }}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '14px', fontWeight: '800', color: theme.textMain }}>{displayName}</div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>{displayRole}</div>
              </div>
              <hr style={{ border: 'none', borderTop: `1px solid ${theme.border}`, margin: '12px 0' }} />
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  if (onLogout) onLogout();
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
                  gap: '8px'
                }}
              >
                <LogoutIcon />
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Tabs Filter */}
      <div style={{ padding: '16px 28px 0', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
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
              gap: '8px'
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
              gap: '8px'
            }}
          >
            <DoneCheckIcon />
            <span>ปรุงเสร็จแล้ว / ส่งมอบ</span>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
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
              const pickupAlert = getPickupAlert(o.PickupTime);
              const isCompleted = o.Status === 'Completed';

              return (
                <div key={o.OrderID} style={{
                  background: theme.cardBg,
                  borderRadius: '18px',
                  border: pickupAlert ? '2px solid #EF4444' : `1px solid ${theme.border}`,
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.03)',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}>

                  <div>
                    {/* Header: Queue & Pickup Time */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                      <div>
                        <div style={{ fontSize: '26px', fontWeight: '900', color: PALETTE.coral, lineHeight: '1' }}>
                          {o.QueueNo}
                        </div>
                        <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <ClockIcon />
                          <span>สั่งเมื่อ: {formatTime(o.CreatedAt)} ({timeInfo.label})</span>
                        </div>
                      </div>

                      {/* แสดงเวลานัดรับจากลูกค้า */}
                      {o.PickupTime && (
                        <div style={{
                          background: pickupAlert ? '#FEE2E2' : theme.cardInner,
                          border: `1px solid ${pickupAlert ? '#EF4444' : theme.border}`,
                          color: pickupAlert ? '#DC2626' : theme.textMain,
                          padding: '6px 12px',
                          borderRadius: '10px',
                          fontSize: '12px',
                          fontWeight: '700',
                          textAlign: 'right'
                        }}>
                          <div>เวลานัดรับ</div>
                          <div style={{ fontSize: '13.5px', fontWeight: '800' }}>{o.PickupTime}</div>
                        </div>
                      )}
                    </div>

                    {/* แจ้งเตือนกรณีเวลานัดรับ <= 5 นาที */}
                    {pickupAlert && (
                      <div style={{
                        animation: 'alertFlash 1.5s infinite',
                        border: '1px solid #EF4444',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        marginBottom: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#B91C1C',
                        fontSize: '12.5px',
                        fontWeight: '800'
                      }}>
                        <AlertIcon />
                        <span>🚨 แจ้งเตือน: {pickupAlert.label}</span>
                      </div>
                    )}

                    <hr style={{ border: 'none', borderTop: `1px solid ${theme.border}`, margin: '0 0 14px' }} />

                    {/* รายการอาหาร */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                      {o.items?.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: '15px', fontWeight: '700', color: theme.textMain }}>
                              {item.ProductName}
                            </div>
                            {item.ItemNote && (
                              <div style={{ fontSize: '12px', color: PALETTE.coral, marginTop: '2px', fontWeight: '600' }}>
                                📌 Note: {item.ItemNote}
                              </div>
                            )}
                          </div>
                          <div style={{
                            background: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
                            color: theme.textMain,
                            borderRadius: '8px',
                            padding: '2px 10px',
                            fontSize: '14px',
                            fontWeight: '800'
                          }}>
                            x{item.Qty}
                          </div>
                        </div>
                      ))}
                    </div>

                    {o.Note && (
                      <div style={{
                        background: isDark ? 'rgba(255, 114, 76, 0.1)' : '#FFF0ED',
                        borderLeft: `3px solid ${PALETTE.coral}`,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '12.5px',
                        color: theme.textMain,
                        marginBottom: '16px'
                      }}>
                        <strong>หมายเหตุออเดอร์:</strong> {o.Note}
                      </div>
                    )}
                  </div>

                  {/* ปุ่มควบคุมฝั่งครัว */}
                  <div style={{ marginTop: '10px' }}>
                    {filterTab === 'Pending' ? (
                      /* คนครัวกดได้สถานะเดียวคือ 'ปรุงเสร็จแล้ว' */
                      <button
                        onClick={(e) => updateOrderStatus(o.OrderID, 'Ready', e)}
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: '12px',
                          border: 'none',
                          background: PALETTE.emerald,
                          color: '#FFFFFF',
                          fontWeight: '800',
                          fontSize: '15px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                          transition: 'all 0.2s'
                        }}
                      >
                        <CheckIcon />
                        <span>ปรุงเสร็จแล้ว</span>
                      </button>
                    ) : (
                      /* ถ้าหน้าร้านส่งมอบไปแล้ว (Completed) ห้ามกดอันดู / แก้ไขไม่ได้ */
                      isCompleted ? (
                        <div style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '12px',
                          background: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
                          color: theme.textMuted,
                          fontSize: '13px',
                          fontWeight: '700',
                          textAlign: 'center',
                          border: `1px solid ${theme.border}`
                        }}>
                          ✅ ส่งมอบสำเร็จ (ล็อก - ไม่สามารถแก้ไขได้)
                        </div>
                      ) : (
                        <div style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '12px',
                          background: isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5',
                          color: PALETTE.emerald,
                          fontSize: '13px',
                          fontWeight: '700',
                          textAlign: 'center',
                          border: `1px solid ${PALETTE.emerald}`
                        }}>
                          พร้อมรับอาหาร (รอหน้าร้านส่งมอบ)
                        </div>
                      )
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}