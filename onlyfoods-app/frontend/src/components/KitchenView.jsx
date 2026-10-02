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

// --- SVG Icons (ไม่ใช้อีโมจิ) ---
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
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const UndoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7v6h6"/>
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
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

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const NoteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
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
  
  // State ป๊อบอัพรายละเอียดออเดอร์ & ป๊อบอัพยืนยันออกจากระบบ
  const [selectedOrder, setSelectedOrder] = useState(null);
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
      link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&family=Sarabun:wght@400;500;600;700;800&display=swap';
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

const sortedOrders = [...allOrders].sort((a, b) => (a.OrderID || 0) - (b.OrderID || 0));

  const pendingOrders = sortedOrders.filter(o => o.Status === 'Pending' || o.Status === 'Cooking');
  const readyOrders = sortedOrders.filter(o => o.Status === 'Ready' || o.Status === 'Completed');
  const displayedOrders = sortedOrders.filter(order => {
    if (filterTab === 'Pending') {
      return order.Status === 'Pending' || order.Status === 'Cooking';
    }
    return order.Status === 'Ready';
  });

  const isStoreActive = foodCourtOpen && storeOpen && !isSuspended;

  const getStatusText = () => {
    if (!foodCourtOpen) return 'ปิดให้บริการ (ศูนย์อาหารปิด)';
    if (isSuspended) return 'ปิดให้บริการ (ถูกระงับสิทธิ์)';
    if (!storeOpen) return 'ปิดให้บริการ (ร้านปิด)';
    return 'เปิดให้บริการ';
  };

