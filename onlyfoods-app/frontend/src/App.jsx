import { useEffect, useState } from 'react';
import AccountantView from './components/AccountantView';
import CounterView from './components/CounterView';
import CustomerView from './components/CustomerView';
import ExecutiveView from './components/ExecutiveView';
import KitchenView from './components/KitchenView';
import OwnerView from './components/OwnerView';

// 🎨 Palettes: Orange & Clean White Theme
const PALETTE = {
  primary: '#FF6B00',
  primaryGradient: 'linear-gradient(135deg, #FF6B00 0%, #FF8800 100%)',
  bannerGradient: 'linear-gradient(145deg, #FF6B00 0%, #FF3E00 100%)',
  orangeGlow: 'rgba(255, 107, 0, 0.25)',
  primaryHover: '#E55F00',
  primarySoft: 'rgba(255, 107, 0, 0.08)',
  bgGradient: 'linear-gradient(135deg, #FFF9F5 0%, #FFF2EA 50%, #FFEBE0 100%)',
  slateText: '#1E293B',
  subText: '#64748B',
  border: '#E2E8F0',
  borderOrange: '#FFE3D1',
  white: '#FFFFFF',
  success: '#10B981',
  danger: '#EF4444'
};

const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [foodCourtOpen, setFoodCourtOpen] = useState(true);

  // Mouse spotlight coordinates
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '', profile_img: '' });
  const [focusedProfileField, setFocusedProfileField] = useState(null);

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotForm, setForgotForm] = useState({ username_or_phone: '', new_password: '' });
  const [forgotMsg, setForgotMsg] = useState({ type: '', text: '' });

  const [authTab, setAuthTab] = useState('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '', name: '', phone: '' });
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const API_BASE = "http://localhost:8080";

  useEffect(() => {
    fetchFoodCourtStatus();
    fetchStores();
    fetchProducts();

    // Auto Polling: ดึงสถานะเปิด-ปิดโรงอาหารจากฝั่ง Exec แบบ Realtime ทุกๆ 5 วินาที
    const statusInterval = setInterval(() => {
      fetchFoodCourtStatus();
    }, 5000);

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

    return () => clearInterval(statusInterval);
  }, []);

  const handleMouseMove = (e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

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
        Phone: user.Phone
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
        storeId: data.StoreId
      });
      setAuthForm({ username: '', password: '', name: '', phone: '' });
    } catch (err) {
      setAuthError(err.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setForgotMsg({ type: '', text: '' });
    try {
      const res = await fetch(`${API_BASE}/api/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forgotForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "ไม่สามารถเปลี่ยนรหัสผ่านได้");

      setForgotMsg({ type: 'success', text: 'เปลี่ยนรหัสผ่านสำเร็จ! กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่' });
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotForm({ username_or_phone: '', new_password: '' });
        setForgotMsg({ type: '', text: '' });
      }, 2000);
    } catch (err) {
      setForgotMsg({ type: 'error', text: err.message });
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
    <div style={{ width: '100vw', height: '100vh', height: '100dvh', overflow: 'hidden', margin: 0, padding: 0 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Prompt:wght@300;400;500;600;700;800&display=swap');

        * { box-sizing: border-box; }
        body { font-family: 'Prompt', 'Plus Jakarta Sans', sans-serif; }
        html, body, #root {
          width: 100vw !important;
          height: 100vh !important;
          height: 100dvh !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background-color: #FFF8F5 !important;
        }

        /* Clean Warm Orange & White Viewport */
        .orange-viewport {
          width: 100vw;
          height: 100vh;
          height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          background: ${PALETTE.bgGradient};
          padding: 24px;
          overflow: hidden;
        }

        /* Subtle Geometric Background Pattern */
        .orange-pattern {
          position: absolute;
          inset: 0;
          background-image: 
            radial-gradient(rgba(255, 107, 0, 0.08) 1.5px, transparent 1.5px);
          background-size: 32px 32px;
          pointer-events: none;
        }

        /* Ambient Glow Blobs */
        .ambient-glow-1 {
          position: absolute;
          top: -15%;
          right: -10%;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 107, 0, 0.15) 0%, rgba(255, 136, 0, 0.05) 50%, rgba(255,255,255,0) 70%);
          filter: blur(50px);
          pointer-events: none;
        }

        .ambient-glow-2 {
          position: absolute;
          bottom: -15%;
          left: -10%;
          width: 650px;
          height: 650px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 138, 0, 0.12) 0%, rgba(255, 107, 0, 0.03) 50%, rgba(255,255,255,0) 70%);
          filter: blur(60px);
          pointer-events: none;
        }

        /* Soft Interactive Mouse Spotlight */
        .mouse-spotlight {
          position: absolute;
          width: 550px;
          height: 550px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 107, 0, 0.12) 0%, rgba(255, 138, 0, 0.04) 50%, rgba(255,255,255,0) 70%);
          pointer-events: none;
          transform: translate(-50%, -50%);
          transition: left 0.1s ease-out, top 0.1s ease-out;
          z-index: 1;
        }

        /* Floating Orange Light Particles */
        .particle {
          position: absolute;
          border-radius: 50%;
          background: #FF8A00;
          box-shadow: 0 0 8px rgba(255, 138, 0, 0.6);
          opacity: 0.35;
          pointer-events: none;
          animation: floatParticle 8s infinite linear;
        }
        @keyframes floatParticle {
          0% { transform: translateY(0) scale(0.8); opacity: 0; }
          50% { opacity: 0.6; }
          100% { transform: translateY(-130px) scale(1.3); opacity: 0; }
        }

        /* Modern Crisp Card Wrapper */
        .card-glowing-wrapper {
          position: relative;
          width: 100%;
          max-width: 960px;
          height: 100%;
          max-height: 620px;
          border-radius: 28px;
          padding: 1px;
          background: linear-gradient(135deg, #FFFFFF 0%, #FFE8DB 100%);
          box-shadow: 0 20px 50px -12px rgba(255, 107, 0, 0.18), 0 10px 30px rgba(0, 0, 0, 0.04);
          z-index: 10;
        }

        /* Main Modern Clean Card */
        .modern-card {
          width: 100%;
          height: 100%;
          background: #FFFFFF;
          border-radius: 27px;
          display: flex;
          overflow: hidden;
          position: relative;
        }

        /* Form Side (Clean White) */
        .form-pane {
          flex: 1.15;
          padding: 40px 48px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow-y: auto;
          scrollbar-width: none;
          background: #FFFFFF;
        }
        .form-pane::-webkit-scrollbar { display: none; }

        /* Modern Tab Switcher with Orange Pill Indicator */
        .tab-switcher {
          display: flex;
          background: #FFF7ED;
          border: 1px solid ${PALETTE.borderOrange};
          padding: 4px;
          border-radius: 14px;
          margin-bottom: 22px;
          position: relative;
        }
        .tab-pill {
          position: absolute;
          top: 4px;
          bottom: 4px;
          width: calc(50% - 4px);
          background: ${PALETTE.primaryGradient};
          border-radius: 10px;
          box-shadow: 0 4px 14px rgba(255, 107, 0, 0.3);
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 1;
        }
        .tab-btn {
          flex: 1;
          padding: 10px 16px;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 13.5px;
          cursor: pointer;
          background: transparent;
          color: ${PALETTE.subText};
          z-index: 2;
          transition: color 0.25s ease;
        }
        .tab-btn.active {
          color: #FFFFFF;
          font-weight: 700;
        }

        /* Inputs with Orange Focus Ring */
        .input-group {
          position: relative;
          margin-bottom: 14px;
        }
        .input-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #94A3B8;
          transition: color 0.25s ease, transform 0.25s ease;
          pointer-events: none;
          display: flex;
        }
        .modern-input {
          width: 100%;
          padding: 12.5px 16px 12.5px 46px;
          border-radius: 14px;
          border: 1.5px solid ${PALETTE.border};
          background: #FAFAFA;
          outline: none;
          font-size: 13.5px;
          color: ${PALETTE.slateText};
          font-weight: 500;
          transition: all 0.25s ease;
        }
        .modern-input:focus {
          border-color: ${PALETTE.primary};
          background: #FFFFFF;
          box-shadow: 0 0 0 4px ${PALETTE.primarySoft}, 0 4px 14px rgba(255, 107, 0, 0.08);
          transform: translateY(-1px);
        }
        .modern-input:focus + .input-icon {
          color: ${PALETTE.primary};
          transform: translateY(-50%) scale(1.1);
        }

        /* Vibrant Orange Button with Shimmer */
        .btn-primary {
          width: 100%;
          background: ${PALETTE.primaryGradient};
          color: #FFFFFF;
          border: none;
          padding: 13.5px;
          border-radius: 14px;
          font-weight: 700;
          font-size: 14.5px;
          cursor: pointer;
          transition: all 0.25s ease;
          position: relative;
          overflow: hidden;
          box-shadow: 0 8px 20px rgba(255, 107, 0, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-primary::after {
          content: '';
          position: absolute;
          top: -50%;
          left: -60%;
          width: 40%;
          height: 200%;
          background: linear-gradient(60deg, transparent, rgba(255,255,255,0.4), transparent);
          transform: rotate(25deg);
          transition: all 0.6s ease;
        }
        .btn-primary:hover::after {
          left: 130%;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(255, 107, 0, 0.45);
        }
        .btn-primary:active {
          transform: translateY(0);
        }

        /* Google Modern Button */
        .btn-google {
          width: 100%;
          background: #FFFFFF;
          color: ${PALETTE.slateText};
          border: 1.5px solid ${PALETTE.border};
          padding: 11.5px 16px;
          border-radius: 14px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.2s ease;
        }
        .btn-google:hover {
          background: #FFF7ED;
          border-color: ${PALETTE.borderOrange};
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(255, 107, 0, 0.08);
        }

        /* Banner Pane - Bright Vibrant Orange Visuals */
        .banner-pane {
          flex: 0.88;
          background: ${PALETTE.bannerGradient};
          padding: 40px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          overflow: hidden;
        }

        /* Clean White & Soft Orange Halo Rings Animation */
        .halo-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.25);
          pointer-events: none;
          animation: ringPulse 4s infinite ease-in-out;
        }
        .ring-1 { width: 190px; height: 190px; animation-delay: 0s; box-shadow: 0 0 25px rgba(255, 255, 255, 0.1); }
        .ring-2 { width: 300px; height: 300px; animation-delay: 1.2s; border-color: rgba(255, 255, 255, 0.18); }
        .ring-3 { width: 410px; height: 410px; animation-delay: 2.4s; border-color: rgba(255, 255, 255, 0.1); }

        @keyframes ringPulse {
          0% { transform: translate(-50%, -50%) scale(0.92); opacity: 0.4; }
          50% { transform: translate(-50%, -50%) scale(1.05); opacity: 0.9; }
          100% { transform: translate(-50%, -50%) scale(0.92); opacity: 0.4; }
        }

        /* Pulsing Radar Dot */
        .radar-box {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 10px;
          height: 10px;
        }
        .radar-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .radar-wave {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          opacity: 0.75;
          animation: radarPing 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        @keyframes radarPing {
          75%, 100% { transform: scale(3); opacity: 0; }
        }

        /* Modal Zoom Animations */
        .modal-pop {
          animation: modalPopIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes modalPopIn {
          0% { opacity: 0; transform: scale(0.92) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }

        @media (max-width: 840px) {
          .orange-viewport { padding: 0; }
          .card-glowing-wrapper {
            max-width: 100%;
            max-height: 100%;
            border-radius: 0;
            padding: 0;
            box-shadow: none;
          }
          .modern-card {
            border-radius: 0;
            flex-direction: column-reverse;
          }
          .form-pane { padding: 28px 24px; }
          .banner-pane {
            flex: none;
            padding: 24px;
            min-height: 170px;
          }
        }
      `}</style>

      {!currentUser ? (
        <div className="orange-viewport" onMouseMove={handleMouseMove}>
          <div className="orange-pattern"></div>
          <div className="ambient-glow-1"></div>
          <div className="ambient-glow-2"></div>

          <div 
            className="mouse-spotlight" 
            style={{ left: `${mousePos.x}px`, top: `${mousePos.y}px` }}
          ></div>

          <div className="particle" style={{ width: 7, height: 7, left: '12%', top: '75%', animationDelay: '0s' }}></div>
          <div className="particle" style={{ width: 5, height: 5, left: '82%', top: '65%', animationDelay: '2.5s' }}></div>
          <div className="particle" style={{ width: 6, height: 6, left: '48%', top: '88%', animationDelay: '4.2s' }}></div>

          <div className="card-glowing-wrapper">
            <div className="modern-card">
              
              {/* Form Side */}
              <div className="form-pane">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <div style={{ 
                        width: 12, height: 12, borderRadius: '50%', 
                        background: PALETTE.primary, 
                        boxShadow: '0 0 10px rgba(255,107,0,0.6)' 
                      }}></div>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: PALETTE.slateText, letterSpacing: '1.2px' }}>
                        ONLYFOODS
                      </span>
                    </div>

                    {/* Badge แสดงสถานะการเปิด-ปิด โรงอาหาร */}
                    <div style={{
                      fontSize: '11px', fontWeight: 700,
                      color: foodCourtOpen ? '#059669' : '#DC2626',
                      background: foodCourtOpen ? '#ECFDF5' : '#FEF2F2',
                      padding: '4px 10px', borderRadius: '20px',
                      border: `1px solid ${foodCourtOpen ? '#A7F3D0' : '#FECACA'}`,
                      display: 'flex', alignItems: 'center', gap: '6px'
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: foodCourtOpen ? '#10B981' : '#EF4444' }}></span>
                      {foodCourtOpen ? 'เปิดให้บริการ' : 'ปิดให้บริการ'}
                    </div>
                  </div>

                  <h2 style={{ margin: '0 0 6px 0', fontSize: '25px', fontWeight: 800, color: PALETTE.slateText }}>
                    {authTab === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
                  </h2>
                  <p style={{ margin: '0 0 22px 0', color: PALETTE.subText, fontSize: '13px', lineHeight: 1.5 }}>
                    {authTab === 'login' ? 'ยินดีต้อนรับกลับ! เข้าสู่ระบบเพื่อเริ่มสั่งอาหาร' : 'สร้างบัญชีผู้ใช้ใหม่ เพื่อสั่งอาหารและใช้งานระบบ'}
                  </p>

                  <div className="tab-switcher">
                    <div 
                      className="tab-pill" 
                      style={{ transform: authTab === 'login' ? 'translateX(0)' : 'translateX(100%)' }}
                    ></div>
                    <button 
                      type="button" 
                      className={`tab-btn ${authTab === 'login' ? 'active' : ''}`}
                      onClick={() => { setAuthTab('login'); setAuthError(''); }}
                    >
                      เข้าสู่ระบบ
                    </button>
                    <button 
                      type="button" 
                      className={`tab-btn ${authTab === 'register' ? 'active' : ''}`}
                      onClick={() => { setAuthTab('register'); setAuthError(''); }}
                    >
                      สมัครสมาชิก
                    </button>
                  </div>

                  {authError && (
                    <div style={{ 
                      background: '#FEF2F2', color: PALETTE.danger, padding: '11px 14px', 
                      borderRadius: '12px', fontSize: '12.5px', marginBottom: '16px', fontWeight: 600, 
                      border: `1px solid ${PALETTE.danger}25`, display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                      <span>{authError}</span>
                    </div>
                  )}

                  <form onSubmit={handleAuthSubmit}>
                    {authTab === 'register' && (
                      <>
                        <div className="input-group">
                          <input 
                            type="text" 
                            required 
                            placeholder="ชื่อ-นามสกุล" 
                            className="modern-input" 
                            value={authForm.name} 
                            onChange={e => setAuthForm({ ...authForm, name: e.target.value })} 
                          />
                          <div className="input-icon">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                          </div>
                        </div>

                        <div className="input-group">
                          <input 
                            type="tel" 
                            required 
                            placeholder="เบอร์โทรศัพท์" 
                            className="modern-input" 
                            value={authForm.phone} 
                            onChange={e => setAuthForm({ ...authForm, phone: e.target.value })} 
                          />
                          <div className="input-icon">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="input-group">
                      <input 
                        type="text" 
                        required 
                        placeholder="ชื่อผู้ใช้ หรือ เบอร์โทรศัพท์" 
                        className="modern-input" 
                        value={authForm.username} 
                        onChange={e => setAuthForm({ ...authForm, username: e.target.value })} 
                      />
                      <div className="input-icon">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"></circle><path d="M16 12v1a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path></svg>
                      </div>
                    </div>

                    <div className="input-group" style={{ marginBottom: authTab === 'login' ? '8px' : '20px' }}>
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required 
                        placeholder="รหัสผ่าน" 
                        className="modern-input" 
                        style={{ paddingRight: '44px' }}
                        value={authForm.password} 
                        onChange={e => setAuthForm({ ...authForm, password: e.target.value })} 
                      />
                      <div className="input-icon">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', color: PALETTE.subText, cursor: 'pointer', padding: 0, display: 'flex'
                        }}
                      >
                        {showPassword ? (
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                        ) : (
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        )}
                      </button>
                    </div>

                    {authTab === 'login' && (
                      <div style={{ textAlign: 'right', marginBottom: '18px' }}>
                        <button
                          type="button"
                          onClick={() => { setShowForgotModal(true); setForgotMsg({ type: '', text: '' }); }}
                          style={{
                            background: 'none', border: 'none', color: PALETTE.primary,
                            fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0,
                            transition: 'opacity 0.2s'
                          }}
                        >
                          ลืมรหัสผ่าน?
                        </button>
                      </div>
                    )}

                    <button type="submit" className="btn-primary">
                      <span>{authTab === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชีผู้ใช้'}</span>
                    </button>
                  </form>

                  <div style={{ position: 'relative', textAlign: 'center', margin: '20px 0 16px 0' }}>
                    <hr style={{ border: 'none', borderTop: `1px solid ${PALETTE.border}` }} />
                    <span style={{ 
                      position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)', 
                      background: PALETTE.white, padding: '0 12px', fontSize: '11px', color: PALETTE.subText, fontWeight: 500
                    }}>
                      หรือเชื่อมต่อผ่าน
                    </span>
                  </div>

                  <button onClick={triggerGoogleConnect} className="btn-google">
                    <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                    <span>Google Account</span>
                  </button>
                </div>

                <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: PALETTE.subText }}>
                  OnlyFoods Platform © 2026
                </div>
              </div>

              {/* Banner Pane (Orange Gradient Side) */}
              <div className="banner-pane">
                <div className="halo-ring ring-1"></div>
                <div className="halo-ring ring-2"></div>
                <div className="halo-ring ring-3"></div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 5 }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '1.2px', opacity: 0.9 }}>
                    FOOD COURT SYSTEM
                  </span>

                  {/* Realtime Live Status Indicator */}
                  <div style={{
                    fontSize: '11.5px', fontWeight: 700, color: foodCourtOpen ? '#10B981' : '#EF4444',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: '#FFFFFF', padding: '6px 14px', borderRadius: '30px',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
                  }}>
                    <div className="radar-box">
                      <div className="radar-wave" style={{ background: foodCourtOpen ? '#10B981' : '#EF4444' }}></div>
                      <div className="radar-dot" style={{ background: foodCourtOpen ? '#10B981' : '#EF4444' }}></div>
                    </div>
                    {foodCourtOpen ? 'เปิดให้บริการ' : 'ปิดให้บริการ'}
                  </div>
                </div>

                <div style={{ textAlign: 'center', margin: 'auto 0', zIndex: 5 }}>
                  <div style={{
                    width: 82, height: 82, borderRadius: '28px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: '1.5px solid rgba(255, 255, 255, 0.4)',
                    display: 'grid', placeItems: 'center', color: '#FFFFFF',
                    margin: '0 auto 20px auto', boxShadow: '0 12px 30px rgba(0, 0, 0, 0.15)',
                    backdropFilter: 'blur(10px)'
                  }}>
                    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                  </div>

                  <h3 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.5px' }}>
                    OnlyFoods
                  </h3>
                  <p style={{ margin: '0 auto', color: 'rgba(255, 255, 255, 0.92)', fontSize: '13.5px', lineHeight: 1.6, maxWidth: '290px' }}>
                    ศูนย์รวมความอร่อย สั่งอาหารสะดวก รวดเร็ว จบในที่เดียว
                  </p>
                </div>

                <div style={{ textAlign: 'center', zIndex: 5 }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.8)', fontWeight: 500 }}>
                    ⚡ Real-time Order & Kitchen Sync Active
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>
      ) : (
        <div style={{ width: '100%', minHeight: '100vh', background: '#F8FAFC', padding: 0, margin: 0 }}>
          {currentUser.role === 'Customer' && <CustomerView user={currentUser} apiBase={API_BASE} stores={stores} products={products} foodCourtOpen={foodCourtOpen} onLogout={() => setCurrentUser(null)} />}
          {currentUser.role === 'Kitchen' && <KitchenView user={currentUser} apiBase={API_BASE} onLogout={() => setCurrentUser(null)} />}
          {currentUser.role === 'Front' && <CounterView user={currentUser} apiBase={API_BASE} stores={stores} onLogout={() => setCurrentUser(null)} />}
          {currentUser.role === 'Owner' && <OwnerView user={currentUser} apiBase={API_BASE} onLogout={() => setCurrentUser(null)} />}
          {currentUser.role === 'Accountant' && <AccountantView user={currentUser} apiBase={API_BASE} onLogout={() => setCurrentUser(null)} />}
          {currentUser.role === 'Executive' && <ExecutiveView user={currentUser} apiBase={API_BASE} onStatusChange={fetchFoodCourtStatus} onLogout={() => setCurrentUser(null)} />}
        </div>
      )}

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' 
        }}>
          <div className="modal-pop" style={{ 
            backgroundColor: PALETTE.white, padding: '32px 28px', borderRadius: '24px', 
            width: '100%', maxWidth: '360px', boxShadow: '0 20px 40px rgba(0,0,0,0.12)', 
            color: PALETTE.slateText, boxSizing: 'border-box', position: 'relative',
            border: `1.5px solid ${PALETTE.borderOrange}`
          }}>
            <button 
              onClick={() => setShowForgotModal(false)}
              style={{
                position: 'absolute', right: '18px', top: '18px', background: 'none', border: 'none',
                color: PALETTE.subText, cursor: 'pointer', fontSize: '18px', fontWeight: 700
              }}
            >
              ✕
            </button>

            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '19px', fontWeight: 800 }}>รีเซ็ตรหัสผ่าน</h3>
              <p style={{ fontSize: '12.5px', color: PALETTE.subText, margin: 0 }}>
                ระบุชื่อผู้ใช้หรือเบอร์โทรศัพท์ เพื่อเปลี่ยนรหัสผ่านใหม่
              </p>
            </div>

            {forgotMsg.text && (
              <div style={{ 
                background: forgotMsg.type === 'success' ? '#ECFDF5' : '#FEF2F2', 
                color: forgotMsg.type === 'success' ? PALETTE.success : PALETTE.danger, 
                padding: '10px 14px', borderRadius: '12px', fontSize: '12.5px', 
                marginBottom: '16px', fontWeight: 600, textAlign: 'center'
              }}>
                {forgotMsg.text}
              </div>
            )}

            <form onSubmit={handleResetPassword}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '6px', color: PALETTE.slateText }}>ชื่อผู้ใช้ หรือ เบอร์โทรศัพท์</label>
                <input 
                  type="text" 
                  required 
                  placeholder="ระบุ username หรือ เบอร์โทร"
                  value={forgotForm.username_or_phone} 
                  onChange={e => setForgotForm({ ...forgotForm, username_or_phone: e.target.value })} 
                  style={{ width: '100%', padding: '11px 14px', borderRadius: '12px', border: `1.5px solid ${PALETTE.border}`, background: '#FAFAFA', outline: 'none', fontSize: '13px', fontWeight: 500 }} 
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '6px', color: PALETTE.slateText }}>รหัสผ่านใหม่</label>
                <input 
                  type="password" 
                  required 
                  placeholder="ระบุรหัสผ่านใหม่" 
                  value={forgotForm.new_password} 
                  onChange={e => setForgotForm({ ...forgotForm, new_password: e.target.value })} 
                  style={{ width: '100%', padding: '11px 14px', borderRadius: '12px', border: `1.5px solid ${PALETTE.border}`, background: '#FAFAFA', outline: 'none', fontSize: '13px', fontWeight: 500 }} 
                />
              </div>

              <button type="submit" className="btn-primary">
                ยืนยันการเปลี่ยนรหัสผ่าน
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modern Minimal Complete Profile Modal */}
      {showProfileModal && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' 
        }}>
          <div className="modal-pop" style={{ 
            backgroundColor: PALETTE.white, 
            padding: '36px 32px', 
            borderRadius: '28px', 
            width: '100%', 
            maxWidth: '420px', 
            boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 1px 1px rgba(0, 0, 0, 0.03)', 
            color: PALETTE.slateText, 
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Top Accent Line */}
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, height: '5px',
              background: 'linear-gradient(90deg, #FF6B00 0%, #FF9E00 100%)'
            }} />

            {/* Header Section */}
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, #FFF4ED 0%, #FFEAD8 100%)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                boxShadow: '0 8px 16px -4px rgba(255, 107, 0, 0.15)'
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </div>

              <h3 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.4px' }}>
                ยืนยันข้อมูลสมาชิก
              </h3>
              <p style={{ fontSize: '13.5px', color: PALETTE.subText || '#64748B', margin: 0, lineHeight: '1.5' }}>
                กรอกข้อมูลส่วนตัวเพื่อเริ่มสั่งอาหารและใช้งานระบบ
              </p>
            </div>

            {/* Form Section */}
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Field 1: ชื่อ-นามสกุล */}
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '13px', 
                  fontWeight: 700, 
                  marginBottom: '8px', 
                  color: focusedProfileField === 'name' ? '#FF6B00' : (PALETTE.slateText || '#334155'),
                  transition: 'color 0.2s ease'
                }}>
                  ชื่อ-นามสกุล
                </label>
                
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    position: 'absolute',
                    left: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none',
                    transition: 'color 0.2s ease',
                    color: focusedProfileField === 'name' ? '#FF6B00' : '#94A3B8'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </span>

                  <input 
                    type="text"
                    required
                    placeholder="เช่น สมชาย ใจดี"
                    value={profileForm.full_name} 
                    onChange={e => setProfileForm({ ...profileForm, full_name: e.target.value })}
                    onFocus={() => setFocusedProfileField('name')}
                    onBlur={() => setFocusedProfileField(null)}
                    style={{ 
                      width: '100%', 
                      padding: '12px 40px 12px 42px', 
                      borderRadius: '14px', 
                      border: `1.5px solid ${focusedProfileField === 'name' ? '#FF6B00' : (PALETTE.border || '#E2E8F0')}`, 
                      backgroundColor: focusedProfileField === 'name' ? '#FFFFFF' : '#F8FAFC', 
                      fontSize: '14px',
                      color: '#0F172A',
                      outline: 'none',
                      boxSizing: 'border-box',
                      boxShadow: focusedProfileField === 'name' ? '0 0 0 4px rgba(255, 107, 0, 0.12)' : 'none',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  />

                  {profileForm.full_name?.trim().length >= 2 && (
                    <span style={{
                      position: 'absolute',
                      right: '14px',
                      color: '#10B981',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </span>
                  )}
                </div>
              </div>

              {/* Field 2: เบอร์โทรศัพท์ */}
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '13px', 
                  fontWeight: 700, 
                  marginBottom: '8px', 
                  color: focusedProfileField === 'phone' ? '#FF6B00' : (PALETTE.slateText || '#334155'),
                  transition: 'color 0.2s ease'
                }}>
                  เบอร์โทรศัพท์
                </label>
                
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    position: 'absolute',
                    left: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none',
                    transition: 'color 0.2s ease',
                    color: focusedProfileField === 'phone' ? '#FF6B00' : '#94A3B8'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                    </svg>
                  </span>

                  <input 
                    type="tel"
                    required
                    placeholder="08X-XXX-XXXX"
                    value={profileForm.phone} 
                    onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                    onFocus={() => setFocusedProfileField('phone')}
                    onBlur={() => setFocusedProfileField(null)}
                    style={{ 
                      width: '100%', 
                      padding: '12px 40px 12px 42px', 
                      borderRadius: '14px', 
                      border: `1.5px solid ${focusedProfileField === 'phone' ? '#FF6B00' : (PALETTE.border || '#E2E8F0')}`, 
                      backgroundColor: focusedProfileField === 'phone' ? '#FFFFFF' : '#F8FAFC', 
                      fontSize: '14px',
                      color: '#0F172A',
                      outline: 'none',
                      boxSizing: 'border-box',
                      boxShadow: focusedProfileField === 'phone' ? '0 0 0 4px rgba(255, 107, 0, 0.12)' : 'none',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  />

                  {profileForm.phone?.trim().length >= 9 && (
                    <span style={{
                      position: 'absolute',
                      right: '14px',
                      color: '#10B981',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </span>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <button 
                type="submit"
                style={{
                  marginTop: '8px',
                  width: '100%',
                  padding: '14px',
                  borderRadius: '16px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
                  color: '#FFFFFF',
                  fontSize: '15px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 10px 22px -6px rgba(255, 107, 0, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 14px 26px -6px rgba(255, 107, 0, 0.55)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 10px 22px -6px rgba(255, 107, 0, 0.45)';
                }}
                onMouseDown={e => {
                  e.currentTarget.style.transform = 'scale(0.98)';
                }}
                onMouseUp={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
              >
                <span>บันทึกข้อมูล</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </button>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}