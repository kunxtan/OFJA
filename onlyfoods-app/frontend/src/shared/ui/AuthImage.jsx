// รูปที่ต้องเช็คสิทธิ์ (สลิป / QR / สลิปโอนคืน) : <img> แนบ token เองไม่ได้ จึงดึงไฟล์ผ่าน fetch (authFetch แนบ token ให้)
// แล้วแสดงเป็น blob URL
//  - /uploads/slips/x.png -> /api/files/slips/x.png ; path อื่น (รูปเมนู/ร้าน/data URL) ใช้ตรงเหมือนเดิม
//  - เก็บรูปที่โหลดแล้วไว้ใช้ซ้ำ (หน้าร้าน poll ทุกไม่กี่วินาที ไม่ต้องโหลดใหม่ทุกรอบ) นับจำนวนที่ใช้อยู่
//    ไม่มีใครใช้แล้วค่อย revokeObjectURL (รอสักพัก เผื่อหน้าจอ render ใหม่แล้วใช้รูปเดิมต่อ)
//  - ปิดหน้าต่างก่อนโหลดเสร็จ = ยกเลิกการโหลด
import { useEffect, useState } from 'react';

const PROTECTED = /^\/uploads\/(slips|refunds)\/([0-9a-f]{32}\.(?:png|jpe?g|webp))$/;
const RELEASE_DELAY_MS = 30000;
const cache = new Map();   // path -> { url, users, promise, controller, timer }

export const isProtectedPath = (path) => PROTECTED.test(String(path || ''));

function apiPath(path) {
  const m = String(path).match(PROTECTED);
  return `/api/files/${m[1]}/${m[2]}`;
}

function acquire(apiBase, path) {
  let entry = cache.get(path);
  if (entry) {
    clearTimeout(entry.timer);
    entry.users += 1;
    return entry;
  }
  const controller = new AbortController();
  entry = { url: null, users: 1, controller, timer: null };
  entry.promise = fetch(`${apiBase}${apiPath(path)}`, { signal: controller.signal })
    .then((res) => {
      if (!res.ok) throw new Error(res.status === 404 ? 'ไม่พบรูปหรือไม่มีสิทธิ์ดู' : 'โหลดรูปไม่สำเร็จ');
      return res.blob();
    })
    .then((blob) => {
      entry.url = URL.createObjectURL(blob);
      return entry.url;
    })
    .catch((err) => {
      cache.delete(path);   // ครั้งหน้าลองโหลดใหม่ได้
      throw err;
    });
  cache.set(path, entry);
  return entry;
}

function release(path) {
  const entry = cache.get(path);
  if (!entry) return;
  entry.users -= 1;
  if (entry.users > 0) return;
  if (!entry.url) {          // ยังโหลดไม่เสร็จและไม่มีใครรอแล้ว -> ยกเลิก
    entry.controller.abort();
    cache.delete(path);
    return;
  }
  entry.timer = setTimeout(() => {
    if (cache.get(path) === entry && entry.users <= 0) {
      URL.revokeObjectURL(entry.url);
      cache.delete(path);
    }
  }, RELEASE_DELAY_MS);
}

// คืน { src, error } ของรูป ; path ที่ไม่ต้องเช็คสิทธิ์คืนค่าเดิมทันที
export function useFileUrl(apiBase, path) {
  const protectedPath = isProtectedPath(path);
  const [state, setState] = useState(() => ({ src: protectedPath ? cache.get(path)?.url || null : path || null, error: '' }));
  useEffect(() => {
    if (!protectedPath) { setState({ src: path || null, error: '' }); return undefined; }
    let alive = true;
    const entry = acquire(apiBase || '', path);
    if (entry.url) setState({ src: entry.url, error: '' });
    else {
      setState({ src: null, error: '' });
      entry.promise.then((url) => { if (alive) setState({ src: url, error: '' }); })
        .catch((err) => { if (alive && err.name !== 'AbortError') setState({ src: null, error: err.message }); });
    }
    return () => { alive = false; release(path); };
  }, [apiBase, path, protectedPath]);
  return state;
}

// เปิดรูปเต็มในแท็บใหม่ (ลิงก์ตรง /uploads/slips ใช้ไม่ได้แล้ว เพราะไม่มี token)
export async function openFile(apiBase, path) {
  if (!isProtectedPath(path)) { window.open(path, '_blank', 'noopener'); return; }
  const tab = window.open('', '_blank');   // เปิดก่อน await กัน popup blocker
  const entry = acquire(apiBase || '', path);
  try {
    const url = entry.url || await entry.promise;
    if (tab) tab.location.href = url; else window.open(url, '_blank');
  } catch (err) {
    if (tab) tab.close();
    window.alert(err.message);
  } finally {
    release(path);
  }
}

const PLACEHOLDER = {
  display: 'inline-grid', placeItems: 'center', minWidth: '42px', minHeight: '42px', padding: '6px',
  borderRadius: '8px', background: 'rgba(148,163,184,0.15)', color: '#64748b', fontSize: '11px', textAlign: 'center',
};

export default function AuthImage({ apiBase, src: path, alt = '', fallback = null, className, style, ...rest }) {
  const { src, error } = useFileUrl(apiBase, path);
  if (error) return fallback || <span className={className} style={{ ...PLACEHOLDER, ...style }} role="img" aria-label={alt}>{error}</span>;
  if (!src) return fallback || <span className={className} style={{ ...PLACEHOLDER, ...style }} role="img" aria-label={alt} aria-busy="true">กำลังโหลด…</span>;
  return <img src={src} alt={alt} className={className} style={style} {...rest} />;
}
