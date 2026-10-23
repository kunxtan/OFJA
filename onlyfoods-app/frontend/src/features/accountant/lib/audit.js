// แปลงบันทึก audit เป็นแถวที่อ่านง่าย (ใคร ทำอะไร กับอะไร)
import { normStatus, classifyCancelledOrder, itemsText } from './orders';
import { fmtMoney, parseOrderDate, dateOnly } from './format';
import { AUDIT_VERBS, formatAuditDetails } from '../../../lib/auditText';

// สีของ Audit Log: แดง = ยกเลิกออเดอร์ทุกกรณี (ปฏิเสธสลิป/ร้านยกเลิก/ลูกค้ายกเลิก), เขียว = ออเดอร์ Completed, อื่น ๆ (เช่น อนุมัติสลิป) ไม่มีสี
// ตัดสินจากทั้งชื่อ Action และข้อความรายละเอียด เพื่อให้ทำงานได้กับ log ที่ backend เดิมบันทึกไว้
export function auditTone(action, details) {
  const a = String(action || '').toUpperCase();
  const d = String(details || '');
  // ยังรอการตัดสินใจ/ยังไม่ถูกยกเลิกจริง -> ไม่มีสี
  if (a.includes('OUT_OF_STOCK') || a === 'CANCEL_REQUEST' || a === 'CUSTOMER_CHANGE_ITEM' || d.includes('Pending_Cancellation')) return 'neutral';
  if (a.includes('REJECT') || a.includes('CANCEL') || /->\s*Cancelled/i.test(d) || d.includes('ปฏิเสธสลิป') || d.includes('ยกเลิก')) return 'bad';
  if (a.includes('COMPLETE') || /->\s*Completed/i.test(d)) return 'green';
  return 'neutral';
}

export const ROLE_LABELS = {
  'Staff/Owner': 'พนักงานร้าน / เจ้าของร้าน', 'Front Staff': 'พนักงานหน้าร้าน', 'Kitchen Staff': 'พนักงานครัว',
  'Shop Owner': 'เจ้าของร้าน', 'Executive': 'ผู้บริหาร', 'Accountant': 'เจ้าหน้าที่บัญชี', 'Customer': 'ลูกค้า',
};

export const AUDIT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

