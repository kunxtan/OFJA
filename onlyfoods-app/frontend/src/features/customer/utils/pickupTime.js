// ตัวช่วยเลือกเวลารับอาหารแบบ "ชั่วโมง + นาที"
// กติกา: เลือกได้ทุกเลข ห้ามย้อนอดีต และต้องอยู่ในเวลาเปิด–ปิดของทั้งศูนย์อาหารและร้านค้า
// ทุกฟังก์ชันคิดเป็น "นาทีของวัน" (00:00 = 0, 12:30 = 750, 23:59 = 1439)

export const pad2 = (n) => String(n).padStart(2, "0");

// "12:30" / "12:30 น." / "12:30:00" -> 750 (อ่านไม่ได้คืน null)
export const toMinutes = (hhmm) => {
  const m = String(hhmm || "").match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// ช่วงที่เลือกได้: ตั้งแต่ "ตอนนี้ (หรือเวลาเปิด ถ้าเปิดทีหลัง)" ถึง "เวลาปิด"
// เวลาเปิด-ปิดมี 2 ชั้น คือ ศูนย์อาหาร (openTime/closeTime) และร้านค้า (storeOpenTime/storeCloseTime)
// ใช้ช่วงที่แคบที่สุดของทั้งสองชั้น = เปิดช้าที่สุด และ ปิดเร็วที่สุด (ไม่ส่งค่าร้านมา = ใช้เวลาศูนย์อาหารอย่างเดียว)
export const getPickupRange = ({ nowTime, openTime, closeTime, storeOpenTime, storeCloseTime }) => {
  const now = toMinutes(nowTime) ?? 0;
  const opens = [openTime, storeOpenTime].map((v) => toMinutes(v)).filter((v) => v !== null);
  const closes = [closeTime, storeCloseTime].map((v) => toMinutes(v)).filter((v) => v !== null);
  const open = opens.length ? Math.max(...opens) : 0;
  const close = closes.length ? Math.min(...closes) : 24 * 60 - 1;
  return { earliest: Math.max(now, open), earliestOpen: open, latest: close };
};

// ชั่วโมงที่ยังมีนาทีให้เลือกอย่างน้อย 1 นาที (ชั่วโมงที่ผ่านไปแล้วจะไม่แสดง)
export const getPickupHours = (range) =>
  Array.from({ length: 24 }, (_, h) => h).filter((h) => h * 60 + 59 >= range.earliest && h * 60 <= range.latest);

// นาทีนี้ (ในชั่วโมงที่เลือก) เลือกไม่ได้หรือไม่ เช่น ผ่านไปแล้ว หรือเลยเวลาปิด
export const isPickupMinuteDisabled = (hour, minute, range) => {
  const t = Number(hour) * 60 + Number(minute);
  return t < range.earliest || t > range.latest;
};

// เลือกชั่วโมงแล้วแต่ยังไม่เลือกนาที = เลือกเวลาไม่ครบ (ต้องเลือกนาทีให้ครบ หรือกด "รับทันที")
export const isPickupIncomplete = (hour, minute) => (hour !== "") !== (minute !== "");
