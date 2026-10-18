import React, { useState, useEffect, useMemo, useRef } from 'react';
import { startPolling } from '../utils/polling';
import { useHistoryNav } from '../utils/historyNav';
import RefundLog from './RefundLog';
import { AUDIT_VERBS, formatAuditDetails } from '../utils/auditText';
import { xlsxCol, xmlEsc, zipStore } from '../utils/xlsxWriter';

/* ============================================================
   OF Accounting — เจ้าหน้าที่บัญชีสถาบัน (Foodka Theme)
   ปรับธีมสีตามภาพ: #FF724C, #FDBF50, #FFFFFF, #2A2C41
   และปฏิบัติตามหลัก Effective Dashboard Design
   ============================================================ */

// เขตเวลาของเซิร์ฟเวอร์/ฐานข้อมูล (ไทย = +07:00) ถ้า DB ของคุณเก็บเป็น UTC ให้เปลี่ยนเป็น 'Z'
const SERVER_TZ = '+07:00';

const RATE_WARN = 5;    // % -> เฝ้าระวัง (ตั้งแต่ค่านี้ขึ้นไป)
const RATE_ALERT = 10;  // % -> แจ้งเตือน (Alert) เมื่อ Cancel Rate มากกว่าค่านี้
const ALERT_WINDOW_DAYS = 30;   // การแจ้งเตือน Cancel Rate คำนวณจากข้อมูลย้อนหลังกี่วัน

const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const THAI_WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

// นักบัญชีบันทึกยอด/จำนวนออเดอร์ เฉพาะออเดอร์ที่ "จบ/กึ่งจบ" หรือ "ถูกยกเลิก" เท่านั้น
const SETTLED_STATUSES = ['Completed', 'NoShow'];               // ส่งมอบสำเร็จ / กึ่งจบ (ลูกค้าไม่มารับ ร้านได้เงินแล้ว)
const RECORDED_STATUSES = [...SETTLED_STATUSES, 'Cancelled'];   // สถานะที่นับเข้าบัญชี
const normStatus = (st) => {
  const t = String(st || '').trim();
  const hit = RECORDED_STATUSES.concat(['Pending', 'Cooking', 'Ready', 'Verifying_Slip', 'Pending_Cancellation'])
    .find(x => x.toLowerCase() === t.toLowerCase());
  return hit || t;
};
const isSettled = (o) => SETTLED_STATUSES.includes(normStatus(o.Status));

// โทนสีสำหรับแต่ละร้านค้า (ใช้เนกทีฟ/ส้ม/เหลือง/เทา ไม่แย่งซีนสีแจ้งเตือน)
// สีประจำร้าน/กราฟโดนัท: เลือกให้แต่ละสีต่างกันชัดเจน (ส้ม / กรมท่า / เหลือง / เขียว / ฟ้า / ม่วง / ชมพู / เขียวมิ้นต์)
const STORE_COLORS = ['#FF724C', '#2A2C41', '#FDBF50', '#16A679', '#4C8DF6', '#9B5DE5', '#E5487A', '#2EC4B6'];

/* ---------------- Pure helpers ---------------- */
const fmtMoney = (n) => {
  const num = Number(n || 0);
  return num.toLocaleString('th-TH', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  });
};

// สีของ Audit Log: แดง = ยกเลิกออเดอร์ทุกกรณี (ปฏิเสธสลิป/ร้านยกเลิก/ลูกค้ายกเลิก), เขียว = ออเดอร์ Completed, อื่น ๆ (เช่น อนุมัติสลิป) ไม่มีสี
// ตัดสินจากทั้งชื่อ Action และข้อความรายละเอียด เพื่อให้ทำงานได้กับ log ที่ backend เดิมบันทึกไว้
function auditTone(action, details) {
  const a = String(action || '').toUpperCase();
  const d = String(details || '');
  // ยังรอการตัดสินใจ/ยังไม่ถูกยกเลิกจริง -> ไม่มีสี
  if (a.includes('OUT_OF_STOCK') || a === 'CANCEL_REQUEST' || a === 'CUSTOMER_CHANGE_ITEM' || d.includes('Pending_Cancellation')) return 'neutral';
  if (a.includes('REJECT') || a.includes('CANCEL') || /->\s*Cancelled/i.test(d) || d.includes('ปฏิเสธสลิป') || d.includes('ยกเลิก')) return 'bad';
  if (a.includes('COMPLETE') || /->\s*Completed/i.test(d)) return 'green';
  return 'neutral';
}

