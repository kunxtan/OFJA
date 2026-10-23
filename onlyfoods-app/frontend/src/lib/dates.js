// วันที่ล้วน ๆ (ไม่มี UI) ใช้ร่วมได้ทุกบทบาท

export const pad2 = (n) => String(n).padStart(2, '0');

export function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function rangeDayCount(startISO, endISO) {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}
