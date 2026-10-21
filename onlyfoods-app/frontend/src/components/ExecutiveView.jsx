import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { startPolling } from '../utils/polling';
import { useHistoryNav } from '../utils/historyNav';
import { AUDIT_VERBS, auditCodesMatching, formatAuditDetails } from '../utils/auditText';
import Cropper from 'react-easy-crop';
import { buildSimpleWorkbook } from '../utils/xlsxWriter';
import RefundLog from './RefundLog';
// ===== ตั้งค่าหลักของหน้า Executive =====
const ORDER_TIME_IS_UTC = false;
const MAX_IMAGE_MB = 5;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const REFRESH_MS = 15000; // เดิม 2 วิ (orders 5000 แถว + อีก 4 endpoint ทุก 2 วิ = server/DB โหลดหนัก)
const FOOD_CATEGORIES = [
    'อาหารจานเดียว',
    'ก๋วยเตี๋ยว / เส้น',
    'ตามสั่ง',
    'อาหารอีสาน',
    'เครื่องดื่ม',
    'ของหวาน / เบเกอรี',
    'ทานเล่น',
    'อื่น ๆ'
];
const T = {
    primary: '#FF724C',
    primaryDark: '#E8552D',
    primarySoft: '#FFEAE3',
    accent: '#FDBF50',
    accentSoft: '#FFF4DE',
    accentDark: '#E2A430',
    deep: '#2A2C41',
    deepDark: '#1D1F2F',
    deepSoft: '#EDEEF4',
    amber: '#E2A430',
    amberSoft: '#FFF4DE',
    greenSoft: '#E3F6EE',
    redSoft: '#FDEAE6',
    trackSoft: '#EDEEF4',
    ink: '#2A2C41',
    text: '#4B4E66',
    muted: '#8A8FA6',
    line: '#E6E8F0',
    bg: '#F6F7FB',
    surface: '#FFFFFF',
    up: '#17A673',
    down: '#E2452F',
    sideBg: '#FFFFFF',
    sideText: '#4B4E66',
    sideActive: '#FFEAE3',
    radiusLg: '14px',
    radiusMd: '9px',
    shadowSm: '0 2px 10px rgba(42,44,65,0.05)',
    shadowMd: '0 10px 26px rgba(42,44,65,0.10)'
};
const TOPBAR_H = 80;
const FONT_STACK = "'Roboto', 'Sarabun', sans-serif";
// ===== ฟังก์ชันช่วยจัดรูปแบบวันที่ ยอดเงิน และคำนวณข้อมูล =====
const intFmt = new Intl.NumberFormat('th-TH');
const money = (v) => intFmt.format(Math.round(Number(v) || 0));
const money2 = (v) => new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
}).format(Number(v) || 0);
function shortNumber(value) {
    const n = Number(value) || 0;
    if (n >= 1000000)
        return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000)
        return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
    return String(Math.round(n));
}
const pad2 = (n) => String(n).padStart(2, '0');
function toISODate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function todayISO() {
    return toISODate(new Date());
}
function parseOrderDate(value) {
    if (!value)
        return null;
    if (value instanceof Date)
        return value;
    const normalized = String(value).trim().replace(' ', 'T');
    const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
    const parsed = new Date(hasTz || !ORDER_TIME_IS_UTC ? normalized : `${normalized}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function thaiDate(iso) {
    if (!iso) return '-';
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return toISODate(d);
}

function thaiDateTime(value) {
    const d = parseOrderDate(value);
    if (!d) return '-';

    return `${toISODate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function nowStamp() {
    const d = new Date();
    return `${toISODate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function periodBounds(anchorISO, days) {
    const end = new Date(`${anchorISO}T00:00:00`);
    end.setDate(end.getDate() + 1);
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    return { start, end };
}
function previousBounds(anchorISO, days) {
    const { start } = periodBounds(anchorISO, days);
    const prevEnd = new Date(start);
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - days);
    return { start: prevStart, end: prevEnd };
}
function customPeriodBounds(startISO, endISO) {
    const start = new Date(`${startISO}T00:00:00`);
    const end = new Date(`${endISO}T00:00:00`);
    end.setDate(end.getDate() + 1);
    return { start, end };
}
function rangeDayCount(startISO, endISO) {
    const start = new Date(`${startISO}T00:00:00`);
    const end = new Date(`${endISO}T00:00:00`);
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
}
function previousBoundsForRange(startISO, endISO) {
    const days = rangeDayCount(startISO, endISO);
    const current = customPeriodBounds(startISO, endISO);
    const previousEnd = new Date(current.start);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - days);
    return { start: previousStart, end: previousEnd };
}
const statusIs = (order, status) => String(order?.Status || '').toLowerCase() === status.toLowerCase();
function inRange(order, bounds, storeId = null) {
    const at = parseOrderDate(order.CreatedAt);
    if (!at)
        return false;
    if (at < bounds.start || at >= bounds.end)
        return false;
    if (storeId !== null && String(order.StoreId) !== String(storeId))
        return false;
    return true;
}
const sumAmount = (orders) => orders.reduce((s, o) => s + Number(o.TotalAmount || 0), 0);
function changePct(current, previous) {
    const c = Number(current) || 0;
    const p = Number(previous) || 0;
    if (p === 0) return null;
        return ((c - p) / p) * 100;
}
function summarize(orders) {
    const completed = orders.filter((o) => statusIs(o, 'Completed'));
    const noShow = orders.filter((o) => statusIs(o, 'NoShow'));
    const settled = [...completed, ...noShow];
    const cancelled = orders.filter((o) => statusIs(o, 'Cancelled'));
    const sales = sumAmount(settled);
    const countedCancelled = cancelled.filter((o) => o.PaymentStatus !== 'REJECTED');
    const grossSales = sumAmount([...settled, ...countedCancelled]);
    const totalRecorded = settled.length + cancelled.length;

    return {
        sales,
        grossSales,
        completedCount: settled.length,
        cancelledCount: cancelled.length,
        cancelRate: totalRecorded > 0
            ? (cancelled.length / totalRecorded) * 100
            : null,
        avgOrder: settled.length
            ? sales / settled.length
            : 0,
        completed,
        noShow,
        settled,
        cancelled
    };
}
function buildBuckets(completedOrders, anchorISO, days) {
    const { start } = periodBounds(anchorISO, days);
    const buckets = [];
    if (days === 1) {
        for (let h = 0; h < 24; h += 1) {
            buckets.push({ key: `h${h}`, label: `${pad2(h)}:00`, sales: 0, count: 0, byStore: {} });
        }
        completedOrders.forEach((o) => {
            const at = parseOrderDate(o.CreatedAt);
            if (!at)
                return;
            addToBucket(buckets[at.getHours()], o);
        });
        return buckets;
    }
    const indexByKey = {};
    for (let i = 0; i < days; i += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = toISODate(d);
        indexByKey[key] = i;
        buckets.push({
            key,
            label: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`,
            sales: 0,
            count: 0,
            byStore: {}
        });
    }
    completedOrders.forEach((o) => {
        const at = parseOrderDate(o.CreatedAt);
        if (!at)
            return;
        const idx = indexByKey[toISODate(at)];
        if (idx !== undefined)
            addToBucket(buckets[idx], o);
    });
    return buckets;
}
function buildBucketsForRange(completedOrders, startISO, endISO) {
    const days = rangeDayCount(startISO, endISO);
    if (days === 1) return buildBuckets(completedOrders, endISO, 1);
    const buckets = [];
    const indexByKey = {};
    const start = new Date(`${startISO}T00:00:00`);
    for (let i = 0; i < days; i += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = toISODate(d);
        indexByKey[key] = i;
        buckets.push({ key, label: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`, sales: 0, count: 0, byStore: {} });
    }
    completedOrders.forEach((o) => {
        const at = parseOrderDate(o.CreatedAt);
        if (!at) return;
        const idx = indexByKey[toISODate(at)];
        if (idx !== undefined) addToBucket(buckets[idx], o);
    });
    return buckets;
}
function addToBucket(bucket, order) {
    if (!bucket)
        return;
    const amount = Number(order.TotalAmount || 0);
    bucket.sales += amount;
    bucket.count += 1;
    const id = String(order.StoreId);
    if (!bucket.byStore[id]) {
        bucket.byStore[id] = { name: order.StoreName || `ร้าน #${id}`, sales: 0 };
    }
    bucket.byStore[id].sales += amount;
}
function bucketExtremes(bucket) {
    const rows = Object.values(bucket.byStore || {}).filter((r) => r.sales > 0);
    if (!rows.length)
        return { best: null, worst: null };
    const sorted = [...rows].sort((a, b) => b.sales - a.sales);
    return {
        best: sorted[0],
        worst: sorted.length > 1 ? sorted[sorted.length - 1] : null
    };
}
function summarizeMenus(completedOrders) {
    const map = {};
    completedOrders.forEach((o) => {
        (o.items || []).forEach((it) => {
            const id = String(it.ProductId);
            const name = it.ProductName || `สินค้า #${id}`;
            if (!map[id])
                map[id] = { id,name, qty: 0, amount: 0 };
            map[id].qty += Number(it.Qty || 0);
            map[id].amount += Number(it.Qty || 0) * Number(it.UnitPrice || 0);
        });
    });
    const rows = Object.values(map);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    rows.forEach((r) => {
        r.share = total ? (r.amount / total) * 100 : 0;
    });
    return rows.sort((a, b) => { if (b.qty !== a.qty) return b.qty - a.qty; 
      return Number(a.id) - Number(b.id); });
}
// ===== เรียก API และจัดการข้อผิดพลาดจาก Backend =====
// ข้อความหลังบังคับปิดแบบยกเลิกทั้งหมด (forced = ผลจาก backend)
function forceCloseMessage(base, forced) {
    if (!forced) return base;
    const money = (v) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
    let msg = `${base} ยกเลิก ${forced.cancelled} ออเดอร์ คืนเงิน ${money(forced.refund_total)} บาท`;
    if (Number(forced.unverified_total) > 0) msg += ` และรอร้านตรวจสลิปอีก ${money(forced.unverified_total)} บาท`;
    return msg;
}
async function callApi(url, options = {}) {
    let response;
    try {
        const requestOptions = { ...options };
        if (typeof requestOptions.body === 'string') {
            requestOptions.headers = {
                'Content-Type': 'application/json',
                ...(requestOptions.headers || {})
            };
        }
        response = await fetch(url, requestOptions);
    }
    catch (err) {
        throw new Error('ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง');
    }
    let data = null;
    const raw = await response.text();
    try {
        data = raw ? JSON.parse(raw) : null;
    }
    catch (err) {
        data = null;
    }
    if (!response.ok) {
        
        const detail = data && (data.detail || data.message);
        throw new Error(typeof detail === 'string' ? detail :'ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
    return data;
}
function useIsNarrow(breakpoint = 960) {
    const [narrow, setNarrow] = useState(typeof window !== 'undefined' ? window.innerWidth < breakpoint : false);
    useEffect(() => {
        const onResize = () => setNarrow(window.innerWidth < breakpoint);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [breakpoint]);
    return narrow;
}
// ===== ไอคอนที่ใช้ในหน้า Executive =====
const ICON_PATHS = {
    overview: 'M3 3h7v7H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 14h7v7H3z',
    trend: 'M3 17l6-6 4 4 8-8M21 7v5h-5',
    store: 'M4 9h16M4 9l1-4h14l1 4M5 9v11h14V9M9 20v-6h6v6',
    account: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
    bell: 'M18 16V11a6 6 0 10-12 0v5l-2 3h16zM10 22h4',
    search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
    menu: 'M4 7h16M4 12h16M4 17h16',
    close: 'M6 6l12 12M18 6L6 18',
    download: 'M12 3v12M7 11l5 5 5-5M4 21h16',
    calendar: 'M7 3v4M17 3v4M3 9h18M5 5h14v16H5z',
    edit: 'M4 20h4l10-10-4-4L4 16zM14 6l4 4',
    eyeOff: 'M3 3l18 18M10.6 6.1A10.9 10.9 0 0112 6c6.5 0 10 6 10 6a17.6 17.6 0 01-3.2 3.9M6.6 6.6C3.8 8.3 2 12 2 12s3.5 6 10 6a9.7 9.7 0 004.4-1M9.9 9.9a3 3 0 004.2 4.2',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2',
    mail: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 7l9 6 9-6',
    lock: 'M5 13a2 2 0 012-2h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2zM8 11V7a4 4 0 118 0v4',
    chat: 'M3 20l1.3-3.9A8 8 0 1112 20a8.1 8.1 0 01-4.6-1.4z',
    alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
    eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6zM12 15a3 3 0 100-6 3 3 0 000 6z',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
    power: 'M12 3v9M7 6a8 8 0 1010 0',
    ban: 'M12 21a9 9 0 100-18 9 9 0 000 18zM5.6 5.6l12.8 12.8',
    plus: 'M12 5v14M5 12h14',
    check: 'M4 12l5 5L20 6',
    key: 'M14 7a4 4 0 11-3.6 5.8L4 19v3h3l1-1h2v-2h2v-2l1.4-1.4A4 4 0 0114 7z',
    info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
    refresh: 'M4 12a8 8 0 0113.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 01-13.7 5.7L4 16M4 20v-4h4',
    settings: 'M10.3 4.3c.4-1.7 2.9-1.7 3.4 0a1.7 1.7 0 002.5 1.1c1.6-.9 3.4.8 2.4 2.4a1.7 1.7 0 001.1 2.6c1.7.4 1.7 2.9 0 3.3a1.7 1.7 0 00-1.1 2.6c.9 1.5-.8 3.3-2.4 2.4a1.7 1.7 0 00-2.5 1c-.4 1.8-2.9 1.8-3.4 0a1.7 1.7 0 00-2.5-1c-1.6.9-3.3-.9-2.4-2.4a1.7 1.7 0 00-1-2.6c-1.8-.4-1.8-2.9 0-3.3a1.7 1.7 0 001-2.6c-.9-1.6.8-3.3 2.4-2.4a1.7 1.7 0 002.5-1.1zM9 12a3 3 0 106 0 3 3 0 00-6 0',
    logout: 'M14 8V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h7a2 2 0 002-2v-2M9 12h12l-3-3M18 15l3-3',
    filter: 'M4 5h16l-6 7.5V18l-4 2v-7.5z',
    history: 'M3 12a9 9 0 109-9 9.2 9.2 0 00-6.4 2.6L3 8M3 3v5h5M12 7v5l3 2',
    refund: 'M3 12a9 9 0 103-6.7M3 4v5h5M12 8v8M14.5 9.5c-.4-.9-1.4-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2 0 2.6 5 1.4 5 4 0 1.2-1.1 2-2.5 2-1.1 0-2.1-.6-2.5-1.5',
    arrowRight: 'M5 12h14M13 6l6 6-6 6',
    arrowUp: 'M7 17L17 7M7 7h10v10',
    arrowDown: 'M7 7l10 10M17 7v10H7'
};
function greetingText() {
    const h = new Date().getHours();
    if (h < 12)
        return 'สวัสดีตอนเช้า';
    if (h < 17)
        return 'สวัสดีตอนบ่าย';
    return 'สวัสดีตอนเย็น';
}
function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 2.2, style }) {
    const d = ICON_PATHS[name] || ICON_PATHS.info;
    return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block', ...style }} aria-hidden="true">
      <path d={d}/>
    </svg>);
}
// ===== ส่งออกข้อมูลเป็น CSV / Excel =====
function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function exportCsv(filename, rows) {
    const escape = (v) => {
        let s = v === null || v === undefined ? '' : String(v);
        // ข้อความที่ขึ้นต้นด้วย = + - @ จะถูก Excel ตีเป็นสูตร : ใส่ ' นำหน้า (ตัวเลขติดลบไม่แตะ)
        if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = rows.map((r) => r.map(escape).join(',')).join('\r\n');
    saveBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }), filename);
}
function exportXlsx(filename, sheets) {
    // buildSimpleWorkbook โยน error ถ้าไม่มีชีตที่มีข้อมูล (ข้อความเดิม "ไม่มีข้อมูลสำหรับสร้างไฟล์ Excel")
    saveBlob(buildSimpleWorkbook(sheets), filename);
}
// ===== UI Components กลาง เช่น Card, Button, Modal, Toast =====
function Card({ title, subtitle, right, children, style }) {
    return (<section className="of-card" style={{ ...cardStyle, ...style }}>
      {(title || right) && (<header style={cardHeadStyle}>
          <div style={{ minWidth: 0 }}>
            {title && <h3 style={h3Style}>{title}</h3>}
            {subtitle && <p style={captionStyle}>{subtitle}</p>}
          </div>
          {right}
        </header>)}
      {children}
    </section>);
}
function CardDecorCircles({ color }) {
    return (<>
      <span style={{ position: 'absolute', width: '210px', height: '210px', borderRadius: '50%', background: color, opacity: 0.5, top: '-85px', right: '-95px' }}/>
      <span style={{ position: 'absolute', width: '210px', height: '210px', borderRadius: '50%', background: color, opacity: 0.5, top: '-125px', right: '-15px' }}/>
    </>);
}
function CardDecorWave() {
    return (<span style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true">
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
        <path d="M0 52 C 40 12, 60 92, 100 52 C 140 12, 160 92, 200 52 L 200 100 L 0 100 Z" fill="rgba(255,255,255,0.12)"/>
      </svg>
    </span>);
}
function CardIconBox({ icon, background, color = '#FFFFFF', size = 44 }) {
    return (<div style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: T.radiusMd,
            background,
            color,
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
            zIndex: 2
        }}>
      <Icon name={icon} size={22} color={color}/>
    </div>);
}
// เตือนอัตรายกเลิก : เกิน 10% (เท่ากับ 10 ไม่เตือน) ; ไม่มีออเดอร์ = N/A ไม่เตือน
const CANCEL_ALERT_RATE = 10;
const isCancelAlert = (rate) => rate !== null && rate !== undefined && rate > CANCEL_ALERT_RATE;
// แถบเตือนบรรทัดเดียว : danger = มีปัญหาแล้ว (แดง) · warn = เตือนให้เตรียมตัว (เหลือง)
function AlertBanner({ tone = 'danger', children, style }) {
    const color = tone === 'warn' ? '#9A6400' : T.down;
    return (<div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px', borderRadius: T.radiusMd, background: tone === 'warn' ? T.accentSoft : T.redSoft, color, fontSize: '13px', fontWeight: 600, lineHeight: 1.6, ...style }}>
      <Icon name="alert" size={17} color={color} style={{ marginTop: '2px' }}/>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>);
}
// สัญญาใกล้หมด : ยังใช้ได้อยู่ (ACTIVE) และเหลือไม่เกิน 30 วัน (ใช้ทั้ง Dashboard / จัดการร้าน / ยอดขายรายร้าน / ติดตามสัญญา)
const CONTRACT_SOON_DAYS = 30;
const isContractSoon = (store) => store?.ContractState === 'ACTIVE'
    && store.ContractDaysLeft !== null && store.ContractDaysLeft !== undefined
    && Number(store.ContractDaysLeft) <= CONTRACT_SOON_DAYS;
