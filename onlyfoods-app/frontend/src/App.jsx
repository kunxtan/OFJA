import { useEffect, useRef, useState } from 'react';
import AccountantView from './components/AccountantView';
import CounterView from './components/CounterView';
import CustomerView from './components/CustomerView';
import ExecutiveView from './components/ExecutiveView';
import KitchenView from './components/KitchenView';
import OwnerView from './components/OwnerView';

// 🎨 Palettes: Warm Cream & Orange Theme
const PALETTE = {
  primary: '#FF6B00',
  primaryGradient: 'linear-gradient(135deg, #FF7A00 0%, #FF8F1F 100%)',
  bannerGradient: 'linear-gradient(160deg, #FF7A00 0%, #F25C00 100%)',
  orangeGlow: 'rgba(255, 107, 0, 0.25)',
  primaryHover: '#E55F00',
  primarySoft: 'rgba(255, 107, 0, 0.10)',
  bgGradient: 'linear-gradient(135deg, #FFFFFF 0%, #FFF5EA 45%, #FFE3C6 100%)',
  cream: '#FFF8EE',
  creamDeep: '#FFEFDD',
  slateText: '#1E293B',
  subText: '#6B7280',
  border: '#F0E3D3',
  borderOrange: '#FFDDBF',
  white: '#FFFFFF',
  success: '#10B981',
  danger: '#EF4444'
};

const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

// 🍜 ภาพประกอบอาหารแบบ flat vector (วาดด้วย SVG ล้วน ไม่ต้องใช้ไฟล์รูป)
const artProps = (p) => ({ xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true, focusable: 'false', ...p });

function BurgerArt(props) {
  return (
    <svg viewBox="0 0 240 216" {...artProps(props)}>
      <ellipse cx="120" cy="207" rx="94" ry="8" fill="rgba(80,30,0,0.2)" />
      <path d="M30 172 H210 Q210 198 178 198 H62 Q30 198 30 172Z" fill="#E88F25" />
      <rect x="22" y="150" width="196" height="28" rx="14" fill="#5E3219" />
      <rect x="36" y="155" width="64" height="5" rx="2.5" fill="rgba(255,255,255,0.2)" />
      <path d="M26 142 H214 V154 H198 L188 176 L174 154 H66 L52 174 L40 154 H26Z" fill="#FFC72C" />
      <rect x="28" y="130" width="184" height="18" rx="9" fill="#E8412F" />
      <rect x="44" y="134" width="50" height="4" rx="2" fill="rgba(255,255,255,0.3)" />
      <path d="M20 112 H220 V128 Q208 140 196 128 Q184 140 172 128 Q160 140 148 128 Q136 140 124 128 Q112 140 100 128 Q88 140 76 128 Q64 140 52 128 Q40 140 28 128 Q22 134 20 128Z" fill="#5CB85C" />
      <path d="M24 120 Q24 44 120 44 Q216 44 216 120Z" fill="#F4A93B" />
      <path d="M26 106 Q24 112 24 120 H216 Q216 112 214 106 Q120 118 26 106Z" fill="#E48B24" />
      <path d="M46 98 Q50 64 84 54" stroke="rgba(255,255,255,0.42)" strokeWidth="7" strokeLinecap="round" fill="none" />
      <g fill="#FFF3D6">
        <ellipse cx="100" cy="76" rx="6" ry="3" transform="rotate(-20 100 76)" />
        <ellipse cx="136" cy="64" rx="6" ry="3" transform="rotate(15 136 64)" />
        <ellipse cx="164" cy="86" rx="6" ry="3" transform="rotate(-8 164 86)" />
        <ellipse cx="120" cy="96" rx="6" ry="3" transform="rotate(25 120 96)" />
        <ellipse cx="82" cy="98" rx="6" ry="3" transform="rotate(10 82 98)" />
        <ellipse cx="184" cy="102" rx="5" ry="2.6" transform="rotate(-25 184 102)" />
      </g>
    </svg>
  );
}

