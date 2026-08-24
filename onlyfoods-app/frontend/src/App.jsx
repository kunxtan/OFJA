import React, { useState, useEffect } from 'react';
import KitchenView from './components/KitchenView';
import CustomerView from './components/CustomerView';
import CounterView from './components/CounterView';
import OwnerView from './components/OwnerView';
import AccountantView from './components/AccountantView';
import ExecutiveView from './components/ExecutiveView';

// ==========================================
// MOCK DATABASE & INITIAL STATES
// ==========================================
const INITIAL_STORES = [
  { id: 1, name: 'ร้านกะเพราถาด KMITL', category: 'อาหารตามสั่ง', status: 'Open', rating: 5.0, totalSales: 15400, ownerUsername: 'owner01', isSuspended: false },
  { id: 2, name: 'ร้านก๋วยเตี๋ยวเรือรสเด็ด', category: 'ก๋วยเตี๋ยว', status: 'Open', rating: 5.0, totalSales: 12100, ownerUsername: 'owner02', isSuspended: false },
  { id: 3, name: 'ร้านชาดี ชาไทย', category: 'เครื่องดื่ม', status: 'Open', rating: 5.0, totalSales: 8900, ownerUsername: 'owner03', isSuspended: false }
];

const INITIAL_PRODUCTS = [
  { id: 101, storeId: 1, name: 'ข้าวผัดกะเพราหมูกรอบ', price: 50, isOutOfStock: false, img: '' },
  { id: 102, storeId: 1, name: 'ข้าวผัดพริกแกงไก่ + ไข่ดาว', price: 55, isOutOfStock: false, img: '' },
  { id: 201, storeId: 2, name: 'ก๋วยเตี๋ยวเรือน้ำตกเนื้อเปื่อย', price: 50, isOutOfStock: false, img: '' },
  { id: 301, storeId: 3, name: 'ชาไทยเย็นเข้มข้น', price: 30, isOutOfStock: false, img: '' }
];

const INITIAL_USERS = [
  { id: 1, username: 'uefa01', password: '123', role: 'Customer', name: 'คุณยูฟ่า (ลูกค้า)' },
  { id: 2, username: 'kitchen01', password: '123', role: 'Kitchen', name: 'เชฟสมศักดิ์ (ครัว)', storeId: 1 },
  { id: 3, username: 'front01', password: '123', role: 'Front', name: 'ผู้จัดการฟร้อนท์ 01', storeId: 1 },
  { id: 4, username: 'owner01', password: '123', role: 'Owner', name: 'เจ้าของร้านกะเพราถาด', storeId: 1 },
  { id: 5, username: 'acc01', password: '123', role: 'Accountant', name: 'เจ้าหน้าที่บัญชี' },
  { id: 6, username: 'exec01', password: '123', role: 'Executive', name: 'ผู้บริหารศูนย์อาหาร' }
];

