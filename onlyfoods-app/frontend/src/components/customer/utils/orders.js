// ฟังก์ชันช่วยเกี่ยวกับออเดอร์/ตะกร้า/การแจ้งเตือน

export const getNotifKey = (n) => n.NotifId ?? n.NotificationID ?? n.id ?? `${n.Message}_${n.CreatedAt}`;

export const getOutOfStockItem = (order) => {
  const items = order?.items || [];
  return items.find((it) => it.ItemStatus === "OUT_OF_STOCK") || items[0] || null;
};

// CART HANDLERS
export const createCartRow = (product) => {
  const uniqueId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return { ...product, cartItemId: uniqueId, qty: 1, item_note: "" };
};

// LATE PICKUP HANDLER

// เวลามาถึงที่จะได้ถ้ากดยืนยัน (ตรงกับ backend): นับจากเวลานัดรับ หรือเวลาตอนนี้ถ้าเลยเวลานัดแล้ว + N นาที
// แจ้งใหม่ = แทนเวลาเดิม ไม่บวกต่อ (นัด 12:00 กด 15 -> 12:15 ; กด 30 อีกครั้ง -> 12:30)
export const previewLateArrival = (order, minutes) => {
  const now = new Date();
  let base = now;
  const m = String(order.PickupTime || order.pickup_time || "").match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const pickup = new Date(now);
    pickup.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (pickup > now) base = pickup;
  }
  const arrival = new Date(base.getTime() + Number(minutes) * 60000);
  return `${String(arrival.getHours()).padStart(2, "0")}:${String(arrival.getMinutes()).padStart(2, "0")}`;
};

// ป้ายสถานะออเดอร์ภาษาไทย (สถานะที่ไม่รู้จักแสดงตามที่ backend ส่งมา)
const ORDER_STATUS_TH = {
  Verifying_Slip: "รอตรวจสลิป",
  Pending: "รอร้านทำอาหาร",
  Cooking: "กำลังทำอาหาร",
  Ready: "พร้อมรับอาหาร",
  Completed: "รับอาหารแล้ว",
  Cancelled: "ถูกยกเลิก",
  NoShow: "ไม่มารับอาหาร",
  Pending_Cancellation: "รอคุณเลือกเปลี่ยนเมนู/ยกเลิก",
  Awaiting_Top_Up: "รอโอนส่วนต่าง",
};
export const getOrderStatusLabel = (status) => ORDER_STATUS_TH[status] || status || "Pending";

// รวมเงินคืนของออเดอร์ (จาก GET /api/refunds) -> { pending, done, doneAt }
export const summarizeRefunds = (refunds) => (refunds || []).reduce((acc, r) => {
  const amount = Number(r.Amount || 0);
  if (r.RefundStatus === "PENDING") acc.pending += amount;
  if (r.RefundStatus === "DONE") {
    acc.done += amount;
    if (!acc.doneAt || String(r.RefundedAt) > String(acc.doneAt)) acc.doneAt = r.RefundedAt;
  }
  return acc;
}, { pending: 0, done: 0, doneAt: null });
