import React, { useState, useEffect } from 'react';

export default function CounterView({ user, apiBase }) {
  const [orders, setOrders] = useState([]);

  //useEffect(() => { fetchData(); }, []);
  useEffect(() => { 
    fetchData(); 
    // เพิ่มคำสั่งให้ดึงข้อมูลซ้ำทุก 4 วินาที
    const interval = setInterval(fetchData, 4000); 
    // สั่งลบการตั้งเวลาเมื่อปิดหน้าจอ
    return () => clearInterval(interval); 
  }, [user, apiBase]);

  const fetchData = () => {
    fetch(`${apiBase}/api/orders?store_id=${user.storeId}`).then(r => r.json()).then(setOrders);
  };

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

  return (
    <div>
      <h2> พนักงานหน้าร้าน (Front Staff)</h2>
      <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '25px' }}>
        <h3 style={{ color: '#d97706', marginTop: 0 }}> ตรวจสอบสลิปชำระเงินที่รอยืนยัน</h3>
        <table border="0" cellPadding="10" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#fffbeb', textAlign: 'left' }}><th>คิว</th><th>ยอดชำระ</th><th>รูปสลิป</th><th>การจัดการ</th></tr></thead>
          <tbody>
            {orders.filter(o => o.Status === 'Verifying_Slip').length === 0 ? <tr><td colSpan="4" style={{ color: '#94a3b8' }}>ไม่มีรายการรอตรวจสอบสลิป</td></tr> : (
              orders.filter(o => o.Status === 'Verifying_Slip').map(o => (
                <tr key={o.OrderID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td><b>{o.QueueNo}</b></td>
                  <td><b>{o.TotalAmount} บาท</b></td>
                  <td><a href={o.SlipUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}> คลิกเปิดดูสลิป</a></td>
                  <td>
                    <button onClick={() => verifySlip(o.OrderID, true)} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', marginRight: '6px', cursor: 'pointer' }}>✅ สลิปถูกต้อง</button>
                    <button onClick={() => verifySlip(o.OrderID, false)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>❌ ปฏิเสธสลิป</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h3> สถานะคิวและส่งมอบอาหาร</h3>
        <table border="0" cellPadding="10" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}><th>คิว</th><th>รายการอาหาร</th><th>สถานะ</th><th>การจัดการ</th></tr></thead>
          <tbody>
            {orders.filter(o => o.Status !== 'Verifying_Slip').map(o => (
              <tr key={o.OrderID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td><b>{o.QueueNo}</b></td>
                <td>{o.items.map(i => `${i.ProductName} x${i.Qty}`).join(', ')}</td>
                <td><b style={{ color: o.Status === 'Ready' ? '#16a34a' : '#475569' }}>{o.Status}</b></td>
                <td>
                  {o.Status === 'Ready' && (
                    <button onClick={() => updateStatus(o.OrderID, 'Completed')} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>ส่งมอบอาหารแล้ว</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