const contractLeftLabel = (days) => (Number(days) === 0 ? 'หมดคืนนี้' : `เหลือ ${days} วัน`);
function KpiCard({ label, value, unit, delta, deltaLabel, deltaSuffix = '%', hint, hasPreviousData = null, highlight, variant, icon = 'trend', tone = 'blue', size = 'md', invertDelta = false }) {
    const hasDelta = delta !== null && delta !== undefined;
    const showComparison = hasDelta;
    const rising = hasDelta && delta >= 0;
    const positive = hasDelta && (invertDelta ? delta <= 0 : delta >= 0);
    const kind = variant || (highlight ? 'purple' : 'plain');
    const solid = kind === 'purple' || kind === 'blue';
    const small = size === 'sm';
    const solidBg = kind === 'purple'
        ? `linear-gradient(135deg, ${T.primary} 0%, ${T.primaryDark} 100%)`
        : `linear-gradient(135deg, ${T.deep} 0%, ${T.deepDark} 100%)`;
    const iconTones = {
        blue: { bg: T.deepSoft, fg: T.deep },
        amber: { bg: T.amberSoft, fg: T.amber },
        purple: { bg: T.primarySoft, fg: T.primary },
        green: { bg: T.greenSoft, fg: T.up }
    };
    const iconTone = iconTones[tone] || iconTones.blue;
    return (<div className="of-card" style={{...cardStyle,padding:small? '18px 20px': '22px',minHeight:solid? '172px':small? '116px': '150px',height: '100%',background:solid?solidBg:T.surface,color:solid? '#FFFFFF':T.text,overflow: 'hidden',position: 'relative',display: 'flex',flexDirection: 'column',justifyContent: 'center'}}>
      {kind === 'purple' && <CardDecorCircles color={T.primaryDark}/>}
      {kind === 'blue' && <CardDecorWave />}
      {kind === 'blue' && <CardDecorCircles color={T.deepDark}/>}

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: '14px' }}>
        {solid ? (<CardIconBox icon={icon} background={kind === 'purple' ? T.primaryDark : T.deepDark}/>) : (<div style={{width:small? '44px': '48px',height:small? '44px': '48px',minWidth:small? '44px': '48px',borderRadius:T.radiusMd,background:iconTone.bg,color:iconTone.fg,display: 'grid',placeItems: 'center'}}>
            <Icon name={icon} size={22} color={iconTone.fg}/>
          </div>)}

        <div style={{ minWidth: 0 }}>
          <div style={{fontSize:small? '22px': '26px',fontWeight:700,lineHeight:1.2,color:solid? '#FFFFFF':T.ink}}>
            {value}
            {unit && (<span style={{fontSize: '13.5px',fontWeight:500,marginLeft: '5px',color:solid? 'rgba(255,255,255,.80)':T.muted}}>
                {unit}
              </span>)}
          </div>
          <div style={{marginTop: '3px',fontSize: '13px',color:solid? 'rgba(255,255,255,.85)':T.muted}}>
            {label}
          </div>
        </div>
      </div>

      {showComparison ? (<div style={{position: 'relative',zIndex:2,marginTop:small? '10px': '14px',display: 'inline-flex',alignItems: 'center',gap: '6px',alignSelf: 'flex-start',padding: '5px 10px',borderRadius: '999px',fontSize: '12.5px',fontWeight:700,background:hasDelta&&delta===0?(solid? 'rgba(255,255,255,.18)': '#F1F3F7'):positive?(solid? 'rgba(220,252,231,.96)':T.greenSoft):(solid? 'rgba(254,226,226,.96)':T.redSoft),color:hasDelta&&delta===0?(solid? '#FFFFFF':T.muted):positive?T.up:T.down}}>
         <Icon name={hasDelta && delta === 0 ? 'arrowRight' : rising ? 'arrowUp' : 'arrowDown'} size={13}/>
          <>{delta < 0 ? '-' : ''}{Number.isInteger(Math.abs(delta)) ? Math.abs(delta).toFixed(0) : Math.abs(delta).toFixed(1)}{deltaSuffix}</>
          {<span style={{fontWeight:500,opacity:solid&&delta===0?0.85:1,color:delta===0?(solid? '#FFFFFF':T.muted):positive?T.up:T.down}}>
            {deltaLabel}
          </span>}
        </div>) : (<div style={{position: 'relative',zIndex:2,marginTop:small? '10px': '14px',fontSize: '12.5px',color:solid ? 'rgba(255,255,255,.80)' : T.muted}}>
          {hasPreviousData === false ? 'ไม่มีข้อมูลช่วงก่อนหน้าให้เทียบ' : hint || 'ไม่มีข้อมูลช่วงก่อนหน้าให้เทียบ'}
        </div>)}
    </div>);
}
function Badge({ tone = 'neutral', children }) {
    const palette = {
        ok: { color: T.up, background: T.greenSoft },
        warn: { color: '#8A5A00', background: T.amberSoft },
        danger: { color: T.down, background: T.redSoft },
        neutral: { color: T.muted, background: T.trackSoft }
    }[tone];
    return (<span style={{...palette,padding: '4px 11px',borderRadius: '999px',fontSize: '12px',fontWeight:700,whiteSpace: 'nowrap',display: 'inline-block'}}>
      {children}
    </span>);
}
function Button({ variant = 'primary', icon, children, style, ...rest }) {
    const variants = {
        primary: { background: T.primary, color: '#FFFFFF', border: `1px solid ${T.primary}` },
        accent: { background: T.accent, color: T.ink, border: `1px solid ${T.accent}` },
        ghost: { background: T.surface, color: T.text, border: `1px solid ${T.line}` },
        soft: { background: T.primarySoft, color: T.primaryDark, border: `1px solid ${T.primarySoft}` },
        danger: { background: T.redSoft, color: T.down, border: `1px solid ${T.redSoft}` },
        dark: { background: T.deep, color: '#FFFFFF', border: `1px solid ${T.deep}` }
    };
    return (<button type="button" {...rest} style={{...variants[variant],display: 'inline-flex',alignItems: 'center',gap: '7px',padding: '10px 18px',borderRadius:T.radiusMd,fontSize: '13.5px',fontWeight:600,fontFamily:FONT_STACK,cursor:rest.disabled? 'not-allowed': 'pointer',opacity:rest.disabled?0.55:1,...style}}>
      {icon && <Icon name={icon} size={16}/>}
      {children}
    </button>);
}
function Modal({ open, title, subtitle, onClose, children, footer, width = 620 }) {
    useEffect(() => {
        if (!open)
            return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape')
                onClose?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    if (!open)
        return null;
    return (<div style={overlayStyle} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div style={{ ...modalStyle, maxWidth: `${width}px` }} role="dialog" aria-modal="true">
        <div style={modalHeadStyle}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ ...h3Style, fontSize: '18px' }}>{title}</h3>
            {subtitle && <p style={captionStyle}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} style={iconButtonStyle} aria-label="ปิด">
            <Icon name="close" size={18} color={T.muted}/>
          </button>
        </div>
        <div style={{ padding: '18px 22px', maxHeight: '64vh', overflowY: 'auto' }}>
          {children}
        </div>
        {footer && <div style={modalFootStyle}>{footer}</div>}
      </div>
    </div>);
}
function ConfirmDialog({ state, onCancel, onConfirm }) {
    return (<Modal open={Boolean(state)} title={state?.title || ''} onClose={onCancel} width={460} footer={<>
          <Button variant="ghost" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button variant={state?.danger ? 'danger' : 'primary'} onClick={onConfirm} icon="check">
            {state?.confirmText || 'ยืนยัน'}
          </Button>
        </>}>
      <p style={{ ...bodyStyle, margin: 0 }}>{state?.message}</p>
      {state?.warning && (<p style={{ ...captionStyle, color: T.down, marginTop: '10px' }}>{state.warning}</p>)}
    </Modal>);
}
// ปิดร้าน/ศูนย์อาหารตอนยังมีออเดอร์ค้าง (กฎ PO 1) : ผู้บริหารเลือกว่าจะให้ทำต่อจนเสร็จ หรือยกเลิกทั้งหมดและคืนเงิน
function ForceCloseDialog({ state, onCancel, onChoose }) {
    const orders = state?.orders || [];
    const unverified = orders.filter((o) => o.status === 'VERIFYING_SLIP' || o.status === 'AWAITING_TOP_UP').length;
    const byStore = orders.reduce((acc, o) => {
        (acc[o.store_name] = acc[o.store_name] || []).push(o);
        return acc;
    }, {});
    return (<Modal open={Boolean(state)} title={state?.title || ''} onClose={onCancel} width={520} footer={<>
          <Button variant="ghost" onClick={onCancel}>ยังไม่ปิด</Button>
          <Button variant="primary" onClick={() => onChoose('finish')} icon="check">ปิดรับใหม่ ทำต่อให้เสร็จ</Button>
          <Button variant="danger" onClick={() => onChoose('cancel')} icon="ban" style={{ background: T.down, color: '#FFFFFF', borderColor: T.down }}>ยกเลิกทั้งหมดและคืนเงิน</Button>
        </>}>
      <div style={{ background: T.redSoft, border: `1px solid ${T.down}`, borderRadius: '12px', padding: '12px 14px' }}>
        <p style={{ ...bodyStyle, margin: 0, color: T.down, fontWeight: 700 }}>
          ยังมีออเดอร์ที่ยังไม่จบ {orders.length} ออเดอร์{state?.kind === 'court' ? ` ใน ${Object.keys(byStore).length} ร้าน` : ''}
        </p>
        <div style={{ marginTop: '8px', display: 'grid', gap: '6px' }}>
          {Object.entries(byStore).map(([name, list]) => (<div key={name} style={{ ...captionStyle, color: T.text }}>
              {state?.kind === 'court' && <b>{name}: </b>}
              {list.map((o) => `${o.queue} (${o.status_label})`).join(', ')}
            </div>))}
        </div>
      </div>
      <p style={{ ...captionStyle, color: T.text, marginTop: '12px', lineHeight: 1.7 }}>
        ทั้งสองแบบ ลูกค้าจะสั่งออเดอร์ใหม่ไม่ได้ทันที<br/>
        <b>ทำต่อให้เสร็จ:</b> ร้านทำและส่งมอบออเดอร์ที่ค้างต่อได้ตามปกติ<br/>
        <b>ยกเลิกทั้งหมดและคืนเงิน:</b> ยกเลิกทุกออเดอร์ข้างบน ระบบสร้างรายการคืนเงินและแจ้งลูกค้าให้มารับเงินหรือเลือกให้ร้านโอนคืน
      </p>
      {unverified > 0 && (<p style={{ ...captionStyle, color: '#B45309', marginTop: '8px' }}>
          มี {unverified} ออเดอร์ที่ลูกค้าแนบสลิปแล้วแต่ร้านยังไม่ได้ตรวจ ถ้ายกเลิก รายการคืนเงินจะติดป้าย "สลิปยังไม่ได้ตรวจ" ร้านต้องตรวจสลิปก่อนจึงคืนเงินได้
        </p>)}
    </Modal>);
}
function ToastStack({ toasts, onDismiss }) {
    if (!toasts.length) return null;
    const t = toasts[toasts.length - 1];
    const isError = t.type === 'error';
    const isWarn = t.type === 'warn';
    const accent = isError ? T.down : isWarn ? '#D98C00' : T.up;
    const soft = isError ? T.redSoft : isWarn ? T.accentSoft : T.greenSoft;
    const title = isError ? 'ทำรายการไม่สำเร็จ' : isWarn ? 'กรุณาตรวจสอบข้อมูล' : 'ทำรายการสำเร็จ';
    return (<div style={popupNoticeOverlayStyle}>
      <div style={{ ...popupNoticeStyle, borderTop: `5px solid ${accent}` }}>
        <div style={{ ...popupNoticeIconStyle, background: soft }}>
          <Icon name={isError ? 'ban' : isWarn ? 'info' : 'check'} size={30} color={accent}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: T.ink, fontSize: '18px', fontWeight: 700 }}>{title}</div>
          <div style={{ color: T.text, fontSize: '14px', lineHeight: 1.65, marginTop: '6px' }}>{t.message}</div>
        </div>
        <button type="button" onClick={() => onDismiss(t.id)} style={popupNoticeCloseStyle} aria-label="ปิดการแจ้งเตือน">
          <Icon name="close" size={18} color={T.muted}/>
        </button>
      </div>
    </div>);
}
function Field({ label, required, error, hint, children, as: Tag = 'label' }) {
    return (<Tag style={{ display: 'block', marginBottom: '14px' , width: '100%',minWidth: 0 ,maxWidth: '100%',boxSizing: 'border-box'}}>
      <span style={{ ...captionStyle, color: T.text, fontWeight: 600, display: 'block' }}>
        {label}
        {required && <span style={{ color: T.down, marginLeft: '3px' }}>*</span>}
      </span>
      <div style={{ marginTop: '6px' }}>{children}</div>
      {hint && !error && <span style={{ ...captionStyle, fontSize: '11.5px' }}>{hint}</span>}
      {error && (<span style={{ ...captionStyle, color: T.down, fontSize: '11.5px', fontWeight: 600 }}>
          {error}
        </span>)}
    </Tag>);
}
function EmptyState({ text, minHeight = '200px' }) {
    return (<div style={{minHeight,display: 'grid',placeItems: 'center',color:T.muted,fontSize: '13.5px'}}>
      {text}
    </div>);
}
function PeriodPicker({ anchor, setAnchor, days, setDays, style }) {
    return (<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', ...style }}>
      <div style={dateWrapStyle}>
        
        <input type="date" value={anchor} max={todayISO()} onChange={(e) => setAnchor(e.target.value || todayISO())} style={dateInputStyle} aria-label="เลือกวันที่ที่ต้องการดู"/>
      </div>

      <div style={{display: 'flex',gap: '4px',flexWrap: 'wrap',background:T.primarySoft,padding: '4px',borderRadius:T.radiusMd}}>
        {[1, 7, 14, 30].map((v) => (<button key={v} type="button" onClick={() => setDays(v)} style={{padding: '7px 14px',borderRadius: '6px',fontSize: '13px',fontWeight:600,fontFamily:FONT_STACK,cursor: 'pointer',border: 'none',background:days===v?T.surface: 'transparent',color:days===v?T.primary:T.muted,boxShadow:days===v? '0 1px 3px rgba(18,25,38,.12)': 'none'}}>
            {v === 1 ? 'วันนี้' : `${v} วัน`}
          </button>))}
      </div>
    </div>);
}
// ===== กราฟและตัวเลือกสำหรับแสดงข้อมูลยอดขาย =====
function SalesLineChart({ buckets, showStoreDetail = true }) {
    const [hover, setHover] = useState(null);
    const data = buckets || [];
    if (!data.length)
        return <EmptyState text="ช่วงเวลานี้ยังไม่มีออเดอร์ที่สำเร็จ"/>;
    const W = 880;
    const H = 320;
    const L = 66;
    const R = 22;
    const TOP = 22;
    const BOT = 46;
    const gw = W - L - R;
    const gh = H - TOP - BOT;
    const maxValue = Math.max(...data.map((b) => b.sales), 1);
    const xAt = (i) => (data.length === 1 ? L + gw / 2 : L + (i / (data.length - 1)) * gw);
    const yAt = (v) => TOP + gh - (v / maxValue) * gh;
    const linePath = data.map((b, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(b.sales)}`).join(' ');
    const areaPath = `${linePath} L ${xAt(data.length - 1)} ${TOP + gh} L ${xAt(0)} ${TOP + gh} Z`;
    const labelStep = Math.max(1, Math.ceil(data.length / 10));
    const hoverBucket = hover !== null ? data[hover] : null;
    const extremes = hoverBucket ? bucketExtremes(hoverBucket) : { best: null, worst: null };
    return (<div style={{ position: 'relative', marginTop: '10px' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="ofAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.primary} stopOpacity="0.26"/>
            <stop offset="100%" stopColor={T.primary} stopOpacity="0.02"/>
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map((i) => {
            const ratio = i / 4;
            const y = TOP + gh * ratio;
            return (<g key={i}>
              <line x1={L} x2={W - R} y1={y} y2={y} stroke={T.line} strokeWidth="1"/>
              <text x={L - 12} y={y + 4} textAnchor="end" fontSize="11" fill={T.muted}>
                {shortNumber(maxValue * (1 - ratio))}
              </text>
            </g>);
        })}

        <path d={areaPath} fill="url(#ofAreaFill)"/>
        <path d={linePath} fill="none" stroke={T.primary} strokeWidth="2.4" strokeLinejoin="round"/>

        {data.map((b, i) => (<g key={b.key}>
            {i % labelStep === 0 || i === data.length - 1 ? (<text x={xAt(i)} y={H - 16} textAnchor="middle" fontSize="11" fill={T.muted}>
                {b.label}
              </text>) : null}
            <circle cx={xAt(i)} cy={yAt(b.sales)} r={hover === i ? 5.5 : 3} fill={hover === i ? T.primary : T.surface} stroke={T.primary} strokeWidth="2"/>
            <rect x={xAt(i) - gw / Math.max(data.length, 1) / 2} y={TOP} width={Math.max(gw / Math.max(data.length, 1), 10)} height={gh} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} style={{ cursor: 'pointer' }}/>
          </g>))}

        {hover !== null && (<line x1={xAt(hover)} x2={xAt(hover)} y1={TOP} y2={TOP + gh} stroke={T.primary} strokeDasharray="4 4" strokeWidth="1"/>)}
        <line x1={L} x2={W - R} y1={TOP + gh} y2={TOP + gh} stroke={T.line}/>
      </svg>

      {hoverBucket && (<div style={{
                ...tooltipStyle,
                left: `${(xAt(hover) / W) * 100}%`,
                transform: xAt(hover) / W > 0.7
                    ? 'translateX(-92%)'
                    : xAt(hover) / W < 0.3
                        ? 'translateX(-8%)'
                        : 'translateX(-50%)'
            }}>
          <div style={{ color: T.ink, fontWeight: 700, fontSize: '13px' }}>
            {hoverBucket.label}
          </div>
          <div style={{ color: T.text, fontSize: '13px', marginTop: '4px' }}>
            ยอดขาย {money(hoverBucket.sales)} บาท · {money(hoverBucket.count)} ออเดอร์
          </div>
          {showStoreDetail && (<div style={{ marginTop: '7px', borderTop: `1px solid ${T.line}`, paddingTop: '7px' }}>
              {extremes.best ? (<div style={{ fontSize: '12.5px', color: T.text }}>
                  ขายดีสุด: <strong>{extremes.best.name}</strong> {money(extremes.best.sales)} บาท
                </div>) : (<div style={{ fontSize: '12.5px', color: T.muted }}>ช่วงนี้ยังไม่มียอดขาย</div>)}
              {extremes.worst && (<div style={{ fontSize: '12.5px', color: T.muted, marginTop: '2px' }}>
                  น้อยสุด: {extremes.worst.name} {money(extremes.worst.sales)} บาท
                </div>)}
            </div>)}
        </div>)}
    </div>);
}

function StoreDonutChart({ rows }) {
    const [hoveredStore, setHoveredStore] = useState(null);
    const raw = (rows || []).filter((r) => Number(r.sales) > 0);
    if (!raw.length)
        return <EmptyState text="ช่วงเวลานี้ยังไม่มียอดขาย"/>;
    const top = raw.slice(0, 8);
    const restSales = raw.slice(8).reduce((sum, r) => sum + Number(r.sales || 0), 0);
    const list = restSales > 0
        ? [...top, { StoreId: 'other', StoreName: 'ร้านอื่น ๆ', sales: restSales }]
        : top;
    const total = list.reduce((sum, r) => sum + Number(r.sales || 0), 0) || 1;
    const COLORS = ['#FF724C', '#FDBF50', '#2A2C41', '#FF9E84', '#FFD98C', '#585B78', '#E8552D', '#D19A28', '#B9BCCD'];
    let cumulative = 0;
    const gradientStops = list.map((r, i) => {
        const start = cumulative;
        cumulative += (Number(r.sales || 0) / total) * 100;
        return `${COLORS[i % COLORS.length]} ${start}% ${cumulative}%`;
    }).join(', ');
    const hoveredShare = hoveredStore ? (Number(hoveredStore.sales || 0) / total) * 100 : null;
    const hoverDonut = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const distance = Math.hypot(dx, dy);
        if (distance < rect.width * 0.327 || distance > rect.width / 2) {
            setHoveredStore(null);
            return;
        }
        const percent = ((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360) / 3.6;
        let sum = 0;
        const match = list.find((r) => {
            sum += (Number(r.sales || 0) / total) * 100;
            return percent <= sum;
        });
        setHoveredStore(match || list[list.length - 1]);
    };
    return (<div style={{display: 'flex',flexWrap: 'wrap',gap: '18px',alignItems: 'center',marginTop: '8px',width: '100%',minWidth:0,overflow: 'hidden'}}>
      <div style={{ position: 'relative', width: '100%', maxWidth: '250px', margin: '0 auto', flex: '1 1 220px', minWidth: 0, aspectRatio: '1 / 1' }}>
        <div aria-label="สัดส่วนยอดขายแยกร้าน" onMouseMove={hoverDonut} onMouseLeave={() => setHoveredStore(null)} style={{ position: 'absolute', width: '87%', aspectRatio: '1 / 1', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', borderRadius: '50%', background: `conic-gradient(${gradientStops})`, cursor: 'pointer' }}>
          <div style={{ position: 'absolute', width: '65.5%', aspectRatio: '1 / 1', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', borderRadius: '50%', background: T.surface, pointerEvents: 'none' }}/>
        </div>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center', padding: '0 48px' }}>
          {hoveredStore ? (<div>
            <div style={{ color: T.ink, fontSize: '12px', fontWeight: 700, lineHeight: 1.35 }}>{hoveredStore.StoreName}</div>
            <strong style={{ display: 'block', color: T.ink, fontSize: '20px', marginTop: '4px' }}>{money(hoveredStore.sales)}</strong>
            <span style={{ color: T.muted, fontSize: '11.5px' }}>บาท · {hoveredShare.toFixed(1)}%</span>
          </div>) : (<div>
            <div style={{ ...captionStyle, margin: 0 }}>ยอดขายรวม</div>
            <strong style={{ display: 'block', color: T.ink, fontSize: '21px', marginTop: '3px' }}>{money(total)}</strong>
            <span style={{ color: T.muted, fontSize: '12px' }}>บาท</span>
          </div>)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', minWidth: 0, flex: '1 1 240px', width: '100%', overflow: 'hidden' }}>
        {list.map((r, i) => {
            const share = i === list.length - 1 ? 100 - list.slice(0, -1).reduce((s, x) => s + +(((+x.sales || 0) / total) * 100).toFixed(1), 0) : ((+r.sales || 0) / total) * 100;
            const active = hoveredStore && String(hoveredStore.StoreId ?? hoveredStore.StoreName) === String(r.StoreId ?? r.StoreName);
            return (<div key={r.StoreId ?? r.StoreName} onMouseEnter={() => setHoveredStore(r)} onMouseLeave={() => setHoveredStore(null)} style={{ display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr) minmax(46px, auto)', gap: '8px', alignItems: 'center', width: '100%', minWidth: 0, padding: '3px 4px', borderRadius: '6px', background: active ? T.primarySoft : 'transparent', cursor: 'pointer' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS[i % COLORS.length] }}/>
              <span style={{ color: active ? T.ink : T.text, fontSize: '12.5px', fontWeight: active ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.StoreName}</span>
              <span style={{ color: T.ink, fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'right' }}>{share.toFixed(1)}%</span>
            </div>);
        })}
      </div>
    </div>);
}
// ป้ายสถานะท้ายชื่อร้านในช่องเลือกร้าน — โชว์เฉพาะร้านที่ขายไม่ได้แล้ว
const pickerStatusOf = (s) => Boolean(s?.IsDeleted) ? { label: 'ลบแล้ว', tone: 'neutral' }
    : s?.ContractState === 'EXPIRED' ? { label: 'หมดสัญญา', tone: 'danger' }
    : null;

function SearchableStorePicker({ stores, value, onChange }) {
    const selected = stores.find((s) => String(s.StoreId) === String(value));
    const [query, setQuery] = useState(selected?.StoreName || '');
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const next = stores.find((s) => String(s.StoreId) === String(value));
        setQuery(next?.StoreName || '');
    }, [value, stores]);
    const filtered = stores.filter((s) => String(s.StoreName || '').toLowerCase().includes(query.trim().toLowerCase()));
    const choose = (store) => {
        onChange(String(store.StoreId));
        setQuery(store.StoreName || '');
        setOpen(false);
    };
    return (<div style={{ position: 'relative', marginTop: '8px' }}>
      <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px' }}>
        <Icon name="search" size={16} color={T.muted}/>
        <input value={query} onFocus={() => setOpen(true)} onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value)
                onChange('');
        }} onBlur={() => setTimeout(() => setOpen(false), 120)} placeholder="พิมพ์ชื่อร้าน หรือคลิกเพื่อเลือกร้านค้า" style={{ ...searchInputStyle, padding: '10px 0' }}/>
        {query && (<button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => {
                setQuery('');
                onChange('');
                setOpen(true);
            }} style={{ ...iconButtonStyle, width: '26px', height: '26px', border: 'none' }} aria-label="ล้างร้านที่เลือก">
            <Icon name="close" size={14} color={T.muted}/>
          </button>)}
      </div>
      {open && (<div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', zIndex: 45, background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radiusMd, boxShadow: '0 14px 30px rgba(18,25,38,0.14)', maxHeight: '320px', overflowY: 'auto' }}>
                       {filtered.length ? filtered.map((s) => (<button key={s.StoreId} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(s)} style={{ width: '100%', border: 'none', borderBottom: `1px solid ${T.line}`, background: String(s.StoreId) === String(value) ? T.primarySoft : T.surface, color: T.text, padding: '10px 12px', textAlign: 'left', fontFamily: FONT_STACK, cursor: 'pointer', fontSize: '13px' }}>
              {s.StoreName}
              {pickerStatusOf(s) && <span style={{ color: T.muted, marginLeft: '6px' }}>({pickerStatusOf(s).label})</span>}
            </button>)) : (<div style={{ padding: '12px', color: T.muted, fontSize: '13px' }}>ยังไม่มีข้อมูลร้านค้า</div>)}
        </div>)}
    </div>);
}
// ===== หน้าหลัก Executive: โหลดข้อมูล เมนู แจ้งเตือน และควบคุมศูนย์อาหาร =====
export default function ExecutiveView({ apiBase, user, onLogout }) {
    const API = apiBase || 'http://localhost:8000';
    const isNarrow = useIsNarrow();
    const isPhone = useIsNarrow(640);
    const [activeMenu, setActiveMenu] = useState('overview');
    useHistoryNav(activeMenu, (hash) => {
        const m = hash ?? 'overview';
        if (!['overview', 'store-manage', 'store-accounts', 'store-sales', 'contract-tracking', 'customer-info',
              'issue-reports', 'refund-log', 'audit-history'].includes(m)) return false;
        setActiveMenu(m);
        return true;
    });
    // [CROSS-NAV] เก็บร้านที่ผู้บริหารคลิกมาจากอีกหน้า เพื่อเปิดรายละเอียดร้านเดิมต่อเนื่อง
    const [focusStoreId, setFocusStoreId] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [search, setSearch] = useState('');
    const searchRef = useRef(null);
    const [stores, setStores] = useState([]);
    const storesRef = useRef(stores);
    useEffect(() => { storesRef.current = stores; }, [stores]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [foodCourtOpen, setFoodCourtOpen] = useState(true);
    const [switchingCourt, setSwitchingCourt] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [issueAlerts, setIssueAlerts] = useState([]);
    const [notifOpen, setNotifOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef(null);
    const [foodCourtOpenTime, setFoodCourtOpenTime] = useState('08:00');
    const [foodCourtCloseTime, setFoodCourtCloseTime] = useState('20:00');
    const [foodCourtMode, setFoodCourtMode] = useState('AUTO');
// เปิดปิดโรงอาหารอัตโนมัติ
    const [showFoodCourtSettings, setShowFoodCourtSettings] = useState(false);
    const [foodCourtOpenInput, setFoodCourtOpenInput] = useState('08:00');
    const [foodCourtCloseInput, setFoodCourtCloseInput] = useState('20:00');
    const [savingFoodCourtSchedule, setSavingFoodCourtSchedule] = useState(false);
    const [returningFoodCourtAuto, setReturningFoodCourtAuto] = useState(false);
    const [locallyRead, setLocallyRead] = useState(() => {
        try {
            return JSON.parse(window.localStorage.getItem('executiveSyntheticRead') || '[]');
        }
        catch {
            return [];
        }
    });
    const [toasts, setToasts] = useState([]);
    const [confirmState, setConfirmState] = useState(null);
    const confirmResolver = useRef(null);
    const pushToast = useCallback((message, type = 'success') => {
        const id = `${Date.now()}-${Math.random()}`;
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
    }, []);
    const dismissToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);
    useEffect(() => {
        function handleClickOutside(event) {
            if (profileRef.current && !profileRef.current.contains(event.target)) {
                setProfileOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const ask = useCallback((options) => {
        setConfirmState(options);
        return new Promise((resolve) => {
            confirmResolver.current = resolve;
        });
    }, []);
    const [forceCloseState, setForceCloseState] = useState(null);
    const forceCloseResolver = useRef(null);
    const askForceClose = useCallback((options) => {
        setForceCloseState(options);
        return new Promise((resolve) => {
            forceCloseResolver.current = resolve;
        });
    }, []);
    const closeForceClose = (choice) => {
        setForceCloseState(null);
        forceCloseResolver.current?.(choice);
        forceCloseResolver.current = null;
    };
    const closeConfirm = (result) => {
        setConfirmState(null);
        confirmResolver.current?.(result);
        confirmResolver.current = null;
    };
    const loadStores = useCallback(async (silent = false) => {
        try {
            const [dashboardData, storeData] = await Promise.all([
                callApi(`${API}/api/reports/dashboard`),
                callApi(`${API}/api/stores`)
            ]);

            const dashboardStores = Array.isArray(dashboardData) ? dashboardData : [];
            const fullStores = Array.isArray(storeData) ? storeData : [];

            const dashboardById = new Map(dashboardStores.map((s) => [String(s.StoreId), s]));

            const merged = fullStores.map((s) => ({
              ...(dashboardById.get(String(s.StoreId)) || {}),
              ...s
          }));

            setStores(merged);
        }
        catch (err) {
            if (!silent)
                pushToast(err.message, 'error');
        }
    }, [API, pushToast]);
    const loadOrders = useCallback(async (silent = false) => {
        try {
            const data = await callApi(`${API}/api/orders`);
            setOrders(Array.isArray(data) ? data : []);
        }
        catch (err) {
            if (!silent)
                pushToast(err.message, 'error');
        }
        finally {
            setLoading(false);
        }
    }, [API, pushToast]);
    const loadFoodCourt = useCallback(async (silent = false) => {
    try {
        const data = await callApi(`${API}/api/food-court/status`);
        setFoodCourtOpen(Boolean(data?.is_open));
        setFoodCourtOpenTime(data?.open_time || '08:00');
        setFoodCourtCloseTime(data?.close_time || '20:00');
        setFoodCourtMode(data?.mode || 'AUTO');
    } catch (err) {
        if (!silent) pushToast(err.message, 'error');
    }
}, [API, pushToast]);
    const loadIssueAlerts = useCallback(async () => {
        const currentStores = storesRef.current;
        if (!Array.isArray(currentStores) || currentStores.length === 0) {
            setIssueAlerts([]);
            return;
        }

        try {
                       // ดึงรายงานทั้งศูนย์ในคำขอเดียว (เดิมยิงทีละร้าน)
            const data = await callApi(`${API}/api/executive/issues`);
            const merged = (Array.isArray(data?.issues) ? data.issues : [])
                .slice(0, 20)
                .map((report) => ({
                    NotifId: `front-issue-${report.ReportID}`,
                    Synthetic: true,
                    EventType: 'ISSUE_REPORT',
                    StoreId: report.StoreId,
                    Message: `มีรายงานปัญหาจาก ${report.StoreName}: ${report.IssueType || 'ไม่ระบุประเภท'}`,
                    CreatedAt: report.CreatedAt
                }));

            setIssueAlerts(merged);
        }
        catch (err) {
            console.debug('โหลดรายงานปัญหาสำหรับกระดิ่งไม่สำเร็จ:', err.message);
        }
    }, [API]);

    const loadNotifications = useCallback(async (silent = true) => {
        const userId = user?.UserId || user?.userId;
        if (!userId)
            return;

        try {
            const data = await callApi(`${API}/api/notifications/${userId}`);
            setNotifications(Array.isArray(data) ? data : []);
        }
        catch (err) {
            if (!silent)
                pushToast(err.message, 'error');
        }
    }, [API, user, pushToast]);

    const loadContractNotifications = useCallback(async (silent = true) => {
    const userId = user?.UserId || user?.userId;

    if (!userId)
        return;

    try {
        const data = await callApi(
            `${API}/api/executive/contract-notifications/${userId}`
        );

        setContractAlerts(Array.isArray(data) ? data : []);
    }
    catch (err) {
        if (!silent)
            pushToast(err.message, 'error');
    }
}, [API, user, pushToast]);
    useEffect(() => {
        loadStores();
        loadOrders();
        loadFoodCourt(true);
        loadNotifications(true);
        loadContractNotifications(true);
        return startPolling(() => Promise.allSettled([
            loadStores(true),
            loadOrders(true),
            loadFoodCourt(true),
            loadNotifications(true),
            loadContractNotifications(true)
        ]), REFRESH_MS);
    }, [loadStores, loadOrders, loadFoodCourt, loadNotifications, loadContractNotifications]);
    useEffect(() => {
        if (!stores.length)
            return;

        loadIssueAlerts();
        return startPolling(loadIssueAlerts, 30000);
    }, [stores, loadIssueAlerts]);

    useEffect(() => {
        setSidebarOpen(!isNarrow);
    }, [isNarrow]);

    const openFoodCourtSettings = () => {
    setFoodCourtOpenInput(foodCourtOpenTime);
    setFoodCourtCloseInput(foodCourtCloseTime);
    setShowFoodCourtSettings(true);
};

    const toggleFoodCourt = async () => {
        const closing = foodCourtOpen;
        let onOpenOrders = '';
        if (closing) {
            let pending = [];
            try { pending = await callApi(`${API}/api/food-court/open-orders`); }
            catch (err) { pushToast(err.message, 'error'); return; }
            if (Array.isArray(pending) && pending.length) {
                const choice = await askForceClose({ kind: 'court', title: 'ปิดศูนย์อาหาร', orders: pending });
                if (!choice) return;
                onOpenOrders = `&on_open_orders=${choice}`;
            }
        }
        const ok = onOpenOrders || await ask({
            title: closing ? 'ปิดศูนย์อาหาร' : 'เปิดศูนย์อาหาร',
            message: closing
                ? 'ยืนยันปิดศูนย์อาหารทั้งหมดใช่หรือไม่'
                : 'ยืนยันเปิดศูนย์อาหารให้กลับมาให้บริการใช่หรือไม่',
            warning: closing
                ? 'ระหว่างปิด ลูกค้าจะสั่งอาหารไม่ได้ทุกร้าน และพนักงานทุกโรลจะเห็นสถานะปิดบนหน้าจอ'
                : null,
            confirmText: closing ? 'ปิดศูนย์อาหาร' : 'เปิดศูนย์อาหาร',
            danger: closing
        });
        if (!ok)
            return;
        setSwitchingCourt(true);
        try {
            const data = await callApi(`${API}/api/food-court/toggle?performed_by=Executive&open=${!closing}${onOpenOrders}`, { method: 'PUT' });
            setFoodCourtOpen(Boolean(data?.is_open));
            setFoodCourtMode(data?.mode || 'AUTO');

            await loadFoodCourt(true);
            await loadStores();

            pushToast(forceCloseMessage(data?.message || 'อัปเดตสถานะศูนย์อาหารแล้ว', data?.forced));
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
        finally {
            setSwitchingCourt(false);
        }
    };

    // บันทึกเวลาเปิดปิดโณงอาหาร
    const saveFoodCourtSchedule = async () => {
    if (!foodCourtOpenInput || !foodCourtCloseInput) return pushToast('กรุณาระบุเวลาเปิดและเวลาปิด', 'error');
    if (foodCourtOpenInput >= foodCourtCloseInput) return pushToast('เวลาปิดต้องอยู่หลังเวลาเปิด', 'error');

    setSavingFoodCourtSchedule(true);
    try {
        const data = await callApi(`${API}/api/food-court/schedule?performed_by=Executive`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ open_time: foodCourtOpenInput, close_time: foodCourtCloseInput })
        });
        setFoodCourtOpen(Boolean(data?.is_open));
        setFoodCourtOpenTime(data?.open_time || foodCourtOpenInput);
        setFoodCourtCloseTime(data?.close_time || foodCourtCloseInput);
        setFoodCourtMode(data?.mode || 'AUTO');
        setShowFoodCourtSettings(false);
        await loadFoodCourt(true);
        pushToast(data?.message || 'บันทึกเวลาทำการเรียบร้อยแล้ว');
    } catch (err) {
        pushToast(err.message, 'error');
    } finally {
        setSavingFoodCourtSchedule(false);
    }
};

// กลับสู่ระบบอัตโนมัติ
const returnFoodCourtToAuto = async () => {
    const ok = await ask({ title: 'กลับสู่ระบบอัตโนมัติ', message: 'ต้องการยกเลิกสถานะที่กำหนดด้วยตนเอง และกลับมาใช้เวลาทำการอัตโนมัติใช่หรือไม่', confirmText: 'กลับสู่ระบบอัตโนมัติ' });
    if (!ok) return;

    setReturningFoodCourtAuto(true);
    try {
        const data = await callApi(`${API}/api/food-court/auto?performed_by=Executive`, { method: 'PUT' });
        setFoodCourtOpen(Boolean(data?.is_open));
        setFoodCourtMode('AUTO');
        await loadFoodCourt(true);
        await loadStores();
        pushToast(data?.message || 'กลับสู่ระบบอัตโนมัติเรียบร้อยแล้ว');
    } catch (err) {
        pushToast(err.message, 'error');
    } finally {
        setReturningFoodCourtAuto(false);
    }
};

    const rememberSyntheticRead = useCallback((notifId) => {
        setLocallyRead((prev) => {
            if (prev.includes(notifId))
                return prev;
            const next = [...prev, notifId].slice(-300);
            try {
                window.localStorage.setItem('executiveSyntheticRead', JSON.stringify(next));
            }
            catch {}
            return next;
        });
    }, []);

    const isRead = (n) =>
        n?.Synthetic
            ? locallyRead.includes(n.NotifId)
            : Boolean(n?.IsRead);
    const [contractAlerts, setContractAlerts] = useState([]);

    const displayNotifications = useMemo(() => {
    const seen = new Set();
    // ใช้ notifications ก่อน เพื่อให้ข้อมูล IsRead เป็นค่าล่าสุด
    const all = [...notifications, ...contractAlerts, ...issueAlerts];
    const unique = all.filter((notif) => {
        const id = notif.NotificationId ?? notif.NotifId;
        // ถ้าไม่มี ID จะไม่สุ่มจับรวมกับรายการอื่น
        if (id == null) return true;
        const key = `${notif.Synthetic ? 'synthetic' : 'database'}:${id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return unique
        .sort((a, b) => {
            const ad = parseOrderDate(a.CreatedAt);
            const bd = parseOrderDate(b.CreatedAt);
            return (bd?.getTime() || 0) - (ad?.getTime() || 0);
        })
        .slice(0, 30);
}, [issueAlerts, contractAlerts, notifications]);

    const unreadCount = displayNotifications.filter((n) => !isRead(n)).length;

    const openNotification = async (notif) => {
    if (notif?.Synthetic) {
        rememberSyntheticRead(notif.NotifId);

        if (notif?.EventType === 'ISSUE_REPORT') {
            setFocusStoreId(String(notif.StoreId || ''));
            setActiveMenu('issue-reports');
            setSearch('');
        }}else {
        if (notif?.EventType === 'CONTRACT') {
            setFocusStoreId(String(notif.StoreId || ''));
            setActiveMenu('contract-tracking');
            setSearch(''); }

        if (!isRead(notif)) {
            try {
                await callApi(
                    `${API}/api/notifications/${notif.NotifId}/read`,
                    { method: 'PUT' }); }
            catch (err) {
                console.debug('mark-read endpoint ยังไม่พร้อม:', err.message);} }}

    setNotifOpen(false);

    if (isNarrow)
        setSidebarOpen(false);

    if (!notif?.Synthetic)
        loadNotifications(true);
};

    const markAllRead = async () => {
        const userId = user?.UserId || user?.userId;
        const syntheticIds = displayNotifications.filter((n) => n?.Synthetic).map((n) => n.NotifId);

        setLocallyRead((prev) => {
            const next = [...new Set([...prev, ...syntheticIds])].slice(-300);
            try {
                window.localStorage.setItem('executiveSyntheticRead', JSON.stringify(next));
            }
            catch {}
            return next;
        });

        // ของจริงใน Notifications ใช้ endpoint กลางเดิม
        try {
            await callApi(`${API}/api/notifications/${userId}/read-all`, { method: 'PUT' });
            loadNotifications(true);
            pushToast('อ่านแจ้งเตือนทั้งหมดแล้ว');
        }
        catch (err) {
            pushToast('ทำเครื่องหมายรายการ Executive ว่าอ่านแล้วบนเครื่องนี้', 'warn');
        }
    };
    const accountName = user?.FullName || user?.Username || 'ผู้บริหาร';
    const accountRole = user?.Role || 'Executive';
    const handleLogout = () => {
        setProfileOpen(false);
        if (typeof onLogout === 'function') {
            onLogout();
            return;
        }
        try {
            window.localStorage.clear();
            window.sessionStorage.clear();
        }
        catch (err) {
        }
        window.location.reload();
    };
    const MENUS = [
        { id: 'overview', icon: 'overview', label: 'Dashboard', caption: 'ภาพรวมศูนย์อาหาร' },
        { id: 'store-sales', icon: 'trend', label: 'Sales Summary', caption: 'ยอดขายรายร้าน' },
        { id: 'store-manage', icon: 'store', label: 'Store Management', caption: 'จัดการร้านค้า' },
        { id: 'issue-reports', icon: 'alert', label: 'Issue Reports', caption: 'รายงานปัญหา' },
        { id: 'store-accounts', icon: 'account', label: 'Store Accounts', caption: 'บัญชีร้านค้า' },
        { id: 'customer-info', icon: 'search', label: 'User Information', caption: 'ข้อมูลผู้ใช้' },
        { id: 'contract-tracking', icon: 'calendar', label: 'Contract Tracking', caption: 'ติดตามสัญญา' },
        { id: 'refund-log', icon: 'refund', label: 'Refund Log', caption: 'ประวัติการคืนเงิน' },
        { id: 'audit-history', icon: 'history', label: 'Audit Log', caption: 'ประวัติการดำเนินการ' }
    ];
    // ลบได้ป้ะ
    const PAGE_META = {
        overview: {
            title: 'ภาพรวมศูนย์อาหาร',
            subtitle: 'ดูภาพรวมยอดขาย แนวโน้ม และสถานะร้านค้าทั้งศูนย์',
            searchPlaceholder: 'ค้นหาร้านค้าในตารางสรุป...'
        },
        'store-sales': {
            title: 'ยอดขายรายร้าน',
            subtitle: 'เจาะดูยอดขาย แนวโน้ม และเมนูของร้านแต่ละร้าน',
            searchPlaceholder: 'ค้นหาชื่อร้านเพื่อเลือกดู...'
        },
        'store-manage': {
            title: 'จัดการร้านค้า',
            subtitle: 'เพิ่ม แก้ไข ปิดร้าน ระงับสิทธิ์ และลบร้านค้าออกจากระบบ',
            searchPlaceholder: 'ค้นหาร้านค้าที่ต้องการจัดการ...'
        },
        'issue-reports': {
            title: 'รายงานปัญหาจากลูกค้า',
            subtitle: 'ติดตามสถานะรายงานปัญหาของทุกร้าน (ดูอย่างเดียว ร้านเป็นผู้อัปเดตสถานะ)'
        },
        'store-accounts': {
            title: 'บัญชีร้านค้า',
            subtitle: 'ออกบัญชีผู้ใช้ให้ร้านค้าเข้าระบบไปจัดการเมนูและออเดอร์ของตัวเอง',
            searchPlaceholder: 'ค้นหาชื่อผู้ใช้หรือชื่อร้าน...'
        },
        'customer-info': {
            title: 'ข้อมูลผู้ใช้',
            subtitle: 'ค้นหาและตรวจสอบข้อมูลของลูกค้าในระบบ',
            searchPlaceholder: 'ค้นหาด้วย User ID, Username หรือชื่อผู้ใช้...'
        },
        'contract-tracking': {
            title: 'ติดตามระยะเวลาสัญญา',
            subtitle: 'ตรวจสอบวันเริ่มสัญญา วันสิ้นสุดสัญญา และร้านค้าที่ใกล้หมดอายุ',
            searchPlaceholder: 'ค้นหาร้านค้า...'
        },
        'refund-log': {
            title: 'ประวัติการคืนเงิน',
            subtitle: 'เงินคืนที่รอลูกค้ามารับที่ร้าน และที่ร้านคืนแล้ว (ไม่นับเป็นรายได้)',
            searchPlaceholder: ''
        },
        'audit-history': {
            title: 'ประวัติการดำเนินการ',
            subtitle: 'ตรวจสอบกิจกรรมสำคัญและการเปลี่ยนแปลงที่เกิดขึ้นภายในระบบ',
            searchPlaceholder: 'ค้นหาประวัติการดำเนินการ...'
        }
    }[activeMenu];
        const navigateTo = useCallback((menuId, storeId = '') => {
        setFocusStoreId(storeId ? String(storeId) : '');
        setActiveMenu(menuId);
        setSearch('');
        if (isNarrow) setSidebarOpen(false);
    }, [isNarrow]);
    const ctx = {
        API,
        user,
        stores,
        orders,
        loading,
        search: search.trim().toLowerCase(),
        pushToast,
        ask,
        askForceClose,
        reloadStores: loadStores,
        reloadOrders: loadOrders,
        focusStoreId,
        navigateTo,
        clearFocusStore: () => setFocusStoreId('')
    };
    return (<>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Sarabun:wght@400;500;600;700&display=swap');
        html, body, #root {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          box-sizing: border-box !important;
        }
        html {
          overflow-x: hidden !important;
          background: ${T.bg};
        }
        body {
          min-height: 100%;
          min-width: 0 !important;
          overflow-x: hidden !important;
          background: ${T.bg};
          display: block !important;
          place-items: initial !important;
          align-items: initial !important;
          justify-content: initial !important;
        }
        #root {
          min-height: 100vh !important;
          text-align: left !important;
          display: block !important;
          overflow-x: hidden !important;
        }
        #root > * {
          max-width: 100% !important;
          min-width: 0 !important;
        }
        *, *::before, *::after { box-sizing: border-box; }
        button, input, select, textarea { font-family: ${FONT_STACK}; }
        button { transition: transform .15s ease, box-shadow .15s ease, background .15s ease, color .15s ease; }
        table tbody tr { transition: background .15s ease; }
        table tbody tr:hover { background: #F7F7FB; }

        /* ---------- [UX/UI] ธีม Berry ---------- */
        /* ปุ่มทั่วไปมีเงาตอบสนองเวลาชี้เมาส์ */
        button:not(.of-nav-item):not(.of-icon-btn):hover { box-shadow: 0 2px 8px rgba(18,25,38,.10); }

        /* กริดการ์ด KPI: แถวบนการ์ดสีใหญ่ 2 ใบเท่ากัน แถวล่างการ์ดเล็กเรียงเท่ากันทุกใบ */
        .of-kpi-hero { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-bottom: 22px; align-items: stretch; }
        .of-kpi-small { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(215px, 100%), 1fr)); gap: 22px; margin-bottom: 22px; align-items: stretch; }
        .of-store-kpi-small { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 22px; align-items: stretch; }
        @media (max-width: 900px) {
          .of-store-kpi-small { grid-template-columns: 1fr; }
        }
        @media (max-width: 760px) {
          .of-kpi-hero { grid-template-columns: 1fr; }
        }

        /* การ์ดยกตัวเล็กน้อยเมื่อชี้เมาส์ */
        .of-card { transition: box-shadow .2s ease, transform .2s ease; }
        .of-card:hover { box-shadow: ${T.shadowMd}; }

        /* เมนูฝั่งซ้าย */
        .of-nav-item:hover { background: ${T.primarySoft} !important; color: ${T.primary} !important; }
        .of-nav-item:hover .of-nav-caption { color: ${T.primary}; opacity: .8; }

        /* ปุ่มไอคอนบนแถบบน */
        .of-icon-btn.purple:hover { background: ${T.primary} !important; color: #fff !important; }
        .of-icon-btn.purple:hover svg { stroke: #fff !important; }
        .of-icon-btn.amber:hover { background: ${T.amber} !important; }
        .of-icon-btn.amber:hover svg { stroke: #fff !important; }
        .of-user-chip:hover { background: #E2E4EE !important; }
        .of-dropdown-item:hover { background: ${T.primarySoft}; color: ${T.primary}; }
        .of-dropdown-item:hover svg { stroke: ${T.primary}; }

        /* ช่องกรอกเวลาโฟกัส */
        input:focus, select:focus, textarea:focus { outline: 2px solid ${T.primarySoft}; border-color: ${T.primary} !important; }

        /* แถบเลื่อนบาง ๆ ให้เข้ากับธีม */
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #D6D8E4; border-radius: 999px; }
        ::-webkit-scrollbar-track { background: transparent; }
      `}</style>
      <div style={{ ...shellStyle, fontFamily: FONT_STACK }}>

        <header style={{...topbarStyle,padding:isPhone? '10px 12px':topbarStyle.padding,gap:isPhone? '8px':topbarStyle.gap}}>
          <button type="button" className="of-icon-btn purple" onClick={() => setSidebarOpen((v) => !v)} style={iconButtonStyle} aria-label={sidebarOpen ? 'ซ่อนแถบเมนู' : 'แสดงแถบเมนู'}>
            <Icon name="menu" size={19} color={T.primary}/>
          </button>

          <div style={{ ...brandStyle, width: isNarrow ? 'auto' : brandStyle.width }}>
            <div style={brandTitleStyle}>
              <span style={{ fontSize: '20px', lineHeight: 1 }}>🍽️</span>
              <span>Only Foods</span>
            </div>
            {!isPhone && (<div style={brandSubtitleStyle}>
                สถานะศูนย์อาหาร:
                <span style={{width: '8px',height: '8px',borderRadius: '50%',background:foodCourtOpen?T.up:T.down,display: 'inline-block'}}/>
                <span style={{ color: foodCourtOpen ? T.up : T.down, fontWeight: 600 }}>
                  {foodCourtOpen ? 'เปิดให้บริการ' : 'ปิดให้บริการ'}
                </span>
              </div>)}
          </div>

          {(activeMenu === 'store-manage' || activeMenu === 'store-accounts') && (<form onSubmit={(e) => {
                e.preventDefault();
                searchRef.current?.blur();
            }} style={{ ...searchWrapStyle, maxWidth: isPhone ? 'none' : searchWrapStyle.maxWidth, flexBasis: isPhone ? '100%' : 'auto', order: isPhone ? 5 : 'initial' }}>
              <button type="button" style={{ ...iconButtonStyle, border: 'none', background: 'transparent', width: '28px', height: '28px' }} aria-label="ค้นหา" onClick={() => searchRef.current?.focus()}>
                <Icon name="search" size={17} color={T.muted}/>
              </button>
              <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={PAGE_META.searchPlaceholder} style={searchInputStyle}/>
              {search && (<button type="button" onClick={() => setSearch('')} style={{ ...iconButtonStyle, border: 'none', background: 'transparent', width: '26px', height: '26px' }} aria-label="ล้างคำค้นหา">
                  <Icon name="close" size={15} color={T.muted}/>
                </button>)}
            </form>)}

          <div style={{ flex: 1, minWidth: '8px' }}/>

          {isPhone && (<div style={{...courtPillStyle,padding: '6px 9px',fontSize: '11.5px',background:foodCourtOpen?T.greenSoft:T.redSoft,color:foodCourtOpen?T.up:T.down}}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor' }}/>
              {foodCourtOpen ? 'ศูนย์อาหารเปิด' : 'ศูนย์อาหารปิด'}
            </div>)}

          <div style={{ position: 'relative' }}>
            <button type="button" className="of-icon-btn amber" onClick={() => setNotifOpen((v) => !v)} style={{ ...iconButtonStyle, background: T.amberSoft, color: T.amber }} aria-label="การแจ้งเตือน">
              <Icon name="bell" size={19} color={T.amber}/>
              {unreadCount > 0 && (<span style={notifBadgeStyle}>{unreadCount > 99 ? '99+' : unreadCount}</span>)}
            </button>

            {notifOpen && (<>
                <div style={dropdownBackdropStyle} onClick={() => setNotifOpen(false)}/>
                <div style={notifPanelStyle}>
                  <div style={notifHeadStyle}>
                    <div>
                      <div style={{ color: T.ink, fontWeight: 700, fontSize: '14px' }}>การแจ้งเตือน</div>
                      <div style={captionStyle}>ยังไม่ได้อ่าน {unreadCount} รายการ</div>
                    </div>
                    {unreadCount > 0 && (<Button variant="ghost" onClick={markAllRead} style={{ padding: '6px 10px', fontSize: '12px' }}>
                        อ่านทั้งหมด
                      </Button>)}
                  </div>
                  <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                    {displayNotifications.length === 0 && (<div style={{ padding: '26px', textAlign: 'center', color: T.muted, fontSize: '13px' }}>
                        ยังไม่มีการแจ้งเตือน
                      </div>)}
                    {displayNotifications.map((n) => (<button key={n.NotifId} type="button" onClick={() => openNotification(n)} style={{...notifItemStyle,background:isRead(n)?T.surface:T.primarySoft}}>
                        <span style={{width: '8px',height: '8px',borderRadius: '50%',marginTop: '6px',background:isRead(n)?T.line:T.primary}}/>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', color: T.text, fontSize: '13px' }}>{n.Message}</span>
                          <span style={{ display: 'block', color: T.muted, fontSize: '11.5px', marginTop: '3px' }}>
                            {n.CreatedAt ? thaiDateTime(n.CreatedAt) : ''}
                          </span>
                        </span>
                      </button>))}
                  </div>
                </div>
              </>)}
          </div>

          <div style={{ position: 'relative' }} ref={profileRef}>
            <button type="button" className="of-user-chip" onClick={() => setProfileOpen((v) => !v)} style={{ ...topAccountStyle, padding: isPhone ? '5px' : topAccountStyle.padding }} aria-label="เมนูบัญชีผู้ใช้">
              <div style={{ ...avatarStyle, background: T.primary }}>
                {String(accountName).charAt(0).toUpperCase()}
              </div>

              {!isPhone && (<>
                  <div style={{ minWidth: 0, textAlign: 'left' }}>
                    <div style={{ color: T.ink, fontWeight: 600, fontSize: '13px', ...ellipsisStyle }}>
                      {accountName}
                    </div>
                    <div style={{ color: T.muted, fontSize: '11.5px' }}>{accountRole}</div>
                  </div>
                  <Icon name="settings" size={17} color={T.ink}/>
                </>)}
            </button>
                {profileOpen && <div style={{ ...profilePanelStyle, ...(isPhone ? { position: 'fixed', top: '92px', left: '16px', right: '16px', width: 'auto', maxWidth: 'none', boxSizing: 'border-box', zIndex: 9999 } : {}) }}>
    <div><h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: T.ink, lineHeight: 1.5 }}>{greetingText()}, {accountName}</h4><p style={{ margin: '4px 0 16px', fontSize: '13px', color: T.muted }}>{accountRole} (ผู้บริหารศูนย์อาหาร)</p></div>
    <hr style={{ border: 'none', borderTop: `1px solid ${T.line}`, margin: '0 0 12px' }}/>
    <button type="button" className="of-dropdown-item" style={dropdownItemStyle} onClick={handleLogout}><Icon name="logout" size={18}/> ออกจากระบบ</button>
</div>}
          </div>
        </header>

        <div style={shellBodyStyle}>

          {(!isNarrow || sidebarOpen) && (<aside style={{...sidebarStyle,width:isNarrow? 'min(84vw, 290px)':sidebarOpen? '260px':'76px',minWidth:isNarrow? 'min(84vw, 290px)':sidebarOpen? '260px':'76px',padding:isNarrow || sidebarOpen? sidebarStyle.padding:'16px 8px 12px',position:isNarrow? 'absolute': 'relative',left:isNarrow?0: 'auto',top:isNarrow?0: 'auto',bottom:isNarrow?0: 'auto',alignSelf:isNarrow? 'auto': 'stretch',boxShadow:isNarrow? '4px 0 24px rgba(18,25,38,.10)':sidebarStyle.boxShadow,zIndex:isNarrow?60:20}}>
              <nav style={{ flex: 1 }}>
                {sidebarOpen && <div style={sidebarLabelStyle}>เมนูหลัก</div>}
                {MENUS.map((m) => (<button key={m.id} type="button" className="of-nav-item" title={!sidebarOpen ? m.label : undefined} aria-label={m.label} onClick={() => {
                    setActiveMenu(m.id);
                    setFocusStoreId('');
                    setSearch('');
                    if (isNarrow)
                        setSidebarOpen(false);
                }} style={{...sidebarItemStyle,justifyContent:sidebarOpen?'flex-start':'center',gap:sidebarOpen?'16px':'0',padding:sidebarOpen?'10px 16px':'12px 0',background:activeMenu===m.id?T.sideActive: 'transparent',color:activeMenu===m.id?T.primary:T.sideText}}>
                    <Icon name={m.icon} size={20} strokeWidth={1.5}/>
                    {sidebarOpen && <span style={{ minWidth: 0, textAlign: 'left' }}>
                      <span style={{ display: 'block', fontSize: '14px', fontWeight: activeMenu === m.id ? 600 : 500 }}>
                        {m.label}
                      </span>
                      <span className="of-nav-caption" style={{display: 'block',fontSize: '11.5px',marginTop: '2px',color:activeMenu===m.id?T.primary:T.muted,opacity:activeMenu===m.id?0.8:1}}>
                        {m.caption}
                      </span>
                    </span>}
                  </button>))}
              </nav>

            </aside>)}

          {isNarrow && sidebarOpen && (<div style={backdropStyle} onClick={() => setSidebarOpen(false)}/>)}

          <main id="executive-main-scroll" style={mainScrollStyle}>

            <div style={{ ...contentStyle, padding: isPhone ? '14px 10px 22px' : isNarrow ? '18px 14px 24px' : contentStyle.padding }}>
              <div style={{ marginBottom: '18px' }}>
                <h2 style={{ ...h2Style, fontSize: isPhone ? '20px' : h2Style.fontSize }}>{PAGE_META.title}</h2>
                <p style={{ ...captionStyle, fontSize: '13.5px' }}>{PAGE_META.subtitle}</p>
              </div>

              {!foodCourtOpen && (<div style={courtBannerStyle}>
                  <Icon name="info" size={18} color={T.down}/>
                  <span>
                    ศูนย์อาหารปิดให้บริการอยู่ — ลูกค้าสั่งอาหารไม่ได้ทุกร้าน และทุกโรลจะเห็นสถานะนี้
                  </span>
                </div>)}

              {activeMenu === 'overview' && (<OverviewPage ctx={ctx} foodCourtOpen={foodCourtOpen} foodCourtOpenTime={foodCourtOpenTime} foodCourtCloseTime={foodCourtCloseTime} foodCourtMode={foodCourtMode} switchingCourt={switchingCourt} returningFoodCourtAuto={returningFoodCourtAuto} onToggleCourt={toggleFoodCourt} onOpenSettings={openFoodCourtSettings} onReturnAuto={returnFoodCourtToAuto} />)}
              {activeMenu === 'store-sales' && <StoreSalesPage ctx={ctx}/>}
              {activeMenu === 'store-manage' && <StoreManagePage ctx={ctx}/>}
              {activeMenu === 'store-accounts' && <StoreAccountsPage ctx={ctx}/>}
              {activeMenu === 'customer-info' && <CustomerInfoPage ctx={ctx}/>}
              {activeMenu === 'contract-tracking' && <ContractTrackingPage ctx={ctx}/>}
              {activeMenu === 'refund-log' && <RefundLog apiBase={API} showStore pollMs={15000} />}
              {activeMenu === 'audit-history' && <AuditHistoryPage ctx={ctx}/>}
              {activeMenu === 'issue-reports' && <IssueReportsPage ctx={ctx}/>}
            </div>
          </main>
        </div>

      <Modal open={showFoodCourtSettings} title="ตั้งค่าเวลาทำการ" subtitle="กำหนดเวลาเปิดและปิดศูนย์อาหารอัตโนมัติ" onClose={() => { if (!savingFoodCourtSchedule) setShowFoodCourtSettings(false); }} width={460} footer={
    <>
        <Button variant="ghost" onClick={() => setShowFoodCourtSettings(false)} disabled={savingFoodCourtSchedule}>ยกเลิก</Button>
        <Button variant="primary" icon="check" onClick={saveFoodCourtSchedule} disabled={savingFoodCourtSchedule}>{savingFoodCourtSchedule ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
    </>
}>
        <Field as="div" label="เวลาเปิดอัตโนมัติ" required hint="ศูนย์อาหารจะเริ่มรับออเดอร์ใหม่ตั้งแต่เวลานี้">
        <TimeSelect value={foodCourtOpenInput} onChange={setFoodCourtOpenInput} disabled={savingFoodCourtSchedule} presets={['06:00', '07:00', '08:00', '09:00', '10:00']} />
    </Field>
    <Field as="div" label="เวลาปิดอัตโนมัติ" required hint="เมื่อถึงเวลานี้ ระบบจะหยุดรับออเดอร์ใหม่">
        <TimeSelect value={foodCourtCloseInput} onChange={setFoodCourtCloseInput} disabled={savingFoodCourtSchedule} presets={['17:00', '18:00', '19:00','20:00', '21:00']} />
    </Field>
    <div style={{ marginTop: '4px', padding: '11px 13px', borderRadius: T.radiusMd, background: T.accentSoft, color: '#8A5A00', fontSize: '12.5px', lineHeight: 1.6 }}>
        การปิดศูนย์อาหารจะหยุดรับออเดอร์ใหม่เท่านั้น ออเดอร์ที่สร้างไว้ก่อนแล้วจะดำเนินการต่อได้ตามปกติ
    </div>
</Modal>
      <ConfirmDialog state={confirmState} onCancel={() => closeConfirm(false)} onConfirm={() => closeConfirm(true)}/>
      <ForceCloseDialog state={forceCloseState} onCancel={() => closeForceClose(null)} onChoose={closeForceClose}/>
      <ToastStack toasts={toasts} onDismiss={dismissToast}/>
      </div>
    </>);
}
// ===== ภาพรวมศูนย์อาหาร: สรุปยอดขาย ออเดอร์ ร้านค้า และกราฟ =====
function OverviewPage({ ctx, foodCourtOpen,foodCourtOpenTime,foodCourtCloseTime,foodCourtMode, switchingCourt,returningFoodCourtAuto, onToggleCourt ,onOpenSettings,onReturnAuto }) {
    const { API, orders, stores, loading, pushToast, navigateTo } = ctx;
    const [anchor, setAnchor] = useState(todayISO());
    const [days, setDays] = useState(1);
    const [customRange, setCustomRange] = useState(false);
    const [customStart, setCustomStart] = useState(todayISO());
    const [customEnd, setCustomEnd] = useState(todayISO());
    const [exportPreview, setExportPreview] = useState(null);
    const [issueReports, setIssueReports] = useState([]);
    const [issueLoading, setIssueLoading] = useState(true);
    const [showAllIssueStores, setShowAllIssueStores] = useState(false);

    useEffect(() => {
        if (!Array.isArray(stores) || stores.length === 0) {
            setIssueReports([]);
            setIssueLoading(false);
            return undefined;
        }
        let cancelled = false;
               // ดึงรายงานทั้งศูนย์ในคำขอเดียว (เดิมยิงทีละร้าน)
        callApi(`${API}/api/executive/issues`).then((data) => {
            if (!cancelled) setIssueReports(Array.isArray(data?.issues) ? data.issues : []);
        }).catch((err) => {
            console.debug('โหลดรายงานปัญหาไม่สำเร็จ:', err.message);
        }).finally(() => {
            if (!cancelled) setIssueLoading(false);
        });
        return () => { cancelled = true; };
    }, [API, stores]);

    useEffect(() => { setShowAllIssueStores(false); }, [days, anchor , customRange, customStart, customEnd]);
    const report = useMemo(() => {
        const bounds = customRange
            ? customPeriodBounds(customStart, customEnd)
            : periodBounds(anchor, days);

        const prevBounds = customRange
            ? previousBoundsForRange(customStart, customEnd)
            : previousBounds(anchor, days);
        const current = orders.filter((o) => inRange(o, bounds));
        const previous = orders.filter((o) => inRange(o, prevBounds));
        const now = summarize(current);
        const before = summarize(previous);
       const storeMap = new Map(
    stores.map((s) => [String(s.StoreId), s])
);

// ร้านที่มีออเดอร์ในช่วงปัจจุบันหรือช่วงเปรียบเทียบ
// ต้องยังอยู่ใน Dashboard แม้ร้านนั้นจะถูกลบภายหลัง
current.forEach((o) => {
    const id = String(o.StoreId);

    if (!storeMap.has(id)) {
        storeMap.set(id, {
            StoreId: o.StoreId,
            StoreName: `${o.StoreName || `ร้าน #${o.StoreId}`} (Deleted)`,
            IsDeleted: 1,
            IsOpen: 0,
            IsSuspended: 0
        });
    }
});

const storeRows = Array.from(storeMap.values())
    .map((s) => {
        const storeCurrent = current.filter(
            (o) => String(o.StoreId) === String(s.StoreId)
        );
        const storePrevious = previous.filter(
            (o) => String(o.StoreId) === String(s.StoreId)
        );

        const storeNow = summarize(storeCurrent);
        const storeBefore = summarize(storePrevious);

        return {
            ...s,
            sales: storeNow.sales,
            grossSales: storeNow.grossSales,
            prevSales: storeBefore.sales,
            delta: changePct(storeNow.sales, storeBefore.sales),
            completedCount: storeNow.completedCount,
            cancelledCount: storeNow.cancelledCount,
            orderCount: storeNow.completedCount + storeNow.cancelledCount,
            cancelRate: storeNow.cancelRate,
            avg: storeNow.avgOrder
        };
    })

     // ร้านหมดสัญญาไม่แสดงในสรุปรายร้าน ยกเว้นช่วงที่เลือกมีออเดอร์ หรือช่วงนั้นเริ่มก่อน/ตรงวันสิ้นสุดสัญญา
    // (หลักการเดียวกับร้านที่ถูกลบใน AccountantView.buildStoreSummary)
    .filter((s) => {
        if (s.ContractState !== 'EXPIRED') return true;
        if (s.orderCount > 0) return true;
       if (!s.ContractEndDate) return false;
       const cEnd = new Date(`${String(s.ContractEndDate).slice(0, 10)}T00:00:00`);
        cEnd.setDate(cEnd.getDate() + 1);  // สัญญามีผลถึง 23:59:59 ของวันสิ้นสุด
       return cEnd > bounds.start;
    })
    .sort((a, b) => b.sales - a.sales);
        
const ordersByHour = Array.from({ length: 24 }, () => 0);

now.settled.forEach(o => {
    const at = parseOrderDate(o.CreatedAt);
    if (at) ordersByHour[at.getHours()] += 1;
});

const peakOrderCount = Math.max(...ordersByHour);
const peakHour = peakOrderCount > 0
    ? ordersByHour.indexOf(peakOrderCount)
    : null;

return {
    now,
    before,
    current,
    hasPreviousData: previous.length > 0,
    storeRows,
    buckets: customRange
        ? buildBucketsForRange(now.settled, customStart, customEnd)
        : buildBuckets(now.settled, anchor, days),
    peakHour,
    peakOrderCount,
    activeStores: stores.filter((s) => s.IsOpen && !s.IsSuspended).length
};

    }, [orders, stores, anchor, days ,  customRange, customStart, customEnd]);
    const effectiveDays = customRange ? rangeDayCount(customStart, customEnd) : days;
const periodLabel = customRange ? monthLabelOf(customStart, customEnd) || (effectiveDays === 1 ? `วันที่ ${thaiDate(customStart)}` : `${thaiDate(customStart)} – ${thaiDate(customEnd)}`) : days === 1? `วันที่ ${thaiDate(anchor)}` : `${days} วันย้อนหลังถึง ${thaiDate(anchor)}`;
const compareLabel = customRange ? `เทียบ ${effectiveDays} วันก่อนหน้า` : days === 1 ? 'เทียบวันก่อนหน้า' : `เทียบ ${days} วันก่อนหน้า`;
    const visibleStoreRows = report.storeRows;
    const issueBounds = customRange
    ? customPeriodBounds(customStart, customEnd)
    : periodBounds(anchor, days);
    const periodIssueReports = issueReports.filter((item) => {
        const at = parseOrderDate(item.CreatedAt);
        return at && at >= issueBounds.start && at < issueBounds.end;
    }).sort((a, b) => (parseOrderDate(b.CreatedAt)?.getTime() || 0) - (parseOrderDate(a.CreatedAt)?.getTime() || 0));
    const issueCountsByStore = Object.values(periodIssueReports.reduce((acc, item) => {
        const id = String(item.StoreId || 'unknown');
        if (!acc[id]) acc[id] = { StoreId: item.StoreId, StoreName: item.StoreName || `ร้าน #${id}`, count: 0 };
        acc[id].count += 1;
        return acc;
    }, {})).sort((a, b) => b.count - a.count || String(a.StoreName).localeCompare(String(b.StoreName), 'th'));
    const maxStoreSales = Math.max(...report.storeRows.map((s) => Number(s.sales) || 0), 1);
    const bestStore = report.storeRows.find((s) => s.sales > 0) || null;
    // การ์ดสถานะร้านค้า: ไม่นับร้านที่หมดสัญญา (ร้านหมดสัญญาแสดงในแถบเหลืองด้านบนแทน)
    const storeStatus = useMemo(() => {
        const live = stores.filter((s) => s.ContractState !== 'EXPIRED');
       return {
            open: live.filter((s) => s.IsOpen && !s.IsSuspended).length,
           closed: live.filter((s) => !s.IsOpen && !s.IsSuspended).length,
           suspended: live.filter((s) => s.IsSuspended).length,
           total: live.length
        };
    }, [stores]);
    // สัญญาที่ต้องดู (แถบเหลืองบนสุดของ Dashboard)
    const contractSoonStores = stores.filter(isContractSoon).sort((a, b) => a.ContractDaysLeft - b.ContractDaysLeft);
    const contractExpiredStores = stores.filter((s) => s.ContractState === 'EXPIRED');
    const cancelAlertStores = report.storeRows
        .filter((s) => isCancelAlert(s.cancelRate))
        .sort((a, b) => b.cancelRate - a.cancelRate);
    const csvRows = () => {
    const summaryRow = [
        'สรุปภาพรวม',
        report.now.completedCount,
        report.now.cancelledCount,
        Math.round(report.now.grossSales),
        Math.round(report.now.sales),
        report.now.cancelRate === null
            ? 'N/A'
            : `${report.now.cancelRate.toFixed(1)}%`
    ];

    // 1 วัน: แสดงข้อมูลแยกร้าน
    if (effectiveDays === 1) {
        return [
            [
                'ร้านค้า',
                'ออเดอร์สำเร็จ',
                'ออเดอร์ที่ยกเลิก',
                'ยอดขายก่อนหักยกเลิก (บาท)',
                'ยอดขายสุทธิ (บาท)',
                'อัตราการยกเลิก'
            ],

            ...report.storeRows.map((s) => [
                s.StoreName,
                s.completedCount,
                s.cancelledCount,
                Math.round(s.grossSales),
                Math.round(s.sales),
                s.cancelRate === null
                    ? 'N/A'
                    : `${s.cancelRate.toFixed(1)}%`
            ]),

            summaryRow
        ];
    }

    // 7 / 14 / 30 วัน: แสดงข้อมูลแยกรายวัน
    const dailyRows = report.buckets.map((bucket) => {
        const bucketOrders = report.current.filter((o) => {
            const at = parseOrderDate(o.CreatedAt);
            return at && toISODate(at) === bucket.key;
        });

        const summary = summarize(bucketOrders);

        return [
            bucket.key,  // CSV ใช้วันที่เต็ม 2026-10-01 : Excel ทุกภาษาอ่านถูก (01/10 จะถูกแปลงเป็น 10-Jan ใน Excel แบบเดือน/วัน)
            summary.completedCount,
            summary.cancelledCount,
            Math.round(summary.grossSales),
            Math.round(summary.sales),
            summary.cancelRate === null
                ? 'N/A'
                : `${summary.cancelRate.toFixed(1)}%`
        ];
    });

    return [
        [
            'วันที่',
            'ออเดอร์สำเร็จ',
            'ออเดอร์ที่ยกเลิก',
            'ยอดขายก่อนหักยกเลิก (บาท)',
            'ยอดขายสุทธิ (บาท)',
            'อัตราการยกเลิก'
        ],

        ...dailyRows,

        summaryRow
    ];
};
    const saveCsv = () => {
        exportCsv(
    `onlyfoods-executive-report-${customRange ? `${customStart}-to-${customEnd}` : `${anchor}-${days}d`}.csv`,csvRows());
        setExportPreview(null);
        pushToast('บันทึกไฟล์ CSV เรียบร้อยแล้ว');
    };
  const saveXlsx = () => {
    try {
        const peakTime = report.peakHour === null ? '-' : `${pad2(report.peakHour)}:00 น.`;

        const overviewRows = [
            ['ตัวชี้วัด', 'ค่า'], ['ช่วงข้อมูล', periodLabel], ['ออกรายงานเมื่อ', nowStamp()],
            ['ออเดอร์สำเร็จ', report.now.completedCount], ['ออเดอร์ยกเลิก', report.now.cancelledCount],
            ['ยอดขายก่อนหักยกเลิก (บาท)', Math.round(report.now.grossSales)], ['ยอดขายสุทธิ (บาท)', Math.round(report.now.sales)],
            ['อัตราการยกเลิก (%)', report.now.cancelRate === null ? 'N/A' : Number(report.now.cancelRate.toFixed(1))],
           ['ยอดเฉลี่ยต่อออเดอร์ (บาท)', Number(report.now.avgOrder.toFixed(2))],
            ['ช่วงเวลาขายดี', peakTime],
            ['จำนวนออเดอร์ช่วงเวลาขายดี', report.peakHour === null ? '-' : report.peakOrderCount]
        ];

        const storeRows = [
            ['ร้านค้า', 'ออเดอร์สำเร็จ', 'ออเดอร์ยกเลิก', 'ยอดขายก่อนหักยกเลิก (บาท)', 'ยอดขายสุทธิ (บาท)', 'อัตราการยกเลิก (%)'],
            ...report.storeRows.map(s => [s.StoreName, s.completedCount, s.cancelledCount, Math.round(s.grossSales), Math.round(s.sales), s.cancelRate === null ? 'N/A' : Number(s.cancelRate.toFixed(1))])
        ];

        const timelineRows = [[effectiveDays === 1 ? 'ช่วงเวลา' : 'วันที่', 'ออเดอร์สำเร็จ', 'ออเดอร์ยกเลิก', 'ยอดขายก่อนหักยกเลิก (บาท)', 'ยอดขายสุทธิ (บาท)', 'อัตราการยกเลิก (%)']];

        if (effectiveDays === 1) {
            for (let h = 0; h < 24; h += 1) {
                const bucketOrders = report.current.filter(o => { const at = parseOrderDate(o.CreatedAt); return at && at.getHours() === h; });
                const summary = summarize(bucketOrders);
                timelineRows.push([`${pad2(h)}:00`, summary.completedCount, summary.cancelledCount, Math.round(summary.grossSales), Math.round(summary.sales), summary.cancelRate === null ? 'N/A' : Number(summary.cancelRate.toFixed(1))]);
            }
        } else {
            report.buckets.forEach(b => {
                const bucketOrders = report.current.filter(o => { const at = parseOrderDate(o.CreatedAt); return at && b.key === toISODate(at); });
                const summary = summarize(bucketOrders);
                timelineRows.push([b.label, summary.completedCount, summary.cancelledCount, Math.round(summary.grossSales), Math.round(summary.sales), summary.cancelRate === null ? 'N/A' : Number(summary.cancelRate.toFixed(1))]);
            });
        }

        exportXlsx( `onlyfoods-overview-${customRange ? `${customStart}-to-${customEnd}` : `${anchor}-${days}d`}.xlsx`,[
            { name: 'สรุปภาพรวม', rows: overviewRows, widths: [38, 24] },
            { name: 'รายงานรายร้าน', rows: storeRows, widths: [32, 18, 18, 30, 22, 22] },
            { name: 'ยอดขายตามเวลา', rows: timelineRows, widths: [18, 18, 18, 30, 22, 22] }
        ]);

        setExportPreview(null);
        pushToast('บันทึกไฟล์ XLSX เรียบร้อยแล้ว');
    } catch (err) {
        pushToast('สร้างไฟล์ XLSX ไม่สำเร็จ', 'error');
    }
};
    return (<>
      {(contractSoonStores.length > 0 || contractExpiredStores.length > 0) && (<AlertBanner tone="warn" style={{ marginBottom: '16px' }}>
        {contractSoonStores.length > 0 && <>สัญญาใกล้หมด {money(contractSoonStores.length)} ร้าน ({contractSoonStores.map((s) => `${s.StoreName} ${contractLeftLabel(s.ContractDaysLeft)}`).join(', ')})</>}
        {contractSoonStores.length > 0 && contractExpiredStores.length > 0 && ' · '}
        {contractExpiredStores.length > 0 && <>หมดสัญญาแล้ว {money(contractExpiredStores.length)} ร้าน ({contractExpiredStores.map((s) => s.StoreName).join(', ')})</>}
        {' — '}
        <button type="button" onClick={() => navigateTo('contract-tracking')} style={{ border: 'none', background: 'transparent', padding: 0, color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_STACK, fontSize: '13px' }}>
          ดูหน้าติดตามสัญญา →
        </button>
      </AlertBanner>)}

      <div
        className="of-control-status-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '18px',
          marginBottom: '18px'
        }}
      >
        {/* การควบคุมศูนย์อาหาร */}
