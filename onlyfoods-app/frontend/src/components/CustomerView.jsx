import React, { useState, useEffect } from 'react';

export default function CustomerView({ user, apiBase }) {
  const userId = user.UserId || user.id;
  const fullName = user.FullName || user.name;
  const points = user.Points || 250;

  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(1);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [slipUrl, setSlipUrl] = useState('https://via.placeholder.com/200x300?text=K-Mobile+Slip');

  const [orderNote, setOrderNote] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('PromptPay');

  const [reviewOrder, setReviewOrder] = useState(null);
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [isReadOnlyReview, setIsReadOnlyReview] = useState(false);
  const [reviewedOrderIds, setReviewedOrderIds] = useState({});

  // Active Tab สำหรับเลือกเมนูฝั่ง Sidebar
  const [activeTab, setActiveTab] = useState('menu');

  // 🔴 1. State เก็บ Key ของการแจ้งเตือนที่อ่านแล้ว
  const [readNotifIds, setReadNotifIds] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // State สำหรับเปิด/ปิด ป๊อปอัปตะกร้าลอย
  const [isCartOpen, setIsCartOpen] = useState(false);

  const fetchStores = () => fetch(`${apiBase}/api/stores`).then(r => r.json()).then(setStores);
  const fetchNotifs = () => fetch(`${apiBase}/api/notifications/${userId}`).then(r => r.json()).then(setNotifs);
  const fetchMyOrders = () => fetch(`${apiBase}/api/orders?user_id=${userId}`).then(r => r.json()).then(setMyOrders);

  // 🔴 2. ฟังก์ชันสร้าง Unique Key แบบไม่พึ่ง index
  const getNotifKey = (n) => n.NotificationID || n.id || `${n.Message}_${n.CreatedAt}`;

  useEffect(() => {
    fetchStores();
    fetchNotifs();
    fetchMyOrders();

    const interval = setInterval(() => {
      fetchStores(); 
      fetchNotifs();
      fetchMyOrders();
    }, 4000);

    return () => clearInterval(interval);
  }, [userId, apiBase]);

  // 🔴 3. เมื่อเปิดหน้าเว็บครั้งแรก บันทึกรายการเดิมที่มีอยู่ทั้งหมดว่าอ่านแล้ว
  useEffect(() => {
    if (notifs.length > 0 && !isInitialized) {
      const initialKeys = notifs.map(n => getNotifKey(n));
      setReadNotifIds(initialKeys);
      setIsInitialized(true);
    }
  }, [notifs, isInitialized]);
  
  useEffect(() => {
    if (selectedStore) {
      fetch(`${apiBase}/api/products?store_id=${selectedStore}`)
        .then(r => r.json())
        .then(setProducts)
        .catch(err => console.error("Error fetching products:", err));
    }
  }, [selectedStore, apiBase]);

  const activeStore = stores.find(s => s.StoreId === selectedStore) || {};

  const addToCart = (p) => setCart([...cart, p]);
  const removeFromCart = (idx) => setCart(cart.filter((_, i) => i !== idx));

  const totalAmount = cart.reduce((sum, item) => sum + Number(item.UnitPrice), 0);

  const getCurrentTimeFormatted = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} น.`;
  };

  // 🔴 4. คำนวณนับเฉพาะรายการที่ยังไม่ได้อ่าน
  const unreadNotifsCount = notifs.filter(n => !readNotifIds.includes(getNotifKey(n))).length;

  // 🔴 5. เมื่อกดคลิกแท็บการแจ้งเตือน นำ Key รายการปัจจุบันทั้งหมดไปมาร์กเป็นอ่านแล้ว
  const handleSelectTab = (tabName) => {
    setActiveTab(tabName);
    if (tabName === 'notifs') {
      const currentKeys = notifs.map(n => getNotifKey(n));
      setReadNotifIds(prev => Array.from(new Set([...prev, ...currentKeys])));
    }
  };

  const submitOrder = () => {
    if (cart.length === 0) return alert('กรุณาเลือกอาหารลงตะกร้าก่อนส่งสั่งซื้อ');
    
    const finalPickupTime = pickupTime ? `${pickupTime} น.` : getCurrentTimeFormatted();

    fetch(`${apiBase}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: selectedStore,
        user_id: userId,
        items: cart.map(i => ({ product_id: i.ProductId, qty: 1, unit_price: i.UnitPrice })),
        payment_method: paymentMethod,
        slip_url: paymentMethod === 'PromptPay' ? slipUrl : '',
        note: orderNote,
        pickup_time: finalPickupTime
      })
    }).then(async res => {
      const data = await res.json();
      if (!res.ok) alert(data.detail);
      else {
        alert(`สั่งซื้อสำเร็จ! หมายเลขคิวของคุณคือ: ${data.queue_no}\nเวลารับอาหาร: ${finalPickupTime}`);
        setCart([]);
        setOrderNote('');
        setPickupTime('');
        setIsCartOpen(false);
        fetchMyOrders();
        fetchNotifs();
      }
    });
  };

  const handleOpenReviewModal = (order) => {
    setReviewOrder(order);
    const localReview = reviewedOrderIds[order.OrderID];
    
    if (localReview || order.IsReviewed || order.review) {
      setIsReadOnlyReview(true);
      setRating(localReview?.rating || order.review?.rating || order.Rating || 5);
      setReviewComment(localReview?.comment || order.review?.comment || order.ReviewComment || 'ไม่มีข้อความรีวิว');
    } else {
      setIsReadOnlyReview(false);
      setRating(5);
      setReviewComment('');
    }
  };

  const submitReview = () => {
    if (!reviewOrder) return;
    
    const reviewData = {
      order_id: reviewOrder.OrderID,
      user_id: userId,
      rating: rating,
      comment: reviewComment
    };

    fetch(`${apiBase}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewData)
    }).then(() => {
      alert('บันทึกการรีวิวเรียบร้อยแล้ว ขอบคุณสำหรับความคิดเห็น!');
      
      setReviewedOrderIds(prev => ({
        ...prev,
        [reviewOrder.OrderID]: { rating, comment: reviewComment }
      }));

      setReviewOrder(null);
      fetchMyOrders();
    });
  };

  const fontStyle = {
    fontFamily: "'Prompt', 'Kanit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  };

  return (
    <div style={{ ...fontStyle, background: '#f1f5f9', minHeight: '100vh', color: '#1e293b', padding: '16px' }}>
      
      <div style={{ maxWidth: '1400px', margin: '0 auto', background: '#f8fafc', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        
        {/* Header */}
        <div style={{ background: '#ffffff', padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>🍽️</span>
            <div>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: '#0284c7', letterSpacing: '-0.3px' }}>
                Only Foods KMITL System
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginTop: '2px' }}>
                <span style={{ color: '#64748b' }}>สถานะศูนย์อาหาร:</span>
                <span style={{ height: '9px', width: '9px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                <b style={{ color: '#059669', fontWeight: '600' }}>เปิดให้บริการ</b>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#1e293b', fontWeight: '600' }}>
              <span>👤</span>
              <span>คุณ{fullName} (Customer)</span>
            </div>
            <button style={{ background: '#ef4444', color: '#ffffff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>
              ออกจากระบบ
            </button>
          </div>
        </div>

        {/* Body Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: '750px' }}>
          
          {/* Left Sidebar */}
          <div style={{ background: '#0b1329', color: '#94a3b8', padding: '20px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
                <div style={{ background: '#0284c7', color: '#ffffff', fontWeight: 'bold', width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>
                  OF
                </div>
                <div>
                  <div style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '14px' }}>OF Customer</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Only Foods · ศูนย์อาหาร</div>
                </div>
              </div>

              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '10px', paddingLeft: '8px' }}>เมนูกลาง</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button 
                  onClick={() => handleSelectTab('menu')}
                  style={{ 
                    ...fontStyle,
                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', borderRadius: '8px', border: 'none',
                    background: activeTab === 'menu' ? '#132247' : 'transparent', 
                    color: activeTab === 'menu' ? '#ffffff' : '#94a3b8', 
                    borderLeft: activeTab === 'menu' ? '4px solid #0284c7' : '4px solid transparent',
                    fontWeight: activeTab === 'menu' ? 'bold' : 'normal', textAlign: 'left', cursor: 'pointer', fontSize: '13px' 
                  }}
                >
                  <span>🛒</span> เมนูและสั่งอาหาร
                </button>

                <button 
                  onClick={() => handleSelectTab('orders')}
                  style={{ 
                    ...fontStyle,
                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', borderRadius: '8px', border: 'none',
                    background: activeTab === 'orders' ? '#132247' : 'transparent', 
                    color: activeTab === 'orders' ? '#ffffff' : '#94a3b8', 
                    borderLeft: activeTab === 'orders' ? '4px solid #0284c7' : '4px solid transparent',
                    fontWeight: activeTab === 'orders' ? 'bold' : 'normal', textAlign: 'left', cursor: 'pointer', fontSize: '13px' 
                  }}
                >
                  <span>📋</span> ประวัติสั่งซื้อ & สถานะ
                </button>

                {/* Badge การแจ้งเตือน */}
                <button 
                  onClick={() => handleSelectTab('notifs')}
                  style={{ 
                    ...fontStyle,
                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', borderRadius: '8px', border: 'none',
                    background: activeTab === 'notifs' ? '#132247' : 'transparent', 
                    color: activeTab === 'notifs' ? '#ffffff' : '#94a3b8', 
                    borderLeft: activeTab === 'notifs' ? '4px solid #0284c7' : '4px solid transparent',
                    fontWeight: activeTab === 'notifs' ? 'bold' : 'normal', textAlign: 'left', cursor: 'pointer', fontSize: '13px' 
                  }}
                >
                  <span>🔔</span> การแจ้งเตือน 
                  {unreadNotifsCount > 0 && (
                    <span style={{ background: '#ef4444', color: 'white', fontSize: '10px', fontWeight: 'bold', padding: '1px 6px', borderRadius: '10px', marginLeft: 'auto' }}>
                      {unreadNotifsCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #1e293b', paddingTop: '16px', fontSize: '12px' }}>
              <div style={{ color: '#475569' }}>เข้าสู่ระบบในฐานะ</div>
              <div style={{ color: '#ffffff', fontWeight: 'bold' }}>Customer</div>
              <div style={{ color: '#94a3b8' }}>{fullName}</div>
            </div>
          </div>

          {/* Right Main Content */}
          <div style={{ padding: '24px 32px', background: '#f8fafc' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ position: 'relative', width: '320px' }}>
                <input 
                  type="text" 
                  placeholder="ค้นหาร้านค้า, เมนู..." 
                  style={{ ...fontStyle, width: '100%', padding: '9px 14px 9px 36px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#ffffff', fontSize: '13px', outline: 'none' }}
                />
                <span style={{ position: 'absolute', left: '12px', top: '9px', color: '#94a3b8', fontSize: '14px' }}>🔍</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <span>👤</span>
                  <span style={{ fontWeight: '600' }}>คุณ{fullName}</span>
                </div>
              </div>
            </div>

            <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ fontWeight: 'bold', fontSize: '14px', color: '#1e293b' }}>เลือกร้านค้า:</label>
                <select 
                  value={selectedStore} 
                  onChange={e => setSelectedStore(Number(e.target.value))} 
                  style={{ ...fontStyle, padding: '8px 14px', fontSize: '14px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', background: '#ffffff', fontWeight: '600' }}
                >
                  {stores.map(s => (
                    <option key={s.StoreId} value={s.StoreId}>
                      {s.StoreName} {s.IsSuspended ? ' (ถูกระงับ)' : !s.IsOpen ? '(ปิดให้บริการ)' : '(เปิดปกติ)'}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ fontSize: '13px', color: '#0284c7', background: '#e0f2fe', padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold' }}>
                สะสมแต้ม: {points} Points
              </div>
            </div>

            {activeStore.IsSuspended ? (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '24px', borderRadius: '12px', textAlign: 'center', fontWeight: 'bold' }}>
                 ร้านค้านี้ถูกระงับสิทธิ์การจำหน่ายชั่วคราวโดยผู้บริหาร
              </div>
            ) : !activeStore.IsOpen ? (
              <div style={{ background: '#fef3c7', border: '1px solid #fde047', color: '#92400e', padding: '24px', borderRadius: '12px', textAlign: 'center', fontWeight: 'bold' }}>
                 ร้านค้านี้ปิดให้บริการชั่วคราว
              </div>
            ) : (
              <>
                {activeTab === 'menu' && (
                  <div>
                    <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#0f172a', fontWeight: '700' }}>
                      เมนูอาหาร ({activeStore.StoreName})
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
                      {products.map(p => (
                        <div key={p.ProductId} style={{ background: '#ffffff', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <div>
                            <img 
                              src={p.ImageUrl || 'https://via.placeholder.com/200x120?text=Food+Image'} 
                              alt={p.ProductName} 
                              style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', marginBottom: '10px' }} 
                            />
                            <b style={{ fontSize: '15px', color: '#0f172a' }}>{p.ProductName}</b>
                            <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 8px 0', minHeight: '32px' }}>{p.Description || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
                          </div>
                          <div>
                            <p style={{ color: '#0284c7', fontWeight: '800', fontSize: '16px', margin: '6px 0 10px 0' }}>{p.UnitPrice} ฿</p>
                            {p.IsOutOfStock ? (
                              <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '12px' }}>❌ สินค้าหมด</span>
                            ) : (
                              <button 
                                onClick={() => addToCart(p)} 
                                style={{ ...fontStyle, width: '100%', padding: '9px', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
                              >
                                + เพิ่มลงตะกร้า
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'orders' && (
                  <div>
                    <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#0f172a', fontWeight: '700' }}>ประวัติและสถานะคำสั่งซื้อของฉัน</h3>
                      <table border="0" cellPadding="12" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontSize: '12px', fontWeight: 'bold' }}>
                            <th style={{ textAlign: 'left' }}>หมายเลขออเดอร์</th>
                            <th style={{ textAlign: 'left' }}>ร้านค้า</th>
                            <th style={{ textAlign: 'left' }}>รายการ</th>
                            <th style={{ textAlign: 'left' }}>เวลารับอาหาร</th>
                            <th style={{ textAlign: 'left' }}>ยอดเงิน</th>
                            <th style={{ textAlign: 'left' }}>สถานะ</th>
                            <th style={{ textAlign: 'left' }}>การจัดการ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {myOrders.map(o => {
                            const hasReviewed = !!reviewedOrderIds[o.OrderID] || o.IsReviewed || o.review || o.Rating;
                            
                            return (
                              <tr key={o.OrderID} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                                <td><b style={{ color: '#0284c7' }}>{o.QueueNo}</b></td>
                                <td>{o.StoreName}</td>
                                <td>{o.items.map(i => `${i.ProductName} (x${i.Qty})`).join(', ')}</td>
                                <td style={{ fontSize: '13px', color: '#64748b' }}>{o.PickupTime || o.pickup_time || 'รับทันที'}</td>
                                <td><b>{o.TotalAmount}B</b></td>
                                <td>
                                  <span style={{ 
                                    padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold',
                                    background: o.Status === 'Verifying_Slip' ? '#fef3c7' : o.Status === 'Completed' ? '#dcfce7' : o.Status === 'Cancelled' ? '#fee2e2' : '#e0f2fe',
                                    color: o.Status === 'Verifying_Slip' ? '#92400e' : o.Status === 'Completed' ? '#166534' : o.Status === 'Cancelled' ? '#991b1b' : '#0369a1'
                                  }}>
                                    {getStatusLabel(o.Status)}
                                  </span>
                                </td>
                                <td>
                                  {o.Status === 'Completed' && (
                                    <button 
                                      onClick={() => handleOpenReviewModal(o)} 
                                      style={{ 
                                        ...fontStyle,
                                        background: hasReviewed ? '#64748b' : '#f59e0b',
                                        color: '#ffffff', 
                                        border: 'none', 
                                        padding: '6px 12px', 
                                        borderRadius: '6px', 
                                        fontSize: '12px', 
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                      }}
                                    >
                                      {hasReviewed ? 'ดูรีวิวของคุณ' : 'รีวิวและให้คะแนน'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === 'notifs' && (
                  <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#0f172a' }}>🔔 รายการการแจ้งเตือนทั้งหมด</h3>
                    {notifs.length === 0 ? (
                      <p style={{ color: '#94a3b8' }}>ไม่มีการแจ้งเตือน</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {notifs.map((n, i) => (
                          <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', color: '#1e293b' }}>
                              {n.Message ? n.Message.replace('✅', '').trim() : ''}
                            </span>
                            <span style={{ color: '#94a3b8', fontSize: '11px' }}>{n.CreatedAt}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

          </div>
        </div>

      </div>

      {/* Floating Cart Button */}
      <div 
        onClick={() => setIsCartOpen(true)}
        style={{
          position: 'fixed',
          bottom: '32px',
          right: '32px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: '#0284c7',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '26px',
          boxShadow: '0 8px 24px rgba(2, 132, 199, 0.4)',
          cursor: 'pointer',
          zIndex: 999,
          transition: 'transform 0.2s'
        }}
      >
        🛒
        {cart.length > 0 && (
          <span style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: '#ef4444',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 'bold',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #ffffff'
          }}>
            {cart.length}
          </span>
        )}
      </div>

      {/* Modal ป๊อปอัปตะกร้าสินค้า */}
      {isCartOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(11, 19, 41, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', padding: '24px', borderRadius: '16px', width: '420px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>🛒 ตะกร้าสั่งซื้อ</h3>
              <button onClick={() => setIsCartOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>❌</button>
            </div>

            {cart.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '30px 0' }}>ยังไม่มีรายการในตะกร้า</p>
            ) : (
              <div>
                <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '12px' }}>
                  {cart.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px', alignItems: 'center' }}>
                      <span>{item.ProductName}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <b>{item.UnitPrice}฿</b>
                        <button onClick={() => removeFromCart(idx)} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}>❌</button>
                      </div>
                    </div>
                  ))}
                </div>

                <hr style={{ border: 'none', borderTop: '1px dashed #cbd5e1', margin: '14px 0' }} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ color: '#64748b', fontSize: '14px' }}>ยอดรวมทั้งหมด:</span>
                  <b style={{ fontSize: '20px', color: '#0284c7' }}>{totalAmount} ฿</b>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>เวลารับอาหารล่วงหน้า (เว้นว่าง = รับทันที):</label>
                    <input 
                      type="time" 
                      value={pickupTime} 
                      onChange={e => setPickupTime(e.target.value)} 
                      style={{ ...fontStyle, width: '100%', padding: '8px', fontSize: '13px', marginTop: '4px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc' }} 
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>รายละเอียด/หมายเหตุเพิ่มเติม:</label>
                    <textarea 
                      value={orderNote} 
                      onChange={e => setOrderNote(e.target.value)} 
                      placeholder="เช่น ไม่เผ็ด, ไม่ใส่ผัก..."
                      rows={2}
                      style={{ ...fontStyle, width: '100%', padding: '8px', fontSize: '13px', marginTop: '4px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', resize: 'vertical' }} 
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>ช่องทางชำระเงินออนไลน์ (ชำระล่วงหน้า):</label>
                    <select 
                      value={paymentMethod} 
                      onChange={e => setPaymentMethod(e.target.value)} 
                      style={{ ...fontStyle, width: '100%', padding: '8px', fontSize: '13px', marginTop: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc' }}
                    >
                      <option value="PromptPay">สแกน QR Code (PromptPay)</option>
                      <option value="CreditCard">บัตรเครดิต / เดบิต</option>
                      <option value="TrueMoney">TrueMoney Wallet</option>
                    </select>
                  </div>

                  {paymentMethod === 'PromptPay' && (
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>แนบ URL สลิปชำระเงิน:</label>
                      <input value={slipUrl} onChange={e => setSlipUrl(e.target.value)} style={{ ...fontStyle, width: '100%', padding: '8px', fontSize: '11px', marginTop: '4px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc' }} />
                    </div>
                  )}
                  
                  <button 
                    onClick={submitOrder} 
                    style={{ ...fontStyle, width: '100%', padding: '12px', background: '#10b981', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 'bold', marginTop: '8px', cursor: 'pointer', fontSize: '14px' }}
                  >
                    ชำระเงินและสั่งซื้อ
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(11, 19, 41, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', padding: '28px', borderRadius: '12px', width: '380px' }}>
            <h3 style={{ marginTop: 0, color: '#0f172a' }}>
              {isReadOnlyReview ? '📝 รายละเอียดการรีวิวของคุณ' : '⭐ ให้คะแนนและรีวิว'}
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b' }}>ออเดอร์คิว: {reviewOrder.QueueNo} ({reviewOrder.StoreName})</p>
            
            <div style={{ margin: '16px 0' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>คะแนนร้านอาหาร:</label>
              {isReadOnlyReview ? (
                <div style={{ fontSize: '18px', marginTop: '6px' }}>
                  {'⭐'.repeat(rating)} <span style={{ fontSize: '14px', color: '#475569' }}>({rating}/5 คะแนน)</span>
                </div>
              ) : (
                <select value={rating} onChange={e => setRating(Number(e.target.value))} style={{ ...fontStyle, width: '100%', padding: '8px', marginTop: '6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <option value={5}>⭐⭐⭐⭐⭐ (5 ดาว - ดีมาก)</option>
                  <option value={4}>⭐⭐⭐⭐ (4 ดาว - ดี)</option>
                  <option value={3}>⭐⭐⭐ (3 ดาว - ปานกลาง)</option>
                  <option value={2}>⭐⭐ (2 ดาว - ควรปรับปรุง)</option>
                  <option value={1}>⭐ (1 ดาว - แย่มาก)</option>
                </select>
              )}
            </div>

            <div style={{ margin: '16px 0' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>ข้อความรีวิว:</label>
              {isReadOnlyReview ? (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '8px', fontSize: '13px', marginTop: '6px', color: '#334155' }}>
                  {reviewComment || 'ไม่มีข้อความรีวิว'}
                </div>
              ) : (
                <textarea 
                  value={reviewComment} 
                  onChange={e => setReviewComment(e.target.value)} 
                  placeholder="แบ่งปันความรู้สึกของคุณเกี่ยวกับอาหารและบริการ..."
                  rows={3}
                  style={{ ...fontStyle, width: '100%', padding: '10px', marginTop: '6px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #cbd5e1', resize: 'vertical' }}
                />
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              {!isReadOnlyReview && (
                <button onClick={submitReview} style={{ ...fontStyle, flex: 1, padding: '10px', background: '#10b981', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                  ส่งรีวิว
                </button>
              )}
              <button onClick={() => setReviewOrder(null)} style={{ ...fontStyle, flex: 1, padding: '10px', background: '#64748b', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                {isReadOnlyReview ? 'ปิดหน้าต่าง' : 'ยกเลิก'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function getStatusLabel(status) {
  switch (status) {
    case 'Verifying_Slip': return 'รอตรวจสอบสลิป';
    case 'Pending': return 'รับออเดอร์แล้ว (รอเข้าครัว)';
    case 'Cooking': return 'กำลังปรุงอาหาร';
    case 'Ready': return 'ปรุงเสร็จแล้ว (รอรับที่หน้าร้าน)';
    case 'Completed': return 'รับอาหารสำเร็จ';
    case 'Cancelled': return 'ยกเลิกออเดอร์';
    default: return status;
  }
}