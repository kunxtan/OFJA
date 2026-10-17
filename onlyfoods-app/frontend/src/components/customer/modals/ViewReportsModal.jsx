

export default function ViewReportsModal({ isViewReportsModalOpen, setIsViewReportsModalOpen, myIssueReports }) {
  if (!isViewReportsModalOpen) return null;

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
