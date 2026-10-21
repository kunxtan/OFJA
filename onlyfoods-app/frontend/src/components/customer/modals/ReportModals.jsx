// กลุ่มโมดัลรายงานปัญหา: ส่งรายงาน, ดูรายงานที่เคยส่ง
import { COLORS } from "../constants";
import { getOrderStatusLabel } from "../utils/orders";

// ===== ReportModal =====
export function ReportModal({
  isReportModalOpen,
  setIsReportModalOpen,
  selectedOrderForReport,
  issueType,
  setIssueType,
  issueDescription,
  setIssueDescription,
  handleSubmitReport,
  isSubmittingReport,
}) {
  if (!isReportModalOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(42,44,65,0.6)",
        zIndex: 2500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        boxSizing: "border-box"
      }}
      onClick={() => setIsReportModalOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.white,
          width: "min(460px, 100%)",
          borderRadius: "24px",
          padding: "25px",
          boxSizing: "border-box"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
          <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: COLORS.navy }}>
             รายงานปัญหาการใช้งาน / คำสั่งซื้อ
          </h3>
          <button
            onClick={() => setIsReportModalOpen(false)}
            style={{ border: "none", background: COLORS.lightGray, width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer", fontSize: "18px" }}
          >
            ×
          </button>
        </div>

        {selectedOrderForReport && (
          <div style={{ background: COLORS.bg, padding: "10px 14px", borderRadius: "12px", fontSize: "13px", marginBottom: "15px", border: `1px solid ${COLORS.border}` }}>
            <b>ออเดอร์อ้างอิง:</b> คิว #{selectedOrderForReport.QueueNo} ({selectedOrderForReport.StoreName})
          </div>
        )}

        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: "800", marginBottom: "6px" }}>ประเภทปัญหา</label>
          <select
            value={issueType}
            onChange={(e) => setIssueType(e.target.value)}
            style={{ width: "100%", padding: "11px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, fontFamily: "inherit" }}
          >
            <option value="อาหารไม่ตรงตามออเดอร์">อาหารไม่ตรงตามออเดอร์</option>
            <option value="ออเดอร์ถูกยกเลิก / ขอตรวจสอบเหตุผล">ออเดอร์ถูกยกเลิก / ขอตรวจสอบเหตุผล</option>
            <option value="อาหารรอนานเกินกำหนด">อาหารรอนานเกินกำหนด</option>
            <option value="ปัญหาเรื่องการชำระเงิน/สลิป">ปัญหาเรื่องการชำระเงิน/สลิป</option>
            <option value="คุณภาพ/รสชาติอาหาร">คุณภาพ/รสชาติอาหาร</option>
            <option value="ระบบขัดข้อง/อื่นๆ">ระบบขัดข้อง/อื่นๆ</option>
          </select>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: "800", marginBottom: "6px" }}>รายละเอียดปัญหา</label>
          <textarea
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
            placeholder="อธิบายปัญหาที่พบเพื่อความรวดเร็วในการตรวจสอบ..."
            rows={4}
            style={{ width: "100%", boxSizing: "border-box", padding: "11px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, fontFamily: "inherit", resize: "vertical" }}
          />
        </div>

        <button
          onClick={handleSubmitReport}
          disabled={isSubmittingReport}
          style={{
            width: "100%",
            padding: "14px",
            border: "none",
            borderRadius: "14px",
            background: isSubmittingReport ? "#CCCCCC" : COLORS.orange,
            color: COLORS.white,
            fontWeight: "900",
            fontSize: "15px",
            cursor: isSubmittingReport ? "not-allowed" : "pointer",
            fontFamily: "inherit"
          }}
        >
          {isSubmittingReport ? "กำลังส่งข้อมูล..." : "ส่งรายงานปัญหา"}
        </button>
      </div>
    </div>
  );
}

