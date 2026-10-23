import { useNow } from '../../shared/hooks/useNow';

// นาฬิกาบนแถบด้านบนของหน้าครัว : เดินเวลาเองทุกวินาที (หน้าครัวทั้งหน้าไม่ต้อง render ตาม)
export default function LiveClock() {
  const now = useNow(1000);
  return <span>{new Date(now).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} น.</span>;
}
