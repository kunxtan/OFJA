// ตรรกะตะกร้า: 1 แถว = รายการเดียวกัน (สินค้า + หมายเหตุ) มีจำนวน qty
// - กด + ที่เมนู: ถ้ามีแถวสินค้าเดียวกันที่ "ไม่มีหมายเหตุ" อยู่แล้ว -> เพิ่มจำนวน ไม่เปิดแถวใหม่
// - แถวที่มีหมายเหตุจะไม่ถูกรวม เพราะรายละเอียดต่างกัน
// - ถ้าอยากใส่รายละเอียดต่างกันกับจานที่สั่งซ้ำ ใช้ปุ่ม "แยก 1 จาน" (splitOneFromRow)
import { createCartRow } from "./orders";

export const MAX_QTY_PER_ROW = 99;
const qtyOf = (row) => Number(row?.qty) || 1;

export const addProductToCart = (cart, product) => {
  const index = cart.findIndex(
    (row) => Number(row.ProductId) === Number(product.ProductId) && !String(row.item_note || "").trim()
  );
  if (index === -1) return [...cart, createCartRow(product)];
  return increaseRowQty(cart, index);
};

export const increaseRowQty = (cart, index) =>
  cart.map((row, i) => (i === index ? { ...row, qty: Math.min(MAX_QTY_PER_ROW, qtyOf(row) + 1) } : row));

// ลดจำนวน 1 จาน ถ้าเหลือ 1 จานแล้วกดลดอีก = ลบแถวนั้นออก
export const decreaseRowQty = (cart, index) => {
  const row = cart[index];
  if (!row) return cart;
  if (qtyOf(row) > 1) return cart.map((r, i) => (i === index ? { ...r, qty: qtyOf(r) - 1 } : r));
  return cart.filter((_, i) => i !== index);
};

// แยก 1 จานออกจากแถวที่มีหลายจาน ไปเป็นแถวใหม่ที่หมายเหตุว่าง เพื่อใส่รายละเอียดต่างจากจานอื่น
export const splitOneFromRow = (cart, index) => {
  const row = cart[index];
  if (!row || qtyOf(row) <= 1) return cart;
  const newRow = { ...createCartRow(row), qty: 1, item_note: "" };
  return [...cart.slice(0, index), { ...row, qty: qtyOf(row) - 1 }, newRow, ...cart.slice(index + 1)];
};

export const countCartDishes = (cart) => cart.reduce((sum, row) => sum + qtyOf(row), 0);
export const sumCart = (cart) => cart.reduce((sum, row) => sum + Number(row.UnitPrice || 0) * qtyOf(row), 0);
