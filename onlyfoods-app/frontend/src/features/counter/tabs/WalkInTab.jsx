import { fmtMoney } from '../lib';
import { PALETTE } from '../theme';

// แท็บเปิดคิว walk-in : เลือกเมนู รับเงิน
// ข้อมูลและ state อยู่ที่ CounterView ส่งมาเป็น props (แท็บไม่ดึงข้อมูลเอง)
export default function WalkInTab({
  foodCourtOpen, currentStore, products, addToCart, cart, removeFromCart, updateCartNote, totalAmount,
  orderNote, setOrderNote, openPayment
}) {
  return (
    <div className="cv-pos-grid">
                  <div className="cv-card">
                    <div className="cv-card-head">
                      <div>
                        <h3>เมนูอาหารพร้อมจำหน่าย</h3>
                        <div className="caption">เลือกเมนูเพื่อเพิ่มลงตะกร้า Walk-in {(!foodCourtOpen || currentStore?.IsSuspended || currentStore?.IsOpen === false) && '• ขณะนี้ปิดรับออเดอร์'}</div>
                      </div>
                    </div>
                    <div className="cv-product-grid">
                      {products.map(p => (
                        <div key={p.ProductId} className="cv-product-card">
                          <div className="cv-product-info">
                            <h4>{p.ProductName}</h4>
                            <div className="price">฿{fmtMoney(p.UnitPrice)}</div>
                          </div>
                          {p.IsOutOfStock ? (
                            <div className="out-of-stock-badge">สินค้าหมด</div>
                          ) : (
                            <button onClick={() => addToCart(p)} className="cv-btn btn-coral" style={{ width: '100%', marginTop: '8px' }}>
                              + สั่งจานนี้
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="cv-card cv-cart-card">
                    <div className="cv-card-head">
                      <div>
                        <h3>🛒 ตะกร้าหน้าร้าน</h3>
                        <div className="caption">กดชำระเงิน: เงินสด / QR / TrueMoney แล้วออกคิวทันที</div>
                      </div>
                    </div>

                    {cart.length === 0 ? (
                      <div className="empty-state" style={{ padding: '60px 16px' }}>ยังไม่มีรายการอาหารในตะกร้า</div>
                    ) : (
                      <div className="cv-cart-body">
                        <div className="cart-item-list">
                          {cart.map((item, idx) => (
                            <div key={idx} className="cart-item">
                              <div className="item-head">
                                <span className="bold">{item.ProductName}</span>
                                <div className="price-del">
                                  <span className="bold" style={{ color: PALETTE.coral }}>฿{fmtMoney(item.UnitPrice)}</span>
                                  <button onClick={() => removeFromCart(idx)} className="btn-del">✖</button>
                                </div>
                              </div>
                              <input
                                type="text"
                                placeholder="โน้ตพิเศษ เช่น ไม่ใส่ผัก, เผ็ดน้อย"
                                value={item.note || ''}
                                onChange={(e) => updateCartNote(idx, e.target.value)}
                                className="cv-input-note"
                              />
                            </div>
                          ))}
                        </div>

                        <div className="cart-total-box">
                          <span>ยอดรวมสุทธิ</span>
                          <span className="total-amount">฿{fmtMoney(totalAmount)}</span>
                        </div>

                        <input
                          type="text"
                          placeholder="หมายเหตุออเดอร์ (ถ้ามี)"
                          value={orderNote}
                          onChange={(e) => setOrderNote(e.target.value)}
                          className="cv-input-main"
                          style={{ marginBottom: '14px' }}
                        />

                        <button disabled={!foodCourtOpen || currentStore?.IsSuspended || currentStore?.IsOpen === false} onClick={openPayment} className="cv-btn btn-dark cv-btn-lg" style={{ width: '100%' }}>
                          {!foodCourtOpen ? '🔒 โรงอาหารปิด — เปิดคิวไม่ได้' : currentStore?.IsSuspended ? '🔒 ร้านถูกระงับ' : currentStore?.IsOpen === false ? '🔒 ร้านปิด — เปิดคิวไม่ได้' : `💳 ชำระเงิน ฿${fmtMoney(totalAmount)}`}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
  );
}
