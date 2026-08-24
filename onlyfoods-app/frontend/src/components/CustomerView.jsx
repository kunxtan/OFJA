import React, { useState, useEffect } from 'react';

export default function CustomerView({ user, apiBase }) {
  // 1. สร้างตัวแปรมารับค่า เพื่อให้รองรับทั้งแบบจำลอง (id, name) และแบบจาก DB (UserId, FullName)
  const userId = user.UserId || user.id;
  const fullName = user.FullName || user.name;
  const points = user.Points || 250; // สมมติแต้มให้ถ้าเป็นบัญชีจำลอง

  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(1);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [slipUrl, setSlipUrl] = useState('https://via.placeholder.com/200x300?text=K-Mobile+Slip');

  // useEffect(() => {
  //   // โหลดรายชื่อร้านค้าแค่ครั้งเดียวพอ
  //   fetch(`${apiBase}/api/stores`).then(r => r.json()).then(setStores);
    
  //   // โหลดออเดอร์และการแจ้งเตือนครั้งแรก
  //   fetchNotifs();
  //   fetchMyOrders();

  //   // ตั้งเวลาให้โหลดออเดอร์และการแจ้งเตือนซ้ำทุก 4 วินาที
  //   const interval = setInterval(() => {
  //     fetchNotifs();
  //     fetchMyOrders();
  //   }, 4000);
  // 1. แยกคำสั่งดึงข้อมูลร้านค้าออกมาเป็นฟังก์ชัน จะได้เรียกใช้ซ้ำได้ง่ายๆ
  const fetchStores = () => fetch(`${apiBase}/api/stores`).then(r => r.json()).then(setStores);
  const fetchNotifs = () => fetch(`${apiBase}/api/notifications/${userId}`).then(r => r.json()).then(setNotifs);
  const fetchMyOrders = () => fetch(`${apiBase}/api/orders?user_id=${userId}`).then(r => r.json()).then(setMyOrders);

  useEffect(() => {
    // โหลดครั้งแรกตอนเปิดหน้าเว็บ
    fetchStores();
    fetchNotifs();
    fetchMyOrders();

    // 2. เพิ่ม fetchStores เข้าไปในรอบการดึงข้อมูลอัตโนมัติ (ทุก 4 วินาที)
    const interval = setInterval(() => {
      fetchStores(); 
      fetchNotifs();
      fetchMyOrders();
    }, 4000);

    return () => clearInterval(interval);
  }, [userId, apiBase]);
  
  useEffect(() => {
    if (selectedStore) {
      fetch(`${apiBase}/api/products?store_id=${selectedStore}`)
        .then(r => r.json())
        .then(setProducts)
        .catch(err => console.error("Error fetching products:", err));
    }
  }, [selectedStore, apiBase]);

  // 2. เปลี่ยนมาใช้ตัวแปร userId

  const activeStore = stores.find(s => s.StoreId === selectedStore) || {};

  const addToCart = (p) => setCart([...cart, p]);
  const removeFromCart = (idx) => setCart(cart.filter((_, i) => i !== idx));

  const totalAmount = cart.reduce((sum, item) => sum + Number(item.UnitPrice), 0);

  const submitOrder = () => {
    if (cart.length === 0) return alert('กรุณาเลือกอาหารลงตะกร้าก่อนส่งสั่งซื้อ');
    fetch(`${apiBase}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: selectedStore,
        user_id: userId, // เปลี่ยนมาใช้ตัวแปร userId
        items: cart.map(i => ({ product_id: i.ProductId, qty: 1, unit_price: i.UnitPrice })),
        slip_url: slipUrl
      })
    }).then(async res => {
      const data = await res.json();
      if (!res.ok) alert(data.detail);
      else {
        alert(`สั่งซื้อสำเร็จ! หมายเลขคิวของคุณคือ: ${data.queue_no}`);
        setCart([]);
        fetchMyOrders();
        fetchNotifs();
      }
    });
  };

  return (
    <div>
      <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div>
          <h3 style={{ margin: '0 0 10px 0' }}> โปรไฟล์สมาชิก</h3>
          {/* 3. เปลี่ยนมาแสดงผลจาก fullName และ points */}
          <p style={{ margin: '5px 0' }}>ชื่อ: <b>{fullName}</b></p>
          <p style={{ margin: '5px 0' }}>แต้มสะสม: <b style={{ color: '#059669', fontSize: '18px' }}>{points} Points</b> (ทุก 10 บาท = 1 แต้ม)</p>
        </div>
        <div style={{ borderLeft: '2px solid #e2e8f0', paddingLeft: '20px' }}>
          <h3 style={{ margin: '0 0 10px 0' }}> การแจ้งเตือนล่าสุด</h3>
          <div style={{ maxHeight: '100px', overflowY: 'auto' }}>
            {notifs.length === 0 ? <p style={{ color: '#94a3b8' }}>ไม่มีการแจ้งเตือน</p> : (
              notifs.slice(0, 3).map((n, i) => (
                <div key={i} style={{ fontSize: '13px', background: '#f8fafc', padding: '6px 10px', borderRadius: '4px', marginBottom: '5px' }}>
                  {n.Message} <span style={{ color: '#94a3b8', fontSize: '10px' }}>({n.CreatedAt})</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={{ background: 'white', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
        <label style={{ fontWeight: 'bold', marginRight: '10px' }}>ร้านค้าที่เลือกสั่ง:</label>
        <select value={selectedStore} onChange={e => setSelectedStore(Number(e.target.value))} style={{ padding: '8px', fontSize: '15px' }}>
          {stores.map(s => (
            <option key={s.StoreId} value={s.StoreId}>
              {s.StoreName} {s.IsSuspended ? ' (ถูกระงับ)' : !s.IsOpen ? '(ปิดให้บริการ)' : '(เปิดปกติ)'}
            </option>
          ))}
        </select>
      </div>

      {activeStore.IsSuspended ? (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '20px', borderRadius: '10px', textAlign: 'center', fontWeight: 'bold' }}>
           ร้านค้านี้ถูกระงับสิทธิ์การจำหน่ายชั่วคราวโดยผู้บริหาร ไม่สามารถทำรายการได้
        </div>
      ) : !activeStore.IsOpen ? (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '20px', borderRadius: '10px', textAlign: 'center', fontWeight: 'bold' }}>
           ร้านค้านี้ปิดให้บริการชั่วคราว
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
          <div>
            <h3> เมนูอาหาร ({activeStore.StoreName})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
              {products.map(p => (
                <div key={p.ProductId} style={{ background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <b style={{ fontSize: '16px' }}>{p.ProductName}</b>
                  <p style={{ color: '#059669', fontWeight: 'bold', margin: '8px 0' }}>{p.UnitPrice} บาท</p>
                  {p.IsOutOfStock ? (
                    <span style={{ color: 'red', fontWeight: 'bold' }}>❌ สินค้าหมด</span>
                  ) : (
                    <button onClick={() => addToCart(p)} style={{ width: '100%', padding: '6px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ เพิ่มลงตะกร้า</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h3> ตะกร้าสั่งซื้อ</h3>
            {cart.length === 0 ? <p style={{ color: '#94a3b8' }}>ยังไม่มีรายการในตะกร้า</p> : (
              <div>
                {cart.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                    <span>{item.ProductName}</span>
                    <span><b>{item.UnitPrice}B</b> <button onClick={() => removeFromCart(idx)} style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}>❌</button></span>
                  </div>
                ))}
                <hr />
                <p>ยอดรวมทั้งหมด: <b style={{ fontSize: '18px', color: '#2563eb' }}>{totalAmount} บาท</b></p>
                
                <div style={{ marginTop: '15px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>แนบ URL สลิปชำระเงิน:</label>
                  <input value={slipUrl} onChange={e => setSlipUrl(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '11px', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
                
                <button onClick={submitOrder} style={{ width: '100%', padding: '12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', marginTop: '15px', cursor: 'pointer' }}>ส่งสั่งซื้อพร้อมสลิป</button>
              </div>
            )}
          </div>
        </div>
      )}

      <hr style={{ margin: '30px 0', border: 'none', borderTop: '1px solid #cbd5e1' }} />
      <h3> ประวัติและสถานะคำสั่งซื้อของฉัน</h3>
      <table border="0" cellPadding="12" style={{ width: '100%', background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <thead>
          <tr style={{ background: '#e2e8f0', textAlign: 'left' }}><th>หมายเลขคิว</th><th>ร้านค้า</th><th>รายการ</th><th>ยอดเงิน</th><th>สถานะออเดอร์</th><th>หมายเหตุ</th></tr>
        </thead>
        <tbody>
          {myOrders.map(o => (
            <tr key={o.OrderID} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td><b style={{ color: '#2563eb' }}>{o.QueueNo}</b></td>
              <td>{o.StoreName}</td>
              <td>{o.items.map(i => `${i.ProductName} (x${i.Qty})`).join(', ')}</td>
              <td>{o.TotalAmount}B</td>
              <td>
                <span style={{ 
                  padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold',
                  background: o.Status === 'Verifying_Slip' ? '#fef3c7' : o.Status === 'Completed' ? '#dcfce7' : o.Status === 'Cancelled' ? '#fee2e2' : '#e0f2fe',
                  color: o.Status === 'Verifying_Slip' ? '#92400e' : o.Status === 'Completed' ? '#166534' : o.Status === 'Cancelled' ? '#991b1b' : '#075985'
                }}>
                  {getStatusLabel(o.Status)}
                </span>
              </td>
              <td style={{ color: '#ef4444', fontSize: '13px' }}>{o.CancelReason || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// นำฟังก์ชันมาวางไว้ในไฟล์นี้เลยเพื่อไม่ให้เกิด Error
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