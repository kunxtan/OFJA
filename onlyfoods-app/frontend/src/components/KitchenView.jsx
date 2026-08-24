import React, { useState, useEffect, useCallback } from 'react';

export default function KitchenView({ user, apiBase = "http://localhost:8000" }) {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState([]);

  // ย้าย fetchData มาไว้ใน useCallback เพื่อป้องกันปัญหาโหลดข้อมูลไม่ทัน (TDZ)
  const fetchData = useCallback(() => {
    const storeId = user?.storeId || 1;

    // 1. ดึงข้อมูลออเดอร์
    fetch(`${apiBase}/api/orders?store_id=${storeId}`)
      .then(r => r.json())
      .then(data => {
        setOrders(data.filter(o => o.Status === 'Pending' || o.Status === 'Cooking'));
      })
      .catch(err => console.error("Error fetching orders:", err));

    // 2. ดึงข้อมูลสรุปยอดวัตถุดิบ
    fetch(`${apiBase}/api/orders/kitchen-summary?store_id=${storeId}`)
      .then(r => r.json())
      .then(data => setSummary(data))
      .catch(err => console.error("Error fetching summary:", err));
  }, [user, apiBase]);

  useEffect(() => {
    if (!user) return; // ถ้าข้อมูล user ยังไม่มา ให้หยุดไว้ก่อน

    fetchData(); // ดึงข้อมูลทันที 1 ครั้งตอนเปิดหน้าจอ
    const interval = setInterval(fetchData, 4000); // ตั้งเวลาดึงซ้ำทุก 4 วินาที
    return () => clearInterval(interval);
  }, [user, fetchData]);

  const updateStatus = (id, status) => {
    fetch(`${apiBase}/api/orders/${id}/status`, {
      method: 'PUT', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        status: status, 
        user_role: 'Kitchen Staff',
        cancel_reason: null
      })
    })
    .then(() => fetchData())
    .catch(err => console.error("Error updating status:", err));
  };

  return (
    <div style={{ background: '#0f172a', color: 'white', padding: '25px', borderRadius: '12px' }}>
      <h2>👨‍🍳 จอห้องครัว (Kitchen Display System - KDS)</h2>
      
      <div style={{ background: '#1e293b', padding: '15px', borderRadius: '8px', marginBottom: '20px', borderLeft: '4px solid #0284c7' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#38bdf8' }}>📊 ยอดรวมวัตถุดิบที่ต้องทำตอนนี้:</h4>
        {summary.length === 0 ? <span style={{ color: '#94a3b8' }}>ไม่มีรายการค้างปรุง</span> : summary.map((s, i) => (
          <span key={i} style={{ background: '#0284c7', padding: '6px 12px', borderRadius: '20px', marginRight: '10px', fontSize: '14px', fontWeight: 'bold' }}>
            {s.ProductName}: {s.TotalQty} จาน
          </span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '15px' }}>
        {orders.length === 0 && <p style={{ color: '#94a3b8' }}>ยังไม่มีออเดอร์เข้ามา...</p>}
        {orders.map(o => (
          <div key={o.OrderID} style={{ background: '#1e293b', padding: '15px', borderRadius: '8px', borderTop: o.Status === 'Cooking' ? '4px solid #eab308' : '4px solid #3b82f6' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#f8fafc' }}>คิว: {o.QueueNo}</h3>
            <ul style={{ paddingLeft: '20px', margin: '0 0 15px 0' }}>
              {o.items.map((item, idx) => (
                <li key={idx}>
                  {item.ProductName} <b>x{item.Qty}</b> 
                  {item.ItemNote && <span style={{ color: '#fbbf24' }}> ({item.ItemNote})</span>}
                </li>
              ))}
            </ul>
            {o.Status === 'Pending' ? (
              <button onClick={() => updateStatus(o.OrderID, 'Cooking')} style={{ width: '100%', padding: '10px', background: '#eab308', color: 'black', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>🍳 เริ่มปรุง</button>
            ) : (
              <button onClick={() => updateStatus(o.OrderID, 'Ready')} style={{ width: '100%', padding: '10px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>✅ ปรุงเสร็จแล้ว</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}