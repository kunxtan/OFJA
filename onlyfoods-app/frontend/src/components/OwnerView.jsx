import React, { useState, useEffect } from 'react';

export default function OwnerView({ user, apiBase }) {
  const [dash, setDash] = useState({});
  const [cancels, setCancels] = useState([]);
  const [products, setProducts] = useState([]);

  useEffect(() => { 
    fetchData(); 
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [user, apiBase]);

  const fetchData = () => {
    fetch(`${apiBase}/api/reports/dashboard?store_id=${user.storeId}`).then(r => r.json()).then(d => setDash(d[0] || {}));
    fetch(`${apiBase}/api/reports/cancellations?store_id=${user.storeId}`).then(r => r.json()).then(setCancels);
    fetch(`${apiBase}/api/products?store_id=${user.storeId}`).then(r => r.json()).then(setProducts);
  };

  const toggleStore = () => {
    fetch(`${apiBase}/api/stores/${user.storeId}/toggle`, { method: 'PUT' }).then(fetchData);
  };

  const toggleStock = (id) => {
    fetch(`${apiBase}/api/products/${id}/toggle-stock`, { method: 'PUT' }).then(fetchData);
  };

  return (
    <div>
      <h2> แดชบอร์ดเจ้าของร้าน (Shop Owner)</h2>
      <div style={{ background: 'white', padding: '20px', borderRadius: '10px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>ร้าน: {dash.StoreName}</h3>
          <p style={{ margin: '5px 0' }}>สถานะร้าน: <b style={{ color: dash.IsOpen ? 'green' : 'red' }}>{dash.IsOpen ? '🟢 เปิดให้บริการ' : '🔴 ปิดร้าน'}</b></p>
        </div>
        <button onClick={toggleStore} style={{ padding: '10px 18px', background: dash.IsOpen ? '#ef4444' : '#22c55e', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
          {dash.IsOpen ? ' ปิดร้านชั่วคราว' : ' เปิดร้านค้า'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div style={{ background: 'white', padding: '20px', borderRadius: '10px' }}>
          <h4> สรุปยอดขายร้านตนเอง</h4>
          <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669', margin: '10px 0' }}>{dash.net_sales || 0} บาท</p>
          <p style={{ margin: 0, color: '#64748b' }}>ออเดอร์ที่สำเร็จแล้ว: {dash.total_orders || 0} รายการ</p>
        </div>

        <div style={{ background: 'white', padding: '20px', borderRadius: '10px' }}>
          <h4>จัดการสต็อกสินค้า (เปิด/ปิด เมนูหมด)</h4>
          {products.map(p => (
            <div key={p.ProductId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
              <span>{p.ProductName}</span>
              <button onClick={() => toggleStock(p.ProductId)} style={{ padding: '2px 8px', background: p.IsOutOfStock ? '#ef4444' : '#22c55e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {p.IsOutOfStock ? 'สินค้าหมด' : 'มีสินค้า'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'white', padding: '20px', borderRadius: '10px' }}>
        <h4 style={{ color: '#dc2626' }}>🛑 ประวัติการยกเลิกออเดอร์ของร้าน</h4>
        <table border="0" cellPadding="10" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#fee2e2', textAlign: 'left' }}><th>คิว</th><th>ยอดเงิน</th><th>เหตุผลที่ยกเลิก</th></tr></thead>
          <tbody>
            {cancels.map(c => (
              <tr key={c.OrderID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td><b>{c.QueueNo}</b></td>
                <td>{c.TotalAmount}B</td>
                <td>{c.CancelReason || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
