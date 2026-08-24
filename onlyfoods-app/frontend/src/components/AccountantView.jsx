import React, { useState, useEffect } from 'react';

export default function AccountantView({ apiBase }) {
  const [dash, setDash] = useState([]);
  const [logs, setLogs] = useState([]);

  // 1. นำคำสั่ง fetch ออกมาจัดเป็นฟังก์ชัน
  const fetchData = () => {
    fetch(`${apiBase}/api/reports/dashboard`).then(r => r.json()).then(setDash);
    fetch(`${apiBase}/api/audit-logs`).then(r => r.json()).then(setLogs);
  };

  // 2. ใช้ setInterval เรียก fetchData ทุก 4 วินาที
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [apiBase]);

  return (
    <div>
      <h2>📊 แดชบอร์ดฝ่ายบัญชี (Accountant Audit)</h2>
      <div style={{ background: 'white', padding: '20px', borderRadius: '10px', marginBottom: '20px' }}>
        <h3>💵 ยอดขายและจำนวนออเดอร์ แยกตามรายร้านค้า</h3>
        <table border="0" cellPadding="12" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}><th>รหัสร้าน</th><th>ชื่อร้านค้า</th><th>จำนวนออเดอร์สำเร็จ</th><th>ยอดขายสุทธิ</th></tr></thead>
          <tbody>
            {dash.map(d => (
              <tr key={d.StoreId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td>#{d.StoreId}</td>
                <td><b>{d.StoreName}</b></td>
                <td>{d.total_orders} ออเดอร์</td>
                <td><b style={{ color: '#059669' }}>{d.net_sales} บาท</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ background: 'white', padding: '20px', borderRadius: '10px' }}>
        <h3>📋 ประวัติการทำรายการในระบบ (Audit Log Audit)</h3>
        <table border="0" cellPadding="8" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead><tr style={{ background: '#e2e8f0', textAlign: 'left' }}><th>เวลา</th><th>การกระทำ</th><th>ผู้ทำรายการ</th><th>รายละเอียดเพิ่มเติม</th></tr></thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.LogID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td>{l.CreatedAt}</td>
                <td><b>{l.Action}</b></td>
                <td>{l.PerformedBy}</td>
                <td>{l.Details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}