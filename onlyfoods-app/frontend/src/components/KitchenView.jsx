import React, { useState, useEffect, useCallback, useRef } from 'react';

// สีหลักตามภาพกำหนดเป๊ะ 100%
const PALETTE = {
  coral: '#FF724C',
  yellow: '#FDBF50',
  white: '#FFFFFF',
  dark: '#2A2C41',
};

// SVG Icons
const ChefHatIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 10.58 0A4 4 0 0 1 18 13.87V21H6z"/>
    <line x1="6" y1="17" x2="18" y2="17"/>
  </svg>
);

const SunIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const ExpandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export default function KitchenView({ user, apiBase = "http://localhost:8000" }) {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isDark, setIsDark] = useState(false); // State สลับโหมด Light / Dark
  const isUpdatingRef = useRef(false);

  // คำนวณสีธีมตามโหมดโดยใช้ PALETTE ที่กำหนด
  const theme = {
    pageBg: isDark ? PALETTE.dark : '#F4F5F8',
    cardBg: isDark ? '#1E2030' : PALETTE.white,
    cardInner: isDark ? PALETTE.dark : '#F8FAFC',
    headerBg: PALETTE.dark,
    headerText: PALETTE.white,
    textMain: isDark ? PALETTE.white : PALETTE.dark,
    textMuted: isDark ? '#94A3B8' : '#64748B',
    border: isDark ? '#3B3E5B' : '#E2E8F0',
    primary: PALETTE.coral,
    secondary: PALETTE.yellow,
    white: PALETTE.white,
  };

  const fetchData = useCallback(() => {
    if (isUpdatingRef.current) return;
    const storeId = user?.storeId || 1;
    
    fetch(`${apiBase}/api/orders?store_id=${storeId}`)
      .then(r => r.json())
      .then(data => {
        setOrders(data.filter(o => o.Status === 'Pending'));
      })
      .catch(err => console.error("Error fetching kitchen orders:", err));

    fetch(`${apiBase}/api/orders/kitchen-summary?store_id=${storeId}`)
      .then(r => r.json())
      .then(data => setSummary(data))
      .catch(err => console.error("Error fetching summary:", err));
  }, [user, apiBase]);

  useEffect(() => {
    if (!user) return;
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [user, fetchData]);

  const markAsReady = (id, e) => {
    if (e) e.stopPropagation();
    isUpdatingRef.current = true;
    setOrders(prev => prev.filter(o => o.OrderID !== id));
    if (selectedOrder?.OrderID === id) setSelectedOrder(null);

    fetch(`${apiBase}/api/orders/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Ready', user_role: 'Kitchen Staff', cancel_reason: null })
    })
    .then(() => fetchData())
    .catch(() => fetchData())
    .finally(() => {
      setTimeout(() => { isUpdatingRef.current = false; }, 1000);
    });
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
    <div style={{ backgroundColor: theme.pageBg, minHeight: '100vh', padding: '20px', fontFamily: "'Prompt', sans-serif", boxSizing: 'border-box', color: theme.textMain, transition: 'background-color 0.3s ease' }}>
      
      {/* Header Bar */}
      <header style={{ background: theme.headerBg, color: theme.headerText, padding: '16px 24px', borderRadius: '16px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', boxShadow: '0 8px 20px rgba(42, 44, 65, 0.15)', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: theme.primary, color: theme.white, width: '46px', height: '46px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChefHatIcon />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800' }}>KDS LIVE KITCHEN</h1>
            <p style={{ margin: 0, fontSize: '13px', color: '#94A3B8' }}>รอปรุง: <span style={{ color: theme.secondary, fontWeight: '700' }}>{orders.length} คิว</span></p>
          </div>
        </div>

        {/* Right Section: Summary Badges + Theme Switcher Button */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          {summary.map((s, i) => (
            <div key={i} style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.15)', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{s.ProductName}</span>
              <span style={{ background: theme.secondary, color: PALETTE.dark, borderRadius: '10px', padding: '1px 8px', fontSize: '12px', fontWeight: '800' }}>{s.TotalQty}</span>
            </div>
          ))}

          {/* ปุ่มกดสลับ Light / Dark Mode */}
          <button
            onClick={() => setIsDark(!isDark)}
            style={{
              background: isDark ? theme.secondary : 'rgba(255, 255, 255, 0.15)',
              color: isDark ? PALETTE.dark : theme.white,
              border: 'none',
              borderRadius: '12px',
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
            {isDark ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      {/* Grid Display */}
      <main style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '20px' }}>
        {orders.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '80px 20px', background: theme.cardBg, borderRadius: '16px', border: `1px solid ${theme.border}` }}>
            <h3 style={{ margin: 0, color: theme.textMuted }}>ไม่มีรายการอาหารค้างปรุง</h3>
          </div>
        ) : (
          orders.map(o => {
            const timeInfo = getElapsedInfo(o.CreatedAt);
            const hasLongNote = o.Note?.length > 25 || o.items?.some(i => i.ItemNote?.length > 20);

            return (
              <article
                key={o.OrderID}
                onClick={() => setSelectedOrder(o)}
                style={{
                  background: theme.cardBg,
                  borderRadius: '16px',
                  border: `1px solid ${theme.border}`,
                  borderTop: `6px solid ${timeInfo.isUrgent ? '#EF4444' : theme.primary}`,
                  display: 'flex',
                  flexDirection: 'column',
                  justify: 'space-between',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(42, 44, 65, 0.06)'
                }}
              >
                {/* 1. Header Card */}
                <div style={{ padding: '14px 18px', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255, 114, 76, 0.04)', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '10px', color: theme.textMuted, fontWeight: '700', letterSpacing: '1px' }}>QUEUE</span>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: theme.textMain, lineHeight: '1' }}>#{o.QueueNo}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}><ClockIcon /> {formatTime(o.CreatedAt)}</div>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: timeInfo.isUrgent ? '#EF4444' : theme.primary, marginTop: '4px', display: 'inline-block' }}>{timeInfo.label}</span>
                  </div>
                </div>

                {/* 2. Items List */}
                <div style={{ padding: '16px', flexGrow: 1 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {o.items?.map((item, idx) => (
                      <div key={idx} style={{ background: theme.cardInner, padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '15px', fontWeight: '700', color: theme.textMain }}>{item.ProductName}</span>
                          <span style={{ background: PALETTE.dark, color: theme.white, padding: '2px 8px', borderRadius: '6px', fontSize: '13px', fontWeight: '800' }}>x{item.Qty}</span>
                        </div>

                        {item.ItemNote && (
                          <div style={{ marginTop: '6px', fontSize: '12px', color: '#B45309', background: '#FFFBEB', padding: '4px 8px', borderRadius: '6px', border: '1px solid #FDE68A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            ⚠️ {item.ItemNote}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {o.Note && (
                    <div style={{ marginTop: '12px', padding: '8px 10px', borderRadius: '8px', background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: '12px', color: '#1E40AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      📝 หมายเหตุ: {o.Note}
                    </div>
                  )}

                  {hasLongNote && (
                    <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '11px', color: theme.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <ExpandIcon /> แตะเพื่อดูข้อความเต็ม
                    </div>
                  )}
                </div>

                {/* 3. Action Button (56px Height) */}
                <div style={{ padding: '12px 16px', background: theme.cardInner, borderTop: `1px solid ${theme.border}` }}>
                  <button
                    onClick={(e) => markAsReady(o.OrderID, e)}
                    style={{
                      width: '100%', minHeight: '56px', background: theme.primary, color: theme.white, border: 'none', borderRadius: '12px', fontSize: '17px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', touchAction: 'manipulation', userSelect: 'none', boxShadow: '0 4px 12px rgba(255, 114, 76, 0.3)'
                    }}
                  >
                    <CheckIcon /> ปรุงเสร็จแล้ว
                  </button>
                </div>
              </article>
            );
          })
        )}
      </main>

      {/* Modal ป๊อปอัปอ่านโน้ตยาว */}
      {selectedOrder && (
        <div 
          onClick={() => setSelectedOrder(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1000 }}
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            style={{ background: theme.cardBg, border: `2px solid ${theme.primary}`, borderRadius: '20px', width: '100%', maxWidth: '500px', maxHeight: '85vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', color: theme.textMain }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '12px', color: theme.textMuted }}>รายละเอียดคิวแบบเต็ม</span>
                <h2 style={{ margin: 0, fontSize: '32px', fontWeight: '900', color: theme.primary }}>#{selectedOrder.QueueNo}</h2>
              </div>
              <button onClick={() => setSelectedOrder(null)} style={{ background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><CloseIcon /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {selectedOrder.items?.map((item, idx) => (
                <div key={idx} style={{ background: theme.cardInner, padding: '14px', borderRadius: '14px', border: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '700' }}>
                    <span>{item.ProductName}</span>
                    <span style={{ color: theme.secondary, background: PALETTE.dark, padding: '2px 8px', borderRadius: '6px' }}>x{item.Qty}</span>
                  </div>
                  {item.ItemNote && (
                    <div style={{ marginTop: '8px', fontSize: '14px', color: '#B45309', background: '#FFFBEB', padding: '8px 12px', borderRadius: '8px', border: '1px solid #FDE68A', wordBreak: 'break-word' }}>
                      <strong>รายละเอียดพิเศษ:</strong> {item.ItemNote}
                    </div>
                  )}
                </div>
              ))}

              {selectedOrder.Note && (
                <div style={{ padding: '12px 14px', borderRadius: '12px', background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: '14px', color: '#1E40AF', wordBreak: 'break-word' }}>
                  <strong>หมายเหตุออเดอร์:</strong> {selectedOrder.Note}
                </div>
              )}
            </div>

            <button
              onClick={(e) => markAsReady(selectedOrder.OrderID, e)}
              style={{ width: '100%', minHeight: '56px', marginTop: '24px', background: theme.primary, color: theme.white, border: 'none', borderRadius: '14px', fontSize: '18px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', touchAction: 'manipulation' }}
            >
              <CheckIcon /> ปรุงเสร็จแล้ว
            </button>
          </div>
        </div>
      )}
    </div>
  );
}