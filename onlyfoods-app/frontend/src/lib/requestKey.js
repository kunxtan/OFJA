// รหัสสุ่มประจำการกดจ่ายแต่ละครั้ง (Idempotency-Key) : กดซ้ำ / เน็ตหลุดแล้วส่งใหม่ด้วยรหัสเดิม = ได้ออเดอร์เดิม ไม่สร้างซ้ำ
export function newRequestKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ใส่ราคาจริงจาก server (ผลของ /api/orders/quote หรือ 409 price_changed) ลงตะกร้า
export function applyServerPrices(cart, items) {
  const price = new Map((items || []).map((it) => [Number(it.product_id), Number(it.unit_price)]));
  return cart.map((row) => (price.has(Number(row.ProductId)) ? { ...row, UnitPrice: price.get(Number(row.ProductId)) } : row));
}