function SkewerArt(props) {
  return (
    <svg viewBox="0 0 120 320" {...artProps(props)}>
      <path d="M56 0 H64 V300 L60 320 L56 300Z" fill="#E2B877" />
      <rect x="18" y="40" width="84" height="48" rx="18" fill="#7A3B1D" />
      <rect x="27" y="46" width="30" height="7" rx="3.5" fill="rgba(255,255,255,0.22)" />
      <rect x="62" y="70" width="26" height="6" rx="3" fill="#4A2210" />
      <rect x="24" y="92" width="72" height="34" rx="14" fill="#E8412F" />
      <rect x="32" y="97" width="22" height="5" rx="2.5" fill="rgba(255,255,255,0.3)" />
      <rect x="14" y="130" width="92" height="50" rx="18" fill="#8A4524" />
      <rect x="24" y="136" width="34" height="7" rx="3.5" fill="rgba(255,255,255,0.2)" />
      <rect x="60" y="162" width="28" height="6" rx="3" fill="#4A2210" />
      <rect x="22" y="184" width="76" height="34" rx="14" fill="#5CB85C" />
      <rect x="30" y="189" width="24" height="5" rx="2.5" fill="rgba(255,255,255,0.3)" />
      <rect x="18" y="222" width="84" height="46" rx="18" fill="#7A3B1D" />
      <rect x="27" y="228" width="30" height="7" rx="3.5" fill="rgba(255,255,255,0.22)" />
      <rect x="26" y="272" width="68" height="30" rx="13" fill="#FF9A1F" />
      <rect x="34" y="277" width="22" height="5" rx="2.5" fill="rgba(255,255,255,0.3)" />
    </svg>
  );
}

