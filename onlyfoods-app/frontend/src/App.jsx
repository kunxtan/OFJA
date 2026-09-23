import { useEffect, useState } from 'react';
import AccountantView from './components/AccountantView';
import CounterView from './components/CounterView';
import CustomerView from './components/CustomerView';
import ExecutiveView from './components/ExecutiveView';
import KitchenView from './components/KitchenView';
import OwnerView from './components/OwnerView';

const PALETTE = {
  coral: '#FF724C',
  yellow: '#FDBF50',
  white: '#FFFFFF',
  dark: '#2A2C41',
  darkLight: '#373A56',
  grayBg: '#F5F6FA',
  textSub: '#7E84A3',
  border: '#EBEBF0'
};

const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [foodCourtOpen, setFoodCourtOpen] = useState(true);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '', profile_img: '' });

  const [authTab, setAuthTab] = useState('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '', name: '', phone: '' });
  const [authError, setAuthError] = useState('');

  const API_BASE = "http://localhost:8000";

  useEffect(() => {
    fetchFoodCourtStatus();
    fetchStores();
    fetchProducts();

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse
        });
      }
    };
    document.body.appendChild(script);
  }, []);

  const fetchFoodCourtStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/food-court/status`);
      if (res.ok) {
        const data = await res.json();
        setFoodCourtOpen(data.is_open ?? true);
      }
    } catch (err) { console.error(err); }
  };

  const fetchStores = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stores`);
      if (res.ok) setStores(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/products`);
      if (res.ok) setProducts(await res.json());
    } catch (err) { console.error(err); }
  };

  const mapRole = (role) => {
    let roleMap = { 'Kitchen Staff': 'Kitchen', 'Front Staff': 'Front', 'Shop Owner': 'Owner' };
    return roleMap[role] || role || 'Customer';
  };

  const handleGoogleResponse = async (response) => {
    try {
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      
      const res = await fetch(`${API_BASE}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_id: payload.sub,
          email: payload.email,
          name: payload.name
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);

      const user = data.user;
      const finalRole = mapRole(user.Role);

      setCurrentUser({
        UserId: user.UserId, id: user.UserId,
        username: user.Username,
        role: finalRole,
        FullName: user.FullName, name: user.FullName || user.Username,
        Phone: user.Phone,
        Points: user.Points || 0
      });

      if (data.is_profile_incomplete) {
        setProfileForm({ full_name: user.FullName || payload.name || '', phone: '', profile_img: payload.picture || '' });
        setShowProfileModal(true);
      }
    } catch (err) {
      alert(`Google Auth Error: ${err.message}`);
    }
  };

  const triggerGoogleConnect = () => {
    if (window.google) {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          alert("กรุณาอนุญาต Pop-up บนเบราว์เซอร์เพื่อเชื่อมต่อ Google");
        }
      });
    } else {
      alert("ระบบ Google Auth กำลังโหลด กรุณาลองใหม่อีกครั้ง");
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');

    const endpoint = authTab === 'login' ? '/api/login' : '/api/register';
    const bodyData = authTab === 'login' 
      ? { username: authForm.username, password: authForm.password }
      : { username: authForm.username, password: authForm.password, name: authForm.name, phone: authForm.phone };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);

      const finalRole = mapRole(data.Role);

      setCurrentUser({
        UserId: data.UserId, id: data.UserId,
        username: data.Username,
        role: finalRole,
        FullName: data.FullName, name: data.FullName || data.Username,
        Phone: data.Phone,
        storeId: data.StoreId,
        Points: data.Points || 0
      });
      setAuthForm({ username: '', password: '', name: '', phone: '' });
    } catch (err) {
      setAuthError(err.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/users/complete-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.UserId,
          full_name: profileForm.full_name,
          phone: profileForm.phone,
          profile_img: profileForm.profile_img
        })
      });
      const updatedUser = await res.json();
      if (!res.ok) throw new Error("บันทึกข้อมูลไม่สำเร็จ");

      setCurrentUser(prev => ({
        ...prev,
        FullName: updatedUser.FullName,
        name: updatedUser.FullName,
        Phone: updatedUser.Phone,
        ProfileImage: updatedUser.ProfileImg
      }));
      setShowProfileModal(false);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', margin: 0, padding: 0 }}>
      <style>{`
        * { box-sizing: border-box; }
        html, body, #root {
          width: 100% !important;
          min-height: 100vh !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow-x: hidden;
          background-color: ${currentUser ? PALETTE.grayBg : PALETTE.dark} !important;
        }

        .auth-container-wrapper {
          font-family: 'Prompt', sans-serif;
          background-color: ${PALETTE.dark};
          width: 100%;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          box-sizing: border-box;
          color: ${PALETTE.white};
        }

        .auth-card-container {
          background-color: ${PALETTE.white};
          border-radius: 28px;
          width: 100%;
          max-width: 900px;
          display: flex;
          flex-direction: row;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.45);
          color: ${PALETTE.dark};
          transition: all 0.3s ease;
        }

        .auth-form-side {
          flex: 1.2;
          padding: 44px 40px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: center;
          width: 100%;
        }

        .auth-banner-side {
          flex: 0.8;
          background: linear-gradient(135deg, ${PALETTE.coral} 0%, #E85A33 100%);
          color: ${PALETTE.white};
          padding: 40px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          width: 100%;
        }

        .auth-input-field {
          width: 100%;
          padding: 14px 18px 14px 46px;
          border-radius: 30px;
          border: 1px solid ${PALETTE.border};
          background: ${PALETTE.grayBg};
          box-sizing: border-box;
          outline: none;
          font-size: 14px;
          color: ${PALETTE.dark};
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .auth-input-field:focus {
          border-color: ${PALETTE.coral};
          box-shadow: 0 0 0 3px ${PALETTE.coral}22;
        }

        @media (max-width: 768px) {
          .auth-container-wrapper { padding: 0 !important; }
          .auth-card-container { flex-direction: column-reverse; max-width: 100% !important; border-radius: 0 !important; box-shadow: none !important; min-height: 100vh; }
          .auth-form-side { padding: 28px 24px; justify-content: flex-start; }
          .auth-banner-side { padding: 32px 24px; }
        }
      `}</style>

      {!currentUser ? (
        <div className="auth-container-wrapper">
          <div className="auth-card-container">
            <div className="auth-form-side">
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ margin: '0 0 4px 0', fontSize: '28px', fontWeight: 800, color: PALETTE.dark }}>
                  {authTab === 'login' ? 'Hello!' : 'Hello, friend!'}
                </h2>
                <p style={{ margin: 0, color: PALETTE.textSub, fontSize: '14px' }}>
                  {authTab === 'login' ? 'Sign in to your account' : 'Create your account to get started'}
                </p>
              </div>

              {authError && (
                <div style={{ background: '#FFF0ED', color: PALETTE.coral, padding: '12px 16px', borderRadius: '18px', fontSize: '13px', marginBottom: '18px', fontWeight: 600, border: `1px solid ${PALETTE.coral}33` }}>
                  {authError}
                </div>
              )}

              <form onSubmit={handleAuthSubmit}>
                {authTab === 'register' && (
                  <>
                    <div style={{ position: 'relative', marginBottom: '14px' }}>
                      <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: PALETTE.coral }}></span>
                      <input type="text" required placeholder="Full Name (ชื่อ-นามสกุล)" className="auth-input-field" value={authForm.name} onChange={e => setAuthForm({ ...authForm, name: e.target.value })} />
                    </div>

                    <div style={{ position: 'relative', marginBottom: '14px' }}>
                      <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: PALETTE.coral }}></span>
                      <input type="tel" required placeholder="Phone Number (เบอร์โทรศัพท์)" className="auth-input-field" value={authForm.phone} onChange={e => setAuthForm({ ...authForm, phone: e.target.value })} />
                    </div>
                  </>
                )}

                <div style={{ position: 'relative', marginBottom: '14px' }}>
                  <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: PALETTE.coral }}></span>
                  <input type="text" required placeholder="E-mail / Username" className="auth-input-field" value={authForm.username} onChange={e => setAuthForm({ ...authForm, username: e.target.value })} />
                </div>

                <div style={{ position: 'relative', marginBottom: '20px' }}>
                  <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: PALETTE.coral }}></span>
                  <input type="password" required placeholder="Password" className="auth-input-field" value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} />
                </div>

                <button type="submit" style={{ width: '100%', background: `linear-gradient(135deg, ${PALETTE.coral} 0%, #E85A33 100%)`, color: PALETTE.white, border: 'none', padding: '14px', borderRadius: '30px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', boxShadow: `0 8px 20px ${PALETTE.coral}44`, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  {authTab === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: '18px', fontSize: '13px', color: PALETTE.textSub }}>
                {authTab === 'login' ? "Don't have an account? " : "Already have an account? "}
                <span onClick={() => { setAuthTab(authTab === 'login' ? 'register' : 'login'); setAuthError(''); }} style={{ color: PALETTE.coral, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                  {authTab === 'login' ? 'Create' : 'Sign in'}
                </span>
              </div>

              <div style={{ position: 'relative', textAlign: 'center', margin: '20px 0 16px 0' }}>
                <hr style={{ border: 'none', borderTop: `1px solid ${PALETTE.border}` }} />
                <span style={{ position: 'absolute', top: '-9px', left: '50%', transform: 'translateX(-50%)', background: PALETTE.white, padding: '0 12px', fontSize: '11px', color: PALETTE.textSub, fontWeight: 600 }}>OR CONNECT WITH</span>
              </div>

              <button onClick={triggerGoogleConnect} style={{ width: '100%', backgroundColor: PALETTE.white, color: PALETTE.dark, border: `2px solid ${PALETTE.border}`, padding: '11px 16px', borderRadius: '30px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                {authTab === 'login' ? 'Sign in with Gmail' : 'Sign up with Gmail'}
              </button>
            </div>

            <div className="auth-banner-side">
              <div style={{ width: 56, height: 56, borderRadius: '18px', background: 'rgba(255, 255, 255, 0.2)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', fontSize: '28px', marginBottom: '16px' }}>🍽️</div>
              <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 800 }}>{authTab === 'login' ? 'Welcome Back!' : 'Glad to see you!'}</h2>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', lineHeight: '1.5', opacity: 0.9, maxWidth: '260px' }}>OnlyFoods KMITL ระบบสั่งอาหารออนไลน์ </p>
              <span style={{ fontSize: '11px', fontWeight: 700, color: foodCourtOpen ? PALETTE.dark : PALETTE.white, background: foodCourtOpen ? PALETTE.yellow : 'rgba(0,0,0,0.3)', padding: '6px 16px', borderRadius: '20px', display: 'inline-block' }}>{foodCourtOpen ? '● ศูนย์อาหารเปิดให้บริการ' : '● ปิดให้บริการชั่วคราว'}</span>
              
              <div style={{ marginTop: '20px', padding: '10px 14px', background: 'rgba(0, 0, 0, 0.15)', borderRadius: '14px', fontSize: '11px', textAlign: 'left', width: '100%', maxWidth: '260px' }}>
                <div style={{ fontWeight: 700, color: PALETTE.yellow, marginBottom: '2px' }}> Test Staff Accounts (Pass = Username)</div>
                <div>• หน้าร้าน: <code>staff01</code> | ครัว: <code>kitchen01</code></div>
                <div>• เจ้าของร้าน: <code>owner01</code> | ผู้บริหาร: <code>exec01</code></div>
                <div>• ลูกค้าทั่วไป: สมัครใหม่ หรือใช้ Gmail</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ width: '100%', minHeight: '100vh', background: PALETTE.grayBg, padding: 0, margin: 0 }}>
          {currentUser.role === 'Customer' && <CustomerView user={currentUser} apiBase={API_BASE} stores={stores} products={products} onLogout={() => setCurrentUser(null)} />}
          {currentUser.role === 'Kitchen' && <KitchenView user={currentUser} apiBase={API_BASE} onLogout={() => setCurrentUser(null)} />}
          {currentUser.role === 'Front' && <CounterView user={currentUser} apiBase={API_BASE} stores={stores} onLogout={() => setCurrentUser(null)} />}
          {currentUser.role === 'Owner' && <OwnerView user={currentUser} apiBase={API_BASE} onLogout={() => setCurrentUser(null)} />}
          {currentUser.role === 'Accountant' && <AccountantView user={currentUser} apiBase={API_BASE} onLogout={() => setCurrentUser(null)} />}
          {currentUser.role === 'Executive' && <ExecutiveView user={currentUser} apiBase={API_BASE} onLogout={() => setCurrentUser(null)} />}
        </div>
      )}

      {showProfileModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(42, 44, 65, 0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div style={{ backgroundColor: PALETTE.white, padding: '28px', borderRadius: '24px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 50px rgba(0,0,0,0.4)', color: PALETTE.dark, boxSizing: 'border-box' }}>
            <h3 style={{ marginTop: 0, marginBottom: '6px', fontSize: '18px', fontWeight: 800 }}> ยินดีต้อนรับเข้าสู่ระบบ!</h3>
            <p style={{ fontSize: '12px', color: PALETTE.textSub, marginTop: 0, marginBottom: '16px' }}>กรุณากรอกเบอร์โทรศัพท์เพื่อเสร็จสิ้นการเปิดบัญชี</p>
            <form onSubmit={handleSaveProfile}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>ชื่อ-นามสกุล</label>
                <input type="text" required value={profileForm.full_name} onChange={e => setProfileForm({ ...profileForm, full_name: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: '20px', border: `1px solid ${PALETTE.border}`, background: PALETTE.grayBg, boxSizing: 'border-box', outline: 'none', fontSize: '13px' }} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>เบอร์โทรศัพท์</label>
                <input type="tel" required placeholder="08X-XXX-XXXX" value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} style={{ width: '100%', padding: '10px 14px', borderRadius: '20px', border: `1px solid ${PALETTE.border}`, background: PALETTE.grayBg, boxSizing: 'border-box', outline: 'none', fontSize: '13px' }} />
              </div>
              <button type="submit" style={{ width: '100%', background: PALETTE.coral, color: PALETTE.white, border: 'none', padding: '12px', borderRadius: '30px', fontWeight: 700, cursor: 'pointer', fontSize: '14px', marginTop: '8px', boxShadow: `0 6px 16px ${PALETTE.coral}44` }}>
                บันทึกและเริ่มใช้งานทันที
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}