import { useEffect, useState } from 'react';

// เวลาปัจจุบัน (ms) ที่อัปเดตทุก intervalMs : เรียกใน component เล็กที่ต้องเดินตามเวลา (นาฬิกา นับถอยหลัง)
// แทนการเก็บ state เวลาไว้ที่หน้าหลัก ซึ่งทำให้ทั้งหน้า render ใหม่ทุกวินาที
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