<Card style={{ marginBottom: '0' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0, flex: '1 1 260px' }}>
            <div style={{ width: '44px', height: '44px', minWidth: '44px', borderRadius: T.radiusMd, display: 'grid', placeItems: 'center', background: foodCourtOpen ? T.greenSoft : T.redSoft }}>
                <Icon name="power" size={21} color={foodCourtOpen ? T.up : T.down} />
            </div>
            <div style={{ minWidth: 0 }}>
                <h3 style={{ ...h3Style, margin: 0 }}>การควบคุมศูนย์อาหาร</h3>
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: foodCourtOpen ? T.up : T.down }} />
                    <span style={{ fontSize: '13.5px', fontWeight: 700, color: foodCourtOpen ? T.up : T.down }}>{foodCourtOpen ? 'ศูนย์อาหารเปิดให้บริการ' : 'ศูนย์อาหารปิดให้บริการ'}</span>
                </div>
                <div style={{ marginTop: '7px', color: T.muted, fontSize: '13px' }}>เวลาทำการ {foodCourtOpenTime} - {foodCourtCloseTime}</div>
                <div style={{ marginTop: '4px', color: foodCourtMode === 'AUTO' ? T.muted : '#B7791F', fontSize: '12.5px' }}>{foodCourtMode === 'AUTO' ? 'ระบบเปิด-ปิดอัตโนมัติ' : 'กำลังใช้สถานะที่ผู้บริหารกำหนดเอง'}</div>
            </div>
        </div>

        <button type="button" onClick={onOpenSettings} title="ตั้งค่าเวลาทำการ" aria-label="ตั้งค่าเวลาทำการ" style={{ width: '40px', height: '40px', minWidth: '40px', borderRadius: T.radiusMd, border: `1px solid ${T.line}`, background: T.surface, color: T.muted, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Icon name="settings" size={18} />
        </button>
    </div>

    <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: `1px solid ${T.line}`, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Button variant={foodCourtOpen ? 'danger' : 'primary'} icon="power" onClick={onToggleCourt} disabled={switchingCourt}>
            {switchingCourt ? 'กำลังบันทึก...' : foodCourtOpen ? 'ปิดศูนย์อาหาร' : 'เปิดศูนย์อาหาร'}
        </Button>
        {foodCourtMode !== 'AUTO' && <Button variant="ghost" icon="refresh" onClick={onReturnAuto} disabled={returningFoodCourtAuto}>{returningFoodCourtAuto ? 'กำลังกลับสู่ระบบอัตโนมัติ...' : 'กลับสู่ระบบอัตโนมัติ'}</Button>}
    </div>

    {foodCourtMode !== 'AUTO' && <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: T.radiusMd, background: T.accentSoft, color: '#8A5A00', fontSize: '12.5px', lineHeight: 1.6 }}>
        สถานะที่กำหนดด้วยตนเองจะมีผลจนถึงเวลาเปลี่ยนสถานะอัตโนมัติครั้งถัดไป
    </div>}
