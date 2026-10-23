import { useEffect, useRef } from 'react';

/* ปุ่มย้อนกลับของเบราว์เซอร์/มือถือ : เก็บหน้าที่เปิดอยู่ไว้ใน # ของ URL (เช่น #orders)
   - เปลี่ยนหน้า = เพิ่มประวัติ 1 รายการ ; กดย้อนกลับ = กลับไปหน้าก่อนหน้าในระบบ แทนที่จะออกจากเว็บ
   - refresh แล้วอยู่หน้าเดิม (อ่าน # ตอนเปิด)
   key   : ค่าหน้าปัจจุบันของ view (string)
   apply : (ค่าจาก #) => true ถ้าเปิดหน้านั้นได้ / false ถ้าไม่รู้จัก (เช่น # ของ role อื่นที่ค้างมา) */
const readHash = () => window.location.hash.replace(/^#/, '');

export function useHistoryNav(key, apply) {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const mounted = useRef(false);

  useEffect(() => {
    const onPop = () => {
      const hash = readHash();
      if (!hash || !applyRef.current(hash)) applyRef.current(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const hash = readHash();
    if (!mounted.current) {
      mounted.current = true;
      if (hash && hash !== key && applyRef.current(hash)) return;
      if (hash !== key) window.history.replaceState(window.history.state, '', `#${key}`);
      return;
    }
    if (hash !== key) window.history.pushState(null, '', `#${key}`);
  }, [key]);
}

// ออกจากระบบ : ล้าง # ของหน้าเดิม (คนถัดไปที่ login เครื่องนี้เริ่มที่หน้าแรกของตัวเอง)
export function clearHistoryNav() {
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
}