// ===== ViewReportsModal =====
// หน้าต่าง "รายละเอียดปัญหาที่แจ้งไว้": แสดงออเดอร์ที่เกี่ยวข้อง (คิว, ร้าน, เวลาสั่ง, เมนู, ยอดรวม) ในแต่ละเรื่องด้วย
// myOrders = รายการออเดอร์ของลูกค้า ใช้จับคู่กับรายงานด้วยเลขออเดอร์ (รายงานเองมีแค่ชื่อร้านกับเลขคิว)
export function ViewReportsModal({ isViewReportsModalOpen, setIsViewReportsModalOpen, myIssueReports, myOrders = [] }) {
  if (!isViewReportsModalOpen) return null;

  const findOrder = (report) => {
    const id = Number(report.OrderID ?? report.order_id);
    return id ? (myOrders || []).find((o) => Number(o.OrderID ?? o.OrderId) === id) || null : null;
  };

  const renderOrderBox = (report) => {
    const hasOrderRef = Boolean(report.OrderID ?? report.order_id);
    const order = findOrder(report);
    const queueNo = report.QueueNo || order?.QueueNo;
    const storeName = report.StoreName || order?.StoreName;

    if (!hasOrderRef) {
      return (
        <div style={{ fontSize: "12px", color: "#64748b", margin: "8px 0" }}>
          แจ้งปัญหาทั่วไป (ไม่ได้ระบุออเดอร์){storeName ? ` · ร้าน ${storeName}` : ""}
        </div>
      );
    }

    const items = Array.isArray(order?.items) ? order.items : [];
    return (
      <div style={{ margin: "8px 0 10px", padding: "10px 12px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ fontWeight: "800", fontSize: "13px", color: "#0f172a" }}>
            ออเดอร์ {queueNo ? `#${queueNo}` : `เลขที่ ${report.OrderID ?? report.order_id}`}
            {storeName && <span style={{ fontWeight: "600", color: "#475569" }}> · {storeName}</span>}
          </div>
          {order?.Status && (
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", background: "#f1f5f9", padding: "2px 8px", borderRadius: "10px", whiteSpace: "nowrap" }}>
              {getOrderStatusLabel(order.Status)}
            </span>
          )}
        </div>

        {order ? (
          <>
            {(order.OrderTime || order.order_time || order.CreatedAt) && (
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
                สั่งเมื่อ: {order.OrderTime || order.order_time || order.CreatedAt}
              </div>
            )}
            {items.length > 0 && (
              <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px dashed #e2e8f0" }}>
                {items.map((item, i) => (
                  <div key={item.OrderDetailID || i} style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "12px", padding: "2px 0", color: "#334155" }}>
                    <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                      <b>{item.ProductName}</b> x{item.Qty}
                      {item.ItemNote && <div style={{ fontSize: "11px", color: "#64748b" }}>หมายเหตุ: {item.ItemNote}</div>}
                    </div>
                    <span style={{ whiteSpace: "nowrap" }}>{(Number(item.UnitPrice || 0) * Number(item.Qty || 1)).toFixed(2)} ฿</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "12px", fontWeight: "800", color: "#0f172a" }}>
              <span>ยอดรวม</span>
              <span>{Number(order.TotalAmount || 0).toFixed(2)} ฿</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>ไม่พบรายละเอียดเมนูของออเดอร์นี้ในรายการล่าสุด</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#ffffff", width: "min(550px, 100%)", borderRadius: "16px", padding: "24px", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", color: "#0f172a", fontWeight: "800" }}>รายละเอียดปัญหาที่แจ้งไว้</h3>
          <button onClick={() => setIsViewReportsModalOpen(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}>✕</button>
        </div>

        {myIssueReports.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
            <div style={{ fontSize: "40px", marginBottom: "8px" }}></div>
            ไม่พบประวัติการแจ้งปัญหา
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {myIssueReports.map((report, idx) => (
              <div key={report.ReportID || idx} style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px", background: "#f8fafc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontWeight: "800", fontSize: "13px", color: "#0f172a" }}>
                    {report.IssueType || report.issue_type || "รายงานปัญหา"}
                  </span>
                  <span style={{
                    fontSize: "11px",
                    padding: "3px 8px",
                    borderRadius: "10px",
                    fontWeight: "bold",
                    background: report.Status === "Resolved" ? "#dcfce7" : report.Status === "In_Progress" ? "#fef3c7" : report.Status === "Rejected" ? "#e2e8f0" : "#fee2e2",
                    color: report.Status === "Resolved" ? "#166534" : report.Status === "In_Progress" ? "#92400e" : report.Status === "Rejected" ? "#475569" : "#991b1b"
                  }}>
                    {report.Status === "Resolved" ? "แก้ไขแล้ว" : report.Status === "In_Progress" ? "กำลังตรวจสอบ" : report.Status === "Rejected" ? "ไม่รับเรื่อง" : "รอดำเนินการ"}
                  </span>
                </div>

                {renderOrderBox(report)}

                <div style={{ fontSize: "13px", color: "#334155", margin: "6px 0" }}>
                  <b>รายละเอียด:</b> {report.Description || report.description}
                </div>

                {report.AdminNote && (
                  <div style={{ marginTop: "8px", padding: "8px 10px", background: "#e0f2fe", borderRadius: "8px", fontSize: "12px", color: "#0369a1" }}>
                    <b>การตอบกลับจากร้าน:</b> {report.AdminNote}
                  </div>
                )}

                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "8px", textAlign: "right" }}>
                  แจ้งเมื่อ:{" "}
                  {report.CreatedAt || report.created_at
                    ? new Date(report.CreatedAt || report.created_at).toLocaleString("th-TH", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "-"}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setIsViewReportsModalOpen(false)}
          style={{ width: "100%", marginTop: "20px", padding: "10px", background: "#64748b", color: "#ffffff", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
        >
          ปิดหน้าต่าง
        </button>
      </div>
    </div>
  );
}