</Card>

        {/* สถานะร้านค้า */}
        <Card style={{ marginBottom: '0' }}>
          <div style={{
            ...courtControlStyle,
            minHeight: '132px',
            padding: '18px 20px'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '52px minmax(0, 0.9fr) minmax(0, 1.6fr)',
              columnGap: 'clamp(8px, 1.5vw, 16px)',
              width: '100%',
              alignItems: 'stretch',
              minHeight: '96px'
            }}>
              {/* Icon */}
              <div style={{
                width: '52px',
                height: '52px',
                minWidth: '52px',
                borderRadius: T.radiusMd,
                display: 'grid',
                placeItems: 'center',
                background: T.primarySoft,
                color: T.primaryDark
              }}>
                <Icon name="store" size={28} color={T.primaryDark}/>
              </div>

              {/* Title */}
              <div style={{
                minWidth: 0,
                paddingTop: '1px'
              }}>
                <h3 style={h3Style}>สถานะร้านค้า</h3>
                <p style={{ ...bodyStyle, margin: '6px 0 0' }}>
                  ร้านค้าทั้งหมด{' '}
                  <strong style={{ color: T.ink }}>
                    {money(storeStatus.total)} ร้าน
                  </strong>
                </p>
                  </div>

              {/* Status numbers — กลางการ์ดยาวไปทางขวา */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 'clamp(8px, 2vw, 24px)',
                alignItems: 'center',
                minWidth: 0,
                paddingRight: '8px'
              }}>
                {[
                  { key: 'open', label: 'เปิดให้บริการ', value: storeStatus.open, color: T.up },
                  { key: 'closed', label: 'ปิดทำการ', value: storeStatus.closed, color: T.muted },
                  { key: 'suspended', label: 'ระงับสิทธิ์', value: storeStatus.suspended, color: T.down }
                ].map((item) => (
                  <div key={item.key} style={{
                    minWidth: 0
                  }}>
                    <div style={{
                      color: T.ink,
                      fontSize: '32px',
                      lineHeight: 1,
                      fontWeight: 800,
                      letterSpacing: '-0.8px'
                    }}>
                      {money(item.value)}
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '6px',
                      minWidth: 0,
                      flexWrap: 'wrap'
                    }}>
                      <span style={{
                        width: '7px',
                        height: '7px',
                        minWidth: '7px',
                        borderRadius: '50%',
                        background: item.color
                      }}/>

                      <span style={{
                        color: T.muted,
                        fontSize: '12px',
                        lineHeight: 1.2,
                        fontWeight: 500
                      }}>
                        {item.label}
                      </span>
                    </div>

                    <div style={{
                      color: T.muted,
                      fontSize: '10px',
                      marginTop: '2px'
                    }}>
                      
                    </div>
                  </div>
                ))}
              </div>

            </div>

            <div style={{ marginTop: '-18px' }}>
              <Button
                variant="danger"
                icon="store"
                onClick={() => ctx.navigateTo('store-manage')}
              >
                จัดการร้านค้า
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .of-control-status-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <Card style={{ marginBottom: '18px' }}>
        <div style={toolbarStyle}>
          <div>
            <h3 style={h3Style}>ช่วงข้อมูลที่กำลังดู</h3>
            <p style={captionStyle}>
              {periodLabel} · อัปเดตล่าสุด {nowStamp()} น.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>

            <Button variant="ghost" icon="download" onClick={() => setExportPreview('csv')}>
              CSV
            </Button>
            <Button variant="dark" icon="download" onClick={() => setExportPreview('xlsx')}>
              XLSX
            </Button>
          </div>
        </div>
      </Card>

      <div className="of-kpi-hero">
        <KpiCard label="ยอดขายสุทธิ" value={`${money(report.now.sales)}`} unit="บาท" delta={changePct(report.now.sales, report.before.sales)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} highlight icon="trend"/>
        <KpiCard label="ออเดอร์สำเร็จ" value={money(report.now.completedCount)} unit="ออเดอร์" delta={changePct(report.now.completedCount, report.before.completedCount)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} variant="blue" icon="check"/>
      </div>

      <div className="of-kpi-small">
        <KpiCard size="sm" label="มูลค่าออเดอร์รวมก่อนหักยกเลิก" value={money(report.now.grossSales)} unit="บาท" hint="รวมมูลค่าออเดอร์สำเร็จและออเดอร์ที่ถูกยกเลิก" delta={changePct(report.now.grossSales, report.before.grossSales)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} icon="wallet" tone="blue"/>
        <KpiCard size="sm" label="ออเดอร์ยกเลิก" value={money(report.now.cancelledCount)} unit="ออเดอร์" delta={changePct(report.now.cancelledCount, report.before.cancelledCount)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} icon="ban" tone="amber" invertDelta/>
        <KpiCard size="sm" label="อัตราการยกเลิก" value={report.now.cancelRate === null ? 'N/A' : `${report.now.cancelRate.toFixed(1)}%`} delta={ report.now.cancelRate !== null && report.before.cancelRate !== null  ? report.now.cancelRate - report.before.cancelRate : null } deltaSuffix=" จุดเปอร์เซ็นต์" deltaLabel="" hasPreviousData={report.hasPreviousData} hint={report.now.cancelRate === null ? 'ไม่มีออเดอร์ในช่วงนี้' : undefined} icon="info" tone="amber" invertDelta />
        <KpiCard size="sm" label="ช่วงเวลาขายดี" value={report.peakHour === null ? '—' : `${pad2(report.peakHour)}:00`} unit={report.peakHour === null ? '' : 'น.'} hint={report.peakHour === null ? 'ยังไม่มีออเดอร์สำเร็จ' : `มี ${money(report.peakOrderCount)} ออเดอร์`} delta={null} icon="calendar" tone="purple" />
      </div>

      <div style={chartGridStyle}>

        <Card>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ color: T.muted, fontSize: '14px', fontWeight: 500 }}>
                {effectiveDays === 1 ? 'แนวโน้มยอดขายรายชั่วโมง' : 'แนวโน้มยอดขายรายวัน'}
              </div>
              <StorePeriodPicker anchor={anchor} setAnchor={setAnchor} days={days} setDays={setDays} custom={customRange} setCustom={setCustomRange} startDate={customStart} setStartDate={setCustomStart} endDate={customEnd} setEndDate={setCustomEnd} />
            </div>
            <h3 style={{ margin: '6px 0 0', fontSize: '24px', fontWeight: 700, color: T.ink }}>
              {money(report.now.sales)} บาท
            </h3>
            <p style={captionStyle}>
              ชี้ที่จุดบนกราฟเพื่อดูยอดรวม และร้านที่ขายได้มากสุด/น้อยสุดของช่วงนั้น
            </p>
          </div>
          {loading ? <EmptyState text="กำลังโหลดข้อมูล..."/> : <SalesLineChart buckets={report.buckets}/>}
        </Card>

        <Card title="ยอดขายแยกร้าน" subtitle="เรียงจากร้านที่ทำยอดสูงสุดในช่วงเดียวกัน">
          {loading ? <EmptyState text="กำลังโหลดข้อมูล..."/> : <StoreDonutChart rows={report.storeRows}/>}
        </Card>
      </div>

        <Card title="สรุปผลรายร้าน" subtitle={`ทั้งหมด ${money(visibleStoreRows.length)} ร้าน · เปิดให้บริการ ${money(report.activeStores)} ร้าน`} style={{ marginTop: '16px' }}>
        {cancelAlertStores.length > 0 && (<AlertBanner style={{ marginBottom: '12px' }}>
          {money(cancelAlertStores.length)} ร้านอัตรายกเลิกเกิน {CANCEL_ALERT_RATE}% ในช่วงนี้:{' '}
          {cancelAlertStores.map((s, i) => (<span key={s.StoreId}>
            {i > 0 && ', '}
            <button type="button" onClick={() => ctx.navigateTo('store-sales', s.StoreId)} style={{ border: 'none', background: 'transparent', padding: 0, color: T.down, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_STACK, fontSize: '13px' }}>
              {s.StoreName}
            </button> ({s.cancelRate.toFixed(1)}%)
          </span>))}
        </AlertBanner>)}
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ร้านค้า</th>
                <th style={thRightStyle}>ออเดอร์สำเร็จ</th>
                <th style={thRightStyle}>ยอดขาย</th>
                <th style={thRightStyle} title="เปรียบเทียบยอดขายกับช่วงก่อนหน้า">{compareLabel}</th>
                <th style={thRightStyle}>ยกเลิก</th>
                <th style={thRightStyle}>อัตรายกเลิก</th>
                <th style={thStyle}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {visibleStoreRows.map((s) => (<tr key={s.StoreId} style={trStyle}>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => ctx.navigateTo('store-sales', s.StoreId)}
                      title={`ดูรายละเอียดยอดขายร้าน ${s.StoreName}`}
                      style={{ border: 'none', background: 'transparent', padding: 0, color: T.ink, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_STACK, textAlign: 'left' }}
                    >
                      {s.StoreName} <span aria-hidden="true">→</span>
                    </button>
                  </td>
                  <td style={tdRightStyle}>{money(s.completedCount)}</td>
                  <td style={{ ...tdRightStyle, minWidth: '170px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', color: T.ink, fontWeight: 700 }}>
                      {money(s.sales)} บาท
                    </div>

                  </td>
                  <td style={tdRightStyle}>
                    {s.delta === null ? (<span style={{ color: T.muted }}>—</span>) : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 9px', borderRadius: '999px', background: s.delta >= 0 ? T.greenSoft : T.redSoft, color: s.delta >= 0 ? T.up : T.down, fontWeight: 700 }}>
                        {s.delta >= 0 ? '▲' : '▼'} {Math.abs(s.delta).toFixed(1)}%
                      </span>)}
                  </td>
                  <td style={tdRightStyle}>{money(s.cancelledCount)}</td>
                  <td style={tdRightStyle}>{s.cancelRate === null ? 'N/A' : isCancelAlert(s.cancelRate) ? <Badge tone="danger">{s.cancelRate.toFixed(1)}%</Badge> : `${s.cancelRate.toFixed(1)}%`}</td>
                  <td style={tdStyle}>
                   <Badge tone={s.IsDeleted ? 'neutral' : s.ContractState === 'EXPIRED' || s.IsSuspended ? 'danger' : s.IsOpen ? 'ok' : 'neutral'}>
                      {s.IsDeleted ? 'ลบแล้ว' : s.ContractState === 'EXPIRED' ? 'หมดสัญญา' : s.IsSuspended ? 'ระงับสิทธิ์' : s.IsOpen ? 'เปิดบริการ' : 'ปิดร้าน'}
                    </Badge>
                  </td>
                </tr>))}
              {visibleStoreRows.length === 0 && (<tr>
                  <td colSpan="7" style={{ ...tdStyle, textAlign: 'center', color: T.muted }}>
                    ไม่พบร้านค้าที่ตรงกับคำค้นหา
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <CancelledOrdersCard cancelled={report.now.cancelled} periodLabel={periodLabel} loading={loading} showStore onStoreClick={(storeId) => ctx.navigateTo('store-sales', storeId)}/>

     <Card title="รายงานปัญหาจากลูกค้า" subtitle={effectiveDays === 1 ? `รายงานที่แจ้งใน${periodLabel}` : `จำนวนรายงานแยกตามร้าน · ${periodLabel}`} style={{ marginTop: '16px' }} right={<Badge tone="warning">{money(periodIssueReports.length)} รายการ</Badge>}>
        {issueLoading ? <EmptyState text="กำลังโหลดรายงานปัญหา..."/> : periodIssueReports.length === 0 ? (
          <EmptyState text="ไม่มีรายงานปัญหาในช่วงเวลาที่เลือก"/>
        ) :effectiveDays === 1 ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            {periodIssueReports.slice(0, 5).map((item) => (
              <button key={item.ReportID} type="button" onClick={() => navigateTo('issue-reports', item.StoreId)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', width: '100%', textAlign: 'left', border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: '13px 14px', background: '#FFF', cursor: 'pointer', fontFamily: FONT_STACK }}>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', color: T.ink, fontSize: '14px' }}>{item.StoreName}</strong>
                  <span style={{ display: 'block', color: T.text, fontSize: '13px', marginTop: '4px' }}>{item.IssueType || 'ไม่ระบุประเภท'}</span>
                  <span style={{ display: 'block', color: T.muted, fontSize: '12px', marginTop: '4px' }}>
                    {item.QueueNo ? `คิว ${item.QueueNo}` : ''}{item.OrderID ? `${item.QueueNo ? ' · ' : ''}Order #${item.OrderID}` : ''}
                  </span>
                </span>
                <span style={{ color: T.muted, fontSize: '12px', whiteSpace: 'nowrap' }}>{thaiDateTime(item.CreatedAt)}</span>
              </button>
            ))}
            {periodIssueReports.length > 5 && <p style={{ ...captionStyle, margin: 0 }}>แสดง 5 จาก {money(periodIssueReports.length)} รายการล่าสุด</p>}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            <p style={{ ...captionStyle, margin: '0 0 4px' }}>เรียงตามจำนวนรายงานจากมากไปน้อย · คลิกชื่อร้านเพื่อดูรายละเอียดรายงาน</p>
            {(showAllIssueStores ? issueCountsByStore : issueCountsByStore.slice(0, 5)).map((item) => (
              <div key={item.StoreId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: '11px 13px' }}>
                <button type="button" onClick={() => navigateTo('issue-reports', item.StoreId)} style={{ border: 0, background: 'transparent', padding: 0, color: T.ink, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_STACK, textAlign: 'left' }}>{item.StoreName}</button>
                <Badge tone="warning">{money(item.count)} ครั้ง</Badge>
              </div>
            ))}
            {issueCountsByStore.length > 5 && <Button variant="ghost" onClick={() => setShowAllIssueStores((v) => !v)}>{showAllIssueStores ? 'แสดงน้อยลง' : `แสดงทุกร้าน (${issueCountsByStore.length})`}</Button>}
          </div>
        )}
      </Card>


      <Modal open={Boolean(exportPreview)} title={`พรีวิวก่อนบันทึก ${String(exportPreview || '').toUpperCase()}`} subtitle={`รายงานภาพรวมศูนย์อาหาร · ${periodLabel}`} onClose={() => setExportPreview(null)} width={820} footer={<>
            <Button variant="ghost" onClick={() => setExportPreview(null)}>ยกเลิก</Button>
            <Button variant={exportPreview === 'xlsx' ? 'dark' : 'primary'} icon="download" onClick={exportPreview === 'xlsx' ? saveXlsx : saveCsv}>
              บันทึก {String(exportPreview || '').toUpperCase()}
            </Button>
          </>}>
        <div style={{ border: `1px solid ${T.line}`, borderRadius: '12px', overflow: 'hidden', background: '#FFFFFF' }}>
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.line}`, background: '#FAFAFC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ ...h3Style, margin: 0 }}>รายงานภาพรวมศูนย์อาหาร</h3>
                <p style={{ ...captionStyle, marginTop: '5px' }}>{periodLabel}</p>
              </div>
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {exportPreview === 'xlsx' && (
    <div style={{
        padding: '12px 14px',
        marginBottom: '16px',
        borderRadius: T.radiusMd,
        background: T.bg,
        color: T.text,
        fontSize: '13px',
        lineHeight: 1.7
    }}>
        ไฟล์ Excel จะแยกข้อมูลเป็น 3 Sheet:
        <strong> สรุปภาพรวม · รายงานรายร้าน · ยอดขายตามเวลา</strong>
    </div>
)}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '16px' }}>
              {[
            ['ยอดขายสุทธิ', `${money(report.now.sales)} บาท`],
            ['ออเดอร์สำเร็จ', `${money(report.now.completedCount)} ออเดอร์`],
            ['มูลค่าออเดอร์รวมก่อนหักยกเลิก', `${money(report.now.grossSales)} บาท`],
            ['ออเดอร์ยกเลิก', `${money(report.now.cancelledCount)} ออเดอร์`],
            ['อัตราการยกเลิก', report.now.cancelRate === null ? 'N/A' : `${report.now.cancelRate.toFixed(1)}%`]
].map(([label, value]) => (<div key={label} style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: '12px' }}>
                  <div style={{ ...captionStyle, margin: 0 }}>{label}</div>
                  <strong style={{ display: 'block', color: T.ink, marginTop: '6px', fontSize: '16px' }}>{value}</strong>
                </div>))}
            </div>
            <div style={{ ...captionStyle, color: T.text, fontWeight: 700, marginBottom: '8px' }}>{exportPreview === 'csv' && effectiveDays > 1 ? 'ตัวอย่างข้อมูลสรุปผลรายวัน' : 'ตัวอย่างข้อมูลสรุปผลรายร้าน'}</div>

<div style={{ overflowX: 'auto' }}><table style={tableStyle}>
    <thead><tr>
        <th style={thStyle}>{exportPreview === 'csv' && effectiveDays > 1 ? 'วันที่' : 'ร้านค้า'}</th>
        <th style={thRightStyle}>ออเดอร์สำเร็จ</th><th style={thRightStyle}>ออเดอร์ที่ยกเลิก</th><th style={thRightStyle}>ยอดขายก่อนหักยกเลิก</th><th style={thRightStyle}>ยอดขายสุทธิ</th><th style={thRightStyle}>อัตราการยกเลิก</th>
    </tr></thead>
    <tbody>
        {exportPreview === 'csv' && effectiveDays > 1 ? <>
            {report.buckets.slice(0, 6).map(bucket => {
                const bucketOrders = report.current.filter(o => { const at = parseOrderDate(o.CreatedAt); return at && toISODate(at) === bucket.key; }), summary = summarize(bucketOrders);
                return <tr key={bucket.key} style={trStyle}>
                    <td style={tdStyle}>{bucket.label}</td><td style={tdRightStyle}>{money(summary.completedCount)}</td><td style={tdRightStyle}>{money(summary.cancelledCount)}</td><td style={tdRightStyle}>{money(summary.grossSales)} บาท</td><td style={tdRightStyle}>{money(summary.sales)} บาท</td><td style={tdRightStyle}>{summary.cancelRate === null ? 'N/A' : `${summary.cancelRate.toFixed(1)}%`}</td>
                </tr>;
            })}
            <tr style={{ ...trStyle, fontWeight: 700, background: T.bg }}>
                <td style={tdStyle}>สรุปภาพรวม</td><td style={tdRightStyle}>{money(report.now.completedCount)}</td><td style={tdRightStyle}>{money(report.now.cancelledCount)}</td><td style={tdRightStyle}>{money(report.now.grossSales)} บาท</td><td style={tdRightStyle}>{money(report.now.sales)} บาท</td><td style={tdRightStyle}>{report.now.cancelRate === null ? 'N/A' : `${report.now.cancelRate.toFixed(1)}%`}</td>
            </tr>
        </> : <>
            {report.storeRows.slice(0, 6).map(s => <tr key={s.StoreId} style={trStyle}>
                <td style={tdStyle}>{s.StoreName}</td><td style={tdRightStyle}>{money(s.completedCount)}</td><td style={tdRightStyle}>{money(s.cancelledCount)}</td><td style={tdRightStyle}>{money(s.grossSales)} บาท</td><td style={tdRightStyle}>{money(s.sales)} บาท</td><td style={tdRightStyle}>{s.cancelRate === null ? 'N/A' : `${s.cancelRate.toFixed(1)}%`}</td>
            </tr>)}
            {exportPreview === 'csv' && <tr style={{ ...trStyle, fontWeight: 700, background: T.bg }}>
                <td style={tdStyle}>สรุปภาพรวม</td><td style={tdRightStyle}>{money(report.now.completedCount)}</td><td style={tdRightStyle}>{money(report.now.cancelledCount)}</td><td style={tdRightStyle}>{money(report.now.grossSales)} บาท</td><td style={tdRightStyle}>{money(report.now.sales)} บาท</td><td style={tdRightStyle}>{report.now.cancelRate === null ? 'N/A' : `${report.now.cancelRate.toFixed(1)}%`}</td>
            </tr>}
        </>}
    </tbody>
</table></div>

{exportPreview === 'csv' && effectiveDays > 1 && report.buckets.length > 6 && <p style={{ ...captionStyle, textAlign: 'center', marginTop: '10px' }}>และอีก {report.buckets.length - 6} วันในไฟล์จริง</p>}
{!(exportPreview === 'csv' && effectiveDays > 1) && report.storeRows.length > 6 && <p style={{ ...captionStyle, textAlign: 'center', marginTop: '10px' }}>และอีก {report.storeRows.length - 6} ร้านในไฟล์จริง</p>}
          </div>
        </div>
      </Modal>
    </>);
}

function StarRating({ value, size = 14 }) {
    const rounded = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
    return (<span style={{ fontSize: size, letterSpacing: '1px', whiteSpace: 'nowrap' }} aria-label={`${value} จาก 5 ดาว`}>
      <span style={{ color: T.accent }}>{'★★★★★'.slice(0, rounded)}</span>
      <span style={{ color: T.line }}>{'★★★★★'.slice(rounded)}</span>
    </span>);
}
function ReviewRow({ review }) {
    return (<div style={{ padding: '12px 0', borderBottom: `1px solid ${T.line}` }}>
      <div style={{display: 'flex',justifyContent: 'space-between',alignItems: 'center',gap: '10px',flexWrap: 'wrap'}}>
        <div style={{ fontWeight: 700, fontSize: '13.5px', color: T.ink }}>
          {review.ReviewerName || 'ลูกค้าไม่ระบุชื่อ'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StarRating value={review.Rating}/>
          <span style={captionStyle}>{thaiDateTime(review.CreatedAt)}</span>
        </div>
      </div>
      {review.Comment && (<p style={{ margin: '6px 0 0', fontSize: '13px', color: T.text, lineHeight: 1.6 }}>
          {review.Comment}
        </p>)}
    </div>);
}
// ===== รีวิวร้านค้า: คะแนนและความพึงพอใจของผู้ใช้ =====
function StoreReviewSection({ ctx, storeId, style }) {
    const { API } = ctx;
    const [state, setState] = useState({ loading: false, error: null, data: null });
    const [ratingFilter, setRatingFilter] = useState('all');
    useEffect(() => {
        setRatingFilter('all');
    }, [storeId]);
    useEffect(() => {
        if (!storeId) {
            setState({ loading: false, error: null, data: null });
            return undefined;
        }
        let cancelled = false;
        setState({ loading: true, error: null, data: null });
        callApi(`${API}/api/stores/${storeId}/reviews`)
            .then((data) => {
            if (!cancelled)
                setState({ loading: false, error: null, data });
        })
            .catch((err) => {
            if (!cancelled)
                setState({ loading: false, error: err.message, data: null });
        });
        return () => {
            cancelled = true;
        };
    }, [API, storeId]);
    const summary = state.data?.summary || { total: 0, average: 0, breakdown: {} };
    // รีวิวของร้านเป็นข้อมูลแบบ all-time: ไม่ผูกกับช่วงวันที่ของยอดขายด้านบน
    // เรียงรีวิวล่าสุดก่อนเสมอ เพื่อให้รีวิวยังคงแสดงแม้วันที่ที่เลือกจะไม่มีรีวิวใหม่
    const reviews = useMemo(() => {
        const rows = Array.isArray(state.data?.reviews) ? state.data.reviews : [];
        return [...rows].sort((a, b) => {
            const aTime = parseOrderDate(a.CreatedAt)?.getTime() || 0;
            const bTime = parseOrderDate(b.CreatedAt)?.getTime() || 0;
            return bTime - aTime;
        });
    }, [state.data?.reviews]);
    const breakdown = summary.breakdown || {};
    const filteredReviews = useMemo(() => {
        if (ratingFilter === 'all')
            return reviews;
        return reviews.filter((r) => Number(r.Rating) === Number(ratingFilter));
    }, [reviews, ratingFilter]);
    const ratingOptions = [5, 4, 3, 2, 1];
    const filterChip = (active) => ({
        border: `1px solid ${active ? T.primary : T.line}`,
        background: active ? T.primarySoft : '#FFF',
        color: active ? T.primaryDark : T.text,
        borderRadius: '999px',
        padding: '7px 12px',
        fontSize: '12.5px',
        fontWeight: active ? 700 : 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap'
    });
    return (<Card title="รีวิวจากลูกค้า" subtitle="รีวิวทั้งหมดของร้านนี้ " style={{ margin: 0, ...style }} right={summary.total > 0 ? (<div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: T.ink, lineHeight: 1.2 }}>
              {Number(summary.average || 0).toFixed(1)}
              <span style={{ fontSize: '13px', color: T.muted, fontWeight: 500 }}> / 5</span>
            </div>
            <div style={captionStyle}>{money(summary.total)} รีวิว</div>
          </div>) : null}>
      {state.loading && <EmptyState text="กำลังโหลดรีวิว..."/>}
      {!state.loading && state.error && <EmptyState text={state.error}/>}
      {!state.loading && !state.error && reviews.length === 0 && (<EmptyState text="ร้านนี้ยังไม่มีรีวิวจากลูกค้า"/>)}
      {!state.loading && !state.error && reviews.length > 0 && (<div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ ...captionStyle, marginRight: '2px' }}>กรองคะแนน:</span>
            <button type="button" onClick={() => setRatingFilter('all')} style={filterChip(ratingFilter === 'all')}>
              ทั้งหมด ({money(reviews.length)})
            </button>
            {ratingOptions.map((star) => (<button key={star} type="button" onClick={() => setRatingFilter(String(star))} style={filterChip(ratingFilter === String(star))}>
                {star} ★ ({money(breakdown[String(star)] ?? reviews.filter((r) => Number(r.Rating) === star).length)})
              </button>))}
          </div>
          {filteredReviews.length > 0 ? (<div>
              {filteredReviews.map((r) => (<ReviewRow key={r.ReviewId ?? r.ReviewID} review={r}/>))}
            </div>) : (<EmptyState text={`ยังไม่มีรีวิว ${ratingFilter} ดาว`}/>) }
        </div>)}
    </Card>);
}
// ===== รายงานปัญหา (ผู้บริหารดูอย่างเดียว) : สถานะ / หน้าต่างรายละเอียด / หน้ารวมทุกร้าน =====
const ISSUE_STATUS_META = {
    OPEN: { label: 'รอดำเนินการ', tone: 'danger' },
    IN_PROGRESS: { label: 'กำลังดำเนินการ', tone: 'warn' },
    RESOLVED: { label: 'แก้ไขแล้ว', tone: 'ok' },
    REJECTED: { label: 'ไม่รับเรื่อง', tone: 'neutral' }
};
function IssueStatusBadge({ status }) {
    const meta = ISSUE_STATUS_META[status] || { label: status || '-', tone: 'neutral' };
    return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
function daysAgoISO(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return toISODate(d);
}
function formatHoursTh(h) {
    if (h === null || h === undefined) return '—';
    if (h < 1) return `${Math.max(1, Math.round(h * 60))} นาที`;
    if (h < 48) return `${Math.round(h * 10) / 10} ชม.`;
    return `${Math.round(h / 24)} วัน`;
}
function IssueDetailModal({ API, issueId, onClose }) {
    const [state, setState] = useState({ loading: false, error: '', data: null });
    useEffect(() => {
        if (!issueId) return undefined;
        let cancelled = false;
        setState({ loading: true, error: '', data: null });
        callApi(`${API}/api/executive/issues/${issueId}`)
            .then((data) => { if (!cancelled) setState({ loading: false, error: '', data }); })
            .catch((err) => { if (!cancelled) setState({ loading: false, error: err.message, data: null }); });
        return () => { cancelled = true; };
    }, [API, issueId]);
    const d = state.data;
    const row = (label, value) => (<div style={{ minWidth: 0 }}>
      <div style={captionStyle}>{label}</div>
      <div style={{ color: T.ink, fontSize: '13.5px', fontWeight: 600, marginTop: '2px' }}>{value || '—'}</div>
    </div>);
    const sectionTitle = (text) => <div style={{ color: T.muted, fontSize: '12.5px', fontWeight: 700, margin: '18px 0 8px' }}>{text}</div>;
    return (<Modal open={Boolean(issueId)} title={d ? `รายงานปัญหา #${d.IssueReportId}` : 'รายงานปัญหา'} subtitle={d ? `${d.StoreName} · ${d.IssueType}` : ''} onClose={onClose} width={640}
      footer={<>
        <span style={{ ...captionStyle, marginRight: 'auto' }}>ผู้บริหารดูได้อย่างเดียว · ร้านเป็นผู้อัปเดตสถานะ</span>
        <Button variant="ghost" onClick={onClose}>ปิด</Button>
      </>}>
      {state.loading && <EmptyState text="กำลังโหลดรายละเอียด..." minHeight="160px"/>}
      {state.error && <EmptyState text={state.error} minHeight="160px"/>}
      {d && (<div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <IssueStatusBadge status={d.IssueStatus}/>
          <span style={captionStyle}>แจ้งเมื่อ {thaiDateTime(d.CreatedAt)}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '12px', marginTop: '14px' }}>
          {row('ร้าน', d.StoreName)}
          {row('ผู้แจ้ง', d.CustomerName)}
          {row('ออเดอร์', d.OrderID ? `${d.QueueNo ? `คิว ${d.QueueNo} · ` : ''}#${d.OrderID}` : 'ไม่ได้ระบุออเดอร์')}
          {d.Order && row('สถานะออเดอร์ / ยอด', `${d.Order.StatusNameTh} · ${money2(d.Order.TotalAmount)} บาท`)}
        </div>

        {sectionTitle('ข้อความจากลูกค้า')}
        <div style={{ padding: '11px 13px', borderRadius: T.radiusMd, background: T.bg, color: T.text, fontSize: '13.5px', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
          {d.Description || '-'}
        </div>

        {d.items.length > 0 && (<>
          {sectionTitle('รายการอาหารในออเดอร์')}
          <div style={{ display: 'grid', gap: '4px' }}>
            {d.items.map((it, idx) => (<div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: T.text }}>
              <span>{it.ProductName}</span><span style={{ color: T.muted }}>x{it.Qty}</span>
            </div>))}
          </div>
        </>)}

        {sectionTitle('การตอบกลับของร้าน')}
        {d.AdminNote ? (<div style={{ padding: '11px 13px', borderRadius: T.radiusMd, border: `1px solid ${T.line}`, fontSize: '13.5px', color: T.text, lineHeight: 1.6 }}>
          {d.AdminNote}
          {d.HandledByName && <div style={{ ...captionStyle, marginTop: '6px' }}>โดย {d.HandledByName}</div>}
        </div>) : <div style={captionStyle}>ร้านยังไม่ได้ตอบกลับ</div>}

        {sectionTitle('ลำดับเหตุการณ์')}
        <div style={{ display: 'grid', gap: '0' }}>
          {d.Timeline.map((t, idx) => (<div key={idx} style={{ display: 'flex', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', marginTop: '5px', background: idx === d.Timeline.length - 1 ? T.primary : T.line }}/>
              {idx < d.Timeline.length - 1 && <span style={{ width: '2px', flex: 1, background: T.line }}/>}
            </div>
            <div style={{ paddingBottom: '12px', minWidth: 0 }}>
              <div style={{ color: T.ink, fontSize: '13.5px', fontWeight: 600 }}>{t.Label}</div>
              <div style={captionStyle}>{thaiDateTime(t.At)} · {t.By}</div>
              {t.Note && <div style={{ color: T.text, fontSize: '13px', marginTop: '3px' }}>“{t.Note}”</div>}
            </div>
          </div>))}
        </div>
      </div>)}
    </Modal>);
}
const ISSUE_RANGES = [['7', '7 วันล่าสุด'], ['30', '30 วันล่าสุด'], ['90', '90 วันล่าสุด'], ['all', 'ทั้งหมด'], ['custom', 'กำหนดช่วงเอง']];
const ISSUE_STATUS_TABS = [['all', 'ทั้งหมด'], ['pending', 'ต้องจัดการ'], ['IN_PROGRESS', 'กำลังดำเนินการ'], ['RESOLVED', 'แก้ไขแล้ว'], ['REJECTED', 'ไม่รับเรื่อง']];
function IssueReportsPage({ ctx }) {
    const { API, stores, focusStoreId, clearFocusStore } = ctx;
    const [storeId, setStoreId] = useState(focusStoreId || '');
    const [query, setQuery] = useState('');
    const [range, setRange] = useState('30');
    const [customStart, setCustomStart] = useState(() => daysAgoISO(29));
    const [customEnd, setCustomEnd] = useState(todayISO());
    const [typeCode, setTypeCode] = useState('');
    const [status, setStatus] = useState('pending');
    // ยังไม่ได้กดแท็บเอง = เลือกแท็บให้ : มีเรื่องค้าง -> "ต้องจัดการ" ; ไม่มี -> "ทั้งหมด"
    const autoTab = useRef(true);
    const [state, setState] = useState({ loading: true, error: '', issues: [], summary: null });
    const [openIssueId, setOpenIssueId] = useState(null);

    // มาจากปุ่มของหน้าอื่น (กระดิ่ง / Dashboard / ยอดขายรายร้าน) = เลือกร้านนั้นไว้ให้
    useEffect(() => {
        if (focusStoreId) {
            setStoreId(focusStoreId);
            clearFocusStore();
        }
    }, [focusStoreId, clearFocusStore]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (storeId) params.set('store_id', storeId);
        if (typeCode) params.set('type_code', typeCode);
        if (range === 'custom') {
            if (customStart) params.set('date_from', customStart);
            if (customEnd) params.set('date_to', customEnd);
        } else if (range !== 'all') {
            params.set('date_from', daysAgoISO(Number(range) - 1));
        }
        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true, error: '' }));
        callApi(`${API}/api/executive/issues?${params}`)
                        .then((data) => {
                if (cancelled) return;
                setState({ loading: false, error: '', issues: data.issues || [], summary: data.summary || null });
                if (autoTab.current) setStatus(data.summary?.pending ? 'pending' : 'all');
            })
            .catch((err) => { if (!cancelled) setState({ loading: false, error: err.message, issues: [], summary: null }); });
        return () => { cancelled = true; };
    }, [API, storeId, typeCode, range, customStart, customEnd]);

    const sm = state.summary || {};
    const byStatus = sm.by_status || {};
    const countOf = (id) => (id === 'all' ? (sm.total || 0) : id === 'pending' ? (sm.pending || 0) : (byStatus[id] || 0));
    const q = query.trim().toLowerCase().replace(/^#/, '');
    const rows = state.issues
        .filter((i) => status === 'all' || (status === 'pending' ? i.IsOpen : i.IssueStatus === status))
        .filter((i) => !q || `${i.QueueNo || ''} ${i.OrderID || ''} ${i.StoreName} ${i.IssueType} ${i.CustomerName} ${i.Description}`.toLowerCase().includes(q));
    // เรื่องที่ต้องจัดการ: เก่าสุดขึ้นก่อน จะได้ไม่จมหาย ; แท็บอื่น: ใหม่สุดขึ้นก่อน
    const shown = status === 'pending' ? [...rows].reverse() : rows;

        const stat = (label, value, sub, color, first = false, small = false) => (<div style={{ padding: '4px 18px', borderLeft: first ? 'none' : `1px solid ${T.line}`, minWidth: 0 }}>
      <div style={captionStyle}>{label}</div>
      <div style={{ color: color || T.ink, fontSize: small ? '16px' : '22px', lineHeight: small ? '30px' : 1.4, fontWeight: 700, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ ...captionStyle, fontSize: '11.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>);
    const chip = (active) => ({ border: `1px solid ${active ? T.primary : T.line}`, background: active ? T.primarySoft : T.surface, color: active ? T.primaryDark : T.text, borderRadius: '999px', padding: '7px 12px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: FONT_STACK });

    return (<>
      <Card style={{ marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', margin: '0 -18px 0 -18px' }}>
          {stat('ต้องจัดการ', money(sm.pending || 0), byStatus.IN_PROGRESS ? `กำลังดำเนินการ ${money(byStatus.IN_PROGRESS)}` : null, sm.pending ? T.down : T.ink, true)}
          {stat(`ค้างเกิน ${sm.stale_hours || 24} ชม.`, money(sm.stale || 0), null, sm.stale ? T.down : T.ink)}
          {stat('เวลาปิดเรื่องเฉลี่ย', formatHoursTh(sm.avg_resolve_hours))}
          {stat('ปัญหาที่พบบ่อยสุด', sm.top_type?.IssueType || '—', sm.top_type ? `${money(sm.top_type.count)} เรื่อง` : null, null, false, true)}
        </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '18px' }}>
          <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
            <IconInput icon="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลขคิว เลขออเดอร์ ชื่อลูกค้า หรือข้อความ..."/>
          </div>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '200px' }}>
            <option value="">ทุกร้าน</option>
            {stores.map((st) => <option key={st.StoreId} value={String(st.StoreId)}>{st.StoreName}</option>)}
          </select>
          <select value={range} onChange={(e) => setRange(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            {ISSUE_RANGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          {range === 'custom' && (<>
            <input type="date" value={customStart} max={customEnd || undefined} onChange={(e) => setCustomStart(e.target.value)} style={{ ...formDateInputStyle, width: 'auto' }}/>
            <input type="date" value={customEnd} min={customStart || undefined} onChange={(e) => setCustomEnd(e.target.value)} style={{ ...formDateInputStyle, width: 'auto' }}/>
          </>)}
          <select value={typeCode} onChange={(e) => setTypeCode(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            <option value="">ทุกประเภทปัญหา</option>
            {(sm.types || []).map((t) => <option key={t.TypeCode} value={t.TypeCode}>{t.IssueType}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: '12px' }}>
            {ISSUE_STATUS_TABS.map(([id, label]) => (<button key={id} type="button" onClick={() => { autoTab.current = false; setStatus(id); }} style={chip(status === id)}>
            {label} ({money(countOf(id))})
          </button>))}
        </div>
      </Card>

      <Card title="รายการรายงานปัญหา" subtitle={status === 'pending' ? 'เรียงเรื่องที่ค้างนานสุดขึ้นก่อน · กดที่แถวเพื่อดูรายละเอียด' : 'เรียงใหม่สุดขึ้นก่อน · กดที่แถวเพื่อดูรายละเอียด'}>
        {state.loading ? <EmptyState text="กำลังโหลดรายงานปัญหา..."/>
          : state.error ? <EmptyState text={state.error}/>
          : shown.length === 0 ? <EmptyState text={q ? `ไม่พบรายงานที่ตรงกับ “${query.trim()}”` : status === 'pending' ? 'ไม่มีเรื่องที่ต้องจัดการในช่วงนี้' : 'ไม่พบรายงานปัญหาตามตัวกรอง'}/>
          : (<div style={{ overflowX: 'auto' }}>
            <table style={{ ...tableStyle, minWidth: '720px' }}>
              <thead>
                <tr>
                  <th style={thStyle}>วันที่แจ้ง</th>
                  <th style={thStyle}>ร้าน</th>
                  <th style={thStyle}>ปัญหา</th>
                  <th style={thStyle}>สถานะ</th>
                  <th style={thRightStyle}>ระยะเวลา</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (<tr key={i.IssueReportId} onClick={() => setOpenIssueId(i.IssueReportId)} style={{ ...trStyle, cursor: 'pointer' }}>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: T.muted }}>{thaiDateTime(i.CreatedAt)}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: T.ink }}>{i.StoreName}</td>
                  <td style={tdStyle}>
                    <div style={{ color: T.ink }}>{i.IssueType}</div>
                    <div style={{ ...captionStyle, maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {i.QueueNo ? `คิว ${i.QueueNo} · ` : ''}{i.Description}
                    </div>
                  </td>
                  <td style={tdStyle}><IssueStatusBadge status={i.IssueStatus}/></td>
                  <td style={{ ...tdRightStyle, whiteSpace: 'nowrap', color: i.IsStale ? T.down : T.text, fontWeight: i.IsStale ? 700 : 400 }}>
                    {i.IsOpen ? `ค้างมา ${formatHoursTh(i.AgeHours)}` : `ปิดใน ${formatHoursTh(i.ResolveHours)}`}
                  </td>
                </tr>))}
              </tbody>
            </table>
          </div>)}
      </Card>

      <IssueDetailModal API={API} issueId={openIssueId} onClose={() => setOpenIssueId(null)}/>
    </>);
}
// ===== รายงานปัญหาร้านค้า: ตรวจสอบข้อร้องเรียนของแต่ละร้าน =====
function StoreIssueReportSection({ ctx, storeId, style }) {
    const { API } = ctx;
    const [state, setState] = useState({ loading: false, error: null, rows: [] });
    const [typeFilter, setTypeFilter] = useState('all');
    const [openIssueId, setOpenIssueId] = useState(null);

    useEffect(() => {
        setTypeFilter('all');
    }, [storeId]);

    useEffect(() => {
        if (!storeId) {
            setState({ loading: false, error: null, rows: [] });
            return undefined;
        }
        let cancelled = false;
        setState({ loading: true, error: null, rows: [] });
        callApi(`${API}/api/reports/issue/store/${storeId}`)
            .then((data) => {
            if (!cancelled)
                setState({ loading: false, error: null, rows: Array.isArray(data) ? data : [] });
        })
            .catch((err) => {
            if (!cancelled)
                setState({ loading: false, error: err.message, rows: [] });
        });
        return () => {
            cancelled = true;
        };
    }, [API, storeId]);

    // รายงานปัญหาเป็นข้อมูล all-time ของร้าน ไม่ผูกกับตัวกรองวันที่ของยอดขาย
    const reports = useMemo(() => [...state.rows].sort((a, b) => {
        const aTime = parseOrderDate(a.CreatedAt)?.getTime() || 0;
        const bTime = parseOrderDate(b.CreatedAt)?.getTime() || 0;
        return bTime - aTime;
    }), [state.rows]);

    const issueTypes = useMemo(() => [...new Set(reports
        .map((r) => String(r.IssueType || '').trim())
        .filter(Boolean))], [reports]);

    const filteredReports = useMemo(() => {
        if (typeFilter === 'all') return reports;
        return reports.filter((r) => String(r.IssueType || '') === typeFilter);
    }, [reports, typeFilter]);

    const filterChip = (active) => ({
        border: `1px solid ${active ? T.primary : T.line}`,
        background: active ? T.primarySoft : '#FFF',
        color: active ? T.primaryDark : T.text,
        borderRadius: '999px',
        padding: '7px 12px',
        fontSize: '12.5px',
        fontWeight: active ? 700 : 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap'
    });

    return (<Card
      title="รายงานปัญหาจากลูกค้า"
      subtitle="รายงานทั้งหมดของร้านนี้ "
      style={{ margin: 0, ...style }}
            right={reports.length > 0 ? (<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Badge tone="warn">{money(reports.length)} รายการ</Badge>
        <Button variant="ghost" onClick={() => ctx.navigateTo('issue-reports', storeId)} style={{ padding: '7px 12px', fontSize: '12.5px' }}>ดูในหน้ารายงานปัญหา</Button>
      </div>) : null}
    >
      {state.loading && <EmptyState text="กำลังโหลดรายงานปัญหา..."/>}
      {!state.loading && state.error && <EmptyState text={state.error}/>} 
      {!state.loading && !state.error && reports.length === 0 && <EmptyState text="ร้านนี้ยังไม่มีรายงานปัญหาจากลูกค้า"/>}
      {!state.loading && !state.error && reports.length > 0 && (<div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ ...captionStyle, marginRight: '2px' }}>ประเภทปัญหา:</span>
          <button type="button" onClick={() => setTypeFilter('all')} style={filterChip(typeFilter === 'all')}>
            ทั้งหมด ({money(reports.length)})
          </button>
          {issueTypes.map((type) => (<button key={type} type="button" onClick={() => setTypeFilter(type)} style={filterChip(typeFilter === type)}>
            {type} ({money(reports.filter((r) => String(r.IssueType || '') === type).length)})
          </button>))}
        </div>

        {filteredReports.length > 0 ? (<div style={{ display: 'grid', gap: '10px' }}>
                    {filteredReports.map((report) => (<div key={report.ReportID} role="button" tabIndex={0} title="กดเพื่อดูสถานะและรายละเอียด"
            onClick={() => setOpenIssueId(report.ReportID)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenIssueId(report.ReportID); }}
            style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: '13px 14px', background: '#FFF', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                 <strong style={{ color: T.ink, fontSize: '14px' }}>{report.IssueType || 'ไม่ระบุประเภท'}</strong>
                  <IssueStatusBadge status={report.IssueStatus}/>
                  {report.QueueNo && <Badge tone="neutral">คิว {report.QueueNo}</Badge>}
                </div>
                <div style={{ ...captionStyle, marginTop: '4px' }}>
                  ผู้แจ้ง: {report.CustomerName || `User ${report.UserId}`}
                  {report.OrderID ? ` · Order #${report.OrderID}` : ''}
                </div>
              </div>
              <span style={captionStyle}>{thaiDateTime(report.CreatedAt)}</span>
            </div>
            <p style={{ margin: '9px 0 0', color: T.text, fontSize: '13.5px', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {report.Description || '-'}
            </p>
            {report.AdminNote && (<div style={{ marginTop: '9px', padding: '9px 11px', borderRadius: T.radiusMd, background: T.deepSoft, color: T.text, fontSize: '13px' }}>
              <strong>หมายเหตุ:</strong> {report.AdminNote}
            </div>)}
          </div>))}
                </div>) : <EmptyState text={`ยังไม่มีรายงานประเภท “${typeFilter}”`}/>} 
      </div>)}
      <IssueDetailModal API={API} issueId={openIssueId} onClose={() => setOpenIssueId(null)}/>
    </Card>);
}
const CANCEL_REASON_FALLBACK = 'ไม่ระบุเหตุผล';
function summarizeCancelReasons(cancelledOrders) {
    const map = {};
    cancelledOrders.forEach((o) => {
        const reason = String(o.CancelReason || '').trim() || CANCEL_REASON_FALLBACK;
        if (!map[reason])
            map[reason] = { reason, count: 0, amount: 0 };
        map[reason].count += 1;
        map[reason].amount += Number(o.TotalAmount || 0);
    });
    const rows = Object.values(map);
    const total = rows.reduce((s, r) => s + r.count, 0);
    rows.forEach((r) => {
        r.share = total ? (r.count / total) * 100 : 0;
    });
    return rows.sort((a, b) => b.count - a.count);
}
// ===== ออเดอร์ยกเลิก: สรุปและตรวจสอบรายการที่ถูกยกเลิก =====
function CancelledOrdersCard({ cancelled = [], periodLabel, showStore = true, loading = false, style, onStoreClick }) {
    const [reasonFilter, setReasonFilter] = useState('');
    const [openId, setOpenId] = useState(null);
    const [showAll, setShowAll] = useState(false);
    const reasons = useMemo(() => summarizeCancelReasons(cancelled), [cancelled]);
    const rows = useMemo(() => {
        const filtered = reasonFilter
            ? cancelled.filter((o) => (String(o.CancelReason || '').trim() || CANCEL_REASON_FALLBACK) === reasonFilter)
            : cancelled;
        return [...filtered].sort((a, b) => {
            const at = parseOrderDate(a.CreatedAt);
            const bt = parseOrderDate(b.CreatedAt);
            return (bt ? bt.getTime() : 0) - (at ? at.getTime() : 0);
        });
    }, [cancelled, reasonFilter]);
    const lostAmount = sumAmount(cancelled);
    const topReason = reasons[0] || null;
    const visibleRows = showAll ? rows : rows.slice(0, 8);
    const toggleRow = (orderId) => setOpenId((prev) => (prev === orderId ? null : orderId));
    return (<Card title="รายงานออเดอร์ยกเลิก" subtitle={`${periodLabel} · กดที่แถวเพื่อดูรายการอาหารในออเดอร์นั้น`} right={<Badge tone={cancelled.length ? 'danger' : 'ok'}>{money(cancelled.length)} ออเดอร์</Badge>} style={{ marginTop: '16px', ...style }}>
      {loading && <EmptyState text="กำลังโหลดข้อมูล..." minHeight="160px"/>}

      {!loading && !cancelled.length && (<EmptyState text="ช่วงเวลานี้ไม่มีออเดอร์ที่ถูกยกเลิก" minHeight="160px"/>)}

      {!loading && cancelled.length > 0 && (<>

          <div style={cancelStatRowStyle}>
            <div style={cancelStatBoxStyle}>
              <span style={cancelStatLabelStyle}>ออเดอร์ที่ถูกยกเลิก</span>
              <strong style={cancelStatValueStyle}>{money(cancelled.length)} ออเดอร์</strong>
            </div>
            <div style={cancelStatBoxStyle}>
              <span style={cancelStatLabelStyle}>มูลค่าที่เสียไป</span>
              <strong style={{ ...cancelStatValueStyle, color: T.down }}>
                {money(lostAmount)} บาท
              </strong>
            </div>
            <div style={cancelStatBoxStyle}>
              <span style={cancelStatLabelStyle}>เหตุผลที่พบบ่อยที่สุด</span>
              <strong style={{ ...cancelStatValueStyle, fontSize: '15px' }}>
                {topReason ? topReason.reason : '-'}
              </strong>
            </div>
          </div>

          <div style={cancelChipRowStyle}>
            <button type="button" onClick={() => setReasonFilter('')} style={cancelChipStyle(!reasonFilter)}>
              ทั้งหมด ({money(cancelled.length)})
            </button>
            {reasons.map((r) => (<button key={r.reason} type="button" onClick={() => setReasonFilter((prev) => (prev === r.reason ? '' : r.reason))} style={cancelChipStyle(reasonFilter === r.reason)} title={`${r.reason} · มูลค่า ${money(r.amount)} บาท`}>
                {r.reason} ({money(r.count)})
              </button>))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>เวลาที่ยกเลิก</th>
                  <th style={thStyle}>คิว</th>
                  {showStore && <th style={thStyle}>ร้านค้า</th>}
                  <th style={thStyle}>ช่องทางชำระ</th>
                  <th style={thRightStyle}>ยอดออเดอร์</th>
                  <th style={thStyle}>เหตุผลการยกเลิก</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((o) => {
                const isOpen = openId === o.OrderID;
                const items = o.items || [];
                return (<React.Fragment key={o.OrderID}>
                      <tr style={{ ...trStyle, cursor: 'pointer', background: isOpen ? T.bg : 'transparent' }} onClick={() => toggleRow(o.OrderID)}>
                        <td style={tdStyle}>{thaiDateTime(o.CreatedAt)}</td>
                        <td style={tdStyle}>
                          <strong style={{ color: T.ink }}>{o.QueueNo || '-'}</strong>
                          {Boolean(o.IsWalkIn) && (<span style={{ marginLeft: '8px' }}>
                              <Badge tone="neutral">หน้าร้าน</Badge>
                            </span>)}
                        </td>
                        {showStore && <td style={tdStyle}>{onStoreClick ? (<button type="button" onClick={(event) => { event.stopPropagation(); onStoreClick(o.StoreId); }} title={`ดูยอดขายรายร้าน ${o.StoreName || `ร้าน #${o.StoreId}`}`} style={{ border: 'none', background: 'transparent', padding: 0, color: T.ink, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_STACK, textAlign: 'left', textDecoration: 'underline', textUnderlineOffset: '3px' }}>{o.StoreName || `ร้าน #${o.StoreId}`}</button>) : (o.StoreName || `ร้าน #${o.StoreId}`)}</td>}
                        <td style={tdStyle}>{o.PaymentMethod || '-'}</td>
                        <td style={{ ...tdRightStyle, color: T.down, fontWeight: 600 }}>
                          {money(o.TotalAmount)} บาท
                        </td>
                        <td style={tdStyle}>
                          {String(o.CancelReason || '').trim() || (<span style={{ color: T.muted }}>{CANCEL_REASON_FALLBACK}</span>)}
                        </td>
                      </tr>

                      {isOpen && (<tr style={trStyle}>
                          <td colSpan={showStore ? 6 : 5} style={{ ...tdStyle, background: T.bg }}>
                            {items.length ? (<div style={cancelItemWrapStyle}>
                                {items.map((it) => (<div key={it.DetailID} style={cancelItemRowStyle}>
                                    <span style={{ color: T.ink, fontWeight: 600 }}>
                                      {it.ProductName || `สินค้า #${it.ProductId}`}
                                    </span>
                                    <span style={{ color: T.muted }}>× {money(it.Qty)}</span>
                                    <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                                      {money2(Number(it.Qty || 0) * Number(it.UnitPrice || 0))} บาท
                                    </span>
                                  </div>))}
                                {o.Note && (<p style={{ ...captionStyle, marginTop: '10px' }}>
                                    หมายเหตุจากลูกค้า: {o.Note}
                                  </p>)}
                              </div>) : (<span style={{ color: T.muted, fontSize: '13px' }}>
                                ออเดอร์นี้ไม่มีรายการอาหารบันทึกไว้
                              </span>)}
                          </td>
                        </tr>)}
                    </React.Fragment>);
            })}

                {!visibleRows.length && (<tr>
                    <td colSpan={showStore ? 6 : 5} style={{ ...tdStyle, textAlign: 'center', color: T.muted }}>
                      ไม่มีออเดอร์ที่ตรงกับเหตุผลที่เลือก
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>

          {rows.length > 8 && (<div style={{ marginTop: '14px', textAlign: 'center' }}>
              <Button variant="ghost" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'ย่อรายการ' : `ดูทั้งหมด ${money(rows.length)} ออเดอร์`}
              </Button>
            </div>)}
        </>)}
    </Card>);
}
// ===== เลือกเป็นเดือน (ใช้กับ Dashboard + ยอดขายรายร้าน และไฟล์ CSV/XLSX ที่ export ตามช่วงนี้) =====
const TH_MONTH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
// เดือน m (1–12) ของปี y -> [วันที่ 1, วันสุดท้าย] ; เดือนปัจจุบันตัดที่วันนี้
function monthRange(y, m) {
    const last = toISODate(new Date(y, m, 0));
    const today = todayISO();
    return [`${y}-${pad2(m)}-01`, last > today ? today : last];
}
// ช่วงวันที่ตรงกับ "ทั้งเดือน" -> "เดือนธันวาคม 2025" ; ไม่ใช่ -> ''
function monthLabelOf(startISO, endISO) {
    if (!startISO || !endISO || startISO.slice(8) !== '01' || startISO.slice(0, 7) !== endISO.slice(0, 7)) return '';
    const [y, m] = startISO.split('-').map(Number);
    const [, end] = monthRange(y, m);
    if (endISO !== end) return '';
    const label = `เดือน${TH_MONTH_FULL[m - 1]} ${y}`;
    return end === todayISO() && end !== toISODate(new Date(y, m, 0)) ? `${label} (ถึงวันนี้)` : label;
}
function StorePeriodPicker({ anchor, setAnchor, days, setDays, custom, setCustom, startDate, setStartDate, endDate, setEndDate }) {
    const [monthMode, setMonthMode] = useState(() => custom && Boolean(monthLabelOf(startDate, endDate)));
    const choosePreset = (value) => { setMonthMode(false); setCustom(false); setDays(value); };
    const chooseMonth = (y, m) => { const [start, end] = monthRange(y, m); setStartDate(start); setEndDate(end); };
    const nowY = Number(todayISO().slice(0, 4));
    const nowM = Number(todayISO().slice(5, 7));
    const pickY = Number(startDate.slice(0, 4)) || nowY;
    const pickM = Number(startDate.slice(5, 7)) || nowM;
    const tab = (active) => ({ padding: '7px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, fontFamily: FONT_STACK, cursor: 'pointer', border: 'none', background: active ? T.surface : 'transparent', color: active ? T.primary : T.muted, boxShadow: active ? '0 1px 3px rgba(18,25,38,.12)' : 'none' });
    const monthSelect = { border: `1px solid ${T.line}`, borderRadius: '7px', background: '#FFFFFF', color: T.ink, fontSize: '12.5px', fontFamily: FONT_STACK, padding: '8px 9px' };
    const inputStyle = { ...dateInputStyle, width: '145px' };
    return (<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', background: T.primarySoft, padding: '4px', borderRadius: T.radiusMd }}>
        {[1, 7, 14, 30].map((v) => (<button key={v} type="button" onClick={() => choosePreset(v)} style={{ padding: '7px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, fontFamily: FONT_STACK, cursor: 'pointer', border: 'none', background: !custom && days === v ? T.surface : 'transparent', color: !custom && days === v ? T.primary : T.muted, boxShadow: !custom && days === v ? '0 1px 3px rgba(18,25,38,.12)' : 'none' }}>{v === 1 ? 'วันนี้' : `${v} วัน`}</button>))}
                <button type="button" onClick={() => { setMonthMode(true); setCustom(true); chooseMonth(nowY, nowM); }} style={tab(custom && monthMode)}>รายเดือน</button>
        <button type="button" onClick={() => { setMonthMode(false); setCustom(true); }} style={tab(custom && !monthMode)}>กำหนดเอง</button>
      </div>
      {custom && monthMode ? (<div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: `1px solid ${T.line}`, borderRadius: T.radiusMd, background: T.surface }}>
        <Icon name="calendar" size={16} color={T.muted}/>
        <select value={pickM} onChange={(e) => chooseMonth(pickY, Number(e.target.value))} style={monthSelect} aria-label="เลือกเดือน">
          {TH_MONTH_FULL.map((name, i) => (<option key={name} value={i + 1} disabled={pickY === nowY && i + 1 > nowM}>{name}</option>))}
        </select>
        <select value={pickY} onChange={(e) => { const y = Number(e.target.value); chooseMonth(y, y === nowY ? Math.min(pickM, nowM) : pickM); }} style={monthSelect} aria-label="เลือกปี">
          {[nowY, nowY - 1, nowY - 2].map((y) => (<option key={y} value={y}>{y}</option>))}
        </select>
      </div>) : custom ? (<div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '8px 10px', border: `1px solid ${T.line}`, borderRadius: T.radiusMd, background: T.surface, boxShadow: '0 1px 2px rgba(42,44,65,0.03)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.text, fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap' }}>
          ตั้งแต่วันที่
          <input type="date" value={startDate} max={endDate || todayISO()} onChange={(e) => { const value = e.target.value || todayISO(); setStartDate(value); if (value > endDate) setEndDate(value); }} style={{ ...inputStyle, width: '136px', minWidth: '136px', boxSizing: 'border-box', padding: '8px 9px', border: `1px solid ${T.line}`, borderRadius: '7px', background: '#FFFFFF', color: T.ink, fontSize: '12.5px' }} aria-label="ตั้งแต่วันที่" />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.text, fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap' }}>
          ถึงวันที่
          <input type="date" value={endDate} min={startDate} max={todayISO()} onChange={(e) => setEndDate(e.target.value || todayISO())} style={{ ...inputStyle, width: '136px', minWidth: '136px', boxSizing: 'border-box', padding: '8px 9px', border: `1px solid ${T.line}`, borderRadius: '7px', background: '#FFFFFF', color: T.ink, fontSize: '12.5px' }} aria-label="ถึงวันที่" />
        </label>
      </div>) : (<div style={dateWrapStyle}><Icon name="calendar" size={16} color={T.muted}/><input type="date" value={anchor} max={todayISO()} onChange={(e) => setAnchor(e.target.value || todayISO())} style={dateInputStyle} aria-label="เลือกวันที่สิ้นสุด" /></div>)}
    </div>);
}
// ===== ยอดขายรายร้าน: เลือกร้าน ดูยอดขาย และอันดับเมนู =====
function StoreSalesPage({ ctx }) {
    const { orders, stores, pushToast, focusStoreId, navigateTo } = ctx;
    const [storeId, setStoreId] = useState(focusStoreId || '');
    const [historyStores, setHistoryStores] = useState([]);
    useEffect(() => {
    callApi(`${ctx.API}/api/stores/history`)
        .then((data) => {
            setHistoryStores(
                Array.isArray(data) ? data : []
            );
        })
        .catch((err) => {
            console.error(
                'โหลดประวัติร้านไม่สำเร็จ:',
                err
            );
            setHistoryStores([]);
        });
}, [ctx.API]);
    useEffect(() => {
        if (focusStoreId) setStoreId(String(focusStoreId));
    }, [focusStoreId]);
    // เมื่อเข้าหน้ายอดขายรายร้านจากการ์ด/รายการทั่วไป ให้กลับไปด้านบนสุด
        useEffect(() => {
        if (!focusStoreId) return undefined;
        const timer = window.setTimeout(() => {
            const main = document.getElementById('executive-main-scroll');
            if (main) main.scrollTo({ top: 0, behavior: 'auto' });
        }, 0);
        return () => window.clearTimeout(timer);
    
    }, [focusStoreId]);
    const [anchor, setAnchor] = useState(todayISO());
    const [days, setDays] = useState(1);
    const [customRange, setCustomRange] = useState(false);
    const [customStart, setCustomStart] = useState(todayISO());
    const [customEnd, setCustomEnd] = useState(todayISO());
    const [salesExportPreview, setSalesExportPreview] = useState(null);
    const [exportExtras, setExportExtras] = useState({ reviews: [], reviewSummary: { total: 0, average: 0 }, issues: [] });
    const store = historyStores.find((s) => String(s.StoreId) === String(storeId)) || null;

    useEffect(() => {
        if (!storeId) {
            setExportExtras({ reviews: [], reviewSummary: { total: 0, average: 0 }, issues: [] });
            return undefined;
        }
        let cancelled = false;
        Promise.all([
            callApi(`${ctx.API}/api/stores/${storeId}/reviews`).catch(() => ({ reviews: [], summary: { total: 0, average: 0 } })),
            callApi(`${ctx.API}/api/reports/issue/store/${storeId}`).catch(() => [])
        ]).then(([reviewData, issueData]) => {
            if (cancelled) return;
            setExportExtras({
                reviews: Array.isArray(reviewData?.reviews) ? reviewData.reviews : [],
                reviewSummary: reviewData?.summary || { total: 0, average: 0 },
                issues: Array.isArray(issueData) ? issueData : []
            });
        });
        return () => { cancelled = true; };
    }, [ctx.API, storeId]);

        // ใช้สถานะจาก backend (ContractState / ContractDaysLeft) ให้ตรงกับหน้าติดตามสัญญาและที่ระบบล็อกจริง
    const salesContractInfo = (selectedStore) => {
        const state = selectedStore?.ContractState;
        const days = selectedStore?.ContractDaysLeft;
        const startText = selectedStore?.ContractStartDate ? String(selectedStore.ContractStartDate).slice(0, 10) : '';
        const endText = selectedStore?.ContractEndDate ? String(selectedStore.ContractEndDate).slice(0, 10) : '';
        if (state === 'NONE' || !endText)
            return { label: 'ยังไม่ระบุสัญญา', tone: 'neutral', detail: 'ยังไม่มีวันสัญญา ร้านเปิดขายไม่ได้' };
        if (state === 'UPCOMING')
            return { label: `ยังไม่เริ่มสัญญา (เริ่ม ${startText})`, tone: 'neutral', detail: 'ร้านยังเปิดขายไม่ได้จนถึงวันเริ่มสัญญา' };
        if (state === 'EXPIRED')
            return { label: `หมดสัญญาแล้ว ${Math.abs(days)} วัน`, tone: 'danger', detail: `หมดเมื่อ ${endText} 23:59 น. กดเพื่อเปิดสัญญารอบใหม่` };
        if (days === 0)
            return { label: 'หมดคืนนี้ 23:59 น.', tone: 'danger', detail: 'ถ้าร้านต่อสัญญาแล้ว ให้แก้วันสิ้นสุดก่อนเวลานี้' };
        if (days <= CONTRACT_SOON_DAYS)
            return { label: `เหลือ ${days} วัน`, tone: 'warn', detail: `ใกล้หมดสัญญา สิ้นสุด ${endText} 23:59 น.` };
        return { label: `เหลือ ${days} วัน`, tone: 'ok', detail: `สัญญามีผลถึง ${endText} 23:59 น.` };
    };

    const selectedContract = store ? salesContractInfo(store) : null;

    const report = useMemo(() => {
        if (!storeId)
            return null;
        const effectiveStart = customRange ? customStart : toISODate(new Date(new Date(`${anchor}T00:00:00`).setDate(new Date(`${anchor}T00:00:00`).getDate() - days + 1)));
        const effectiveEnd = customRange ? customEnd : anchor;
        const effectiveDays = customRange ? rangeDayCount(customStart, customEnd) : days;
        const bounds = customRange ? customPeriodBounds(customStart, customEnd) : periodBounds(anchor, days);
        const prevBounds = customRange ? previousBoundsForRange(customStart, customEnd) : previousBounds(anchor, days);
        const current = orders.filter((o) => inRange(o, bounds, storeId));
        const previous = orders.filter((o) => inRange(o, prevBounds, storeId));
        const now = summarize(current);
        const before = summarize(previous);
        return {
            now,
            before, current,
            hasPreviousData: previous.length > 0,
            buckets: customRange
                ? buildBucketsForRange(now.settled, customStart, customEnd)
                : buildBuckets(now.settled, anchor, days),
        };
    }, [orders, storeId, anchor, days, customRange, customStart, customEnd]);
    const effectiveStart = customRange ? customStart : toISODate(new Date(new Date(`${anchor}T00:00:00`).setDate(new Date(`${anchor}T00:00:00`).getDate() - days + 1)));
    const effectiveEnd = customRange ? customEnd : anchor;
    const effectiveDays = customRange ? rangeDayCount(customStart, customEnd) : days;
    const periodLabel = customRange ? monthLabelOf(customStart, customEnd) || `${thaiDate(customStart)} – ${thaiDate(customEnd)}` : days === 1 ? `วันที่ ${thaiDate(anchor)}` : `${days} วันย้อนหลังถึง ${thaiDate(anchor)}`;
    const compareLabel = customRange ? `เทียบ ${effectiveDays} วันก่อนหน้า` : days === 1 ? 'เทียบเมื่อวาน' : `เทียบ ${days} วันก่อนหน้า`;
    const exportDateBounds = customRange
    ? customPeriodBounds(customStart, customEnd)
    : periodBounds(anchor, days);

    const exportReviews = exportExtras.reviews.filter((r) => {
        const at = parseOrderDate(r.CreatedAt);
        return at && at >= exportDateBounds.start && at < exportDateBounds.end;
    });

    const exportIssues = exportExtras.issues.filter((r) => {
        const at = parseOrderDate(r.CreatedAt);
        return at && at >= exportDateBounds.start && at < exportDateBounds.end;
    });

    const exportReviewAverage = exportReviews.length
        ? exportReviews.reduce((sum, r) => sum + Number(r.Rating || 0), 0) / exportReviews.length
        : 0;
    const salesTimelineRows = !report ? [] : (customRange ? effectiveDays : days) === 1
    ? Array.from({ length: 24 }, (_, h) => {
        const bucketOrders = report.current.filter(o => { const at = parseOrderDate(o.CreatedAt); return at && at.getHours() === h; }), summary = summarize(bucketOrders);
        return { key: `h${h}`, label: `${pad2(h)}:00`, completedCount: summary.completedCount, cancelledCount: summary.cancelledCount, grossSales: summary.grossSales, netSales: summary.sales, cancelRate: summary.cancelRate === null ? 'N/A' : `${summary.cancelRate.toFixed(1)}%` };
    })
    : (report?.buckets || []).map(b => {
        const bucketOrders = report.current.filter(o => { const at = parseOrderDate(o.CreatedAt); return at && b.key === toISODate(at); }), summary = summarize(bucketOrders);
        return { key: b.key, label: b.label, completedCount: summary.completedCount, cancelledCount: summary.cancelledCount, grossSales: summary.grossSales, netSales: summary.sales, cancelRate: summary.cancelRate === null ? 'N/A' : `${summary.cancelRate.toFixed(1)}%` };
    });
    const salesExportRows = () => [ [(customRange ? effectiveDays : days) === 1
        ? 'ช่วงเวลา'
        : 'วันที่',
        'ออเดอร์สำเร็จ',
        'ออเดอร์ที่ยกเลิก',
        'ยอดขายก่อนหักยกเลิก (บาท)',
        'ยอดขายสุทธิ (บาท)',
        'อัตราการยกเลิก'],
    ...salesTimelineRows.map((row) => [
        (customRange ? effectiveDays : days) === 1 ? 
        row.label : row.key,  // รายวัน: วันที่เต็ม 2026-10-01 กัน Excel สลับวัน/เดือน
        row.completedCount,
        row.cancelledCount,
        Math.round(row.grossSales),
        Math.round(row.netSales),
        row.cancelRate ]),[],

    ['สรุปข้อมูลเพิ่มเติม', 'ค่า'],
    [
        'คะแนนรีวิวเฉลี่ย',
        exportReviews.length
            ? Number(exportReviewAverage.toFixed(1))
            : 'N/A'
    ],
    ['จำนวนรีวิว', exportReviews.length],
    ['จำนวนรายงานปัญหา', exportIssues.length]
];
    const handleCsv = () => {
        if (!report || !store) return;
        exportCsv(`onlyfoods-${store.StoreName}-${customRange ? `${customStart}-to-${customEnd}` : `${anchor}-${days}d`}.csv`, salesExportRows());
        setSalesExportPreview(null);
        pushToast('บันทึกไฟล์ CSV เรียบร้อยแล้ว');
    };
    const handleXlsx = () => {
    if (!report || !store) return;

    const summaryRows = [
        ['ตัวชี้วัด', 'ค่า'],
        ['ร้านค้า', store.StoreName],
        ['ช่วงข้อมูล', periodLabel],
        ['ออกรายงานเมื่อ', nowStamp()],
        ['ยอดขายสุทธิ (บาท)', Math.round(report.now.sales)],
        ['มูลค่าออเดอร์รวมก่อนหักยกเลิก (บาท)', Math.round(report.now.grossSales)],
        ['ออเดอร์สำเร็จ', report.now.completedCount],
        ['ออเดอร์ยกเลิก', report.now.cancelledCount],
        ['อัตราการยกเลิก (%)', report.now.cancelRate === null  ? 'N/A' : Number(report.now.cancelRate.toFixed(1)) ],
        ['คะแนนรีวิวเฉลี่ย', Number(exportReviewAverage.toFixed(1))],
        ['จำนวนรีวิว', exportReviews.length],
        ['จำนวนรายงานปัญหา', exportIssues.length]
    ];

    const menuRows = [
        ['เมนู', 'จำนวนที่ขายได้', 'ยอดขาย (บาท)', 'สัดส่วนของยอดร้าน (%)'],
        ...summarizeMenus(report.now.settled).map((m) => [
            m.name,
            m.qty,
            Math.round(m.amount),
            Number(m.share.toFixed(1))
        ])
    ];

    const timelineRows = [
    [
        (customRange ? effectiveDays : days) === 1
            ? 'ช่วงเวลา'
            : 'วันที่',
        'ออเดอร์สำเร็จ',
        'ออเดอร์ยกเลิก',
        'ยอดขายก่อนหักยกเลิก (บาท)',
        'ยอดขายสุทธิ (บาท)',
        'อัตราการยกเลิก'
    ],

    ...salesTimelineRows.map((row) => [
        row.label,
        row.completedCount,
        row.cancelledCount,
        Math.round(row.grossSales),
        Math.round(row.netSales),
        row.cancelRate
    ])
];

    const reviewRows = [
        ['วันที่', 'คะแนน', 'ผู้รีวิว', 'ความคิดเห็น'],
        ...[...exportReviews]
            .sort((a, b) =>
                (parseOrderDate(b.CreatedAt)?.getTime() || 0) -
                (parseOrderDate(a.CreatedAt)?.getTime() || 0)
            )
            .map((r) => [
                thaiDateTime(r.CreatedAt),
                Number(r.Rating || 0),
                r.ReviewerName || 'ลูกค้าไม่ระบุชื่อ',
                r.Comment || '-'
            ])
    ];

    const issueRows = [
        ['วันที่', 'ประเภทปัญหา', 'ลูกค้า', 'ออเดอร์/คิว', 'รายละเอียด'],
        ...[...exportIssues]
            .sort((a, b) =>
                (parseOrderDate(b.CreatedAt)?.getTime() || 0) -
                (parseOrderDate(a.CreatedAt)?.getTime() || 0)
            )
            .map((r) => [
                thaiDateTime(r.CreatedAt),
                r.IssueType || 'ไม่ระบุประเภท',
                r.CustomerName || 'ลูกค้าไม่ระบุชื่อ',
                r.QueueNo
                    ? `คิว ${r.QueueNo}`
                    : r.OrderID
                        ? `Order #${r.OrderID}`
                        : '-',
                r.Description || '-'
            ])
    ];

    exportXlsx(
        `onlyfoods-${store.StoreName}-${customRange ? `${customStart}-to-${customEnd}` : `${anchor}-${days}d`}.xlsx`,
        [
            {
                name: 'สรุปรายงาน',
                rows: summaryRows,
                widths: [42, 38]
            },
            {
                name: 'ยอดขายตามเมนู',
                rows: menuRows,
                widths: [36, 18, 20, 24]
            },
            {
                name: 'ยอดขายตามเวลา',
                rows: timelineRows,
                widths: [20, 20, 16]
            },
            {
                name: 'รีวิวลูกค้า',
                rows: reviewRows,
                widths: [24, 12, 28, 60]
            },
            {
                name: 'รายงานปัญหา',
                rows: issueRows,
                widths: [24, 26, 28, 20, 60]
            }
        ]
    );

    setSalesExportPreview(null);
    pushToast('บันทึกไฟล์ XLSX เรียบร้อยแล้ว');
};
    return (<>
      <Card style={{ marginBottom: '16px', zIndex: 40 }}>
        <div style={toolbarStyle}>
          <div style={{ minWidth: '240px', flex: 1 }}>
            <h3 style={h3Style}>เลือกร้านค้า</h3>
            <SearchableStorePicker stores={historyStores} value={storeId} onChange={setStoreId}/>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>

            <Button variant="ghost" icon="download" onClick={() => setSalesExportPreview('csv')} disabled={!storeId}>
              CSV
            </Button>
            <Button variant="dark" icon="download" onClick={() => setSalesExportPreview('xlsx')} disabled={!storeId}>
              XLSX
            </Button>
          </div>
        </div>
      </Card>

      {!storeId && (<Card>
          <EmptyState text="เลือกร้านจากช่องด้านบนเพื่อดูยอดขายและเมนูของร้านนั้น"/>
        </Card>)}

      {storeId && report && store && (<>
          <Card style={{ marginBottom: '16px' }}>
            <div style={toolbarStyle}>
              <div>
                <h3 style={h3Style}>{store.StoreName}{Boolean(store?.IsDeleted) && (<span style={{
                  marginLeft: '8px',fontSize: '12px', fontWeight: 700,color: '#E2452F' }} > (ร้านถูกลบแล้ว) </span> )}
                  </h3>
                <p style={captionStyle}>{periodLabel}</p>
              </div> 
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
              {!Boolean(store?.IsDeleted) && (
                <Button
                  variant="ghost"
                  icon="edit"
                  onClick={() => navigateTo('store-manage', store.StoreId)}
                  title="ไปหน้าจัดการร้านค้านี้"
                  style={{ padding: '7px 12px' }}
                >
                  จัดการร้านค้า
                </Button> )}
                                {store.ContractState === 'EXPIRED' ? (
                  <Badge tone="danger">หมดสัญญา</Badge>
                ) : (
                  <Badge tone={store.IsOpen ? 'ok' : 'neutral'}>
                    {store.IsOpen ? 'เปิดร้าน' : 'ปิดร้าน'}
                  </Badge>
                )}
                
                {Boolean(store?.IsDeleted) ? (
  <Badge tone="danger">
    ร้านถูกลบแล้ว
  </Badge>
) : (
  <>
        {(store.IsSuspended || store.ContractState !== 'EXPIRED') && (
      <Badge tone={store.IsSuspended ? 'danger' : 'ok'}>
        {store.IsSuspended ? 'ถูกระงับสิทธิ์' : 'สิทธิ์ปกติ'}
      </Badge>
    )}

    {selectedContract && (
      <button
        type="button"
        onClick={() => navigateTo('contract-tracking', store.StoreId)}
                title={`${selectedContract.detail} · ไปจัดการสัญญาร้านนี้`}
        style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: FONT_STACK }}
      >
        <Badge tone={selectedContract.tone}>
          สัญญา: {selectedContract.label} · จัดการ →
        </Badge>
      </button>
    )}
  </>
)}
              </div>
            </div>
          </Card>

          {isCancelAlert(report.now.cancelRate) && (<AlertBanner style={{ marginBottom: '16px' }}>
            อัตรายกเลิกของร้านนี้ {report.now.cancelRate.toFixed(1)}% เกินเกณฑ์ {CANCEL_ALERT_RATE}% ในช่วงที่เลือก ({money(report.now.cancelledCount)} จาก {money(report.now.cancelledCount + report.now.completedCount)} ออเดอร์)
          </AlertBanner>)}

          <div className="of-kpi-hero">
            <KpiCard label="ยอดขายสุทธิ" value={money(report.now.sales)} unit="บาท" delta={changePct(report.now.sales, report.before.sales)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} highlight icon="trend"/>
            <KpiCard label="ออเดอร์สำเร็จ" value={money(report.now.completedCount)} unit="ออเดอร์" delta={changePct(report.now.completedCount, report.before.completedCount)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} variant="blue" icon="check"/>
          </div>

          <div className="of-store-kpi-small">
            <KpiCard size="sm" label="มูลค่าออเดอร์รวมก่อนหักยกเลิก" value={money(report.now.grossSales)} unit="บาท" delta={changePct(report.now.grossSales, report.before.grossSales)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} icon="trend" tone="blue"/>
            <KpiCard size="sm" label="ออเดอร์ยกเลิก" value={money(report.now.cancelledCount)} unit="ออเดอร์" delta={changePct(report.now.cancelledCount, report.before.cancelledCount)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} icon="ban" tone="amber" invertDelta/>
            <KpiCard size="sm" label="อัตราการยกเลิก" value={report.now.cancelRate === null ? 'N/A' : `${report.now.cancelRate.toFixed(1)}%`} delta={ report.now.cancelRate !== null && report.before.cancelRate !== null  ? report.now.cancelRate - report.before.cancelRate : null } deltaSuffix=" จุดเปอร์เซ็นต์" deltaLabel="" hasPreviousData={report.hasPreviousData} hint={report.now.cancelRate === null ? 'ไม่มีออเดอร์ในช่วงนี้' : undefined} icon="info" tone="amber" invertDelta />
          </div>

          <Card style={{ marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ color: T.muted, fontSize: '14px', fontWeight: 500 }}>
                  {(customRange ? effectiveDays : days) === 1 ? 'แนวโน้มยอดขายรายชั่วโมง' : 'แนวโน้มยอดขายรายวัน'}
                </div>
                <StorePeriodPicker anchor={anchor} setAnchor={setAnchor} days={days} setDays={setDays} custom={customRange} setCustom={setCustomRange} startDate={customStart} setStartDate={setCustomStart} endDate={customEnd} setEndDate={setCustomEnd}/>
              </div>
              <h3 style={{ margin: '6px 0 0', fontSize: '24px', fontWeight: 700, color: T.ink }}>
                {money(report.now.sales)} บาท
              </h3>
              <p style={captionStyle}>ชี้ที่จุดบนกราฟเพื่อดูยอดขายของช่วงเวลานั้น</p>
            </div>
            <SalesLineChart buckets={report.buckets} showStoreDetail={false}/>
          </Card>

          {/* PO: เจ้าของโรงอาหารไม่ต้องการดูอันดับเมนูขายดี/ขายน้อย จึงไม่แสดงการ์ดอันดับเมนู */}
          <div style={{ display: 'grid', gap: '16px', marginTop: '16px' }}>
            <CancelledOrdersCard cancelled={report.now.cancelled} periodLabel={`${store.StoreName} · ${periodLabel}`} showStore={false} style={{ marginTop: 0 }}/>
            <StoreReviewSection ctx={ctx} storeId={storeId}/>
            <div id="store-issue-reports" style={{ scrollMarginTop: '20px' }}>
              <StoreIssueReportSection ctx={ctx} storeId={storeId}/>
            </div>
          </div>
        </>)}

      <Modal open={Boolean(salesExportPreview && report && store)} title={`พรีวิวก่อนบันทึก ${String(salesExportPreview || '').toUpperCase()}`} subtitle={store ? `รายงานยอดขายร้าน ${store.StoreName} · ${periodLabel}` : ''} onClose={() => setSalesExportPreview(null)} width={900} footer={<>
        <Button variant="ghost" onClick={() => setSalesExportPreview(null)}>ยกเลิก</Button>
        <Button variant={salesExportPreview === 'xlsx' ? 'dark' : 'primary'} icon="download" onClick={salesExportPreview === 'xlsx' ? handleXlsx : handleCsv}>บันทึก {String(salesExportPreview || '').toUpperCase()}</Button>
      </>}>
        {report && store && (<div style={{ display: 'grid', gap: '16px' }}>
  {salesExportPreview === 'csv' ? (<>
    <div>
      <div style={{ ...captionStyle, color: T.text, fontWeight: 700, marginBottom: '8px' }}>{(customRange ? effectiveDays : days) === 1 ?
       'ตัวอย่างยอดขายตามช่วงเวลา' : 'ตัวอย่างยอดขายตามวันที่'}</div>
      <div style={{ overflowX: 'auto', border: `1px solid ${T.line}`, borderRadius: T.radiusMd }}>
        <table style={tableStyle}>
          <thead><tr>
            <th style={thStyle}>{(customRange ? effectiveDays : days) === 1 ? 'ช่วงเวลา' : 'วันที่'}</th>
            <th style={thRightStyle}>ออเดอร์สำเร็จ</th>
            <th style={thRightStyle}>ออเดอร์ที่ยกเลิก</th>
            <th style={thRightStyle}>ยอดขายก่อนหักยกเลิก</th>
            <th style={thRightStyle}>ยอดขายสุทธิ</th>
            <th style={thRightStyle}>อัตราการยกเลิก</th>
          </tr></thead>
          <tbody>{salesTimelineRows.slice(0, 8).map((row) => (
            <tr key={row.key} style={trStyle}>
              <td style={tdStyle}>{row.label}</td>
              <td style={tdRightStyle}>{money(row.completedCount)}</td>
              <td style={tdRightStyle}>{money(row.cancelledCount)}</td>
              <td style={tdRightStyle}>{money(row.grossSales)} บาท</td>
              <td style={tdRightStyle}>{money(row.netSales)} บาท</td>
              <td style={tdRightStyle}>{row.cancelRate}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>

    <div style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, overflow: 'hidden' }}>
      <table style={tableStyle}>
        <thead><tr><th style={thStyle}>สรุปข้อมูลเพิ่มเติม</th><th style={thRightStyle}>ค่า</th></tr></thead>
        <tbody>
          <tr style={trStyle}><td style={tdStyle}>คะแนนรีวิวเฉลี่ย</td><td style={tdRightStyle}>{exportReviews.length ? `${exportReviewAverage.toFixed(1)} / 5` : 'N/A'}</td></tr>
          <tr style={trStyle}><td style={tdStyle}>จำนวนรีวิว</td><td style={tdRightStyle}>{money(exportReviews.length)} รีวิว</td></tr>
          <tr style={trStyle}><td style={tdStyle}>จำนวนรายงานปัญหา</td><td style={tdRightStyle}>{money(exportIssues.length)} รายการ</td></tr>
        </tbody>
      </table>
    </div>
  </>) : (<>
    {salesExportPreview === 'xlsx' && (
      <div style={{ padding: '12px 14px', borderRadius: T.radiusMd, background: T.bg, color: T.text, fontSize: '13px', lineHeight: 1.7 }}>
        ไฟล์ Excel จะแยกข้อมูลเป็น 5 Sheet:
        <strong> สรุปรายงาน · ยอดขายตามเมนู · ยอดขายตามเวลา · รีวิวลูกค้า · รายงานปัญหา</strong>
      </div>
    )}

    <div style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, overflow: 'hidden' }}>
      <table style={tableStyle}>
        <thead><tr><th style={thStyle}>ตัวชี้วัด</th><th style={thRightStyle}>ค่า</th></tr></thead>
        <tbody>{[
          ['ยอดขายสุทธิ', `${money(report.now.sales)} บาท`],
          ['มูลค่าออเดอร์รวมก่อนหักยกเลิก', `${money(report.now.grossSales)} บาท`],
          ['ออเดอร์สำเร็จ', `${money(report.now.completedCount)} ออเดอร์`],
          ['ออเดอร์ยกเลิก', `${money(report.now.cancelledCount)} ออเดอร์`],
          ['อัตราการยกเลิก', report.now.cancelRate === null ? 'N/A' : `${report.now.cancelRate.toFixed(1)}%`],
          ['คะแนนรีวิวเฉลี่ย', `${exportReviewAverage.toFixed(1)} / 5`],
          ['จำนวนรีวิว', `${money(exportReviews.length)} รีวิว`],
          ['จำนวนรายงานปัญหา', `${money(exportIssues.length)} รายการ`]
        ].map(([label, value]) => (
          <tr key={label} style={trStyle}><td style={tdStyle}>{label}</td><td style={tdRightStyle}>{value}</td></tr>
        ))}</tbody>
      </table>
    </div>

    <div>
      <div style={{ ...captionStyle, color: T.text, fontWeight: 700, marginBottom: '8px' }}>ตัวอย่างยอดขายตาม{(customRange ? effectiveDays : days) === 1 ? 'ช่วงเวลา' : 'วันที่'}</div>
      <div style={{ overflowX: 'auto', border: `1px solid ${T.line}`, borderRadius: T.radiusMd }}>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>{(customRange ? effectiveDays : days) === 1 ? 'ช่วงเวลา' : 'วันที่'}</th><th style={thRightStyle}>ยอดขาย</th><th style={thRightStyle}>ออเดอร์</th></tr></thead>
          <tbody>{report.buckets.slice(0, 8).map((b) => (
            <tr key={b.key} style={trStyle}><td style={tdStyle}>{b.label}</td><td style={tdRightStyle}>{money(b.sales)} บาท</td><td style={tdRightStyle}>{money(b.count)}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>

    <div style={{ ...captionStyle, color: T.text }}>ไฟล์จริงมีตารางเมนูขาย, ยอดขายตามเวลา, รีวิวจากลูกค้า และรายงานปัญหาจากลูกค้า โดยไม่มีคอลัมน์เทียบช่วงก่อนหน้า</div>
  </>)}</div>)} </Modal>
</>);
}
const EMPTY_STORE_FORM = {
    StoreId: null,
    name: '',
    queueCode: '',
    category: '',
    contactName: '',
    phone: '',
    lineId: '',
    email: '',
    description: '',
    imageData: '',
    imageName: '',
    contractStartDate: '',
    contractDuration: '',
    contractEndDate: '',
    ownerUsername: '',
    ownerPassword: '',
    ownerConfirm: ''
};
function looksLikeGarbage(value) {
    const compact = String(value || '').trim().replace(/\s/g, '');
    if (compact.length < 2)
        return false;
    if (/^(.)\1+$/.test(compact))
        return true;
    if (/^\d+$/.test(compact) && compact.length >= 4) {
        const digits = compact.split('').map(Number);
        const ascending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
        const descending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);
        if (ascending || descending)
            return true;
    }
    return false;
}
const EMAIL_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
// รหัสผ่าน: ต้องตรงกับ backend (config.MIN_PASSWORD_LENGTH = 8 ; bcrypt รับได้ไม่เกิน 72)
const STORE_PASSWORD_MIN = 8;
const STORE_PASSWORD_MAX = 72;
// เบอร์ร้าน: ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0 (พิมพ์ขีด/เว้นวรรคมาได้) -> ข้อความผิด หรือ '' ถ้าถูก
// ใช้ทั้งฟอร์มเพิ่มร้าน และตอนแก้เบอร์ในหน้าดู/แก้ไขร้าน (backend ตรวจซ้ำด้วย utils.validate_phone)
function storePhoneError(value) {
    const phone = String(value || '').replace(/[\s-]/g, '');
    if (!phone) return 'กรุณากรอกเบอร์โทรติดต่อ';
    if (!/^0\d{8,9}$/.test(phone)) return 'เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก และขึ้นต้นด้วย 0';
    if (looksLikeGarbage(phone)) return 'เบอร์โทรนี้ไม่ถูกต้อง';
    return '';
}
function validateStoreForm(form, mode = 'create') {
    const errors = {};
    if (form.queueCode && !/^[A-Za-z]{1,2}$/.test(form.queueCode.trim()))
        errors.queueCode = 'ตัวอักษรคิวต้องเป็นภาษาอังกฤษ A-Z 1-2 ตัว เช่น A หรือ AB';
    const name = form.name.trim();
    if (!name)
        errors.name = 'กรุณากรอกชื่อร้านค้า';
    else if (name.length < 2)
        errors.name = 'ชื่อร้านต้องมีอย่างน้อย 2 ตัวอักษร';
    else if (name.length > 100)
        errors.name = 'ชื่อร้านต้องไม่เกิน 100 ตัวอักษร';
    else if (/^[\d\s\-_.]+$/.test(name))
        errors.name = 'ชื่อร้านต้องไม่ใช่ตัวเลขหรือสัญลักษณ์ล้วน';
    if (!form.category)
        errors.category = 'กรุณาเลือกประเภทอาหาร';
    const contactName = form.contactName.trim();
    if (!contactName) {
        errors.contactName = 'กรุณากรอกชื่อผู้ติดต่อ';
    }
    else if (contactName.length < 2) {
        errors.contactName = 'ชื่อผู้ติดต่อสั้นเกินไป';
    }
    else if (contactName.length > 60) {
        errors.contactName = 'ชื่อผู้ติดต่อต้องไม่เกิน 60 ตัวอักษร';
    }
    else if (/^[\d\s\-_.]+$/.test(contactName) || looksLikeGarbage(contactName)) {
        errors.contactName = 'กรุณากรอกชื่อผู้ติดต่อจริง ไม่ใช่ตัวเลขหรือข้อความมั่ว';
    }
        const phoneError = storePhoneError(form.phone);
    if (phoneError)
        errors.phone = phoneError;

        // LINE และอีเมลไม่บังคับ : ตรวจเฉพาะตอนกรอกมา
    const lineId = form.lineId.trim();
    if (lineId) {
        if (/\s/.test(lineId))
            errors.lineId = 'LINE ID ห้ามมีช่องว่าง';
        else if (lineId.replace(/^@/, '').length < 2)
            errors.lineId = 'LINE ID สั้นเกินไป';
        else if (lineId.length > 30)
            errors.lineId = 'LINE ID ต้องไม่เกิน 30 ตัวอักษร';
        else if (looksLikeGarbage(lineId.replace(/^@/, '')))
            errors.lineId = 'กรุณากรอก LINE ID ที่ถูกต้อง ไม่ใช่ข้อความมั่ว';
    }
    const email = form.email.trim();
    if (email) {
        if (!EMAIL_RE.test(email))
            errors.email = 'รูปแบบอีเมลไม่ถูกต้อง เช่น shop@example.com';
        else if (looksLikeGarbage(email.split('@')[0]))
            errors.email = 'กรุณากรอกอีเมลที่ถูกต้อง ไม่ใช่ข้อความมั่ว';
    }
    if (form.description.trim().length > 300) {
        errors.description = 'คำอธิบายต้องไม่เกิน 300 ตัวอักษร';
    }
    if (!form.contractStartDate)
        errors.contractStartDate = 'กรุณาเลือกวันที่เริ่มสัญญา';
    if (!form.contractDuration)
        errors.contractDuration = 'กรุณาเลือกระยะเวลาสัญญา';
    if (!form.contractEndDate)
        errors.contractEndDate = 'กรุณาระบุวันที่สิ้นสุดสัญญา';
    if (form.contractStartDate && form.contractEndDate && form.contractEndDate < form.contractStartDate)
        errors.contractEndDate = 'วันที่สิ้นสุดสัญญาต้องไม่น้อยกว่าวันที่เริ่มสัญญา';
    // ช่องวันที่เป็นปี ค.ศ. : กันพิมพ์ปี พ.ศ. (เช่น 2569)
    if (Number(String(form.contractStartDate || '').slice(0, 4)) > 2400)
        errors.contractStartDate = 'กรุณาระบุปีเป็น ค.ศ. (เช่น 2026 ไม่ใช่ 2569)';
    if (Number(String(form.contractEndDate || '').slice(0, 4)) > 2400)
        errors.contractEndDate = 'กรุณาระบุปีเป็น ค.ศ. (เช่น 2026 ไม่ใช่ 2569)';

    if (mode === 'create') {
        const ownerUsername = String(form.ownerUsername || '').trim();
        const ownerPassword = String(form.ownerPassword || '');
        const ownerConfirm = String(form.ownerConfirm || '');
        if (!ownerUsername)
            errors.ownerUsername = 'กรุณากรอกชื่อผู้ใช้';
        else if (!/^[a-zA-Z0-9_]{4,20}$/.test(ownerUsername))
            errors.ownerUsername = 'ใช้ได้เฉพาะ a-z, 0-9 และ _ ความยาว 4–20 ตัว';
        if (!ownerPassword)
            errors.ownerPassword = 'กรุณากรอกรหัสผ่าน';
        else if (ownerPassword.length < STORE_PASSWORD_MIN)
            errors.ownerPassword = `รหัสผ่านต้องยาวอย่างน้อย ${STORE_PASSWORD_MIN} ตัวอักษร`;
        else if (ownerPassword.length > STORE_PASSWORD_MAX)
            errors.ownerPassword = `รหัสผ่านต้องไม่เกิน ${STORE_PASSWORD_MAX} ตัวอักษร`;
        else if (/\s/.test(ownerPassword))
            errors.ownerPassword = 'รหัสผ่านห้ามมีช่องว่าง';
        if (ownerConfirm !== ownerPassword)
            errors.ownerConfirm = 'ยืนยันรหัสผ่านไม่ตรงกัน';
    }
    return errors;
}

// ===== ชิ้นส่วนฟอร์มร้านค้า =====
function FormSectionTitle({ icon, children }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', margin: '20px 0 12px', color: T.muted, fontSize: '13px', fontWeight: 600 }}>
            <Icon name={icon} size={16} color={T.primary}/>
            {children}
        </div>
    );
}

function IconInput({ icon, style, ...props }) {
    return (
        <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: T.muted, display: 'grid', pointerEvents: 'none' }}>
                <Icon name={icon} size={16}/>
            </span>
            <input {...props} style={{ ...inputStyle, paddingLeft: '38px', ...style }}/>
        </div>
    );
}

// 0812345678 -> 081-234-5678 ; 021234567 -> 02-123-4567
function formatPhone(value) {
    const d = String(value || '').replace(/\D/g, '');
    if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    if (/^0\d{8}$/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return value || '';
}

function PasswordField({ value, onChange, show, onToggle, placeholder }) {
    return (
        <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: T.muted, display: 'grid', pointerEvents: 'none' }}>
                <Icon name="lock" size={16}/>
            </span>
            <input type={show ? 'text' : 'password'} value={value} onChange={onChange} maxLength={STORE_PASSWORD_MAX} autoComplete="new-password" placeholder={placeholder} style={{ ...inputStyle, paddingLeft: '38px', paddingRight: '44px' }}/>
            <button type="button" onClick={onToggle} tabIndex={-1} aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', padding: '6px', cursor: 'pointer', color: T.muted, display: 'grid', placeItems: 'center' }}>
                <Icon name={show ? 'eyeOff' : 'eye'} size={17}/>
            </button>
        </div>
    );
}

function PasswordChecklist({ password, confirm }) {
    const checks = [
        [password.length >= STORE_PASSWORD_MIN, `อย่างน้อย ${STORE_PASSWORD_MIN} ตัวอักษร`],
        [password.length > 0 && !/\s/.test(password), 'ไม่มีช่องว่าง'],
        [password.length > 0 && password === confirm, 'ยืนยันรหัสผ่านตรงกัน']
    ];
    return (
        <div style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap', margin: '-4px 0 6px' }}>
            {checks.map(([ok, label]) => (
                <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: ok ? T.up : T.muted }}>
                    <Icon name={ok ? 'check' : 'info'} size={13}/>
                    {label}
                </span>
            ))}
        </div>
    );
}

// การ์ดตำแหน่งเจ้าของร้าน (เลือกไว้แล้ว)
function OwnerRoleCard() {
    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '14px', border: `1.5px solid ${T.primary}`, background: T.primarySoft, marginBottom: '14px' }}>
            <span style={{ width: '40px', height: '40px', borderRadius: '10px', background: T.surface, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name="store" size={20} color={T.primary}/>
            </span>
            <span style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', color: T.ink, fontSize: '14px', fontWeight: 700 }}>เจ้าของร้าน</strong>
                <span style={{ ...captionStyle, display: 'block' }}>จัดการเมนู พนักงาน และดูยอดขายของร้านนี้</span>
            </span>
            <span style={{ position: 'absolute', top: '10px', right: '10px', width: '20px', height: '20px', borderRadius: '50%', background: T.primary, display: 'grid', placeItems: 'center' }}>
                <Icon name="check" size={12} color="#FFFFFF" strokeWidth={3}/>
            </span>
        </div>
    );
}

// ===== ครอปรูปหน้าร้านก่อนนำไปบันทึก =====
function StoreImageCropModal({ open, imageSrc, fileName, onCancel, onConfirm }) {
    const [crop, setCrop] = useState({ x: 0, y: 0 }), [zoom, setZoom] = useState(1), [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    useEffect(() => {
        if (!open) return;
        setCrop({ x: 0, y: 0 }); setZoom(1); setCroppedAreaPixels(null);
    }, [open, imageSrc]);

    if (!open || !imageSrc) return null;

    const applyCrop = async () => {
        if (!croppedAreaPixels) return;
        try {
            const image = new Image(); image.src = imageSrc;
            await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });

            const sourceCanvas = document.createElement('canvas'), sourceCtx = sourceCanvas.getContext('2d');
            if (!sourceCtx) return;
            sourceCanvas.width = croppedAreaPixels.width; sourceCanvas.height = croppedAreaPixels.height;
            sourceCtx.imageSmoothingEnabled = true; sourceCtx.imageSmoothingQuality = 'high';
            sourceCtx.drawImage(image, croppedAreaPixels.x, croppedAreaPixels.y, croppedAreaPixels.width, croppedAreaPixels.height, 0, 0, croppedAreaPixels.width, croppedAreaPixels.height);

            const outputCanvas = document.createElement('canvas'), outputCtx = outputCanvas.getContext('2d');
            if (!outputCtx) return;
            outputCanvas.width = 1280; outputCanvas.height = 720;
            outputCtx.imageSmoothingEnabled = true; outputCtx.imageSmoothingQuality = 'high';
            outputCtx.drawImage(sourceCanvas, 0, 0, 1280, 720);

            const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.94);
            const safeName = String(fileName || 'store-image').replace(/\.[^.]+$/, '') + '-cropped.jpg';
            onConfirm(dataUrl, safeName);
        } catch (error) { console.error('Crop image error:', error); }
    };

    return (
        <Modal open={open} title="ครอปรูปหน้าร้าน" subtitle="เลื่อนและซูมรูปให้ส่วนที่ต้องการอยู่ในกรอบ" onClose={onCancel} width={720}
            footer={<>
                <Button variant="ghost" onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(1); }} style={{ marginRight: 'auto' }}>รีเซ็ต</Button>
                <Button variant="ghost" onClick={onCancel}>ยกเลิก</Button>
                <Button icon="check" onClick={applyCrop}>ใช้รูปนี้</Button>
            </>}
        >
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', maxHeight: '430px', background: '#11131A', borderRadius: T.radiusMd, overflow: 'hidden' }}>
                <Cropper image={imageSrc} crop={crop} zoom={zoom} minZoom={0.5}   maxZoom={3} aspect={16 / 9} showGrid={false} onCropChange={setCrop} onCropComplete={(croppedArea, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)} onZoomChange={setZoom} />
            </div>

            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Button variant="ghost" onClick={() => setZoom(prev => Math.max(0.5, Number((prev - 0.1).toFixed(1))))}>−</Button>
                <input type="range" min={0.5} max={3} step={0.1} value={zoom} onChange={e => setZoom(Number(e.target.value))} style={{ flex: 1, minWidth: 0 }} />
                <Button variant="ghost" onClick={() => setZoom(prev => Math.min(3, Number((prev + 0.1).toFixed(1))))}>+</Button>
                <span style={{ minWidth: '48px', textAlign: 'right', color: T.muted, fontSize: '12px' }}>{Math.round(zoom * 100)}%</span>
            </div>

            <div style={{ marginTop: '10px', color: T.muted, fontSize: '12px', textAlign: 'center' }}>
                ลากรูปเพื่อจัดตำแหน่ง · ใช้สองนิ้วเพื่อซูมบนมือถือและ iPad
            </div>
        </Modal>
    );
}

