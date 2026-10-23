// โหลดไฟล์ JS ของหน้าไม่ได้ เพราะมี deploy ใหม่ (ชื่อไฟล์มีรหัสของ build ไฟล์ของ build เก่าถูกลบไปแล้ว)
// -> รีโหลดหน้าเว็บ 1 ครั้งเพื่อรับ index.html ของ build ล่าสุด (token อยู่ใน sessionStorage จึงยังล็อกอินอยู่)
const KEY = 'onlyfoods.chunkReloadAt';
const RELOAD_GUARD_MS = 30000;

// ข้อความ error ของแต่ละเบราว์เซอร์ตอน import() ไฟล์ไม่สำเร็จ (Chrome / Safari / Firefox / CSS ของ Vite)
export const isChunkLoadError = (err) =>
  /dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(String(err?.message || err || ''));

// คืน true ถ้าสั่งรีโหลดแล้ว ; false = เพิ่งรีโหลดไปไม่ถึง 30 วิ (ไฟล์หายจริง/เน็ตหลุด) ให้ผู้ใช้เห็นข้อความแล้วกดเอง จะได้ไม่วนรีโหลด
export function reloadOnceForNewVersion() {
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY) || 0); } catch { /* storage ถูกบล็อก */ }
  if (Date.now() - last < RELOAD_GUARD_MS) return false;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage ถูกบล็อก */ }
  window.location.reload();
  return true;
}
