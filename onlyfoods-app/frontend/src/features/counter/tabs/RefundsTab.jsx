import RefundLog from '../../../shared/refunds/RefundLog';

// แท็บคืนเงินสดลูกค้า walk-in
// ข้อมูลและ state อยู่ที่ CounterView ส่งมาเป็น props (แท็บไม่ดึงข้อมูลเอง)
export default function RefundsTab({
  apiBase, fetchPendingRefunds
}) {
  return (
    <RefundLog apiBase={apiBase} canConfirm pollMs={10000} onChanged={fetchPendingRefunds} />
  );
}
