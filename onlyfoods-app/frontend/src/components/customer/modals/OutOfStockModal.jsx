import { getOutOfStockItem } from "../utils/orders";
import { COLORS } from "../constants";
import { formatTimeLeft } from "../utils/time";

export default function OutOfStockModal({
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