// แสดง log ย้อนหลังไม่เกิน 1 ปี
export const ORDER_ID_RE = /Order(?:\s*ID)?\s*[:#]?\s*(\d+)/i;

export const AUDIT_PAGE = 500;

// รวม audit log 2 ชุดโดยไม่ซ้ำ (เรียงล่าสุดก่อน) : ชุดแรกชนะเมื่อ id ซ้ำ
export function mergeLogs(first, second) {
  const seen = new Set();
  const out = [];
  [...(first || []), ...(second || [])].forEach(l => {
    const id = l.AuditLogId ?? l.LogID;
    if (id != null && seen.has(id)) return;
    if (id != null) seen.add(id);
    out.push(l);
  });
  return out.sort((a, b) => Number(b.AuditLogId ?? b.LogID ?? 0) - Number(a.AuditLogId ?? a.LogID ?? 0));
}

export function buildAuditRows(logs, orders) {
  const cutoff = Date.now() - AUDIT_RETENTION_MS;
  const orderById = {};
  const userNameById = {};
  (orders || []).forEach(o => {
    orderById[String(o.OrderID)] = o;
    if (o.UserId && (o.CustomerName || o.UserName)) userNameById[String(o.UserId)] = o.CustomerName || o.UserName;
  });
  // แปลงค่า PerformedBy / PerformerRole ให้เป็นข้อความที่คนอ่านรู้เรื่อง (ชื่อลูกค้า / ตำแหน่งภาษาไทย + ร้าน)
  const performerOf = (l, order) => {
    if (l.PerformerLabel) return l.PerformerLabel;
    const raw = String(l.PerformerRole || l.PerformedBy || '').trim();
    if (!raw) return 'ระบบ';
    if (/^User:WalkIn$/i.test(raw)) return 'ลูกค้าหน้าร้าน (Walk-in)';
    const idMatch = raw.match(/^User:(\d+)$/) || (/^\d+$/.test(raw) ? [raw, raw] : null);
    if (idMatch) return userNameById[idMatch[1]] || `ลูกค้า #${idMatch[1]}`;
    const base = ROLE_LABELS[raw] || raw;
    const staffRole = ['Staff/Owner', 'Front Staff', 'Kitchen Staff', 'Shop Owner'].includes(raw);
    return staffRole && order && order.StoreName ? `${base} · ${order.StoreName}` : base;
  };
  const coveredCancels = new Set();
  const rows = [];

  const loggedStatus = new Set();      // `${orderId}|${status}` ที่มี log อยู่แล้ว
  const loggedApprove = new Set();     // orderId ที่มี log อนุมัติสลิปแล้ว
  const loggedCreate = new Set();      // `${storeId}|${queue}|${day}` ของ CREATE_ORDER ที่มี log อยู่แล้ว
  (logs || []).forEach((l, idx) => {
    const logTime = l.CreatedAt || l.Timestamp || l.CreatedDate || l.LogTime || l.Time;
    const t = parseOrderDate(logTime);
    if (t && t.getTime() < cutoff) return;
    let details = String(l.Details ?? l.Detail ?? l.Description ?? '');
    if (!details && (l.NewValue || l.OldValue)) details = [l.OldValue, l.NewValue].filter(Boolean).map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' → ');
    const jsonNorm = normalizeAuditJsonDetails(details);
    if (jsonNorm) details = jsonNorm.details;
    const stm = details.match(/Order(?:\s*ID)?\s*[:#]?\s*(\d+)\s*->\s*([A-Za-z_]+)/i);
    if (stm) loggedStatus.add(`${stm[1]}|${normStatus(stm[2])}`);
    if (String(l.Action) === 'CREATE_ORDER') {
      const q = details.match(/คิว\s*(\d+)/), sid = details.match(/ID:(\d+)/);
      if (q && sid) loggedCreate.add(`${sid[1]}|${q[1]}|${dateOnly(logTime)}`);
    }
    const m = details.match(ORDER_ID_RE);
    let order = m ? orderById[m[1]] : null;
    // log สร้างออเดอร์ไม่มีเลข Order -> จับคู่จากร้าน + คิว + วันที่
    if (!order && String(l.Action) === 'CREATE_ORDER') {
      const q = details.match(/คิว\s*(\d+)/), sid = details.match(/ID:(\d+)/);
      if (q && sid) order = (orders || []).find(o => String(o.StoreId) === sid[1] && String(o.QueueNo) === q[1] && dateOnly(o.CreatedAt) === dateOnly(logTime));
    }

    let action = l.Action || l.Event || l.Type || '-';
    // backend เดิมบันทึกการยกเลิกของร้านเป็น UPDATE_STATUS ... -> Cancelled
    if (action === 'UPDATE_STATUS' && /->\s*Cancelled/i.test(details)) {
      action = order ? classifyCancelledOrder(order) : 'STORE_CANCEL_ORDER';
    }
    const tone = auditTone(action, details);

    if (order) {
      const extra = [];
      if (order.QueueNo && !details.includes(order.QueueNo)) extra.push(`คิว ${order.QueueNo}`);
      if (order.StoreName) extra.push(`ร้าน ${order.StoreName}`);
      if (tone === 'bad' && order.CancelReason && !details.includes(order.CancelReason)) extra.push(`เหตุผล: ${order.CancelReason}`);
      if (extra.length) details += ` | ${extra.join(' • ')}`;
    }
    if (m && tone === 'bad') coveredCancels.add(m[1]);
    if (m && /APPROVE/i.test(String(action))) loggedApprove.add(m[1]);

    rows.push({ key: `log-${l.LogID ?? l.LogId ?? l.logId ?? idx}`, orderId: order ? String(order.OrderID) : (m ? m[1] : null), time: logTime, action, by: performerOf(l, order), details, tone, derived: false, fromJson: Boolean(jsonNorm), raw: l });
  });

  // เติมจากข้อมูลออเดอร์: ออเดอร์ที่ถูกยกเลิกแต่ไม่มี log รองรับ (เช่น log เก่าถูกตัดออกจากรายการ 50 ล่าสุด)
  (orders || []).forEach(o => {
    const t = parseOrderDate(o.CreatedAt);
    if (t && t.getTime() < cutoff) return;
    const head = `คิว ${o.QueueNo || '-'} (Order ${o.OrderID}) ร้าน ${o.StoreName || '-'} ยอด ${fmtMoney(o.TotalAmount)}B`;
    const reason = String(o.CancelReason || '');
    // ข้อมูลออเดอร์ไม่ได้เก็บว่าพนักงานคนไหนทำ จึงระบุได้แค่ "พนักงานร้านไหน" หรือ "ลูกค้า"
    const storeStaff = `พนักงานร้าน ${o.StoreName || '-'}`;
    const customer = o.CustomerName || o.UserName || 'ลูกค้า';
    if (normStatus(o.Status) === 'Cancelled' && !coveredCancels.has(String(o.OrderID))) {
      const action = classifyCancelledOrder(o);
      const label = action === 'VERIFY_SLIP_REJECT' ? 'ปฏิเสธสลิป' : action === 'CUSTOMER_CANCEL_ORDER' ? 'ลูกค้ายกเลิก' : 'ร้านค้ายกเลิก';
      rows.push({ key: `drv-c-${o.OrderID}`, orderId: String(o.OrderID), time: o.CreatedAt, action, by: action === 'CUSTOMER_CANCEL_ORDER' ? customer : storeStaff,
        details: `${label} ${head} เหตุผล: ${reason || '-'}`, tone: 'bad', derived: true });
    }
    if (!loggedCreate.has(`${o.StoreId}|${o.QueueNo}|${dateOnly(o.CreatedAt)}`)) {
      const who = Number(o.IsWalkIn) === 1 ? 'ออเดอร์หน้าร้าน (Walk-in)' : `ลูกค้า ${o.CustomerName || o.UserName || ''}`.trim();
      rows.push({ key: `drv-n-${o.OrderID}`, orderId: String(o.OrderID), time: o.CreatedAt, action: 'CREATE_ORDER', by: o.CustomerName || o.UserName || (Number(o.IsWalkIn) === 1 ? 'ลูกค้า Walk-in' : 'ลูกค้า'),
        details: `สร้างออเดอร์ ${head} — ${who}`, tone: 'neutral', derived: true });
    }
    const st = normStatus(o.Status);
    const isWalkIn = Number(o.IsWalkIn) === 1;
    const slipOk = !isWalkIn && !loggedApprove.has(String(o.OrderID)) && (
      ['Pending', 'Cooking', 'Cooked', 'Ready', 'Completed', 'NoShow', 'Pending_Cancellation'].includes(st)
      || (st === 'Cancelled' && (reason.includes('ลูกค้า') || reason.includes('หมด'))));   // ถูกยกเลิกหลังอนุมัติสลิปแล้ว (ไม่ใช่โดนปฏิเสธสลิป)
    if (slipOk) {
      rows.push({ key: `drv-a-${o.OrderID}`, orderId: String(o.OrderID), time: o.CreatedAt, action: 'VERIFY_SLIP_APPROVE', by: storeStaff,
        details: `อนุมัติสลิป ${head} (ชำระเงินแล้ว — เวลาโดยประมาณ)`, tone: 'neutral', derived: true });
    }
    // ออเดอร์ที่ถูกยกเลิกเพราะของหมดหลังอนุมัติสลิป -> เป็นการยกเลิก จึงเป็นสีแดง
    if (st === 'Cancelled' && (reason.includes('เมนูหมด') || reason.startsWith('วัตถุดิบหมด'))) {
      rows.push({ key: `drv-sc-${o.OrderID}`, orderId: String(o.OrderID), time: o.CreatedAt, action: 'OUT_OF_STOCK_NOTIFY', by: customer,
        details: `${isWalkIn ? 'ออเดอร์หน้าร้าน' : 'อนุมัติสลิปแล้ว'} ${head} แต่สินค้าหมด — ลูกค้ายกเลิก`, tone: 'bad', derived: true });
    }
    if (['Cooking', 'Ready', 'Completed', 'NoShow'].includes(st) && !loggedStatus.has(`${o.OrderID}|${st}`)) {
      const when = st === 'Ready' || st === 'NoShow' ? (o.ReadyAt || o.CreatedAt) : st === 'Completed' ? (o.DeliveredAt || o.ReadyAt || o.CreatedAt) : o.CreatedAt;
      rows.push({ key: `drv-st-${o.OrderID}-${st}`, orderId: String(o.OrderID), time: when, action: 'UPDATE_STATUS', by: storeStaff,
        details: `Order ${o.OrderID} -> ${st} ${head}`, tone: st === 'Completed' ? 'green' : 'neutral', derived: true });
    }
    if (o.Status === 'Pending_Cancellation' && reason.startsWith('วัตถุดิบหมด')) {
      const paid = Number(o.IsWalkIn) === 1 ? 'ออเดอร์หน้าร้าน' : 'อนุมัติสลิปแล้ว';
      rows.push({ key: `drv-s-${o.OrderID}`, orderId: String(o.OrderID), time: o.CreatedAt, action: 'OUT_OF_STOCK_NOTIFY', by: storeStaff,
        details: `${paid} ${head} แต่${reason.replace('วัตถุดิบหมด:', '').trim() ? ` '${reason.replace('วัตถุดิบหมด:', '').trim()}'` : 'สินค้า'} หมด — รอลูกค้าตัดสินใจ`,
        tone: 'neutral', derived: true });
    }
  });

  const ts = (r) => { const d = parseOrderDate(r.time); return d ? d.getTime() : 0; };
  return rows
    .map(r => {
      const order = r.orderId ? orderById[r.orderId] : null;
      const meta = auditMeta(r);
      return {
        ...r,
        label: meta.label,
        cat: r.tone === 'bad' ? 'cancel' : r.tone === 'green' ? 'done' : meta.cat,
        summary: auditSummary(r, order),
        queue: order ? order.QueueNo : null,
        storeName: order ? order.StoreName : null,
        amount: order ? Number(order.TotalAmount || 0) : null,
      };
    })
    .sort((x, y) => ts(y) - ts(x));
}

// ---- รายละเอียด log ที่ backend เก็บเป็น JSON เช่น: Order 195 {"reason": null, "status": "COMPLETED", "store_id": 1} ----
// แปลงเป็นรูปแบบเดียวกับ log ปกติ ("Order 195 -> Completed เหตุผล: ...") เพื่อให้สี/หมวด/การจับคู่ ทำงานเหมือนเดิม
// และไม่แสดงฟิลด์ภายใน (store_id ฯลฯ) ; ถ้า JSON พังหรืออ่านไม่ได้ จะคืนข้อความเดิมโดยไม่แตะ
export const AUDIT_STATUS_ALIAS = { noshow: 'NoShow', cooked: 'Cooked', pendingcancellation: 'Pending_Cancellation', verifyingslip: 'Verifying_Slip' };

export const normAuditStatus = (raw) => {
  const t = String(raw || '').trim();
  const alias = AUDIT_STATUS_ALIAS[t.toLowerCase().replace(/[\s_-]/g, '')];
  return alias || normStatus(t);
};

export const meaningfulText = (v) => {
  if (v === null || v === undefined || typeof v === 'object') return '';
  const t = String(v).trim();
  return !t || /^(null|none|undefined|n\/a|-)$/i.test(t) ? '' : t;
};

export function normalizeAuditJsonDetails(details) {
  const m = String(details || '').match(/^\s*(?:Order(?:\s*ID)?\s*[:#]?\s*(\d+)\s*[:,-]?\s*)?(\{[\s\S]*\})\s*$/i);
  if (!m) return null;
  let payload;
  try { payload = JSON.parse(m[2]); } catch (e) { return null; }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const orderId = m[1] || meaningfulText(payload.order_id ?? payload.OrderId ?? payload.OrderID);
  const status = meaningfulText(payload.status ?? payload.Status);
  const reason = meaningfulText(payload.reason ?? payload.Reason ?? payload.cancel_reason ?? payload.CancelReason);
  const head = orderId ? `Order ${orderId}` : '';
  const text = [status ? `${head ? `${head} ` : ''}-> ${normAuditStatus(status)}` : head, reason ? `เหตุผล: ${reason}` : ''].filter(Boolean).join(' ');
  return text ? { details: text } : null;
}

// ชื่อเหตุการณ์ภาษาไทย + หมวด (ใช้กรองใน Audit Log)
export const AUDIT_ACTION_META = {
  CREATE_ORDER: { label: 'สร้างออเดอร์', cat: 'order' },
  VERIFY_SLIP_APPROVE: { label: 'อนุมัติสลิป', cat: 'slip' },
  VERIFY_SLIP_REJECT: { label: 'ปฏิเสธสลิป', cat: 'cancel' },
  STORE_CANCEL_ORDER: { label: 'ร้านค้ายกเลิก', cat: 'cancel' },
  CUSTOMER_CANCEL_ORDER: { label: 'ลูกค้ายกเลิก', cat: 'cancel' },
  OUT_OF_STOCK_NOTIFY: { label: 'แจ้งสินค้าหมด', cat: 'order' },
  CANCEL_REQUEST: { label: 'ขอยกเลิก (รอลูกค้า)', cat: 'order' },
  CUSTOMER_CHANGE_ITEM: { label: 'ลูกค้าเปลี่ยนเมนู', cat: 'order' },
  CREATE_STORE: { label: 'เพิ่มร้านค้า', cat: 'store' },
  UPDATE_STORE: { label: 'แก้ไขร้านค้า', cat: 'store' },
  DELETE_STORE: { label: 'ลบร้านค้า', cat: 'store' },
  SUSPEND_STORE: { label: 'ระงับ/เปิดสิทธิ์ร้านค้า', cat: 'store' },
  CREATE_STORE_ACCOUNT: { label: 'สร้างบัญชีร้าน', cat: 'store' },
  UPDATE_STORE_ACCOUNT: { label: 'แก้ไขบัญชีร้าน', cat: 'store' },
  DELETE_STORE_ACCOUNT: { label: 'ลบบัญชีร้าน', cat: 'store' },
};

export const STATUS_ACTION_LABEL = {
  Cooking: 'เริ่มปรุงอาหาร', Cooked: 'ปรุงเสร็จแล้ว', Ready: 'อาหารพร้อมรับ', Completed: 'ส่งมอบสำเร็จ',
  NoShow: 'ลูกค้าไม่มารับ', Cancelled: 'ยกเลิกออเดอร์', Pending: 'รับออเดอร์',
};

export const AUDIT_CATS = [['all', 'ทั้งหมด'], ['cancel', 'ยกเลิก'], ['done', 'สำเร็จ'], ['slip', 'สลิป'], ['order', 'ออเดอร์'], ['store', 'ร้านค้า/บัญชี']];

export function auditMeta(r) {
  const a = String(r.action || '');
  if (a === 'UPDATE_STATUS') {
    const st = normStatus((String(r.details || '').match(/->\s*([A-Za-z_]+)/) || [])[1]);
    return { label: STATUS_ACTION_LABEL[st] || 'เปลี่ยนสถานะออเดอร์', cat: st === 'Cancelled' ? 'cancel' : st === 'Completed' ? 'done' : 'order' };
  }
  return AUDIT_ACTION_META[a] || { label: AUDIT_VERBS[a] || a, cat: /REFUND|SLIP/.test(a) ? 'slip' : /STORE|FOOD_COURT|PRODUCT|STOCK/.test(a) ? 'store' : /ORDER/.test(a) ? 'order' : 'other' };
}

// ---- พนักงานครัว: แปลงข้อความ/รหัสสถานะดิบ ให้เป็นประโยคภาษาไทยที่อ่านรู้เรื่อง ----
// ใช้คำเดียวกับป้ายเหตุการณ์ (STATUS_ACTION_LABEL) เช่น "เริ่มปรุงอาหาร" / "อาหารพร้อมรับ" เพื่อให้ศัพท์ตรงกันทั้งหน้า
export const KITCHEN_STATUS_TEXT = {
  Pending: 'ปรับสถานะออเดอร์เป็นรอดำเนินการ',
  Cooking: 'เริ่มปรุงอาหาร',
  Cooked: 'ปรุงอาหารเสร็จแล้ว',
  Ready: 'แจ้งว่าอาหารพร้อมรับ ให้ลูกค้ามารับได้',
  Completed: 'บันทึกว่าส่งมอบอาหารให้ลูกค้าเรียบร้อย',
  NoShow: 'บันทึกว่าลูกค้าไม่มารับอาหาร',
  Cancelled: 'ยกเลิกออเดอร์',
  Pending_Cancellation: 'แจ้งขอยกเลิกออเดอร์ รอลูกค้ายืนยัน',
};

export const isKitchenAudit = (r) => {
  const raw = (r && r.raw) || {};
  return [raw.PerformerRole, raw.PerformedBy, raw.PerformerLabel].some(v => /kitchen|พนักงานครัว/i.test(String(v || '')));
};

// คืน null เมื่อไม่รู้จักการกระทำนั้น (ให้ใช้ข้อความมาตรฐานเดิมแทน — ไม่เดาเอง)
export function kitchenAuditSummary(r, order) {
  const a = String(r.action || '');
  const d = String(r.details || '');
  const reasonRaw = String((order && order.CancelReason) || (d.match(/เหตุผล:\s*([^|]+)/) || [])[1] || '').trim();
  const reason = reasonRaw.replace(/^วัตถุดิบหมด:\s*/, '').trim();
  let verb = null;
  if (a === 'UPDATE_STATUS') {
    const to = normStatus((d.match(/->\s*([A-Za-z_]+)/) || [])[1]);
    verb = KITCHEN_STATUS_TEXT[to] || 'อัปเดตสถานะออเดอร์';
    if (to === 'Cancelled' && reason) verb += ` (เหตุผล: ${reason})`;
  } else if (a === 'STORE_CANCEL_ORDER') {
    verb = `ยกเลิกออเดอร์${reason ? ` (เหตุผล: ${reason})` : ''}`;
  } else if (a === 'OUT_OF_STOCK_NOTIFY') {
    verb = `แจ้งว่าวัตถุดิบ/เมนูในออเดอร์หมด${reason ? ` (${reason})` : ''}`;
  } else if (a === 'CANCEL_REQUEST') {
    verb = `แจ้งขอยกเลิกออเดอร์เพราะสินค้าหมด รอลูกค้าตัดสินใจ${reason ? ` (${reason})` : ''}`;
  }
  if (!verb) return null;
  // บริบท: ใส่เฉพาะที่มีข้อมูลจริง ไม่เดาข้อมูลที่ขาด
  const orderId = order ? order.OrderID : (d.match(ORDER_ID_RE) || [])[1];
  const queue = order ? order.QueueNo : (d.match(/คิว\s*([A-Za-z0-9-]+)/) || [])[1];
  const ctx = [];
  if (queue) ctx.push(`คิว ${queue}`);
  if (orderId) ctx.push(`Order ${orderId}`);
  if (order && order.StoreName) ctx.push(`ร้าน ${order.StoreName}`);
  const menu = itemsText(order);
  if (menu) ctx.push(`เมนู: ${menu}`);
  return ctx.length ? `${verb} — ${ctx.join(' · ')}` : verb;
}

// ข้อความอธิบายแบบอ่านง่าย (ส่วนคิว/ร้าน/ยอดแยกไปแสดงเป็นคอลัมน์เอง)
export function auditSummary(r, order) {
  const a = String(r.action || '');
  const d = String(r.details || '');
  if (isKitchenAudit(r)) {
    const k = kitchenAuditSummary(r, order);
    if (k) return k;
  }
  // log ที่เดิมเป็น JSON: เขียนเป็นประโยคไทยสั้น ๆ จากสถานะ/เหตุผลที่มีจริงเท่านั้น
  if (r.fromJson) {
    const id = r.orderId ? ` #${r.orderId}` : '';
    const stRaw = (d.match(/->\s*([A-Za-z_]+)/) || [])[1];
    const st = stRaw ? normAuditStatus(stRaw) : '';
    const why = meaningfulText((d.match(/เหตุผล:\s*([^|]+)/) || [])[1]);
    const whyText = why ? ` — เหตุผล: ${why}` : '';
    if (st === 'Cancelled') return `ยกเลิกออเดอร์${id}${whyText}`;
    if (st && STATUS_ACTION_LABEL[st]) return `อัปเดตสถานะออเดอร์${id} เป็น "${STATUS_ACTION_LABEL[st]}"${whyText}`;
    if (st || a === 'UPDATE_STATUS') return `อัปเดตสถานะออเดอร์${id}${whyText}`;
    return `${auditMeta(r).label}${id}${whyText}`;
  }
  const parsedReason = (d.match(/เหตุผล:\s*([^|]+)/) || d.match(/ยืนยันยกเลิก:\s*([^|]+)/) || [])[1];
  const reason = String((order && order.CancelReason) || parsedReason || '').trim();
  const plain = d.replace(/\s*\|.*$/, '').trim();
  switch (a) {
    case 'CREATE_ORDER': {
      const it = itemsText(order);
      return order ? `สั่งอาหาร${it ? `: ${it}` : ''}${Number(order.IsWalkIn) === 1 ? ' (สั่งหน้าร้าน)' : ''}` : plain;
    }
    case 'VERIFY_SLIP_APPROVE': return 'ตรวจสลิปผ่าน ชำระเงินแล้ว เริ่มดำเนินการออเดอร์';
    case 'VERIFY_SLIP_REJECT': return reason && !/^สลิป/.test(reason) ? `สลิปไม่ถูกต้อง — ${reason}` : (reason || 'สลิปไม่ถูกต้อง');
    case 'STORE_CANCEL_ORDER': return `ร้านยกเลิกออเดอร์${reason ? ` — ${reason}` : ''}`;
    case 'CUSTOMER_CANCEL_ORDER': return `ลูกค้ายืนยันยกเลิก${reason ? ` — ${reason}` : ''}`;
    case 'CANCEL_REQUEST': return `ร้านขอยกเลิกเพราะสินค้าหมด รอลูกค้าตัดสินใจ${reason ? ` — ${reason.replace('วัตถุดิบหมด:', '').trim()}` : ''}`;
    case 'OUT_OF_STOCK_NOTIFY': return order ? `สินค้าในออเดอร์หมด${reason ? ` — ${reason.replace('วัตถุดิบหมด:', '').trim()}` : ''}` : plain;
    case 'UPDATE_STATUS': {
      const st = normStatus((d.match(/->\s*([A-Za-z_]+)/) || [])[1]);
      const msg = {
        Cooking: 'ร้านรับออเดอร์และเริ่มปรุงอาหาร', Ready: 'อาหารพร้อมให้ลูกค้ามารับ', Completed: 'ลูกค้ารับอาหารเรียบร้อย',
        NoShow: 'ลูกค้าไม่มารับอาหารเกินเวลา', Pending: 'ออเดอร์เข้าคิวรอปรุง',
      }[st];
      return msg || plain;
    }
    default:
      // รหัสอื่น ๆ ใช้ตัวแปลงประโยคเดียวกับหน้าผู้บริหาร (คิว/ร้าน/ยอดแสดงเป็นคอลัมน์แยกอยู่แล้ว จึงไม่ต่อท้ายซ้ำ)
      if (r.raw && AUDIT_VERBS[a]) {
        return formatAuditDetails({ ...r.raw, OrderId: null, QueueLabel: null, StoreId: order ? null : r.raw.StoreId });
      }
      return plain;
  }
}

export const AUDIT_ROW_BG = { bad: '#FFF7F7', green: '#F1FBF5' };
