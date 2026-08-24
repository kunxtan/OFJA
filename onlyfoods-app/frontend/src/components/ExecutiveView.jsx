import React, { useState, useEffect } from 'react';

export default function ExecutiveView({ apiBase }) {
  const [dash, setDash] = useState([]);

  // ตั้งเวลาดึงข้อมูลใหม่ทุก 4 วินาที
  useEffect(() => { 
    fetchData(); 
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [apiBase]);

  const fetchData = () => {
    fetch(`${apiBase}/api/reports/dashboard`).then(r => r.json()).then(setDash);
  };

  const suspendStore = (id) => {
    fetch(`${apiBase}/api/stores/${id}/suspend`, { method: 'PUT' }).then(fetchData);
  };

  const grandTotal = dash.reduce((acc, curr) => acc + Number(curr.net_sales), 0);

  return (
    <div>
      <h2> แดชบอร์ดผู้บริหาร (Executive Overview)</h2>
      <div style={{ background: '#0f172a', color: 'white', padding: '25px', borderRadius: '12px', marginBottom: '20px' }}>
        <p style={{ margin: 0, color: '#94a3b8' }}>ยอดขายรวมสุทธิทั้งศูนย์อาหาร</p>
        <h1 style={{ margin: '10px 0 0 0', color: '#4ade80', fontSize: '36px' }}>{grandTotal.toLocaleString()} บาท</h1>
      </div>

      <div style={{ background: 'white', padding: '20px', borderRadius: '10px' }}>
        <h3> การควบคุมสิทธิ์และสถานะร้านค้าภายในศูนย์</h3>
        <table border="0" cellPadding="12" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}><th>ร้านค้า</th><th>สถานะสิทธิ์</th><th>ยอดขายสุทธิ</th><th>การควบคุมสิทธิ์</th></tr></thead>
          <tbody>
            {dash.map(s => (
              <tr key={s.StoreId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td><b>{s.StoreName}</b></td>
                <td>
                  {s.IsSuspended ? (
                    <span style={{ color: 'red', fontWeight: 'bold' }}>🛑 ถูกระงับสิทธิ์</span>
                  ) : (
                    <span style={{ color: 'green', fontWeight: 'bold' }}>✅ ปกติ</span>
                  )}
                </td>
                <td>{s.net_sales} บาท</td>
                <td>
                  <button onClick={() => suspendStore(s.StoreId)} style={{ padding: '6px 14px', background: s.IsSuspended ? '#22c55e' : '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    {s.IsSuspended ? 'ปลดระงับสิทธิ์ร้าน' : 'ระงับสิทธิ์การขาย'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}