function NoodleBowlArt(props) {
  return (
    <svg viewBox="0 0 220 170" {...artProps(props)}>
      <ellipse cx="110" cy="161" rx="80" ry="7" fill="rgba(80,30,0,0.2)" />
      <path d="M26 84 Q30 34 110 30 Q190 34 194 84Z" fill="#FFD966" />
      <g stroke="#FFF1B8" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M38 76 Q56 52 74 72 T110 66 T146 62 T182 74" />
        <path d="M44 62 Q62 40 84 56 T126 48 T170 56" />
        <path d="M60 46 Q84 30 108 42 T152 40" />
      </g>
      <ellipse cx="78" cy="58" rx="24" ry="15" fill="#FFFFFF" />
      <circle cx="80" cy="57" r="9" fill="#FFB400" />
      <path d="M126 46 Q150 26 168 50 Q174 66 158 68 Q164 56 148 54 Q138 54 130 62Z" fill="#FF8A4C" />
      <g fill="#5CB85C">
        <circle cx="110" cy="40" r="4" />
        <circle cx="100" cy="66" r="4" />
        <circle cx="148" cy="72" r="4" />
        <circle cx="58" cy="76" r="4" />
      </g>
      <g stroke="#7B4A22" strokeWidth="5" strokeLinecap="round">
        <line x1="168" y1="2" x2="116" y2="52" />
        <line x1="182" y1="10" x2="128" y2="58" />
      </g>
      <path d="M14 80 H206 Q206 150 110 156 Q14 150 14 80Z" fill="#E8412F" />
      <rect x="10" y="74" width="200" height="12" rx="6" fill="#C93322" />
      <path d="M18 104 H202 Q200 114 196 122 H24 Q20 114 18 104Z" fill="#FFC72C" />
      <path d="M28 94 Q30 122 52 142" stroke="rgba(255,255,255,0.3)" strokeWidth="6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function ThaiTeaArt(props) {
  return (
    <svg viewBox="0 0 100 192" {...artProps(props)}>
      <ellipse cx="50" cy="189" rx="34" ry="4" fill="rgba(80,30,0,0.2)" />
      <path d="M14 38 L24 178 Q25 186 34 186 H66 Q75 186 76 178 L86 38Z" fill="rgba(255,255,255,0.5)" />
      <path d="M17 84 H83 L76 178 Q75 186 66 186 H34 Q25 186 24 178Z" fill="#F28A2E" />
      <path d="M17 84 Q33 74 50 84 T83 84 V104 Q66 96 50 106 T17 102Z" fill="#FFE9CF" />
      <rect x="30" y="118" width="22" height="22" rx="5" fill="rgba(255,255,255,0.55)" transform="rotate(-12 41 129)" />
      <rect x="50" y="144" width="20" height="20" rx="5" fill="rgba(255,255,255,0.5)" transform="rotate(10 60 154)" />
      <path d="M26 56 L32 170" stroke="rgba(255,255,255,0.6)" strokeWidth="5" strokeLinecap="round" />
      <rect x="10" y="32" width="80" height="10" rx="5" fill="#FFFFFF" />
      <line x1="66" y1="2" x2="56" y2="132" stroke="#3D5AFE" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

function PizzaArt(props) {
  return (
    <svg viewBox="0 0 200 190" {...artProps(props)}>
      <path d="M14 54 H186 L100 176Z" fill="#FFC83D" stroke="#FFC83D" strokeWidth="12" strokeLinejoin="round" />
      <path d="M4 44 Q100 18 196 44 Q202 66 190 70 Q100 46 10 70 Q-2 66 4 44Z" fill="#E8A04A" />
      <g>
        <circle cx="66" cy="92" r="14" fill="#D63A2A" />
        <circle cx="62" cy="88" r="5" fill="rgba(255,255,255,0.25)" />
        <circle cx="122" cy="88" r="14" fill="#D63A2A" />
        <circle cx="118" cy="84" r="5" fill="rgba(255,255,255,0.25)" />
        <circle cx="98" cy="132" r="12" fill="#D63A2A" />
        <circle cx="95" cy="129" r="4" fill="rgba(255,255,255,0.25)" />
      </g>
      <g fill="#5CB85C">
        <rect x="90" y="96" width="12" height="5" rx="2.5" transform="rotate(30 96 98)" />
        <rect x="140" y="106" width="12" height="5" rx="2.5" transform="rotate(-20 146 108)" />
        <rect x="76" y="116" width="12" height="5" rx="2.5" transform="rotate(-35 82 118)" />
      </g>
    </svg>
  );
}

function EggArt(props) {
  return (
    <svg viewBox="0 0 120 100" {...artProps(props)}>
      <path d="M18 52 Q10 20 46 16 Q70 0 96 22 Q116 40 100 68 Q90 90 56 86 Q24 86 18 52Z" fill="#FFFFFF" />
      <circle cx="58" cy="50" r="20" fill="#FFB400" />
      <circle cx="51" cy="43" r="6" fill="rgba(255,255,255,0.45)" />
    </svg>
  );
}

function LimeArt(props) {
  return (
    <svg viewBox="0 0 60 60" {...artProps(props)}>
      <circle cx="30" cy="30" r="28" fill="#7CC34F" />
      <circle cx="30" cy="30" r="22" fill="#D9F2A8" />
      <g stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round">
        <line x1="30" y1="10" x2="30" y2="50" />
        <line x1="10" y1="30" x2="50" y2="30" />
        <line x1="16" y1="16" x2="44" y2="44" />
        <line x1="44" y1="16" x2="16" y2="44" />
      </g>
      <circle cx="30" cy="30" r="4" fill="#FFFFFF" />
    </svg>
  );
}

function SparkleArt(props) {
  return (
    <svg viewBox="-12 -12 24 24" {...artProps(props)}>
      <path d="M0 -11 Q0 0 11 0 Q0 0 0 11 Q0 0 -11 0 Q0 0 0 -11Z" fill="#FFFFFF" />
    </svg>
  );
}

// ตัวห่อ: ชั้นนอก = ขยับตามเมาส์ (parallax), ชั้นใน = ลอยขึ้นลงเบา ๆ
function Food({ cls, d = 10, r = 0, delay = '0s', dur = '6s', children }) {
  return (
    <div className={`food ${cls}`} style={{ '--d': d, '--r': r }}>
      <div className="food-float" style={{ animationDelay: delay, animationDuration: dur }}>{children}</div>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [foodCourtOpen, setFoodCourtOpen] = useState(true);
  const viewportRef = useRef(null);

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

  const API_BASE = "http://only-foods.cskmitl.com";

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

  // 🟠 แสงส้มตามเมาส์บนพื้นหลัง (อัปเดตผ่าน CSS variable + rAF ไม่ re-render React)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const cur = { ...target };
    let raf = null;

    const tick = () => {
      cur.x += (target.x - cur.x) * 0.12;
      cur.y += (target.y - cur.y) * 0.12;
      const el = viewportRef.current;
      if (el) {
        el.style.setProperty('--gx', `${cur.x.toFixed(1)}px`);
        el.style.setProperty('--gy', `${cur.y.toFixed(1)}px`);
      }
      const moving = Math.abs(target.x - cur.x) > 0.5 || Math.abs(target.y - cur.y) > 0.5;
      raf = moving ? requestAnimationFrame(tick) : null;
    };
    const onMove = (e) => {
      target.x = e.clientX;
      target.y = e.clientY;
      if (viewportRef.current) viewportRef.current.dataset.glow = 'on';
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => { if (viewportRef.current) viewportRef.current.dataset.glow = 'off'; };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
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
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', margin: 0, padding: 0 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700;800&display=swap');

        * { box-sizing: border-box; }
        body { font-family: 'Prompt', 'Noto Sans Thai', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
        html, body, #root {
          width: 100vw !important;
          height: 100vh !important;
          height: 100dvh !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background-color: #FFF5EA !important;
        }

        /* ===== Soft orange gradient viewport ===== */
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
        /* แสงส้มไล่ตามเมาส์ — อยู่หลังการ์ด จึงเห็นเฉพาะตอนเมาส์อยู่นอกการ์ด */
        .cursor-glow {
          position: absolute;
          left: 0;
          top: 0;
          width: 560px;
          height: 560px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 122, 0, 0.42) 0%, rgba(255, 150, 40, 0.16) 45%, rgba(255, 150, 40, 0) 70%);
          transform: translate3d(calc(var(--gx, 50vw) - 50%), calc(var(--gy, 50vh) - 50%), 0);
          opacity: 0;
          transition: opacity 0.5s ease;
          pointer-events: none;
          z-index: 1;
          will-change: transform;
        }
        .orange-viewport[data-glow='on'] .cursor-glow { opacity: 1; }
        @media (hover: none) { .cursor-glow { display: none; } }

        /* ===== Card ===== */
        .card-glowing-wrapper {
          position: relative;
          width: 100%;
          max-width: 1000px;
          height: 100%;
          max-height: 620px;
          border-radius: 28px;
          background: ${PALETTE.cream};
          box-shadow: 0 30px 70px -28px rgba(214, 90, 0, 0.28), 0 6px 22px rgba(15, 23, 42, 0.07), 0 0 0 1px rgba(240, 227, 211, 0.7);
          z-index: 10;
        }
        .modern-card {
          width: 100%;
          height: 100%;
          background: ${PALETTE.cream};
          border-radius: 28px;
          display: flex;
          overflow: hidden;
          position: relative;
        }

        /* ===== Form side ===== */
        .form-pane {
          flex: 1.1;
          padding: 36px 40px 26px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow-y: auto;
          scrollbar-width: none;
          background: ${PALETTE.cream};
        }
        .form-pane::-webkit-scrollbar { display: none; }

        .tab-switcher {
          display: flex;
          background: ${PALETTE.creamDeep};
          border: 1px solid ${PALETTE.borderOrange};
          padding: 4px;
          border-radius: 14px;
          margin-bottom: 20px;
          position: relative;
        }
        .tab-pill {
          position: absolute;
          top: 4px;
          bottom: 4px;
          width: calc(50% - 4px);
          background: ${PALETTE.primaryGradient};
          border-radius: 10px;
          box-shadow: 0 6px 16px rgba(255, 107, 0, 0.30);
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 1;
        }
        .tab-btn {
          flex: 1;
          padding: 10px 16px;
          border: none;
          border-radius: 10px;
          font-family: inherit;
          font-weight: 500;
          font-size: 13.5px;
          cursor: pointer;
          background: transparent;
          color: #8A6A4F;
          z-index: 2;
          transition: color 0.25s ease;
        }
        .tab-btn.active { color: #FFFFFF; font-weight: 600; }

        .input-group { position: relative; margin-bottom: 12px; }
        .input-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #A8A29E;
          transition: color 0.25s ease;
          pointer-events: none;
          display: flex;
        }
        .modern-input {
          width: 100%;
          padding: 13px 16px 13px 46px;
          border-radius: 14px;
          border: 1.5px solid ${PALETTE.border};
          background: rgba(255, 255, 255, 0.72);
          outline: none;
          font-family: inherit;
          font-size: 13.5px;
          color: ${PALETTE.slateText};
          font-weight: 400;
          transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
        }
        .modern-input::placeholder { color: #A8A29E; }
        .modern-input:focus {
          border-color: ${PALETTE.primary};
          background: #FFFFFF;
          box-shadow: 0 0 0 4px ${PALETTE.primarySoft};
        }
        .modern-input:focus + .input-icon { color: ${PALETTE.primary}; }

        .btn-primary {
          width: 100%;
          background: ${PALETTE.primaryGradient};
          color: #FFFFFF;
          border: none;
          padding: 14px;
          border-radius: 14px;
          font-family: inherit;
          font-weight: 600;
          font-size: 14.5px;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          position: relative;
          overflow: hidden;
          box-shadow: 0 12px 24px -8px rgba(255, 107, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 16px 28px -8px rgba(255, 107, 0, 0.6); }
        .btn-primary:active { transform: translateY(0); }

        .or-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 18px 0 14px;
          font-size: 11.5px;
          color: ${PALETTE.subText};
        }
        .or-divider::before, .or-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #EADCC9;
        }

        .btn-google {
          width: 100%;
          background: #FFFFFF;
          color: ${PALETTE.slateText};
          border: 1.5px solid #EDE1D2;
          padding: 12px 16px;
          border-radius: 14px;
          font-family: inherit;
          font-weight: 500;
          font-size: 13.5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .btn-google:hover {
          background: #FFFBF6;
          border-color: ${PALETTE.borderOrange};
          box-shadow: 0 4px 14px rgba(255, 107, 0, 0.10);
        }

        .tab-btn:focus-visible, .btn-primary:focus-visible, .btn-google:focus-visible, .link-btn:focus-visible {
          outline: 2px solid ${PALETTE.primary};
          outline-offset: 2px;
        }

        /* ===== Banner side ===== */
        .banner-pane {
          flex: 0.95;
          background: ${PALETTE.bannerGradient};
          padding: 30px 32px 0;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }
        /* แสงสว่างตามเคอร์เซอร์ — แสดงเฉพาะตอนเมาส์อยู่ในแบนเนอร์ */
        .banner-pane::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 3;
          background: radial-gradient(circle 230px at var(--bx, 50%) var(--by, 40%), rgba(255, 255, 255, 0.34), transparent 70%);
          opacity: 0;
          transition: opacity 0.35s ease;
          pointer-events: none;
        }
        .banner-pane:hover::before { opacity: 1; }
        .doodle {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          transform: scale(1.04);
        }
        .banner-top {
          position: relative;
          z-index: 5;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .banner-label { font-size: 11px; font-weight: 500; color: rgba(255, 255, 255, 0.85); letter-spacing: 0.6px; }
        .status-pill-light {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #FFFFFF;
          padding: 6px 14px;
          border-radius: 30px;
          font-size: 11.5px;
          font-weight: 600;
          box-shadow: 0 6px 16px rgba(120, 40, 0, 0.14);
        }
        .banner-title {
          position: relative;
          z-index: 5;
          margin: 24px 0 0;
          font-size: 26px;
          line-height: 1.35;
          font-weight: 600;
          color: #FFFFFF;
          text-shadow: 0 2px 14px rgba(150, 50, 0, 0.25);
        }

        /* ===== เวทีอาหาร + cursor parallax ===== */
        .banner-stage {
          position: relative;
          z-index: 2;
          flex: 1;
          min-height: 270px;
          width: 100%;
          max-width: 420px;
          margin: 6px auto 0;
        }
        .stage-sun {
          position: absolute;
          left: 12%;
          top: 14%;
          width: 76%;
          aspect-ratio: 1;
          border-radius: 50%;
          background: #FFC21A;
          box-shadow: 0 0 0 14px rgba(255, 194, 26, 0.25);
        }
        .food {
          position: absolute;
          pointer-events: none;
        }
        .food svg {
          display: block;
          width: 100%;
          height: auto;
          overflow: visible;
          filter: drop-shadow(0 10px 12px rgba(120, 40, 0, 0.22));
        }
        .food-float { animation: foodFloat 6s ease-in-out infinite; }
        @keyframes foodFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-9px) rotate(1.8deg); }
        }

        .f-pizza  { right: 0;    top: -2%;  width: 32%; z-index: 2; }
        .f-skewer { left: 2%;    top: -8%;  width: 19%; z-index: 4; }
        .f-egg    { left: 42%;   top: 0;    width: 15%; z-index: 3; }
        .f-burger { left: 23%;   top: 24%;  width: 58%; z-index: 3; }
        .f-noodle { left: -5%;   top: 52%;  width: 48%; z-index: 5; }
        .f-tea    { right: -1%;  top: 36%;  width: 21%; z-index: 5; }
        .f-lime   { right: 26%;  top: 78%;  width: 11%; z-index: 6; }
        .f-spark  { z-index: 6; }
        .f-spark1 { left: 30%;   top: 18%;  width: 6%; }
        .f-spark2 { right: 30%;  top: 12%;  width: 5%; }
        .f-spark3 { left: 14%;   top: 46%;  width: 4.5%; }
        .f-spark .food-float { animation-name: sparkle; }
        @keyframes sparkle {
          0%, 100% { transform: scale(0.7) rotate(0deg); opacity: 0.6; }
          50% { transform: scale(1.15) rotate(45deg); opacity: 1; }
        }

        .banner-footer {
          position: relative;
          z-index: 5;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 0 16px;
          font-size: 11.5px;
          font-weight: 500;
          color: #FFFFFF;
          text-shadow: 0 1px 8px rgba(60, 25, 0, 0.35);
        }

        .radar-box { position: relative; display: flex; align-items: center; justify-content: center; width: 10px; height: 10px; }
        .radar-dot { width: 8px; height: 8px; border-radius: 50%; }
        .radar-wave {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          opacity: 0.75;
          animation: radarPing 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        @keyframes radarPing { 75%, 100% { transform: scale(3); opacity: 0; } }

        .modal-pop { animation: modalPopIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes modalPopIn {
          0% { opacity: 0; transform: scale(0.92) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }

        @media (max-width: 840px) {
          .orange-viewport { padding: 0; }
          .card-glowing-wrapper { max-width: 100%; max-height: 100%; border-radius: 0; box-shadow: none; }
          .modern-card { border-radius: 0; flex-direction: column-reverse; overflow-y: auto; }
          .form-pane { flex: none; padding: 26px 22px; overflow: visible; }
          .banner-pane { flex: none; padding: 22px 22px 0; }
          .banner-title { font-size: 21px; margin-top: 14px; }
          .banner-stage { flex: none; height: 240px; min-height: 0; margin-top: 4px; }
          .banner-footer { display: none; }
          .f-pizza  { right: 2%;  top: -4%;  width: 27%; }
          .f-skewer { left: 4%;   top: -12%; width: 15%; }
          .f-egg    { left: 44%;  top: -4%;  width: 13%; }
          .f-burger { left: 27%;  top: 22%;  width: 46%; }
          .f-noodle { left: 3%;   top: 52%;  width: 36%; }
          .f-tea    { right: 3%;  top: 32%;  width: 16%; }
          .f-lime   { right: 26%; top: 76%;  width: 9%; }
        }
        @media (max-width: 480px) {
          .form-pane { padding: 22px 18px; }
          .banner-pane { padding: 18px 18px 0; }
          .banner-title { font-size: 19px; }
          .banner-stage { height: 210px; }
        }
        @media (min-width: 841px) and (max-height: 640px) {
          .banner-stage { min-height: 200px; }
          .banner-title { font-size: 22px; margin-top: 14px; }
        }

        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>

      {!currentUser ? (
        <div className="orange-viewport" ref={viewportRef}>
          <div className="cursor-glow" aria-hidden="true"></div>
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
                    {authTab === 'login' ? 'ยินดีต้อนรับ! เข้าสู่ระบบเพื่อเริ่มสั่งอาหาร' : 'สร้างบัญชีผู้ใช้ใหม่ เพื่อสั่งอาหารและใช้งานระบบ'}
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
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path></svg>
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

                  <div className="or-divider">หรือเชื่อมต่อผ่าน</div>

                  <button type="button" onClick={triggerGoogleConnect} className="btn-google">
                    <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                    <span>ลงชื่อเข้าใช้ด้วย Google</span>
                  </button>
                </div>

                <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: PALETTE.subText }}>
                  OnlyFoods Platform © 2026
                </div>
              </div>

              {/* Banner Pane (Orange Side) */}
              <div
                className="banner-pane"
                onPointerMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty('--bx', `${e.clientX - r.left}px`);
                  e.currentTarget.style.setProperty('--by', `${e.clientY - r.top}px`);
                }}
              >
                <svg className="doodle" viewBox="0 0 470 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                  <g fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M-20 540 C60 470 150 560 110 600 C70 640 20 560 120 520 C220 480 300 600 500 470" />
                    <circle cx="398" cy="232" r="62" />
                    <circle cx="64" cy="344" r="26" />
                    <path d="M470 330 C400 300 380 380 430 410" />
                    <path d="M300 84 q20 -26 40 0 t40 0 t40 0" />
                  </g>
                </svg>

                <div className="banner-top">
                  <span className="banner-label">ONLYFOODS SYSTEM</span>

                  {/* Realtime Live Status Indicator */}
                  <div className="status-pill-light" style={{ color: foodCourtOpen ? '#059669' : '#DC2626' }}>
                    <div className="radar-box">
                      <div className="radar-wave" style={{ background: foodCourtOpen ? '#10B981' : '#EF4444' }}></div>
                      <div className="radar-dot" style={{ background: foodCourtOpen ? '#10B981' : '#EF4444' }}></div>
                    </div>
                    {foodCourtOpen ? 'เปิดให้บริการ' : 'ปิดให้บริการ'}
                  </div>
                </div>

                <h3 className="banner-title">สะดวก รวดเร็ว จบในที่เดียว</h3>

                <div className="banner-stage" aria-hidden="true">
                  <div className="stage-sun"></div>

                  <Food cls="f-pizza" d={12} r={3} delay="-1s" dur="7s"><PizzaArt style={{ transform: 'rotate(16deg)' }} /></Food>
                  <Food cls="f-skewer" d={14} r={5} delay="-3s" dur="8s"><SkewerArt style={{ transform: 'rotate(26deg)' }} /></Food>
                  <Food cls="f-egg" d={20} r={-6} delay="-2s" dur="6s"><EggArt style={{ transform: 'rotate(-10deg)' }} /></Food>
                  <Food cls="f-burger" d={18} r={2} delay="0s" dur="6.5s"><BurgerArt /></Food>
                  <Food cls="f-noodle" d={28} r={-3} delay="-4s" dur="7.5s"><NoodleBowlArt /></Food>
                  <Food cls="f-tea" d={26} r={4} delay="-2.5s" dur="6.8s"><ThaiTeaArt style={{ transform: 'rotate(6deg)' }} /></Food>
                  <Food cls="f-lime" d={36} r={10} delay="-1.5s" dur="5.5s"><LimeArt /></Food>
                  <Food cls="f-spark f-spark1" d={30} delay="-1s" dur="3.5s"><SparkleArt /></Food>
                  <Food cls="f-spark f-spark2" d={24} delay="-2s" dur="4s"><SparkleArt /></Food>
                  <Food cls="f-spark f-spark3" d={32} delay="-3s" dur="3.8s"><SparkleArt /></Food>
                </div>

                <div className="banner-footer">
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFFFFF', opacity: 0.9 }}></span>
                  Real-time Sync Active
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