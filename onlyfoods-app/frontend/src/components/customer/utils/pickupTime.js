// ตัวช่วยเลือกเวลารับอาหารแบบ "ชั่วโมง + นาที"
// กติกา: เลือกได้ทุกเลข ห้ามย้อนอดีต และต้องอยู่ในเวลาเปิด–ปิดของศูนย์อาหาร
// ทุกฟังก์ชันคิดเป็น "นาทีของวัน" (00:00 = 0, 12:30 = 750, 23:59 = 1439)

export const pad2 = (n) => String(n).padStart(2, "0");

// "12:30" / "12:30 น." / "12:30:00" -> 750 (อ่านไม่ได้คืน null)
export const toMinutes = (hhmm) => {
  const m = String(hhmm || "").match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// ช่วงที่เลือกได้: ตั้งแต่ "ตอนนี้ (หรือเวลาเปิด ถ้าเปิดทีหลัง)" ถึง "เวลาปิด"
export const getPickupRange = ({ nowTime, openTime, closeTime }) => {
  const now = toMinutes(nowTime) ?? 0;
  const open = toMinutes(openTime);
  const close = toMinutes(closeTime);
  return { earliest: Math.max(now, open ?? 0), latest: close ?? 24 * 60 - 1 };
};

// ชั่วโมงที่ยังมีนาทีให้เลือกอย่างน้อย 1 นาที (ชั่วโมงที่ผ่านไปแล้วจะไม่แสดง)
export const getPickupHours = (range) =>
  Array.from({ length: 24 }, (_, h) => h).filter((h) => h * 60 + 59 >= range.earliest && h * 60 <= range.latest);

// นาทีนี้ (ในชั่วโมงที่เลือก) เลือกไม่ได้หรือไม่ เช่น ผ่านไปแล้ว หรือเลยเวลาปิด
export const isPickupMinuteDisabled = (hour, minute, range) => {
  const t = Number(hour) * 60 + Number(minute);
  return t < range.earliest || t > range.latest;
};
