// ใส่ JWT ให้ทุก request ที่ไป /api โดยไม่ต้องแก้ fetch() ทีละจุดใน component
//  - เก็บ access_token จากผลของ /api/login, /api/register, /api/auth/google ไว้ในหน่วยความจำ (ไม่ลง localStorage)
//  - แนบ header  Authorization: Bearer <token>  เฉพาะ request ที่ไปหา origin ของ API
//  - ได้ 401 (หมดอายุ/ถูกระงับ/สัญญาร้านหมด) = ทิ้ง token แล้วส่ง event 'auth:expired' ให้ App.jsx เด้งไปหน้า login
const originalFetch = window.fetch.bind(window);
const API_ORIGIN = new URL(import.meta.env.VITE_API_URL || window.location.origin, window.location.origin).origin;
const TOKEN_PATHS = ['/api/login', '/api/register', '/api/auth/google'];
let token = null;

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

  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  const res = await originalFetch(input, { ...init, headers });

  if (TOKEN_PATHS.includes(url.pathname)) {
    if (res.ok) {
      try {
        const data = await res.clone().json();
        if (data && data.access_token) token = data.access_token;
      } catch { /* ไม่ใช่ JSON ก็ข้าม */ }
    }
    } else if (res.status === 401 && token) {
    token = null;  // ส่ง event ครั้งเดียว : request อื่นที่ได้ 401 ตามมาจะเจอ token = null แล้วข้าม
    let message = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
    try {
      const data = await res.clone().json();
      if (data && data.detail) message = data.detail;
    } catch { /* ไม่ใช่ JSON ก็ใช้ข้อความกลาง */ }
    window.dispatchEvent(new CustomEvent('auth:expired', { detail: message }));
  }
  return res;
};
