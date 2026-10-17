import { COLORS } from "../constants";

export default function CustomAlert({ alertData, setAlertData }) {
  if (!alertData.isOpen) return null;

  const getIcon = () => {
    switch (alertData.type) {
      case "success": return "✔";
      case "error": return "✖";
      case "warning": return "🛇";
      default: return "✔";
    }
  };

  const getButtonColor = () => {
    switch (alertData.type) {
      case "success": return COLORS.green;
      case "error": return COLORS.red;
      case "warning": return COLORS.orange;
      default: return COLORS.green;
    }
  };

  const closeAlert = () => setAlertData({ ...alertData, isOpen: false });

  const handleConfirm = () => {
    if (alertData.onConfirm) alertData.onConfirm();
    closeAlert();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(42,44,65,0.6)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        boxSizing: "border-box",
      }}
      onClick={closeAlert}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.white,
          width: "min(380px, 100%)",
          borderRadius: "24px",
          padding: "30px 25px",
          textAlign: "center",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: "55px", marginBottom: "15px" }}>{getIcon()}</div>

        <h3 style={{ margin: "0 0 10px", fontSize: "22px", fontWeight: "900", color: COLORS.navy }}>
          {alertData.title}
        </h3>

        <div style={{ margin: "0 0 25px", fontSize: "14px", color: COLORS.gray, whiteSpace: "pre-line", lineHeight: "1.6" }}>
          {alertData.message}
        </div>

        {alertData.onConfirm ? (
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={closeAlert}
              style={{
                flex: 1, padding: "14px", border: "1px solid #ddd", borderRadius: "14px",
                background: COLORS.white, color: COLORS.gray, fontWeight: "900", fontSize: "15px", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              ยกเลิก
            </button>

            <button
              onClick={handleConfirm}
              style={{
                flex: 1, padding: "14px", border: "none", borderRadius: "14px",
                background: getButtonColor(), color: COLORS.white, fontWeight: "900", fontSize: "15px", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              เปลี่ยนร้าน
            </button>
          </div>
        ) : (
          <button
            onClick={closeAlert}
            style={{
              width: "100%", padding: "14px", border: "none", borderRadius: "14px",
              background: getButtonColor(), color: COLORS.white, fontWeight: "900", fontSize: "16px", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            ตกลง
          </button>
        )}
      </div>
    </div>
  );
}
