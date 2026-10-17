import { COLORS } from "../constants";

export default function PaymentModal({
  isPaymentModalOpen,
  setIsPaymentModalOpen,
  totalAmount,
  paymentMethod,
  handleSlipChange,
  slipPreview,
  submitOrder,
  isSubmittingOrder,
}) {
  if (!isPaymentModalOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(42,44,65,0.6)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        boxSizing: "border-box",
        overflowY: "auto",
      }}
      onClick={() => setIsPaymentModalOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.white,
          width: "min(500px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: "24px",
          padding: "25px",
          boxSizing: "border-box",
          textAlign: "center",
        }}
      >
        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
          <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "900" }}>ชำระเงิน</h3>
          <button
            onClick={() => setIsPaymentModalOpen(false)}
            style={{ border: "none", background: COLORS.lightGray, width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer", fontSize: "18px" }}
          >
            ×
          </button>
        </div>

        {/* TOTAL */}
        <div style={{ background: "#FFF9F5", padding: "15px", borderRadius: "15px", marginBottom: "18px", border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: "13px", color: COLORS.gray }}>ยอดชำระสุทธิ</div>
          <div style={{ fontSize: "28px", fontWeight: "900", color: COLORS.orange }}>{totalAmount.toFixed(2)} ฿</div>
        </div>

        {/* PROMPTPAY */}
        {paymentMethod === "PromptPay" && (
          <>
            <div style={{ margin: "15px 0", background: "#FFFFFF", padding: "15px", borderRadius: "16px", display: "inline-block", border: `2px solid ${COLORS.navy}` }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=PromptPay_${totalAmount}`}
                alt="PromptPay QR Code"
                style={{ width: "180px", height: "180px", display: "block" }}
              />
              <div style={{ fontSize: "11px", color: COLORS.gray, marginTop: "8px", fontWeight: "700" }}>PromptPay (จำลองระบบ)</div>
            </div>

            <div style={{ marginTop: "15px", textAlign: "left" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "800", marginBottom: "6px" }}>แนบหลักฐานสลิปการโอนเงิน (ไม่เกิน 5MB):</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleSlipChange}
                style={{ width: "100%", padding: "10px", borderRadius: "10px", border: `1px dashed ${COLORS.orange}`, background: COLORS.bg, fontSize: "12px", boxSizing: "border-box" }}
              />
            </div>

            {slipPreview && (
              <div style={{ marginTop: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: COLORS.green, fontWeight: "800", marginBottom: "4px" }}>✓ เลือกรูปภาพเรียบร้อย</div>
                <img src={slipPreview} alt="Slip Preview" style={{ width: "120px", maxHeight: "160px", objectFit: "contain", borderRadius: "10px", border: `1px solid ${COLORS.border}` }} />
              </div>
            )}
          </>
        )}

        {paymentMethod === "TrueMoney" && (
          <>
            <div style={{ margin: "15px 0", background: "#FFFFFF", padding: "15px", borderRadius: "16px", display: "inline-block", border: `2px solid ${COLORS.navy}` }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=PromptPay_${totalAmount}`}
                alt="TrueMoney QR Code"
                style={{ width: "180px", height: "180px", display: "block" }}
              />
              <div style={{ fontSize: "11px", color: COLORS.gray, marginTop: "8px", fontWeight: "700" }}>TrueMoney (จำลองระบบ)</div>
            </div>

            <div style={{ marginTop: "15px", textAlign: "left" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "800", marginBottom: "6px" }}>แนบหลักฐานสลิปการโอนเงิน (ไม่เกิน 5MB):</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleSlipChange}
                style={{ width: "100%", padding: "10px", borderRadius: "10px", border: `1px dashed ${COLORS.orange}`, background: COLORS.bg, fontSize: "12px", boxSizing: "border-box" }}
              />
            </div>

            {slipPreview && (
              <div style={{ marginTop: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: COLORS.green, fontWeight: "800", marginBottom: "4px" }}>✓ เลือกรูปภาพเรียบร้อย</div>
                <img src={slipPreview} alt="Slip Preview" style={{ width: "120px", maxHeight: "160px", objectFit: "contain", borderRadius: "10px", border: `1px solid ${COLORS.border}` }} />
              </div>
            )}
          </>
        )}

        {/* SUBMIT */}
        <button
          onClick={submitOrder}
          disabled={isSubmittingOrder}
          style={{
            width: "100%",
            padding: "15px",
            marginTop: "10px",
            border: "none",
            borderRadius: "15px",
            background: isSubmittingOrder ? "#BBBBBB" : COLORS.green,
            color: COLORS.white,
            fontSize: "16px",
            fontWeight: "900",
            cursor: isSubmittingOrder ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {isSubmittingOrder ? "กำลังส่งคำสั่งซื้อ..." : "ยืนยันการชำระเงินและสั่งซื้อ"}
        </button>
      </div>
    </div>
  );
}
