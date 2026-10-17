// กลุ่มโมดัลการชำระเงิน: ชำระเงินตอนสั่ง, โอนส่วนต่าง, ของหมดให้เปลี่ยนเมนู
import { COLORS } from "../constants";
import { getOutOfStockItem } from "../utils/orders";
import { formatTimeLeft } from "../utils/time";

// ===== PaymentModal =====
export function PaymentModal({
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

// ===== TopUpModal =====
export function TopUpModal({
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

// ===== OutOfStockModal =====
export function OutOfStockModal({
  outOfStockOrder,
  products,
  timeLeft,
  isChangeMenuMode,
  setIsChangeMenuMode,
  handleCancelOutOfStockOrder,
  setNewSelectedProduct,
  newSelectedProduct,
  handleChangeOrderMenu,
}) {
  if (!outOfStockOrder) return null;

  const targetItem = getOutOfStockItem(outOfStockOrder);
  const targetPrice = Number(targetItem?.UnitPrice || 0);
  const availableProducts = products.filter((p) => {
    const isSameStore = Number(p.StoreId || p.store_id) === Number(outOfStockOrder.StoreId || outOfStockOrder.StoreID);
    const isAvailable = !Number(p.IsOutOfStock);
    const isNotOriginal = Number(p.ProductId) !== Number(targetItem?.ProductId);
    return isSameStore && isAvailable && isNotOriginal;
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(42,44,65,0.75)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: COLORS.white, width: "min(460px, 100%)", borderRadius: "24px", padding: "25px", textAlign: "center" }}>
        <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: COLORS.navy }}>
          สินค้าบางรายการหมด!
        </h3>
        <p style={{ color: COLORS.gray, fontSize: "13px", marginTop: "6px" }}>
          คิว #{outOfStockOrder.QueueNo} • ร้าน {outOfStockOrder.StoreName} แจ้งว่าวัตถุดิบหมดชั่วคราว
        </p>
        {targetItem && (
          <div style={{ background: "#F8F8FA", borderRadius: "12px", padding: "10px 14px", marginTop: "10px", fontSize: "13px", textAlign: "left" }}>
            <div>เมนูที่หมด: <b>{targetItem.ProductName}</b> ({Number(targetItem.UnitPrice || 0).toFixed(2)} ฿)</div>
            {outOfStockOrder.CancelReason && <div style={{ color: COLORS.gray, marginTop: "4px" }}>เหตุผลจากร้าน: {outOfStockOrder.CancelReason}</div>}
            <div style={{ color: COLORS.gray, marginTop: "4px" }}>เมนูที่ถูกกว่า: คืนเงินส่วนต่างให้ • เมนูที่แพงกว่า: โอนส่วนต่างเพิ่มแล้วแนบสลิป</div>
          </div>
        )}

        <div style={{ background: "#FFF0ED", color: COLORS.red, padding: "10px 14px", borderRadius: "12px", margin: "14px 0", fontSize: "14px", fontWeight: "800", border: `1px solid ${COLORS.red}` }}>
          ⏱ กรุณาเลือกภายใน: <span style={{ fontSize: "18px", color: COLORS.red, fontWeight: "900" }}>{formatTimeLeft(timeLeft)}</span> นาที
          <div style={{ fontSize: "11px", fontWeight: "normal", marginTop: "2px", color: "#b91c1c" }}>
            (ระบบจะยกเลิกและคืนเงินให้อัตโนมัติหากหมดเวลา)
          </div>
        </div>

        {!isChangeMenuMode ? (
          <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              onClick={() => setIsChangeMenuMode(true)}
              style={{ width: "100%", padding: "14px", border: "none", borderRadius: "14px", background: COLORS.orange, color: COLORS.white, fontWeight: "900", fontSize: "15px", cursor: "pointer" }}
            >
              เลือกระบุเมนูใหม่ทดแทน
            </button>
            <button
              onClick={() => handleCancelOutOfStockOrder("ลูกค้าขอยกเลิกออเดอร์เนื่องจากวัตถุดิบหมด")}
              style={{ width: "100%", padding: "14px", border: `1px solid ${COLORS.red}`, borderRadius: "14px", background: "#FFF0ED", color: COLORS.red, fontWeight: "900", fontSize: "15px", cursor: "pointer" }}
            >
              ยกเลิกออเดอร์นี้ (ขอคืนเงิน)
            </button>
          </div>
        ) : (
          <div style={{ marginTop: "16px", textAlign: "left" }}>
            <label style={{ fontSize: "13px", fontWeight: "800", color: COLORS.navy, display: "block", marginBottom: "8px" }}>
              เลือกเมนูทดแทนจากร้าน {outOfStockOrder.StoreName}:
            </label>

            <div style={{ maxHeight: "200px", overflowY: "auto", display: "grid", gap: "8px", marginBottom: "14px" }}>
              {availableProducts.length === 0 ? (
                <div style={{ textAlign: "center", color: COLORS.gray, padding: "20px", fontSize: "13px" }}>
                  ไม่มีเมนูอื่นที่พร้อมจำหน่ายในขณะนี้
                </div>
              ) : (
                availableProducts.map((product) => (
                  <div
                    key={product.ProductId}
                    onClick={() => setNewSelectedProduct(product)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "12px",
                      border: `2px solid ${newSelectedProduct?.ProductId === product.ProductId ? COLORS.orange : COLORS.border}`,
                      background: newSelectedProduct?.ProductId === product.ProductId ? "#FFF9F5" : COLORS.white,
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "800", fontSize: "14px" }}>{product.ProductName}</div>
                      <div style={{ fontSize: "12px", color: COLORS.gray }}>
                        {product.UnitPrice} ฿
                        {(() => {
                          const diff = (Number(product.UnitPrice) - targetPrice) * Number(targetItem?.Qty || 1);
                          if (!targetItem || diff === 0) return null;
                          return diff > 0
                            ? <span style={{ color: COLORS.red, fontWeight: "800" }}> • โอนเพิ่ม {diff.toFixed(2)} ฿</span>
                            : <span style={{ color: COLORS.green, fontWeight: "800" }}> • คืนเงิน {(-diff).toFixed(2)} ฿</span>;
                        })()}
                      </div>
                    </div>
                    {newSelectedProduct?.ProductId === product.ProductId && (
                      <span style={{ color: COLORS.orange, fontWeight: "900" }}>✓ เลือก</span>
                    )}
                  </div>
                ))
              )}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setIsChangeMenuMode(false)}
                style={{ flex: 1, padding: "11px", border: `1px solid ${COLORS.border}`, borderRadius: "10px", background: COLORS.lightGray, cursor: "pointer" }}
              >
                ย้อนกลับ
              </button>
              <button
                onClick={handleChangeOrderMenu}
                disabled={!newSelectedProduct}
                style={{
                  flex: 2,
                  padding: "11px",
                  border: "none",
                  borderRadius: "10px",
                  background: newSelectedProduct ? COLORS.green : "#CCCCCC",
                  color: COLORS.white,
                  fontWeight: "900",
                  cursor: newSelectedProduct ? "pointer" : "not-allowed"
                }}
              >
                ยืนยันเปลี่ยนเมนู
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
