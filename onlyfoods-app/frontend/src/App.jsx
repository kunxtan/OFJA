import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { startPolling } from './lib/polling';
import { savedUser, saveUser, waitForApiIdle } from './authFetch.js';
import { clearHistoryNav } from './lib/historyNav';
import { PALETTE } from './auth/theme';
import { APP_STYLES } from './auth/styles';
import { GOOGLE_CLIENT_ID, decodeJwtPayload } from './auth/google';
import LoginScreen from './auth/LoginScreen';
import FoodSplash from './auth/FoodSplash';

// หน้าของแต่ละบทบาทแยกเป็นไฟล์ JS ของตัวเอง : โหลดเฉพาะบทบาทที่ login (ลูกค้าบนมือถือไม่ต้องโหลดหน้าผู้บริหาร)
const VIEW_LOADERS = {
  Accountant: () => import('./features/accountant/AccountantView'),
  Front: () => import('./features/counter/CounterView'),
  Customer: () => import('./features/customer/CustomerView'),
  Executive: () => import('./features/executive/ExecutiveView'),
  Kitchen: () => import('./features/kitchen/KitchenView'),
  Owner: () => import('./features/owner/OwnerView'),
};
const AccountantView = lazy(VIEW_LOADERS.Accountant);
const CounterView = lazy(VIEW_LOADERS.Front);
const CustomerView = lazy(VIEW_LOADERS.Customer);
const ExecutiveView = lazy(VIEW_LOADERS.Executive);
const KitchenView = lazy(VIEW_LOADERS.Kitchen);
const OwnerView = lazy(VIEW_LOADERS.Owner);
// บทบาทล่าสุดที่ใช้เครื่องนี้ : เปิดหน้า login ครั้งถัดไปโหลดไฟล์ของบทบาทนั้นไว้ก่อน (กด login แล้วไม่ต้องรอ)
const LAST_ROLE_KEY = 'onlyfoods.lastRole';

// หน้าโหลดรูปอาหาร : แสดงอย่างน้อยเท่านี้ (ให้อาหารเด้งครบก่อน) ; เฟดออกใช้เวลา SPLASH_FADE_MS
const SPLASH_MIN_MS = 1200;
const SPLASH_FADE_MS = 650;
const IMAGE_WAIT_MS = 2500;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// รูปที่อยู่ในหน้าแล้วแต่ยังโหลดไม่เสร็จ (เช่นรูปเมนู) : รอไม่เกิน maxMs
const waitForImages = (maxMs) => {
  const pending = [...document.images].filter(img => !img.complete);
  if (!pending.length) return Promise.resolve();
  return Promise.race([
    Promise.all(pending.map(img => new Promise(r => {
      img.addEventListener('load', r, { once: true });
      img.addEventListener('error', r, { once: true });
    }))),
    sleep(maxMs),
  ]);
};

// วางต่อท้ายหน้าของบทบาทใน <Suspense> เดียวกัน : effect นี้ทำงานเมื่อไฟล์ของหน้าโหลดเสร็จและหน้า mount แล้ว
// (หลัง effect ของหน้า ซึ่งเริ่มดึงข้อมูลไปแล้ว)
function OnViewMounted({ onMounted }) {
  useEffect(() => { onMounted(); }, []);
  return null;
}

