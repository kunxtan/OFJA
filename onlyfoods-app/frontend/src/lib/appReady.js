// หน้าโหลดรูปอาหาร (FoodSplash) ยังแสดงอยู่หรือไม่ : App.jsx ตั้งค่า ; การโหลดล่วงหน้า (lib/apiCache) รอให้หน้าโหลดหายก่อน
// (หน้าโหลดรอจน "ไม่มีคำขอ /api ค้าง" ถ้าโหลดล่วงหน้าระหว่างนั้น หน้าโหลดจะค้างนานขึ้นโดยไม่จำเป็น)
let ready = true;
let waiters = [];

export function setAppReady(value) {
  ready = value;
  if (ready) {
    const run = waiters;
    waiters = [];
    run.forEach(fn => fn());
  }
}

export const whenAppReady = () => (ready ? Promise.resolve() : new Promise(resolve => waiters.push(resolve)));
