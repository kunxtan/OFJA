import { COLORS } from "../constants";

export default function TopUpModal({
  topUpOrder,
  outOfStockOrder,
  hiddenTopUpOrderId,
  topUpSlip,
  handleTopUpSlipChange,
  submitTopUpSlip,
  isSubmittingTopUp,
  cancelTopUpOrder,
  setHiddenTopUpOrderId,
}) {
  if (!topUpOrder || outOfStockOrder || hiddenTopUpOrderId === topUpOrder.OrderID) return null;
  const amount = Number(topUpOrder.TopUpAmount || 0);
  const waitingCheck = Boolean(topUpOrder.TopUpSlipUrl);
  const lastRejected = [...(topUpOrder.Payments || [])].reverse()
    .find((p) => p.PaymentType === "TOP_UP" && p.PaymentStatus === "REJECTED" && p.SlipUrl);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(42,44,65,0.75)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: COLORS.white, width: "min(460px, 100%)", maxHeight: "92vh", overflowY: "auto", borderRadius: "24px", padding: "25px", textAlign: "center" }}>
        <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: COLORS.navy }}>โอนส่วนต่างค่าอาหาร</h3>
        <p style={{ color: COLORS.gray, fontSize: "13px", marginTop: "6px" }}>
          คิว #{topUpOrder.QueueNo} • ร้าน {topUpOrder.StoreName} • เมนูใหม่ราคาสูงกว่าเดิม
        </p>
        <div style={{ fontSize: "30px", fontWeight: "900", color: COLORS.orange, margin: "8px 0" }}>{amount.toFixed(2)} ฿</div>

        {waitingCheck ? (
          <div style={{ background: "#ECFDF5", color: "#047857", padding: "12px", borderRadius: "12px", fontSize: "14px", fontWeight: "800" }}>
            ส่งสลิปแล้ว รอร้านตรวจสอบ
            <div style={{ fontSize: "12px", fontWeight: "normal", marginTop: "4px" }}>ร้านจะเริ่มทำอาหารหลังยืนยันสลิป (แนบใหม่ทับได้ถ้าส่งผิดรูป)</div>
          </div>
        ) : (
          <>
            {lastRejected && (
              <div style={{ background: "#FFF0ED", color: COLORS.red, padding: "10px", borderRadius: "12px", fontSize: "13px", fontWeight: "800", marginBottom: "10px" }}>
                สลิปก่อนหน้าถูกปฏิเสธ: {lastRejected.RejectReason || "สลิปไม่ถูกต้อง"} กรุณาแนบสลิปใหม่
              </div>
            )}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=PromptPay_${amount}`}
              alt="PromptPay QR Code"
              style={{ width: "160px", height: "160px", margin: "4px auto 10px", display: "block" }}
            />
          </>
        )}

        <label style={{ display: "block", marginTop: "12px", padding: "12px", border: `2px dashed ${COLORS.border}`, borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "800", color: COLORS.navy }}>
          {topUpSlip ? "เปลี่ยนรูปสลิป" : waitingCheck ? "แนบสลิปใหม่ (ทับใบเดิม)" : "เลือกรูปสลิปส่วนต่าง"}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleTopUpSlipChange} style={{ display: "none" }} />
        </label>
        {topUpSlip && <img src={topUpSlip} alt="Slip Preview" style={{ width: "120px", maxHeight: "160px", objectFit: "contain", margin: "10px auto 0", display: "block", borderRadius: "10px", border: `1px solid ${COLORS.border}` }} />}

        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            onClick={submitTopUpSlip}
            disabled={!topUpSlip || isSubmittingTopUp}
            style={{ width: "100%", padding: "14px", border: "none", borderRadius: "14px", background: topUpSlip ? COLORS.green : "#CCCCCC", color: COLORS.white, fontWeight: "900", fontSize: "15px", cursor: topUpSlip ? "pointer" : "not-allowed" }}
          >
            {isSubmittingTopUp ? "กำลังส่ง..." : "ส่งสลิปส่วนต่าง"}
          </button>
          {!waitingCheck && (
            <button
              onClick={cancelTopUpOrder}
              style={{ width: "100%", padding: "14px", border: `1px solid ${COLORS.red}`, borderRadius: "14px", background: "#FFF0ED", color: COLORS.red, fontWeight: "900", fontSize: "15px", cursor: "pointer" }}
            >
              ไม่โอน ยกเลิกออเดอร์ (คืนเงินค่าอาหาร)
            </button>
          )}
          <button
            onClick={() => setHiddenTopUpOrderId(topUpOrder.OrderID)}
            style={{ width: "100%", padding: "10px", border: "none", background: "transparent", color: COLORS.gray, fontSize: "13px", cursor: "pointer" }}
          >
            ปิดไว้ก่อน (เปิดอีกครั้งได้จากประวัติการสั่งซื้อ)
          </button>
        </div>
      </div>
    </div>
  );
}