export default function App() {
  // refresh แล้วไม่หลุด : กู้ผู้ใช้จาก sessionStorage (มี token อยู่เท่านั้น ; token ใช้ไม่ได้แล้ว backend ตอบ 401 -> กลับหน้า login)
  const [currentUser, setCurrentUser] = useState(() => savedUser());
  // หน้าโหลดรูปอาหาร : null | 'loading' (หน้า+ข้อมูลโหลดอยู่ข้างหลัง) | 'leaving' (เฟดออก)
  // เริ่มหลัง server ยืนยันว่าเข้าสู่ระบบได้แล้วเท่านั้น (รหัสผิด = ไม่ขึ้นหน้าโหลด เห็นข้อความ error ทันที)
  // เปิดเว็บที่ล็อกอินค้างไว้ = เริ่มที่ loading เลย
  const [splash, setSplash] = useState(() => (savedUser() ? 'loading' : null));
  const splashStartedAt = useRef(performance.now());
  const splashRun = useRef(0); // เปลี่ยนทุกครั้งที่เริ่ม/ยกเลิก : งานรอของรอบเก่าไม่มาปิดหน้าโหลดรอบใหม่
  // เข้าสู่ระบบด้วย Google แต่อีเมลนี้มีบัญชีที่ใช้รหัสผ่านอยู่แล้ว : { credential, username, message, password, error, busy }
  const [googleLink, setGoogleLink] = useState(null);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [foodCourtOpen, setFoodCourtOpen] = useState(true);
  const viewportRef = useRef(null);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '', profile_img: '' });
  const [focusedProfileField, setFocusedProfileField] = useState(null);

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);

  const [authTab, setAuthTab] = useState('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '', name: '', phone: '' });
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);   // กันกดซ้ำ + บอกว่ากำลังรอเซิร์ฟเวอร์ (ตอนระบบช้า/ล่มอาจรอนาน)
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!currentUser?.role) return;
    try { localStorage.setItem(LAST_ROLE_KEY, currentUser.role); } catch { /* storage ถูกบล็อก */ }
  }, [currentUser?.role]);

  // อยู่หน้า login : เครื่องว่างเมื่อไหร่ โหลดไฟล์ของบทบาทล่าสุดไว้ (ไม่เคย login เครื่องนี้ = ไม่โหลดอะไรเพิ่ม)
  useEffect(() => {
    if (currentUser) return undefined;
    let role = null;
    try { role = localStorage.getItem(LAST_ROLE_KEY); } catch { /* storage ถูกบล็อก */ }
    const load = VIEW_LOADERS[role];
    if (!load) return undefined;
    const run = () => { load().catch(() => { /* โหลดไม่ได้ตอนนี้ : ตอน login จะลองใหม่ (และรีโหลดเองถ้ามี deploy ใหม่) */ }); };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, [currentUser]);

  const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

  
  useEffect(() => { saveUser(currentUser); }, [currentUser]);

  const startSplash = () => {
    splashStartedAt.current = performance.now();
    splashRun.current += 1;
    setSplash('loading');
  };
  useEffect(() => {
    if (splash !== 'leaving') return undefined;
    const t = setTimeout(() => setSplash(s => (s === 'leaving' ? null : s)), SPLASH_FADE_MS);
    return () => clearTimeout(t);
  }, [splash]);

  // หน้าของบทบาท mount แล้ว : รอข้อมูล (ไม่มี request ไป /api ค้าง) + รูป + เวลาขั้นต่ำ แล้วค่อยเฟดเข้า
  // จึงไม่เห็น skeleton/ข้อมูลทยอยขึ้นตอนเข้าหน้า
  const onViewMounted = async () => {
    const run = splashRun.current;
    await waitForApiIdle(400, 8000);
    await waitForImages(IMAGE_WAIT_MS);
    await sleep(Math.max(0, SPLASH_MIN_MS - (performance.now() - splashStartedAt.current)));
    if (run !== splashRun.current) return;
    requestAnimationFrame(() => setSplash(s => (s === 'loading' ? 'leaving' : s)));
  };

  const logout = () => {
    window.dispatchEvent(new Event('auth:logout'));  // authFetch.js ทิ้ง token + ข้อมูลใน sessionStorage
    clearHistoryNav();
    splashRun.current += 1;
    setSplash(null);
    setCurrentUser(null);
  };

  // token ใช้ไม่ได้แล้ว (สัญญาร้านหมด / บัญชีถูกระงับ / หมดอายุ) -> กลับหน้า login พร้อมข้อความจาก backend (ดู authFetch.js)
  useEffect(() => {
    const onExpired = (e) => {
      clearHistoryNav();
      splashRun.current += 1;
      setSplash(null);
      setCurrentUser(null);
      setAuthTab('login');
      setAuthError(e.detail || 'กรุณาเข้าสู่ระบบใหม่');
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  useEffect(() => {
    fetchFoodCourtStatus();
    fetchStores();
    fetchProducts();

    // ดึงสถานะเปิด-ปิดศูนย์อาหารซ้ำ (หยุดเมื่อแท็บซ่อน ; เดิมทุก 5 วิตลอดเวลาทุกบทบาท)
    const stopStatusPolling = startPolling(fetchFoodCourtStatus, 15000);

    if (GOOGLE_CLIENT_ID) {
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
    }

    return () => stopStatusPolling();
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

  // ข้อความ error จาก backend : detail เป็นข้อความ (DomainError) หรือรายการ (422 จาก pydantic) -> ไม่ให้ขึ้น [object Object]
  const apiErrorText = (data, fallback) => {
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail)) {
      const FIELD_TH = { username: 'ชื่อผู้ใช้', password: 'รหัสผ่าน', name: 'ชื่อ-นามสกุล', phone: 'เบอร์โทรศัพท์', email: 'อีเมล' };
      const fields = [...new Set(data.detail.map(d => FIELD_TH[d?.loc?.[d.loc.length - 1]]).filter(Boolean))];
      if (fields.length) return `กรุณาตรวจสอบ ${fields.join(', ')} (ข้อมูลยาวหรือสั้นเกินไป)`;
    }
    return fallback;
  };

  const mapRole = (role) => {
    let roleMap = { 'Kitchen Staff': 'Kitchen', 'Front Staff': 'Front', 'Shop Owner': 'Owner' };
    return roleMap[role] || role || 'Customer';
  };

  // ผลเข้าสู่ระบบด้วย Google (จาก /api/auth/google หรือ /api/auth/google/link)
  const applyGoogleLogin = (data, credential) => {
    const payload = decodeJwtPayload(credential);  // ชื่อ/รูปไว้เติมฟอร์มโปรไฟล์เท่านั้น (ตัวตนจริง server ตรวจกับ Google)
    const user = data.user;
    startSplash();
    setCurrentUser({
      UserId: user.UserId, id: user.UserId,
      username: user.Username,
      role: mapRole(user.Role),
      FullName: user.FullName, name: user.FullName || user.Username,
      Phone: user.Phone
    });
    if (data.is_profile_incomplete) {
      setProfileForm({ full_name: user.FullName || payload.name || '', phone: '', profile_img: payload.picture || '' });
      setShowProfileModal(true);
    }
  };

  const googleLogin = async (credential, createNew = false) => {
    const res = await fetch(`${API_BASE}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: credential, create_new: createNew })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.link_required) {
      // ไม่ผูกให้เอง: ต้องใส่รหัสผ่านของบัญชีเดิมก่อน (กันคนสมัครด้วยอีเมลของคนอื่นแล้วรอให้เจ้าของจริงผูก Google ให้)
      setGoogleLink({ credential, username: data.username, message: data.detail, password: '', error: '', busy: false });
      return;
    }
    if (!res.ok) throw new Error(apiErrorText(data, 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ'));
    setGoogleLink(null);
    applyGoogleLogin(data, credential);
  };

  const handleGoogleResponse = async (response) => {
    try {
      await googleLogin(response.credential);
    } catch (err) {
      alert(`Google Auth Error: ${err.message}`);
    }
  };

  const submitGoogleLink = async (e) => {
    e.preventDefault();
    if (!googleLink || googleLink.busy) return;
    setGoogleLink(g => ({ ...g, busy: true, error: '' }));
    try {
      const res = await fetch(`${API_BASE}/api/auth/google/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: googleLink.credential, password: googleLink.password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorText(data, 'เชื่อมบัญชีไม่สำเร็จ'));
      const credential = googleLink.credential;
      setGoogleLink(null);
      applyGoogleLogin(data, credential);
    } catch (err) {
      setGoogleLink(g => g && ({ ...g, busy: false, error: err.message }));
    }
  };

  const createSeparateGoogleAccount = async () => {
    if (!googleLink || googleLink.busy) return;
    setGoogleLink(g => ({ ...g, busy: true, error: '' }));
    try {
      await googleLogin(googleLink.credential, true);
    } catch (err) {
      setGoogleLink(g => g && ({ ...g, busy: false, error: err.message }));
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
    if (authBusy) return;
    setAuthError('');
    setAuthBusy(true);

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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorText(data, authTab === 'login' ? 'เข้าสู่ระบบไม่สำเร็จ' : 'สมัครสมาชิกไม่สำเร็จ'));

      const finalRole = mapRole(data.Role);

      startSplash();
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
    } finally {
      setAuthBusy(false);
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
      <style>{APP_STYLES}</style>
      {splash && <FoodSplash phase={splash} />}

      {!currentUser ? (
        <LoginScreen {...{
          viewportRef, foodCourtOpen, authTab, setAuthTab, setAuthError, authError, handleAuthSubmit, authForm,
          setAuthForm, showPassword, setShowPassword, setShowForgotModal, authBusy, triggerGoogleConnect
        }} />
      ) : (
        <div style={{ width: '100%', minHeight: '100vh', background: '#F8FAFC', padding: 0, margin: 0 }}>
          {/* ระหว่างโหลดไฟล์ของบทบาทนั้น : หน้าโหลดรูปอาหาร (FoodSplash) บังอยู่ด้านบน */}
          <Suspense fallback={null}>
          {currentUser.role === 'Customer' && <CustomerView user={currentUser} apiBase={API_BASE} stores={stores} products={products} foodCourtOpen={foodCourtOpen} onLogout={logout} />}
          {currentUser.role === 'Kitchen' && <KitchenView user={currentUser} apiBase={API_BASE} onLogout={logout} />}
          {currentUser.role === 'Front' && <CounterView user={currentUser} apiBase={API_BASE} stores={stores} onLogout={logout} />}
          {currentUser.role === 'Owner' && <OwnerView user={currentUser} apiBase={API_BASE} onLogout={logout} />}
          {currentUser.role === 'Accountant' && <AccountantView user={currentUser} apiBase={API_BASE} onLogout={logout} />}
          {currentUser.role === 'Executive' && <ExecutiveView user={currentUser} apiBase={API_BASE} onStatusChange={fetchFoodCourtStatus} onLogout={logout} />}
          <OnViewMounted key={`${currentUser.UserId}-${currentUser.role}`} onMounted={onViewMounted} />
          </Suspense>
        </div>
      )}

      {/* Google: อีเมลนี้มีบัญชีที่ใช้รหัสผ่านอยู่แล้ว -> ใส่รหัสเดิมเพื่อเชื่อม หรือสร้างบัญชีแยก */}
      {googleLink && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px'
        }}>
          <form onSubmit={submitGoogleLink} className="modal-pop" role="dialog" aria-modal="true" aria-labelledby="google-link-title" style={{
            backgroundColor: PALETTE.white, padding: '32px 28px', borderRadius: '24px',
            width: '100%', maxWidth: '380px', boxShadow: '0 20px 40px rgba(0,0,0,0.12)',
            color: PALETTE.slateText, boxSizing: 'border-box', position: 'relative',
            border: `1.5px solid ${PALETTE.borderOrange}`
          }}>
            <button type="button" aria-label="ปิด" onClick={() => !googleLink.busy && setGoogleLink(null)} style={{
              position: 'absolute', right: '18px', top: '18px', background: 'none', border: 'none',
              color: PALETTE.subText, cursor: 'pointer', fontSize: '18px', fontWeight: 700
            }}>✕</button>
            <h3 id="google-link-title" style={{ margin: '0 0 8px 0', fontSize: '19px', fontWeight: 800, textAlign: 'center' }}>เชื่อมบัญชีกับ Google</h3>
            <p style={{ fontSize: '13px', color: PALETTE.subText, margin: '0 0 16px', lineHeight: 1.6, textAlign: 'center' }}>{googleLink.message}</p>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }} htmlFor="google-link-password">
              รหัสผ่านของบัญชี {googleLink.username}
            </label>
            <input id="google-link-password" type="password" autoFocus autoComplete="current-password" value={googleLink.password}
              onChange={e => setGoogleLink(g => ({ ...g, password: e.target.value }))} disabled={googleLink.busy}
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: '12px', border: `1.5px solid ${PALETTE.borderOrange}`, fontSize: '15px', fontFamily: 'inherit' }} />
            {googleLink.error && <div role="alert" style={{ color: '#B91C1C', fontSize: '13px', marginTop: '10px' }}>{googleLink.error}</div>}
            <button type="submit" className="btn-primary" disabled={googleLink.busy || !googleLink.password} style={{ marginTop: '16px' }}>
              {googleLink.busy ? 'กำลังตรวจสอบ...' : 'ยืนยันรหัสผ่านและเชื่อม Google'}
            </button>
            <button type="button" className="link-btn" onClick={createSeparateGoogleAccount} disabled={googleLink.busy}
              style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: PALETTE.subText, fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
              ไม่ใช่บัญชีของฉัน / จำรหัสไม่ได้ — สร้างบัญชีใหม่ด้วย Google
            </button>
          </form>
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
              type="button"
              aria-label="ปิด"
              onClick={() => setShowForgotModal(false)}
              style={{
                position: 'absolute', right: '18px', top: '18px', background: 'none', border: 'none',
                color: PALETTE.subText, cursor: 'pointer', fontSize: '18px', fontWeight: 700
              }}
            >
              ✕
            </button>

            <div style={{ textAlign: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '19px', fontWeight: 800 }}>ลืมรหัสผ่าน</h3>
              <p style={{ fontSize: '13px', color: PALETTE.subText, margin: 0, lineHeight: 1.6 }}>
                เพื่อความปลอดภัยของบัญชี ระบบไม่เปิดให้ตั้งรหัสผ่านใหม่เองจากหน้านี้
              </p>
            </div>
            <div style={{ background: PALETTE.cream, border: `1px solid ${PALETTE.borderOrange}`, borderRadius: '14px', padding: '14px 16px', fontSize: '13px', lineHeight: 1.7, marginBottom: '18px' }}>
              กรุณาติดต่อเจ้าหน้าที่ศูนย์อาหาร พร้อมแจ้ง<b>ชื่อผู้ใช้</b>และ<b>เบอร์โทรศัพท์</b>ที่ลงทะเบียนไว้ เพื่อขอรีเซ็ตรหัสผ่าน
            </div>
            <button type="button" className="btn-primary" onClick={() => setShowForgotModal(false)}>
              เข้าใจแล้ว กลับไปหน้าเข้าสู่ระบบ
            </button>
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