// ดึงข้อมูลซ้ำทุก ms มิลลิวินาที แบบไม่ถล่ม server :
//  - แท็บถูกซ่อน (สลับแอป/ล็อกจอ) = หยุด ; กลับมาดูอีกครั้ง = ดึงทันทีแล้วนับต่อ
//  - ถ้า fn คืน Promise จะไม่ยิงรอบใหม่ทับรอบที่ยังไม่เสร็จ (เน็ตช้า/server ช้า ไม่ให้ request กองซ้อน)
// คืนฟังก์ชันสำหรับหยุด (ใช้ใน cleanup ของ useEffect)
export function startPolling(fn, ms) {
  let busy = false;
  let timer = null;
  const run = () => {
    if (busy || (typeof document !== 'undefined' && document.hidden)) return;
    let result;
    try {
      result = fn();
    } catch (err) {
      console.error(err);
      return;
    }
    if (result && typeof result.then === 'function') {
      busy = true;
      result.catch(err => console.error(err)).finally(() => { busy = false; });
    }
  };
  const onVisible = () => { if (!document.hidden) run(); };
  timer = setInterval(run, ms);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  };
}
