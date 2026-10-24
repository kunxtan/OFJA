// หนึ่งเบราว์เซอร์ = หนึ่งบัญชี : ทุกแท็บของเว็บนี้ในเบราว์เซอร์เดียวกันใช้บัญชีเดียวกัน
//  - เปิดแท็บใหม่      : ขอเซสชันจากแท็บที่ล็อกอินอยู่ -> เข้าระบบให้เลย ไม่ต้องล็อกอินซ้ำ
//  - ล็อกอินในแท็บหนึ่ง : แท็บที่อยู่หน้า login เข้าระบบตาม ; แท็บที่เป็นบัญชีอื่นขึ้นแจ้งให้สลับบัญชี
//  - ออกจากระบบ / เซสชันหมดอายุในแท็บหนึ่ง : ทุกแท็บกลับหน้า login พร้อมกัน
// คุยกันผ่าน BroadcastChannel (เฉพาะแท็บของโดเมนนี้ในเบราว์เซอร์เดียวกัน ไม่ออกนอกเครื่อง)
// token ยังเก็บใน sessionStorage ของแต่ละแท็บเหมือนเดิม : ปิดทุกแท็บแล้วต้องล็อกอินใหม่ (ไม่ค้างข้ามวัน)
import { adoptSession, currentToken, savedUser } from '../authFetch.js';

const CHANNEL_NAME = 'onlyfoods.session';
// localStorage : เวลาล่าสุดที่ยังมีแท็บล็อกอินอยู่ (ไม่มี token) ; แท็บใหม่ใช้ตัดสินว่าควรรอขอเซสชันหรือไม่
const ALIVE_KEY = 'onlyfoods.sessionAlive';
const ALIVE_EVERY_MS = 4000;
const ALIVE_FRESH_MS = 10000;

const tabId = Math.random().toString(36).slice(2);
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
let applyingRemote = false;  // กำลังทำตามแท็บอื่น : ไม่ประกาศต่อ (กันส่งวน)
let bootWaiter = null;       // แท็บใหม่ที่กำลังรอเซสชันจากแท็บอื่นก่อนแสดงหน้าแรก

const post = (msg) => { try { channel?.postMessage({ ...msg, from: tabId }); } catch { /* ส่งไม่ได้ก็ทำงานแบบแท็บเดี่ยว */ } };
const sameAccount = (a, b) => Boolean(a && b) && String(a.UserId) === String(b.UserId) && a.role === b.role;

const markAlive = () => {
  try {
    if (currentToken()) localStorage.setItem(ALIVE_KEY, String(Date.now()));
  } catch { /* storage ถูกบล็อก */ }
};
const otherTabMayBeLoggedIn = () => {
  try { return Date.now() - Number(localStorage.getItem(ALIVE_KEY) || 0) < ALIVE_FRESH_MS; } catch { return false; }
};

// ทำตามแท็บอื่นโดยใช้ event เดิมของระบบ (App.jsx / authFetch.js / apiCache ฟังอยู่แล้ว) แต่ไม่ประกาศต่อ
const asRemote = (fn) => {
  applyingRemote = true;
  try { fn(); } finally { applyingRemote = false; }
};

function onMessage({ data: msg }) {
  if (!msg || msg.from === tabId) return;
  if (msg.to && msg.to !== tabId) return;

  if (msg.type === 'hello') {
    // แท็บใหม่ขอเซสชัน : ตอบเฉพาะแท็บที่ล็อกอินอยู่
    const user = savedUser();
    if (currentToken() && user) post({ type: 'session', token: currentToken(), user, to: msg.from });
    return;
  }

  if (msg.type === 'session') {
    if (!msg.token || !msg.user) return;
    if (bootWaiter) {
      // แท็บใหม่ยังไม่แสดงหน้าแรก : รับเซสชันเงียบ ๆ แล้วค่อยแสดง (ไม่เห็นหน้า login แวบ)
      adoptSession(msg.token, msg.user);
      bootWaiter();
      return;
    }
    const mine = savedUser();
    if (!currentToken()) {
      // แท็บนี้อยู่หน้า login (หรือรอสลับบัญชี) : เข้าระบบตาม
      adoptSession(msg.token, msg.user);
      asRemote(() => window.dispatchEvent(new CustomEvent('auth:remote-login', { detail: msg.user })));
    } else if (sameAccount(mine, msg.user)) {
      adoptSession(msg.token, msg.user);  // บัญชีเดิม ล็อกอินใหม่ในอีกแท็บ : ใช้ token ล่าสุด
    } else {
      // บัญชีอื่นล็อกอินในแท็บอื่น : เก็บไว้ใช้หลังรีโหลด ; แท็บนี้หยุดใช้บัญชีเดิมทันทีแล้วขึ้นแจ้ง
      adoptSession(msg.token, msg.user, false);
      asRemote(() => window.dispatchEvent(new CustomEvent('auth:remote-switch', { detail: msg.user })));
    }
    return;
  }

  if (msg.type === 'logout') {
    if (!currentToken()) return;
    asRemote(() => {
      window.dispatchEvent(new Event('auth:logout'));        // authFetch ทิ้ง token / apiCache ล้างข้อมูลที่จำไว้
      window.dispatchEvent(new Event('auth:remote-logout')); // App กลับหน้า login
    });
    return;
  }

  if (msg.type === 'expired') {
    if (!currentToken()) return;
    asRemote(() => {
      window.dispatchEvent(new Event('auth:logout'));
      window.dispatchEvent(new CustomEvent('auth:expired', { detail: msg.message }));
    });
  }
}

if (channel) {
  channel.addEventListener('message', onMessage);
  window.addEventListener('auth:session', (e) => {
    markAlive();
    if (!applyingRemote) post({ type: 'session', token: e.detail.token, user: e.detail.user });
  });
  window.addEventListener('auth:logout', () => {
    if (!applyingRemote) post({ type: 'logout' });
    try { localStorage.removeItem(ALIVE_KEY); } catch { /* ignore */ }
  });
  window.addEventListener('auth:expired', (e) => {
    if (!applyingRemote) post({ type: 'expired', message: e.detail });
  });
  setInterval(markAlive, ALIVE_EVERY_MS);
  markAlive();
}

// เรียกก่อนแสดงหน้าแรก (main.jsx) : แท็บใหม่ที่ยังไม่ล็อกอิน + มีแท็บอื่นล็อกอินอยู่ = รอรับเซสชันไม่เกิน maxWaitMs
// ไม่มีแท็บอื่นล็อกอิน (หรือเบราว์เซอร์ไม่รองรับ) = แสดงหน้าแรกทันที ไม่ต้องรอ
export function bootstrapTabSession(maxWaitMs = 700) {
  if (!channel || currentToken() || !otherTabMayBeLoggedIn()) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { bootWaiter = null; resolve(); }, maxWaitMs);
    bootWaiter = () => { clearTimeout(timer); bootWaiter = null; resolve(); };
    post({ type: 'hello' });
  });
}
