// จำผลของ API ไว้ระหว่างสลับหน้า (stale-while-revalidate)
//  - กลับเข้าหน้าเดิม = เห็นข้อมูลรอบล่าสุดทันที แล้วโหลดใหม่อยู่ข้างหลัง (ไม่เห็น 0 / ว่าง / "กำลังโหลด" ซ้ำทุกครั้ง)
//  - หลายหน้าใช้ key เดียวกัน = ยิงครั้งเดียว (คำขอที่ยังไม่จบใช้ร่วมกัน) และเห็นข้อมูลชุดเดียวกัน
//  - เก็บในหน่วยความจำของแท็บเท่านั้น (รีเฟรช/ปิดแท็บก็หาย) ; ออกจากระบบ / เซสชันหมดอายุ = ล้างทั้งหมดทันที
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { startPolling } from './polling';
import { whenAppReady } from './appReady';

const cache = new Map();      // key -> { data, at, json }
const inflight = new Map();   // key -> Promise
const listeners = new Map();  // key -> Set<fn>
let generation = 0;           // เพิ่มทุกครั้งที่ล้าง : คำขอของผู้ใช้คนก่อนที่ตอบกลับมาทีหลังจะไม่ถูกเก็บ

const emit = (key) => listeners.get(key)?.forEach(fn => fn());

export const hasCache = (key) => cache.has(key);
export const readCache = (key) => cache.get(key)?.data;
// ข้อมูลของ key นี้โหลดมาไม่เกิน ms มิลลิวินาที
export const isFresh = (key, ms) => cache.has(key) && Date.now() - cache.get(key).at < ms;

// เขียนผลลง cache ; ข้อมูลเหมือนเดิม = ไม่แจ้งหน้าจอ (ไม่ render ซ้ำทุกรอบ polling)
export function writeCache(key, data) {
  let json = null;
  try { json = JSON.stringify(data); } catch { /* ข้อมูลแปลก ๆ : ถือว่าเปลี่ยนเสมอ */ }
  const prev = cache.get(key);
  const now = Date.now();
  if (prev && json !== null && prev.json === json) { prev.at = now; return; }
  cache.set(key, { data, at: now, json });
  emit(key);
}

// โหลดผ่าน cache : มีคำขอ key นี้ค้างอยู่ = ใช้ตัวเดิม (ไม่ยิงซ้อน)
export function fetchCached(key, fetcher) {
  if (inflight.has(key)) return inflight.get(key);
  const gen = generation;
  const p = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      if (gen === generation) writeCache(key, data);
      return data;
    })
    .finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

// โหลดล่วงหน้า (เช่นตอนเครื่องว่าง) : ข้ามถ้ากำลังโหลดอยู่ หรือมีข้อมูลที่ยังใหม่กว่า maxAgeMs
export function prefetch(key, fetcher, maxAgeMs = 30000) {
  const entry = cache.get(key);
  if (inflight.has(key) || (entry && Date.now() - entry.at < maxAgeMs)) return;
  fetchCached(key, fetcher).catch(() => { /* โหลดล่วงหน้าไม่สำเร็จ : หน้าจริงจะลองใหม่เอง */ });
}

// โหลดล่วงหน้าหลายรายการตอนเครื่องว่าง : queries = [[key, fetcher], ...] ; คืนฟังก์ชันยกเลิก
//  1) รอให้หน้าโหลดรูปอาหารหายก่อน (หน้าโหลดรอจนไม่มีคำขอ /api ค้าง ถ้ายิงระหว่างนั้นหน้าโหลดจะค้างนานขึ้นบนเน็ตช้า)
//  2) รอ delayMs  3) ยิงตอนเบราว์เซอร์ว่าง
export function prefetchWhenIdle(queries, delayMs = 1500) {
  let cancelled = false;
  let idleId = null;
  const run = () => { if (!cancelled) queries.forEach(([key, fetcher]) => prefetch(key, fetcher)); };
  let timer = null;
  whenAppReady().then(() => {
    if (cancelled) return;
    timer = setTimeout(() => {
      if (typeof window !== 'undefined' && window.requestIdleCallback) idleId = window.requestIdleCallback(run, { timeout: 3000 });
      else run();
    }, delayMs);
  });
  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (idleId !== null && typeof window !== 'undefined' && window.cancelIdleCallback) window.cancelIdleCallback(idleId);
  };
}

export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => {
    const set = listeners.get(key);
    set?.delete(fn);
    if (set && !set.size) listeners.delete(key);
  };
}

export function clearApiCache() {
  generation += 1;
  const keys = [...cache.keys()];
  cache.clear();
  inflight.clear();
  keys.forEach(emit);
}

if (typeof window !== 'undefined') {
  // App.jsx ส่ง auth:logout ตอนกดออกจากระบบ ; authFetch.js ส่ง auth:expired เมื่อ token ใช้ไม่ได้
  window.addEventListener('auth:logout', clearApiCache);
  window.addEventListener('auth:expired', clearApiCache);
}

// ใช้ในหน้า : const { data, loading, error, reload } = useCachedApi(key, fetcher, { pollMs })
//  data    : ผลรอบล่าสุดของ key นี้ (undefined = ยังไม่เคยโหลด)
//  loading : true เฉพาะตอนยังไม่มีข้อมูลเลย (ครั้งแรก) -> แสดงโครงสีเทา ; กลับเข้าหน้าเดิมจะเป็น false ทันที
//  key = null : ยังไม่ต้องโหลด
//  staleMs : มีข้อมูลที่ใหม่กว่านี้อยู่แล้ว = ไม่ต้องโหลดซ้ำตอนเปิดหน้า (ใช้เมื่อมีคนอื่นรีเฟรช key นี้ให้อยู่แล้ว)
export function useCachedApi(key, fetcher, { pollMs = 0, staleMs = 0 } = {}) {
  const [, rerender] = useReducer(n => n + 1, 0);
  const [failure, setFailure] = useState({ key: null, message: '' });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(() => {
    if (!key) return Promise.resolve(undefined);
    return fetchCached(key, () => fetcherRef.current())
      .then((data) => { setFailure(f => (f.key === key ? { key: null, message: '' } : f)); return data; })
      .catch((err) => { setFailure({ key, message: err?.message || String(err) }); });
  }, [key]);

  useEffect(() => {
    if (!key) return undefined;
    const unsubscribe = subscribe(key, rerender);
    rerender(); // key เปลี่ยน : แสดงข้อมูลที่จำไว้ของ key ใหม่ทันที
    if (!(staleMs && isFresh(key, staleMs))) reload();
    const stop = pollMs ? startPolling(reload, pollMs) : null;
    return () => { unsubscribe(); stop?.(); };
  }, [key, pollMs, staleMs, reload]);

  const data = key ? readCache(key) : undefined;
  const error = failure.key === key ? failure.message : '';
  return { data, loading: Boolean(key) && data === undefined && !error, error, reload };
}