const ROLE_LABELS = {
  'Staff/Owner': 'พนักงานร้าน / เจ้าของร้าน', 'Front Staff': 'พนักงานหน้าร้าน', 'Kitchen Staff': 'พนักงานครัว',
  'Shop Owner': 'เจ้าของร้าน', 'Executive': 'ผู้บริหาร', 'Accountant': 'เจ้าหน้าที่บัญชี', 'Customer': 'ลูกค้า',
};
const AUDIT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;   // แสดง log ย้อนหลังไม่เกิน 1 ปี
const ORDER_ID_RE = /Order(?:\s*ID)?\s*[:#]?\s*(\d+)/i;

// เดาประเภทการยกเลิกจากเหตุผลที่เก็บในออเดอร์
function classifyCancelledOrder(o) {
  const reason = String(o.CancelReason || '');
  if (reason.includes('สลิป')) return 'VERIFY_SLIP_REJECT';
  if (reason.includes('ลูกค้า')) return 'CUSTOMER_CANCEL_ORDER';
  return 'STORE_CANCEL_ORDER';
}

const AUDIT_PAGE = 500;
// รวม audit log 2 ชุดโดยไม่ซ้ำ (เรียงล่าสุดก่อน) : ชุดแรกชนะเมื่อ id ซ้ำ
function mergeLogs(first, second) {
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

function buildAuditRows(logs, orders) {
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

    rows.push({ key: `log-${l.LogID ?? l.LogId ?? l.logId ?? idx}`, orderId: order ? String(order.OrderID) : (m ? m[1] : null), time: logTime, action, by: performerOf(l, order), details, tone, derived: false, raw: l });
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

// ชื่อเหตุการณ์ภาษาไทย + หมวด (ใช้กรองใน Audit Log)
const AUDIT_ACTION_META = {
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
const STATUS_ACTION_LABEL = {
  Cooking: 'เริ่มปรุงอาหาร', Ready: 'อาหารพร้อมรับ', Completed: 'ส่งมอบสำเร็จ',
  NoShow: 'ลูกค้าไม่มารับ', Cancelled: 'ยกเลิกออเดอร์', Pending: 'รับออเดอร์',
};
const AUDIT_CATS = [['all', 'ทั้งหมด'], ['cancel', 'ยกเลิก'], ['done', 'สำเร็จ'], ['slip', 'สลิป'], ['order', 'ออเดอร์'], ['store', 'ร้านค้า/บัญชี']];

function auditMeta(r) {
  const a = String(r.action || '');
  if (a === 'UPDATE_STATUS') {
    const st = normStatus((String(r.details || '').match(/->\s*([A-Za-z_]+)/) || [])[1]);
    return { label: STATUS_ACTION_LABEL[st] || 'เปลี่ยนสถานะออเดอร์', cat: st === 'Cancelled' ? 'cancel' : st === 'Completed' ? 'done' : 'order' };
  }
  return AUDIT_ACTION_META[a] || { label: AUDIT_VERBS[a] || a, cat: /REFUND|SLIP/.test(a) ? 'slip' : /STORE|FOOD_COURT|PRODUCT|STOCK/.test(a) ? 'store' : /ORDER/.test(a) ? 'order' : 'other' };
}

const orderItemsOf = (o) => (o && (o.items || o.OrderItems || o.Items || o.orderItems)) || [];
function itemsText(order, max = 3) {
  const items = orderItemsOf(order);
  if (!items.length) return '';
  const txt = items.slice(0, max).map(it => `${it.ProductName || it.MenuName || '-'} ×${it.Qty ?? it.Quantity ?? 1}`).join(', ');
  return items.length > max ? `${txt} และอีก ${items.length - max} รายการ` : txt;
}

// ข้อความอธิบายแบบอ่านง่าย (ส่วนคิว/ร้าน/ยอดแยกไปแสดงเป็นคอลัมน์เอง)
function auditSummary(r, order) {
  const a = String(r.action || '');
  const d = String(r.details || '');
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
const AUDIT_ROW_BG = { bad: '#FFF7F7', green: '#F1FBF5' };

const colorForStore = (storeId) => STORE_COLORS[Number(storeId) % STORE_COLORS.length];
const statusLabel = (s) => (s === 'na' ? 'N/A' : s === 'bad' ? 'สูงผิดปกติ' : s === 'warn' ? 'เฝ้าระวัง' : 'ปกติ');
// ถ้าไม่มีข้อมูล (rate เป็น null) ให้แสดง N/A แทน 0%
const fmtRate = (r) => (r === null || r === undefined || Number.isNaN(r) ? 'N/A' : `${r}%`);

function parseOrderDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const normalized = String(value).trim().replace(' ', 'T');
  const alreadyHasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  // backend/MySQL ส่งเวลามาแบบไม่มี timezone (เช่น 2026-10-06T10:17:43) และเก็บเป็นเวลาไทย
  // จึงต้องตีความเป็น UTC+7 (ไม่ใช่ UTC) ไม่งั้นเวลาจะคลาดไป 7 ชั่วโมง
  const parsed = new Date(alreadyHasTimezone ? normalized : `${normalized}${SERVER_TZ}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const fmtDateTime = (d) => {
  const dt = parseOrderDate(d);
  if (!dt) return '-';
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
};

// วันที่/เวลาแบบอ่านง่าย (ใช้ใน Audit Log และ popup ออเดอร์ยกเลิก)
const fmtTimeOnly = (d) => {
  const dt = parseOrderDate(d);
  if (!dt) return '-';
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}:${String(dt.getSeconds()).padStart(2, '0')}`;
};
const fmtDateTh = (d) => {
  const dt = parseOrderDate(d);
  if (!dt) return '-';
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
};
const fmtMoney2 = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dayLabel = (key) => {
  if (!key) return 'ไม่ทราบวันที่';
  const [Y, M, D] = key.split('-');
  const base = `วัน${THAI_WEEKDAYS[new Date(+Y, +M - 1, +D).getDay()]}ที่ ${D}/${M}/${Y}`;
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (key === dateOnly(new Date())) return `วันนี้ · ${base}`;
  if (key === dateOnly(y)) return `เมื่อวาน · ${base}`;
  return base;
};
const customerNameOf = (o) => o.CustomerName || o.UserName || (Number(o.IsWalkIn) === 1 ? 'ลูกค้าหน้าร้าน (Walk-in)' : (o.UserId ? `ลูกค้า #${o.UserId}` : 'ไม่ระบุ'));

const dateOnly = (d) => {
  const dt = parseOrderDate(d);
  if (!dt) return '';
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// rangeStart (YYYY-MM-DD) ใช้ตัดสินว่าร้านที่ถูกลบแล้วควรแสดงในช่วงวันที่นั้นหรือไม่:
//  - ร้านที่ถูกลบ จะแสดงถ้าช่วงวันที่เริ่มก่อน/ตรงกับวันที่ลบ หรือมีออเดอร์อยู่ในช่วงนั้น
//  - ถ้าช่วงวันที่เริ่มหลังวันที่ลบ (เช่นวันถัดจากวันที่ลบ) ร้านจะไม่ขึ้น
//  - ไม่ส่ง rangeStart = มุมมองตลอดเวลา (ร้านที่ถูกลบยังแสดงเพื่อย้อนดูประวัติ)
function buildStoreSummary(stores, orders, rangeStart) {
  const map = {};
  const blank = (id, name, isDeleted, deletedAt) => ({
    storeId: id,
    storeName: isDeleted ? `${name} (Deleted)` : name,
    isDeleted: Boolean(isDeleted),
    deletedDay: deletedAt ? dateOnly(deletedAt) : '',
    color: colorForStore(id),
    totalOrders: 0, completedOrders: 0, cancelledOrders: 0, grossSales: 0, cancelledAmount: 0,
  });
  (stores || []).forEach(s => { map[s.StoreId] = blank(s.StoreId, s.StoreName, Number(s.IsDeleted) === 1 || s.IsDeleted === true, s.DeletedAt); });
  (orders || []).forEach(o => {
    // บันทึกเฉพาะออเดอร์ที่จบ/กึ่งจบ หรือถูกยกเลิก — ออเดอร์ที่ยังดำเนินการอยู่ไม่นับ
    const st = normStatus(o.Status);
    if (!RECORDED_STATUSES.includes(st)) return;
    if (!map[o.StoreId]) map[o.StoreId] = blank(o.StoreId, o.StoreName || `ร้าน #${o.StoreId}`, false);
    const row = map[o.StoreId];
    // ยกเลิกเพราะสลิปถูกปฏิเสธ = ร้านไม่เคยรับเงินนี้ : ไม่นับเข้ายอด (เดิมทำให้ GROSS สูงเกินจริง)
    const neverPaid = st === 'Cancelled' && o.PaymentStatus === 'REJECTED';
    const amount = neverPaid ? 0 : Number(o.TotalAmount || 0);
    row.totalOrders += 1;
    row.grossSales += amount;
    if (isSettled(o)) row.completedOrders += 1;
    if (st === 'Cancelled') {
      row.cancelledOrders += 1;
      row.cancelledAmount += amount;
    }
  });
  return Object.values(map)
    .filter(r => {
      if (!r.isDeleted || !rangeStart) return true;
      if (r.totalOrders > 0) return true;                       // มีประวัติในช่วงนี้ -> แสดง
      return !r.deletedDay || rangeStart <= r.deletedDay;       // ช่วงนี้เริ่มก่อน/ตรงวันที่ลบ -> ร้านยังมีอยู่ในช่วงนั้น
    })
    .map(r => {
      // ไม่มีออเดอร์ = ไม่มีข้อมูลให้คำนวณ -> rate เป็น null (แสดง N/A)
      const hasData = r.totalOrders > 0;
      const rate = hasData ? (r.cancelledOrders / r.totalOrders) * 100 : null;
      const status = !hasData ? 'na' : rate > RATE_ALERT ? 'bad' : rate >= RATE_WARN ? 'warn' : 'ok';
      // รายได้สุทธิ = ยอดที่บันทึกทั้งหมด - ยอดที่ถูกยกเลิก
      return { ...r, rate: hasData ? +rate.toFixed(1) : null, status, netSales: r.grossSales - r.cancelledAmount };
    })
    .sort((a, b) => b.netSales - a.netSales);
}

function filterOrdersByRange(orders, start, end, storeId) {
  return (orders || []).filter(o => {
    if (storeId && storeId !== 'all' && String(o.StoreId) !== String(storeId)) return false;
    const d = dateOnly(o.CreatedAt);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

function getPeriodBounds(range) {
  const days = range === 'today' ? 1 : (Number(range) || 7);
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return {
    currStart: dateOnly(start), currEnd: dateOnly(end),
    prevStart: dateOnly(prevStart), prevEnd: dateOnly(prevEnd),
  };
}

function buildSalesTrend(orders, range) {
  const completed = (orders || []).filter(isSettled);
  if (range === 'today') {
    const todayStr = dateOnly(new Date());
    const buckets = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, '0')}:00`, value: 0 }));
    completed.forEach(o => {
      const dt = parseOrderDate(o.CreatedAt);
      if (!dt || dateOnly(dt) !== todayStr) return;
      buckets[dt.getHours()].value += Number(o.TotalAmount || 0);
    });
    return buckets;
  }
  const days = Number(range) || 7;
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets.push({ label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, key: dateOnly(d), value: 0 });
  }
  completed.forEach(o => {
    const key = dateOnly(o.CreatedAt);
    const bucket = buckets.find(b => b.key === key);
    if (bucket) bucket.value += Number(o.TotalAmount || 0);
  });
  return buckets;
}

function buildTopMenu(orders, storeId, limit = 10, stores = []) {
  const map = {};
  const storeNameById = {};
  (stores || []).forEach(s => { storeNameById[s.StoreId] = s.StoreName; });
  (orders || []).forEach(o => {
    if (!isSettled(o)) return;
    if (storeId && storeId !== 'all' && String(o.StoreId) !== String(storeId)) return;
    const items = o.OrderItems || o.Items || o.orderItems || o.items || [];
    items.forEach(it => {
      const name = it.MenuName || it.ItemName || it.ProductName || it.Name || it.menuName || '-';
      const qty = Number(it.Quantity || it.Qty || it.quantity || 1);
      // แยกนับตามร้าน: เมนูชื่อเดียวกันแต่คนละร้านจะไม่ถูกรวมกัน
      const key = `${o.StoreId}||${name}`;
      if (!map[key]) map[key] = { name, qty: 0, storeId: o.StoreId, storeName: o.StoreName || storeNameById[o.StoreId] || `ร้าน #${o.StoreId}` };
      map[key].qty += qty;
    });
  });
  return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, limit);
}

// ยอดขายตามช่วงวันที่ที่เลือก (Sales Summary): วันเดียว = รายชั่วโมง, หลายวัน = รายวัน
function buildRangeTrend(orders, start, end) {
  const completed = (orders || []).filter(isSettled);
  if (!start || !end || start > end) return [];
  if (start === end) {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, '0')}:00`, value: 0 }));
    completed.forEach(o => {
      const dt = parseOrderDate(o.CreatedAt);
      if (!dt || dateOnly(dt) !== start) return;
      buckets[dt.getHours()].value += Number(o.TotalAmount || 0);
    });
    return buckets;
  }
  const buckets = [];
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cur <= last && buckets.length < 366) {
    buckets.push({ label: `${String(cur.getDate()).padStart(2, '0')}/${String(cur.getMonth() + 1).padStart(2, '0')}`, key: dateOnly(cur), value: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  const index = {};
  buckets.forEach(b => { index[b.key] = b; });
  completed.forEach(o => {
    const b = index[dateOnly(o.CreatedAt)];
    if (b) b.value += Number(o.TotalAmount || 0);
  });
  return buckets;
}

/* ---------------- XLSX export: สร้างไฟล์ .xlsx จริง (ZIP + OOXML) ไม่ต้องติดตั้งไลบรารีเพิ่ม ---------------- */
// สไตล์ (cellXfs): 0 ปกติ, 1 หัวเรื่อง, 2 หัวตาราง, 3 ข้อความ, 4 เงิน, 5 %, 6 ข้อความแถวรวม, 7 เงินแถวรวม, 8 หมายเหตุ, 9 จำนวนเต็ม, 10 จำนวนเต็มแถวรวม, 11 % แถวรวม
const XLSX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0&quot;%&quot;"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF697586"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFF724C"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF0EC"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD9DEE3"/></left><right style="thin"><color rgb="FFD9DEE3"/></right><top style="thin"><color rgb="FFD9DEE3"/></top><bottom style="thin"><color rgb="FFD9DEE3"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="4" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="3" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// columns: [{label, kind: 'text'|'int'|'money'|'percent', width}] / rows, totalRow: อาร์เรย์ของค่า
function buildXlsxBlob({ sheetName, title, infoLines = [], columns, rows, totalRow }) {
  const cell = (c, r, v, style, kind) => {
    const ref = `${xlsxCol(c)}${r}`;
    if (kind !== 'text' && typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
    if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${style}"/>`;
    return `<c r="${ref}" t="inlineStr" s="${style === 4 || style === 5 || style === 9 ? 3 : style === 7 || style === 10 || style === 11 ? 6 : style}"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  const dataStyle = { text: 3, int: 9, money: 4, percent: 5 };
  const totalStyle = { text: 6, int: 10, money: 7, percent: 11 };
  const out = [];
  let r = 1;
  out.push(`<row r="${r}"><c r="A${r}" t="inlineStr" s="1"><is><t>${xmlEsc(title)}</t></is></c></row>`); r++;
  infoLines.forEach(line => { out.push(`<row r="${r}"><c r="A${r}" t="inlineStr" s="8"><is><t xml:space="preserve">${xmlEsc(line)}</t></is></c></row>`); r++; });
  r++;
  out.push(`<row r="${r}" ht="22" customHeight="1">${columns.map((c, i) => cell(i, r, c.label, 2, 'text')).join('')}</row>`); r++;
  rows.forEach(row => { out.push(`<row r="${r}">${columns.map((c, i) => cell(i, r, row[i], dataStyle[c.kind] || 3, c.kind)).join('')}</row>`); r++; });
  if (totalRow) { out.push(`<row r="${r}">${columns.map((c, i) => cell(i, r, totalRow[i], totalStyle[c.kind] || 6, c.kind)).join('')}</row>`); r++; }
  const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 18}" customWidth="1"/>`).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${out.join('')}</sheetData></worksheet>`;
  const safeName = String(sheetName || 'Report').replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Report';
  return zipStore([
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', text: XLSX_STYLES },
    { name: 'xl/worksheets/sheet1.xml', text: sheet },
  ]);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- Report Config ---------------- */
const REPORT_TYPES = [
  { id: 'store', title: 'Store Summary', sub: 'สรุปยอดรายร้านครบทุกมิติ' },
  { id: 'sales', title: 'Sales Report', sub: 'ยอดขายรวมทุกร้าน' },
  { id: 'net', title: 'Net Sales Report', sub: 'ยอดขายสุทธิ' },
  { id: 'cancel', title: 'Cancellation Report', sub: 'รายงานการยกเลิกออเดอร์' },
];

const REPORT_COLUMNS = {
  store: [
    { key: 'storeName', label: 'STORE' },
    { key: 'totalOrders', label: 'ORDERS' },
    { key: 'grossSales', label: 'GROSS SALES', money: true },
    { key: 'cancelledOrders', label: 'CANCEL' },
    { key: 'rate', label: 'RATE', percent: true },
    { key: 'netSales', label: 'NET SALES', money: true },
  ],
  sales: [
    { key: 'storeName', label: 'STORE' },
    { key: 'totalOrders', label: 'ORDERS' },
    { key: 'grossSales', label: 'GROSS SALES', money: true },
  ],
  net: [
    { key: 'storeName', label: 'STORE' },
    { key: 'netSales', label: 'NET SALES', money: true },
  ],
  cancel: [
    { key: 'storeName', label: 'STORE' },
    { key: 'totalOrders', label: 'ORDERS' },
    { key: 'cancelledOrders', label: 'CANCELLED' },
    { key: 'rate', label: 'RATE', percent: true },
  ],
};

/* ---------------- SVG Icon Helper ---------------- */
function Icon({ name, size = 18, color = 'currentColor' }) {
  const paths = {
    berry: <><circle cx="6" cy="12" r="3" fill="#FF724C"/><circle cx="12" cy="7" r="3" fill="#FDBF50"/><circle cx="18" cy="12" r="3" fill="#FF724C"/><circle cx="12" cy="17" r="3" fill="#2A2C41"/></>,
    dashboard: <><path d="M4 4h6v8H4z" /><path d="M4 16h6v4H4z" /><path d="M14 12h6v8h-6z" /><path d="M14 4h6v4h-6z" /></>,
    sales: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>,
    cancel: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
    refund: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v8M14.5 9.5c-.4-.9-1.4-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2 0 2.6 5 1.4 5 4 0 1.2-1.1 2-2.5 2-1.1 0-2.1-.6-2.5-1.5" /></>,
    close: <><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>,
    audit: <><path d="M9 12h6M9 16h6M9 8h6" /><rect x="4" y="3" width="16" height="18" rx="2" /></>,
    report: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
    menu: <><path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" /></>,
    settings: <><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0 -2.573-1.066c-1.543 .94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0 -1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543 .826-3.31 2.37-2.37c1 .608 2.296 .07 2.572-1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></>,
    logout: <><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></>,
    dots: <><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></>,
    arrowUp: <><path d="M7 17L17 7M17 7H7M17 7V17"/></>,
    arrowDown: <><path d="M7 7l10 10M17 17H7M17 17V7"/></>,
    wallet: <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
    bag: <><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
    check_icon: <><path d="M5 12l5 5l10 -10" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.berry}</svg>;
}

function Badge({ tone, children }) {
  return <span className={`berry-badge tone-${tone}`}>{children}</span>;
}

/* ============================================================
   FOODKA THEME COMPONENTS
   ============================================================ */

function BerryStatCard({ label, value, tone, delta, deltaSuffix = '%', invertDelta = false, compareLabel, primary, bgTone }) {
  let deltaEl = null;
  
  // เช็คว่าพื้นหลังเป็นสีทึบหรือไม่
  const isDarkBg = bgTone === 'orange' || bgTone === 'dark';

  if (delta === null) {
  deltaEl = (
    <div className="berry-stat-delta">
      <span>N/A</span>
      {compareLabel && (
        <span
          className="berry-stat-delta-caption"
          style={{
            color: isDarkBg ? '#f3f3f3' : 'var(--berry-text-muted)'
          }}
        >
          ไม่มีข้อมูลช่วงก่อนหน้า
        </span>
      )}
    </div>
  );
} else if (delta !== undefined) {
  const isFlat = delta === 0;
  const isPositive = delta > 0;
  const isGood = isFlat ? null : (invertDelta ? !isPositive : isPositive);

  let color = isFlat
    ? 'var(--berry-text-muted)'
    : isGood
      ? 'var(--berry-green)'
      : 'var(--berry-red)';

  if (isDarkBg) {
    color = isFlat
      ? 'rgba(255,255,255,0.7)'
      : isGood
        ? '#a7f3d0'
        : '#fecaca';
  }

  deltaEl = (
    <div className="berry-stat-delta" style={{ color }}>
      {!isFlat && (
        <Icon
          name={isPositive ? 'arrowUp' : 'arrowDown'}
          size={12}
          color={color}
        />
      )}
      <span>{isFlat ? 'ไม่เปลี่ยนแปลง' : `${Math.abs(delta)}${deltaSuffix}`}</span>
      {compareLabel && (
        <span
          className="berry-stat-delta-caption"
          style={isDarkBg ? { color: 'rgba(255,255,255,0.6)' } : {}}
        >
          {compareLabel}
        </span>
      )}
    </div>
  );
  }

  // สร้าง Style ให้แต่ละการ์ดตาม bgTone ที่กำหนด
  let cardStyle = {};
  let valStyle = tone ? { color: `var(--berry-${tone})` } : {};
  let labelStyle = {};

  if (bgTone === 'orange') {
    cardStyle = { backgroundColor: '#FF724C', color: '#FFFFFF', borderColor: '#FF724C' };
    valStyle = { color: '#FFFFFF' };
    labelStyle = { color: 'rgba(255, 255, 255, 0.9)' };
  } else if (bgTone === 'dark') {
    cardStyle = { backgroundColor: '#2A2C41', color: '#FFFFFF', borderColor: '#2A2C41' };
    valStyle = { color: '#FFFFFF' };
    labelStyle = { color: 'rgba(255, 255, 255, 0.9)' };
  }

  return (
    <div className={`berry-small-card berry-stat-card ${primary && !isDarkBg ? 'primary' : ''}`} style={cardStyle}>
      <div className="berry-stat-value" style={valStyle}>{value}</div>
      <div className="berry-stat-label" style={labelStyle}>{label}</div>
      {deltaEl}
    </div>
  );
}

/* Line chart — มีเส้น Grid + แกน Y มองเห็นตลอด และ มี Custom Tooltip เมื่อ Hover */
function BerryLineChart({ data, height = 220, valueFormat, axisFormat, color = '#FF724C' }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!data || data.length === 0) {
    return <div className="berry-empty-note" style={{ height }}>ยังไม่มีข้อมูล</div>;
  }

  // แกน Y: เลือกจำนวนช่อง (3-6) ที่ทำให้แกนสูงสุดใกล้ค่าสูงสุดของข้อมูลที่สุด ให้พีคอยู่ใกล้ขอบบน
  // ขั้นของแกนปัดเป็นพหุคูณของ unit; ตั้งแต่หลักพัน unit >= 100 เพื่อให้ป้าย k มีทศนิยม 1 ตำแหน่งพอดี (เช่น 1.4k)
  const rawMax = Math.max(1, ...data.map(d => d.value));
  const exp = Math.floor(Math.log10(rawMax));
  const unit = rawMax >= 1000 ? Math.max(100, Math.pow(10, exp - 1)) : Math.max(1, 5 * Math.pow(10, exp - 1));
  let TICKS = 4, niceStep = 0, max = Infinity;
  [4, 5, 3, 6].forEach(n => {
    const step = Math.max(unit, Math.ceil(rawMax / n / unit) * unit);
    if (step * n < max) { TICKS = n; niceStep = step; max = step * n; }
  });
  // ป้ายแกน Y: ตั้งแต่หลักพันใช้ k ทศนิยม 1 ตำแหน่ง เพื่อประหยัดพื้นที่ (tooltip ยังแสดงเต็ม)
  const fmtAxis = axisFormat || ((v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))));
  const w = 600, h = 190, padX = 45, padY = 20, padBottom = 30;
  const stepX = data.length > 1 ? (w - padX * 2) / (data.length - 1) : 0;
  
  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    y: padY + (1 - d.value / max) * (h - padY - padBottom),
    ...d
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = points.length ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${h - padBottom} L ${points[0].x.toFixed(1)} ${h - padBottom} Z` : '';
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="themeLineArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 1. เส้น Grid และแกน Y */}
        {Array.from({ length: TICKS + 1 }, (_, i) => i / TICKS).map(ratio => {
          const yPos = padY + ratio * (h - padY - padBottom);
          const val = max * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={padX} y1={yPos} x2={w - padX} y2={yPos} stroke="rgba(42, 44, 65, 0.12)" strokeDasharray="4 4" />
              <text x={padX - 8} y={yPos + 4} fontSize="11" fill="rgba(42, 44, 65, 0.6)" textAnchor="end">
                {fmtAxis(val)}
              </text>
            </g>
          );
        })}

        {/* 2. กราฟหลัก */}
        <path d={areaPath} fill="url(#themeLineArea)" stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" />

        {/* 3. จุดข้อมูล และพื้นที่รับเมาส์ */}
        {points.map((p, i) => (
          <g key={i}>
            {(i % labelEvery === 0 || i === points.length - 1) && (
              <text x={p.x} y={h - 10} fontSize="11" fill="rgba(42, 44, 65, 0.6)" textAnchor="middle">
                {p.label}
              </text>
            )}
            
            <circle 
              cx={p.x} cy={p.y} 
              r={hoverIndex === i ? 5 : 3} 
              fill={hoverIndex === i ? '#FFFFFF' : color}
              stroke={color} 
              strokeWidth={hoverIndex === i ? 2 : 0}
              style={{ transition: 'all 0.2s ease' }} 
            />
            
            <rect
              x={p.x - stepX / 2} y={0} 
              width={stepX || w} height={h} 
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              style={{ cursor: 'crosshair' }}
            />
          </g>
        ))}
      </svg>

      {/* 4. Custom Tooltip */}
      {hoverIndex !== null && (
        <div
          style={{
            position: 'absolute',
            left: `calc(${(points[hoverIndex].x / w) * 100}%)`,
            top: `calc(${(points[hoverIndex].y / h) * 100}%)`,
            transform: 'translate(-50%, -120%)',
            background: '#2A2C41',
            color: '#FFFFFF',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(42, 44, 65, 0.2)',
            zIndex: 10,
            transition: 'top 0.1s, left 0.1s'
          }}
        >
          <div style={{ color: '#FDBF50', fontSize: '11px', marginBottom: '2px', fontWeight: 'bold' }}>
            {points[hoverIndex].label}
          </div>
          <div style={{ fontWeight: '700', fontSize: '14px' }}>
            {valueFormat ? valueFormat(points[hoverIndex].value) : points[hoverIndex].value}
          </div>
          <div style={{
            position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)',
            width: '0', height: '0', borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderTop: '5px solid #2A2C41'
          }} />
        </div>
      )}
    </div>
  );
}