// ===== ฟอร์มเพิ่ม/แก้ไขข้อมูลร้านค้า =====
function StoreFormModal({ open, mode, form, setForm, errors, setErrors, onClose, onSubmit, saving }) {
    const isCompact = useIsNarrow(700);
    const fileInputRef = useRef(null);
    const [dragOver, setDragOver] = useState(false);
    const [cropSource, setCropSource] = useState('');
    const [cropFileName, setCropFileName] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const calculateContractEnd = (startISO, duration) => {
        if (!startISO || !duration || duration === 'custom')
            return '';
        const [year, month, day] = startISO.split('-').map(Number);
        if (!year || !month || !day)
            return '';
        const monthsToAdd = {
            '6m': 6,
            '1y': 12,
            '2y': 24,
            '3y': 36
        }[duration];
        if (!monthsToAdd)
            return '';

        const targetMonthIndex = (month - 1) + monthsToAdd;
        const targetYear = year + Math.floor(targetMonthIndex / 12);
        const targetMonth = targetMonthIndex % 12;
        const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
        const safeDay = Math.min(day, lastDay);
        return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
    };

    const update = (key) => (e) => {
        const value = e.target.value;
        setForm((prev) => {
            const next = { ...prev, [key]: value };
            if (key === 'contractStartDate' && prev.contractDuration && prev.contractDuration !== 'custom') {
                next.contractEndDate = calculateContractEnd(value, prev.contractDuration);
            }
            if (key === 'contractDuration') {
                next.contractEndDate = value === 'custom'
                    ? ''
                    : calculateContractEnd(prev.contractStartDate, value);
            }
            return next;
        });
        setErrors((prev) => ({
            ...prev,
            [key]: undefined,
            ...(key === 'contractStartDate' || key === 'contractDuration'
                ? { contractEndDate: undefined }
                : {})
        }));
    };
    const triggerPick = () => fileInputRef.current?.click();
    const handleFile = (file) => {
        if (!file)
            return;
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            setErrors((prev) => ({ ...prev, image: 'รองรับเฉพาะไฟล์ JPG, PNG และ WebP' }));
            return;
        }
        if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
            setErrors((prev) => ({
                ...prev,
                image: `ไฟล์ใหญ่เกินกำหนด (${(file.size / 1024 / 1024).toFixed(2)} MB) — อัปโหลดได้ไม่เกิน ${MAX_IMAGE_MB} MB`
            }));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setCropSource(String(reader.result));
            setCropFileName(file.name);
            setErrors((prev) => ({ ...prev, image: undefined }));
        };
        reader.readAsDataURL(file);
    };
    const onPickImage = (e) => {
        handleFile(e.target.files?.[0]);
        e.target.value = '';
    };
    const onDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files?.[0]);
    };
    return (<>
      <Modal open={open} title={mode === 'edit' ? 'แก้ไขข้อมูลร้านค้า' : 'เพิ่มร้านค้าใหม่'} subtitle="ช่องที่มีเครื่องหมาย * ต้องกรอกให้ครบก่อนจึงจะบันทึกได้" onClose={onClose} width={660} footer={<>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button icon="check" onClick={onSubmit} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : mode === 'edit' ? 'บันทึกการแก้ไข' : 'เพิ่มร้านค้า'}
          </Button>
        </>}>
            <FormSectionTitle icon="store">ข้อมูลร้าน</FormSectionTitle>
      <Field label="ชื่อร้านค้า" required error={errors.name}>
        <input value={form.name} onChange={update('name')} maxLength={100} placeholder="เช่น ร้านข้าวแกงวิศวะเดือด" style={inputStyle}/>
      </Field>
      <div style={twoColStyle}>
        <Field label="ประเภทอาหาร" required error={errors.category}>
          <select value={form.category} onChange={update('category')} style={inputStyle}>
            <option value="">— เลือกประเภทอาหาร —</option>
            {FOOD_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </Field>
        <Field label="ตัวอักษรคิวของร้าน" error={errors.queueCode} hint="คิวจะเป็น A001, A002 ... เว้นว่าง = ระบบเลือกให้">
          <input value={form.queueCode || ''} onChange={update('queueCode')} maxLength={2} placeholder="เช่น A" style={{ ...inputStyle, textTransform: 'uppercase' }}/>
        </Field>
      </div>
      <Field label="คำอธิบายร้าน" error={errors.description} hint={`${form.description.length}/300 ตัวอักษร`}>
        <textarea value={form.description} onChange={update('description')} maxLength={300} rows={2} placeholder="จุดเด่นของร้าน เมนูแนะนำ ฯลฯ" style={{ ...inputStyle, resize: 'vertical', fontFamily: FONT_STACK }}/>
      </Field>
      <Field label="รูปหน้าร้าน" error={errors.image}>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickImage} style={{ display: 'none' }}/>
        <button
          type="button"
          onClick={triggerPick}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={storeImageUploaderStyle(dragOver, !!errors.image, !!form.imageData)}
          aria-label="อัปโหลดรูปหน้าร้าน"
        >
          {form.imageData ? (
            <>
              <img src={form.imageData} alt="ตัวอย่างรูปร้าน" style={storeImagePreviewStyle}/>
              <span style={storeImageShadeStyle}/>
              <span style={storeImageChangeBadgeStyle}>
                <Icon name="edit" size={15} color="#FFFFFF"/>
                คลิกเพื่อเปลี่ยนรูป
              </span>
            </>
          ) : (
            <span style={storeImageEmptyStyle}>
              <span style={storeImageIconStyle}>
                <Icon name="store" size={28} color={T.primary}/>
                <span style={storeImagePlusStyle}>
                  <Icon name="plus" size={13} color="#FFFFFF" strokeWidth={2.2}/>
                </span>
              </span>
              <strong style={{ color: T.ink, fontSize: '14px', fontWeight: 700 }}>อัปโหลดรูปหน้าร้าน</strong>
              <span style={{ color: T.muted, fontSize: '12.5px', fontWeight: 500 }}>
                คลิกเพื่อเลือกรูป หรือ ลากและวางไฟล์ที่นี่
              </span>
              <span style={storeImageFormatPillStyle}>JPG · PNG · WebP · ไม่เกิน {MAX_IMAGE_MB} MB</span>
            </span>
          )}
        </button>

        {form.imageData && (
          <div style={storeImageFooterStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: T.ink, fontSize: '12.5px', fontWeight: 700 }}>รูปหน้าร้านที่เลือก</div>
              <div style={{ ...captionStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '380px' }}>
                {form.imageName || 'รูปเดิมของร้านค้า'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button variant="ghost" icon="edit" onClick={triggerPick} style={{ padding: '8px 12px', fontSize: '12.5px' }}>
                เปลี่ยนรูป
              </Button>
              <Button
                variant="danger"
                icon="trash"
                onClick={() => setForm((prev) => ({ ...prev, imageData: '', imageName: '' }))}
                style={{ padding: '8px 12px', fontSize: '12.5px' }}
              >
                ลบรูป
              </Button>
            </div>
          </div>
        )}
      </Field>

      <FormSectionTitle icon="calendar">สัญญาเช่า</FormSectionTitle>
      <Field label="วันที่เริ่มสัญญา (ปี ค.ศ.)" required error={errors.contractStartDate}>
        <input type="date" value={form.contractStartDate || ''} onChange={update('contractStartDate')} style={formDateInputStyle} />
      </Field>
      <div style={twoColStyle}>
        <Field label="ระยะเวลาสัญญา" required error={errors.contractDuration}>
          <select value={form.contractDuration || ''} onChange={update('contractDuration')} style={{ ...inputStyle, display: 'block', width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
            <option value="">— เลือกระยะเวลา —</option><option value="6m">6 เดือน</option><option value="1y">1 ปี</option><option value="2y">2 ปี</option><option value="3y">3 ปี</option><option value="custom">กำหนดวันสิ้นสุดเอง</option>
          </select>
        </Field>
        <Field label="วันที่สิ้นสุดสัญญา (ปี ค.ศ.)" required error={errors.contractEndDate} hint={form.contractDuration && form.contractDuration !== 'custom' ? 'ระบบคำนวณให้อัตโนมัติ' : form.contractDuration === 'custom' ? 'เลือกวันสิ้นสุดได้เอง' : 'เลือกระยะเวลาสัญญาก่อน'}>
          <input type="date" value={form.contractEndDate || ''} min={form.contractStartDate || undefined} onChange={update('contractEndDate')} disabled={form.contractDuration !== 'custom'} style={{ ...formDateInputStyle, background: form.contractDuration !== 'custom' ? '#F7F8FB' : inputStyle.background, color: form.contractDuration !== 'custom' ? T.muted : T.ink, cursor: form.contractDuration !== 'custom' ? 'not-allowed' : 'pointer' }} />
        </Field>
      </div>

      <FormSectionTitle icon="account">ผู้ติดต่อ</FormSectionTitle>
      <div style={twoColStyle}>
        <Field label="ชื่อเจ้าของร้าน / ผู้ติดต่อ" required error={errors.contactName} hint={mode === 'create' ? 'ใช้เป็นชื่อบัญชีเจ้าของร้านด้วย' : undefined}>
          <IconInput icon="account" value={form.contactName} onChange={update('contactName')} maxLength={60} placeholder="ชื่อ-นามสกุล"/>
        </Field>
        <Field label="เบอร์โทรติดต่อ" required error={errors.phone} hint="ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0">
          <IconInput icon="phone" value={form.phone} inputMode="tel" maxLength={12} placeholder="081-234-5678"
            onChange={(e) => { setForm((prev) => ({ ...prev, phone: e.target.value.replace(/[^\d-]/g, '').slice(0, 12) })); setErrors((prev) => ({ ...prev, phone: undefined })); }}
            onBlur={() => setForm((prev) => ({ ...prev, phone: formatPhone(prev.phone) }))}/>
        </Field>
      </div>
      <div style={twoColStyle}>
        <Field label="LINE ID (ไม่บังคับ)" error={errors.lineId} hint="ห้ามเว้นวรรค">
          <IconInput icon="chat" value={form.lineId} onChange={(e) => setForm((prev) => ({ ...prev, lineId: e.target.value.replace(/\s/g, '').slice(0, 30) }))} placeholder="@onlyfoods"/>
        </Field>
        <Field label="อีเมล (ไม่บังคับ)" error={errors.email}>
          <IconInput icon="mail" type="email" value={form.email} onChange={update('email')} maxLength={100} placeholder="shop@example.com"/>
        </Field>
      </div>

      {mode === 'create' && (<>
        <FormSectionTitle icon="key">บัญชีเข้าสู่ระบบ</FormSectionTitle>
        <OwnerRoleCard/>
        <Field label="ชื่อผู้ใช้ (username)" required error={errors.ownerUsername} hint="a-z, 0-9 และ _ ความยาว 4–20 ตัว ห้ามซ้ำกับบัญชีอื่น">
          <IconInput icon="account" value={form.ownerUsername || ''} onChange={(e) => { setForm((prev) => ({ ...prev, ownerUsername: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) })); setErrors((prev) => ({ ...prev, ownerUsername: undefined })); }} autoComplete="off" placeholder="เช่น owner_shop"/>
        </Field>
        <div style={twoColStyle}>
          <Field label="รหัสผ่าน" required error={errors.ownerPassword}>
            <PasswordField value={form.ownerPassword || ''} onChange={update('ownerPassword')} show={showPassword} onToggle={() => setShowPassword((v) => !v)} placeholder={`อย่างน้อย ${STORE_PASSWORD_MIN} ตัว`}/>
          </Field>
          <Field label="ยืนยันรหัสผ่าน" required error={errors.ownerConfirm}>
            <PasswordField value={form.ownerConfirm || ''} onChange={update('ownerConfirm')} show={showPassword} onToggle={() => setShowPassword((v) => !v)} placeholder="พิมพ์อีกครั้ง"/>
          </Field>
        </div>
        <PasswordChecklist password={form.ownerPassword || ''} confirm={form.ownerConfirm || ''}/>
      </>)}
       </Modal>

    <StoreImageCropModal
      open={Boolean(cropSource)}
      imageSrc={cropSource}
      fileName={cropFileName}
      onCancel={() => {
        setCropSource('');
        setCropFileName('');
      }}
      onConfirm={(dataUrl, name) => {
        setForm((prev) => ({ ...prev, imageData: dataUrl, imageName: name }));
        setErrors((prev) => ({ ...prev, image: undefined }));
        setCropSource('');
        setCropFileName('');
      }}
    />
    </>);
}
// ดูร้าน
function StoreDetailModal({ open, store, detail, account, onClose, onSaveStore, onSaveAccount, saving , pushToast }) {
    const imageInputRef = useRef(null);
    const [editing, setEditing] = useState(null);
    const [value, setValue] = useState('');
    const [accountValue, setAccountValue] = useState('');
    const [imageValue, setImageValue] = useState('');
    const [cropSource, setCropSource] = useState('');
    const [cropFileName, setCropFileName] = useState('');
    useEffect(() => {
        if (!open) {
            setEditing(null);
            setValue('');
            setAccountValue('');
            setImageValue('');
            setCropSource('');
            setCropFileName('');
        }
    }, [open, store?.StoreId]);

    if (!store) return null;

    const storeValue = (key) => {
        if (key === 'StoreName') return store.StoreName || '';
        return detail?.[key] || '';
    };

    const startEdit = (key) => {
        setEditing(key);
        setValue(String(storeValue(key) || ''));
    };

        const startImageEdit = () => {
        setEditing('ImageUrl');
        setImageValue(detail?.ImageUrl || '');
    };

    const handleImageChange = (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';

        if (!file) return;

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            pushToast('รองรับเฉพาะไฟล์ JPG, PNG และ WebP', 'error');
            return;
        }

        if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
            pushToast(`ไฟล์ใหญ่เกินกำหนด อัปโหลดได้ไม่เกิน ${MAX_IMAGE_MB} MB`, 'error');
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            setCropSource(String(reader.result));
            setCropFileName(file.name);
        };

        reader.readAsDataURL(file);
    };

    const saveImage = async () => {
        const current = detail?.ImageUrl || '';

        if (imageValue === current) {
            setEditing(null);
            return;
        }

        const patch = {
            StoreName: store.StoreName,
            Category: detail?.Category || '',
            ContactName: detail?.ContactName || '',
            ContactPhone: detail?.ContactPhone || '',
            ContactLine: detail?.ContactLine || '',
            ContactEmail: detail?.ContactEmail || '',
            Description: detail?.Description || '',
            ImageUrl: imageValue
        };

        const ok = await onSaveStore(patch);

        if (ok) {
            setEditing(null);
            setImageValue('');
        }
    };

        const saveStoreField = async (key) => {
        let next = value.trim();
        if (key === 'ContactPhone') {
            const phoneError = storePhoneError(next);
            if (phoneError) {
                pushToast(phoneError, 'error');
                return;
            }
            next = next.replace(/\D/g, '');
        }
        const current = String(storeValue(key) || '').trim();
        if (next === current) {
            setEditing(null);
            return;
        }
        const patch = {
            StoreName: key === 'StoreName' ? next : store.StoreName,
            Category: key === 'Category' ? next : (detail.Category || ''),
            ContactName: key === 'ContactName' ? next : (detail.ContactName || ''),
            ContactPhone: key === 'ContactPhone' ? next : (detail.ContactPhone || ''),
            ContactLine: key === 'ContactLine' ? next : (detail.ContactLine || ''),
            ContactEmail: key === 'ContactEmail' ? next : (detail.ContactEmail || ''),
            Description: key === 'Description' ? next : (detail.Description || '')
        };
        const ok = await onSaveStore(patch);
        if (ok) setEditing(null);
    };

    const startAccountEdit = (key) => {
        setEditing(`account:${key}`);
        setAccountValue(key === 'Password' ? '' : String(account?.[key] || ''));
    };

    const saveAccountField = async (key) => {
        const next = accountValue.trim();
                if (key === 'Password' && next.length < STORE_PASSWORD_MIN) {
            pushToast(`รหัสผ่านต้องยาวอย่างน้อย ${STORE_PASSWORD_MIN} ตัวอักษร`, 'error');
            return;
        }
        const current = String(account?.[key] || '').trim();
        if (key !== 'Password' && next === current) {
            setEditing(null);
            return;
        }
        const ok = await onSaveAccount(key, next);
        if (ok) {
            setEditing(null);
            setAccountValue('');
        }
    };

    const editableStoreItem = (key, label) => {
        const current = storeValue(key);
        const isEditing = editing === key;
        return (
            <div style={{ padding: '12px 0', borderBottom: `1px solid ${T.line}` }}>
                <div style={{ ...captionStyle, marginBottom: '4px' }}>{label}</div>
                                {isEditing ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '7px' }}>
                        {key === 'Category' ? (
                            <select autoFocus value={value} onChange={(e) => setValue(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }}>
                                {!FOOD_CATEGORIES.includes(value) && <option value={value}>{value || '— เลือกประเภทอาหาร —'}</option>}
                                {FOOD_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                            </select>
                                                ) : key === 'ContactPhone' ? (
                            <input autoFocus value={value} inputMode="tel" maxLength={12} placeholder="081-234-5678" onChange={(e) => setValue(e.target.value.replace(/[^\d-]/g, ''))} style={{ ...inputStyle, flex: 1, minWidth: 0 }}/>
                        ) : (
                            <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }}/>
                        )}
                        <Button variant="primary" icon="check" disabled={saving} onClick={() => saveStoreField(key)}>บันทึก</Button>
                        <Button variant="ghost" disabled={saving} onClick={() => setEditing(null)}>ยกเลิก</Button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', minHeight: '30px' }}>
                        <div style={{ ...bodyStyle, color: current ? T.ink : T.muted, minWidth: 0 }}>{current || '—'}</div>
                        <button type="button" onClick={() => startEdit(key)} style={inlineEditButtonStyle} aria-label={`แก้ไข${label}`}>
                            <Icon name="edit" size={15} color={T.primary}/>
                        </button>
                    </div>
                )}
            </div>
        );
    };

    const accountItem = (key, label, masked = false) => {
        const isEditing = editing === `account:${key}`;
        const shown = key === 'Password' ? '••••••••' : (account?.[key] || '—');
        return (
            <div style={{ padding: '12px 0', borderBottom: `1px solid ${T.line}` }}>
                <div style={{ ...captionStyle, marginBottom: '4px' }}>{label}</div>
                {isEditing ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '7px' }}>
                        <input
                            autoFocus
                            type={key === 'Password' ? 'password' : 'text'}
                            value={accountValue}
                            onChange={(e) => setAccountValue(e.target.value)}
                            placeholder={key === 'Password' ? 'ตั้งรหัสผ่านใหม่' : ''}
                            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                        />
                        <Button variant="primary" icon="check" disabled={saving} onClick={() => saveAccountField(key)}>บันทึก</Button>
                        <Button variant="ghost" disabled={saving} onClick={() => setEditing(null)}>ยกเลิก</Button>
                    </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', minHeight: '30px' }}>
                        <div style={{ ...bodyStyle, color: account ? T.ink : T.muted, minWidth: 0 }}>
                            {account ? shown : 'ยังไม่มีบัญชีเจ้าของร้าน'}
                        </div>
                        {account && key !== 'Username' && (
                            <button type="button" onClick={() => startAccountEdit(key)} style={inlineEditButtonStyle} aria-label={`แก้ไข${label}`}>
                                <Icon name="edit" size={15} color={T.primary}/>
                            </button>
                        )}
                    </div>

                    {key === 'Username' && account && (
                        <div style={{ ...captionStyle, fontSize: '11.5px' }}>
                            แก้ชื่อผู้ใช้ไม่ได้
                        </div>
                    )}
                  </>
                )}
            </div>
        );
    };

    return (<>
        <Modal open={open} title="ข้อมูลร้านค้า" subtitle={store.StoreName} onClose={onClose} width={720}
            footer={<Button variant="ghost" onClick={onClose}>ปิด</Button>}>
            <div>
                {editableStoreItem('StoreName', 'ชื่อร้านค้า')}
                {editableStoreItem('Category', 'ประเภท')}
                {editableStoreItem('ContactName', 'ชื่อผู้ติดต่อ')}
                {editableStoreItem('ContactPhone', 'เบอร์โทรศัพท์')}
                {editableStoreItem('ContactLine', 'LINE (ไม่บังคับ)')}
                {editableStoreItem('ContactEmail', 'อีเมล (ไม่บังคับ)')}
                {editableStoreItem('Description', 'รายละเอียดร้าน')}

                <div style={{ padding: '12px 0', borderBottom: `1px solid ${T.line}` }}>
    <div style={{ ...captionStyle, marginBottom: '4px' }}>
        รูปหน้าร้าน
    </div>

    {editing === 'ImageUrl' ? (
        <div style={{ marginTop: '8px' }}>
            <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                style={{ display: 'none' }}
            />

            {imageValue ? (
                <img
                    src={imageValue}
                    alt="ตัวอย่างรูปร้าน"
                    style={{
                        width: '100%',
                        maxWidth: '320px',
                        height: '180px',
                        objectFit: 'cover',
                        borderRadius: T.radiusMd,
                        border: `1px solid ${T.line}`,
                        display: 'block',
                        marginBottom: '10px'
                    }}
                />
            ) : (
                <div style={{
                    width: '100%',
                    maxWidth: '320px',
                    height: '180px',
                    border: `1px dashed ${T.line}`,
                    borderRadius: T.radiusMd,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: T.muted,
                    marginBottom: '10px'
                }}>
                    ไม่มีรูปหน้าร้าน
                </div>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button
                    variant="soft"
                    icon="edit"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={saving}
                >
                    {imageValue ? 'เปลี่ยนรูป' : 'เลือกรูป'}
                </Button>

                {imageValue && (
                    <Button
                        variant="danger"
                        icon="trash"
                        onClick={() => setImageValue('')}
                        disabled={saving}
                    >
                        ลบรูป
                    </Button>
                )}

                <Button
                    variant="primary"
                    icon="check"
                    onClick={saveImage}
                    disabled={saving}
                >
                    บันทึก
                </Button>

                <Button
                    variant="ghost"
                    onClick={() => {
                        setEditing(null);
                        setImageValue('');
                    }}
                    disabled={saving}
                >
                    ยกเลิก
                </Button>
            </div>
        </div>
    ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', minHeight: '30px' }}>
          {detail?.ImageUrl ? (
            <img
                src={detail.ImageUrl}
                alt="รูปร้าน"
                style={{
                    width: '100%',
                    maxWidth: '320px',
                    height: '180px',
                    objectFit: 'cover',
                    borderRadius: T.radiusMd,
                    border: `1px solid ${T.line}`,
                    display: 'block'
                }}
            />
          ) : (
            <div style={{ ...bodyStyle, color: T.muted }}>
                ยังไม่มีรูปหน้าร้าน
            </div>
          )}
          <button type="button" onClick={startImageEdit} style={inlineEditButtonStyle} aria-label="แก้ไขรูปหน้าร้าน">
            <Icon name="edit" size={15} color={T.primary}/>
          </button>
        </div>
    )}
</div>

<div style={{ marginTop: '22px', marginBottom: '4px', color: T.ink, fontWeight: 700, fontSize: '15px' }}>
    บัญชีเจ้าของร้าน
</div>
                {accountItem('FullName', 'ชื่อ-นามสกุล')}
                {accountItem('Username', 'Username')}
                <div style={{ padding: '12px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                        <div style={{ ...captionStyle, marginBottom: '4px' }}>ตำแหน่ง</div>
                    </div>
                    <div style={{ ...bodyStyle, color: account ? T.ink : T.muted }}>
                        {account?.Role === 'Shop Owner' ? 'เจ้าของร้าน' : (account?.Role || '—')}
                    </div>
                </div>
                {accountItem('Password', 'รหัสผ่าน')}
            </div>
        </Modal>

        <StoreImageCropModal
          open={Boolean(cropSource)}
          imageSrc={cropSource}
          fileName={cropFileName}
          onCancel={() => {
            setCropSource('');
            setCropFileName('');
          }}
          onConfirm={(dataUrl) => {
            setImageValue(dataUrl);
            setCropSource('');
            setCropFileName('');
          }}
        />
    </>);
}
// แถบกรองสถานะหน้าจัดการร้านค้า — แต่ละร้านอยู่ได้กลุ่มเดียว: หมดสัญญา > ระงับสิทธิ์ > เปิด > ปิด
const STORE_MANAGE_FILTERS = [
    ['all', 'ทั้งหมด'],
    ['open', 'เปิดอยู่'],
    ['closed', 'ปิดอยู่'],
    ['suspended', 'ระงับสิทธิ์'],
    ['expired', 'หมดสัญญา']
];
const storeManageStatusKey = (s) => s.ContractState === 'EXPIRED' ? 'expired'
    : s.IsSuspended ? 'suspended'
    : s.IsOpen ? 'open'
    : 'closed';
// ===== จัดการร้านค้า: เพิ่ม แก้ไข เปิด/ปิด ระงับ และลบร้าน =====
function StoreManagePage({ ctx }) {
    const { API, user, stores, search, pushToast, ask, askForceClose, reloadStores, focusStoreId, clearFocusStore, navigateTo } = ctx;
    const [details, setDetails] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [mode, setMode] = useState('create');
    const [viewStoreId, setViewStoreId] = useState(null);
    const [storeAccounts, setStoreAccounts] = useState([]);
    const [form, setForm] = useState(EMPTY_STORE_FORM);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const loadDetails = useCallback(async () => {
        try {
            const data = await callApi(`${API}/api/stores`);
            setDetails(Array.isArray(data) ? data : []);
        }
        catch (err) {
            console.debug('โหลดรายละเอียดร้านไม่สำเร็จ:', err.message);
        }
    }, [API]);
    const loadStoreAccounts = useCallback(async () => {
        try {
            const data = await callApi(`${API}/api/store-accounts`);
            setStoreAccounts(Array.isArray(data) ? data : []);
        }
        catch (err) {
            console.debug('โหลดบัญชีเจ้าของร้านไม่สำเร็จ:', err.message);
        }
    }, [API]);

    useEffect(() => {
        loadDetails();
        loadStoreAccounts();
    }, [loadDetails, loadStoreAccounts]);
    const detailOf = (storeId) => details.find((d) => String(d.StoreId) === String(storeId)) || {};
    const openView = (store) => {setViewStoreId(store.StoreId);};
        const [statusFilter, setStatusFilter] = useState('all');
    useEffect(() => { setStatusFilter('all'); }, [focusStoreId]);
    const searchedRows = stores
        .filter((s) => !focusStoreId || String(s.StoreId) === String(focusStoreId))
        .filter((s) => String(s.StoreName || '').toLowerCase().includes(search));
    const countOf = (key) => searchedRows.filter((s) => storeManageStatusKey(s) === key).length;
    const rows = statusFilter === 'all'
        ? searchedRows
        : searchedRows.filter((s) => storeManageStatusKey(s) === statusFilter);
    const activeFilterLabel = STORE_MANAGE_FILTERS.find(([id]) => id === statusFilter)?.[1];
    const openCreate = () => {
        setMode('create');
        setForm(EMPTY_STORE_FORM);
        setErrors({});
        setModalOpen(true);
    };
    // [CROSS-NAV] หากเข้ามาจากหน้ายอดขายรายร้าน ให้กรองตารางไว้ที่ร้านนั้น โดยไม่เปิดฟอร์มแก้ไขอัตโนมัติ

    const submitForm = async () => {
        const found = validateStoreForm(form, mode);
        setErrors(found);
        if (Object.keys(found).length) {
            pushToast('ยังกรอกข้อมูลไม่ครบหรือไม่ถูกต้อง กรุณาตรวจสอบช่องที่มีข้อความสีแดง', 'error');
            return;
        }
        const payload = {
            store_name: form.name.trim(),
            queue_code: (form.queueCode || '').trim().toUpperCase() || null,
            category: form.category,
            contact_name: form.contactName.trim(),
            contact_phone: form.phone.replace(/\D/g, ''),
            contact_line: form.lineId.trim(),
            contact_email: form.email.trim(),
            description: form.description.trim(),
            image_url: form.imageData,
            contract_start_date: form.contractStartDate || null,
            contract_end_date: form.contractEndDate || null,
            performed_by: 'Executive',
            ...(mode === 'create' ? {
                owner_full_name: form.contactName.trim(),
                owner_username: form.ownerUsername.trim(),
                owner_password: form.ownerPassword
            } : {})
        };
        const send = async (path, method) => callApi(`${API}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        setSaving(true);
        try {
            const isEdit = mode === 'edit';
            const fullPath = isEdit ? `/api/stores/${form.StoreId}/full` : '/api/stores/full';
            const basicPath = isEdit ? `/api/stores/${form.StoreId}` : '/api/stores';
            const method = isEdit ? 'PUT' : 'POST';
            if (isEdit) {
                try {
                    await send(fullPath, method);
                    pushToast('บันทึกการแก้ไขร้านค้าแล้ว');
                }
                catch (fullError) {
                    if (!/endpoint/i.test(fullError.message))
                        throw fullError;
                    await send(basicPath, method);
                    pushToast('บันทึกได้เฉพาะชื่อร้าน — เพิ่มโค้ดจาก main_additions.py ในหลังบ้านก่อน จึงจะเก็บข้อมูลรายละเอียดได้', 'warn');
                }
            }
            else {
                await send(fullPath, method);
                pushToast('เพิ่มร้านค้าและบัญชีเจ้าของร้านเรียบร้อยแล้ว');
            }
            setModalOpen(false);
            await reloadStores();
            await loadDetails();
            await loadStoreAccounts();
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
        finally {
            setSaving(false);
        }
    };
    const accountOf = (storeId) =>
        storeAccounts.find((a) => String(a.StoreId) === String(storeId) && a.Role === 'Shop Owner') || null;

    const saveStoreField = async (store, patch) => {
        if (!store) return false;
        const d = detailOf(store.StoreId);
        const payload = {
            store_name: patch.StoreName,
            category: patch.Category,
            contact_name: patch.ContactName,
            contact_phone: patch.ContactPhone,
            contact_line: patch.ContactLine,
            contact_email: patch.ContactEmail,
            description: patch.Description,
            image_url: patch.ImageUrl !== undefined
            ? patch.ImageUrl
            : (d.ImageUrl || ''),
            contract_start_date: d.ContractStartDate ? String(d.ContractStartDate).slice(0, 10) : null,
            contract_end_date: d.ContractEndDate ? String(d.ContractEndDate).slice(0, 10) : null,
            performed_by: 'Executive'
        };
        setSaving(true);
        try {
            await callApi(`${API}/api/stores/${store.StoreId}/full`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            pushToast(`บันทึกข้อมูลร้าน ${store.StoreName} แล้ว`);
            await reloadStores();
            await loadDetails();
            return true;
        }
        catch (err) {
            pushToast(err.message, 'error');
            return false;
        }
        finally {
            setSaving(false);
        }
    };

    const saveAccountField = async (account, key, value) => {
        if (!account) return false;
        const payload = { performed_by: 'Executive' };
        if (key === 'FullName') payload.full_name = value;
        if (key === 'Username') payload.username = value;
        if (key === 'Password') payload.password = value;
        setSaving(true);
        try {
            await callApi(`${API}/api/store-accounts/${account.UserId}/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            pushToast('บันทึกบัญชีเจ้าของร้านแล้ว');
            const data = await callApi(`${API}/api/store-accounts`);
            setStoreAccounts(Array.isArray(data) ? data : []);
            return true;
        }
        catch (err) {
            pushToast(err.message, 'error');
            return false;
        }
        finally {
            setSaving(false);
        }
    };

    const toggleStore = async (store) => {
        const closing = Boolean(store.IsOpen);
        if (!closing && Boolean(store.IsSuspended)) {
            pushToast(`ร้าน ${store.StoreName} ถูกระงับสิทธิ์ กรุณาปลดระงับก่อนเปิดร้าน`, 'warn');
            return;
        }
        let onOpenOrders = '';
        if (closing) {
            let pending = [];
            try { pending = await callApi(`${API}/api/stores/${store.StoreId}/open-orders`); }
            catch (err) { pushToast(err.message, 'error'); return; }
            if (Array.isArray(pending) && pending.length) {
                const choice = await askForceClose({ kind: 'store', title: `ปิดร้าน "${store.StoreName}"`, orders: pending });
                if (!choice) return;
                onOpenOrders = `&on_open_orders=${choice}`;
            }
        }
        const ok = onOpenOrders || await ask({
            title: closing ? 'ปิดร้านค้า' : 'เปิดร้านค้า',
            message: `ยืนยัน${closing ? 'ปิด' : 'เปิด'}ร้าน "${store.StoreName}" ใช่หรือไม่`,
            warning: closing ? 'ลูกค้าจะสั่งอาหารจากร้านนี้ไม่ได้จนกว่าจะเปิดใหม่' : null,
            confirmText: closing ? 'ปิดร้าน' : 'เปิดร้าน',
            danger: closing
        });
        if (!ok)
            return;
        try {
            const data = await callApi(`${API}/api/stores/${store.StoreId}/toggle?performed_by=Executive&open=${!closing}${onOpenOrders}`, { method: 'PUT' });
            pushToast(forceCloseMessage(`${closing ? 'ปิด' : 'เปิด'}ร้าน ${store.StoreName} แล้ว`, data?.forced));
            await reloadStores();
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
    };
    const suspendStore = async (store) => {
        const suspending = !store.IsSuspended;
        const ok = await ask({
            title: suspending ? 'ระงับสิทธิ์ร้านค้า' : 'ปลดระงับสิทธิ์',
            message: `ยืนยัน${suspending ? 'ระงับสิทธิ์' : 'ปลดระงับสิทธิ์'}ร้าน "${store.StoreName}" ใช่หรือไม่`,
            warning: suspending
                ? 'ร้านจะขายไม่ได้ชั่วคราว แต่ข้อมูลและยอดขายเดิมยังอยู่ครบ'
                : null,
            confirmText: suspending ? 'ระงับสิทธิ์' : 'ปลดระงับ',
            danger: suspending
        });
        if (!ok)
            return;
        try {
            await callApi(`${API}/api/stores/${store.StoreId}/suspend?performed_by=Executive`, { method: 'PUT' });
            pushToast(`${suspending ? 'ระงับสิทธิ์' : 'ปลดระงับ'}ร้าน ${store.StoreName} แล้ว`);
            await reloadStores();
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
    };
    const deleteStore = async (store) => {
        const ok = await ask({
            title: 'ลบร้านค้าออกจากระบบ',
            message: `ยืนยันลบร้าน "${store.StoreName}" ออกจากระบบใช่หรือไม่`,
            warning: 'ร้านและเมนูจะหายจากหน้าลูกค้า แต่ประวัติออเดอร์และยอดขายยังเก็บไว้ ; ถ้ายังมีออเดอร์หรือเงินคืนลูกค้าค้างอยู่ ระบบจะไม่ยอมให้ลบ (ถ้าแค่อยากหยุดขายชั่วคราว ให้ใช้ระงับสิทธิ์แทน)',
            confirmText: 'ลบร้านค้า',
            danger: true
        });
        if (!ok)
            return;
        try {
            await callApi(`${API}/api/stores/${store.StoreId}`, { method: 'DELETE' });
            pushToast(`ลบร้าน ${store.StoreName} แล้ว`);
            await reloadStores();
            await loadDetails();
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
    };
    const focusedStore = focusStoreId ? stores.find((s) => String(s.StoreId) === String(focusStoreId)) : null;

    return (<>
      {focusedStore && (<div style={{ marginBottom: '16px', padding: '12px 14px', border: `1px solid ${T.primary}`, borderRadius: T.radiusMd, background: T.primarySoft, display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: T.primaryDark }}>กำลังจัดการร้าน {focusedStore.StoreName}</strong>
          <div style={{ ...captionStyle, marginTop: '3px' }}>แสดงร้านที่เลือกจากหน้ายอดขายรายร้าน · เลือกแก้ไขจากปุ่มในตารางได้</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            variant="ghost"
            icon="arrow-left"
            onClick={() => navigateTo('store-sales', focusedStore.StoreId)}
            title={`กลับไปดูยอดขายของร้าน ${focusedStore.StoreName}`}
            style={{ padding: '9px 14px', fontWeight: 600, borderColor: T.line, boxShadow: '0 1px 2px rgba(18,25,38,.04)' }}
          >
            กลับไปยอดขายรายร้าน
          </Button>
          <Button variant="ghost" onClick={clearFocusStore} style={{ padding: '9px 14px' }}>แสดงร้านค้าทั้งหมด</Button>
        </div>
      </div>)}
            <Card title="รายชื่อร้านค้าทั้งหมด" subtitle={`${money(rows.length)} ร้านที่แสดงอยู่ · ใช้ช่องค้นหาด้านบนเพื่อกรองรายชื่อ`}
        right={<Button icon="plus" onClick={openCreate}>เพิ่มร้านค้า</Button>}>
                  <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {STORE_MANAGE_FILTERS.map(([id, label]) => {
            const active = statusFilter === id;
            const count = id === 'all' ? searchedRows.length : countOf(id);
            return (<button key={id} type="button" onClick={() => setStatusFilter(id)} aria-pressed={active} style={{
                border: `1px solid ${active ? T.primary : T.line}`,
                background: active ? T.primarySoft : T.surface,
                color: active ? T.primaryDark : T.text,
                borderRadius: '999px', padding: '9px 13px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_STACK
            }}>{label} ({money(count)})</button>);
          })}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ร้านค้า</th>
                <th style={thStyle}>ประเภท</th>
                <th style={thStyle}>ติดต่อ</th>
                <th style={thStyle}>สถานะ</th>
                <th style={thStyle}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
            const d = detailOf(s.StoreId);
            return (<tr key={s.StoreId} style={trStyle}>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {d.ImageUrl ? (<img src={d.ImageUrl} alt="" style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: T.radiusMd,
                        objectFit: 'cover',
                        border: `1px solid ${T.line}`
                    }}/>) : (<div style={storeThumbStyle}>
                            {String(s.StoreName || '?').charAt(0)}
                          </div>)}
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ color: T.ink }}>{s.StoreName}</strong>
                          <div style={captionStyle}>รหัสร้าน #{s.StoreId}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>{d.Category || <span style={{ color: T.muted }}>—</span>}</td>
                    <td style={tdStyle}>
                      {d.ContactPhone ? (<>
                          <div>{d.ContactPhone}</div>
                          {d.ContactLine && <div style={captionStyle}>LINE {d.ContactLine}</div>}
                        </>) : (<span style={{ color: T.muted }}>—</span>)}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                               {s.ContractState === 'EXPIRED'
                            ? <Badge tone="danger">{s.IsClearingOrders ? 'หมดสัญญา · เคลียร์ออเดอร์' : 'หมดสัญญา'}</Badge>
                            : <Badge tone={s.IsOpen ? 'ok' : 'neutral'}>{s.IsOpen ? 'เปิด' : 'ปิด'}</Badge>}
                         {s.ContractState === 'UPCOMING' && <Badge tone="neutral">ยังไม่เริ่มสัญญา</Badge>}
                        {isContractSoon(s) && (<button type="button" onClick={() => navigateTo('contract-tracking', s.StoreId)} title="สัญญาใกล้หมด กดเพื่อไปจัดการสัญญา" style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: FONT_STACK }}>
                          <Badge tone="warn">{contractLeftLabel(s.ContractDaysLeft)}</Badge>
                        </button>)}
                        {s.ContractState === 'NONE' && <Badge tone="warn">ไม่มีสัญญา</Badge>}
                        {Boolean(s.IsSuspended) && <Badge tone="danger">ระงับสิทธิ์</Badge>}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <Button variant="soft" icon="eye" onClick={() => openView(s)}style={smallBtn} title="ดูข้อมูลร้าน">
                          ดู/แก้ไข
                        </Button>
                                                {s.ContractState && s.ContractState !== 'ACTIVE' ? (
                          <Button
                            variant={s.ContractState === 'EXPIRED' ? 'danger' : 'ghost'}
                            icon="calendar"
                            onClick={() => navigateTo('contract-tracking', s.StoreId)}
                            title="ร้านเปิดได้เฉพาะช่วงสัญญา กดเพื่อไปจัดการสัญญา"
                            style={smallBtn}
                          >
                            {s.ContractState === 'EXPIRED' ? 'หมดสัญญา' : s.ContractState === 'UPCOMING' ? 'รอเริ่มสัญญา' : 'กำหนดสัญญา'}
                          </Button>
                        ) : (
                          <Button
                            variant="soft"
                            icon="power"
                            onClick={() => toggleStore(s)}
                            disabled={!s.IsOpen && Boolean(s.IsSuspended)}
                            title={!s.IsOpen && Boolean(s.IsSuspended) ? 'กรุณาปลดระงับสิทธิ์ก่อนเปิดร้าน' : undefined}
                            style={smallBtn}
                          >
                            {s.IsOpen ? 'ปิดร้าน' : 'เปิดร้าน'}
                          </Button>
                        )}
                       {s.ContractState !== 'EXPIRED' && (
                          <Button variant="soft" icon="ban" onClick={() => suspendStore(s)} style={smallBtn}>
                            {s.IsSuspended ? 'ปลดระงับ' : 'ระงับสิทธิ์'}
                          </Button>
                        )}
                        <Button variant="danger" icon="trash" onClick={() => deleteStore(s)} style={smallBtn}>
                          ลบ
                        </Button>
                      </div>
                    </td>
                  </tr>);
        })}
              {rows.length === 0 && (<tr>
                  <td colSpan="5" style={{ ...tdStyle, textAlign: 'center', color: T.muted }}>
                                        {statusFilter !== 'all' && searchedRows.length > 0
                      ? `ไม่มีร้านสถานะ “${activeFilterLabel}”`
                      : 'ไม่พบร้านค้าที่ตรงกับคำค้นหา'}
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <StoreFormModal open={modalOpen} mode={mode} form={form} setForm={setForm} errors={errors} setErrors={setErrors} saving={saving} onClose={() => setModalOpen(false)} onSubmit={submitForm}/>
        <StoreDetailModal
        store={stores.find((s) => String(s.StoreId) === String(viewStoreId))}
        detail={detailOf(viewStoreId)}
        account={accountOf(viewStoreId)}
        open={Boolean(viewStoreId)}
        onClose={() => setViewStoreId(null)}
        saving={saving}
        pushToast={pushToast}
        onSaveStore={(patch) => saveStoreField(stores.find((s) => String(s.StoreId) === String(viewStoreId)), patch)}
        onSaveAccount={(key, value) => saveAccountField(accountOf(viewStoreId), key, value)}
      />
    </>);
}
const ROLE_LABEL = {
    'Shop Owner': 'เจ้าของร้าน',
};
const EMPTY_ACCOUNT_FORM = {
    storeId: '',
    role: 'Shop Owner',
    fullName: '',
    username: '',
    password: '',
    confirm: ''
};
function validateAccountForm(form, mode) {
    const errors = {};
    if (!form.storeId)
        errors.storeId = 'กรุณาเลือกร้านค้าที่ผูกกับบัญชีนี้';
    if (!form.role)
        errors.role = 'กรุณาเลือกตำแหน่ง';
    const fullName = form.fullName.trim();
    if (!fullName)
        errors.fullName = 'กรุณากรอกชื่อ-นามสกุลผู้ใช้';
    else if (fullName.length > 100)
        errors.fullName = 'ชื่อต้องไม่เกิน 100 ตัวอักษร';
    if (mode === 'create') {
        const username = form.username.trim();
        if (!username)
            errors.username = 'กรุณากรอกชื่อผู้ใช้';
        else if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
            errors.username = 'ใช้ได้เฉพาะ a-z, 0-9 และ _ ความยาว 4–20 ตัว (ห้ามเว้นวรรค)';
        }
    }
    if (!form.password)
        errors.password = 'กรุณากรอกรหัสผ่าน';
    else if (form.password.length < STORE_PASSWORD_MIN)
        errors.password = `รหัสผ่านต้องยาวอย่างน้อย ${STORE_PASSWORD_MIN} ตัวอักษร`;
    else if (form.password.length > STORE_PASSWORD_MAX)
        errors.password = `รหัสผ่านต้องไม่เกิน ${STORE_PASSWORD_MAX} ตัวอักษร`;
    else if (/\s/.test(form.password))
        errors.password = 'รหัสผ่านห้ามมีช่องว่าง';
    if (form.confirm !== form.password)
        errors.confirm = 'ยืนยันรหัสผ่านไม่ตรงกัน';
    return errors;
}


