import React, { useState, useEffect } from 'react';

export default function CounterView({ user, apiBase }) {
  const [activeTab, setActiveTab] = useState('orders'); 
  const [activeStoreId, setActiveStoreId] = useState(user.StoreId || user.storeId || 1);
  const [stores, setStores] = useState([]);
  
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);

  // State ใหม่สำหรับควบคุมการเปิด/ปิด รูปสลิป
  const [viewingSlip, setViewingSlip] = useState(null);

  const fetchData = () => {
    fetch(`${apiBase}/api/orders?store_id=${activeStoreId}`)
      .then(r => r.json())
      .then(setOrders)
      .catch(err => console.error("Error fetching orders:", err));
      
    fetch(`${apiBase}/api/products?store_id=${activeStoreId}`)
      .then(r => r.json())
      .then(setProducts)
      .catch(err => console.error("Error fetching products:", err));
  };

  useEffect(() => {
    fetch(`${apiBase}/api/stores`).then(r => r.json()).then(setStores);
  }, [apiBase]);

  useEffect(() => { 
    fetchData(); 
    const interval = setInterval(fetchData, 4000); 
    return () => clearInterval(interval); 
  }, [activeStoreId, apiBase]);

  const verifySlip = (id, approved) => {
    const reason = approved ? '' : prompt('ระบุเหตุผลที่ปฏิเสธสลิป:');
    if (!approved && !reason) return;
    fetch(`${apiBase}/api/orders/${id}/verify-slip`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved, reason })
    }).then(fetchData);
  };

  const updateStatus = (id, status) => {
    fetch(`${apiBase}/api/orders/${id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, user_role: 'Front Staff' })
    }).then(fetchData);
  };

  const printStub = (queueNo) => {
    alert(`🖨️ กำลังพิมพ์ใบเสร็จ/ใบสั่งอาหาร สำหรับคิว: ${queueNo}`);
  };

  const toggleStock = (productId) => {
    fetch(`${apiBase}/api/products/${productId}/toggle-stock`, { method: 'PUT' })
      .then(fetchData);
  };

  const addToCart = (product) => setCart([...cart, product]);
  const removeFromCart = (idx) => setCart(cart.filter((_, i) => i !== idx));
  const totalAmount = cart.reduce((sum, item) => sum + Number(item.UnitPrice), 0);

  const submitWalkInOrder = () => {
    if (cart.length === 0) return alert('กรุณาเลือกอาหารลงตะกร้าก่อน');
    
    fetch(`${apiBase}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: activeStoreId,
        user_id: null,
        items: cart.map(i => ({ product_id: i.ProductId, qty: 1, unit_price: i.UnitPrice })),
        is_walk_in: true,
        note: 'ลูกค้าสั่งหน้าร้าน'
      })
    }).then(async res => {
      const data = await res.json();
      if (!res.ok) alert(data.detail);
      else {
        alert(`สั่งซื้อหน้าร้านสำเร็จ! หมายเลขคิวคือ: ${data.queue_no}`);
        setCart([]);
        fetchData();
        setActiveTab('orders'); 
      }
    });
  };

  // --- Styles ---
  const styles = {
    container: { fontFamily: "'Inter', 'Sarabun', sans-serif", color: '#334155' },
    headerCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '16px 24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '24px' },
    title: { margin: 0, fontSize: '22px', color: '#1e293b' },
    select: { padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', background: '#f8fafc', cursor: 'pointer' },
    tabContainer: { display: 'inline-flex', gap: '8px', background: '#fff', padding: '8px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '24px' },
    tabButton: (isActive) => ({
      padding: '10px 20px', background: isActive ? '#eff6ff' : 'transparent', color: isActive ? '#2563eb' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s ease'
    }),
    card: { background: '#fff', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '24px' },
    cardTitle: { margin: '0 0 16px 0', color: '#0f172a', fontSize: '18px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { background: '#f8fafc', padding: '14px 16px', textAlign: 'left', color: '#64748b', fontSize: '13px', fontWeight: '600', borderBottom: '1px solid #e2e8f0' },
    td: { padding: '16px', borderBottom: '1px solid #f1f5f9', fontSize: '14px', verticalAlign: 'middle' },
    btnSuccess: { background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' },
    btnDanger: { background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' },
    btnSecondary: { background: '#f1f5f9', color: '#475569', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' },
    btnPrimary: { background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' },
    menuGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' },
    menuCard: { background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', transition: 'transform 0.2s', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' },
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.headerCard}>
        <h2 style={styles.title}>👨‍💻 แดชบอร์ดพนักงานหน้าร้าน</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '500' }}>เลือกร้านค้า:</span>
          <select value={activeStoreId} onChange={e => setActiveStoreId(Number(e.target.value))} style={styles.select}>
            {stores.map(s => <option key={s.StoreId} value={s.StoreId}>{s.StoreName}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabContainer}>
        <button onClick={() => setActiveTab('orders')} style={styles.tabButton(activeTab === 'orders')}>📋 จัดการคิว & สลิป</button>
        <button onClick={() => setActiveTab('walkin')} style={styles.tabButton(activeTab === 'walkin')}>🚶‍♂️ สั่งอาหารหน้าร้าน</button>
        <button onClick={() => setActiveTab('menu')} style={styles.tabButton(activeTab === 'menu')}>🍲 จัดการสต็อกเมนู</button>
      </div>

      {/* TAB 1: จัดการออเดอร์และสลิป */}
      {activeTab === 'orders' && (
        <div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>ตรวจสอบสลิปโอนเงิน (รอยืนยัน)</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>คิว</th><th style={styles.th}>ยอดชำระ</th><th style={styles.th}>หลักฐานสลิป</th><th style={styles.th}>จัดการ</th></tr></thead>
                <tbody>
                  {orders.filter(o => o.Status === 'Verifying_Slip').length === 0 ? (
                    <tr><td colSpan="4" style={{ ...styles.td, textAlign: 'center', color: '#94a3b8', padding: '32px' }}>ไม่มีรายการรอตรวจสอบ</td></tr>
                  ) : (
                    orders.filter(o => o.Status === 'Verifying_Slip').map(o => (
                      <tr key={o.OrderID}>
                        <td style={styles.td}><span style={{ background: '#fef3c7', color: '#d97706', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>{o.QueueNo}</span></td>
                        <td style={{ ...styles.td, fontWeight: 'bold', color: '#10b981' }}>฿{o.TotalAmount}</td>
                        <td style={styles.td}>
                          {/* เปลี่ยนจากลิงก์ธรรมดา เป็นรูป Thumbnail ที่กดแล้วขยายได้ */}
                          {o.SlipUrl ? (
                            <div 
                              onClick={() => setViewingSlip(o.SlipUrl)} 
                              style={{ cursor: 'pointer', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}
                            >
                              <img 
                                src={o.SlipUrl} 
                                alt="Slip Thumbnail" 
                                style={{ width: '48px', height: '64px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} 
                              />
                              <span style={{ fontSize: '11px', color: '#3b82f6', marginTop: '4px', fontWeight: '600' }}>🔍 กดดูรูป</span>
                            </div>
                          ) : (
                            <span style={{ color: '#ef4444' }}>ไม่มีสลิป</span>
                          )}
                        </td>
                        <td style={{ ...styles.td }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => verifySlip(o.OrderID, true)} style={styles.btnSuccess}>✅ ยืนยัน</button>
                            <button onClick={() => verifySlip(o.OrderID, false)} style={styles.btnDanger}>❌ ปฏิเสธ</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>สถานะคิวและส่งมอบอาหาร</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>คิว</th><th style={styles.th}>รายการอาหาร</th><th style={styles.th}>สถานะ</th><th style={styles.th}>จัดการ</th></tr></thead>
                <tbody>
                  {orders.filter(o => o.Status !== 'Verifying_Slip' && o.Status !== 'Completed' && o.Status !== 'Cancelled').length === 0 ? (
                    <tr><td colSpan="4" style={{ ...styles.td, textAlign: 'center', color: '#94a3b8', padding: '32px' }}>ไม่มีคิวที่กำลังดำเนินการ</td></tr>
                  ) : (
                    orders.filter(o => o.Status !== 'Verifying_Slip' && o.Status !== 'Completed' && o.Status !== 'Cancelled').map(o => (
                      <tr key={o.OrderID}>
                        <td style={styles.td}>
                          <span style={{ fontWeight: 'bold' }}>{o.QueueNo}</span>
                          {o.IsWalkIn === 1 && <span style={{ marginLeft: '8px', background: '#e2e8f0', color: '#475569', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>Walk-in</span>}
                        </td>
                        <td style={{ ...styles.td, color: '#475569' }}>{o.items.map(i => `${i.ProductName} (x${i.Qty})`).join(', ')}</td>
                        <td style={styles.td}>
                          <span style={{ 
                            background: o.Status === 'Ready' ? '#dcfce7' : '#f1f5f9', 
                            color: o.Status === 'Ready' ? '#15803d' : '#475569', 
                            padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' 
                          }}>
                            {o.Status === 'Ready' ? 'พร้อมเสิร์ฟ' : 'กำลังปรุง'}
                          </span>
                        </td>
                        <td style={{ ...styles.td, display: 'flex', gap: '8px' }}>
                          <button onClick={() => printStub(o.QueueNo)} style={styles.btnSecondary}>🖨️ พิมพ์</button>
                          {o.Status === 'Ready' && <button onClick={() => updateStatus(o.OrderID, 'Completed')} style={styles.btnSuccess}>✅ ส่งมอบ</button>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Walk-in */}
      {activeTab === 'walkin' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>เมนูอาหาร</h3>
            <div style={styles.menuGrid}>
              {products.map(p => (
                <div key={p.ProductId} style={styles.menuCard}>
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', color: '#1e293b', fontSize: '15px' }}>{p.ProductName}</h4>
                    <p style={{ color: '#10b981', fontWeight: 'bold', margin: '0 0 16px 0' }}>฿{p.UnitPrice}</p>
                  </div>
                  {p.IsOutOfStock ? (
                    <div style={{ background: '#fee2e2', color: '#ef4444', textAlign: 'center', padding: '8px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold' }}>❌ สินค้าหมด</div>
                  ) : (
                    <button onClick={() => addToCart(p)} style={{ ...styles.btnPrimary, width: '100%' }}>+ หยิบใส่ตะกร้า</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...styles.card, height: 'fit-content' }}>
            <h3 style={styles.cardTitle}>ตะกร้า Walk-in</h3>
            {cart.length === 0 ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>ยังไม่มีรายการอาหาร</p> : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                  {cart.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px' }}>
                      <span style={{ fontSize: '14px', color: '#334155', fontWeight: '500' }}>{item.ProductName}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontWeight: 'bold', color: '#1e293b' }}>฿{item.UnitPrice}</span>
                        <button onClick={() => removeFromCart(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}>✖</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: '2px dashed #e2e8f0', paddingTop: '16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: '500' }}>ยอดรวมสุทธิ</span>
                  <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a' }}>฿{totalAmount}</span>
                </div>
                <button onClick={submitWalkInOrder} style={{ ...styles.btnPrimary, width: '100%', padding: '14px', fontSize: '15px' }}>
                  💰 ชำระเงินสด & สร้างคิว
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: สลับสถานะเมนู */}
      {activeTab === 'menu' && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>ตั้งค่าสถานะวัตถุดิบหน้าร้าน</h3>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 20px 0' }}>สลับสถานะเมนูเพื่อแจ้งลูกค้าและห้องครัวทันทีเมื่อวัตถุดิบหมด</p>
          <div style={styles.menuGrid}>
            {products.map(p => (
              <div key={p.ProductId} style={{ ...styles.menuCard, flexDirection: 'row', alignItems: 'center', padding: '20px' }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#1e293b' }}>{p.ProductName}</h4>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: p.IsOutOfStock ? '#ef4444' : '#10b981' }}>
                    {p.IsOutOfStock ? '● ปิดการขาย' : '● พร้อมขาย'}
                  </span>
                </div>
                <button 
                  onClick={() => toggleStock(p.ProductId)} 
                  style={p.IsOutOfStock ? styles.btnSuccess : styles.btnSecondary}
                >
                  {p.IsOutOfStock ? 'เปิดขาย' : 'ระงับขาย'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* ส่วนของ Modal (Popup เปิดดูสลิปเต็มจอ) */}
      {/* ========================================== */}
      {viewingSlip && (
        <div 
          onClick={() => setViewingSlip(null)} 
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}
        >
          {/* กล่องสีขาวด้านใน (หยุดไม่ให้คลิกแล้วปิดถ้ายกเว้นจะคลิกพื้นหลังสีดำ) */}
          <div 
            onClick={(e) => e.stopPropagation()} 
            style={{ background: '#fff', padding: '20px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}
          >
            <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>📄 หลักฐานการโอนเงิน</h3>
            <img 
              src={viewingSlip} 
              alt="Full Slip" 
              style={{ maxWidth: '85vw', maxHeight: '70vh', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e2e8f0' }} 
            />
            <button 
              onClick={() => setViewingSlip(null)} 
              style={{ ...styles.btnDanger, width: '100%', marginTop: '20px', padding: '12px', fontSize: '15px', fontWeight: 'bold' }}
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}