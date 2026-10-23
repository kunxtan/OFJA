import RefundLog from '../../../shared/refunds/RefundLog';

// หน้าบันทึกการคืนเงินทุกร้าน (ดูอย่างเดียว)
// ข้อมูลและ state อยู่ที่ AccountantView ส่งมาเป็น props (หน้าไม่ดึงข้อมูลเอง)
export default function RefundsPage({
  baseRef, apiBase
}) {
  return (
    <RefundLog apiBase={baseRef.current || apiBase || ''} showStore pollMs={15000} />
  );
}