// ===== ติดตามสัญญา: ดูช่วงสัญญา แก้วันสิ้นสุด และเปิดสัญญารอบใหม่ =====
// กติกา (ต้องตรงกับ backend/routers/stores.py):
//  - ระบบเก็บแค่วันเริ่ม/วันสิ้นสุด เอกสารสัญญาจริงอยู่นอกระบบ ไม่มีการระงับสิทธิ์ในหน้านี้
//  - สัญญามีผลถึง 23:59:59 น. ของวันสิ้นสุด เลยจากนั้น = หมดสัญญา รับออเดอร์ใหม่ไม่ได้
//    ยังมีออเดอร์ค้าง = ร้านเคลียร์ต่อได้จนจบ ; จบแล้ว พนักงานล็อก เจ้าของดูได้อย่างเดียว 30 วัน
//  - ตัดสัญญาย้อนหลังได้ไม่เกินเมื่อวาน (ปุ่ม "ตัดสัญญาทันที")
//  - ยังไม่หมด -> "แก้วันสิ้นสุด" (ต้องมีเหตุผล) ; หมดแล้ว -> กดปุ่ม "หมดสัญญา" เพื่อเปิดรอบใหม่ 1 ปี
//  - ทุกการแก้ถูกบันทึก (ใคร / เมื่อไหร่ / วันเดิม -> วันใหม่ / เหตุผล) ดูได้จากปุ่ม "ประวัติ"
const CONTRACT_ACTION_LABEL = {
    CREATE_STORE: 'กำหนดสัญญาตอนเพิ่มร้าน',
    RENEW_CONTRACT: 'ต่อสัญญา (ระบบเดิม)',
    CONTRACT_EXTEND: 'ขยายวันสิ้นสุด',
    CONTRACT_SHORTEN: 'ลดวันสิ้นสุด',
    CONTRACT_END_BACKDATED: 'แก้ให้จบย้อนหลัง',
    CONTRACT_RESTART: 'เปิดสัญญารอบใหม่',
    AUTO_DELETE_STORE: 'ระบบลบร้านอัตโนมัติ',
    DELETE_STORE: 'ลบร้าน'
};
const CONTRACT_REASON_MIN = 5;

