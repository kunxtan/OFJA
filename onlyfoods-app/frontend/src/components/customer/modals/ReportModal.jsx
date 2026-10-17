import { COLORS } from "../constants";

export default function ReportModal({
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
