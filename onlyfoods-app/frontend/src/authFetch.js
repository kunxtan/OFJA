// ใส่ JWT ให้ทุก request ที่ไป /api โดยไม่ต้องแก้ fetch() ทีละจุดใน component
//  - เก็บ access_token จากผลของ /api/login, /api/register, /api/auth/google(/link), เปลี่ยนรหัสผ่าน
//    ไว้ใน sessionStorage : กด refresh แล้วยังอยู่ ปิดแท็บแล้วหาย (ไม่ใช้ localStorage ที่ค้างข้ามวัน)
//    ข้อแลก: ถ้าเว็บโดน XSS จะอ่าน token ได้ ทางที่ปลอดภัยกว่าคือ httpOnly cookie (อยู่ใน backlog)
//  - แนบ header  Authorization: Bearer <token>  เฉพาะ request ที่ไปหา origin ของ API
//  - ได้ 401 (หมดอายุ/ถูกระงับ/สัญญาร้านหมด) = ทิ้ง token แล้วส่ง event 'auth:expired' ให้ App.jsx เด้งไปหน้า login
//  - App.jsx ส่ง 'auth:logout' ตอนกดออกจากระบบ = ทิ้ง token
//  - เซิร์ฟเวอร์ล่ม/เน็ตหลุด : ไม่ส่งข้อความดิบ ("Failed to fetch", หน้า HTML 502 ของ nginx, "Internal Server Error")
//    ไปถึงหน้าจอ แต่แปลงเป็นคำตอบ JSON ที่มี detail ภาษาไทย ทุกหน้าที่อ่าน data.detail จึงแสดงข้อความที่ผู้ใช้เข้าใจ
const originalFetch = window.fetch.bind(window);
const API_ORIGIN = new URL(import.meta.env.VITE_API_URL || window.location.origin, window.location.origin).origin;
const TOKEN_PATHS = ['/api/login', '/api/register', '/api/auth/google', '/api/auth/google/link', '/api/users/change-password'];
export const TOKEN_KEY = 'onlyfoods.token';
export const USER_KEY = 'onlyfoods.user';

const store = {
  get(key) { try { return window.sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { window.sessionStorage.setItem(key, value); } catch { /* โหมดส่วนตัว/บล็อก storage: ใช้แค่ในหน่วยความจำ */ } },
  remove(key) { try { window.sessionStorage.removeItem(key); } catch { /* ignore */ } },
};

let token = store.get(TOKEN_KEY);
const setToken = (value) => {
  token = value;
  if (value) store.set(TOKEN_KEY, value);
  else { store.remove(TOKEN_KEY); store.remove(USER_KEY); }
};
export const hasToken = () => Boolean(token);
export const savedUser = () => {
  if (!token) return null;
  try { return JSON.parse(store.get(USER_KEY) || 'null'); } catch { return null; }
};
export const saveUser = (user) => {
  if (user && token) store.set(USER_KEY, JSON.stringify(user));
  else store.remove(USER_KEY);
};
window.addEventListener('auth:logout', () => setToken(null));

const NETWORK_DOWN = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง';
const SERVER_DOWN = 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่';
const jsonError = (status, detail) => new Response(JSON.stringify({ detail }), {
  status, headers: { 'Content-Type': 'application/json' },
});
// 5xx ที่ไม่มีข้อความภาษาไทยจาก backend (nginx 502/504, uvicorn "Internal Server Error") -> ข้อความกลาง
const friendlyServerError = async (res) => {
  if (res.status < 500) return res;
  try {
    const data = await res.clone().json();
    if (typeof data?.detail === 'string' && /[\u0E00-\u0E7F]/.test(data.detail)) return res;
  } catch { /* ไม่ใช่ JSON (หน้า HTML ของ proxy) */ }
  return jsonError(res.status, SERVER_DOWN);
};

// จำนวน request ไป /api ที่ยังไม่ได้คำตอบ : หน้าโหลด (FoodSplash ใน App.jsx) รอจนว่างก่อนเฟดเข้าหน้า
let inflight = 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// รอจนไม่มี request ไป /api ค้างติดต่อกัน quietMs (กันช่วงที่ข้อมูลชุดแรกมาแล้วหน้ายิงชุดถัดไปต่อ) ; ไม่เกิน maxMs
export async function waitForApiIdle(quietMs = 400, maxMs = 8000) {
  const until = performance.now() + maxMs;
  let quietSince = inflight === 0 ? performance.now() : null;
  while (performance.now() < until) {
    if (inflight === 0) {
      if (quietSince === null) quietSince = performance.now();
      if (performance.now() - quietSince >= quietMs) return true;
    } else {
      quietSince = null;
    }
    await sleep(50);
  }
  return false;
}

window.fetch = async (input, init = {}) => {
  let url;
  try {
    url = new URL(typeof input === 'string' ? input : input.url, window.location.origin);
  } catch {
    return originalFetch(input, init);
  }
  if (url.origin !== API_ORIGIN || !url.pathname.startsWith('/api/')) {
    return originalFetch(input, init);
  }
  inflight += 1;
  try {
    return await apiFetch(url, input, init);
  } finally {
    inflight -= 1;
  }
};

async function apiFetch(url, input, init) {

  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  let res;
  try {
    res = await originalFetch(input, { ...init, headers });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;  // component ยกเลิกเอง (เช่น ออกจากหน้า) : ไม่ใช่เน็ตหลุด
    return jsonError(503, NETWORK_DOWN);
  }
  res = await friendlyServerError(res);

  if (TOKEN_PATHS.includes(url.pathname)) {
    if (res.ok) {
      try {
        const data = await res.clone().json();
        if (data && data.access_token) setToken(data.access_token);
      } catch { /* ไม่ใช่ JSON ก็ข้าม */ }
    }
  } else if (res.status === 401 && token) {
    setToken(null);  // ส่ง event ครั้งเดียว : request อื่นที่ได้ 401 ตามมาจะเจอ token = null แล้วข้าม
    let message = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
    try {
      const data = await res.clone().json();
      if (data && data.detail) message = data.detail;
    } catch { /* ไม่ใช่ JSON ก็ใช้ข้อความกลาง */ }
    window.dispatchEvent(new CustomEvent('auth:expired', { detail: message }));
  }
  return res;
}