function addYearsMinusOneDayISO(startISO, years = 1) {
    const [y, m, d] = String(startISO || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    const lastDay = new Date(y + years, m, 0).getDate();
    const target = new Date(y + years, m - 1, Math.min(d, lastDay));
    target.setDate(target.getDate() - 1);
    return toISODate(target);
}
function minusOneDayISO(iso) {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    return toISODate(new Date(y, m - 1, d - 1));
}
function addMonthsToISO(baseISO, months) {
    const [y, m, d] = String(baseISO || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    const lastDay = new Date(y, m - 1 + months + 1, 0).getDate();
    return toISODate(new Date(y, m - 1 + months, Math.min(d, lastDay)));
}

function ContractTrackingPage({ ctx }) {
    const { API, search, pushToast, focusStoreId, clearFocusStore, reloadStores } = ctx;
    const [stores, setStores] = useState([]);
    const [loadingContracts, setLoadingContracts] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    // modal แก้/เปิดสัญญา : { mode: 'edit' | 'restart', store }
    const [dialog, setDialog] = useState(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [ackBackdate, setAckBackdate] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    // modal ประวัติ
    const [historyStore, setHistoryStore] = useState(null);
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const loadContracts = useCallback(async () => {
        setLoadingContracts(true);
        try {
            const data = await callApi(`${API}/api/stores`);
            setStores(Array.isArray(data) ? data : []);
            setLoadError('');
        }
        catch (err) {
            setLoadError(err.message);
        }
        finally {
            setLoadingContracts(false);
        }
    }, [API]);

    useEffect(() => {
        loadContracts();
    }, [loadContracts]);

    const today = todayISO();
    const fmt = (value) => (value ? String(value).slice(0, 10) : '—');

    // สถานะคำนวณจาก backend (ContractState / ContractDaysLeft) เพื่อให้ตรงกับที่ระบบล็อกจริง
    const contractInfo = (store) => {
        const state = store.ContractState;
        const days = store.ContractDaysLeft;
        if (state === 'NONE' || !store.ContractEndDate)
            return { key: 'missing', label: 'ยังไม่ระบุสัญญา', tone: 'neutral', bg: '#F2F3F7', color: T.muted };
        if (state === 'UPCOMING')
            return { key: 'upcoming', label: 'ยังไม่เริ่มสัญญา', tone: 'neutral', bg: T.deepSoft, color: T.deep };
        if (state === 'EXPIRED')
            return store.IsClearingOrders
                ? { key: 'expired', label: 'หมดสัญญา · เคลียร์ออเดอร์', tone: 'danger', bg: T.redSoft, color: T.down }
                : { key: 'expired', label: 'หมดสัญญา', tone: 'danger', bg: T.redSoft, color: T.down };
        if (days === 0)
            return { key: 'soon', label: 'หมดคืนนี้ 23:59 น.', tone: 'warn', bg: T.accentSoft, color: T.accentDark };
        if (days <= 30)
            return { key: 'soon', label: 'ใกล้หมดสัญญา', tone: 'warn', bg: T.accentSoft, color: T.accentDark };
        return { key: 'active', label: 'สัญญาปกติ', tone: 'ok', bg: T.greenSoft, color: T.up };
    };

    const remainingText = (store) => {
        const days = store.ContractDaysLeft;
        if (store.ContractState === 'UPCOMING') {
            const start = new Date(`${fmt(store.ContractStartDate)}T00:00:00`);
            const now = new Date(`${today}T00:00:00`);
            return `เริ่มใน ${Math.round((start - now) / 86400000)} วัน`;
        }
        if (days === null || days === undefined) return '—';
        if (days < 0) return `หมดมาแล้ว ${Math.abs(days)} วัน`;
        if (days === 0) return 'วันสุดท้าย';
        return `${money(days)} วัน`;
    };

    const enriched = stores.map((s) => ({ ...s, contract: contractInfo(s) }));
    const filtered = enriched
        .filter((s) => !focusStoreId || String(s.StoreId) === String(focusStoreId))
        .filter((s) => statusFilter === 'all' || s.contract.key === statusFilter)
        .filter((s) => String(s.StoreName || '').toLowerCase().includes(search))
        .sort((a, b) => {
            const ae = a.ContractEndDate ? String(a.ContractEndDate).slice(0, 10) : '9999-12-31';
            const be = b.ContractEndDate ? String(b.ContractEndDate).slice(0, 10) : '9999-12-31';
            return ae.localeCompare(be);
        });
    const countOf = (key) => enriched.filter((s) => s.contract.key === key).length;
    const filters = [
        ['all', 'ทั้งหมด'],
        ['active', 'สัญญาปกติ'],
        ['soon', 'ใกล้หมดสัญญา'],
        ['upcoming', 'ยังไม่เริ่ม'],
        ['expired', 'หมดสัญญา'],
        ['missing', 'ยังไม่ระบุ']
    ];
    const focusedStore = focusStoreId ? enriched.find((s) => String(s.StoreId) === String(focusStoreId)) : null;

    // ---------- เปิด/ปิด modal ----------
    const openEdit = (store) => {
        setDialog({ mode: 'edit', store });
        setEndDate(fmt(store.ContractEndDate));
        setReason('');
        setAckBackdate(false);
        setFormError('');
    };
    const openRestart = (store) => {
        setDialog({ mode: 'restart', store });
        setStartDate(today);
        setEndDate(addYearsMinusOneDayISO(today, 1));
        setReason('');
        setAckBackdate(false);
        setFormError('');
    };
    const closeDialog = () => {
        if (!saving) setDialog(null);
    };

    const dStore = dialog?.store;
    const isEdit = dialog?.mode === 'edit';
    const oldEnd = dStore ? fmt(dStore.ContractEndDate) : '';
    const dStart = isEdit ? fmt(dStore?.ContractStartDate) : startDate;
    const isBackdate = isEdit && endDate && endDate < today;
    const yesterday = minusOneDayISO(today);
    const reasonOk = reason.trim().length >= CONTRACT_REASON_MIN;

    // เปลี่ยนวันเริ่มรอบใหม่ -> วันสิ้นสุดเลื่อนตามเป็น 1 ปีจากวันเริ่ม
    const changeStart = (value) => {
        setStartDate(value);
        setEndDate(addYearsMinusOneDayISO(value, 1));
        setFormError('');
    };

    const validate = () => {
        if (!isEdit && (!startDate || startDate < today)) return 'วันเริ่มสัญญาต้องเป็นวันนี้หรือหลังจากนี้';
        if (!endDate) return 'กรุณาเลือกวันสิ้นสุดสัญญา';
        if (Number(endDate.slice(0, 4)) > 2400) return 'กรุณาระบุปีเป็น ค.ศ. (เช่น 2026 ไม่ใช่ 2569)';
        if (endDate <= dStart) return `วันสิ้นสุดต้องหลังวันเริ่มสัญญา (${dStart})`;
        if (isEdit && endDate === oldEnd) return 'วันสิ้นสุดใหม่ยังเป็นวันเดิม';
        if (!reasonOk) return `กรุณาระบุเหตุผลอย่างน้อย ${CONTRACT_REASON_MIN} ตัวอักษร`;
        if (isEdit && endDate < yesterday) return `ตัดสัญญาย้อนหลังได้ไม่เกินเมื่อวาน (${yesterday})`;
        if (isBackdate && !ackBackdate) return 'กรุณาติ๊กยืนยันว่าเข้าใจผลของการแก้วันย้อนหลัง';
        return '';
    };

    const submit = async () => {
        const problem = validate();
        if (problem) {
            setFormError(problem);
            return;
        }
        setSaving(true);
        setFormError('');
        try {
            const data = isEdit
                ? await callApi(`${API}/api/stores/${dStore.StoreId}/contract`, {
                    method: 'PUT',
                    body: JSON.stringify({ contract_end_date: endDate, reason: reason.trim() })
                })
                : await callApi(`${API}/api/stores/${dStore.StoreId}/contract/restart`, {
                    method: 'POST',
                    body: JSON.stringify({ contract_start_date: startDate, contract_end_date: endDate, reason: reason.trim() })
                });
            pushToast(data?.message || 'บันทึกสัญญาเรียบร้อยแล้ว');
            setDialog(null);
            await loadContracts();
            if (reloadStores) await reloadStores();
        }
        catch (err) {
            setFormError(err.message);
        }
        finally {
            setSaving(false);
        }
    };

    const openHistory = async (store) => {
        setHistoryStore(store);
        setHistory([]);
        setHistoryLoading(true);
        try {
            const data = await callApi(`${API}/api/stores/${store.StoreId}/contract-history`);
            setHistory(Array.isArray(data) ? data : []);
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
        finally {
            setHistoryLoading(false);
        }
    };

    // ---------- ส่วนแสดงผล ----------
    const pill = (info) => (
      <span style={{ display: 'inline-flex', padding: '6px 10px', borderRadius: '999px', background: info.bg, color: info.color, fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>
        {info.label}
      </span>
    );
    const quickChip = (label, value) => (
      <button key={label} type="button" onClick={() => { setEndDate(value); setFormError(''); }} style={{
            border: `1px solid ${endDate === value ? T.primary : T.line}`,
            background: endDate === value ? T.primarySoft : T.surface,
            color: endDate === value ? T.primaryDark : T.text,
            borderRadius: '999px', padding: '7px 12px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_STACK
        }}>{label}</button>
    );
    const rangeBox = (label, start, end, tone) => (
      <div style={{ flex: 1, minWidth: '200px', padding: '13px 15px', borderRadius: T.radiusMd, border: `1px solid ${tone === 'danger' ? T.down : tone === 'new' ? T.primary : T.line}`, background: tone === 'danger' ? T.redSoft : tone === 'new' ? T.primarySoft : '#FAFBFD' }}>
        <div style={{ fontSize: '12px', color: T.muted, marginBottom: '5px' }}>{label}</div>
        <div style={{ fontSize: '15.5px', fontWeight: 700, color: T.ink }}>
          {start} <span style={{ color: T.muted, padding: '0 6px' }}>→</span> {end || '—'}
        </div>
        <div style={{ fontSize: '11.5px', color: T.muted, marginTop: '4px' }}>มีผลถึง 23:59:59 น. ของวันสิ้นสุด</div>
      </div>
    );

    return (<>
      {focusedStore && (
        <div style={{ marginBottom: '16px', padding: '12px 14px', border: `1px solid ${T.primary}`, borderRadius: T.radiusMd, background: T.primarySoft, display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ color: T.primaryDark }}>กำลังดูสัญญาร้าน {focusedStore.StoreName}</strong>
            <div style={{ ...captionStyle, marginTop: '3px' }}>เปิดมาจากหน้าอื่นของระบบ</div>
          </div>
          <Button variant="ghost" onClick={clearFocusStore}>ดูสัญญาทุกร้าน</Button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: '16px', marginBottom: '16px' }}>
        {[
            ['สัญญาปกติ', countOf('active'), T.greenSoft, T.up],
            ['ใกล้หมด ≤ 30 วัน', countOf('soon'), T.accentSoft, T.accentDark],
            ['หมดสัญญา', countOf('expired'), T.redSoft, T.down],
            ['ยังไม่เริ่ม / ไม่ระบุ', countOf('upcoming') + countOf('missing'), '#F2F3F7', T.muted]
        ].map(([label, value, bg, color]) => (
          <Card key={label} style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: '12.5px', color: T.muted, fontWeight: 600 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'end', gap: '7px', marginTop: '8px' }}>
              <span style={{ fontSize: '28px', lineHeight: 1, fontWeight: 700, color }}>{value}</span>
              <span style={{ fontSize: '12px', color: T.muted }}>ร้าน</span>
            </div>
            <div style={{ height: '4px', borderRadius: '99px', background: bg, marginTop: '14px' }}/>
          </Card>
        ))}
      </div>

      <Card style={{ marginBottom: '16px' }}>
        <div style={{ ...toolbarStyle, gap: '12px', alignItems: 'center' }}>
          <div>
            <h3 style={h3Style}>สัญญาร้านค้า</h3>
            <p style={captionStyle}>สัญญามีผลถึง 23:59:59 น. ของวันสิ้นสุด · หมดแล้วร้านปิดและพนักงานล็อกอัตโนมัติ เจ้าของดูข้อมูลได้อย่างเดียว 30 วัน · เอกสารสัญญาจัดการนอกระบบ</p>
          </div>
          <Button icon="refresh" variant="ghost" onClick={loadContracts} disabled={loadingContracts}>
            {loadingContracts ? 'กำลังโหลด...' : 'รีเฟรช'}
          </Button>
        </div>
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: '16px' }}>
          {filters.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setStatusFilter(id)} style={{
                border: `1px solid ${statusFilter === id ? T.primary : T.line}`,
                background: statusFilter === id ? T.primarySoft : T.surface,
                color: statusFilter === id ? T.primaryDark : T.text,
                borderRadius: '999px', padding: '9px 13px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_STACK
            }}>{label}</button>
          ))}
        </div>
      </Card>

      <Card>
        {loadError ? (
          <div style={{ padding: '24px', color: T.down, background: T.redSoft, borderRadius: T.radiusMd }}>{loadError}</div>
        ) : loadingContracts && !stores.length ? (
          <EmptyState text="กำลังโหลดข้อมูลสัญญา..."/>
        ) : filtered.length === 0 ? (
          <EmptyState text="ไม่พบข้อมูลสัญญาตามเงื่อนไขที่เลือก"/>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ ...tableStyle, minWidth: '880px' }}>
              <thead>
                <tr>
                  <th style={thStyle}>ร้านค้า</th>
                  <th style={{ ...thStyle, width: '230px' }}>ช่วงสัญญา</th>
                  <th style={{ ...thStyle, width: '150px' }}>คงเหลือ</th>
                  <th style={{ ...thStyle, width: '170px' }}>สถานะสัญญา</th>
                  <th style={{ ...thStyle, width: '250px', textAlign: 'right' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((store) => {
                    const key = store.contract.key;
                    return (
                  <tr key={store.StoreId} style={trStyle}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700, color: T.ink }}>{store.StoreName}</div>
                      <div style={{ fontSize: '11.5px', color: T.muted, marginTop: '3px' }}>รหัสร้าน #{store.StoreId}</div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700, color: T.ink, whiteSpace: 'nowrap' }}>
                        {fmt(store.ContractStartDate)} <span style={{ color: T.muted, padding: '0 4px' }}>→</span> {fmt(store.ContractEndDate)}
                      </div>
                      {store.ContractEndDate && <div style={{ fontSize: '11.5px', color: T.muted, marginTop: '3px' }}>สิ้นสุด 23:59:59 น.</div>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ color: key === 'expired' ? T.down : T.text, fontWeight: key === 'expired' ? 700 : 500 }}>{remainingText(store)}</div>
                      {key === 'expired' && store.AutoDeleteInDays !== null && store.AutoDeleteInDays !== undefined && (
                        <div style={{ fontSize: '11.5px', color: T.muted, marginTop: '3px' }}>ลบอัตโนมัติใน {Math.max(0, store.AutoDeleteInDays)} วัน</div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {pill(store.contract)}
                      {Number(store.OpenOrderCount || 0) > 0 && key === 'expired' && (
                        <div style={{ fontSize: '11.5px', color: T.accentDark, marginTop: '5px', fontWeight: 600 }}>ออเดอร์ค้าง {store.OpenOrderCount} รายการ</div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', flexWrap: 'wrap' }}>
                        {key === 'expired' ? (
                          <Button variant="danger" icon="ban" onClick={() => openRestart(store)} style={smallBtn} title="ร้านนี้ต่อสัญญาภายนอกแล้ว? กดเพื่อเปิดสัญญารอบใหม่">
                            หมดสัญญา
                          </Button>
                        ) : key === 'missing' ? (
                          <Button variant="soft" icon="plus" onClick={() => openRestart(store)} style={smallBtn}>
                            กำหนดสัญญา
                          </Button>
                        ) : (
                          <Button variant="soft" icon="edit" onClick={() => openEdit(store)} style={smallBtn}>
                            แก้วันสิ้นสุด
                          </Button>
                        )}
                        <Button variant="ghost" icon="history" onClick={() => openHistory(store)} style={smallBtn}>
                          ประวัติ
                        </Button>
                      </div>
                    </td>
                  </tr>);
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------- modal แก้วันสิ้นสุด / เปิดสัญญารอบใหม่ ---------- */}
      <Modal open={Boolean(dialog)} width={620} onClose={closeDialog}
        title={isEdit ? 'แก้วันสิ้นสุดสัญญา' : (dStore?.ContractState === 'NONE' ? 'กำหนดสัญญาร้าน' : 'เปิดสัญญารอบใหม่')}
        subtitle={dStore ? `ร้าน ${dStore.StoreName}` : ''}
        footer={<>
          <Button variant="ghost" onClick={closeDialog} disabled={saving}>ยกเลิก</Button>
          <Button icon="check" variant={isBackdate ? 'danger' : 'primary'} onClick={submit} disabled={saving || !endDate || !reasonOk}>
            {saving ? 'กำลังบันทึก...' : isEdit ? (isBackdate ? 'ยืนยันตัดสัญญาย้อนหลัง' : 'บันทึกวันสิ้นสุดใหม่') : 'เปิดสัญญารอบใหม่'}
          </Button>
        </>}>
        {dStore && (<div>
          {!isEdit && dStore.ContractState === 'EXPIRED' && (
            <div style={{ padding: '12px 14px', borderRadius: T.radiusMd, background: T.redSoft, color: T.down, fontSize: '12.5px', lineHeight: 1.6, marginBottom: '14px' }}>
              สัญญาเดิมหมดเมื่อ {oldEnd} 23:59:59 น. ร้านเปิดขายไม่ได้ — ใช้ปุ่มนี้เมื่อร้านต่อสัญญากับศูนย์อาหารภายนอกแล้วเท่านั้น
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {dStore.ContractEndDate && rangeBox(isEdit ? 'สัญญาปัจจุบัน' : 'สัญญาเดิม', fmt(dStore.ContractStartDate), oldEnd, 'old')}
            {rangeBox(isEdit ? 'หลังแก้ไข' : 'สัญญารอบใหม่', dStart, endDate, isBackdate ? 'danger' : 'new')}
          </div>

          {!isEdit && (
            <Field label="วันเริ่มสัญญารอบใหม่ (ปี ค.ศ.)" required hint="ค่าเริ่มต้นคือวันนี้ เลือกวันข้างหน้าได้ ย้อนหลังไม่ได้">
              <input type="date" value={startDate} min={today}
                onChange={(e) => changeStart(e.target.value)}
                style={formDateInputStyle}/>
            </Field>
          )}
          <Field label="วันสิ้นสุดสัญญาใหม่ (ปี ค.ศ.)" required
            hint={isEdit ? 'วันเริ่มสัญญาคงเดิม แก้ได้เฉพาะวันสิ้นสุด' : 'ค่าเริ่มต้น 1 ปีนับจากวันเริ่ม ปรับตามเอกสารจริงได้'}>
            <input type="date" value={endDate} min={isEdit ? yesterday : startDate}
              onChange={(e) => { setEndDate(e.target.value); setFormError(''); setAckBackdate(false); }}
              style={formDateInputStyle}/>
          </Field>
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', margin: '-4px 0 16px' }}>
            {isEdit
                ? [quickChip('+6 เดือน', addMonthsToISO(oldEnd, 6)), quickChip('+1 ปี', addMonthsToISO(oldEnd, 12)), quickChip('คืนค่าเดิม', oldEnd), quickChip('ตัดสัญญาทันที', yesterday)]
                : [quickChip('6 เดือน', minusOneDayISO(addMonthsToISO(startDate, 6))), quickChip('1 ปี', addYearsMinusOneDayISO(startDate, 1)), quickChip('2 ปี', addYearsMinusOneDayISO(startDate, 2))]}
          </div>

          <Field label="เหตุผล / อ้างอิงเอกสาร" required
            hint={`บันทึกเป็นหลักฐานพร้อมชื่อผู้แก้และเวลา แก้ภายหลังไม่ได้ (${reason.trim().length}/255)`}>
            <textarea value={reason} rows={3} maxLength={255}
              onChange={(e) => { setReason(e.target.value); setFormError(''); }}
              placeholder={isEdit ? 'เช่น ต่อสัญญาตามหนังสือเลขที่ 12/2569 ลงวันที่ 1 ต.ค. 2569' : 'เช่น ชนะประมูลรอบปี 2570 ตามประกาศเลขที่ 3/2569'}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: FONT_STACK }}/>
          </Field>

          {isBackdate && (
            <div style={{ padding: '13px 15px', borderRadius: T.radiusMd, background: T.redSoft, border: `1px solid ${T.down}33`, marginBottom: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: T.down, marginBottom: '4px' }}>วันสิ้นสุดอยู่ก่อนวันนี้ = ร้านหมดสัญญาทันที</div>
              <div style={{ fontSize: '12px', color: T.text, lineHeight: 1.6 }}>
                                ร้านจะถูกปิดและรับออเดอร์ใหม่ไม่ได้ทันทีหลังบันทึก พนักงานร้านถูกออกจากระบบ เจ้าของร้านดูข้อมูลได้อย่างเดียวไม่เกิน 30 วันหลังวันสิ้นสุด ออเดอร์และยอดขายเดิมยังอยู่ครบ
                {Number(dStore.OpenOrderCount || 0) > 0 && <b> · ตอนนี้ยังมีออเดอร์ค้าง {dStore.OpenOrderCount} รายการ ร้านจะยังเคลียร์ออเดอร์ได้ เมื่อจบครบพนักงานจะถูกออกจากระบบเอง</b>}
              </div>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', fontSize: '12.5px', fontWeight: 600, color: T.ink, cursor: 'pointer' }}>
                <input type="checkbox" checked={ackBackdate} onChange={(e) => { setAckBackdate(e.target.checked); setFormError(''); }}/>
                เข้าใจแล้ว ต้องการตัดสัญญาย้อนหลัง
              </label>
            </div>
          )}

          {formError && (
            <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: T.radiusMd, background: T.redSoft, color: T.down, fontSize: '12.5px', fontWeight: 600 }}>
              {formError}
            </div>
          )}
        </div>)}
      </Modal>

      {/* ---------- modal ประวัติสัญญา ---------- */}
      <Modal open={Boolean(historyStore)} width={680} onClose={() => setHistoryStore(null)}
        title="ประวัติสัญญา" subtitle={historyStore ? `ร้าน ${historyStore.StoreName} · บันทึกทุกครั้งที่มีการกำหนดหรือแก้วันสัญญา` : ''}>
        {historyLoading ? (
          <EmptyState text="กำลังโหลดประวัติ..." minHeight="140px"/>
        ) : history.length === 0 ? (
          <EmptyState text="ยังไม่มีประวัติการแก้สัญญา" minHeight="140px"/>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {history.map((h) => {
                const oldV = h.OldValue || {};
                const newV = h.NewValue || {};
                const danger = ['CONTRACT_END_BACKDATED', 'AUTO_DELETE_STORE', 'DELETE_STORE'].includes(h.ActionCode);
                return (
              <div key={h.AuditLogId} style={{ padding: '13px 15px', border: `1px solid ${T.line}`, borderLeft: `4px solid ${danger ? T.down : T.primary}`, borderRadius: T.radiusMd, background: T.surface }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <Badge tone={danger ? 'danger' : 'ok'}>{CONTRACT_ACTION_LABEL[h.ActionCode] || h.ActionCode}</Badge>
                  <span style={{ fontSize: '12px', color: T.muted }}>{thaiDateTime(h.CreatedAt)}</span>
                </div>
                {(oldV.end || newV.end) && (
                  <div style={{ marginTop: '9px', fontSize: '13.5px', color: T.ink, fontWeight: 600 }}>
                    {oldV.end ? `${fmt(oldV.start)} → ${fmt(oldV.end)}` : '—'}
                    {newV.end && <><span style={{ color: T.muted, padding: '0 8px' }}>เป็น</span>{fmt(newV.start)} → {fmt(newV.end)}</>}
                  </div>
                )}
                {newV.reason && <div style={{ marginTop: '6px', fontSize: '12.5px', color: T.text }}>เหตุผล: {newV.reason}</div>}
                <div style={{ marginTop: '6px', fontSize: '12px', color: T.muted }}>
                  โดย {h.PerformedByName ? `${h.PerformedByName} (${h.PerformedByUsername})` : 'ระบบอัตโนมัติ'}
                </div>
              </div>);
            })}
          </div>
        )}
      </Modal>
    </>);
}

// ===== ประวัติการดำเนินการ: ตรวจสอบกิจกรรมสำคัญในระบบ =====
// ค้นหา/กรองที่ backend (ค้นได้ทั้งตาราง) แล้วโหลดทีละ AUDIT_PAGE_SIZE รายการ กด "โหลดเพิ่ม" เพื่อดูเก่ากว่า
const AUDIT_PAGE_SIZE = 100;
// ชื่อภาษาไทยของการดำเนินการ (ใช้ทั้งแสดงผลและแปลงคำค้นภาษาไทยเป็น ActionCode ส่งให้ backend)

// กลุ่มของการกระทำ : ต้องตรงกับ _AUDIT_GROUPS ใน backend/routers/reports.py (เช็คตามลำดับ กลุ่มแรกที่ตรงชนะ)
const AUDIT_GROUP_WORDS = [
    ['store', ['STORE', 'SUSPEND']],
    ['account', ['ACCOUNT', 'USER', 'STAFF', 'PASSWORD']],
    ['payment', ['SLIP', 'PAYMENT', 'REFUND']],
    ['order', ['ORDER', 'CANCEL', 'STATUS', 'QUEUE', 'PRINT']]
];
const AUDIT_GROUP_META = {
    store: { label: 'ร้านค้า', bg: T.primarySoft, color: T.primaryDark },
    account: { label: 'บัญชีผู้ใช้', bg: T.deepSoft, color: T.deep },
    payment: { label: 'การชำระเงิน', bg: T.accentSoft, color: T.accentDark },
    order: { label: 'ออเดอร์', bg: T.greenSoft, color: T.up },
    other: { label: 'อื่น ๆ', bg: '#F2F3F7', color: T.text }
};
// ตัวกรองหน้า Audit Log : ชิปกลุ่ม + ช่องเลือกการกระทำ ทรงเดียวกัน (มนสุด สูง 36px)
const auditChipStyle = (active) => ({
    display: 'inline-flex', alignItems: 'center', gap: '7px', height: '36px', boxSizing: 'border-box',
    border: `1px solid ${active ? T.primary : T.line}`, backgroundColor: active ? T.primarySoft : T.surface,
    color: active ? T.primaryDark : T.text, borderRadius: '999px', padding: '0 14px',
    fontSize: '12.5px', fontWeight: 600, fontFamily: FONT_STACK, cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'background .15s ease, border-color .15s ease'
});
const auditActionSelectStyle = (active) => ({
    ...auditChipStyle(active), appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', outline: 'none',
    minWidth: '210px', paddingLeft: '36px', paddingRight: '36px',
    backgroundImage: active ? 'none' : SELECT_CHEVRON, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center'
});
const auditGroupOf = (action) => {
    const key = String(action || '').toUpperCase();
    return AUDIT_GROUP_WORDS.find(([, words]) => words.some((word) => key.includes(word)))?.[0] || 'other';
};

function AuditHistoryPage({ ctx }) {
    const { API } = ctx;
    const [logs, setLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [actionFilter, setActionFilter] = useState('');  // กรองการกระทำเดียว เช่น CANCEL_ORDER
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const requestNo = useRef(0);  // พิมพ์เร็ว ๆ แล้วผลเก่ากลับมาทีหลัง -> ทิ้ง

    const auditUrl = useCallback((offset) => {
        const params = new URLSearchParams({ limit: String(AUDIT_PAGE_SIZE), offset: String(offset) });
        const keyword = query.trim().toLowerCase();
        if (keyword) {
            params.set('q', keyword);
            const codes = auditCodesMatching(keyword);
            if (codes.length) params.set('actions', codes.join(','));
        }
                if (filter !== 'all') params.set('group', filter);
        if (actionFilter) params.set('action', actionFilter);
        return `${API}/api/audit-logs?${params}`;
    }, [API, query, filter, actionFilter]);

    const loadLogs = useCallback(async () => {
        const no = ++requestNo.current;
        setLoadingLogs(true);
        try {
            const data = await callApi(auditUrl(0));
            if (no !== requestNo.current) return;
            const rows = Array.isArray(data) ? data : [];
            setLogs(rows);
            setHasMore(rows.length === AUDIT_PAGE_SIZE);
            setLoadError('');
        }
        catch (err) {
            if (no === requestNo.current) setLoadError(err.message);
        }
        finally {
            if (no === requestNo.current) setLoadingLogs(false);
        }
    }, [auditUrl]);

    const loadMore = async () => {
        const no = requestNo.current;
        setLoadingMore(true);
        try {
            const data = await callApi(auditUrl(logs.length));
            if (no !== requestNo.current) return;
            const rows = Array.isArray(data) ? data : [];
            setLogs((prev) => {
                const seen = new Set(prev.map((log) => log.LogID));
                return [...prev, ...rows.filter((log) => !seen.has(log.LogID))];
            });
            setHasMore(rows.length === AUDIT_PAGE_SIZE);
        }
        catch (err) {
            setLoadError(err.message);
        }
        finally {
            setLoadingMore(false);
        }
    };

    // พิมพ์ค้นหา/เปลี่ยนตัวกรอง -> รอหยุดพิมพ์ 0.35 วิ แล้วค้นที่ backend ใหม่
    useEffect(() => {
        const timer = setTimeout(loadLogs, 350);
        return () => clearTimeout(timer);
    }, [loadLogs]);

        const actionMeta = (action) => AUDIT_GROUP_META[auditGroupOf(action)];

    
    const actionName = (action) => {
        const names = {
            CREATE_STORE: 'CREATE STORE',
            UPDATE_STORE: 'UPDATE STORE',
            DELETE_STORE: 'DELETE STORE',
            OPEN_STORE: 'OPEN STORE',
            CLOSE_STORE: 'CLOSE STORE',
            SUSPEND_STORE: 'SUSPEND STORE',
            UNSUSPEND_STORE: 'UNSUSPEND STORE',
            RENEW_CONTRACT: 'RENEW CONTRACT',
            OPEN_FOOD_COURT: 'OPEN FOOD COURT',
            UPDATE_FOOD_COURT_SCHEDULE: 'UPDATE FOOD COURT SCHEDULE',
            FOOD_COURT_AUTO_MODE: 'RESTORE AUTOMATIC MODE',
            CLOSE_FOOD_COURT: 'CLOSE FOOD COURT',
            CREATE_ACCOUNT: 'CREATE ACCOUNT',
            CREATE_STORE_ACCOUNT: 'CREATE STORE ACCOUNT',
            UPDATE_STORE_ACCOUNT: 'UPDATE STORE ACCOUNT',
            DELETE_STORE_ACCOUNT: 'DELETE STORE ACCOUNT',
            UPDATE_ACCOUNT: 'UPDATE ACCOUNT',
            DELETE_ACCOUNT: 'DELETE ACCOUNT',
            RESET_PASSWORD: 'RESET PASSWORD',
            VERIFY_SLIP_APPROVE: 'APPROVE PAYMENT SLIP',
            VERIFY_SLIP_REJECT: 'REJECT PAYMENT SLIP',
            CREATE_ORDER: 'CREATE ORDER',
            UPDATE_STATUS: 'UPDATE ORDER STATUS',
            PRINT_ORDER: 'PRINT ORDER',
            RECALL_QUEUE: 'RECALL QUEUE',
            CANCEL_REQUEST: 'REQUEST ORDER CANCELLATION',
            CUSTOMER_CANCEL_ORDER: 'CUSTOMER CANCEL ORDER',
            CANCEL_ORDER: 'CANCEL ORDER'
        };

        return names[String(action || '').toUpperCase()]
            || String(action || '-').replaceAll('_', ' ');
    };

    const filtered = logs;  // backend ค้น/กรองมาให้แล้ว

    const filters = [
        ['all', 'ทั้งหมด'],
        ['store', 'ร้านค้า'],
        ['account', 'บัญชีผู้ใช้'],
        ['order', 'ออเดอร์'],
        ['payment', 'การชำระเงิน']
    ];
    // ตัวเลือกการกระทำ : เฉพาะที่อยู่ในกลุ่มที่เลือก
    const actionOptions = Object.keys(AUDIT_VERBS).filter((code) => filter === 'all' || auditGroupOf(code) === filter);

    return (<>
      <Card style={{ marginBottom: '16px' }}>
        <div style={{ ...toolbarStyle, gap: '14px', alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={h3Style}>กิจกรรมล่าสุด</h3>
            <p style={captionStyle}>แสดงประวัติการดำเนินการสำคัญล่าสุดที่ถูกบันทึกไว้ในระบบ</p>
          </div>
          <Button icon="refresh" tone="secondary" onClick={loadLogs} disabled={loadingLogs}>
            {loadingLogs ? 'กำลังโหลด...' : 'รีเฟรช'}
          </Button>
        </div>

                <div style={{ position: 'relative', marginTop: '18px' }}>
          <Icon name="search" size={17} color={T.muted} style={{position: 'absolute',left: '13px',top: '50%',transform: 'translateY(-50%)'}}/>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาการดำเนินการ ผู้ดำเนินการ หรือรายละเอียด..."
            style={{ ...inputStyle, width: '100%', paddingLeft: '40px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
            {filters.map(([id, label]) => (<button key={id} type="button" onClick={() => { setFilter(id); setActionFilter(''); }} style={auditChipStyle(filter === id)}>
              {AUDIT_GROUP_META[id] && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: AUDIT_GROUP_META[id].color }}/>}
              {label}
            </button>))}
          </div>
          <span style={{ width: '1px', height: '24px', background: T.line }}/>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <Icon name="filter" size={15} color={actionFilter ? T.primaryDark : T.muted} style={{ position: 'absolute', left: '14px', pointerEvents: 'none' }}/>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={auditActionSelectStyle(Boolean(actionFilter))} aria-label="กรองตามการกระทำ">
              <option value="">ทุกการกระทำ</option>
              {actionOptions.map((code) => <option key={code} value={code}>{AUDIT_VERBS[code]}</option>)}
            </select>
            {actionFilter && (<button type="button" onClick={() => setActionFilter('')} aria-label="ล้างตัวกรองการกระทำ" style={{ position: 'absolute', right: '8px', width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: T.surface, color: T.primaryDark, display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}>
              <Icon name="close" size={12}/>
            </button>)}
          </div>
        </div>
      </Card>

      <Card>
        {loadError ? (<div style={{padding: '24px',borderRadius:T.radiusMd,background:T.redSoft,color:T.down,fontSize: '14px'}}>{loadError}</div>) : loadingLogs ? (<div style={{padding: '48px 20px',textAlign: 'center',color:T.muted,fontSize: '14px'}}>กำลังโหลดประวัติการดำเนินการ...</div>) : filtered.length === 0 ? (<div style={{padding: '48px 20px',textAlign: 'center',color:T.muted}}>
          <div style={{width: '48px',height: '48px',margin: '0 auto 12px',borderRadius: '50%',background:T.primarySoft,display: 'grid',placeItems: 'center',color:T.primary}}><Icon name="history" size={23}/></div>
          <div style={{ fontWeight: 600, color: T.text, marginBottom: '4px' }}>ไม่พบประวัติการดำเนินการ</div>
          <div style={{ fontSize: '13px' }}>ลองเปลี่ยนคำค้นหาหรือตัวกรอง</div>
        </div>) : (<div style={{ overflowX: 'auto' }}>
          <table style={{ ...tableStyle, minWidth: '820px' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '160px' }}>วันและเวลา</th>
                <th style={{ ...thStyle, width: '190px' }}>การดำเนินการ</th>
                <th style={{ ...thStyle, width: '150px' }}>ผู้ดำเนินการ</th>
                <th style={thStyle}>รายละเอียด</th>
                <th style={{ ...thStyle, width: '120px' }}>ประเภท</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => {
                  const meta = actionMeta(log.Action);
                  return (<tr key={log.LogID} style={trStyle}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: T.muted }}>
                      {thaiDateTime(log.CreatedAt)}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: T.ink }}>{actionName(log.Action)}</div>
                      <div style={{ fontSize: '11.5px', color: T.muted, marginTop: '3px' }}>
                        #{log.LogID}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                        <span style={{width: '30px',height: '30px',borderRadius: '50%',display: 'grid',placeItems: 'center',background:T.deepSoft,color:T.deep,fontSize: '12px',fontWeight:700,flexShrink:0}}>{String(log.PerformerRole || log.PerformedBy || 'E').charAt(0).toUpperCase()}</span>
                        <span style={{ fontWeight: 500, color: T.text }}>{log.PerformerRole || log.PerformedBy || '—'}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, lineHeight: 1.55 }}>{formatAuditDetails(log)}</td>
                    <td style={tdStyle}>
                      <span style={{display: 'inline-flex',alignItems: 'center',padding: '6px 10px',borderRadius: '999px',background:meta.bg,color:meta.color,fontSize: '11.5px',fontWeight:600,whiteSpace: 'nowrap'}}>{meta.label}</span>
                    </td>
                  </tr>);
              })}
            </tbody>
                    </table>
        </div>)}
        {!loadError && !loadingLogs && logs.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '16px', fontSize: '12.5px', color: T.muted }}>
            <span>แสดง {logs.length} รายการ{hasMore ? '' : ' (ครบแล้ว)'}</span>
            {hasMore && (
              <Button tone="secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'กำลังโหลด...' : 'โหลดเพิ่ม'}
              </Button>
            )}
          </div>
        )}
      </Card>
    </>);
}
// ===== ข้อมูลผู้ใช้
const historyThStyle = { padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap' };
const historyTdStyle = { padding: '16px', textAlign: 'left', verticalAlign: 'top', fontSize: '13px', color: T.text };

function CustomerInfoPage({ ctx }) {
    const { API, pushToast } = ctx;
    const isCompact = useIsNarrow(700);
    const [query, setQuery] = useState(''), [customers, setCustomers] = useState([]), [loading, setLoading] = useState(false), [searched, setSearched] = useState(false), [error, setError] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [activities, setActivities] = useState([]);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityError, setActivityError] = useState('');
    const searchCustomers = async () => {
    const keyword = query.trim();
    if (!keyword) {
        setCustomers([]); setSearched(false); setError(''); setSelectedCustomer(null); setActivities([]); setActivityError(''); return;
    }
    setSelectedCustomer(null); setActivities([]); setActivityError(''); setLoading(true); setError('');
    try {
        const data = await callApi(`${API}/api/executive/customers?search=${encodeURIComponent(keyword)}`);
        setCustomers(Array.isArray(data) ? data : []); setSearched(true);
    } catch (err) {
        setCustomers([]); setSearched(true); setError(err.message);
    } finally { setLoading(false); }
};
    const openCustomer = async (customer) => {
    setSelectedCustomer(customer); setActivities([]); setActivityLoading(true); setActivityError('');
    try {
        const [orders, reviews, issues] = await Promise.all([
            callApi(`${API}/api/orders?user_id=${customer.UserId}`),
            callApi(`${API}/api/executive/customers/${customer.UserId}/reviews`),
            callApi(`${API}/api/executive/customers/${customer.UserId}/issues`)
        ]);
        const orderEvents = (Array.isArray(orders) ? orders : []).map(order => ({ type: 'order', id: `order-${order.OrderID}`, date: order.CreatedAt || order.OrderTime, data: order }));
        const reviewEvents = (Array.isArray(reviews) ? reviews : []).map(review => ({ type: 'review', id: `review-${review.ReviewId}`, date: review.CreatedAt, data: review }));
        const issueEvents = (Array.isArray(issues) ? issues : []).map(issue => ({ type: 'issue', id: `issue-${issue.ReportID}`, date: issue.CreatedAt, data: issue }));
        const combined = [...orderEvents, ...reviewEvents, ...issueEvents].sort((a, b) => {
        const aTime = parseOrderDate(a.date)?.getTime() || 0;
        const bTime = parseOrderDate(b.date)?.getTime() || 0;
        return bTime - aTime;
    });
        setActivities(combined);
    } catch (err) { setActivityError(err.message); }
    finally { setActivityLoading(false); }};
    return (
        <Card title="ค้นหาข้อมูลผู้ใช้" subtitle="ค้นหาเฉพาะบัญชี Customer ด้วย User ID, Username หรือชื่อผู้ใช้">
            <form onSubmit={e => { e.preventDefault(); searchCustomers(); }} style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px', flex: '1 1 320px' }}>
                    <Icon name="search" size={17} color={T.muted}/>
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="User ID, Username หรือชื่อผู้ใช้" style={{ ...searchInputStyle, padding: '11px 0', width: '100%' }}/>
                </div>
                <Button type="submit" icon="search" disabled={loading || !query.trim()}>{loading ? 'กำลังค้นหา...' : 'ค้นหา'}</Button>
            </form>

            {error && <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: T.radiusMd, background: T.redSoft, color: T.down, fontSize: '13px' }}>{error}</div>}
            {!loading && searched && !error && customers.length === 0 && <EmptyState text="ไม่พบ Customer ที่ตรงกับคำค้นหา" minHeight="150px"/>}

            {customers.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
    {customers.map(customer => <div key={customer.UserId} style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: '16px', background: T.surface }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: T.ink, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {customer.FullName || 'ไม่ระบุชื่อ'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isCompact ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: '12px', minWidth: 0 }}>
            <div><strong>User ID:</strong> {customer.UserId}</div>
            <div><strong>Username:</strong> {customer.Username || '—'}</div>
            <div><strong>Role:</strong> {customer.Role || '—'}</div>
            <div><strong>Email:</strong> {customer.Email || '—'}</div>
            <div><strong>Phone:</strong> {customer.Phone || '—'}</div>
        </div>
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button icon="history" onClick={() => openCustomer(customer)}>ดูข้อมูลและประวัติ</Button>
        </div>
    </div>)}