const updateOrderStatus = async (id, targetStatus = 'Ready', e) => {
    if (e) e.stopPropagation();
    if (isUpdatingRef.current) return;
    isUpdatingRef.current = true;

    // หากเป็นการ Undo (ส่งสถานะ Pending) ให้สลับแท็บไปที่หน้าคิวรอปรุงทันที
    if (targetStatus === 'Pending') {
      setFilterTab('Pending');
    }

    // Optimistic Update: ปรับ UI ล่วงหน้าทันทีเพื่อความลื่นไหล
    setAllOrders(prev =>
      prev.map(o => (o.OrderID === id ? { ...o, Status: targetStatus } : o))
    );

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

      if (!res.ok) {
        throw new Error('Backend ตอบกลับสถานะล้มเหลว');
      }
    } catch (err) {
      console.error("Update status error:", err);
      // หากเกิดข้อผิดพลาด ให้ดึงข้อมูลจริงจาก DB กลับมาซิงค์อีกครั้ง
      fetchData();
    } finally {
      isUpdatingRef.current = false;
    }
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Header & Filter Tabs */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">ระบบห้องครัว (Kitchen View)</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFilterTab('Pending')}
            className={`px-4 py-2 rounded-lg font-semibold ${
              filterTab === 'Pending' ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            คิวรอปรุง ({allOrders.filter(o => o.Status === 'Pending' || o.Status === 'Cooking').length})
          </button>
          <button
            onClick={() => setFilterTab('Ready')}
            className={`px-4 py-2 rounded-lg font-semibold ${
              filterTab === 'Ready' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            พร้อมเสิร์ฟ / เสร็จแล้ว ({allOrders.filter(o => o.Status === 'Ready').length})
          </button>
        </div>
      </div>

      {/* Order Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayedOrders.map(order => (
          <div key={order.OrderID} className="border rounded-xl p-4 shadow-sm bg-white flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center border-b pb-2 mb-2">
                <span className="font-bold text-lg">คิว #{order.QueueNo || order.OrderID}</span>
                <span className="text-sm px-2 py-1 bg-gray-100 rounded">โต๊ะ {order.TableNo || '-'}</span>
              </div>
              <ul className="space-y-1 mb-4">
                {order.Items?.map((item, idx) => (
                  <li key={idx} className="text-gray-800 text-sm flex justify-between">
                    <span>{item.ItemName}</span>
                    <span className="font-semibold">x{item.Quantity}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="mt-4 pt-2 border-t">
              {filterTab === 'Pending' ? (
                <button
                  onClick={(e) => updateOrderStatus(order.OrderID, 'Ready', e)}
                  className="w-full py-2 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg transition"
                >
                  ปรุงเสร็จแล้ว
                </button>
              ) : (
                <button
                  onClick={(e) => updateOrderStatus(order.OrderID, 'Pending', e)}
                  className="w-full py-2 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded-lg transition"
                >
                  ↺ ย้อนกลับไปคิวรอปรุง (Undo)
                </button>
              )}
            </div>
          </div>
        ))}

        {displayedOrders.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-400">
            ไม่มีรายการออเดอร์ในหมวดนี้
          </div>
        )}
      </div>
    </div>
  );
}

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

  // จัดรูปแบบเลขคิวให้ชัดเจน (รันคิวรายวันตาม order)
  const formatQueueNo = (queueNo) => {
    if (!queueNo) return 'คิว #--';
    return typeof queueNo === 'number' ? `คิว #${String(queueNo).padStart(3, '0')}` : `คิว #${queueNo}`;
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
        @keyframes urgentFlash {
          0% { background-color: rgba(239, 68, 68, 0.12); border-color: #EF4444; }
          50% { background-color: rgba(239, 68, 68, 0.3); border-color: #DC2626; }
          100% { background-color: rgba(239, 68, 68, 0.12); border-color: #EF4444; }
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
        padding: '14px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        boxSizing: 'border-box',
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
        flexShrink: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: isDark ? 'rgba(255, 114, 76, 0.15)' : '#FFF0ED',
            color: PALETTE.coral,
            display: 'grid',
            placeItems: 'center'
          }}>
            <KitchenIcon />
          </div>

          <div>
            <div style={{ fontSize: '21px', fontWeight: '800', color: theme.textMain, lineHeight: '1.2', letterSpacing: '-0.3px' }}>
              Only Foods - ส่วนงานครัว
            </div>
            <div style={{ fontSize: '13px', color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span>สถานะศูนย์อาหาร:</span>
              <span style={{
                color: isStoreActive ? PALETTE.emerald : '#EF4444',
                fontWeight: '700',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
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
            padding: '8px 16px',
            borderRadius: '99px',
            fontSize: '14px',
            fontWeight: '600'
          }}>
            คิวรอปรุง: <span style={{ color: PALETTE.coral, fontWeight: '800', fontSize: '16px', marginLeft: '4px' }}>{pendingOrders.length}</span>
          </div>

          {summary.slice(0, 3).map((s, i) => (
            <div key={i} style={{
              background: theme.cardInner,
              border: `1px solid ${theme.border}`,
              padding: '8px 16px',
              borderRadius: '99px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>{s.ProductName}</span>
              <span style={{ background: PALETTE.coral, color: '#FFF', borderRadius: '99px', padding: '2px 8px', fontSize: '12px', fontWeight: '800' }}>{s.TotalQty}</span>
            </div>
          ))}

          <button
            onClick={() => setIsDark(!isDark)}
            style={{
              background: theme.cardInner,
              color: theme.textMain,
              border: `1px solid ${theme.border}`,
              borderRadius: '12px',
              padding: '9px 16px',
              fontSize: '13.5px',
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
              padding: '8px 18px',
              fontSize: '14px',
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
      <div style={{ padding: '18px 28px 0', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          display: 'inline-flex',
          background: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0',
          padding: '5px',
          borderRadius: '16px',
          gap: '6px'
        }}>
          <button
            onClick={() => setFilterTab('Pending')}
            style={{
              padding: '11px 22px',
              borderRadius: '12px',
              border: 'none',
              background: filterTab === 'Pending' ? theme.cardBg : 'transparent',
              color: filterTab === 'Pending' ? PALETTE.coral : theme.textMuted,
              fontWeight: '800',
              fontSize: '14.5px',
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
              padding: '2px 10px',
              borderRadius: '99px',
              fontSize: '12.5px',
              fontWeight: '800'
            }}>
              {pendingOrders.length}
            </span>
          </button>

          <button
            onClick={() => setFilterTab('Ready')}
            style={{
              padding: '11px 22px',
              borderRadius: '12px',
              border: 'none',
              background: filterTab === 'Ready' ? theme.cardBg : 'transparent',
              color: filterTab === 'Ready' ? PALETTE.emerald : theme.textMuted,
              fontWeight: '800',
              fontSize: '14.5px',
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
              padding: '2px 10px',
              borderRadius: '99px',
              fontSize: '12.5px',
              fontWeight: '800'
            }}>
              {readyOrders.length}
            </span>
          </button>
        </div>
      </div>

      {/* Main KDS Grid View (ปรับขนาดกรอบให้อ่านง่าย แตะง่ายขึ้น) */}
      <main style={{
        flex: 1,
        padding: '20px 28px 28px',
        boxSizing: 'border-box',
        overflowY: 'auto',
        overflowX: 'hidden'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '22px' }}>
          {displayedOrders.length === 0 ? (
            <div style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              padding: '90px 20px',
              background: theme.cardBg,
              borderRadius: '20px',
              border: `1px solid ${theme.border}`
            }}>
              <h3 style={{ margin: 0, color: theme.textMuted, fontSize: '16px', fontWeight: '600' }}>
                {filterTab === 'Pending' ? 'ไม่มีรายการอาหารค้างปรุงในขณะนี้' : 'ไม่มีรายการออเดอร์ที่ปรุงเสร็จแล้ว'}
              </h3>
            </div>
          ) : (
            displayedOrders.map(o => {
              const timeInfo = getElapsedInfo(o.CreatedAt);
              const pickupAlert = getPickupAlert(o.PickupTime);
              const isCompleted = o.Status === 'Completed';

              return (
                <div 
                  key={o.OrderID} 
                  onClick={() => setSelectedOrder(o)}
                  style={{
                    background: theme.cardBg,
                    borderRadius: '20px',
                    border: pickupAlert ? '2px solid #EF4444' : `1px solid ${theme.border}`,
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isDark ? '0 6px 16px rgba(0,0,0,0.35)' : '0 6px 16px rgba(0,0,0,0.04)',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: 'pointer'
                  }}
                >
                  <div>
                    {/* Header: Queue & Time */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div>
                        <div style={{ fontSize: '32px', fontWeight: '900', color: PALETTE.coral, lineHeight: '1', letterSpacing: '-0.5px' }}>
                          {formatQueueNo(o.QueueNo)}
                        </div>
                        <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <ClockIcon />
                          <span>สั่งเมื่อ: {formatTime(o.CreatedAt)} ({timeInfo.label})</span>
                        </div>
                      </div>

                      {o.PickupTime && (
                        <div style={{
                          background: pickupAlert ? 'rgba(239, 68, 68, 0.12)' : theme.cardInner,
                          border: `1px solid ${pickupAlert ? '#EF4444' : theme.border}`,
                          color: pickupAlert ? '#EF4444' : theme.textMain,
                          padding: '8px 14px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '700',
                          textAlign: 'right'
                        }}>
                          <div>เวลานัดรับ</div>
                          <div style={{ fontSize: '14px', fontWeight: '800' }}>{o.PickupTime}</div>
                        </div>
                      )}
                    </div>

                    {/* แจ้งเตือนออเดอร์ด่วน (เหลือเวลานัดรับ <= 5 นาที) */}
                    {pickupAlert && (
                      <div style={{
                        animation: 'urgentFlash 1.5s infinite',
                        border: '1px solid #EF4444',
                        borderRadius: '12px',
                        padding: '10px 14px',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#EF4444',
                        fontSize: '13px',
                        fontWeight: '800'
                      }}>
                        <AlertIcon />
                        <span>แจ้งเตือนด่วน: {pickupAlert.label}</span>
                      </div>
                    )}

                    <hr style={{ border: 'none', borderTop: `1px solid ${theme.border}`, margin: '0 0 16px' }} />

                    {/* รายการอาหาร */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
                      {o.items?.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                          <div>
                            <div style={{ fontSize: '16.5px', fontWeight: '700', color: theme.textMain, lineHeight: '1.3' }}>
                              {item.ProductName}
                            </div>
                            {item.ItemNote && (
                              <div style={{ fontSize: '13px', color: PALETTE.coral, marginTop: '4px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <NoteIcon />
                                <span>Note: {item.ItemNote}</span>
                              </div>
                            )}
                          </div>
                          <div style={{
                            background: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
                            color: theme.textMain,
                            borderRadius: '10px',
                            padding: '4px 12px',
                            fontSize: '16px',
                            fontWeight: '900',
                            flexShrink: 0
                          }}>
                            x{item.Qty}
                          </div>
                        </div>
                      ))}
                    </div>

                    {o.Note && (
                      <div style={{
                        background: isDark ? 'rgba(255, 114, 76, 0.1)' : '#FFF0ED',
                        borderLeft: `4px solid ${PALETTE.coral}`,
                        padding: '10px 14px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: theme.textMain,
                        marginBottom: '18px'
                      }}>
                        <strong>หมายเหตุ:</strong> {o.Note}
                      </div>
                    )}
                  </div>

                  {/* ส่วนปุ่มสถานะและปุ่ม Undo (ปรับให้มีสัมผัสใหญ่ สะดวกคนครัว) */}
                  <div style={{ marginTop: '12px' }}>
                    {filterTab === 'Pending' ? (
                      <button
                        onClick={(e) => updateOrderStatus(o.OrderID, 'Ready', e)}
                        style={{
                          width: '100%',
                          minHeight: '54px',
                          padding: '14px 20px',
                          borderRadius: '14px',
                          border: 'none',
                          background: PALETTE.emerald,
                          color: '#FFFFFF',
                          fontWeight: '800',
                          fontSize: '16.5px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '10px',
                          boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                          transition: 'all 0.2s'
                        }}
                      >
                        <CheckIcon />
                        <span>ปรุงเสร็จแล้ว</span>
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {isCompleted ? (
                          <div style={{
                            width: '100%',
                            minHeight: '52px',
                            padding: '12px',
                            borderRadius: '14px',
                            background: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
                            color: theme.textMuted,
                            fontSize: '14px',
                            fontWeight: '700',
                            textAlign: 'center',
                            border: `1px solid ${theme.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                          }}>
                            <LockIcon />
                            <span>ส่งมอบสำเร็จแล้ว (ล็อกการแก้ไข)</span>
                          </div>
                        ) : (
                          <>
                            <div style={{
                              width: '100%',
                              padding: '10px 14px',
                              borderRadius: '12px',
                              background: isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5',
                              color: PALETTE.emerald,
                              fontSize: '13.5px',
                              fontWeight: '700',
                              textAlign: 'center',
                              border: `1px solid ${PALETTE.emerald}`
                            }}>
                              พร้อมรับอาหาร (รอหน้าร้านส่งมอบ)
                            </div>
                            
                            {/* ปุ่ม Undo ย้อนกลับสถานะ */}
                            <button
                              onClick={(e) => updateOrderStatus(o.OrderID, 'Pending', e)}
                              style={{
                                width: '100%',
                                minHeight: '48px',
                                padding: '10px 16px',
                                borderRadius: '12px',
                                border: `1.5px solid ${theme.border}`,
                                background: theme.cardInner,
                                color: theme.textMain,
                                fontWeight: '700',
                                fontSize: '14px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                transition: 'all 0.2s'
                              }}
                            >
                              <UndoIcon />
                              <span>ย้อนกลับไปคิวรอปรุง (Undo)</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Pop-up: รายละเอียดออเดอร์ (Order Detail Popup) */}
      {selectedOrder && (
        <div
          onClick={() => setSelectedOrder(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: theme.cardBg,
              border: `1px solid ${theme.border}`,
              borderRadius: '24px',
              width: '100%',
              maxWidth: '540px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              color: theme.textMain
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: PALETTE.coral }}>
                  {formatQueueNo(selectedOrder.QueueNo)}
                </div>
                <div style={{ fontSize: '13.5px', color: theme.textMuted, marginTop: '2px' }}>
                  รหัสออเดอร์: #{selectedOrder.OrderID}
                </div>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                style={{
                  background: theme.cardInner,
                  border: `1px solid ${theme.border}`,
                  color: theme.textMain,
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center'
                }}
              >
                <CloseIcon />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', background: theme.cardInner, padding: '12px 16px', borderRadius: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><ClockIcon /> เวลาที่สั่ง:</span>
                <strong>{formatTime(selectedOrder.CreatedAt)}</strong>
              </div>

              {selectedOrder.PickupTime && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', background: theme.cardInner, padding: '12px 16px', borderRadius: '12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><ClockIcon /> เวลานัดรับ:</span>
                  <strong style={{ color: PALETTE.coral }}>{selectedOrder.PickupTime}</strong>
                </div>
              )}

              <div>
                <h4 style={{ margin: '16px 0 12px', fontSize: '16px', color: theme.textMain }}>รายการอาหารทั้งหมด</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      background: theme.cardInner,
                      padding: '14px',
                      borderRadius: '14px',
                      border: `1px solid ${theme.border}`
                    }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: '700' }}>{item.ProductName}</div>
                        {item.ItemNote && (
                          <div style={{ fontSize: '13px', color: PALETTE.coral, marginTop: '4px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <NoteIcon />
                            <span>Note: {item.ItemNote}</span>
                          </div>
                        )}
                      </div>
                      <span style={{
                        background: PALETTE.coral,
                        color: '#FFF',
                        padding: '3px 12px',
                        borderRadius: '10px',
                        fontSize: '15px',
                        fontWeight: '800'
                      }}>
                        x{item.Qty}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedOrder.Note && (
                <div style={{
                  background: isDark ? 'rgba(255, 114, 76, 0.15)' : '#FFF0ED',
                  borderLeft: `4px solid ${PALETTE.coral}`,
                  padding: '14px',
                  borderRadius: '10px',
                  fontSize: '13.5px'
                }}>
                  <strong>หมายเหตุเพิ่มเติมจากลูกค้า:</strong>
                  <div style={{ marginTop: '4px' }}>{selectedOrder.Note}</div>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedOrder(null)}
              style={{
                width: '100%',
                minHeight: '48px',
                padding: '12px',
                borderRadius: '14px',
                border: 'none',
                background: theme.cardInner,
                color: theme.textMain,
                fontWeight: '700',
                fontSize: '15px',
                cursor: 'pointer'
              }}
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}

      {/* Pop-up: แจ้งเตือนยืนยันออกจากระบบ (Logout Alert Modal) */}
      {showLogoutModal && (
        <div
          onClick={() => setShowLogoutModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: theme.cardBg,
              border: `1px solid ${theme.border}`,
              borderRadius: '24px',
              width: '100%',
              maxWidth: '400px',
              padding: '32px 28px',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              color: theme.textMain
            }}
          >
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#EF4444',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 18px'
            }}>
              <LogoutIcon />
            </div>

            <h3 style={{ margin: '0 0 10px', fontSize: '19px', fontWeight: '800' }}>ยืนยันการออกจากระบบ</h3>
            <p style={{ margin: '0 0 26px', color: theme.textMuted, fontSize: '14px', lineHeight: '1.5' }}>
              คุณต้องการออกจากระบบ Kitchen View ใช่หรือไม่?
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowLogoutModal(false)}
                style={{
                  flex: 1,
                  minHeight: '48px',
                  padding: '12px',
                  borderRadius: '14px',
                  border: `1px solid ${theme.border}`,
                  background: theme.cardInner,
                  color: theme.textMain,
                  fontWeight: '700',
                  fontSize: '14.5px',
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
                  minHeight: '48px',
                  padding: '12px',
                  borderRadius: '14px',
                  border: 'none',
                  background: '#EF4444',
                  color: '#FFFFFF',
                  fontWeight: '700',
                  fontSize: '14.5px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)'
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