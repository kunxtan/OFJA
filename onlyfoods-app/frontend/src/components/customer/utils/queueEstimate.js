// คำนวณเวลารอคิว/เวลารับอาหารโดยประมาณ (จานละ 4 นาที ต่อโซ่คิว บวกเวลาเผื่อตามจานค้าง)
import { formatBangkokTime, parseBangkokTime } from "./time";

// ===== คำนวณเวลารอคิว =====
// - จานละ 4 นาที (ดูจำนวนจานของแต่ละคิว ไม่ใช่จำนวนคิว)
// - คิวเราเริ่มนับต่อจากเวลาที่คิวก่อนหน้าจะเสร็จ ไม่ซ้อนทับกัน
// - เวลาเผื่อตามจานค้างทั้งครัว: < 5 จาน = ปกติ, 5-15 จาน = +10%, > 15 จาน = +20%
// - ถ้าครัวกด "เสร็จแล้ว" ก่อนเวลา คิวนั้นจะหลุดจากคิวค้าง และ ReadyAt จริงกลายเป็นจุดเริ่มของคิวถัดไป
//   คิวที่เหลือทั้งหมดจึงถูกคำนวณใหม่ทุกครั้งที่โหลดข้อมูลคิว (ทุก 5 วินาที)
export const DISH_MINUTES = 4;

export const kitchenBuffer = (waitingDishes) => (waitingDishes > 15 ? 1.2 : waitingDishes >= 5 ? 1.1 : 1);

// รับทันที = ไม่มีเวลานัด หรือเวลานัดตรงกับเวลาที่สั่ง (ตอนไม่เลือกเวลา ระบบส่งเวลาปัจจุบันไปเก็บเป็น PickupTime)
// ใช้หลักเดียวกับ KitchenView; เผื่อคลาดเคลื่อน 2 นาทีจากเวลาที่ client กับ server สร้างออเดอร์
export const isImmediatePickup = (pickup, created) => {
  const pm = String(pickup || "").match(/(\d{1,2}):(\d{2})/);
  if (!pm) return true;
  const c = parseBangkokTime(created);
  if (!c) return false;
  const [ch, cm] = formatBangkokTime(c).split(":").map(Number);
  return Math.abs(Number(pm[1]) * 60 + Number(pm[2]) - (ch * 60 + cm)) <= 2;
};

// คืน { slots: {orderId: {start, end}}, newOrder: {start, end} }
// newOrder = ออเดอร์สมมติที่จะต่อท้ายคิว (ใช้กับตะกร้า) เมื่อใส่ extraDishes
export const buildQueueSchedule = (queueOrders, extraDishes = 0) => {
  const now = new Date();
  const list = Array.isArray(queueOrders) ? queueOrders : [];
  const isScheduled = (o) => !isImmediatePickup(o.pickup_time, o.created_at); // ออเดอร์นัดเวลาจริงไม่อยู่ในสายคิวทันที
  const active = list
    .filter((o) => ["PENDING", "COOKING"].includes(String(o.status || "").toUpperCase()) && !isScheduled(o))
    .sort((a, b) => Number(a.order_id) - Number(b.order_id));

  const waitingDishes = active.reduce((sum, o) => sum + (Number(o.dish_count) || 0), 0) + extraDishes;
  const buffer = kitchenBuffer(waitingDishes);

  // จุดเริ่ม = เวลาที่คิวล่าสุดทำเสร็จจริง (ReadyAt ของคิวที่กด "เสร็จแล้ว")
  let cursor = null;
  list.forEach((o) => {
    if (!["READY", "COMPLETED"].includes(String(o.status || "").toUpperCase()) || isScheduled(o)) return;
    const t = parseBangkokTime(o.ready_at);
    if (t && (!cursor || t > cursor)) cursor = t;
  });

  const slots = {};
  active.forEach((o) => {
    const created = parseBangkokTime(o.created_at);
    let start = cursor || created || now;
    if (created && created > start) start = created;
    let end = new Date(start.getTime() + (Number(o.dish_count) || 0) * DISH_MINUTES * buffer * 60000);
    if (end < now) end = now; // ครัวช้ากว่าที่ประเมิน ให้คิวถัดไปเริ่มจากตอนนี้
    slots[o.order_id] = { start, end };
    cursor = end;
  });

  const newStart = cursor && cursor > now ? cursor : now;
  const newOrder = {
    start: newStart,
    end: new Date(newStart.getTime() + extraDishes * DISH_MINUTES * buffer * 60000),
  };
  return { slots, newOrder, buffer, waitingDishes };
};

// แสดงเป็นช่วง "เริ่ม–เสร็จ" ปัดนาทีให้เป็นตัวเลขเต็ม และไม่แสดงเวลาเริ่มที่ผ่านมาแล้ว
export const formatPickupRange = (start, end) => {
  const now = new Date();
  const s = new Date(start < now ? now : start);
  s.setSeconds(0, 0);
  let e = new Date(end);
  if (e.getSeconds() || e.getMilliseconds()) {
    e.setSeconds(0, 0);
    e = new Date(e.getTime() + 60000);
  }
  if (e <= s) e = new Date(s.getTime() + 60000);
  return `${formatBangkokTime(s)}–${formatBangkokTime(e)} น.`;
};

// ===== เวลารับโดยประมาณของ "แต่ละออเดอร์" ในหน้าคำสั่งซื้อ =====
// สถานะที่ "จบแล้ว" ไม่ต้องแสดงเวลารอ / Ready = แสดงว่าพร้อมรับ / ที่เหลือทุกสถานะ (รอตรวจสลิป, Pending, Cooking,
// รอโอนส่วนต่าง, รอเปลี่ยนเมนู ฯลฯ) แสดงเป็นช่วงเวลาโดยประมาณ
export const FINISHED_ORDER_STATUSES = ["completed", "cancelled", "canceled", "noshow", "no_show"];

export const orderStatusKey = (order) => String(order?.Status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

export const canEstimateOrder = (order) => {
  const st = orderStatusKey(order);
  return st !== "ready" && !FINISHED_ORDER_STATUSES.includes(st);
};

// ออเดอร์ที่ลูกค้านัดเวลารับไว้: แสดงเป็นช่วง "เวลานัด – เวลานัด + เวลาเผื่อ" เผื่อครัวคิวแน่นแล้วเสร็จช้ากว่านัด
// เวลาเผื่อ = 5 นาที (1 จาน) + จานที่เพิ่มขึ้นจานละ 4 นาที x ตัวคูณเผื่อตามจานค้างทั้งครัว (+10% / +20%)
export const SCHEDULED_PICKUP_BASE_MINUTES = 5;

export const countOrderDishes = (order) =>
  (order?.items || []).reduce(
    (sum, it) => sum + (String(it.ItemStatus || "NORMAL").toUpperCase() === "NORMAL" ? Number(it.Qty) || 0 : 0),
    0
  ) || 1;

// ช่วงเผื่อของออเดอร์นัดเวลา (นาที) = 5 + (จำนวนจาน - 1) x 4 x ตัวคูณเผื่อตามจานค้างทั้งครัว
export const scheduledWindowMinutes = (dishes, buffer) =>
  Math.ceil(SCHEDULED_PICKUP_BASE_MINUTES + (Math.max(1, dishes) - 1) * DISH_MINUTES * buffer);

export const formatScheduledPickupRange = (pickup, windowMinutes) => {
  const m = String(pickup || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return String(pickup || "-");
  const startMin = Number(m[1]) * 60 + Number(m[2]);
  const endMin = (startMin + windowMinutes) % 1440;
  const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  return `${fmt(startMin)}–${fmt(endMin)} น.`;
};
