import { fmtMoney } from '../lib';
import { SkeletonRows } from '../../../shared/ui/Skeleton';

// แท็บสรุปยอดของร้าน
// ข้อมูลและ state อยู่ที่ CounterView ส่งมาเป็น props (แท็บไม่ดึงข้อมูลเอง)
export default function ReportsTab({
  fetchReports, reportData, reportCancellations, reportsLoading, products
}) {
  // เปิดแท็บครั้งแรกก่อนข้อมูลมา : แสดง "–" และโครงสีเทา แทนตัวเลข 0
  const dash = (value) => (reportsLoading ? '–' : value);
  return (
    <div className="cv-stack">
                  <div className="cv-card">
                    <div className="cv-card-head">
                      <div>
                        <h3>📊 รายงานหน้าร้าน</h3>
                        <div className="caption">สรุปข้อมูลจากระบบของร้านนี้</div>
                      </div>
                      <button onClick={fetchReports} className="cv-btn btn-ghost">↻ รีเฟรช</button>
                    </div>
                    <div className="report-grid">
                      <div className="report-card"><span>ยอดขายสุทธิ</span><b>{dash(`฿${fmtMoney(reportData?.net_sales)}`)}</b><small>Completed + No-Show ตาม API รายงาน</small></div>
                      <div className="report-card"><span>จำนวนออเดอร์</span><b>{dash(reportData?.total_orders ?? 0)}</b><small>ออเดอร์ที่ถูกนับในรายงาน</small></div>
                      <div className="report-card"><span>ยกเลิก</span><b>{dash(reportCancellations.length)}</b><small>รายการสถานะ Cancelled</small></div>
                      <div className="report-card"><span>เมนูหมดตอนนี้</span><b>{products.filter(p => p.IsOutOfStock).length}</b><small>สถานะจาก Menu & Stock</small></div>
                    </div>
                  </div>

                  <div className="cv-card">
                    <div className="cv-card-head"><div><h3>ประวัติการยกเลิก</h3><div className="caption">ใช้ตรวจสอบปัญหาออเดอร์และเหตุผลที่ยกเลิก</div></div></div>
                    <div className="cv-table-wrapper">
                      <table className="cv-table">
                        <thead><tr><th>คิว</th><th>ยอดเงิน</th><th>เหตุผล</th><th>Order ID</th></tr></thead>
                        <tbody>
                          {reportsLoading ? <tr><td colSpan="4" style={{ padding: 0 }}><SkeletonRows rows={4} columns={[1, 1, 3, 1]} label="กำลังโหลดประวัติการยกเลิก" /></td></tr> : reportCancellations.length === 0 ? <tr><td colSpan="4" className="empty-state">ยังไม่มีประวัติการยกเลิก</td></tr> : reportCancellations.slice(0, 20).map(o => (
                            <tr key={o.OrderID}><td><span className="queue-pill">{o.QueueNo}</span></td><td>฿{fmtMoney(o.TotalAmount)}</td><td>{o.CancelReason || '-'}</td><td>#{o.OrderID}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
  );
}