export default function App() {
  // Global States
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState(INITIAL_USERS);
  const [stores, setStores] = useState(INITIAL_STORES);
  const [products, setProducts] = useState(INITIAL_PRODUCTS);
  const [orders, setOrders] = useState([]);
  const [cancellationLogs, setCancellationLogs] = useState([]);
  const [foodCourtOpen, setFoodCourtOpen] = useState(true);
  const [announcement, setAnnouncement] = useState('');
  const [pushNotifications, setPushNotifications] = useState([]);

  // Auth Form State
  const [authTab, setAuthTab] = useState('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '', role: 'Customer', name: '' });
  const [authError, setAuthError] = useState('');

  // Handle Login & Register
  // Handle Login & Register (อัปเกรดต่อเชื่อมกับ Database จริง)
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    const apiBase = "http://localhost:8000";

    if (authTab === 'login') {
      try {
        const res = await fetch(`${apiBase}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: authForm.username, password: authForm.password })
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.detail);
        
        // แปลงชื่อ Role จาก DB ให้ตรงกับที่ Frontend เขียนไว้
        let roleMap = { 'Kitchen Staff': 'Kitchen', 'Front Staff': 'Front', 'Shop Owner': 'Owner' };
        let finalRole = roleMap[data.Role] || data.Role;

        setCurrentUser({ 
          UserId: data.UserId, id: data.UserId, 
          username: data.Username, 
          role: finalRole, 
          FullName: data.FullName, name: data.FullName, 
          storeId: data.StoreId, 
          Points: data.Points 
        });
        setAuthForm({ username: '', password: '', role: 'Customer', name: '' });
      } catch (err) {
        setAuthError(err.message || 'เชื่อมต่อระบบล้มเหลว');
      }
    } else {
      // โหมดสมัครสมาชิก
      try {
        const res = await fetch(`${apiBase}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: authForm.username, password: authForm.password, name: authForm.name })
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.detail);
        
        alert('ลงทะเบียนสำเร็จ!');
        setCurrentUser({ 
          UserId: data.UserId, id: data.UserId, 
          username: data.Username, 
          role: 'Customer', 
          FullName: data.FullName, name: data.FullName, 
          Points: data.Points 
        });
      } catch (err) {
        setAuthError(err.message || 'สมัครสมาชิกไม่สำเร็จ');
      }
    }
  };

  const addNotification = (userId, message) => {
    setPushNotifications(prev => [{ id: Date.now(), userId, message, time: new Date().toLocaleTimeString() }, ...prev]);
  };

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '1000px', margin: '0 auto', padding: '15px', background: '#f4f6f9', minHeight: '100vh' }}>
      {/* Central Announcement Banner */}
      {announcement && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffeeba', color: '#856404', padding: '10px 15px', borderRadius: '6px', marginBottom: '15px', fontWeight: 'bold' }}>
          📢 ประกาศจากศูนย์อาหาร: {announcement}
        </div>
      )}

      {/* Main Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '15px 20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#007bff' }}>🍽️ Only Foods KMITL System</h2>
          <small style={{ color: foodCourtOpen ? 'green' : 'red', fontWeight: 'bold' }}>
            สถานะศูนย์อาหาร: {foodCourtOpen ? '🟢 เปิดให้บริการ' : '🔴 ปิดให้บริการชั่วคราว'}
          </small>
        </div>
        {currentUser && (
          <div style={{ textAlign: 'right' }}>
            <span style={{ marginRight: '10px' }}>👤 {currentUser.name} (<strong>{currentUser.role}</strong>)</span>
            <button onClick={() => setCurrentUser(null)} style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>ออกจากระบบ</button>
          </div>
        )}
      </header>

      {/* Auth Screen */}
      {!currentUser ? (
        <div style={{ background: '#fff', padding: '25px', borderRadius: '8px', maxWidth: '420px', margin: '40px auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', marginBottom: '20px', borderBottom: '2px solid #eee' }}>
            <button onClick={() => { setAuthTab('login'); setAuthError(''); }} style={{ flex: 1, padding: '10px', background: 'none', border: 'none', fontWeight: authTab === 'login' ? 'bold' : 'normal', borderBottom: authTab === 'login' ? '3px solid #007bff' : 'none', cursor: 'pointer' }}>เข้าสู่ระบบ</button>
            <button onClick={() => { setAuthTab('register'); setAuthError(''); }} style={{ flex: 1, padding: '10px', background: 'none', border: 'none', fontWeight: authTab === 'register' ? 'bold' : 'normal', borderBottom: authTab === 'register' ? '3px solid #007bff' : 'none', cursor: 'pointer' }}>ลงทะเบียนลูกค้าใหม่</button>
          </div>

          {authError && <div style={{ color: 'red', fontSize: '13px', marginBottom: '10px' }}>{authError}</div>}

          <form onSubmit={handleAuthSubmit}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold' }}>Username</label>
              <input type="text" required value={authForm.username} onChange={e => setAuthForm({ ...authForm, username: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold' }}>Password</label>
              <input type="password" required value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
            </div>

            {authTab === 'register' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold' }}>ชื่อ-นามสกุล</label>
                <input type="text" required value={authForm.name} onChange={e => setAuthForm({ ...authForm, name: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>
            )}

            <button type="submit" style={{ width: '100%', background: '#007bff', color: '#fff', border: 'none', padding: '10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>
              {authTab === 'login' ? ' เข้าสู่ระบบ' : ' ยืนยันการลงทะเบียน'}
            </button>
          </form>

          <div style={{ marginTop: '20px', padding: '10px', background: '#e9ecef', borderRadius: '4px', fontSize: '11px', color: '#333' }}>
            <strong> บัญชีสำหรับทดสอบบทบาทต่างๆ (Password: 123)</strong>
            <ul style={{ paddingLeft: '15px', margin: '5px 0 0 0' }}>
              <li>ลูกค้า: <code>uefa01</code></li>
              <li>ครัว: <code>kitchen01</code> | ฟร้อนท์: <code>front01</code></li>
              <li>เจ้าของร้าน: <code>owner01</code></li>
              <li>บัญชี: <code>acc01</code> | ผู้บริหาร: <code>exec01</code></li>
            </ul>
          </div>
        </div>
      ) : (
        /* Render Views according to Role */
        <div>
          {currentUser.role === 'Customer' && (
            <CustomerView user={currentUser} apiBase="http://localhost:8000" />
          )}
          {currentUser.role === 'Kitchen' && (
            <KitchenView user={currentUser} apiBase="http://localhost:8000" />
          )}
          {currentUser.role === 'Front' && (
            <CounterView user={currentUser} apiBase="http://localhost:8000" />
          )}
          {currentUser.role === 'Owner' && (
            <OwnerView user={currentUser} apiBase="http://localhost:8000" />
          )}
          {currentUser.role === 'Accountant' && (
            <AccountantView user={currentUser} apiBase="http://localhost:8000" />
          )}
          {currentUser.role === 'Executive' && (
            <ExecutiveView user={currentUser} apiBase="http://localhost:8000" />
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 1. CUSTOMER VIEW
// ==========================================


// ==========================================
// 2. KITCHEN STAFF VIEW
// ==========================================


// ==========================================
// 3. FRONT STAFF MANAGER VIEW
// ==========================================


// ==========================================
// 4. SHOP OWNER VIEW
// ==========================================


// ==========================================
// 5. ACCOUNTANT VIEW
// ==========================================


// ==========================================
// 6. EXECUTIVE VIEW (ปรับแก้ไขเพิ่มฟังก์ชันสร้างร้านและบัญชีพนักงาน)
// ==========================================


// ==========================================
// HELPER FUNCTIONS
// ==========================================
function getStatusLabel(status) {
  switch (status) {
    case 'Pending': return 'รับออเดอร์แล้ว (รอเข้าครัว)';
    case 'Cooking': return 'กำลังปรุงอาหาร';
    case 'Ready': return 'ปรุงเสร็จแล้ว (รอรับที่หน้าร้าน)';
    case 'Completed': return 'รับอาหารสำเร็จ';
    case 'Cancelled': return 'ยกเลิกออเดอร์';
    default: return status;
  }
}