function BerryDonutChart({ data, valueFormat, height = 240, centerLabel = 'ยอดสุทธิรวม' }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  const clean = (data || []).filter(d => Number(d.value || 0) > 0);
  if (clean.length === 0) {
    return <div className="berry-empty-note" style={{ height }}>ยังไม่มียอดขายในช่วงเวลานี้</div>;
  }

  const fmt = (v) => (valueFormat ? valueFormat(v) : v);
  const total = clean.reduce((sum, d) => sum + Number(d.value || 0), 0);

  const size = 190;
  const center = size / 2;
  const radius = 62;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;

  let accumulated = 0;
  const slices = clean.map((d, i) => {
    const val = Number(d.value || 0);
    const ratio = val / total;
    const len = ratio * circumference;
    const slice = {
      ...d,
      pct: (ratio * 100).toFixed(1),
      dashArray: `${len} ${circumference - len}`,
      strokeDashoffset: -accumulated * circumference,
      color: d.color || STORE_COLORS[i % STORE_COLORS.length],
    };
    accumulated += ratio;
    return slice;
  });

  const activeSlice = hoverIndex !== null ? slices[hoverIndex] : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '28px', flexWrap: 'wrap', minHeight: height, padding: '10px 0' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`rotate(-90 ${center} ${center})`}>
            {slices.map((slice, i) => (
              <circle
                key={i}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={slice.color}
                strokeWidth={hoverIndex === i ? strokeWidth + 5 : strokeWidth}
                strokeDasharray={slice.dashArray}
                strokeDashoffset={slice.strokeDashoffset}
                strokeLinecap="butt"
                style={{ transition: 'all 0.2s ease', cursor: 'pointer', opacity: hoverIndex === null || hoverIndex === i ? 1 : 0.4 }}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            ))}
          </g>
        </svg>

        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center', padding: '12px' }}>
          <span style={{ fontSize: '11px', color: 'var(--berry-text-muted)', fontWeight: 500, whiteSpace: 'nowrap', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activeSlice ? activeSlice.label : centerLabel}
          </span>
          <span style={{ fontSize: '17px', fontWeight: 700, color: 'var(--berry-text-dark)', marginTop: '2px' }}>
            {fmt(activeSlice ? activeSlice.value : total)}
          </span>
          {activeSlice && (
            <span style={{ fontSize: '12px', color: activeSlice.color, fontWeight: 700, marginTop: '2px' }}>{activeSlice.pct}%</span>
          )}
        </div>
      </div>

      {/* Legend: ชื่อร้าน | ยอดขาย | % */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: '1 1 260px', maxWidth: 420, minWidth: 240 }}>
        {slices.map((slice, i) => (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', opacity: hoverIndex === null || hoverIndex === i ? 1 : 0.45, transition: 'opacity 0.2s' }}
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <span style={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: slice.color, flexShrink: 0 }} />
            <span title={slice.label} style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: hoverIndex === i ? 700 : 500, color: 'var(--berry-text-dark)' }}>
              {slice.label}
            </span>
            <span style={{ color: 'var(--berry-text-muted)', whiteSpace: 'nowrap', textAlign: 'right' }}>{fmt(slice.value)}</span>
            <span style={{ fontWeight: 700, color: 'var(--berry-text-dark)', width: 52, textAlign: 'right', flexShrink: 0 }}>{slice.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Bullet chart */
function BerryBulletChart({ data, target = RATE_ALERT, warn = RATE_WARN }) {
  const max = Math.max(20, target + 5, ...data.map(d => (typeof d.value === 'number' ? d.value : 0)));
  const pct = (v) => `${Math.min(100, ((v || 0) / max) * 100)}%`;
  return (
    <div className="berry-bullet-list">
      {data.length === 0 ? (
        <div className="berry-empty-note">ยังไม่มีข้อมูล</div>
      ) : data.map((d, i) => (
        <div className="berry-bullet-row" key={i}>
          <div className="berry-bullet-label" title={d.label}>{d.label}</div>
          <div className="berry-bullet-track">
            <div className="berry-bullet-zones">
              <div className="berry-bullet-zone zone-ok" style={{ width: pct(warn) }} />
              <div className="berry-bullet-zone zone-warn" style={{ width: `calc(${pct(target)} - ${pct(warn)})` }} />
              <div className="berry-bullet-zone zone-bad" style={{ width: `calc(100% - ${pct(target)})` }} />
            </div>
            <div
              className="berry-bullet-bar"
              style={{ width: d.value === null || d.value === undefined ? '0%' : pct(d.value), background: d.status === 'bad' ? 'var(--berry-red)' : d.status === 'warn' ? 'var(--berry-amber)' : 'var(--berry-green)' }}
            />
            <div className="berry-bullet-target" style={{ left: pct(target) }} title={`เกณฑ์แจ้งเตือน ${target}%`} />
          </div>
          <div className="berry-bullet-value">{fmtRate(d.value)}</div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export default function AccountantView({ apiBase, user, onLogout }) {
  useEffect(() => {
    if (!document.getElementById('avx-font-link')) {
      const link = document.createElement('link');
      link.id = 'avx-font-link';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Sarabun:wght@400;500;600;700&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const [stores, setStores] = useState([]);
  const [orders, setOrders] = useState([]);
  const [logs, setLogs] = useState([]);
  // Audit log ดึงทีละหน้า (backend จำกัด 500 แถวต่อครั้ง) : รอบ polling รีเฟรชหน้าล่าสุด ; ปุ่มด้านล่างโหลดหน้าที่เก่ากว่า
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditLoadingOlder, setAuditLoadingOlder] = useState(false);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState('dashboard');
  useHistoryNav(page, (hash) => {
    const p = hash ?? 'dashboard';
    if (!['dashboard', 'sales', 'cancel', 'refunds', 'audit', 'report'].includes(p)) return false;
    setPage(p);
    return true;
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768);
  const [toast, setToast] = useState({ show: false, msg: '' });
  
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const [notificationsRead, setNotificationsRead] = useState(false);
  const [dropdown, setDropdown] = useState('');

  const [trendDays, setTrendDays] = useState(7);
  const [salesStoreFilter, setSalesStoreFilter] = useState('all');
  const [detailStoreId, setDetailStoreId] = useState(null);
  const [auditSearch, setAuditSearch] = useState('');
  const [cancelStoreFilter, setCancelStoreFilter] = useState('all');
  const [cancelReasonFilter, setCancelReasonFilter] = useState('');
  const [cancelDetailId, setCancelDetailId] = useState(null);
  const [cancelShowAll, setCancelShowAll] = useState(false);
  const [auditCat, setAuditCat] = useState('all');
  const [auditLimit, setAuditLimit] = useState(100);
  const [cancelRange, setCancelRange] = useState('all');   // 'all' | 'today' | 7 | 14 | 30 | 'custom' — ค่าเริ่มต้น: ทั้งหมด
  
  const todayStr = dateOnly(new Date());
  const curYear = Number(todayStr.slice(0, 4));
  const curMonth = Number(todayStr.slice(5, 7));
  const [reportType, setReportType] = useState('store');
  const [reportFormat, setReportFormat] = useState('csv');
  const [reportEnd] = useState(() => dateOnly(new Date()));
  const [reportStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return dateOnly(d); });
  const [reportMode, setReportMode] = useState('month');   // 'month' รายเดือน | 'year' รายปี | 'custom' กำหนดเอง
  const [reportMonth, setReportMonth] = useState(curMonth);
  const [reportYear, setReportYear] = useState(curYear);
  const [customStart, setCustomStart] = useState(reportStart);
  const [customEnd, setCustomEnd] = useState(reportEnd);
  const [reportStoreFilter, setReportStoreFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [salesRange, setSalesRange] = useState(7);   // 'today' | 7 | 14 | 30 | 'month' | 'custom' — ค่าเริ่มต้น: 7 วัน
  const [salesCustomStart, setSalesCustomStart] = useState(reportStart);
  const [salesMonth, setSalesMonth] = useState(() => new Date().toISOString().slice(0, 7));   // 'YYYY-MM' (เลือกเดือน)
  const [salesCustomEnd, setSalesCustomEnd] = useState(reportEnd);
  const [cancelCustomStart, setCancelCustomStart] = useState(reportStart);
  const [cancelCustomEnd, setCancelCustomEnd] = useState(reportEnd);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [loadError, setLoadError] = useState('');
  const [connInfo, setConnInfo] = useState('');
  const baseRef = useRef(null);

  // หา URL ของ backend: ใช้ apiBase ที่ส่งเข้ามาก่อน ถ้าไม่มี/ต่อไม่ได้ ลองพอร์ต 8000 ของเครื่องเดียวกัน
  const resolveBase = async () => {
    if (baseRef.current) return baseRef.current;
    const host = window.location.hostname || 'localhost';
    const candidates = [...new Set(
      [apiBase, `${window.location.protocol}//${host}:8000`, `http://127.0.0.1:8000`, `http://localhost:8000`, window.location.origin]
        .filter(Boolean).map(b => String(b).trim().replace(/\/+$/, ''))
    )];
    const tried = [];
    for (const b of candidates) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      try {
        const r = await fetch(`${b}/api/stores`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (r.ok) { baseRef.current = b; return b; }
        tried.push(`${b} → HTTP ${r.status}`);
      } catch (e) {
        clearTimeout(timer);
        tried.push(`${b} → ${e.name === 'AbortError' ? 'ไม่ตอบสนอง' : 'เชื่อมต่อไม่ได้'}`);
      }
    }
    throw new Error(tried.join('  |  '));
  };

  const fetchData = async () => {
    let base;
    try {
      base = await resolveBase();
    } catch (e) {
      setLoadError(`เชื่อมต่อ backend ไม่ได้ — ${e.message}${apiBase ? '' : '  (ไม่ได้รับ apiBase จากหน้าหลัก)'}`);
      setLoading(false);
      return;
    }

    const getList = (path) => fetch(`${base}${path}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(`${path} → HTTP ${r.status}${body && body.detail ? `: ${typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)}` : ''}`);
        }
        return r.json();
      })
      .then(d => (Array.isArray(d) ? d : Promise.reject(new Error(`${path} → ข้อมูลไม่ใช่รายการ`))));

    const storesReq = getList('/api/stores/history').catch(() => getList('/api/stores'));  // ถ้า history ใช้ไม่ได้ ถอยไปใช้รายชื่อร้านปกติ
    const [st, od, lg] = await Promise.allSettled([storesReq, getList('/api/orders'), getList(`/api/audit-logs?limit=${AUDIT_PAGE}`)]);
    if (st.status === 'fulfilled') setStores(st.value);
    if (od.status === 'fulfilled') setOrders(od.value);
    if (lg.status === 'fulfilled') {
      setLogs(prev => mergeLogs(lg.value, prev));
      setAuditHasMore(prev => prev || lg.value.length >= AUDIT_PAGE);
    }
    const failed = [st, od, lg].filter(r => r.status === 'rejected').map(r => r.reason && r.reason.message);
    setLoadError(failed.length ? `โหลดข้อมูลจากฐานข้อมูลไม่สำเร็จ — ${failed.join('  |  ')}` : '');
    setConnInfo(failed.length === 0 && od.value.length === 0
      ? `เชื่อมต่อ backend (${base}) สำเร็จ แต่ยังไม่มีออเดอร์ในฐานข้อมูล` : '');
    if (failed.length < 3) setLastUpdated(new Date());
    setLoading(false);
  };

  const loadOlderLogs = async () => {
    setAuditLoadingOlder(true);
    try {
      const base = baseRef.current || apiBase || '';
      const res = await fetch(`${base}/api/audit-logs?limit=${AUDIT_PAGE}&offset=${logs.length}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const older = Array.isArray(d) ? d : [];
      setLogs(prev => mergeLogs(prev, older));
      setAuditHasMore(older.length >= AUDIT_PAGE);
    } catch (e) {
      setLoadError(`โหลดประวัติเก่าไม่สำเร็จ — ${e.message}`);
    } finally {
      setAuditLoadingOlder(false);
    }
  };

  useEffect(() => {
    baseRef.current = null;
    fetchData();
    return startPolling(fetchData, 15000); // fetchData คืน Promise : ไม่ยิงซ้อนรอบที่ยังไม่เสร็จ
  }, [apiBase]);

  const showToast = (msg) => {
    setToast({ show: true, msg });
    clearTimeout(window.__avxToastTimer);
    window.__avxToastTimer = setTimeout(() => setToast({ show: false, msg: '' }), 2600);
  };
  
  const toggleDropdown = (name) => setDropdown(prev => (prev === name ? '' : name));

  const storeSummary = useMemo(() => buildStoreSummary(stores, orders), [stores, orders]);
  const overview = useMemo(() => {
    const totalGross = storeSummary.reduce((a, s) => a + s.grossSales, 0);
    const totalOrders = storeSummary.reduce((a, s) => a + s.totalOrders, 0);
    const totalCancelled = storeSummary.reduce((a, s) => a + s.cancelledOrders, 0);
    const rate = totalOrders > 0 ? +((totalCancelled / totalOrders) * 100).toFixed(1) : null;
    return { totalGross, totalOrders, totalCancelled, rate, abnormalStores: storeSummary.filter(s => s.status === 'bad' && !s.isDeleted) };
  }, [storeSummary]);

  // แจ้งเตือน Cancellation Rate: คำนวณจากข้อมูลย้อนหลัง ALERT_WINDOW_DAYS วัน (ไม่ขึ้นกับตัวกรองของหน้าใด ๆ)
  const alertSummary = useMemo(() => {
    const { currStart, currEnd } = getPeriodBounds(ALERT_WINDOW_DAYS);
    return buildStoreSummary(stores, filterOrdersByRange(orders, currStart, currEnd, 'all'), currStart);
  }, [stores, orders]);
  const alertStores = useMemo(
    () => alertSummary.filter(s => s.status === 'bad' && !s.isDeleted).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)),
    [alertSummary]
  );
  // มีร้านใหม่เกินเกณฑ์ -> ให้ตัวเลขบนกระดิ่งขึ้นอีกครั้ง
  const alertKey = alertStores.map(x => x.storeId).join(',');
  useEffect(() => { setNotificationsRead(false); }, [alertKey]);

  // ช่วงเวลาของหน้า Cancellation (ทั้งหมด = ไม่จำกัดวันที่)
  const cancelBounds = useMemo(() => {
    if (cancelRange === 'all') return { start: '', end: '' };
    if (cancelRange === 'custom') return { start: cancelCustomStart, end: cancelCustomEnd };
    const { currStart, currEnd } = getPeriodBounds(cancelRange);
    return { start: currStart, end: currEnd };
  }, [cancelRange, cancelCustomStart, cancelCustomEnd]);
  const cancelOrders = useMemo(() => filterOrdersByRange(orders, cancelBounds.start, cancelBounds.end, 'all'), [orders, cancelBounds]);
  const cancelStoreSummary = useMemo(
    () => buildStoreSummary(stores, cancelOrders, cancelBounds.start || undefined),
    [stores, cancelOrders, cancelBounds]
  );
  const cancelOverview = useMemo(() => {
    const totalOrders = cancelStoreSummary.reduce((a, s) => a + s.totalOrders, 0);
    const totalCancelled = cancelStoreSummary.reduce((a, s) => a + s.cancelledOrders, 0);
    const rate = totalOrders > 0 ? +((totalCancelled / totalOrders) * 100).toFixed(1) : null;
    return { totalOrders, totalCancelled, rate, abnormalStores: cancelStoreSummary.filter(s => s.status === 'bad' && !s.isDeleted) };
  }, [cancelStoreSummary]);

  // เรียงจากอัตราการยกเลิกมากที่สุด -> น้อยที่สุด
  const cancelSummary = useMemo(
    () => [...cancelStoreSummary].sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.cancelledOrders - a.cancelledOrders || b.totalOrders - a.totalOrders),
    [cancelStoreSummary]
  );
  // เลือกร้านใดร้านหนึ่ง -> กราฟ/ตัวเลข/รายงานแสดงเฉพาะร้านนั้น, เลือกทุกร้านค้า -> แสดงทุกร้าน
  const cancelTableRows = cancelStoreFilter === 'all'
    ? cancelSummary
    : cancelSummary.filter(s => String(s.storeId) === String(cancelStoreFilter));
  const cancelScope = (() => {
    const totalOrders = cancelTableRows.reduce((a, s) => a + s.totalOrders, 0);
    const totalCancelled = cancelTableRows.reduce((a, s) => a + s.cancelledOrders, 0);
    return { totalOrders, totalCancelled, rate: totalOrders > 0 ? +((totalCancelled / totalOrders) * 100).toFixed(1) : null };
  })();
  const cancelledOrdersList = useMemo(
    () => cancelOrders.filter(o => normStatus(o.Status) === 'Cancelled' && (cancelStoreFilter === 'all' || String(o.StoreId) === String(cancelStoreFilter))),
    [cancelOrders, cancelStoreFilter]
  );

  // ช่วงวันที่ของ Sales Summary: ตามปุ่มที่เลือก หรือกำหนดเอง
  const { salesStart, salesEnd } = useMemo(() => {
    if (salesRange === 'custom') return { salesStart: salesCustomStart, salesEnd: salesCustomEnd };
    if (salesRange === 'month' && /^\d{4}-\d{2}$/.test(salesMonth)) {
      const [y, m] = salesMonth.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();   // วันสุดท้ายของเดือน
      return { salesStart: `${salesMonth}-01`, salesEnd: `${salesMonth}-${String(last).padStart(2, '0')}` };
    }
    const { currStart, currEnd } = getPeriodBounds(salesRange);
    return { salesStart: currStart, salesEnd: currEnd };
  }, [salesRange, salesCustomStart, salesCustomEnd, salesMonth]);
  const salesOrders = useMemo(() => filterOrdersByRange(orders, salesStart, salesEnd, 'all'), [orders, salesStart, salesEnd]);
  const salesStoreSummary = useMemo(() => buildStoreSummary(stores, salesOrders, salesStart), [stores, salesOrders, salesStart]);

  // เรียงตามยอดสุทธิจากมากไปน้อย (ถ้าเท่ากันเรียงตามยอดขายรวม แล้วตามชื่อร้าน)
  const salesFilteredRows = useMemo(() => {
    const rows = salesStoreFilter === 'all'
      ? salesStoreSummary
      : salesStoreSummary.filter(s => String(s.storeId) === String(salesStoreFilter));
    return [...rows].sort((a, b) =>
      b.netSales - a.netSales || b.grossSales - a.grossSales || String(a.storeName).localeCompare(String(b.storeName), 'th'));
  }, [salesStoreSummary, salesStoreFilter]);

  const salesTotals = useMemo(() => {
    const gross = salesFilteredRows.reduce((a, s) => a + s.grossSales, 0);
    const net = salesFilteredRows.reduce((a, s) => a + s.netSales, 0);
    const completed = salesFilteredRows.reduce((a, s) => a + s.completedOrders, 0);
    const cancelled = salesFilteredRows.reduce((a, s) => a + s.cancelledOrders, 0);
    return { gross, net, completed, cancelled };
  }, [salesFilteredRows]);

  const topMenu = useMemo(() => buildTopMenu(salesOrders, salesStoreFilter, 10, stores), [salesOrders, salesStoreFilter, stores]);
  // ยอดขายตามช่วงเวลาของร้านที่เลือกใน Sales Summary (แสดงเมื่อกรองแยกร้านเท่านั้น)
  const salesTrend = useMemo(() => {
    if (salesStoreFilter === 'all') return [];
    const ords = salesOrders.filter(o => String(o.StoreId) === String(salesStoreFilter));
    return buildRangeTrend(ords, salesStart, salesEnd);
  }, [salesOrders, salesStoreFilter, salesStart, salesEnd]);
  const hourlyTrend = useMemo(() => buildSalesTrend(orders, trendDays), [orders, trendDays]);

  // ดึงข้อมูลเมนูของร้านที่ถูกเลือกเพื่อแสดงใน Modal แบบละเอียด
  const detailStoreMenus = useMemo(() => {
    if (!detailStoreId) return [];
    return buildTopMenu(salesOrders, detailStoreId, 100, stores); // ดึงสูงสุด 100 เมนูที่ขายได้ของร้านที่เลือก
  }, [salesOrders, detailStoreId, stores]);

  const periodStats = useMemo(() => {
    const { currStart, currEnd, prevStart, prevEnd } = getPeriodBounds(trendDays);
    const summarize = (ords, startDay) => {
      const s = buildStoreSummary(stores, ords, startDay);
      const gross = s.reduce((a, x) => a + x.grossSales, 0);
      const net = s.reduce((a, x) => a + x.netSales, 0); 
      const totalOrders = s.reduce((a, x) => a + x.totalOrders, 0);
      const completed = s.reduce((a, x) => a + x.completedOrders, 0);   // ออเดอร์ที่สำเร็จ (Completed + NoShow)
      const cancelled = s.reduce((a, x) => a + x.cancelledOrders, 0);
      const rate = totalOrders > 0 ? +((cancelled / totalOrders) * 100).toFixed(1) : null;
      return { gross, net, totalOrders, completed, cancelled, rate, storesData: s }; 
    };
    
      const curr = summarize(filterOrdersByRange(orders, currStart, currEnd, 'all'), currStart);
      const prev = summarize(filterOrdersByRange(orders, prevStart, prevEnd, 'all'), prevStart);
      const pctChange = (c, p) => {
        if (p === 0) {
          return c === 0 ? 0 : null;
        }
        return +(((c - p) / p) * 100).toFixed(1);
      };
      const compareLabel = trendDays === 'today' ? 'เทียบกับเมื่อวาน' : `เทียบกับ ${trendDays} วันก่อนหน้า`;
      return {
        curr, prev, compareLabel,
        deltaGross: pctChange(curr.gross, prev.gross),
        deltaNet: pctChange(curr.net, prev.net), 
        deltaOrders: pctChange(curr.completed, prev.completed),
        deltaCancelled: pctChange(curr.cancelled, prev.cancelled),
        deltaRate: curr.rate === null || prev.rate === null ? null : +(curr.rate - prev.rate).toFixed(1),
      };
    }, [orders, stores, trendDays]);

  // ร้านค้ายอดนิยม (Dashboard): ตามช่วงเวลาที่เลือก เรียงตามยอดสุทธิ ตัดร้านที่ไม่มียอดและร้านที่ถูกลบออก
  const topStores = useMemo(
    () => [...periodStats.curr.storesData]
      .filter(s => !s.isDeleted && s.totalOrders > 0)
      .sort((a, b) => b.netSales - a.netSales || b.grossSales - a.grossSales)
      .slice(0, 5),
    [periodStats]
  );

  const auditRows = useMemo(() => buildAuditRows(logs, orders), [logs, orders]);
  const auditTs = (r) => { const d = parseOrderDate(r.time); return d ? d.getTime() : 0; };

  // ข้อมูลการยกเลิกของแต่ละออเดอร์ (ใครกดยกเลิก / เวลา) จาก Audit Log — ใช้บันทึกจริงก่อนแถวที่สร้างจากข้อมูลออเดอร์
  const cancelInfoByOrder = useMemo(() => {
    const map = {};
    auditRows.forEach(r => {
      if (!r.orderId || r.tone !== 'bad') return;
      const cur = map[r.orderId];
      if (!cur || (cur.derived && !r.derived) || (cur.derived === r.derived && auditTs(r) > auditTs(cur))) map[r.orderId] = r;
    });
    return map;
  }, [auditRows]);
  const cancelInfoOf = (o) => {
    const hit = cancelInfoByOrder[String(o.OrderID)];
    if (hit) return { by: hit.by, time: hit.time, known: !hit.derived, label: hit.label };
    const act = classifyCancelledOrder(o);
    return {
      by: act === 'CUSTOMER_CANCEL_ORDER' ? customerNameOf(o) : `พนักงานร้าน ${o.StoreName || '-'}`,
      time: o.CreatedAt, known: false, label: AUDIT_ACTION_META[act].label,
    };
  };

  const auditSearched = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return auditRows;
    return auditRows.filter(r =>
      [r.action, r.label, r.by, r.details, r.summary, r.queue, r.storeName, fmtDateTime(r.time)]
        .some(v => String(v || '').toLowerCase().includes(q)));
  }, [auditRows, auditSearch]);
  const auditCatCounts = useMemo(() => {
    const c = { all: auditSearched.length };
    auditSearched.forEach(r => { c[r.cat] = (c[r.cat] || 0) + 1; });
    return c;
  }, [auditSearched]);
  const auditFiltered = useMemo(
    () => (auditCat === 'all' ? auditSearched : auditSearched.filter(r => r.cat === auditCat)),
    [auditSearched, auditCat]
  );
  const auditGroups = useMemo(() => {
    const groups = [];
    auditFiltered.slice(0, auditLimit).forEach(r => {
      const key = dateOnly(r.time);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.rows.push(r);
      else groups.push({ key, rows: [r] });
    });
    return groups;
  }, [auditFiltered, auditLimit]);

  // ช่วงเวลาของรายงานการเงิน: รายเดือน / รายปี / กำหนดเอง (เลือกได้ถึงวันที่ล่าสุด = วันนี้)
  const reportYearOptions = useMemo(() => {
    let first = curYear - 1;
    orders.forEach(o => { const y = Number(dateOnly(o.CreatedAt).slice(0, 4)); if (y && y < first) first = y; });
    return Array.from({ length: curYear - first + 1 }, (_, i) => curYear - i);
  }, [orders, curYear]);
  const reportMaxMonth = reportYear >= curYear ? curMonth : 12;
  const reportMonthEff = Math.min(reportMonth, reportMaxMonth);
  const { rangeStart, rangeEnd, reportPeriodLabel } = useMemo(() => {
    const cap = (d) => (d > todayStr ? todayStr : d);
    if (reportMode === 'year') {
      return { rangeStart: `${reportYear}-01-01`, rangeEnd: cap(`${reportYear}-12-31`), reportPeriodLabel: `รายปี ${reportYear} (พ.ศ. ${reportYear + 543})` };
    }
    if (reportMode === 'month') {
      const mm = String(reportMonthEff).padStart(2, '0');
      const last = String(new Date(reportYear, reportMonthEff, 0).getDate()).padStart(2, '0');
      return { rangeStart: `${reportYear}-${mm}-01`, rangeEnd: cap(`${reportYear}-${mm}-${last}`), reportPeriodLabel: `รายเดือน ${THAI_MONTHS[reportMonthEff - 1]} ${reportYear} (พ.ศ. ${reportYear + 543})` };
    }
    const st = customStart || todayStr, en = customEnd || todayStr;
    return { rangeStart: st <= en ? st : en, rangeEnd: cap(st <= en ? en : st), reportPeriodLabel: 'กำหนดเอง' };
  }, [reportMode, reportYear, reportMonthEff, customStart, customEnd, todayStr]);

  const reportOrders = useMemo(() => filterOrdersByRange(orders, rangeStart, rangeEnd, reportStoreFilter), [orders, rangeStart, rangeEnd, reportStoreFilter]);
  const reportSummary = useMemo(() => {
    const rows = buildStoreSummary(stores, reportOrders, rangeStart);
    // เลือกร้านใดร้านหนึ่ง -> แสดงเฉพาะร้านนั้น (เลือก "ทุกร้านค้า" จะแสดงทุกร้านรวมร้านที่ยอด 0)
    return reportStoreFilter === 'all' ? rows : rows.filter(r => String(r.storeId) === String(reportStoreFilter));
  }, [stores, reportOrders, reportStoreFilter, rangeStart]);
  // รายชื่อร้านใน dropdown ของรายงาน: ตามช่วงวันที่ที่เลือก (ร้านที่ลบแล้วจะอยู่ในรายการเฉพาะช่วงที่ยังมีประวัติ)
  const reportStoreOptions = useMemo(
    () => buildStoreSummary(stores, filterOrdersByRange(orders, rangeStart, rangeEnd, 'all'), rangeStart),
    [stores, orders, rangeStart, rangeEnd]
  );
  useEffect(() => {
    if (reportStoreFilter !== 'all' && !reportStoreOptions.some(x => String(x.storeId) === String(reportStoreFilter))) setReportStoreFilter('all');
  }, [reportStoreOptions, reportStoreFilter]);
  useEffect(() => {
    if (salesStoreFilter !== 'all' && !salesStoreSummary.some(x => String(x.storeId) === String(salesStoreFilter))) setSalesStoreFilter('all');
  }, [salesStoreSummary, salesStoreFilter]);
  useEffect(() => {
    if (cancelStoreFilter !== 'all' && !cancelStoreSummary.some(x => String(x.storeId) === String(cancelStoreFilter))) setCancelStoreFilter('all');
  }, [cancelStoreSummary, cancelStoreFilter]);
  const reportColumns = REPORT_COLUMNS[reportType] || REPORT_COLUMNS.store;

  const exportReport = () => {
    if (reportSummary.length === 0) { showToast('ไม่มีข้อมูลให้ส่งออกในช่วงเวลาที่เลือก'); return; }
    const header = reportColumns.map(c => c.label);
    const rows = reportSummary.map(s => reportColumns.map(c => s[c.key]));
    const storeLabel = reportStoreFilter === 'all' ? 'ทุกร้านค้า' : (reportSummary[0] ? reportSummary[0].storeName : '-');
    const typeInfo = REPORT_TYPES.find(t => t.id === reportType) || REPORT_TYPES[0];
    const fileBase = `FinancialReport-${reportType}-${rangeStart}_${rangeEnd}`;

    if (reportFormat === 'xlsx') {
      const columns = reportColumns.map(c => ({
        label: c.label,
        kind: c.money ? 'money' : c.percent ? 'percent' : c.key === 'storeName' ? 'text' : 'int',
        width: c.key === 'storeName' ? 34 : 16,
      }));
      // แถวรวม: ผลรวมของตัวเลข, อัตรายกเลิกรวมคำนวณจากยอดรวม (ไม่ใช่ค่าเฉลี่ยของ %)
      const sum = (key) => reportSummary.reduce((a, s) => a + Number(s[key] || 0), 0);
      const totalRow = reportColumns.map((c, i) => {
        if (i === 0) return 'รวม';
        if (c.percent) return sum('totalOrders') > 0 ? +((sum('cancelledOrders') / sum('totalOrders')) * 100).toFixed(1) : 'N/A';
        return sum(c.key);
      });
      const blob = buildXlsxBlob({
        sheetName: typeInfo.title,
        title: `${typeInfo.title} — ${typeInfo.sub}`,
        infoLines: [
          `ช่วงข้อมูล: ${reportPeriodLabel} (${rangeStart} ถึง ${rangeEnd})`,
          `ร้านค้า: ${storeLabel}`,
          `ออกรายงานเมื่อ: ${fmtDateTime(new Date())}`,
        ],
        columns,
        rows: rows.map(r => r.map((v, i) => (columns[i].kind === 'percent' && (v === null || v === undefined) ? 'N/A' : v))),
        totalRow,
      });
      downloadBlob(blob, `${fileBase}.xlsx`);
      showToast('ส่งออกรายงานเป็นไฟล์ Excel (.xlsx) สำเร็จ');
      return;
    }

    // ข้อความที่ขึ้นต้นด้วย = + - @ จะถูก Excel ตีเป็นสูตร (เช่นชื่อร้าน/เหตุผลที่ผู้ใช้พิมพ์) : ใส่ ' นำหน้ากันไว้
    const cell = (v) => { const t = String(v ?? ''); return typeof v === 'string' && /^[=+\-@\t\r]/.test(t) ? `'${t}` : t; };
    const csv = [header, ...rows].map(r => r.map(v => `"${cell(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), `${fileBase}.csv`);
    showToast('ส่งออกรายงานเป็นไฟล์ CSV สำเร็จ');
  };

  // กดจากการแจ้งเตือน -> ไปหน้า Cancellation ของร้านนั้นในช่วง 30 วัน
  const openStoreCancel = (storeId) => {
    setCancelStoreFilter(String(storeId));
    setCancelRange(ALERT_WINDOW_DAYS);
    setCancelReasonFilter('');
    setCancelShowAll(false);
    setPage('cancel');
    setDropdown('');
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', caption: 'ภาพรวมบัญชี', icon: 'dashboard' },
    { id: 'sales', label: 'Sales Summary', caption: 'สรุปยอดขาย', icon: 'sales' },
    { id: 'cancel', label: 'Cancellation', caption: 'วิเคราะห์การยกเลิก', icon: 'cancel', badge: alertStores.length || null },
    { id: 'refunds', label: 'Refund Log', caption: 'ประวัติการคืนเงิน', icon: 'refund' },
    { id: 'audit', label: 'Audit Log', caption: 'ประวัติการเปลี่ยนแปลง', icon: 'audit' },
    { id: 'report', label: 'Financial Report', caption: 'ออกรายงานการเงิน', icon: 'report' },
  ];

  if (loading) {
    return <div className="berry-root"><style>{STYLES}</style><div style={{padding: '24px'}}>กำลังโหลดข้อมูล...</div></div>;
  }

  return (
    <div className="berry-root">
      <style>{STYLES}</style>
      
      {/* ===== TOPBAR (HEADER) ===== */}
      <header className="berry-topbar">
        <div className="berry-topbar-left">
          <button className="berry-icon-btn purple-light" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Icon name="menu" size={20} color="var(--berry-purple)" />
          </button>

          <div className="berry-brand">
            <div className="brand-title">
              <span>OnlyFoods - Accountant</span>
            </div>
            <div className="brand-subtitle">
              ระบบจัดการบัญชีส่วนกลาง
            </div>
          </div>
        </div>

        <div className="berry-topbar-right">
          <div style={{ position: 'relative' }}>
            <button className="berry-icon-btn amber-light" onClick={() => { setNotificationsRead(true); toggleDropdown('notif');}}>
              <Icon name="bell" size={20} color="var(--berry-amber)" />
              {!notificationsRead && alertStores.length > 0 && (
                <span className="berry-nav-badge" style={{ position: 'absolute', top: -5, right: -5 }}>{alertStores.length}</span>
              )}
            </button>
            {dropdown === 'notif' && (
              <div className="berry-profile-dropdown" style={{ right: 0, width: '300px' }}>
                <div className="dropdown-header">
                  <h4>Notifications <span>({alertStores.length})</span></h4>
                  <p>อัตรายกเลิกเกิน {RATE_ALERT}% ในช่วง {ALERT_WINDOW_DAYS} วันล่าสุด</p>
                </div>
                <hr className="berry-divider" />
                {alertStores.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--berry-text-muted)' }}>ไม่มีการแจ้งเตือน</div>
                ) : alertStores.map(s => (
                  <div key={s.storeId} className="dropdown-item" onClick={() => openStoreCancel(s.storeId)}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600 }}>{s.storeName}</span>
                      <span style={{ fontSize: '12px', color: 'var(--berry-text-muted)' }}>อัตรายกเลิก {s.rate}% ({s.cancelledOrders}/{s.totalOrders} ออเดอร์)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="berry-profile-container" ref={profileRef}>
            <div className="berry-user-chip" onClick={() => setProfileOpen(!profileOpen)}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--berry-text-dark)' }}>
                {user?.name || user?.FullName || 'Accountant'}
              </span>
              <Icon name="settings" size={18} color="var(--berry-text-dark)" />
            </div>

            {profileOpen && (
              <div className="berry-profile-dropdown">
                <div className="dropdown-header">
                  <h4>Welcome, {user?.name || user?.FullName || 'Accountant'}</h4>
                  <p>เจ้าหน้าที่บัญชี</p>
                </div>
                <hr className="berry-divider" />
                <div className="dropdown-item" onClick={() => { if(onLogout) onLogout(); }}>
                  <Icon name="logout" size={18} /> Logout
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== BODY ===== */}
      <div className="berry-body">
        
        {/* SIDEBAR */}
        <aside className={`berry-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          <nav className="berry-nav">
            <div className="berry-nav-group">
              <div className="berry-nav-label hide-on-collapse">Menu</div>
              {navItems.map(n => (
                <div 
                  key={n.id} 
                  className={`berry-nav-item ${page === n.id ? 'active' : ''}`} 
                  onClick={() => { setPage(n.id); if (window.innerWidth <= 768) setSidebarOpen(false); }}
                  title={!sidebarOpen ? n.label : ""}
                >
                  <div className="berry-nav-icon"><Icon name={n.icon} size={20} /></div>
                  <div className="berry-nav-text hide-on-collapse">
                    <div className="title">{n.label}</div>
                    <div className="caption">{n.caption}</div>
                  </div>
                  {n.badge ? <span className="berry-nav-badge hide-on-collapse">{n.badge}</span> : null}
                </div>
              ))}
            </div>
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <main className="berry-content">
          {!loadError && connInfo && (
            <div style={{ background: '#FFFBF0', border: '1px solid #FDBF50', color: '#8a5a00', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              ℹ️ {connInfo}
            </div>
          )}
          {loadError && (
            <div style={{ background: '#FFF7F7', border: '1px solid #fecaca', color: '#b42318', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              ⚠️ {loadError} — ตัวเลขที่เห็นอาจไม่ครบ (ระบบจะลองใหม่อัตโนมัติ)
            </div>
          )}
          
          {page === 'dashboard' && (
            <div className="berry-dashboard-grid">
              <div className="berry-dashboard-toprow">
                <div>
                  <h2 style={{ margin: 0 }}>ภาพรวมศูนย์อาหาร</h2>
                  <div style={{ color: 'var(--berry-text-muted)', fontSize: 13 }}>
                    ยอดขายและอัตรายกเลิกของ{trendDays === 'today' ? 'วันนี้' : `${trendDays} วันล่าสุด`}
                  </div>
                </div>
                {lastUpdated && (
                  <div className="berry-updated-stamp">อัปเดตล่าสุด: {fmtDateTime(lastUpdated)}</div>
                )}
              </div>

              <div className="berry-stats-row-4">
                <BerryStatCard
                  bgTone="orange"
                  label="ยอดขายสุทธิรวม"
                  value={`฿${fmtMoney(periodStats.curr.net)}`} 
                  delta={periodStats.deltaNet}
                  compareLabel={periodStats.compareLabel}
                />
                <BerryStatCard
                  bgTone="dark"
                  label="จำนวนออเดอร์ที่สำเร็จ"
                  value={fmtMoney(periodStats.curr.completed)}
                  delta={periodStats.deltaOrders}
                  compareLabel={periodStats.compareLabel}
                />
                <BerryStatCard
                  label="จำนวนออเดอร์ที่ยกเลิก"
                  value={fmtMoney(periodStats.curr.cancelled)}
                  delta={periodStats.deltaCancelled}
                  invertDelta
                  compareLabel={periodStats.compareLabel}
                />
                <BerryStatCard
                  label="อัตราการยกเลิก"
                  value={fmtRate(periodStats.curr.rate)}
                  tone={periodStats.curr.rate === null ? undefined : periodStats.curr.rate > RATE_ALERT ? 'red' : periodStats.curr.rate >= RATE_WARN ? 'amber' : 'green'}
                  delta={periodStats.deltaRate}
                  deltaSuffix="pp"
                  invertDelta
                  compareLabel={periodStats.compareLabel}
                />
              </div>

              <div className="berry-chart-row">
                <div className="berry-panel" style={{ flex: '2 1 600px' }}>
                  <div className="berry-panel-header">
                    <div>
                      <div className="berry-growth-title">ยอดขายตามช่วงเวลา</div>
                      <div className="berry-panel-caption">แนวโน้มยอดขายที่สำเร็จแล้ว — ใช้ดูว่าช่วงไหนขายดีหรือขายตก</div>
                    </div>
                    <div className="berry-toggle-pills">
                      {[['today', 'วันนี้'], [7, '7 วัน'], [14, '14 วัน'], [30, '30 วัน']].map(([val, label]) => (
                        <button
                          key={val}
                          className={trendDays === val ? 'active' : ''}
                          onClick={() => setTrendDays(val)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <BerryLineChart data={hourlyTrend} height={290} valueFormat={(v) => `฿${fmtMoney(v)}`} axisFormat={(v) => (v >= 1000 ? `฿${(v / 1000).toFixed(1)}k` : `฿${Math.round(v)}`)} />
                </div>
                <div className="berry-panel" style={{ flex: '1 1 420px' }}>
                  <div className="berry-panel-header">
                    <div>
                      <div className="berry-growth-title">รายได้สุทธิแยกร้าน</div>
                      <div className="berry-panel-caption">สัดส่วน (%) และยอดขายสุทธิของแต่ละร้าน</div>
                    </div>
                  </div>

                  <BerryDonutChart
                    data={[...periodStats.curr.storesData]
                      .filter(s => s.netSales > 0)
                      .sort((x, y) => y.netSales - x.netSales)
                      .map(s => ({ label: s.storeName, value: s.netSales }))}
                    valueFormat={(v) => `฿${fmtMoney(v)}`}
                  />
                </div>
              </div>

              <div className="berry-panel">
                <div className="berry-panel-header">
                  <div>
                    <h3 style={{ margin: 0 }}>ร้านค้าที่ต้องเฝ้าระวัง</h3>
                    <div className="berry-panel-caption">เรียงตามอัตรายกเลิกจากสูงไปต่ำ</div>
                  </div>
                  <span className="berry-link" onClick={() => setPage('cancel')}>ดูการวิเคราะห์ทั้งหมด →</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="berry-table">
                    <thead>
                      <tr>
                        <th>ร้าน</th>
                        <th>ORDERS</th>
                        <th>ยอดขายรวม</th> 
                        <th>ยอดขายสุทธิ</th> 
                        <th>CANCEL</th>
                        <th>RATE</th>
                        <th>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...storeSummary].filter(s => !s.isDeleted || !s.deletedDay || s.deletedDay >= dateOnly(new Date())).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1)).map(s => (
                        <tr key={s.storeId}>
                          <td><b>{s.storeName}</b></td>
                          <td>{fmtMoney(s.totalOrders)}</td>
                          <td>฿{fmtMoney(s.grossSales)}</td> 
                          <td style={{ fontWeight: 600 }}>฿{fmtMoney(s.netSales)}</td> 
                          <td>{fmtMoney(s.cancelledOrders)}</td>
                          <td>{fmtRate(s.rate)}</td>
                          <td><Badge tone={s.status === 'na' ? 'neutral' : s.status}>{statusLabel(s.status)}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="berry-panel">
                <div className="berry-panel-header">
                  <div>
                    <h3 style={{ margin: 0 }}>ร้านค้ายอดนิยม</h3>
                    <div className="berry-panel-caption">Top 5 เรียงตามยอดขายสุทธิ</div>
                  </div>
                  <span className="berry-link" onClick={() => setPage('sales')}>ดูสรุปยอดขาย →</span>
                </div>
                {topStores.length === 0 ? (
                  <div className="berry-empty-note">ยังไม่มีข้อมูลยอดขายในช่วงเวลานี้</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="berry-table">
                      <thead>
                        <tr>
                          <th>อันดับ</th>
                          <th>ร้าน</th>
                          <th>ออเดอร์สำเร็จ</th>
                          <th>ยอดขายรวม</th>
                          <th>ยอดขายสุทธิ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topStores.map((s, i) => (
                          <tr key={s.storeId}>
                            <td>#{i + 1}</td>
                            <td><b>{s.storeName}</b></td>
                            <td>{fmtMoney(s.completedOrders)}</td>
                            <td>฿{fmtMoney(s.grossSales)}</td>
                            <td style={{ fontWeight: 600 }}>฿{fmtMoney(s.netSales)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {page === 'sales' && (
            <div className="berry-dashboard-grid">
              <div className="berry-panel berry-filter-row">
                <label>ร้านค้า:</label>
                <select className="berry-input" value={salesStoreFilter} onChange={e => { setSalesStoreFilter(e.target.value); setDetailStoreId(null); }}>
                  <option value="all">ทุกร้านค้า</option>
                  {salesStoreSummary.map(s => <option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}
                </select>

                <label>ช่วงเวลา:</label>
                <div className="berry-toggle-pills">
                  {[['today', 'วันนี้'], [7, '7 วัน'], [14, '14 วัน'], [30, '30 วัน'], ['month', 'เลือกเดือน'], ['custom', 'กำหนดเอง']].map(([val, label]) => (
                    <button
                      key={val}
                      className={salesRange === val ? 'active' : ''}
                      onClick={() => {
                        // กดกำหนดเอง -> เริ่มจากช่วงวันที่ที่กำลังดูอยู่ แล้วค่อยแก้ต่อ
                        if (val === 'custom') { setSalesCustomStart(salesStart); setSalesCustomEnd(salesEnd); }
                        if (val === 'month') setSalesMonth(String(salesEnd || '').slice(0, 7));
                        setSalesRange(val);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {salesRange === 'month' && (
                  <>
                    <label>เดือน:</label>
                    <input type="month" className="berry-input" value={salesMonth} max={new Date().toISOString().slice(0, 7)}
                      onChange={e => setSalesMonth(e.target.value)} aria-label="เลือกเดือนที่ต้องการดู" />
                  </>
                )}

                {salesRange === 'custom' && (
                  <>
                    <label>ตั้งแต่วันที่:</label>
                    <input
                      type="date"
                      className="berry-input"
                      value={salesCustomStart}
                      max={salesCustomEnd || undefined}
                      onChange={e => setSalesCustomStart(e.target.value)}
                    />

                    <label>ถึงวันที่:</label>
                    <input
                      type="date"
                      className="berry-input"
                      value={salesCustomEnd}
                      min={salesCustomStart || undefined}
                      onChange={e => setSalesCustomEnd(e.target.value)}
                    />

                    <button className="berry-btn primary" onClick={() => showToast('อัปเดตตารางยอดขายแล้ว')}>
                      ค้นหา
                    </button>
                  </>
                )}
              </div>

              <div className="berry-stats-row-4">
                <BerryStatCard bgTone="orange" label="ยอดขายรวม" value={`฿${fmtMoney(salesTotals.gross)}`} />
                <BerryStatCard bgTone="dark" label="ยอดขายสุทธิ" value={`฿${fmtMoney(salesTotals.net)}`} />
                <BerryStatCard label="Orders สำเร็จ" value={fmtMoney(salesTotals.completed)} />
                <BerryStatCard label="Orders ยกเลิก" value={fmtMoney(salesTotals.cancelled)} />
              </div>

              <div className="berry-chart-row">
                {salesStoreFilter !== 'all' && (
                  <div className="berry-panel" style={{ flex: '1 1 380px', minWidth: 0 }}>
                    <div className="berry-panel-header">
                      <div>
                        <div className="berry-growth-title">ยอดขายตามช่วงเวลา</div>
                        <div className="berry-panel-caption">
                          {salesStoreSummary.find(x => String(x.storeId) === String(salesStoreFilter))?.storeName || ''} • {salesStart === salesEnd ? 'รายชั่วโมง' : 'รายวัน'}
                        </div>
                      </div>
                    </div>
                    <BerryLineChart data={salesTrend} height={290} valueFormat={(v) => `฿${fmtMoney(v)}`} axisFormat={(v) => (v >= 1000 ? `฿${(v / 1000).toFixed(1)}k` : `฿${Math.round(v)}`)} />
                  </div>
                )}
              <div className="berry-panel" style={{ flex: '1 1 380px', minWidth: 0 }}>
                <div className="berry-panel-header"><h3>เมนูขายดี Top 10</h3></div>
                {topMenu.length === 0 ? (
                  <div className="berry-empty-note">ยังไม่มีข้อมูลรายการเมนูที่ขาย</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="berry-table">
                      <thead><tr><th>อันดับ</th><th>เมนู</th>{salesStoreFilter === 'all' && <th>ร้านค้า</th>}<th>จำนวนที่ขาย</th></tr></thead>
                      <tbody>
                        {topMenu.map((m, i) => (
                          <tr key={`${m.storeId}-${m.name}`}>
                            <td>#{i + 1}</td>
                            <td>{m.name}</td>
                            {salesStoreFilter === 'all' && <td>{m.storeName}</td>}
                            <td>{fmtMoney(m.qty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              
              </div>

              <div className="berry-panel">
                <div className="berry-panel-header">
                  <div>
                    <h3 style={{ margin: 0 }}>ตารางยอดขายรายร้าน</h3>
                    {/* แสดงข้อความเรียงลำดับเฉพาะตอนเลือก "ทุกร้านค้า" — เลือกร้านเดียวไม่ต้องแสดง */}
                    {salesStoreFilter === 'all' && (
                      <div className="berry-panel-caption">เรียงตามยอดขายสุทธิ</div>
                    )}
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="berry-table">
                    <thead>
                      <tr>
                        <th>ร้านค้า</th>
                        <th>ออเดอร์สำเร็จ</th>
                        <th>ยอดขายรวม</th>
                        <th>ยกเลิก</th>
                        <th>ยอดสุทธิ</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesFilteredRows.map(s => (
                        <tr key={s.storeId}>
                          <td><b>{s.storeName}</b></td>
                          <td>{fmtMoney(s.completedOrders)}</td>
                          <td>฿{fmtMoney(s.grossSales)}</td>
                          <td style={{ color: s.status === 'na' ? 'var(--berry-text-muted)' : s.status === 'bad' ? 'var(--berry-red)' : s.status === 'warn' ? '#D99B00' : 'var(--berry-green)' }}>
                          {fmtMoney(s.cancelledOrders)} ({fmtRate(s.rate)})
                          </td>
                          <td style={{ fontWeight: 700 }}>฿{fmtMoney(s.netSales)}</td>
                          <td>
                            {/* เปิด Modal แสดงรายละเอียดเมนู */}
                            <span className="berry-link" onClick={() => setDetailStoreId(s.storeId)}>
                              ดูรายละเอียด →
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ===== Modal ดูรายละเอียดเมนูขายดีสำหรับร้านที่เลือก ===== */}
              {detailStoreId && (
                <div className="berry-modal-overlay" onClick={() => setDetailStoreId(null)}>
                  <div className="berry-modal-content" onClick={e => e.stopPropagation()}>
                    <div className="berry-modal-header">
                      <h3>รายละเอียดเมนู: {salesStoreSummary.find(s => s.storeId === detailStoreId)?.storeName || 'ไม่ทราบชื่อร้าน'}</h3>
                      <button className="berry-icon-btn" onClick={() => setDetailStoreId(null)}>
                        <Icon name="close" size={20} />
                      </button>
                    </div>
                    <div className="berry-modal-body">
                      {detailStoreMenus.length === 0 ? (
                        <div className="berry-empty-note">ไม่พบข้อมูลเมนูที่ขายได้ของร้านนี้ในช่วงเวลาที่เลือก</div>
                      ) : (
                        <table className="berry-table">
                          <thead>
                            <tr>
                              <th>ชื่อเมนู</th>
                              <th style={{ textAlign: 'right' }}>จำนวนที่ขายได้</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailStoreMenus.map((m, idx) => (
                              <tr key={idx}>
                                <td>{m.name}</td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{fmtMoney(m.qty)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {page === 'cancel' && (() => {
            const cancelPeriodLabel = cancelRange === 'all' ? 'ทุกช่วงเวลา'
              : cancelRange === 'today' ? 'วันนี้'
              : cancelRange === 'custom' ? `${cancelCustomStart || '...'} ถึง ${cancelCustomEnd || '...'}`
              : `${cancelRange} วันล่าสุด`;
            const cancelStoreName = cancelStoreFilter === 'all' ? 'ทุกร้านค้า' : (cancelSummary.find(x => String(x.storeId) === String(cancelStoreFilter))?.storeName || '-');

            const rowsAll = cancelledOrdersList.map(o => ({ o, info: cancelInfoOf(o), reason: String(o.CancelReason || '').trim() || 'ไม่ระบุเหตุผล' }))
              .sort((x, y) => (parseOrderDate(y.info.time)?.getTime() || 0) - (parseOrderDate(x.info.time)?.getTime() || 0));
            const reasonCount = {};
            rowsAll.forEach(r => { reasonCount[r.reason] = (reasonCount[r.reason] || 0) + 1; });
            const reasons = Object.entries(reasonCount).sort((x, y) => y[1] - x[1]);
            const activeReason = reasons.some(([k]) => k === cancelReasonFilter) ? cancelReasonFilter : '';
            const rowsFiltered = activeReason ? rowsAll.filter(r => r.reason === activeReason) : rowsAll;
            const rowsShown = cancelShowAll ? rowsFiltered : rowsFiltered.slice(0, 8);
            const lostAmount = rowsAll.reduce((a, r) => a + Number(r.o.TotalAmount || 0), 0);
            const showStoreCol = cancelStoreFilter === 'all';

            const detailOrder = cancelDetailId ? orders.find(o => String(o.OrderID) === String(cancelDetailId)) : null;
            const detailInfo = detailOrder ? cancelInfoOf(detailOrder) : null;
            const detailItems = detailOrder ? orderItemsOf(detailOrder) : [];

            return (
            <div className="berry-dashboard-grid">
              <div className="berry-panel berry-filter-row" style={{ flexWrap: 'wrap' }}>
                <label>ร้านค้า:</label>
                <select className="berry-input" value={cancelStoreFilter} onChange={e => { setCancelStoreFilter(e.target.value); setCancelReasonFilter(''); setCancelShowAll(false); }}>
                  <option value="all">ทุกร้านค้า</option>
                  {cancelSummary.map(x => <option key={x.storeId} value={x.storeId}>{x.storeName}</option>)}
                </select>

                <label>ช่วงเวลา:</label>
                <div className="berry-toggle-pills">
                  {[['all', 'ทั้งหมด'], ['today', 'วันนี้'], [7, '7 วัน'], [14, '14 วัน'], [30, '30 วัน'], ['custom', 'กำหนดเอง']].map(([val, label]) => (
                    <button
                      key={val}
                      className={cancelRange === val ? 'active' : ''}
                      onClick={() => { setCancelRange(val); setCancelShowAll(false); }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {cancelRange === 'custom' && (
                  <>
                    <label>ตั้งแต่วันที่:</label>
                    <input type="date" className="berry-input" value={cancelCustomStart} max={cancelCustomEnd || undefined} onChange={e => setCancelCustomStart(e.target.value)} />
                    <label>ถึงวันที่:</label>
                    <input type="date" className="berry-input" value={cancelCustomEnd} min={cancelCustomStart || undefined} onChange={e => setCancelCustomEnd(e.target.value)} />
                  </>
                )}
              </div>

              <div className="berry-stats-row-4">
                <BerryStatCard bgTone="orange" label="Order ทั้งหมด" value={fmtMoney(cancelScope.totalOrders)} />
                <BerryStatCard bgTone="dark" label="Cancelled" value={fmtMoney(cancelScope.totalCancelled)} />
                <BerryStatCard label={showStoreCol ? 'Cancellation Rate เฉลี่ย' : 'Cancellation Rate'} value={fmtRate(cancelScope.rate)} />
                <BerryStatCard
                  label={`ร้านที่เกินเกณฑ์ (${ALERT_WINDOW_DAYS} วัน)`}
                  value={`${alertStores.length} ร้าน`}
                  tone={alertStores.length ? 'red' : 'green'}
                />
              </div>

              <div className="berry-chart-row">
                <div className="berry-panel" style={{ flex: '2 1 500px' }}>
                  <div className="berry-panel-header">
                    <div>
                      <h3 style={{ margin: 0 }}>Cancellation Rate by Store</h3>
                      <div className="berry-panel-caption">
                        {showStoreCol ? 'ทุกร้านค้า' : `เฉพาะร้าน ${cancelStoreName}`} · {cancelPeriodLabel} · แถบสีอ่อนคือช่วงเกณฑ์ เส้นดำคือเกณฑ์แจ้งเตือนที่ {RATE_ALERT}%
                      </div>
                    </div>
                  </div>
                  <BerryBulletChart
                    data={cancelTableRows.map(x => ({ label: x.storeName, value: x.rate, status: x.status }))}
                  />
                  <div className="berry-legend">
                    <span><i style={{ background: '#e3f9e5' }}></i>ปกติ &lt; {RATE_WARN}%</span>
                    <span><i style={{ background: '#fff3d6' }}></i>เฝ้าระวัง {RATE_WARN}-{RATE_ALERT}%</span>
                    <span><i style={{ background: '#fde2e1' }}></i>แจ้งเตือน &gt; {RATE_ALERT}%</span>
                  </div>
                </div>
                <div className="berry-panel" style={{ flex: '1 1 320px' }}>
                  <div className="berry-panel-header">
                    <div>
                      <h3 style={{ margin: 0 }}>Cancellation Alert</h3>
                      <div className="berry-panel-caption">อิงข้อมูล {ALERT_WINDOW_DAYS} วันย้อนหลัง · แจ้งเมื่อเกิน {RATE_ALERT}%</div>
                    </div>
                  </div>
                  {alertStores.length === 0 ? (
                    <div className="berry-empty-note">ไม่มีร้านที่เกินเกณฑ์ใน {ALERT_WINDOW_DAYS} วันล่าสุด</div>
                  ) : alertStores.map(x => (
                    <div className="berry-alert-item" key={x.storeId}>
                      <Icon name="cancel" size={20} color="#FF4D4F" />
                      <div>
                        <div className="alert-title">{x.storeName}</div>
                        <div className="alert-sub">อัตราการยกเลิก {x.rate}% ({x.cancelledOrders}/{x.totalOrders} ออเดอร์) สูงกว่าเกณฑ์ {RATE_ALERT}%</div>
                        <div className="alert-link" onClick={() => openStoreCancel(x.storeId)}>
                          ดูออเดอร์ที่ยกเลิก →
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="berry-panel">
                <div className="berry-panel-header">
                  <div>
                    <h3 style={{ margin: 0 }}>รายงานออเดอร์ยกเลิก</h3>
                    <div className="berry-panel-caption">{cancelStoreName} · {cancelPeriodLabel} · กดที่แถวเพื่อดูรายละเอียดออเดอร์</div>
                  </div>
                  <Badge tone={rowsAll.length ? 'bad' : 'ok'}>{fmtMoney(rowsAll.length)} ออเดอร์</Badge>
                </div>

                {rowsAll.length === 0 ? (
                  <div className="berry-empty-note">ช่วงเวลานี้ไม่มีออเดอร์ที่ถูกยกเลิก</div>
                ) : (
                  <>
                    <div className="berry-mini-stats">
                      <div className="berry-mini-stat"><span className="lbl">ออเดอร์ที่ยกเลิก</span><span className="val">{fmtMoney(rowsAll.length)}</span></div>
                      <div className="berry-mini-stat"><span className="lbl">มูลค่าที่เสียไป</span><span className="val">฿{fmtMoney(lostAmount)}</span></div>
                      <div className="berry-mini-stat"><span className="lbl">เหตุผลที่พบบ่อยสุด</span><span className="val" style={{ fontSize: 14 }}>{reasons[0][0]} ({reasons[0][1]})</span></div>
                    </div>

                    <div className="berry-chip-row">
                      <button className={`berry-chip ${activeReason === '' ? 'active' : ''}`} onClick={() => { setCancelReasonFilter(''); setCancelShowAll(false); }}>
                        ทุกเหตุผล ({rowsAll.length})
                      </button>
                      {reasons.map(([reason, n]) => (
                        <button key={reason} className={`berry-chip ${activeReason === reason ? 'active' : ''}`} onClick={() => { setCancelReasonFilter(reason); setCancelShowAll(false); }}>
                          {reason} ({n})
                        </button>
                      ))}
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table className="berry-table">
                        <thead>
                          <tr>
                            <th>วันที่ / เวลา</th><th>คิว</th>{showStoreCol && <th>ร้านค้า</th>}<th>ลูกค้า</th><th>ยอดออเดอร์</th><th>เหตุผลการยกเลิก</th><th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rowsShown.map(({ o, info, reason }) => (
                            <tr key={o.OrderID} className="berry-row-click" onClick={() => setCancelDetailId(o.OrderID)}>
                              <td title={info.known ? 'เวลาที่ยกเลิก' : 'ไม่พบบันทึกเวลายกเลิก แสดงเวลาที่สั่งแทน'} style={{ whiteSpace: 'nowrap', color: info.known ? undefined : 'var(--berry-text-muted)' }}>
                                {fmtDateTime(info.time)}
                              </td>
                              <td><b>{o.QueueNo}</b></td>
                              {showStoreCol && <td>{o.StoreName}</td>}
                              <td>{customerNameOf(o)}</td>
                              <td>฿{fmtMoney2(o.TotalAmount)}</td>
                              <td>{reason}</td>
                              <td style={{ color: 'var(--berry-purple)', whiteSpace: 'nowrap', fontWeight: 600 }}>รายละเอียด →</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {rowsFiltered.length > 8 && (
                      <button className="berry-btn" style={{ width: '100%', marginTop: 12 }} onClick={() => setCancelShowAll(v => !v)}>
                        {cancelShowAll ? 'แสดงน้อยลง' : `ดูทั้งหมด (${rowsFiltered.length} ออเดอร์)`}
                      </button>
                    )}
                  </>
                )}
              </div>

              {detailOrder && (
                <div className="berry-modal-overlay" onClick={() => setCancelDetailId(null)}>
                  <div className="berry-modal-content wide" onClick={e => e.stopPropagation()}>
                    <div className="berry-modal-header">
                      <h3 style={{ margin: 0 }}>ออเดอร์ที่ยกเลิก · คิว {detailOrder.QueueNo}</h3>
                      <button className="berry-icon-btn" onClick={() => setCancelDetailId(null)}>
                        <Icon name="close" size={20} />
                      </button>
                    </div>
                    <div className="berry-modal-body">
                      <div className="berry-info-grid">
                        <div><div className="k">ร้านค้า</div><div className="v">{detailOrder.StoreName || '-'}</div></div>
                        <div><div className="k">ลูกค้า</div><div className="v">{customerNameOf(detailOrder)}</div></div>
                        <div><div className="k">ผู้กดยกเลิก</div><div className="v">{detailInfo.by} <span className="berry-subtle">· {detailInfo.label}</span></div></div>
                        <div><div className="k">ช่องทางชำระเงิน</div><div className="v">{detailOrder.PaymentMethod || '-'}
                          {(() => {
                            const cash = (detailOrder.Payments || []).find(p => p.CashReceived != null);
                            return cash ? <span className="berry-subtle"> · รับ ฿{Number(cash.CashReceived).toLocaleString('th-TH')} ทอน ฿{Number(cash.ChangeGiven || 0).toLocaleString('th-TH')}</span> : null;
                          })()}
                        </div></div>
                        <div><div className="k">วันที่ / เวลาที่สั่ง</div><div className="v">{fmtDateTh(detailOrder.CreatedAt)} เวลา {fmtTimeOnly(detailOrder.CreatedAt)} น.</div></div>
                        <div>
                          <div className="k">วันที่ / เวลาที่ยกเลิก</div>
                          <div className="v">
                            {detailInfo.known ? `${fmtDateTh(detailInfo.time)} เวลา ${fmtTimeOnly(detailInfo.time)} น.` : <span style={{ color: 'var(--berry-text-muted)', fontWeight: 500 }}>ไม่พบบันทึกเวลายกเลิกในระบบ</span>}
                          </div>
                        </div>
                        <div className="full"><div className="k">เหตุผลการยกเลิก</div><div className="v">{String(detailOrder.CancelReason || '').trim() || 'ไม่ระบุเหตุผล'}</div></div>
                        {detailOrder.Note && <div className="full"><div className="k">หมายเหตุจากลูกค้า</div><div className="v">{detailOrder.Note}</div></div>}
                      </div>

                      <div style={{ overflowX: 'auto' }}>
                        <table className="berry-table">
                          <thead><tr><th>เมนู</th><th style={{ textAlign: 'right' }}>จำนวน</th><th style={{ textAlign: 'right' }}>ราคา/หน่วย</th><th style={{ textAlign: 'right' }}>รวม</th></tr></thead>
                          <tbody>
                            {detailItems.length === 0 && (
                              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--berry-text-muted)' }}>ไม่พบรายการเมนูของออเดอร์นี้</td></tr>
                            )}
                            {detailItems.map((it, i) => {
                              const qty = Number(it.Qty ?? it.Quantity ?? 1);
                              const unit = Number(it.UnitPrice ?? it.Price ?? 0);
                              return (
                                <tr key={i}>
                                  <td>{it.ProductName || it.MenuName || '-'}</td>
                                  <td style={{ textAlign: 'right' }}>{qty}</td>
                                  <td style={{ textAlign: 'right' }}>฿{fmtMoney2(unit)}</td>
                                  <td style={{ textAlign: 'right' }}>฿{fmtMoney2(qty * unit)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr><td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>ยอดรวมออเดอร์</td><td style={{ textAlign: 'right', fontWeight: 700 }}>฿{fmtMoney2(detailOrder.TotalAmount)}</td></tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            );
          })()}

          {page === 'refunds' && (
            <RefundLog apiBase={baseRef.current || apiBase || ''} showStore pollMs={15000} />
          )}

          {page === 'audit' && (
            <div className="berry-dashboard-grid">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0 }}>ประวัติการทำรายการทั้งหมด (Audit Log)</h2>
                  <div style={{ color: 'var(--berry-text-muted)', fontSize: 13 }}>ข้อมูลอ้างอิงเพื่อความโปร่งใส บันทึกแบบแก้ไขย้อนหลังไม่ได้ • โหลดแล้ว {fmtMoney(logs.length)} รายการล่าสุด</div>
                </div>
                <span className="berry-readonly-badge"><Icon name="audit" size={16} color="#fff" /> Read Only - แก้ไขย้อนหลังไม่ได้</span>
              </div>

              <div className="berry-panel">
                <input
                  className="berry-input"
                  style={{ width: '100%' }}
                  placeholder="ค้นหา: เหตุการณ์, ผู้ทำรายการ, คิว, ร้านค้า, รายละเอียด หรือวันที่..."
                  value={auditSearch}
                  onChange={e => { setAuditSearch(e.target.value); setAuditLimit(100); }}
                />
                <div className="berry-chip-row" style={{ marginTop: 12, marginBottom: 0 }}>
                  {AUDIT_CATS.map(([id, label]) => (
                    <button key={id} className={`berry-chip ${auditCat === id ? 'active' : ''}`} onClick={() => { setAuditCat(id); setAuditLimit(100); }}>
                      {label} ({auditCatCounts[id] || 0})
                    </button>
                  ))}
                </div>
                <div className="berry-legend" style={{ marginTop: 12 }}>
                  <span><i style={{ background: '#FF4D4F' }}></i>แถวสีแดง: ยกเลิกออเดอร์</span>
                  <span><i style={{ background: '#00C853' }}></i>แถวสีเขียว: ออเดอร์สำเร็จ (Completed)</span>
                </div>
              </div>

              <div className="berry-panel">
                <div className="berry-panel-header">
                  <div>
                    <h3 style={{ margin: 0 }}>ประวัติการทำรายการในระบบ</h3>
                    <div className="berry-panel-caption">แสดง {fmtMoney(Math.min(auditLimit, auditFiltered.length))} จาก {fmtMoney(auditFiltered.length)} รายการ · เรียงจากล่าสุด</div>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="berry-table audit-table">
                    <thead><tr><th>เวลา</th><th>เหตุการณ์</th><th>ออเดอร์</th><th>ผู้ทำรายการ</th><th>รายละเอียด</th></tr></thead>
                    <tbody>
                      {auditGroups.map(g => (
                        <React.Fragment key={g.key || 'unknown'}>
                          <tr className="audit-day"><td colSpan={5}>{dayLabel(g.key)} <span>· {g.rows.length} รายการ</span></td></tr>
                          {g.rows.map(r => (
                            <tr key={r.key} style={{ background: AUDIT_ROW_BG[r.tone] }}>
                              <td className="audit-time">{fmtTimeOnly(r.time)}</td>
                              <td><Badge tone={r.tone}>{r.label}</Badge></td>
                              <td>
                                {r.queue ? (
                                  <div>
                                    <b>คิว {r.queue}</b>{r.amount != null && <span className="audit-sub"> · ฿{fmtMoney2(r.amount)}</span>}
                                    <div className="audit-sub">{r.storeName}</div>
                                  </div>
                                ) : <span className="audit-sub">—</span>}
                              </td>
                              <td>{r.by}</td>
                              <td title={r.details}>{r.summary || <span className="audit-sub">—</span>}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                      {auditFiltered.length === 0 && (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--berry-text-muted)' }}>
                          {auditSearch.trim() || auditCat !== 'all'
                            ? 'ไม่พบรายการที่ตรงกับเงื่อนไข'
                            : loadError ? 'ยังโหลดข้อมูลไม่สำเร็จ (ดูข้อความแจ้งเตือนด้านบน)' : 'ยังไม่มีประวัติการทำรายการในฐานข้อมูล'}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {auditFiltered.length > auditLimit && (
                  <div style={{ padding: '12px 16px 0' }}>
                    <button className="berry-btn" style={{ width: '100%' }} onClick={() => setAuditLimit(l => l + 100)}>
                      แสดงเพิ่ม (เหลืออีก {fmtMoney(auditFiltered.length - auditLimit)} รายการ)
                    </button>
                  </div>
                )}
                {auditHasMore && (
                  <div style={{ padding: '12px 16px 0' }}>
                    <button className="berry-btn" style={{ width: '100%' }} onClick={loadOlderLogs} disabled={auditLoadingOlder}>
                      {auditLoadingOlder ? 'กำลังโหลด…' : `โหลดประวัติที่เก่ากว่านี้จากฐานข้อมูล (ทีละ ${AUDIT_PAGE} รายการ)`}
                    </button>
                  </div>
                )}
                {auditRows.some(r => r.derived) && (
                  <div style={{ padding: '8px 16px 14px', fontSize: 12, color: 'var(--berry-text-muted)' }}>
                    หมายเหตุ: บางแถวสร้างจากข้อมูลออเดอร์จริงในฐานข้อมูล เนื่องจากไม่พบบันทึกในตาราง AuditLog ของรายการนั้น จึงระบุผู้ทำรายการได้เพียงร้านหรือลูกค้า ไม่ระบุตัวพนักงาน
                  </div>
                )}
              </div>
            </div>
          )}

          {page === 'report' && (
            <div className="berry-dashboard-grid">
              <div className="berry-panel">
                <div className="berry-panel-header"><h3>1. เลือกประเภทรายงาน</h3></div>
                <div className="berry-select-grid">
                  {REPORT_TYPES.map(rt => (
                    <div
                      key={rt.id}
                      className={`berry-select-card ${reportType === rt.id ? 'active' : ''}`}
                      onClick={() => setReportType(rt.id)}
                    >
                      <div className="sc-title">{rt.title}</div>
                      <div className="sc-sub">{rt.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="berry-panel berry-filter-row">
                <div>
                  <label style={{ display: 'block', marginBottom: 4 }}>ช่วงเวลา</label>
                  <div className="berry-toggle-pills">
                    {[['month', 'รายเดือน'], ['year', 'รายปี'], ['custom', 'กำหนดเอง']].map(([val, label]) => (
                      <button key={val} className={reportMode === val ? 'active' : ''} onClick={() => setReportMode(val)}>{label}</button>
                    ))}
                  </div>
                </div>
                {reportMode === 'month' && (
                  <>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4 }}>เดือน</label>
                      <select className="berry-input" value={reportMonthEff} onChange={e => setReportMonth(Number(e.target.value))}>
                        {THAI_MONTHS.map((m, i) => (i + 1 <= reportMaxMonth ? <option key={m} value={i + 1}>{m}</option> : null))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4 }}>ปี</label>
                      <select className="berry-input" value={reportYear} onChange={e => setReportYear(Number(e.target.value))}>
                        {reportYearOptions.map(y => <option key={y} value={y}>{y} (พ.ศ. {y + 543})</option>)}
                      </select>
                    </div>
                  </>
                )}
                {reportMode === 'year' && (
                  <div>
                    <label style={{ display: 'block', marginBottom: 4 }}>ปี</label>
                    <select className="berry-input" value={reportYear} onChange={e => setReportYear(Number(e.target.value))}>
                      {reportYearOptions.map(y => <option key={y} value={y}>{y} (พ.ศ. {y + 543})</option>)}
                    </select>
                  </div>
                )}
                {reportMode === 'custom' && (
                  <>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4 }}>ตั้งแต่วันที่</label>
                      <input type="date" className="berry-input" value={customStart} max={customEnd || todayStr}
                        onChange={e => { const v = e.target.value; if (!v) return; const nv = v > todayStr ? todayStr : v; setCustomStart(nv); if (nv > customEnd) setCustomEnd(nv); }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4 }}>ถึงวันที่ (ล่าสุดได้ถึงวันนี้)</label>
                      <input type="date" className="berry-input" value={customEnd} min={customStart || undefined} max={todayStr}
                        onChange={e => { const v = e.target.value; if (!v) return; const nv = v > todayStr ? todayStr : v; setCustomEnd(nv); if (nv < customStart) setCustomStart(nv); }} />
                    </div>
                  </>
                )}
                <div>
                  <label style={{ display: 'block', marginBottom: 4 }}>ร้านค้า</label>
                  <select className="berry-input" value={reportStoreFilter} onChange={e => setReportStoreFilter(e.target.value)}>
                    <option value="all">ทุกร้านค้า</option>
                    {reportStoreOptions.map(s => <option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}
                  </select>
                </div>
              </div>

              <div className="berry-panel">
                <div className="berry-panel-header">
                  <h3>2. ตัวอย่างรายงานก่อน Export</h3>
                  <span style={{ fontSize: 12, color: 'var(--berry-text-muted)' }}>{reportPeriodLabel} · {rangeStart} ถึง {rangeEnd}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="berry-table">
                    <thead><tr>{reportColumns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
                    <tbody>
                      {reportSummary.length === 0 && (
                        <tr><td colSpan={reportColumns.length} style={{ textAlign: 'center', color: 'var(--berry-text-muted)' }}>ไม่พบข้อมูลในช่วงเวลาที่เลือก</td></tr>
                      )}
                      {reportSummary.map(s => (
                        <tr key={s.storeId}>
                          {reportColumns.map(c => (
                            <td key={c.key}>
                              {c.money ? `฿${fmtMoney(s[c.key])}` : c.percent ? fmtRate(s[c.key]) : s[c.key]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="berry-panel">
                <div className="berry-panel-header"><h3>3. เลือกรูปแบบไฟล์ Export</h3></div>
                <div className="berry-select-grid">
                  <div
                    className={`berry-select-card ${reportFormat === 'csv' ? 'active' : ''}`}
                    style={{ textAlign: 'center' }}
                    onClick={() => setReportFormat('csv')}
                  >
                    <div className="sc-title">CSV (.csv)</div>
                    <div className="sc-sub">ไฟล์ข้อมูลสากล เปิดได้ทุกโปรแกรม</div>
                  </div>
                  <div
                    className={`berry-select-card ${reportFormat === 'xlsx' ? 'active' : ''}`}
                    style={{ textAlign: 'center' }}
                    onClick={() => setReportFormat('xlsx')}
                  >
                    <div className="sc-title">Excel (.xlsx)</div>
                    <div className="sc-sub">ไฟล์ Excel จริง เปิดได้ใน Excel / Google Sheets</div>
                  </div>
                </div>
                <button className="berry-btn primary" style={{ width: '100%', marginTop: 20, padding: '12px' }} onClick={exportReport}>
                  Export Report
                </button>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Toast Notification */}
      <div className={`berry-toast ${toast.show ? 'show' : ''}`}><Icon name="check_icon" size={15} color="#00C853" /> {toast.msg}</div>
    </div>
  );
}

/* ============================================================
   FOODKA COLOR PALETTE CSS STYLES
   #FF724C (Primary Orange), #FDBF50 (Accent Yellow)
   #FFFFFF (Card BG), #2A2C41 (Dark Text / Dark Elements)
   ============================================================ */
const STYLES = `

:root {
  --berry-bg: #f8f9fb;
  --berry-purple: #FF724C;
  --berry-purple-dark: #E0532E;
  --berry-purple-light: #FFF0EC;
  --berry-blue: #2A2C41;
  --berry-blue-dark: #1D1F2E;
  --berry-blue-light: #EAECEF;
  --berry-amber: #FDBF50;
  --berry-amber-light: #FFF8E7;
  --berry-red: #FF4D4F;
  --berry-green: #00C853;
  --berry-text-dark: #2A2C41;
  --berry-text-muted: #697586;
  --berry-border: #E8ECEF;
  --berry-card-bg: #FFFFFF;
}

.berry-root {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  margin: 0;
  padding: 0;
  
  background-color: var(--berry-bg);
  font-family: 'Roboto', 'Sarabun', sans-serif;
  color: var(--berry-text-dark);
  display: flex;
  flex-direction: column;
}

/* Topbar */
.berry-topbar {
  height: 70px;
  background: var(--berry-card-bg);
  border-bottom: 1px solid var(--berry-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 100;
}
.berry-topbar-left { display: flex; align-items: center; gap: 24px; }
.berry-brand { display: flex; flex-direction: column; }
.brand-title { font-size: 20px; font-weight: 700; color: var(--berry-purple); display: flex; align-items: center; gap: 8px; }
.brand-subtitle { font-size: 11px; color: var(--berry-text-muted); display: flex; align-items: center; gap: 4px; margin-top: 2px; }
.berry-topbar-right { display: flex; align-items: center; gap: 16px; }

/* Buttons & Chips */
.berry-icon-btn {
  width: 38px; height: 38px;
  border-radius: 12px;
  border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.berry-icon-btn.purple-light { background: var(--berry-purple-light); color: var(--berry-purple); }
.berry-icon-btn.amber-light { background: var(--berry-amber-light); color: var(--berry-amber); }
.berry-icon-btn:hover { filter: brightness(0.95); }

.berry-user-chip {
  background: var(--berry-blue-light);
  border-radius: 20px;
  padding: 6px 12px 6px 16px;
  display: flex; align-items: center; gap: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.berry-user-chip:hover { background: #dce0e5; }

.berry-profile-container { position: relative; }
.berry-profile-dropdown {
  position: absolute; top: 110%; right: 0;
  background: #fff; width: 260px;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(42, 44, 65, 0.1);
  border: 1px solid var(--berry-border);
  padding: 16px 0; z-index: 200;
}
.dropdown-header { padding: 0 16px 12px; }
.dropdown-header h4 { margin: 0; font-size: 16px; font-weight: 700; }
.dropdown-header p { margin: 4px 0 0; font-size: 13px; color: var(--berry-text-muted); }
.berry-divider { border: 0; border-top: 1px solid var(--berry-border); margin: 8px 0; }
.dropdown-item {
  padding: 10px 16px; display: flex; align-items: center; gap: 12px;
  font-size: 14px; cursor: pointer; color: var(--berry-text-dark);
}
.dropdown-item:hover { background: var(--berry-purple-light); color: var(--berry-purple); }

/* Body & Sidebar */
.berry-body { display: flex; flex: 1; overflow: hidden; }
.berry-sidebar {
  width: 260px; 
  background: var(--berry-card-bg);
  border-right: 1px solid var(--berry-border);
  transition: width 0.3s;
  display: flex; 
  flex-direction: column;
  flex-shrink: 0;
}
.berry-sidebar.collapsed { width: 80px; }
.berry-nav { padding: 16px; }
.berry-nav-label { font-size: 12px; font-weight: 700; color: var(--berry-text-muted); text-transform: uppercase; margin-bottom: 12px; padding-left: 8px; }
.berry-sidebar.collapsed .hide-on-collapse { display: none; }
.berry-nav-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px; border-radius: 12px; cursor: pointer; margin-bottom: 8px;
  transition: all 0.2s; color: var(--berry-text-dark);
}
.berry-nav-item:hover { background: var(--berry-bg); }
.berry-nav-item.active { background: var(--berry-purple-light); color: var(--berry-purple); font-weight: 600; }
.berry-nav-icon { display: flex; align-items: center; justify-content: center; }
.berry-nav-text .title { font-size: 14px; font-weight: 500; }
.berry-nav-text .caption { font-size: 11px; color: var(--berry-text-muted); }
.berry-nav-badge { margin-left: auto; background: var(--berry-purple); color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }

/* Main Content */
.berry-content { flex: 1; padding: 24px; overflow-y: auto; }
.berry-dashboard-grid { display: flex; flex-direction: column; gap: 24px; }

/* Small Card */
.berry-small-card { background: var(--berry-card-bg); border-radius: 16px; padding: 20px; border: 1px solid var(--berry-border); }

/* Panels */
.berry-panel { background: var(--berry-card-bg); border-radius: 16px; padding: 24px; border: 1px solid var(--berry-border); }
.berry-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.berry-chart-row { display: flex; gap: 24px; flex-wrap: wrap; }

/* Badges */
.berry-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
.tone-ok, .tone-green { background: #E6F9ED; color: var(--berry-green); }
.tone-warn { background: var(--berry-amber-light); color: #D99B00; }
.tone-bad, .tone-red { background: #FFF0F0; color: var(--berry-red); }
.tone-neutral { background: var(--berry-border); color: var(--berry-text-dark); }

/* Tables */
.berry-table { width: 100%; border-collapse: collapse; }
.berry-table th { text-align: left; padding: 12px; font-size: 13px; color: var(--berry-text-muted); border-bottom: 1px solid var(--berry-border); }
.berry-table td { padding: 12px; font-size: 14px; border-bottom: 1px solid #f8fafc; color: var(--berry-text-dark); }

/* Form Elements */
.berry-input { padding: 8px 12px; border: 1px solid var(--berry-border); border-radius: 8px; outline: none; font-family: inherit; }
.berry-btn { padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-family: inherit; transition: all 0.2s; }
.berry-btn.primary { background: var(--berry-purple); color: #fff; }
.berry-btn.primary:hover { background: var(--berry-purple-dark); }

/* Toggle Pills */
.berry-toggle-pills { display: flex; background: var(--berry-purple-light); border-radius: 8px; padding: 2px; }
.berry-toggle-pills button { background: transparent; border: none; color: var(--berry-purple); padding: 4px 12px; font-size: 12px; border-radius: 6px; cursor: pointer; }
.berry-toggle-pills button.active { background: var(--berry-purple); color: #fff; font-weight: 700; }

/* Toast */
.berry-toast { position: fixed; bottom: 24px; right: 24px; background: #fff; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(42, 44, 65, 0.15); display: flex; align-items: center; gap: 10px; font-weight: 600; opacity: 0; transform: translateY(20px); transition: all 0.3s; z-index: 9999; }
.berry-toast.show { opacity: 1; transform: translateY(0); }

/* Layout Grid & Stat Cards */
.berry-stats-row-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
@media (max-width: 900px) { .berry-stats-row-4 { grid-template-columns: repeat(2, 1fr); } }
.berry-stat-card { text-align: left; }
.berry-stat-value { font-size: 26px; font-weight: 700; color: var(--berry-text-dark); }
.berry-stat-label { font-size: 13px; color: var(--berry-text-muted); margin-top: 6px; }

/* Alert List */
.berry-alert-item { display: flex; gap: 12px; align-items: flex-start; background: #FFF0F0; border: 1px solid #FFD1D1; border-radius: 12px; padding: 14px; margin-bottom: 12px; }
.berry-alert-item .alert-title { font-weight: 700; color: var(--berry-red); font-size: 14px; }
.berry-alert-item .alert-sub { font-size: 12px; color: var(--berry-text-dark); margin: 4px 0 6px; }
.berry-alert-item .alert-link { font-size: 12px; color: var(--berry-purple); font-weight: 600; cursor: pointer; }
.berry-empty-note { text-align: center; color: var(--berry-text-muted); padding: 20px; font-size: 13px; }

/* Legend for Bullet Chart */
.berry-legend { display: flex; gap: 16px; font-size: 12px; color: var(--berry-text-muted); margin-top: 10px; flex-wrap: wrap; }
.berry-legend span { display: inline-flex; align-items: center; gap: 6px; }
.berry-legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }

/* Report Selection Grid */
.berry-select-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
@media (max-width: 700px) { .berry-select-grid { grid-template-columns: 1fr; } }
.berry-select-card { border: 1.5px solid var(--berry-border); border-radius: 12px; padding: 14px 16px; cursor: pointer; transition: all 0.15s; }
.berry-select-card.active { border-color: var(--berry-purple); background: var(--berry-purple-light); }
.berry-select-card .sc-title { font-weight: 700; font-size: 14px; color: var(--berry-text-dark); }
.berry-select-card .sc-sub { font-size: 12px; color: var(--berry-text-muted); margin-top: 2px; }
.berry-select-card.active .sc-title { color: var(--berry-purple-dark); }

.berry-filter-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }
.berry-filter-row label { font-weight: 600; font-size: 13px; color: var(--berry-text-muted); }

.berry-readonly-badge { display: inline-flex; align-items: center; gap: 8px; background: var(--berry-text-dark); color: #fff; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; }
.berry-link { color: var(--berry-purple); font-weight: 600; font-size: 13px; cursor: pointer; }

/* Header & Stat Cards Upgrades */
.berry-dashboard-toprow { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 8px; }
.berry-updated-stamp { font-size: 12px; color: var(--berry-text-muted); white-space: nowrap; }
.berry-panel-caption { font-size: 12px; color: var(--berry-text-muted); margin-top: 2px; }

.berry-stat-delta { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; margin-top: 8px; }
.berry-stat-delta-caption { font-weight: 500; color: var(--berry-text-muted); margin-left: 2px; }
.berry-stat-card.primary { border-left: 4px solid var(--berry-purple); }
.berry-stat-card.primary .berry-stat-value { font-size: 30px; color: var(--berry-purple); }

/* Horizontal Bar Chart */
.berry-hbar-list { display: flex; flex-direction: column; gap: 12px; }
.berry-hbar-row { display: flex; align-items: center; gap: 10px; }
.berry-hbar-label { width: 120px; flex-shrink: 0; font-size: 12px; color: var(--berry-text-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.berry-hbar-track { flex: 1; height: 14px; background: #f4f6f8; border-radius: 4px; overflow: hidden; }
.berry-hbar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
.berry-hbar-value { width: 90px; text-align: right; font-size: 12px; font-weight: 700; color: var(--berry-text-dark); flex-shrink: 0; }

/* Bullet Chart */
.berry-bullet-list { display: flex; flex-direction: column; gap: 14px; }
.berry-bullet-row { display: flex; align-items: center; gap: 12px; }
.berry-bullet-label { width: 140px; flex-shrink: 0; font-size: 13px; font-weight: 600; color: var(--berry-text-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.berry-bullet-track { position: relative; flex: 1; height: 22px; border-radius: 4px; overflow: hidden; }
.berry-bullet-zones { position: absolute; inset: 0; display: flex; }
.berry-bullet-zone { height: 100%; }
.berry-bullet-zone.zone-ok { background: #E6F9ED; }
.berry-bullet-zone.zone-warn { background: #FFF8E7; }
.berry-bullet-zone.zone-bad { background: #FFF0F0; }
.berry-bullet-bar { position: absolute; top: 6px; bottom: 6px; left: 0; border-radius: 3px; transition: width 0.3s; }
.berry-bullet-target { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--berry-text-dark); }
.berry-bullet-value { width: 52px; text-align: right; font-weight: 700; font-size: 13px; flex-shrink: 0; }

/* ============================================================
   MODAL STYLES (NEW)
   ============================================================ */
.berry-chip-row { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 14px; }
        .berry-chip { border: 1px solid var(--berry-border); background: #fff; color: var(--berry-text-dark); padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
        .berry-chip:hover { border-color: var(--berry-purple); }
        .berry-chip.active { background: var(--berry-purple); border-color: var(--berry-purple); color: #fff; }
        .berry-mini-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
        .berry-mini-stat { background: var(--berry-bg); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
        .berry-mini-stat .lbl { font-size: 12px; color: var(--berry-text-muted); }
        .berry-mini-stat .val { font-size: 20px; font-weight: 700; color: var(--berry-text-dark); }
        @media (max-width: 700px) { .berry-mini-stats { grid-template-columns: 1fr; } }
        .berry-row-click { cursor: pointer; }
        .berry-row-click:hover { background: var(--berry-purple-light); }
        .berry-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; margin-bottom: 18px; }
        .berry-info-grid .k { font-size: 12px; color: var(--berry-text-muted); margin-bottom: 2px; }
        .berry-info-grid .v { font-size: 14px; font-weight: 600; color: var(--berry-text-dark); }
        .berry-info-grid .full { grid-column: 1 / -1; }
        .berry-subtle { font-weight: 500; color: var(--berry-text-muted); font-size: 12px; }
        .berry-modal-content.wide { max-width: 680px; width: 92vw; }
        @media (max-width: 560px) { .berry-info-grid { grid-template-columns: 1fr; } }
        .audit-table .audit-day td { background: var(--berry-bg); font-weight: 700; font-size: 13px; padding: 10px 16px; }
        .audit-table .audit-day td span { font-weight: 500; color: var(--berry-text-muted); }
        .audit-table .audit-time { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; }
        .audit-table .audit-sub { color: var(--berry-text-muted); font-size: 12px; }
.berry-modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: rgba(42, 44, 65, 0.7); /* พื้นหลังให้มืดลง */
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-in-out;
}
.berry-modal-content {
  background: var(--berry-card-bg);
  border-radius: 16px;
  width: 90%;
  max-width: 500px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 15px 40px rgba(0,0,0,0.25);
  animation: scaleUp 0.2s ease-in-out;
}
.berry-modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--berry-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.berry-modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--berry-text-dark);
}
.berry-modal-body {
  padding: 20px 24px;
  overflow-y: auto;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes scaleUp {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
  /* ============================================================
   RESPONSIVE DESIGN (MOBILE & TABLET)
   ============================================================ */
@media (max-width: 768px) {
  /* Topbar Adjustments */
  .berry-topbar { padding: 0 16px; height: 60px; }
  .brand-title { font-size: 18px; }
  .brand-subtitle { display: none; } /* ซ่อน Subtitle บนมือถือเพื่อประหยัดพื้นที่ */
  .berry-user-chip span { display: none; } /* ซ่อนชื่อผู้ใช้งาน ให้เหลือแค่ไอคอน Setting */
  .berry-user-chip { padding: 6px 10px; }
  
  /* Sidebar เปลี่ยนเป็น Off-Canvas (ลิ้นชักซ่อนด้านซ้าย) */
  .berry-sidebar {
    position: fixed;
    top: 60px;
    left: -260px;
    height: calc(100vh - 60px);
    z-index: 1000;
    box-shadow: 4px 0 15px rgba(42, 44, 65, 0.1);
    transition: left 0.3s ease;
  }
  .berry-sidebar.open {
    left: 0;
    width: 260px;
  }
  .berry-sidebar.collapsed {
    left: -260px;
    width: 260px;
  }
  
  /* Content Padding & Gap */
  .berry-content { padding: 16px; }
  .berry-dashboard-grid { gap: 16px; }
  
  /* Dashboard Header */
  .berry-dashboard-toprow { flex-direction: column; align-items: flex-start; gap: 8px; }
  
  /* Stats Row 4 ให้เหลือ 1 คอลัมน์บนมือถือ */
  .berry-stats-row-4 { grid-template-columns: 1fr; gap: 12px; }
  
  /* Panels & Charts */
  .berry-chart-row { display: flex; flex-direction: column; gap: 16px; }
  .berry-chart-row .berry-panel { 
    flex-basis: auto !important; 
    width: 100%; 
    min-width: unset; 
  }
  
  /* Panel Details */
  .berry-panel { padding: 16px; }
  .berry-panel-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  .berry-toggle-pills { 
    align-self: stretch; 
    justify-content: space-between; 
    overflow-x: auto; 
  }
  .berry-toggle-pills button { flex: 1; text-align: center; white-space: nowrap; }
  
  /* Filters & Inputs (ขยายให้เต็ม 100%) */
  .berry-filter-row { flex-direction: column; align-items: stretch; gap: 12px; }
  .berry-filter-row > div, 
  .berry-filter-row input, 
  .berry-filter-row select, 
  .berry-filter-row button {
    width: 100%;
    box-sizing: border-box;
  }
  
  /* Table Adjustments */
  .berry-table td, .berry-table th { 
    white-space: nowrap; 
    font-size: 13px; 
    padding: 10px 8px; 
  }
  
  /* Modals */
  .berry-modal-content { width: 95%; max-height: 80vh; }
  .berry-modal-header h3 { font-size: 14px; }
}
`;