</div>}

{selectedCustomer && <div style={{ marginTop: '24px', paddingTop: '22px', borderTop: `1px solid ${T.line}` }}>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: T.ink }}>ประวัติพฤติกรรม</div>
            <div style={{ marginTop: '4px', fontSize: '13px', color: T.muted }}>{selectedCustomer.FullName || 'ไม่ระบุชื่อ'} • User ID: {selectedCustomer.UserId} • {selectedCustomer.Username || 'ไม่ระบุ Username'}</div>
        </div>
        {!activityLoading && !activityError && <div style={{ fontSize: '13px', color: T.muted }}>ทั้งหมด {activities.length} รายการ</div>}
    </div>

    {activityLoading && <div style={{ padding: '28px 0', textAlign: 'center', color: T.muted }}>กำลังโหลดประวัติ...</div>}
    {activityError && <div style={{ padding: '12px 14px', borderRadius: T.radiusMd, background: T.redSoft, color: T.down }}>{activityError}</div>}
    {!activityLoading && !activityError && activities.length === 0 && <EmptyState text="ยังไม่มีประวัติการใช้งาน" minHeight="140px"/>}

    {!activityLoading && !activityError && activities.length > 0 && <div style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, overflowX: 'auto', background: T.surface }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead><tr style={{ borderBottom: `1px solid ${T.line}` }}>
                <th style={historyThStyle}>วันและเวลา</th><th style={historyThStyle}>กิจกรรม</th><th style={historyThStyle}>ร้านค้า</th><th style={historyThStyle}>รายละเอียด</th><th style={historyThStyle}>สถานะ / ประเภท</th>
            </tr></thead>
            <tbody>
                {activities.map(activity => {
                    const data = activity.data;
                    let activityName = '', storeName = data.StoreName || '—', detail = '', badgeText = '', badgeStyle = { background: T.surface2, color: T.text };

                    if (activity.type === 'order') {
                        activityName = 'สั่งอาหาร';
                        detail = (data.items || []).map(item => `${item.ProductName} × ${item.Qty}`).join(', ') || 'ไม่มีรายละเอียดเมนู';
                        if (data.CancelReason) detail += ` • เหตุผลการยกเลิก: ${data.CancelReason}`;
                        badgeText = data.Status || 'Order';
                        const status = String(data.Status || '').toLowerCase();
                        if (status === 'completed') badgeStyle = { background: '#E8F7EF', color: '#18864B' };
                        else if (status === 'cancelled' || status === 'canceled') badgeStyle = { background: '#FFF0EB', color: '#D95432' };
                    }

                    if (activity.type === 'review') {
                        activityName = 'รีวิว';
                        detail = `คะแนน ${data.Rating ?? '—'}/5`;
                        if (data.Comment) detail += ` • ${data.Comment}`;
                        badgeText = 'รีวิว';
                        badgeStyle = { background: '#FFF5D9', color: '#A66B00' };
                    }

                    if (activity.type === 'issue') {
                        activityName = 'แจ้งปัญหา';
                        detail = data.Description || 'ไม่มีรายละเอียด';
                        if (data.AdminNote) detail += ` • หมายเหตุ: ${data.AdminNote}`;
                        badgeText = data.IssueType || 'แจ้งปัญหา';
                        badgeStyle = { background: '#FFF0EB', color: '#D95432' };
                    }

                    return <tr key={activity.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                        <td style={historyTdStyle}><div style={{ color: T.muted, whiteSpace: 'nowrap' }}>{activity.date ?  thaiDateTime(activity.date): 'ไม่ระบุวันที่'}</div></td>
                        <td style={historyTdStyle}><div style={{ fontWeight: 700, color: T.ink }}>{activityName}</div></td>
                        <td style={historyTdStyle}>{storeName}</td>
                        <td style={{ ...historyTdStyle, minWidth: '280px' }}>{detail}</td>
                        <td style={historyTdStyle}><span style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', ...badgeStyle }}>{badgeText}</span></td>
                    </tr>;
                })}
            </tbody>
        </table>
    </div>}
</div>}

</Card>
);
}

// ===== บัญชีร้านค้า: สร้างและจัดการบัญชีผู้ใช้ของร้าน =====
function StoreAccountsPage({ ctx }) {
    const { API, user, stores, search, pushToast, ask } = ctx;
    const [accounts, setAccounts] = useState([]);
    const [loadError, setLoadError] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [mode, setMode] = useState('create');
    const [form, setForm] = useState(EMPTY_ACCOUNT_FORM);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const loadAccounts = useCallback(async () => {
        try {
            const data = await callApi(`${API}/api/store-accounts`);
            setAccounts(Array.isArray(data) ? data : []);
            setLoadError('');
        }
        catch (err) {
            setLoadError(err.message);
        }
    }, [API]);
    useEffect(() => {
        loadAccounts();
    }, [loadAccounts]);
    const storeName = (id,account = null) => { if (account?.StoreName) {   return account.StoreName;}
    return stores.find( (s) => String(s.StoreId) === String(id)  )?.StoreName || '—'; };
    const rows = accounts.filter((a) => {
        if (a.Role !== 'Shop Owner') return false;
        const storeStillActive = stores.some((s) => String(s.StoreId) === String(a.StoreId)   );
        if (!storeStillActive) return false;
        const text = `${a.Username} ${a.FullName} ${storeName(a.StoreId, a)}`.toLowerCase();
        return text.includes(search);
    });
    const openCreate = () => {
        if (!stores.length) {
            pushToast('ยังไม่มีร้านค้าในระบบ ให้เพิ่มร้านค้าก่อนจึงจะออกบัญชีได้', 'warn');
            return;
        }
        setMode('create');
        setForm(EMPTY_ACCOUNT_FORM);
        setErrors({});
        setModalOpen(true);
    };
    const openResetPassword = (account) => {
        setMode('password');
        setForm({
            storeId: account.StoreId || '',
            role: account.Role,
            fullName: account.FullName,
            username: account.Username,
            password: '',
            confirm: '',
            userId: account.UserId
        });
        setErrors({});
        setModalOpen(true);
    };
    const submit = async () => {
        const found = validateAccountForm(form, mode);
        setErrors(found);
        if (Object.keys(found).length) {
            pushToast('ยังกรอกข้อมูลไม่ครบหรือไม่ถูกต้อง กรุณาตรวจสอบช่องที่มีข้อความสีแดง', 'error');
            return;
        }
        setSaving(true);
        try {
            if (mode === 'password') {
                await callApi(`${API}/api/store-accounts/${form.userId}/password`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        password: form.password,
                        full_name: form.fullName.trim(),
                        role: form.role,
                        store_id: Number(form.storeId),
                        performed_by: 'Executive'
                    })
                });
                pushToast('อัปเดตบัญชีร้านค้าเรียบร้อยแล้ว');
            }
            else {
                await callApi(`${API}/api/store-accounts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: form.username.trim(),
                        password: form.password,
                        full_name: form.fullName.trim(),
                        role: form.role,
                        store_id: Number(form.storeId),
                        performed_by: 'Executive'
                    })
                });
                pushToast('สร้างบัญชีให้ร้านค้าเรียบร้อยแล้ว');
            }
            setModalOpen(false);
            await loadAccounts();
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
        finally {
            setSaving(false);
        }
    };
    const removeAccount = async (account) => {
        const ok = await ask({
            title: 'ลบบัญชีผู้ใช้',
            message: `ยืนยันลบบัญชี "${account.Username}" (${account.FullName}) ใช่หรือไม่`,
            warning: 'ผู้ใช้รายนี้จะเข้าสู่ระบบไม่ได้อีก',
            confirmText: 'ลบบัญชี',
            danger: true
        });
        if (!ok)
            return;
        try {
            await callApi(`${API}/api/store-accounts/${account.UserId}`, { method: 'DELETE' });
            pushToast('ลบบัญชีเรียบร้อยแล้ว');
            await loadAccounts();
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
    };
    const update = (key) => (e) => {
        setForm((prev) => ({ ...prev, [key]: e.target.value }));
        setErrors((prev) => ({ ...prev, [key]: undefined }));
    };
    return (<>
      <Card style={{ marginBottom: '16px' }}>
        <div style={toolbarStyle}>
          <div>
            <h3 style={h3Style}>บัญชีสำหรับร้านค้า</h3>
            <p style={captionStyle}>
              ออกชื่อผู้ใช้และรหัสผ่านให้ร้าน แล้วร้านจะล็อกอินไปเพิ่มเมนูและจัดการออเดอร์ของตัวเองได้
            </p>
          </div>
          <Button icon="plus" onClick={openCreate}>
            สร้างบัญชีร้านค้า
          </Button>
        </div>
      </Card>

      {loadError && (<Card style={{ marginBottom: '16px', borderLeft: `4px solid ${T.accent}` }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Icon name="info" size={18} color="#9A6400"/>
            <div>
              <strong style={{ color: T.ink }}>ยังใช้งานหน้านี้ไม่ได้</strong>
              <p style={{ ...bodyStyle, margin: '6px 0 0' }}>{loadError}</p>
              
            </div>
          </div>
        </Card>)}

      <Card title="รายชื่อบัญชีเจ้าของร้าน" subtitle={`${money(rows.length)} บัญชีเจ้าของร้านที่แสดงอยู่`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ชื่อผู้ใช้</th>
                <th style={thStyle}>ชื่อ-นามสกุล</th>
                <th style={thStyle}>ตำแหน่ง</th>
                <th style={thStyle}>ร้านค้า</th>
                <th style={thStyle}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (<tr key={a.UserId} style={trStyle}>
                  <td style={tdStyle}>
                    <strong style={{ color: T.ink }}>{a.Username}</strong>
                  </td>
                  <td style={tdStyle}>{a.FullName}</td>
                  <td style={tdStyle}>
                    <Badge tone={a.Role === 'Shop Owner' ? 'warn' : 'neutral'}>
                      {ROLE_LABEL[a.Role] || a.Role}
                    </Badge>
                  </td>
                  <td style={tdStyle}> <div>{storeName(a.StoreId,a)}</div> 
                  {Boolean(a.StoreIsDeleted) && ( <div style={{marginTop: '4px',fontSize: '12px',fontWeight: 700,color: '#E2452F'  }}>ร้านถูกลบแล้ว </div>)}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <Button variant="ghost" icon="key" disabled={Boolean(a.StoreIsDeleted)} onClick={() => openResetPassword(a)} style={smallBtn}>
                        ตั้งรหัสใหม่
                      </Button>
                      <Button variant="danger" icon="trash" disabled={Boolean(a.StoreIsDeleted)} onClick={() => removeAccount(a)} style={smallBtn}>
                        ลบ
                      </Button>
                    </div>
                  </td>
                </tr>))}
              {rows.length === 0 && (<tr>
                  <td colSpan="5" style={{ ...tdStyle, textAlign: 'center', color: T.muted }}>
                    ยังไม่มีบัญชีเจ้าของร้านในระบบ
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modalOpen} title={mode === 'password' ? 'แก้ไขบัญชีร้านค้า' : 'สร้างบัญชีให้ร้านค้า'} subtitle="ช่องที่มีเครื่องหมาย * ต้องกรอกให้ครบก่อนจึงจะบันทึกได้" onClose={() => setModalOpen(false)} footer={<>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button icon="check" onClick={submit} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </>}>
                <FormSectionTitle icon="store">ร้านค้า</FormSectionTitle>
        <Field label="ร้านค้า" required error={errors.storeId}>
          <select value={form.storeId} onChange={update('storeId')} style={inputStyle}>
            <option value="">— เลือกร้านค้า —</option>
            {stores.map((s) => (<option key={s.StoreId} value={s.StoreId}>
                {s.StoreName}
              </option>))}
          </select>
        </Field>

        <FormSectionTitle icon="key">บัญชีเข้าสู่ระบบ</FormSectionTitle>
        <OwnerRoleCard/>
        <Field label="ชื่อ-นามสกุลเจ้าของร้าน" required error={errors.fullName}>
          <IconInput icon="account" value={form.fullName} onChange={update('fullName')} maxLength={100} placeholder="เช่น สมชาย ใจดี"/>
        </Field>
        <Field label="ชื่อผู้ใช้ (username)" required error={errors.username} hint={mode === 'password' ? 'แก้ชื่อผู้ใช้ไม่ได้' : 'a-z, 0-9 และ _ ความยาว 4–20 ตัว ห้ามซ้ำกับบัญชีอื่น'}>
          <IconInput icon="account" value={form.username} disabled={mode === 'password'} onChange={(e) => { setForm((prev) => ({ ...prev, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) })); setErrors((prev) => ({ ...prev, username: undefined })); }} autoComplete="off" placeholder="เช่น owner_shop" style={mode === 'password' ? { background: '#F3F3F8', color: T.muted } : undefined}/>
        </Field>
        <div style={twoColStyle}>
          <Field label={mode === 'password' ? 'รหัสผ่านใหม่' : 'รหัสผ่าน'} required error={errors.password}>
            <PasswordField value={form.password} onChange={(e) => { setForm((prev) => ({ ...prev, password: e.target.value.replace(/\s/g, '') })); setErrors((prev) => ({ ...prev, password: undefined })); }} show={showPassword} onToggle={() => setShowPassword((v) => !v)} placeholder={`อย่างน้อย ${STORE_PASSWORD_MIN} ตัว`}/>
          </Field>
          <Field label="ยืนยันรหัสผ่าน" required error={errors.confirm}>
            <PasswordField value={form.confirm} onChange={(e) => { setForm((prev) => ({ ...prev, confirm: e.target.value.replace(/\s/g, '') })); setErrors((prev) => ({ ...prev, confirm: undefined })); }} show={showPassword} onToggle={() => setShowPassword((v) => !v)} placeholder="พิมพ์อีกครั้ง"/>
          </Field>
        </div>
        <PasswordChecklist password={form.password} confirm={form.confirm}/>
      </Modal>
    </>);
}
const h2Style = { margin: 0, fontSize: '24px', fontWeight: 700, color: T.ink, lineHeight: 1.3 };
const h3Style = { margin: 0, fontSize: '18px', fontWeight: 600, color: T.ink };
const bodyStyle = { fontSize: '14px', color: T.text, lineHeight: 1.6 };
const captionStyle = { margin: '4px 0 0', fontSize: '12.5px', color: T.muted, lineHeight: 1.5 };
const ellipsisStyle = { overflow: 'hidden', textOverflow: 'ellipsis',whiteSpace: 'nowrap',color: T.ink,
    fontWeight: 600,fontSize: '13px'
};
const shellStyle = {display: 'flex',flexDirection: 'column',position: 'relative',width: '100%',maxWidth: '100%',minWidth: 0,height: '100dvh',minHeight: '100dvh',overflow: 'hidden',
    background: T.bg,color: T.text,margin: 0,padding: 0};
const shellBodyStyle = { display: 'flex', alignItems: 'stretch', flex: 1, minHeight: 0, width: '100%', position: 'relative' };
const mainScrollStyle = { flex: '1 1 0%', minWidth: 0, width: 0, maxWidth: '100%', overflowY: 'auto', overflowX: 'hidden' };
const sidebarStyle = { width: '260px', minWidth: '260px', padding: '16px 16px 12px', boxSizing: 'border-box', background: T.sideBg, borderRight: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', alignSelf: 'stretch', overflowY: 'auto', flexShrink: 0, boxShadow: '0 1px 3px rgba(18,25,38,0.02)' };
const brandStyle = { width: '212px', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', whiteSpace: 'nowrap', minWidth: 0 };
const brandTitleStyle = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '20px', fontWeight: 700, color: T.primary };
const brandSubtitleStyle = { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginTop: '4px', color: T.muted };

const sidebarLabelStyle = { color: T.ink, fontSize: '14px', fontWeight: 500, padding: '12px 16px', marginBottom: '4px' };
const sidebarItemStyle = { width: '100%', display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 16px', marginBottom: '8px', border: 'none', borderRadius: T.radiusMd, cursor: 'pointer', textAlign: 'left', fontSize: '14px', fontFamily: FONT_STACK, transition: 'background .18s ease, color .18s ease' };
const avatarStyle = { width: '34px', height: '34px', minWidth: '34px', display: 'grid', placeItems: 'center', borderRadius: '50%', background: T.primary, color: '#FFFFFF', fontWeight: 700, fontSize: '14px' };

const backdropStyle = { position: 'absolute', inset: 0, background: 'rgba(18,25,38,0.45)', zIndex: 55 };
const topbarStyle = { minHeight: `${TOPBAR_H}px`, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '16px', background: T.surface, borderBottom: `1px solid ${T.line}`, position: 'sticky', top: 0, zIndex: 70, flexShrink: 0, boxSizing: 'border-box', flexWrap: 'wrap' };
const iconButtonStyle = { position: 'relative', width: '38px', height: '38px', display: 'grid', placeItems: 'center', border: 'none', borderRadius: T.radiusMd, background: T.primarySoft, color: T.primary, cursor: 'pointer', padding: 0, transition: 'background .2s ease, color .2s ease' };
const searchWrapStyle = { flex: '0 1 420px', minWidth: '180px', maxWidth: '420px', display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: `1px solid ${T.line}`, borderRadius: '8px', background: T.surface, boxShadow: '0 1px 2px rgba(18,25,38,0.02)' };
const searchInputStyle = { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: T.text, fontSize: '13.5px', fontFamily: FONT_STACK, padding: '6px 0' };
const courtPillStyle = { display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap' };
const notifBadgeStyle = { position: 'absolute', top: '-6px', right: '-6px', minWidth: '19px', height: '19px', padding: '0 5px', borderRadius: '999px', background: T.primary, color: '#FFFFFF', fontSize: '11px', fontWeight: 700, display: 'grid', placeItems: 'center', boxSizing: 'border-box' };
const dropdownBackdropStyle = { position: 'fixed', inset: 0, zIndex: 40 };
const notifPanelStyle = { position: 'absolute', top: '46px', right: 0, width: 'min(330px, 90vw)', background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radiusLg, boxShadow: '0 18px 40px rgba(18,25,38,0.16)', overflow: 'hidden', zIndex: 50 };
const notifHeadStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: `1px solid ${T.line}` };
const notifItemStyle = { width: '100%', display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 16px', border: 'none', borderBottom: `1px solid ${T.line}`, cursor: 'pointer', textAlign: 'left', fontFamily: FONT_STACK };
const topAccountStyle = { display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 12px 6px 6px', border: 'none', borderRadius: '999px', background: T.deepSoft, maxWidth: '250px', cursor: 'pointer', fontFamily: FONT_STACK, transition: 'background .2s ease' };
const profilePanelStyle = { position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 'min(290px, 86vw)', background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radiusLg, boxShadow: '0 12px 34px rgba(18,25,38,0.14)', padding: '20px', zIndex: 80 };
const dropdownItemStyle = { width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', marginBottom: '2px', border: 'none', borderRadius: '6px', background: 'transparent', color: T.text, fontSize: '14px', fontFamily: FONT_STACK, textAlign: 'left', cursor: 'pointer', transition: 'background .2s ease, color .2s ease' };
const contentStyle = { width: '100%', maxWidth: 'none', minWidth: 0, margin: 0, padding: 'clamp(16px, 2.2vw, 24px)', minHeight: `calc(100dvh - ${TOPBAR_H}px)`, boxSizing: 'border-box', overflowX: 'hidden' };
const courtBannerStyle = { display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', marginBottom: '18px', borderRadius: T.radiusLg, background: T.redSoft, border: `1px solid ${T.redSoft}`, color: T.down, fontSize: '13.5px', fontWeight: 600 };
const cardStyle = { background: T.surface, border: 'none', borderRadius: T.radiusLg, padding: 'clamp(18px, 2.2vw, 24px)', boxSizing: 'border-box', position: 'relative', boxShadow: T.shadowSm };
const cardHeadStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' };
const chartGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: '24px' };
const toolbarStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '14px', flexWrap: 'wrap' };
const courtControlStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', minWidth: '760px', marginTop: '12px' };
const thStyle = { padding: '16px', background: T.surface, color: T.ink, fontSize: '14px', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', borderBottom: `1px solid ${T.line}` };
const thRightStyle = { ...thStyle, textAlign: 'right' };
const trStyle = { borderBottom: `1px solid ${T.line}` };
const tdStyle = { padding: '16px', fontSize: '14px', color: T.text, verticalAlign: 'middle' };
const tdRightStyle = { ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' };
const cancelStatRowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '16px' };
const cancelStatBoxStyle = { background: T.bg, borderRadius: T.radiusMd, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px' };
const cancelStatLabelStyle = { fontSize: '12.5px', color: T.muted, fontWeight: 600 };
const cancelStatValueStyle = { fontSize: '20px', color: T.ink, fontWeight: 700, lineHeight: 1.3 };
const cancelChipRowStyle = { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' };
const cancelChipStyle = (active) => ({ padding: '7px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, fontFamily: FONT_STACK, cursor: 'pointer', whiteSpace: 'nowrap', background: active ? T.primarySoft : T.surface, color: active ? T.primaryDark : T.text, border: `1px solid ${active ? T.primary : T.line}` });
const cancelItemWrapStyle = { display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 2px' };
const cancelItemRowStyle = { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13.5px', color: T.text };
const storeThumbStyle = { width: '38px', height: '38px', borderRadius: T.radiusMd, display: 'grid', placeItems: 'center', background: T.primarySoft, color: T.primary, fontWeight: 700 };
// ===== ตัวเลือกเวลา (ชั่วโมง : นาที) + ปุ่มลัด ใช้แทน <input type="time"> =====
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i ).padStart(2, '0'));
const SELECT_CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%238A8FA6' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E\")";
function TimeSelect({ value, onChange, disabled, presets = [] }) {
    const [h = '00', m = '00'] = (value || '00:00').split(':');
    const minuteOptions = MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort();
    const selStyle = {
        ...inputStyle,
        width: '100%', minWidth: 0, boxSizing: 'border-box',
        fontSize: '16px',
        padding: '11px 30px 11px 12px',
        appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
        backgroundImage: SELECT_CHEVRON, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 11px center',
        cursor: 'pointer',
    };
    return (<div style={{ width: '100%', minWidth: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr) auto', alignItems: 'center', gap: '8px' }}>
        <select aria-label="ชั่วโมง" value={h} disabled={disabled} onChange={e => onChange(`${e.target.value}:${m}`)} style={selStyle}>
          {HOURS.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <span style={{ fontWeight: 700, fontSize: '18px', color: T.ink }}>:</span>
        <select aria-label="นาที" value={m} disabled={disabled} onChange={e => onChange(`${h}:${e.target.value}`)} style={selStyle}>
          {minuteOptions.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <span style={{ color: T.muted, fontSize: '13px' }}>น.</span>
      </div>
      {presets.length > 0 && (<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
        {presets.map(p => (<button key={p} type="button" disabled={disabled} onClick={() => onChange(p)} style={{
            padding: '7px 12px', minHeight: '36px', borderRadius: '999px', fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer',
            border: `1px solid ${value === p ? T.primary : T.line}`,
            background: value === p ? T.primary : T.surface,
            color: value === p ? '#fff' : T.text,
          }}>{p}</button>))}
      </div>)}
    </div>);
}


const inputStyle = { width: '100%', padding: '11px 13px', border: `1px solid ${T.line}`, borderRadius: T.radiusMd, fontSize: '13.5px', fontFamily: FONT_STACK, color: T.text, background: T.surface, boxSizing: 'border-box', outlineColor: T.primary };

const formDateInputStyle = { ...inputStyle, display: 'block', width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' };
const twoColStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: '0 14px' };
const smallBtn = { padding: '7px 10px', fontSize: '12.5px' };
const inlineEditButtonStyle = { border: 'none', background: 'transparent', padding: '4px', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
const storeImagePreviewStyle = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };
const storeImageShadeStyle = { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(42,44,65,0.02) 48%, rgba(42,44,65,0.62) 100%)', pointerEvents: 'none' };
const storeImageChangeBadgeStyle = { position: 'absolute', left: '16px', bottom: '14px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 11px', borderRadius: '999px', background: 'rgba(42,44,65,0.78)', color: '#FFFFFF', fontSize: '12px', fontWeight: 700, backdropFilter: 'blur(7px)' };
const storeImageEmptyStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '7px', width: '100%', height: '100%', padding: '22px', boxSizing: 'border-box' };
const storeImageIconStyle = { position: 'relative', width: '58px', height: '58px', borderRadius: '18px', display: 'grid', placeItems: 'center', background: T.primarySoft, marginBottom: '4px' };
const storeImagePlusStyle = { position: 'absolute', right: '-3px', bottom: '-3px', width: '22px', height: '22px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: T.primary, border: `3px solid ${T.surface}`, boxSizing: 'content-box' };
const storeImageFormatPillStyle = { marginTop: '3px', padding: '5px 10px', borderRadius: '999px', background: T.trackSoft, color: T.muted, fontSize: '11.5px', fontWeight: 600 };
const storeImageFooterStyle = { marginTop: '10px', padding: '10px 12px', border: `1px solid ${T.line}`, borderRadius: T.radiusMd, background: '#FAFAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' };

function storeImageUploaderStyle(dragOver, hasError, hasImage) { return { width: '100%', height: hasImage ? '230px' : '190px', position: 'relative', borderRadius: '16px', border: `2px dashed ${hasError ? T.down : dragOver ? T.primary : '#D8DCE8'}`, background: dragOver ? T.primarySoft : hasImage ? '#F4F5F8' : 'linear-gradient(135deg, #FFFDFC 0%, #FAFAFC 100%)', display: 'grid', placeItems: 'center', cursor: 'pointer', overflow: 'hidden', padding: 0, fontFamily: FONT_STACK, boxSizing: 'border-box', transition: 'border-color .18s ease, background .18s ease, box-shadow .18s ease, transform .18s ease', boxShadow: dragOver ? `0 0 0 4px ${T.primarySoft}` : 'none' }; }

const dateWrapStyle = { display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', border: `1px solid ${T.line}`, borderRadius: T.radiusMd, background: T.surface };
const dateInputStyle = { minWidth: 0, maxWidth: '100%', border: 'none', outline: 'none', background: 'transparent', color: T.text, fontSize: '13px', fontFamily: FONT_STACK };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(42,44,65,0.5)', display: 'grid', placeItems: 'center', padding: '18px', zIndex: 90 };
const modalStyle = { width: '100%', background: T.surface, borderRadius: '16px', boxShadow: '0 26px 60px rgba(42,44,65,0.26)', overflow: 'hidden', maxHeight: 'calc(100dvh - 24px)' };
const modalHeadStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', padding: '18px 22px', borderBottom: `1px solid ${T.line}` };
const modalFootStyle = { display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 22px', borderTop: `1px solid ${T.line}`, background: '#FAFAFC' };
const popupNoticeOverlayStyle = { position: 'fixed', inset: 0, zIndex: 140, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '90px 18px 18px', pointerEvents: 'none', background: 'rgba(42,44,65,0.10)' };
const popupNoticeStyle = { width: 'min(520px, 92vw)', background: T.surface, borderRadius: '16px', boxShadow: '0 24px 60px rgba(42,44,65,0.24)', border: `1px solid ${T.line}`, padding: '20px 22px', display: 'flex', alignItems: 'flex-start', gap: '15px', pointerEvents: 'auto' };
const popupNoticeIconStyle = { width: '54px', height: '54px', minWidth: '54px', borderRadius: '16px', display: 'grid', placeItems: 'center' };
const popupNoticeCloseStyle = { width: '34px', height: '34px', border: 'none', borderRadius: '9px', background: T.bg, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 };
const tooltipStyle = { position: 'absolute', top: '8px', padding: '10px 13px', background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radiusLg, boxShadow: '0 12px 28px rgba(42,44,65,0.16)', pointerEvents: 'none', minWidth: '190px', zIndex: 5 };