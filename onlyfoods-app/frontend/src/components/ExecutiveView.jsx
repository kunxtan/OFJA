import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
const ORDER_TIME_IS_UTC = true;
const MAX_IMAGE_MB = 5;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const REFRESH_MS = 15000;
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
const FONT_STACK = '"Roboto","Sarabun","IBM Plex Sans Thai","Noto Sans Thai","Segoe UI",system-ui,sans-serif';
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
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime()))
        return iso;
    const m = [
        'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];
    return `${d.getDate()} ${m[d.getMonth()]} ${(d.getFullYear() + 543) % 100}`;
}
function thaiDateTime(value) {
    const d = parseOrderDate(value);
    if (!d)
        return '-';
    const m = [
        'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];
    return `${d.getDate()} ${m[d.getMonth()]} ${(d.getFullYear() + 543) % 100} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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
    if (p === 0)
        return c === 0 ? 0 : 100;
    const raw = ((c - p) / p) * 100;
    return Math.max(-100, Math.min(100, raw));
}
function summarize(orders) {
    const completed = orders.filter((o) => statusIs(o, 'Completed'));
    const cancelled = orders.filter((o) => statusIs(o, 'Cancelled'));
    const finished = completed.length + cancelled.length;
    const sales = sumAmount(completed);
    return {
        sales,
        completedCount: completed.length,
        cancelledCount: cancelled.length,
        cancelRate: finished ? (cancelled.length / finished) * 100 : 0,
        avgOrder: completed.length ? sales / completed.length : 0,
        completed,
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
            const name = it.ProductName || `สินค้า #${it.ProductId}`;
            if (!map[name])
                map[name] = { name, qty: 0, amount: 0 };
            map[name].qty += Number(it.Qty || 0);
            map[name].amount += Number(it.Qty || 0) * Number(it.UnitPrice || 0);
        });
    });
    const rows = Object.values(map);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    rows.forEach((r) => {
        r.share = total ? (r.amount / total) * 100 : 0;
    });
    return rows.sort((a, b) => b.amount - a.amount);
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
        throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบว่า backend รันอยู่');
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
        if (response.status === 404 || response.status === 405) {
            throw new Error('ยังไม่มี endpoint นี้ในหลังบ้าน — ให้เพิ่มโค้ดจากไฟล์ main_additions.py ลงใน main.py ก่อน');
        }
        const detail = data && (data.detail || data.message);
        throw new Error(typeof detail === 'string' ? detail : `ทำรายการไม่สำเร็จ (HTTP ${response.status})`);
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
    history: 'M3 12a9 9 0 109-9 9.2 9.2 0 00-6.4 2.6L3 8M3 3v5h5M12 7v5l3 2'
};
function greetingText() {
    const h = new Date().getHours();
    if (h < 12)
        return 'สวัสดีตอนเช้า';
    if (h < 17)
        return 'สวัสดีตอนบ่าย';
    return 'สวัสดีตอนเย็น';
}
function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 1.7, style }) {
    const d = ICON_PATHS[name] || ICON_PATHS.info;
    return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block', ...style }} aria-hidden="true">
      <path d={d}/>
    </svg>);
}
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
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = rows.map((r) => r.map(escape).join(',')).join('\r\n');
    saveBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }), filename);
}
const PDF_W = 595;
const PDF_H = 842;
const CANVAS_W = 1190;
const CANVAS_H = 1684;
function dataUrlToBytes(dataUrl) {
    const base64 = dataUrl.split(',')[1];
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1)
        out[i] = bin.charCodeAt(i);
    return out;
}
function buildPdfBlob(jpegPages) {
    const encoder = new TextEncoder();
    const chunks = [];
    let length = 0;
    const offsets = [];
    const push = (u8) => {
        chunks.push(u8);
        length += u8.length;
    };
    const pushText = (s) => push(encoder.encode(s));
    const mark = (n) => {
        offsets[n] = length;
    };
    const objectCount = 2 + jpegPages.length * 3;
    pushText('%PDF-1.4\n');
    mark(1);
    pushText('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    const kids = jpegPages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
    mark(2);
    pushText(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${jpegPages.length} >>\nendobj\n`);
    jpegPages.forEach((jpeg, i) => {
        const pageNo = 3 + i * 3;
        const imgNo = pageNo + 1;
        const contentNo = pageNo + 2;
        const content = `q ${PDF_W} 0 0 ${PDF_H} 0 0 cm /Im0 Do Q\n`;
        mark(pageNo);
        pushText(`${pageNo} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_W} ${PDF_H}] ` +
            `/Resources << /XObject << /Im0 ${imgNo} 0 R >> >> /Contents ${contentNo} 0 R >>\nendobj\n`);
        mark(imgNo);
        pushText(`${imgNo} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${CANVAS_W} ` +
            `/Height ${CANVAS_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
            `/Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
        push(jpeg);
        pushText('\nendstream\nendobj\n');
        mark(contentNo);
        pushText(`${contentNo} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);
    });
    const xrefPos = length;
    let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objectCount; i += 1) {
        xref += `${String(offsets[i] || 0).padStart(10, '0')} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
    pushText(xref);
    const out = new Uint8Array(length);
    let pos = 0;
    chunks.forEach((c) => {
        out.set(c, pos);
        pos += c.length;
    });
    return new Blob([out], { type: 'application/pdf' });
}
function drawReportPage({ title, subtitle, kpis, tableTitle, columns, rows, pageNo, pageCount }) {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    const font = (size, weight = 'normal') => {
        ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    };
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = T.primary;
    ctx.fillRect(0, 0, CANVAS_W, 14);
    const M = 70;
    let y = 92;
    ctx.fillStyle = T.ink;
    font(38, 'bold');
    ctx.fillText(title, M, y);
    y += 34;
    ctx.fillStyle = T.muted;
    font(20);
    ctx.fillText(subtitle, M, y);
    y += 22;
    ctx.fillText(`ออกรายงานเมื่อ ${nowStamp()} น. · Only Foods Food Court`, M, y);
    if (kpis && kpis.length) {
        y += 40;
        const cardW = (CANVAS_W - M * 2 - 24 * 2) / 3;
        kpis.forEach((k, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const x = M + col * (cardW + 24);
            const cy = y + row * 150;
            ctx.fillStyle = '#FAFAFC';
            ctx.strokeStyle = T.line;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(x, cy, cardW, 126);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = T.muted;
            font(19);
            ctx.fillText(k.label, x + 22, cy + 40);
            ctx.fillStyle = T.ink;
            font(32, 'bold');
            ctx.fillText(k.value, x + 22, cy + 82);
            if (k.note) {
                ctx.fillStyle = k.tone === 'up' ? T.up : k.tone === 'down' ? T.down : T.muted;
                font(18);
                ctx.fillText(k.note, x + 22, cy + 110);
            }
        });
        y += Math.ceil(kpis.length / 3) * 150 + 20;
    }
    if (tableTitle) {
        y += 24;
        ctx.fillStyle = T.ink;
        font(26, 'bold');
        ctx.fillText(tableTitle, M, y);
        y += 26;
    }
    if (columns && columns.length) {
        const tableW = CANVAS_W - M * 2;
        const colW = columns.map((c) => tableW * c.width);
        const colX = [];
        let acc = M;
        colW.forEach((w) => {
            colX.push(acc);
            acc += w;
        });
        ctx.fillStyle = '#F3F3F8';
        ctx.fillRect(M, y, tableW, 46);
        ctx.fillStyle = T.text;
        font(20, 'bold');
        columns.forEach((c, i) => {
            const tx = c.align === 'right' ? colX[i] + colW[i] - 16 : colX[i] + 16;
            ctx.textAlign = c.align === 'right' ? 'right' : 'left';
            ctx.fillText(c.title, tx, y + 30);
        });
        ctx.textAlign = 'left';
        y += 46;
        rows.forEach((row, ri) => {
            if (ri % 2 === 1) {
                ctx.fillStyle = '#FAFAFD';
                ctx.fillRect(M, y, tableW, 42);
            }
            ctx.fillStyle = T.text;
            font(19);
            row.forEach((cell, i) => {
                const c = columns[i];
                const tx = c.align === 'right' ? colX[i] + colW[i] - 16 : colX[i] + 16;
                ctx.textAlign = c.align === 'right' ? 'right' : 'left';
                ctx.fillText(String(cell), tx, y + 28);
            });
            ctx.textAlign = 'left';
            ctx.strokeStyle = T.line;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(M, y + 42);
            ctx.lineTo(M + tableW, y + 42);
            ctx.stroke();
            y += 42;
        });
    }
    ctx.fillStyle = T.muted;
    font(17);
    ctx.fillText(`หน้า ${pageNo}/${pageCount}`, M, CANVAS_H - 50);
    ctx.textAlign = 'right';
    ctx.fillText('รายงานสร้างจากระบบ Only Foods', CANVAS_W - M, CANVAS_H - 50);
    ctx.textAlign = 'left';
    return canvas;
}
function exportPdf(filename, spec) {
    const ROWS_FIRST_PAGE = 14;
    const ROWS_PER_PAGE = 26;
    const rows = spec.rows || [];
    const pagesRows = [];
    if (rows.length <= ROWS_FIRST_PAGE) {
        pagesRows.push(rows);
    }
    else {
        pagesRows.push(rows.slice(0, ROWS_FIRST_PAGE));
        for (let i = ROWS_FIRST_PAGE; i < rows.length; i += ROWS_PER_PAGE) {
            pagesRows.push(rows.slice(i, i + ROWS_PER_PAGE));
        }
    }
    const pageCount = pagesRows.length;
    const jpegs = pagesRows.map((chunkRows, i) => {
        const canvas = drawReportPage({
            title: spec.title,
            subtitle: i === 0 ? spec.subtitle : `${spec.subtitle} (ต่อ)`,
            kpis: i === 0 ? spec.kpis : null,
            tableTitle: i === 0 ? spec.tableTitle : `${spec.tableTitle} (ต่อ)`,
            columns: spec.columns,
            rows: chunkRows,
            pageNo: i + 1,
            pageCount
        });
        return dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92));
    });
    saveBlob(buildPdfBlob(jpegs), filename);
}
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
function KpiCard({ label, value, unit, delta, deltaLabel, hint, highlight, variant, icon = 'trend', tone = 'blue', size = 'md', invertDelta = false }) {
    const hasDelta = delta !== null && delta !== undefined;
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
    return (<div className="of-card" style={{
            ...cardStyle,
            padding: small ? '18px 20px' : '22px',
            minHeight: solid ? '172px' : small ? '116px' : '150px',
            height: '100%',
            background: solid ? solidBg : T.surface,
            color: solid ? '#FFFFFF' : T.text,
            overflow: 'hidden',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
        }}>
      {kind === 'purple' && <CardDecorCircles color={T.primaryDark}/>}
      {kind === 'blue' && <CardDecorWave />}
      {kind === 'blue' && <CardDecorCircles color={T.deepDark}/>}

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: '14px' }}>
        {solid ? (<CardIconBox icon={icon} background={kind === 'purple' ? T.primaryDark : T.deepDark}/>) : (<div style={{
                width: small ? '44px' : '48px',
                height: small ? '44px' : '48px',
                minWidth: small ? '44px' : '48px',
                borderRadius: T.radiusMd,
                background: iconTone.bg,
                color: iconTone.fg,
                display: 'grid',
                placeItems: 'center'
            }}>
            <Icon name={icon} size={22} color={iconTone.fg}/>
          </div>)}

        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: small ? '22px' : '26px',
            fontWeight: 700,
            lineHeight: 1.2,
            color: solid ? '#FFFFFF' : T.ink
        }}>
            {value}
            {unit && (<span style={{
                fontSize: '13.5px',
                fontWeight: 500,
                marginLeft: '5px',
                color: solid ? 'rgba(255,255,255,.80)' : T.muted
            }}>
                {unit}
              </span>)}
          </div>
          <div style={{
            marginTop: '3px',
            fontSize: '13px',
            color: solid ? 'rgba(255,255,255,.85)' : T.muted
        }}>
            {label}
          </div>
        </div>
      </div>

      {hasDelta ? (<div style={{
                position: 'relative',
                zIndex: 2,
                marginTop: small ? '10px' : '14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                alignSelf: 'flex-start',
                padding: '5px 10px',
                borderRadius: '999px',
                fontSize: '12.5px',
                fontWeight: 700,
                background: delta === 0
                    ? (solid ? 'rgba(255,255,255,.18)' : '#F1F3F7')
                    : positive
                        ? (solid ? 'rgba(220,252,231,.96)' : T.greenSoft)
                        : (solid ? 'rgba(254,226,226,.96)' : T.redSoft),
                color: delta === 0
                    ? (solid ? '#FFFFFF' : T.muted)
                    : positive ? T.up : T.down
            }}>
          <span aria-hidden="true">{delta === 0 ? '→' : rising ? '↗' : '↘'}</span>
          {delta < 0 ? '-' : ''}{Number.isInteger(Math.abs(delta)) ? Math.abs(delta).toFixed(0) : Math.abs(delta).toFixed(1)}%
          <span style={{
              fontWeight: 500,
              opacity: solid && delta === 0 ? 0.85 : 1,
              color: delta === 0
                  ? (solid ? '#FFFFFF' : T.muted)
                  : positive ? T.up : T.down
          }}>
            {deltaLabel}
          </span>
        </div>) : (<div style={{
                position: 'relative',
                zIndex: 2,
                marginTop: small ? '10px' : '14px',
                fontSize: '12.5px',
                color: solid ? 'rgba(255,255,255,.80)' : T.muted
            }}>
          {hint || 'ไม่มีข้อมูลช่วงก่อนหน้าให้เทียบ'}
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
    return (<span style={{
            ...palette,
            padding: '4px 11px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            display: 'inline-block'
        }}>
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
    return (<button type="button" {...rest} style={{
            ...variants[variant],
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            padding: '10px 18px',
            borderRadius: T.radiusMd,
            fontSize: '13.5px',
            fontWeight: 600,
            fontFamily: FONT_STACK,
            cursor: rest.disabled ? 'not-allowed' : 'pointer',
            opacity: rest.disabled ? 0.55 : 1,
            ...style
        }}>
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
function Field({ label, required, error, hint, children }) {
    return (<label style={{ display: 'block', marginBottom: '14px' }}>
      <span style={{ ...captionStyle, color: T.text, fontWeight: 600, display: 'block' }}>
        {label}
        {required && <span style={{ color: T.down, marginLeft: '3px' }}>*</span>}
      </span>
      <div style={{ marginTop: '6px' }}>{children}</div>
      {hint && !error && <span style={{ ...captionStyle, fontSize: '11.5px' }}>{hint}</span>}
      {error && (<span style={{ ...captionStyle, color: T.down, fontSize: '11.5px', fontWeight: 600 }}>
          {error}
        </span>)}
    </label>);
}
function EmptyState({ text, minHeight = '200px' }) {
    return (<div style={{
            minHeight,
            display: 'grid',
            placeItems: 'center',
            color: T.muted,
            fontSize: '13.5px'
        }}>
      {text}
    </div>);
}
function PeriodPicker({ anchor, setAnchor, days, setDays, style }) {
    return (<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', ...style }}>
      <div style={dateWrapStyle}>
        <Icon name="calendar" size={16} color={T.muted}/>
        <input type="date" value={anchor} max={todayISO()} onChange={(e) => setAnchor(e.target.value || todayISO())} style={dateInputStyle} aria-label="เลือกวันที่ที่ต้องการดู"/>
      </div>

      <div style={{
            display: 'flex',
            gap: '4px',
            flexWrap: 'wrap',
            background: T.primarySoft,
            padding: '4px',
            borderRadius: T.radiusMd
        }}>
        {[1, 7, 14, 30].map((v) => (<button key={v} type="button" onClick={() => setDays(v)} style={{
                padding: '7px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                fontFamily: FONT_STACK,
                cursor: 'pointer',
                border: 'none',
                background: days === v ? T.surface : 'transparent',
                color: days === v ? T.primary : T.muted,
                boxShadow: days === v ? '0 1px 3px rgba(18,25,38,.12)' : 'none'
            }}>
            {v === 1 ? 'วันนี้' : `${v} วัน`}
          </button>))}
      </div>
    </div>);
}
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
function StoreBarChart({ rows, valueKey = 'sales', suffix = 'บาท' }) {
    const list = (rows || []).slice(0, 8);
    if (!list.length)
        return <EmptyState text="ยังไม่มีข้อมูลร้านค้า"/>;
    const maxValue = Math.max(...list.map((r) => Number(r[valueKey]) || 0), 1);
    return (<div style={{ display: 'flex', flexDirection: 'column', gap: '13px', marginTop: '12px' }}>
      {list.map((r, i) => {
            const value = Number(r[valueKey]) || 0;
            return (<div key={r.StoreId ?? r.name ?? i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <span style={{
                    color: T.text,
                    fontSize: '13px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '60%'
                }}>
                {r.StoreName || r.name}
              </span>
              <strong style={{ color: T.ink, fontSize: '13px' }}>
                {money(value)} {suffix}
              </strong>
            </div>
            <div style={{ height: '10px', background: T.trackSoft, borderRadius: '999px', marginTop: '6px' }}>
              <div style={{
                    height: '100%',
                    width: `${Math.max((value / maxValue) * 100, value > 0 ? 3 : 0)}%`,
                    borderRadius: '999px',
                    background: i === 0 ? T.primary : i === list.length - 1 ? T.accent : '#FF9E84'
                }}/>
            </div>
          </div>);
        })}
    </div>);
}
function StoreDonutChart({ rows }) {
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
    const radius = 72;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    return (<div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '18px',
            alignItems: 'center',
            marginTop: '8px',
            width: '100%',
            minWidth: 0,
            overflow: 'hidden'
        }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: '250px', margin: '0 auto', flex: '1 1 220px', minWidth: 0 }}>
        <svg viewBox="0 0 200 200" style={{ width: '100%', display: 'block', transform: 'rotate(-90deg)' }} aria-label="สัดส่วนยอดขายแยกร้าน">
          <circle cx="100" cy="100" r={radius} fill="none" stroke={T.trackSoft} strokeWidth="30"/>
          {list.map((r, i) => {
            const value = Number(r.sales || 0);
            const length = (value / total) * circumference;
            const currentOffset = offset;
            offset += length;
            return (<circle key={r.StoreId ?? r.StoreName} cx="100" cy="100" r={radius} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="30" strokeDasharray={`${length} ${Math.max(circumference - length, 0)}`} strokeDashoffset={-currentOffset} strokeLinecap="butt"/>);
        })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
          <div>
            <div style={{ ...captionStyle, margin: 0 }}>ยอดขายรวม</div>
            <strong style={{ display: 'block', color: T.ink, fontSize: '21px', marginTop: '3px' }}>{money(total)}</strong>
            <span style={{ color: T.muted, fontSize: '12px' }}>บาท</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', minWidth: 0, flex: '1 1 240px', width: '100%', overflow: 'hidden' }}>
        {list.map((r, i) => {
            const share = (Number(r.sales || 0) / total) * 100;
            return (<div key={r.StoreId ?? r.StoreName} style={{ display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr) minmax(46px, auto)', gap: '8px', alignItems: 'center', width: '100%', minWidth: 0 }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS[i % COLORS.length] }}/>
              <span style={{ color: T.text, fontSize: '12.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.StoreName}</span>
              <span style={{ color: T.ink, fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'right' }}>{share.toFixed(1)}%</span>
            </div>);
        })}
      </div>
    </div>);
}
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
            </button>)) : (<div style={{ padding: '12px', color: T.muted, fontSize: '13px' }}>ยังไม่มีข้อมูลร้านค้า</div>)}
        </div>)}
    </div>);
}
function MenuRankList({ rows, tone = 'primary', emptyText }) {
    if (!rows.length)
        return <EmptyState text={emptyText || 'ยังไม่มีข้อมูลเมนู'} minHeight="120px"/>;
    const maxValue = Math.max(...rows.map((r) => r.amount), 1);
    return (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
      {rows.map((r) => (<div key={r.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
            <span style={{ color: T.text, fontSize: '13px' }}>{r.name}</span>
            <strong style={{ color: T.ink, fontSize: '13px', whiteSpace: 'nowrap' }}>
              {money(r.amount)} บาท
            </strong>
          </div>
          <div style={{ height: '8px', background: T.trackSoft, borderRadius: '999px', marginTop: '5px' }}>
            <div style={{
                height: '100%',
                width: `${Math.max((r.amount / maxValue) * 100, 3)}%`,
                borderRadius: '999px',
                background: tone === 'primary' ? T.primary : T.accent
            }}/>
          </div>
          <div style={{ ...captionStyle, marginTop: '4px' }}>
            ขายได้ {money(r.qty)} จาน · คิดเป็น {r.share.toFixed(1)}% ของยอดขายร้าน
          </div>
        </div>))}
    </div>);
}
export default function ExecutiveView({ apiBase, user, onLogout }) {
    const API = apiBase || 'http://localhost:8000';
    const isNarrow = useIsNarrow();
    const isPhone = useIsNarrow(640);
    const [activeMenu, setActiveMenu] = useState('overview');
    // [CROSS-NAV] เก็บร้านที่ผู้บริหารคลิกมาจากอีกหน้า เพื่อเปิดรายละเอียดร้านเดิมต่อเนื่อง
    const [focusStoreId, setFocusStoreId] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [search, setSearch] = useState('');
    const searchRef = useRef(null);
    const [stores, setStores] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [foodCourtOpen, setFoodCourtOpen] = useState(true);
    const [switchingCourt, setSwitchingCourt] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [issueAlerts, setIssueAlerts] = useState([]);
    const [notifOpen, setNotifOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef(null);
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

            const fullById = new Map(
                fullStores.map((s) => [String(s.StoreId), s])
            );

            const merged = dashboardStores.map((s) => ({
                ...s,
                ...(fullById.get(String(s.StoreId)) || {})
            }));

            fullStores.forEach((s) => {
                if (!merged.some((m) => String(m.StoreId) === String(s.StoreId))) {
                    merged.push(s);
                }
            });

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
    const loadFoodCourt = useCallback(async (silent = true) => {
        try {
            const data = await callApi(`${API}/api/food-court/status`);
            setFoodCourtOpen(Boolean(data?.is_open));
        }
        catch (err) {
            if (!silent)
                pushToast(err.message, 'error');
        }
    }, [API, pushToast]);
    const loadIssueAlerts = useCallback(async () => {
        if (!Array.isArray(stores) || stores.length === 0) {
            setIssueAlerts([]);
            return;
        }

        try {
            const results = await Promise.all(
                stores.map(async (store) => {
                    try {
                        const rows = await callApi(`${API}/api/reports/issue/store/${store.StoreId}`);
                        return (Array.isArray(rows) ? rows : []).map((report) => ({
                            NotifId: `front-issue-${report.ReportID}`,
                            Synthetic: true,
                            EventType: 'ISSUE_REPORT',
                            StoreId: report.StoreId || store.StoreId,
                            Message: `มีรายงานปัญหาจาก ${report.StoreName || store.StoreName}: ${report.IssueType || 'ไม่ระบุประเภท'}`,
                            CreatedAt: report.CreatedAt
                        }));
                    }
                    catch {
                        return [];
                    }
                })
            );

            const merged = results
                .flat()
                .sort((a, b) => {
                    const ad = parseOrderDate(a.CreatedAt);
                    const bd = parseOrderDate(b.CreatedAt);
                    return (bd?.getTime() || 0) - (ad?.getTime() || 0);
                })
                .slice(0, 20);

            setIssueAlerts(merged);
        }
        catch (err) {
            console.debug('โหลดรายงานปัญหาสำหรับกระดิ่งไม่สำเร็จ:', err.message);
        }
    }, [API, stores]);

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
    useEffect(() => {
        loadStores();
        loadOrders();
        loadFoodCourt(true);
        loadNotifications(true);
        const timer = setInterval(() => {
            loadStores(true);
            loadOrders(true);
            loadFoodCourt(true);
            loadNotifications(true);
        }, REFRESH_MS);
        return () => clearInterval(timer);
    }, [loadStores, loadOrders, loadFoodCourt, loadNotifications]);
    useEffect(() => {
        if (!stores.length)
            return;

        loadIssueAlerts();
        const issueTimer = setInterval(loadIssueAlerts, REFRESH_MS);
        return () => clearInterval(issueTimer);
    }, [stores, loadIssueAlerts]);

    useEffect(() => {
        setSidebarOpen(!isNarrow);
    }, [isNarrow]);
    const toggleFoodCourt = async () => {
        const closing = foodCourtOpen;
        const ok = await ask({
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
            const data = await callApi(`${API}/api/food-court/toggle?performed_by=Executive`, { method: 'PUT' });
            setFoodCourtOpen(Boolean(data?.is_open));
            pushToast(data?.message || 'อัปเดตสถานะศูนย์อาหารแล้ว');
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
        finally {
            setSwitchingCourt(false);
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

    const contractAlerts = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return stores
            .filter((store) => store?.ContractEndDate)
            .map((store) => {
                const end = parseOrderDate(store.ContractEndDate);
                if (!end) return null;
                end.setHours(0, 0, 0, 0);
                const daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86400000);

                if (daysLeft < 0) {
                    return {
                        NotifId: `front-contract-expired-${store.StoreId}-${store.ContractEndDate}`,
                        Synthetic: true,
                        StoreId: store.StoreId,
                        Message: `สัญญาร้าน ${store.StoreName} หมดอายุแล้ว`,
                        CreatedAt: store.ContractEndDate,
                        EventType: 'CONTRACT_EXPIRED'
                    };
                }
                if (daysLeft <= 7) {
                    return {
                        NotifId: `front-contract-expiring-${store.StoreId}-${store.ContractEndDate}`,
                        Synthetic: true,
                        StoreId: store.StoreId,
                        Message: `สัญญาร้าน ${store.StoreName} ใกล้หมดอายุ (${daysLeft === 0 ? 'วันนี้' : `เหลือ ${daysLeft} วัน`})`,
                        CreatedAt: store.ContractEndDate,
                        EventType: 'CONTRACT_EXPIRING'
                    };
                }
                return null;
            })
            .filter(Boolean);
    }, [stores]);

    const displayNotifications = useMemo(() => {
        return [...issueAlerts, ...contractAlerts, ...notifications]
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
                setActiveMenu('store-sales');
                setSearch('');
            }
            else if (notif?.EventType === 'CONTRACT_EXPIRING' || notif?.EventType === 'CONTRACT_EXPIRED') {
                setFocusStoreId(String(notif.StoreId || ''));
                setActiveMenu('contract-tracking');
                setSearch('');
            }
        }
        else if (!isRead(notif)) {
            try {
                await callApi(`${API}/api/notifications/${notif.NotifId}/read`, { method: 'PUT' });
            }
            catch (err) {
                console.debug('mark-read endpoint ยังไม่พร้อม:', err.message);
            }
        }

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
        { id: 'overview', icon: 'overview', label: 'ภาพรวมศูนย์อาหาร', caption: 'สรุปยอดขายทั้งศูนย์' },
        { id: 'store-sales', icon: 'trend', label: 'ยอดขายรายร้าน', caption: 'เจาะรายร้าน/เมนู' },
        { id: 'store-manage', icon: 'store', label: 'จัดการร้านค้า', caption: 'เพิ่ม แก้ไข ปิดร้าน' },
        { id: 'store-accounts', icon: 'account', label: 'บัญชีร้านค้า', caption: 'บัญชีผู้ใช้ของร้าน' },
        { id: 'contract-tracking', icon: 'calendar', label: 'ติดตามสัญญา', caption: 'ระยะเวลาสัญญาร้านค้า' },
        { id: 'audit-history', icon: 'history', label: 'ประวัติการดำเนินการ', caption: 'กิจกรรมสำคัญในระบบ' }
    ];
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
        'store-accounts': {
            title: 'บัญชีร้านค้า',
            subtitle: 'ออกบัญชีผู้ใช้ให้ร้านค้าเข้าระบบไปจัดการเมนูและออเดอร์ของตัวเอง',
            searchPlaceholder: 'ค้นหาชื่อผู้ใช้หรือชื่อร้าน...'
        },
        'contract-tracking': {
            title: 'ติดตามระยะเวลาสัญญา',
            subtitle: 'ตรวจสอบวันเริ่มสัญญา วันสิ้นสุดสัญญา และร้านค้าที่ใกล้หมดอายุ',
            searchPlaceholder: 'ค้นหาร้านค้า...'
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

        <header style={{
            ...topbarStyle,
            padding: isPhone ? '10px 12px' : topbarStyle.padding,
            gap: isPhone ? '8px' : topbarStyle.gap
        }}>
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
                <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: foodCourtOpen ? T.up : T.down,
                display: 'inline-block'
            }}/>
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

          {isPhone && (<div style={{
                ...courtPillStyle,
                padding: '6px 9px',
                fontSize: '11.5px',
                background: foodCourtOpen ? T.greenSoft : T.redSoft,
                color: foodCourtOpen ? T.up : T.down
            }}>
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
                    {displayNotifications.map((n) => (<button key={n.NotifId} type="button" onClick={() => openNotification(n)} style={{
                    ...notifItemStyle,
                    background: isRead(n) ? T.surface : T.primarySoft
                }}>
                        <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    marginTop: '6px',
                    background: isRead(n) ? T.line : T.primary
                }}/>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', color: T.text, fontSize: '13px' }}>{n.Message}</span>
                          <span style={{ display: 'block', color: T.muted, fontSize: '11.5px', marginTop: '3px' }}>
                            {parseOrderDate(n.CreatedAt)?.toLocaleString('th-TH') || ''}
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

            {profileOpen && (<div style={profilePanelStyle}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: T.ink, lineHeight: 1.5 }}>
                    {greetingText()}, {accountName}
                  </h4>
                  <p style={{ margin: '4px 0 16px', fontSize: '13px', color: T.muted }}>
                    {accountRole} (ผู้บริหารศูนย์อาหาร)
                  </p>
                </div>

                <hr style={{ border: 'none', borderTop: `1px solid ${T.line}`, margin: '0 0 12px' }}/>

                <button type="button" className="of-dropdown-item" style={dropdownItemStyle} onClick={handleLogout}>
                  <Icon name="logout" size={18}/> ออกจากระบบ
                </button>
              </div>)}
          </div>
        </header>

        <div style={shellBodyStyle}>

          {sidebarOpen && (<aside style={{
                ...sidebarStyle,
                width: isNarrow ? 'min(84vw, 290px)' : sidebarStyle.width,
                minWidth: isNarrow ? 'min(84vw, 290px)' : sidebarStyle.minWidth,
                position: isNarrow ? 'absolute' : 'relative',
                left: isNarrow ? 0 : 'auto',
                top: isNarrow ? 0 : 'auto',
                bottom: isNarrow ? 0 : 'auto',
                alignSelf: isNarrow ? 'auto' : 'stretch',
                boxShadow: isNarrow ? '4px 0 24px rgba(18,25,38,.10)' : sidebarStyle.boxShadow,
                zIndex: isNarrow ? 60 : 20
            }}>
              <nav style={{ flex: 1 }}>
                <div style={sidebarLabelStyle}>เมนูหลัก</div>
                {MENUS.map((m) => (<button key={m.id} type="button" className="of-nav-item" onClick={() => {
                    setActiveMenu(m.id);
                    setFocusStoreId('');
                    setSearch('');
                    if (isNarrow)
                        setSidebarOpen(false);
                }} style={{
                    ...sidebarItemStyle,
                    background: activeMenu === m.id ? T.sideActive : 'transparent',
                    color: activeMenu === m.id ? T.primary : T.sideText
                }}>
                    <Icon name={m.icon} size={20}/>
                    <span style={{ minWidth: 0, textAlign: 'left' }}>
                      <span style={{ display: 'block', fontSize: '14px', fontWeight: activeMenu === m.id ? 600 : 500 }}>
                        {m.label}
                      </span>
                      <span className="of-nav-caption" style={{
                    display: 'block',
                    fontSize: '11.5px',
                    marginTop: '2px',
                    color: activeMenu === m.id ? T.primary : T.muted,
                    opacity: activeMenu === m.id ? 0.8 : 1
                }}>
                        {m.caption}
                      </span>
                    </span>
                  </button>))}
              </nav>

              <div style={sidebarFootStyle}>
                <div style={avatarStyle}>{String(accountName).charAt(0).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={ellipsisStyle}>{accountName}</div>
                  <div style={{ fontSize: '11.5px', color: T.muted }}>{accountRole}</div>
                </div>
              </div>
            </aside>)}

          {isNarrow && sidebarOpen && (<div style={backdropStyle} onClick={() => setSidebarOpen(false)}/>)}

          <main style={mainScrollStyle}>

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

              {activeMenu === 'overview' && (<OverviewPage ctx={ctx} foodCourtOpen={foodCourtOpen} switchingCourt={switchingCourt} onToggleCourt={toggleFoodCourt}/>)}
              {activeMenu === 'store-sales' && <StoreSalesPage ctx={ctx}/>}
              {activeMenu === 'store-manage' && <StoreManagePage ctx={ctx}/>}
              {activeMenu === 'store-accounts' && <StoreAccountsPage ctx={ctx}/>}
              {activeMenu === 'contract-tracking' && <ContractTrackingPage ctx={ctx}/>}
              {activeMenu === 'audit-history' && <AuditHistoryPage ctx={ctx}/>}
            </div>
          </main>
        </div>

      <ConfirmDialog state={confirmState} onCancel={() => closeConfirm(false)} onConfirm={() => closeConfirm(true)}/>
      <ToastStack toasts={toasts} onDismiss={dismissToast}/>
      </div>
    </>);
}
function OverviewPage({ ctx, foodCourtOpen, switchingCourt, onToggleCourt }) {
    const { orders, stores, loading, pushToast } = ctx;
    const [anchor, setAnchor] = useState(todayISO());
    const [days, setDays] = useState(1);
    const [exportPreview, setExportPreview] = useState(null);
    const report = useMemo(() => {
        const bounds = periodBounds(anchor, days);
        const prevBounds = previousBounds(anchor, days);
        const current = orders.filter((o) => inRange(o, bounds));
        const previous = orders.filter((o) => inRange(o, prevBounds));
        const now = summarize(current);
        const before = summarize(previous);
        const storeRows = stores
            .map((s) => {
            const mine = now.completed.filter((o) => String(o.StoreId) === String(s.StoreId));
            const minePrev = before.completed.filter((o) => String(o.StoreId) === String(s.StoreId));
            const cancelled = now.cancelled.filter((o) => String(o.StoreId) === String(s.StoreId));
            const sales = sumAmount(mine);
            const prevSales = sumAmount(minePrev);
            return {
                ...s,
                sales,
                prevSales,
                delta: changePct(sales, prevSales),
                completedCount: mine.length,
                cancelledCount: cancelled.length,
                cancelRate: mine.length + cancelled.length ? (cancelled.length / (mine.length + cancelled.length)) * 100 : 0,
                avg: mine.length ? sales / mine.length : 0
            };
        })
            .sort((a, b) => b.sales - a.sales);
        const byHour = Array.from({ length: 24 }, () => 0);
        now.completed.forEach((o) => {
            const at = parseOrderDate(o.CreatedAt);
            if (at)
                byHour[at.getHours()] += Number(o.TotalAmount || 0);
        });
        const peakHour = byHour.indexOf(Math.max(...byHour));
        const peakSales = byHour[peakHour] || 0;
        return {
            now,
            before,
            storeRows,
            buckets: buildBuckets(now.completed, anchor, days),
            peakHour: peakSales > 0 ? peakHour : null,
            peakSales,
            activeStores: stores.filter((s) => s.IsOpen && !s.IsSuspended).length
        };
    }, [orders, stores, anchor, days]);
    const periodLabel = days === 1 ? `วันที่ ${thaiDate(anchor)}` : `${days} วันย้อนหลังถึง ${thaiDate(anchor)}`;
    const compareLabel = days === 1 ? 'เทียบเมื่อวาน' : `เทียบ ${days} วันก่อนหน้า`;
    const visibleStoreRows = report.storeRows;
    const maxStoreSales = Math.max(...report.storeRows.map((s) => Number(s.sales) || 0), 1);
    const bestStore = report.storeRows.find((s) => s.sales > 0) || null;
    const watchStores = report.storeRows
        .filter((s) => s.IsSuspended || (s.delta !== null && s.delta <= -15) || s.cancelRate >= 10)
        .sort((a, b) => (Number(b.IsSuspended) - Number(a.IsSuspended)) || (b.cancelRate - a.cancelRate) || ((a.delta ?? 0) - (b.delta ?? 0)))
        .slice(0, 4);
    const csvRows = () => {
        const rows = [
            ['รายงานภาพรวมศูนย์อาหาร Only Foods'],
            ['ช่วงข้อมูล', periodLabel],
            ['ออกรายงานเมื่อ', nowStamp()],
            [],
            ['ตัวชี้วัด', 'ค่า', 'ช่วงก่อนหน้า'],
            ['ยอดขายสุทธิ (บาท)', Math.round(report.now.sales), Math.round(report.before.sales)],
            ['ออเดอร์สำเร็จ', report.now.completedCount, report.before.completedCount],
            ['ออเดอร์ยกเลิก', report.now.cancelledCount, report.before.cancelledCount],
            ['อัตราการยกเลิก (%)', report.now.cancelRate.toFixed(1), report.before.cancelRate.toFixed(1)],
            ['ยอดเฉลี่ยต่อออเดอร์ (บาท)', report.now.avgOrder.toFixed(2), report.before.avgOrder.toFixed(2)],
            [],
            ['ร้านค้า', 'ออเดอร์สำเร็จ', 'ยอดขาย (บาท)', 'ยกเลิก', 'ยอดเฉลี่ย/ออเดอร์', 'เทียบช่วงก่อน (%)'],
            ...report.storeRows.map((s) => [
                s.StoreName,
                s.completedCount,
                Math.round(s.sales),
                s.cancelledCount,
                s.avg.toFixed(2),
                s.delta === null ? '-' : s.delta.toFixed(1)
            ]),
            [],
            [days === 1 ? 'ช่วงเวลา' : 'วันที่', 'ยอดขาย (บาท)', 'ออเดอร์'],
            ...report.buckets.map((b) => [b.label, Math.round(b.sales), b.count])
        ];
        return rows;
    };
    const saveCsv = () => {
        exportCsv(`onlyfoods-overview-${anchor}-${days}d.csv`, csvRows());
        setExportPreview(null);
        pushToast('บันทึกไฟล์ CSV เรียบร้อยแล้ว');
    };
    const savePdf = () => {
        try {
            exportPdf(`onlyfoods-overview-${anchor}-${days}d.pdf`, {
                title: 'รายงานภาพรวมศูนย์อาหาร',
                subtitle: `ช่วงข้อมูล: ${periodLabel}`,
                kpis: [
                    {
                        label: 'ยอดขายสุทธิ',
                        value: `${money(report.now.sales)} บาท`,
                        note: describeDelta(changePct(report.now.sales, report.before.sales), compareLabel),
                        tone: toneOf(changePct(report.now.sales, report.before.sales))
                    },
                    {
                        label: 'ออเดอร์สำเร็จ',
                        value: `${money(report.now.completedCount)} ออเดอร์`,
                        note: describeDelta(changePct(report.now.completedCount, report.before.completedCount), compareLabel),
                        tone: toneOf(changePct(report.now.completedCount, report.before.completedCount))
                    },
                    {
                        label: 'ยอดเฉลี่ยต่อออเดอร์',
                        value: `${money2(report.now.avgOrder)} บาท`,
                        note: `${money(report.activeStores)} ร้านเปิดให้บริการ`
                    },
                    {
                        label: 'ออเดอร์ยกเลิก',
                        value: `${money(report.now.cancelledCount)} ออเดอร์`,
                        note: `อัตรายกเลิก ${report.now.cancelRate.toFixed(1)}%`,
                        tone: report.now.cancelRate > 10 ? 'down' : 'flat'
                    },
                    {
                        label: 'ร้านขายดีที่สุด',
                        value: bestStore ? bestStore.StoreName : '-',
                        note: bestStore ? `${money(bestStore.sales)} บาท` : 'ยังไม่มียอดขาย'
                    },
                    {
                        label: 'ช่วงเวลาขายดี',
                        value: report.peakHour === null ? '-' : `${pad2(report.peakHour)}:00 น.`,
                        note: report.peakHour === null ? 'ยังไม่มีข้อมูล' : `${money(report.peakSales)} บาท`
                    }
                ],
                tableTitle: 'สรุปผลรายร้าน',
                columns: [
                    { title: 'ร้านค้า', width: 0.34 },
                    { title: 'ออเดอร์สำเร็จ', width: 0.15, align: 'right' },
                    { title: 'ยอดขาย (บาท)', width: 0.19, align: 'right' },
                    { title: 'ยกเลิก', width: 0.12, align: 'right' },
                    { title: 'เทียบช่วงก่อน', width: 0.2, align: 'right' }
                ],
                rows: report.storeRows.map((s) => [
                    s.StoreName,
                    money(s.completedCount),
                    money(s.sales),
                    money(s.cancelledCount),
                    s.delta === null ? '-' : `${s.delta >= 0 ? '+' : ''}${s.delta.toFixed(1)}%`
                ])
            });
            setExportPreview(null);
            pushToast('บันทึกไฟล์ PDF เรียบร้อยแล้ว');
        }
        catch (err) {
            pushToast('สร้างไฟล์ PDF ไม่สำเร็จ', 'error');
        }
    };
    return (<>

      <Card style={{ marginBottom: '18px' }}>
        <div style={courtControlStyle}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', minWidth: 0 }}>

            <div style={{
            width: '48px',
            height: '48px',
            minWidth: '48px',
            borderRadius: T.radiusMd,
            display: 'grid',
            placeItems: 'center',
            background: foodCourtOpen ? T.greenSoft : T.redSoft,
            color: foodCourtOpen ? T.up : T.down
        }}>
              <Icon name="power" size={22} color={foodCourtOpen ? T.up : T.down}/>
            </div>
            <div style={{ minWidth: 0 }}>
            <h3 style={h3Style}>การควบคุมศูนย์อาหาร</h3>
            <p style={{ ...bodyStyle, margin: '6px 0 0' }}>
              สถานะปัจจุบัน:{' '}
              <strong style={{ color: foodCourtOpen ? T.up : T.down }}>
                {foodCourtOpen ? 'เปิดให้บริการ' : 'ปิดให้บริการ'}
              </strong>
            </p>
            <p style={captionStyle}>
              สถานะนี้เก็บในฐานข้อมูล ทุกโรลจึงเห็นตรงกัน และระบบจะบล็อกการสั่งอาหารให้อัตโนมัติเมื่อปิด
            </p>
            </div>
          </div>
          <Button variant={foodCourtOpen ? 'danger' : 'primary'} icon="power" onClick={onToggleCourt} disabled={switchingCourt}>
            {switchingCourt ? 'กำลังบันทึก...' : foodCourtOpen ? 'ปิดศูนย์อาหาร' : 'เปิดศูนย์อาหาร'}
          </Button>
        </div>
      </Card>

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
            <Button variant="dark" icon="download" onClick={() => setExportPreview('pdf')}>
              PDF
            </Button>
          </div>
        </div>
      </Card>

      <div className="of-kpi-hero">
        <KpiCard label="ยอดขายสุทธิ" value={`${money(report.now.sales)}`} unit="บาท" delta={changePct(report.now.sales, report.before.sales)} deltaLabel={compareLabel} highlight icon="trend"/>
        <KpiCard label="ออเดอร์สำเร็จ" value={money(report.now.completedCount)} unit="ออเดอร์" delta={changePct(report.now.completedCount, report.before.completedCount)} deltaLabel={compareLabel} variant="blue" icon="check"/>
      </div>

      <section className="of-card" style={{
          ...cardStyle,
          marginTop: '18px',
          marginBottom: '18px',
          padding: '0',
          overflow: 'hidden',
          border: watchStores.length ? '1px solid #E8552D' : `1px solid ${T.line}`,
          background: watchStores.length
              ? `linear-gradient(135deg, ${T.primary} 0%, ${T.primaryDark} 100%)`
              : T.surface,
          boxShadow: watchStores.length
              ? '0 12px 28px rgba(232,85,45,0.18)'
              : T.shadowSm
      }}>
        <div style={{
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '14px',
            flexWrap: 'wrap',
            background: watchStores.length
                ? 'rgba(255,255,255,0.04)'
                : T.surface,
            borderBottom: `1px solid ${watchStores.length ? 'rgba(255,255,255,0.20)' : T.line}`
        }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', minWidth: 0 }}>
            <div style={{
                width: '42px',
                height: '42px',
                minWidth: '42px',
                borderRadius: '12px',
                display: 'grid',
                placeItems: 'center',
                background: watchStores.length ? 'rgba(255,255,255,0.18)' : T.greenSoft
            }}>
              <Icon name={watchStores.length ? 'info' : 'check'} size={21}
                color={watchStores.length ? '#FFFFFF' : T.up}/>
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ ...h3Style, fontSize: '16px', color: watchStores.length ? '#FFFFFF' : T.ink }}>ร้านที่น่าจับตามอง</h3>
              <p style={{ ...captionStyle, marginTop: '4px', color: watchStores.length ? 'rgba(255,255,255,0.82)' : T.muted }}>
                คัดจากยอดขายลดลง อัตรายกเลิกสูง หรือร้านที่ถูกระงับสิทธิ์
              </p>
            </div>
          </div>

          <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 11px',
              borderRadius: '999px',
              background: watchStores.length ? 'rgba(255,255,255,0.18)' : T.greenSoft,
              color: watchStores.length ? '#FFFFFF' : T.up,
              fontSize: '12px',
              fontWeight: 700,
              whiteSpace: 'nowrap'
          }}>
            <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: watchStores.length ? '#FFFFFF' : T.up
            }}/>
            {watchStores.length ? `พบ ${watchStores.length} ร้าน` : 'สถานะปกติ'}
          </div>
        </div>

        <div style={{ padding: watchStores.length ? '16px 20px 20px' : '0 20px' }}>
          {watchStores.length === 0 ? (
            <EmptyState text="ยังไม่มีร้านที่มีสัญญาณผิดปกติในช่วงนี้" minHeight="110px"/>
          ) : (
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                gap: '12px'
            }}>
              {watchStores.map((s) => {
                const reasons = [];
                if (s.IsSuspended) reasons.push('ร้านถูกระงับสิทธิ์');
                if (s.delta !== null && s.delta <= -15 && (s.completedCount > 0 || s.sales > 0)) {
                    reasons.push(`ยอดขายลดลง ${Math.abs(s.delta).toFixed(1)}% จากช่วงก่อน`);
                }
                if (s.cancelRate >= 10) reasons.push(`อัตรายกเลิกสูง ${s.cancelRate.toFixed(1)}%`);
                if (!reasons.length && s.completedCount === 0 && s.sales === 0) {
                    reasons.push('ยังไม่มีข้อมูลยอดขายเพียงพอในช่วงนี้');
                }

                const severe = Boolean(s.IsSuspended) || s.cancelRate >= 15;
                const accent = severe ? T.down : '#E86532';
                const soft = severe ? '#FFE5DF' : '#FFEBDD';

                return (
                  <div key={s.StoreId} style={{
                      position: 'relative',
                      overflow: 'hidden',
                      border: `1px solid ${severe ? '#E89A8B' : '#E8B286'}`,
                      borderRadius: T.radiusLg,
                      background: T.surface,
                      boxShadow: '0 5px 16px rgba(42,44,65,0.05)'
                  }}>
                    <span style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: '5px',
                        background: accent
                    }}/>

                    <div style={{ padding: '16px 16px 16px 20px' }}>
                      <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '12px'
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                              color: T.ink,
                              fontSize: '15px',
                              lineHeight: 1.4,
                              fontWeight: 700,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                          }}>
                            {s.StoreName}
                          </div>
                          <div style={{
                              color: T.muted,
                              fontSize: '11.5px',
                              marginTop: '3px'
                          }}>
                            ร้านค้า #{s.StoreId}
                          </div>
                        </div>

                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 10px',
                            borderRadius: '999px',
                            background: soft,
                            color: severe ? T.down : '#B34D1D',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            whiteSpace: 'nowrap'
                        }}>
                          <span style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: accent
                          }}/>
                          {severe ? 'ควรตรวจสอบ' : 'ควรจับตา'}
                        </span>
                      </div>

                      <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                          gap: '8px',
                          marginTop: '15px'
                      }}>
                        {[
                          ['ยอดขาย', `${money(s.sales)} บาท`],
                          ['ออเดอร์', `${money(s.completedCount)} รายการ`],
                          ['ยกเลิก', `${s.cancelRate.toFixed(1)}%`]
                        ].map(([label, value]) => (
                          <div key={label} style={{
                              padding: '10px',
                              borderRadius: T.radiusMd,
                              background: '#F8F9FC',
                              border: `1px solid ${T.line}`,
                              minWidth: 0
                          }}>
                            <div style={{
                                color: T.muted,
                                fontSize: '10.5px',
                                whiteSpace: 'nowrap'
                            }}>{label}</div>
                            <div style={{
                                color: label === 'ยกเลิก' && s.cancelRate >= 10 ? T.down : T.ink,
                                fontSize: '13px',
                                fontWeight: 700,
                                marginTop: '3px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}>{value}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{
                          marginTop: '12px',
                          padding: '10px 11px',
                          borderRadius: T.radiusMd,
                          background: soft
                      }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: severe ? T.down : '#B34D1D',
                            fontSize: '11.5px',
                            fontWeight: 700
                        }}>
                          <Icon name="info" size={14} color={severe ? T.down : '#B34D1D'}/>
                          เหตุผลที่ควรจับตา
                        </div>
                        <div style={{
                            color: T.text,
                            fontSize: '12px',
                            lineHeight: 1.6,
                            marginTop: '5px'
                        }}>
                          {reasons.join(' · ')}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => ctx.navigateTo('store-sales', s.StoreId)}
                        style={{
                          width: '100%', marginTop: '11px', padding: '9px 12px',
                          borderRadius: T.radiusMd, border: `1px solid ${T.line}`,
                          background: T.surface, color: T.primaryDark, fontSize: '12.5px',
                          fontWeight: 700, cursor: 'pointer', fontFamily: FONT_STACK
                        }}
                      >
                        ดูรายละเอียดร้าน →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="of-kpi-small">
        <KpiCard size="sm" label="ยอดเฉลี่ยต่อออเดอร์" value={money2(report.now.avgOrder)} unit="บาท" delta={changePct(report.now.avgOrder, report.before.avgOrder)} deltaLabel={compareLabel} icon="trend" tone="blue"/>
        <KpiCard size="sm" label="ออเดอร์ยกเลิก" value={money(report.now.cancelledCount)} unit="ออเดอร์" delta={changePct(report.now.cancelledCount, report.before.cancelledCount)} deltaLabel={compareLabel} icon="ban" tone="amber" invertDelta/>
        <KpiCard size="sm" label="อัตราการยกเลิก" value={`${report.now.cancelRate.toFixed(1)}%`} delta={changePct(report.now.cancelRate, report.before.cancelRate)} deltaLabel={compareLabel} icon="info" tone="amber" invertDelta/>
        <KpiCard size="sm" label="ช่วงเวลาขายดี" value={report.peakHour === null ? '—' : `${pad2(report.peakHour)}:00`} unit={report.peakHour === null ? '' : 'น.'} hint={report.peakHour === null ? 'ยังไม่มียอดขาย' : `ทำยอดได้ ${money(report.peakSales)} บาท`} delta={null} icon="calendar" tone="purple"/>
      </div>

      <div style={chartGridStyle}>

        <Card>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ color: T.muted, fontSize: '14px', fontWeight: 500 }}>
                {days === 1 ? 'แนวโน้มยอดขายรายชั่วโมง' : 'แนวโน้มยอดขายรายวัน'}
              </div>
              <PeriodPicker anchor={anchor} setAnchor={setAnchor} days={days} setDays={setDays}/>
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


      <Card title="สรุปผลรายร้าน" subtitle={`ทั้งหมด ${money(ctx.stores.length)} ร้าน · เปิดให้บริการ ${money(report.activeStores)} ร้าน`} style={{ marginTop: '16px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ร้านค้า</th>
                <th style={thRightStyle}>ออเดอร์สำเร็จ</th>
                <th style={thRightStyle}>ยอดขาย</th>
                <th style={thRightStyle}>{compareLabel}</th>
                <th style={thRightStyle}>ยกเลิก</th>
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
                    <div style={{ height: '6px', background: T.trackSoft, borderRadius: '999px', marginTop: '6px', overflow: 'hidden' }}>
                      <div style={{
                height: '100%',
                width: `${Math.max((Number(s.sales || 0) / maxStoreSales) * 100, s.sales > 0 ? 3 : 0)}%`,
                borderRadius: '999px',
                background: T.primary
            }}/>
                    </div>
                  </td>
                  <td style={tdRightStyle}>
                    {s.delta === null ? (<span style={{ color: T.muted }}>—</span>) : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 9px', borderRadius: '999px', background: s.delta >= 0 ? T.greenSoft : T.redSoft, color: s.delta >= 0 ? T.up : T.down, fontWeight: 700 }}>
                        {s.delta >= 0 ? '▲' : '▼'} {Math.abs(s.delta).toFixed(1)}%
                      </span>)}
                  </td>
                  <td style={tdRightStyle}>{money(s.cancelledCount)}</td>
                  <td style={tdStyle}>
                    <Badge tone={s.IsSuspended ? 'danger' : s.IsOpen ? 'ok' : 'neutral'}>
                      {s.IsSuspended ? 'ระงับสิทธิ์' : s.IsOpen ? 'เปิดบริการ' : 'ปิดร้าน'}
                    </Badge>
                  </td>
                </tr>))}
              {visibleStoreRows.length === 0 && (<tr>
                  <td colSpan="6" style={{ ...tdStyle, textAlign: 'center', color: T.muted }}>
                    ไม่พบร้านค้าที่ตรงกับคำค้นหา
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <CancelledOrdersCard cancelled={report.now.cancelled} periodLabel={periodLabel} loading={loading} showStore/>

      <Modal open={Boolean(exportPreview)} title={`พรีวิวก่อนบันทึก ${String(exportPreview || '').toUpperCase()}`} subtitle={`รายงานภาพรวมศูนย์อาหาร · ${periodLabel}`} onClose={() => setExportPreview(null)} width={820} footer={<>
            <Button variant="ghost" onClick={() => setExportPreview(null)}>ยกเลิก</Button>
            <Button variant={exportPreview === 'pdf' ? 'dark' : 'primary'} icon="download" onClick={exportPreview === 'pdf' ? savePdf : saveCsv}>
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
              <Badge tone="neutral">{exportPreview === 'pdf' ? 'PDF · รายงานจัดหน้า A4' : 'CSV · เปิดต่อใน Excel ได้'}</Badge>
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '16px' }}>
              {[
            ['ยอดขายสุทธิ', `${money(report.now.sales)} บาท`],
            ['ออเดอร์สำเร็จ', `${money(report.now.completedCount)} ออเดอร์`],
            ['ออเดอร์ยกเลิก', `${money(report.now.cancelledCount)} ออเดอร์`],
            ['ยอดเฉลี่ย/ออเดอร์', `${money2(report.now.avgOrder)} บาท`]
        ].map(([label, value]) => (<div key={label} style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: '12px' }}>
                  <div style={{ ...captionStyle, margin: 0 }}>{label}</div>
                  <strong style={{ display: 'block', color: T.ink, marginTop: '6px', fontSize: '16px' }}>{value}</strong>
                </div>))}
            </div>
            <div style={{ ...captionStyle, color: T.text, fontWeight: 700, marginBottom: '8px' }}>ตัวอย่างข้อมูลสรุปผลรายร้าน</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>ร้านค้า</th>
                    <th style={thRightStyle}>ออเดอร์</th>
                    <th style={thRightStyle}>ยอดขาย</th>
                    <th style={thRightStyle}>ยกเลิก</th>
                  </tr>
                </thead>
                <tbody>
                  {report.storeRows.slice(0, 6).map((s) => (<tr key={s.StoreId} style={trStyle}>
                      <td style={tdStyle}>{s.StoreName}</td>
                      <td style={tdRightStyle}>{money(s.completedCount)}</td>
                      <td style={tdRightStyle}>{money(s.sales)} บาท</td>
                      <td style={tdRightStyle}>{money(s.cancelledCount)}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
            {report.storeRows.length > 6 && (<p style={{ ...captionStyle, textAlign: 'center', marginTop: '10px' }}>
                และอีก {report.storeRows.length - 6} ร้านในไฟล์จริง
              </p>)}
          </div>
        </div>
      </Modal>
    </>);
}
function toneOf(delta) {
    if (delta === null || delta === undefined)
        return 'flat';
    return delta >= 0 ? 'up' : 'down';
}
function describeDelta(delta, label) {
    if (delta === null || delta === undefined)
        return 'ไม่มีข้อมูลช่วงก่อนหน้า';
    return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% ${label}`;
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
      <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap'
        }}>
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
function StoreIssueReportSection({ ctx, storeId, style }) {
    const { API } = ctx;
    const [state, setState] = useState({ loading: false, error: null, rows: [] });
    const [typeFilter, setTypeFilter] = useState('all');

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
      right={reports.length > 0 ? <Badge tone="warning">{money(reports.length)} รายการ</Badge> : null}
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
          {filteredReports.map((report) => (<div key={report.ReportID} style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: '13px 14px', background: '#FFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong style={{ color: T.ink, fontSize: '14px' }}>{report.IssueType || 'ไม่ระบุประเภท'}</strong>
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
function CancelledOrdersCard({ cancelled = [], periodLabel, showStore = true, loading = false, style }) {
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
              {topReason && (<span style={captionStyle}>
                  {money(topReason.count)} ครั้ง · {topReason.share.toFixed(0)}% ของการยกเลิกทั้งหมด
                </span>)}
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
                        {showStore && <td style={tdStyle}>{o.StoreName || `ร้าน #${o.StoreId}`}</td>}
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
function StoreSalesPage({ ctx }) {
    const { orders, stores, pushToast, focusStoreId, navigateTo } = ctx;
    const [storeId, setStoreId] = useState(focusStoreId || '');
    useEffect(() => {
        if (focusStoreId) setStoreId(String(focusStoreId));
    }, [focusStoreId]);
    const [anchor, setAnchor] = useState(todayISO());
    const [days, setDays] = useState(1);
    const store = stores.find((s) => String(s.StoreId) === String(storeId)) || null;

    const salesContractInfo = (selectedStore) => {
        if (!selectedStore?.ContractEndDate) {
            return { label: 'ยังไม่ระบุสัญญา', tone: 'neutral', detail: 'ยังไม่มีวันสิ้นสุดสัญญา' };
        }
        const raw = String(selectedStore.ContractEndDate).slice(0, 10);
        const end = new Date(`${raw}T00:00:00`);
        if (Number.isNaN(end.getTime())) {
            return { label: 'ยังไม่ระบุสัญญา', tone: 'neutral', detail: 'ยังไม่มีวันสิ้นสุดสัญญา' };
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((end - today) / 86400000);

        if (daysLeft < 0) {
            return {
                label: 'สัญญาหมดอายุ',
                tone: 'danger',
                detail: `หมดอายุมาแล้ว ${Math.abs(daysLeft)} วัน`
            };
        }
        if (daysLeft === 0) {
            return { label: 'สัญญาหมดวันนี้', tone: 'danger', detail: 'ควรดำเนินการต่อสัญญา' };
        }
        if (daysLeft <= 30) {
            return { label: `เหลือ ${daysLeft} วัน`, tone: 'warning', detail: 'สัญญาใกล้หมดอายุ' };
        }
        return { label: `เหลือ ${daysLeft} วัน`, tone: 'ok', detail: 'สัญญายังมีผล' };
    };
    const selectedContract = store ? salesContractInfo(store) : null;

    const report = useMemo(() => {
        if (!storeId)
            return null;
        const bounds = periodBounds(anchor, days);
        const prevBounds = previousBounds(anchor, days);
        const current = orders.filter((o) => inRange(o, bounds, storeId));
        const previous = orders.filter((o) => inRange(o, prevBounds, storeId));
        const now = summarize(current);
        const before = summarize(previous);
        const menus = summarizeMenus(now.completed);
        return {
            now,
            before,
            buckets: buildBuckets(now.completed, anchor, days),
            bestMenus: menus.slice(0, 2),
            worstMenus: [...menus].reverse().slice(0, 2),
            menuCount: menus.length
        };
    }, [orders, storeId, anchor, days]);
    const periodLabel = days === 1 ? `วันที่ ${thaiDate(anchor)}` : `${days} วันย้อนหลังถึง ${thaiDate(anchor)}`;
    const compareLabel = days === 1 ? 'เทียบเมื่อวาน' : `เทียบ ${days} วันก่อนหน้า`;
    const handleCsv = () => {
        if (!report || !store)
            return;
        exportCsv(`onlyfoods-${store.StoreName}-${anchor}-${days}d.csv`, [
            [`รายงานยอดขายร้าน ${store.StoreName}`],
            ['ช่วงข้อมูล', periodLabel],
            ['ออกรายงานเมื่อ', nowStamp()],
            [],
            ['ตัวชี้วัด', 'ค่า', 'ช่วงก่อนหน้า'],
            ['ยอดขายสุทธิ (บาท)', Math.round(report.now.sales), Math.round(report.before.sales)],
            ['ออเดอร์สำเร็จ', report.now.completedCount, report.before.completedCount],
            ['ออเดอร์ยกเลิก', report.now.cancelledCount, report.before.cancelledCount],
            ['ยอดเฉลี่ยต่อออเดอร์', report.now.avgOrder.toFixed(2), report.before.avgOrder.toFixed(2)],
            [],
            ['เมนู', 'จำนวนที่ขายได้', 'ยอดขาย (บาท)', 'สัดส่วนของยอดร้าน (%)'],
            ...summarizeMenus(report.now.completed).map((m) => [
                m.name,
                m.qty,
                Math.round(m.amount),
                m.share.toFixed(1)
            ]),
            [],
            [days === 1 ? 'ช่วงเวลา' : 'วันที่', 'ยอดขาย (บาท)', 'ออเดอร์'],
            ...report.buckets.map((b) => [b.label, Math.round(b.sales), b.count])
        ]);
        pushToast('บันทึกไฟล์ CSV เรียบร้อยแล้ว');
    };
    const handlePdf = () => {
        if (!report || !store)
            return;
        exportPdf(`onlyfoods-${store.StoreName}-${anchor}-${days}d.pdf`, {
            title: `รายงานยอดขาย · ${store.StoreName}`,
            subtitle: `ช่วงข้อมูล: ${periodLabel}`,
            kpis: [
                {
                    label: 'ยอดขายสุทธิ',
                    value: `${money(report.now.sales)} บาท`,
                    note: describeDelta(changePct(report.now.sales, report.before.sales), compareLabel),
                    tone: toneOf(changePct(report.now.sales, report.before.sales))
                },
                {
                    label: 'ออเดอร์สำเร็จ',
                    value: `${money(report.now.completedCount)} ออเดอร์`,
                    note: describeDelta(changePct(report.now.completedCount, report.before.completedCount), compareLabel),
                    tone: toneOf(changePct(report.now.completedCount, report.before.completedCount))
                },
                {
                    label: 'ยอดเฉลี่ยต่อออเดอร์',
                    value: `${money2(report.now.avgOrder)} บาท`,
                    note: `ยกเลิก ${report.now.cancelledCount} ออเดอร์`
                }
            ],
            tableTitle: 'ยอดขายแยกตามเมนู',
            columns: [
                { title: 'เมนู', width: 0.46 },
                { title: 'จำนวน', width: 0.16, align: 'right' },
                { title: 'ยอดขาย (บาท)', width: 0.2, align: 'right' },
                { title: 'สัดส่วน', width: 0.18, align: 'right' }
            ],
            rows: summarizeMenus(report.now.completed).map((m) => [
                m.name,
                money(m.qty),
                money(m.amount),
                `${m.share.toFixed(1)}%`
            ])
        });
        pushToast('บันทึกไฟล์ PDF เรียบร้อยแล้ว');
    };
    return (<>
      <Card style={{ marginBottom: '16px', zIndex: 40 }}>
        <div style={toolbarStyle}>
          <div style={{ minWidth: '240px', flex: 1 }}>
            <h3 style={h3Style}>เลือกร้านค้า</h3>
            <SearchableStorePicker stores={stores} value={storeId} onChange={setStoreId}/>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>

            <Button variant="ghost" icon="download" onClick={handleCsv} disabled={!storeId}>
              CSV
            </Button>
            <Button variant="dark" icon="download" onClick={handlePdf} disabled={!storeId}>
              PDF
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
                <h3 style={h3Style}>{store.StoreName}</h3>
                <p style={captionStyle}>{periodLabel}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
                <Button
                  variant="ghost"
                  icon="edit"
                  onClick={() => navigateTo('store-manage', store.StoreId)}
                  title="ไปหน้าแก้ไขข้อมูลร้านนี้"
                  style={{ padding: '7px 12px' }}
                >
                  แก้ไขข้อมูลร้าน
                </Button>
                <Badge tone={store.IsOpen ? 'ok' : 'neutral'}>
                  {store.IsOpen ? 'เปิดร้าน' : 'ปิดร้าน'}
                </Badge>
                <Badge tone={store.IsSuspended ? 'danger' : 'ok'}>
                  {store.IsSuspended ? 'ถูกระงับสิทธิ์' : 'สิทธิ์ปกติ'}
                </Badge>
                {selectedContract && (
                  <button
                    type="button"
                    onClick={() => navigateTo('contract-tracking', store.StoreId)}
                    title="ไปจัดการสัญญาร้านนี้"
                    style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: FONT_STACK }}
                  >
                    <Badge tone={selectedContract.tone}>
                      สัญญา: {selectedContract.label} · จัดการ →
                    </Badge>
                  </button>
                )}
              </div>
            </div>
          </Card>

          <div className="of-kpi-hero">
            <KpiCard label="ยอดขายสุทธิ" value={money(report.now.sales)} unit="บาท" delta={changePct(report.now.sales, report.before.sales)} deltaLabel={compareLabel} highlight icon="trend"/>
            <KpiCard label="ออเดอร์สำเร็จ" value={money(report.now.completedCount)} unit="ออเดอร์" delta={changePct(report.now.completedCount, report.before.completedCount)} deltaLabel={compareLabel} variant="blue" icon="check"/>
          </div>

          <div className="of-kpi-small">
            <KpiCard size="sm" label="ยอดเฉลี่ยต่อออเดอร์" value={money2(report.now.avgOrder)} unit="บาท" delta={changePct(report.now.avgOrder, report.before.avgOrder)} deltaLabel={compareLabel} icon="trend" tone="blue"/>
            <KpiCard size="sm" label="ออเดอร์ยกเลิก" value={money(report.now.cancelledCount)} unit="ออเดอร์" delta={changePct(report.now.cancelledCount, report.before.cancelledCount)} deltaLabel={compareLabel} icon="ban" tone="amber" invertDelta/>
          </div>

          <Card style={{ marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ color: T.muted, fontSize: '14px', fontWeight: 500 }}>
                  {days === 1 ? 'แนวโน้มยอดขายรายชั่วโมง' : 'แนวโน้มยอดขายรายวัน'}
                </div>
                <PeriodPicker anchor={anchor} setAnchor={setAnchor} days={days} setDays={setDays}/>
              </div>
              <h3 style={{ margin: '6px 0 0', fontSize: '24px', fontWeight: 700, color: T.ink }}>
                {money(report.now.sales)} บาท
              </h3>
              <p style={captionStyle}>ชี้ที่จุดบนกราฟเพื่อดูยอดขายของช่วงเวลานั้น</p>
            </div>
            <SalesLineChart buckets={report.buckets} showStoreDetail={false}/>
          </Card>

          <div style={{ ...chartGridStyle, marginBottom: '16px' }}>
            <Card title="เมนูขายดี 2 อันดับแรก" subtitle="ดูว่าเมนูไหนเป็นตัวทำรายได้หลักของร้าน">
              <MenuRankList rows={report.bestMenus} emptyText="ช่วงนี้ยังไม่มีเมนูที่ขายได้"/>
            </Card>
            <Card title="เมนูที่ขายได้น้อย 2 อันดับ" subtitle="ใช้ตัดสินใจว่าควรปรับราคา จัดโปรฯ หรือถอดเมนูออก">
              <MenuRankList rows={report.worstMenus} tone="accent" emptyText="ช่วงนี้ยังไม่มีเมนูที่ขายได้"/>
            </Card>
          </div>
          <div style={{ display: 'grid', gap: '16px', marginTop: '16px' }}>
            <CancelledOrdersCard cancelled={report.now.cancelled} periodLabel={`${store.StoreName} · ${periodLabel}`} showStore={false} style={{ marginTop: 0 }}/>
            <StoreReviewSection ctx={ctx} storeId={storeId}/>
            <StoreIssueReportSection ctx={ctx} storeId={storeId}/>
          </div>
        </>)}
    </>);
}
const EMPTY_STORE_FORM = {
    StoreId: null,
    name: '',
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
    contractEndDate: ''
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
function validateStoreForm(form) {
    const errors = {};
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
    const phone = form.phone.replace(/[\s-]/g, '');
    if (!phone)
        errors.phone = 'กรุณากรอกเบอร์โทรติดต่อ';
    else if (!/^0\d{8,9}$/.test(phone)) {
        errors.phone = 'เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก และขึ้นต้นด้วย 0';
    }
    else if (looksLikeGarbage(phone)) {
        errors.phone = 'เบอร์โทรนี้ไม่ถูกต้อง';
    }
    const lineId = form.lineId.trim();
    if (!lineId) {
        errors.lineId = 'กรุณากรอก LINE ID สำหรับติดต่อร้าน';
    }
    else if (/\s/.test(lineId)) {
        errors.lineId = 'LINE ID ห้ามมีช่องว่าง';
    }
    else if (lineId.replace(/^@/, '').length < 2) {
        errors.lineId = 'LINE ID สั้นเกินไป';
    }
    else if (lineId.length > 30) {
        errors.lineId = 'LINE ID ต้องไม่เกิน 30 ตัวอักษร';
    }
    else if (looksLikeGarbage(lineId.replace(/^@/, ''))) {
        errors.lineId = 'กรุณากรอก LINE ID ที่ถูกต้อง ไม่ใช่ข้อความมั่ว';
    }
    const email = form.email.trim();
    if (!email) {
        errors.email = 'กรุณากรอกอีเมลติดต่อ';
    }
    else if (!EMAIL_RE.test(email)) {
        errors.email = 'รูปแบบอีเมลไม่ถูกต้อง เช่น shop@example.com';
    }
    else if (looksLikeGarbage(email.split('@')[0])) {
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
    return errors;
}
function StoreFormModal({ open, mode, form, setForm, errors, setErrors, onClose, onSubmit, saving }) {
    const fileInputRef = useRef(null);
    const [dragOver, setDragOver] = useState(false);

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
            setForm((prev) => ({ ...prev, imageData: String(reader.result), imageName: file.name }));
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
    return (<Modal open={open} title={mode === 'edit' ? 'แก้ไขข้อมูลร้านค้า' : 'เพิ่มร้านค้าใหม่'} subtitle="ช่องที่มีเครื่องหมาย * ต้องกรอกให้ครบก่อนจึงจะบันทึกได้" onClose={onClose} width={660} footer={<>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button icon="check" onClick={onSubmit} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : mode === 'edit' ? 'บันทึกการแก้ไข' : 'เพิ่มร้านค้า'}
          </Button>
        </>}>
      <Field label="ชื่อร้านค้า" required error={errors.name}>
        <input value={form.name} onChange={update('name')} maxLength={100} placeholder="เช่น ร้านข้าวแกงวิศวะเดือด" style={inputStyle}/>
      </Field>

      <Field label="ประเภทอาหาร" required error={errors.category}>
        <select value={form.category} onChange={update('category')} style={inputStyle}>
          <option value="">— เลือกประเภทอาหาร —</option>
          {FOOD_CATEGORIES.map((c) => (<option key={c} value={c}>
              {c}
            </option>))}
        </select>
      </Field>

      <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px'
      }}>
        <Field label="วันที่เริ่มสัญญา" required error={errors.contractStartDate}>
          <input type="date" value={form.contractStartDate || ''} onChange={update('contractStartDate')} style={inputStyle}/>
        </Field>

        <Field label="ระยะเวลาสัญญา" required error={errors.contractDuration}>
          <select value={form.contractDuration || ''} onChange={update('contractDuration')} style={inputStyle}>
            <option value="">— เลือกระยะเวลา —</option>
            <option value="6m">6 เดือน</option>
            <option value="1y">1 ปี</option>
            <option value="2y">2 ปี</option>
            <option value="3y">3 ปี</option>
            <option value="custom">กำหนดวันสิ้นสุดเอง</option>
          </select>
        </Field>

        <Field
          label="วันที่สิ้นสุดสัญญา"
          required
          error={errors.contractEndDate}
          hint={form.contractDuration && form.contractDuration !== 'custom'
              ? 'ระบบคำนวณจากวันเริ่มสัญญาอัตโนมัติ'
              : form.contractDuration === 'custom'
                ? 'เลือกวันสิ้นสุดสัญญาได้เอง'
                : 'เลือกระยะเวลาสัญญาก่อน'}>
          <input
            type="date"
            value={form.contractEndDate || ''}
            min={form.contractStartDate || undefined}
            onChange={update('contractEndDate')}
            disabled={form.contractDuration !== 'custom'}
            style={{
                ...inputStyle,
                background: form.contractDuration !== 'custom' ? '#F7F8FB' : inputStyle.background,
                color: form.contractDuration !== 'custom' ? T.muted : T.ink,
                cursor: form.contractDuration !== 'custom' ? 'not-allowed' : 'pointer'
            }}
          />
        </Field>
      </div>

      <div style={twoColStyle}>
        <Field label="ชื่อผู้ติดต่อ" required error={errors.contactName}>
          <input value={form.contactName} onChange={update('contactName')} maxLength={60} placeholder="ชื่อเจ้าของร้านหรือผู้ดูแล" style={inputStyle}/>
        </Field>

        <Field label="เบอร์โทรติดต่อ" required error={errors.phone} hint="ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0">
          <input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value.replace(/[^\d]/g, '').slice(0, 10) }))} inputMode="numeric" placeholder="0812345678" style={inputStyle}/>
        </Field>
      </div>

      <div style={twoColStyle}>
        <Field label="LINE ID" required error={errors.lineId} hint="ห้ามเว้นวรรค">
          <input value={form.lineId} onChange={(e) => setForm((prev) => ({ ...prev, lineId: e.target.value.replace(/\s/g, '').slice(0, 30) }))} placeholder="@onlyfoods" style={inputStyle}/>
        </Field>

        <Field label="อีเมล" required error={errors.email} hint="เช่น shop@example.com">
          <input type="email" value={form.email} onChange={update('email')} maxLength={100} placeholder="shop@example.com" style={inputStyle}/>
        </Field>
      </div>

      <Field label="คำอธิบายร้าน" error={errors.description} hint={`${form.description.length}/300 ตัวอักษร`}>
        <textarea value={form.description} onChange={update('description')} maxLength={300} rows={3} placeholder="จุดเด่นของร้าน เมนูแนะนำ ฯลฯ" style={{ ...inputStyle, resize: 'vertical', fontFamily: FONT_STACK }}/>
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
    </Modal>);
}
function StoreManagePage({ ctx }) {
    const { API, user, stores, search, pushToast, ask, reloadStores, focusStoreId, clearFocusStore } = ctx;
    const [details, setDetails] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [mode, setMode] = useState('create');
    const [form, setForm] = useState(EMPTY_STORE_FORM);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [quickName, setQuickName] = useState('');
    const loadDetails = useCallback(async () => {
        try {
            const data = await callApi(`${API}/api/stores`);
            setDetails(Array.isArray(data) ? data : []);
        }
        catch (err) {
            console.debug('โหลดรายละเอียดร้านไม่สำเร็จ:', err.message);
        }
    }, [API]);
    useEffect(() => {
        loadDetails();
    }, [loadDetails]);
    const detailOf = (storeId) => details.find((d) => String(d.StoreId) === String(storeId)) || {};
    const rows = stores.filter((s) => String(s.StoreName || '').toLowerCase().includes(search));
    const openCreate = () => {
        if (!quickName.trim()) {
            pushToast('กรุณากรอกชื่อร้านค้าก่อน จึงจะเปิดฟอร์มเพิ่มร้านได้', 'warn');
            return;
        }
        setMode('create');
        setForm({ ...EMPTY_STORE_FORM, name: quickName.trim() });
        setErrors({});
        setModalOpen(true);
    };
    const openEdit = (store) => {
        const d = detailOf(store.StoreId);
        setMode('edit');
        setForm({
            StoreId: store.StoreId,
            name: store.StoreName || '',
            category: d.Category || '',
            contactName: d.ContactName || '',
            phone: d.ContactPhone || '',
            lineId: d.ContactLine || '',
            email: d.ContactEmail || '',
            description: d.Description || '',
            imageData: d.ImageUrl || '',
            imageName: '',
            contractStartDate: d.ContractStartDate ? String(d.ContractStartDate).slice(0, 10) : '',
            contractDuration: d.ContractStartDate && d.ContractEndDate ? 'custom' : '',
            contractEndDate: d.ContractEndDate ? String(d.ContractEndDate).slice(0, 10) : ''
        });
        setErrors({});
        setModalOpen(true);
    };

    // [CROSS-NAV] มาจากหน้ายอดขายรายร้าน -> เปิดฟอร์มแก้ไขร้านที่เลือกให้ทันที
    useEffect(() => {
        if (!focusStoreId || !details.length)
            return;
        const targetStore = stores.find((s) => String(s.StoreId) === String(focusStoreId));
        if (!targetStore)
            return;
        openEdit(targetStore);
        clearFocusStore();
    }, [focusStoreId, details, stores]);

    const submitForm = async () => {
        const found = validateStoreForm(form);
        setErrors(found);
        if (Object.keys(found).length) {
            pushToast('ยังกรอกข้อมูลไม่ครบหรือไม่ถูกต้อง กรุณาตรวจสอบช่องที่มีข้อความสีแดง', 'error');
            return;
        }
        const payload = {
            store_name: form.name.trim(),
            category: form.category,
            contact_name: form.contactName.trim(),
            contact_phone: form.phone,
            contact_line: form.lineId.trim(),
            contact_email: form.email.trim(),
            description: form.description.trim(),
            image_url: form.imageData,
            contract_start_date: form.contractStartDate || null,
            contract_end_date: form.contractEndDate || null,
            performed_by: 'Executive'
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
            try {
                await send(fullPath, method);
                pushToast(isEdit ? 'บันทึกการแก้ไขร้านค้าแล้ว' : 'เพิ่มร้านค้าเข้าระบบเรียบร้อยแล้ว');
            }
            catch (fullError) {
                if (!/endpoint/i.test(fullError.message))
                    throw fullError;
                await send(basicPath, method);
                pushToast('บันทึกได้เฉพาะชื่อร้าน — เพิ่มโค้ดจาก main_additions.py ในหลังบ้านก่อน จึงจะเก็บประเภทอาหาร/ช่องทางติดต่อ/รูปได้', 'warn');
            }
            if (!isEdit)
                setQuickName('');
            setModalOpen(false);
            await reloadStores();
            await loadDetails();
        }
        catch (err) {
            pushToast(err.message, 'error');
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
        const ok = await ask({
            title: closing ? 'ปิดร้านค้า' : 'เปิดร้านค้า',
            message: `ยืนยัน${closing ? 'ปิด' : 'เปิด'}ร้าน "${store.StoreName}" ใช่หรือไม่`,
            warning: closing ? 'ลูกค้าจะสั่งอาหารจากร้านนี้ไม่ได้จนกว่าจะเปิดใหม่' : null,
            confirmText: closing ? 'ปิดร้าน' : 'เปิดร้าน',
            danger: closing
        });
        if (!ok)
            return;
        try {
            await callApi(`${API}/api/stores/${store.StoreId}/toggle?performed_by=Executive`, { method: 'PUT' });
            pushToast(`${closing ? 'ปิด' : 'เปิด'}ร้าน ${store.StoreName} แล้ว`);
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
            warning: 'เมนูของร้านจะถูกลบไปด้วย และถ้าร้านนี้เคยมีออเดอร์ ระบบจะไม่ยอมให้ลบ (ให้ใช้ระงับสิทธิ์แทน)',
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
    return (<>
      <Card title="เพิ่มร้านค้าใหม่" subtitle="พิมพ์ชื่อร้านก่อน แล้วกดต่อเพื่อกรอกรายละเอียดให้ครบ" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
          <input value={quickName} onChange={(e) => setQuickName(e.target.value)} onKeyDown={(e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                openCreate();
            }
        }} maxLength={100} placeholder="ชื่อร้านค้า เช่น ก๋วยเตี๋ยวเรือตึกพระเทพ" style={{ ...inputStyle, flex: 1, minWidth: '240px' }}/>
          <Button icon="plus" onClick={openCreate}>
            กรอกรายละเอียดร้าน
          </Button>
        </div>
      </Card>

      <Card title="รายชื่อร้านค้าทั้งหมด" subtitle={`${money(rows.length)} ร้านที่แสดงอยู่ · ใช้ช่องค้นหาด้านบนเพื่อกรองรายชื่อ`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ร้านค้า</th>
                <th style={thStyle}>ประเภท</th>
                <th style={thStyle}>ติดต่อ</th>
                <th style={thStyle}>สถานะ</th>
                <th style={thRightStyle}>ยอดขายสะสม</th>
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
                        <Badge tone={s.IsOpen ? 'ok' : 'neutral'}>{s.IsOpen ? 'เปิด' : 'ปิด'}</Badge>
                        {Boolean(s.IsSuspended) && <Badge tone="danger">ระงับสิทธิ์</Badge>}
                      </div>
                    </td>
                    <td style={tdRightStyle}>{money(s.net_sales)} บาท</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <Button variant="soft" icon="edit" onClick={() => openEdit(s)} style={smallBtn}>
                          แก้ไข
                        </Button>
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
                        <Button variant="soft" icon="ban" onClick={() => suspendStore(s)} style={smallBtn}>
                          {s.IsSuspended ? 'ปลดระงับ' : 'ระงับสิทธิ์'}
                        </Button>
                        <Button variant="danger" icon="trash" onClick={() => deleteStore(s)} style={smallBtn}>
                          ลบ
                        </Button>
                      </div>
                    </td>
                  </tr>);
        })}
              {rows.length === 0 && (<tr>
                  <td colSpan="6" style={{ ...tdStyle, textAlign: 'center', color: T.muted }}>
                    ไม่พบร้านค้าที่ตรงกับคำค้นหา
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <StoreFormModal open={modalOpen} mode={mode} form={form} setForm={setForm} errors={errors} setErrors={setErrors} saving={saving} onClose={() => setModalOpen(false)} onSubmit={submitForm}/>
    </>);
}
const STORE_ROLES = ['Shop Owner'];
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
    else if (form.password.length < 6)
        errors.password = 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร';
    else if (form.password.length > 50)
        errors.password = 'รหัสผ่านต้องไม่เกิน 50 ตัวอักษร';
    else if (/\s/.test(form.password))
        errors.password = 'รหัสผ่านห้ามมีช่องว่าง';
    if (form.confirm !== form.password)
        errors.confirm = 'ยืนยันรหัสผ่านไม่ตรงกัน';
    return errors;
}


function ContractTrackingPage({ ctx }) {
    const { API, search, pushToast, ask, focusStoreId, clearFocusStore } = ctx;
    const [stores, setStores] = useState([]);
    const [loadingContracts, setLoadingContracts] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [renewStore, setRenewStore] = useState(null);
    const [renewDuration, setRenewDuration] = useState('1y');
    const [renewCustomEnd, setRenewCustomEnd] = useState('');
    const [renewSaving, setRenewSaving] = useState(false);
    const [renewError, setRenewError] = useState('');
    const [renewAction, setRenewAction] = useState('renew_unsuspend');

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

    const dateOnly = (value) => {
        if (!value) return null;
        const raw = String(value).slice(0, 10);
        const d = new Date(`${raw}T00:00:00`);
        return Number.isNaN(d.getTime()) ? null : d;
    };
    const formatContractDate = (value) => {
        const d = dateOnly(value);
        return d ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    };
    const nextDayISO = (value) => {
        const d = dateOnly(value);
        if (!d) return todayISO();
        d.setDate(d.getDate() + 1);
        return toISODate(d);
    };
    const renewalBaseDate = (currentEnd) => {
        const current = dateOnly(currentEnd);
        const today = dateOnly(todayISO());
        if (!current) return today;
        return current > today ? current : today;
    };
    const calculateRenewEnd = (currentEnd, duration) => {
        const base = renewalBaseDate(currentEnd);
        if (!base || !duration || duration === 'custom') return '';
        const months = { '6m': 6, '1y': 12, '2y': 24, '3y': 36 }[duration];
        if (!months) return '';
        const originalDay = base.getDate();
        const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
        const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
        target.setDate(Math.min(originalDay, lastDay));
        return toISODate(target);
    };
    const minimumRenewEnd = (store) => {
        const base = renewalBaseDate(store?.ContractEndDate);
        return nextDayISO(toISODate(base));
    };
    const openRenew = (store) => {
        setRenewStore(store);
        setRenewDuration('1y');
        setRenewCustomEnd('');
        setRenewError('');
        setRenewAction(store?.IsSuspended ? 'renew_unsuspend' : 'renew_only');
    };
    const closeRenew = () => {
        if (!renewSaving) {
            setRenewStore(null);
            setRenewDuration('1y');
            setRenewCustomEnd('');
            setRenewError('');
            setRenewAction('renew_unsuspend');
        }
    };
    const renewNewEnd = renewStore
        ? (renewDuration === 'custom' ? renewCustomEnd : calculateRenewEnd(renewStore.ContractEndDate, renewDuration))
        : '';
    const renewBase = renewStore ? renewalBaseDate(renewStore.ContractEndDate) : null;
    const renewNewStart = renewBase ? nextDayISO(toISODate(renewBase)) : '';

    const suspendExpiredStore = async (store) => {
        if (!store || store.IsSuspended) return;
        const ok = await ask({
            title: 'ไม่ต่อสัญญาและระงับสิทธิ์',
            message: `สัญญาร้าน "${store.StoreName}" หมดอายุแล้ว ต้องการยุติการให้บริการและระงับสิทธิ์ร้านนี้หรือไม่?`,
            warning: 'ร้านจะไม่สามารถให้บริการได้จนกว่าผู้บริหารจะปลดระงับสิทธิ์',
            confirmText: 'ระงับสิทธิ์',
            danger: true
        });
        if (!ok) return;

        try {
            await callApi(`${API}/api/stores/${store.StoreId}/suspend?performed_by=Executive`, {
                method: 'PUT'
            });
            pushToast(`ระงับสิทธิ์ร้าน ${store.StoreName} แล้ว`);
            await loadContracts();
        } catch (err) {
            pushToast(err.message, 'error');
        }
    };

    const submitRenew = async () => {
        if (!renewStore || !renewNewEnd) {
            setRenewError('กรุณาเลือกวันสิ้นสุดสัญญาใหม่');
            return;
        }

        const newEnd = dateOnly(renewNewEnd);
        const currentEnd = dateOnly(renewStore.ContractEndDate);
        const today = dateOnly(todayISO());

        if (!newEnd) {
            setRenewError('รูปแบบวันสิ้นสุดสัญญาไม่ถูกต้อง');
            return;
        }
        if (newEnd <= today) {
            setRenewError('วันสิ้นสุดสัญญาใหม่ต้องเป็นวันในอนาคต');
            return;
        }
        if (currentEnd && newEnd <= currentEnd) {
            setRenewError(`วันสิ้นสุดใหม่ต้องอยู่หลังวันสิ้นสุดสัญญาปัจจุบัน (${formatContractDate(renewStore.ContractEndDate)})`);
            return;
        }

        setRenewSaving(true);
        setRenewError('');

        try {
            const data = await callApi(`${API}/api/stores/${renewStore.StoreId}/renew-contract`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contract_end_date: renewNewEnd,
                    performed_by: 'Executive'
                })
            });

            if (renewStore.IsSuspended && renewAction === 'renew_unsuspend') {
                await callApi(
                    `${API}/api/stores/${renewStore.StoreId}/suspend?performed_by=Executive`,
                    { method: 'PUT' }
                );
            }

            pushToast(
                renewStore.IsSuspended && renewAction === 'renew_unsuspend'
                    ? `ต่อสัญญาและปลดระงับสิทธิ์ร้าน ${renewStore.StoreName} เรียบร้อยแล้ว`
                    : (data?.message || `ต่อสัญญาร้าน ${renewStore.StoreName} เรียบร้อยแล้ว`)
            );

            setRenewStore(null);
            setRenewDuration('1y');
            setRenewCustomEnd('');
            setRenewAction('renew_unsuspend');
            await loadContracts();
        } catch (err) {
            setRenewError(err.message);
            pushToast(err.message, 'error');
        } finally {
            setRenewSaving(false);
        }
    };
    const contractInfo = (store) => {
        const end = dateOnly(store.ContractEndDate);
        if (!end) return { key: 'missing', label: 'ยังไม่ระบุสัญญา', days: null, bg: '#F2F3F7', color: T.muted };
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = Math.ceil((end - today) / 86400000);
        if (days <= 0) return {
            key: 'expired',
            label: days === 0 ? 'หมดอายุวันนี้' : 'หมดอายุแล้ว',
            days,
            bg: T.redSoft,
            color: T.down
        };
        if (days <= 30) return { key: 'soon', label: 'ใกล้หมดอายุ', days, bg: T.accentSoft, color: T.accentDark };
        return { key: 'active', label: 'ปกติ', days, bg: T.greenSoft, color: T.up };
    };

    const enriched = stores.map((s) => ({ ...s, contract: contractInfo(s) }));
    const filtered = enriched
        .filter((s) => !focusStoreId || String(s.StoreId) === String(focusStoreId))
        .filter((s) => statusFilter === 'all' || s.contract.key === statusFilter)
        .filter((s) => String(s.StoreName || '').toLowerCase().includes(search))
        .sort((a, b) => {
            const ae = dateOnly(a.ContractEndDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
            const be = dateOnly(b.ContractEndDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
            return ae - be;
        });

    const active = enriched.filter((s) => s.contract.key === 'active').length;
    const soon = enriched.filter((s) => s.contract.key === 'soon').length;
    const expired = enriched.filter((s) => s.contract.key === 'expired').length;
    const missing = enriched.filter((s) => s.contract.key === 'missing').length;

    const filters = [
        ['all', 'ทั้งหมด'],
        ['active', 'ปกติ'],
        ['soon', 'ใกล้หมดอายุ'],
        ['expired', 'หมดอายุแล้ว'],
        ['missing', 'ยังไม่ระบุ']
    ];

    const focusedStore = focusStoreId ? enriched.find((s) => String(s.StoreId) === String(focusStoreId)) : null;

    return (<>
      {focusedStore && (
        <div style={{ marginBottom: '16px', padding: '12px 14px', border: `1px solid ${T.primary}`, borderRadius: T.radiusMd, background: T.primarySoft, display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ color: T.primaryDark }}>กำลังดูสัญญาร้าน {focusedStore.StoreName}</strong>
            <div style={{ ...captionStyle, marginTop: '3px' }}>เปิดมาจากหน้ารายละเอียดยอดขายของร้านนี้</div>
          </div>
          <Button tone="secondary" onClick={clearFocusStore}>ดูสัญญาทุกร้าน</Button>
        </div>
      )}
      <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))',
          gap: '16px',
          marginBottom: '16px'
      }}>
        {[
            ['สัญญาปกติ', active, T.greenSoft, T.up],
            ['ใกล้หมดอายุ ≤ 30 วัน', soon, T.accentSoft, T.accentDark],
            ['หมดอายุแล้ว', expired, T.redSoft, T.down],
            ['ยังไม่ระบุสัญญา', missing, '#F2F3F7', T.muted]
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
            <p style={captionStyle}>ระบบจะจัดสถานะใกล้หมดอายุเมื่อเหลือเวลาไม่เกิน 30 วัน</p>
          </div>
          <Button icon="refresh" tone="secondary" onClick={loadContracts} disabled={loadingContracts}>
            {loadingContracts ? 'กำลังโหลด...' : 'รีเฟรช'}
          </Button>
        </div>
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: '16px' }}>
          {filters.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setStatusFilter(id)} style={{
                border: `1px solid ${statusFilter === id ? T.primary : T.line}`,
                background: statusFilter === id ? T.primarySoft : T.surface,
                color: statusFilter === id ? T.primaryDark : T.text,
                borderRadius: '999px',
                padding: '9px 13px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer'
            }}>{label}</button>
          ))}
        </div>
      </Card>

      <Card>
        {loadError ? (
          <div style={{ padding: '24px', color: T.down, background: T.redSoft, borderRadius: T.radiusMd }}>{loadError}</div>
        ) : loadingContracts ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: T.muted }}>กำลังโหลดข้อมูลสัญญา...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: T.muted }}>ไม่พบข้อมูลสัญญาตามเงื่อนไขที่เลือก</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ ...tableStyle, minWidth: '850px' }}>
              <thead>
                <tr>
                  <th style={thStyle}>ร้านค้า</th>
                  <th style={{ ...thStyle, width: '150px' }}>วันที่เริ่มสัญญา</th>
                  <th style={{ ...thStyle, width: '150px' }}>วันที่สิ้นสุดสัญญา</th>
                  <th style={{ ...thStyle, width: '150px' }}>ระยะเวลาคงเหลือ</th>
                  <th style={{ ...thStyle, width: '145px' }}>สถานะสัญญา</th>
                  <th style={{ ...thStyle, width: '245px', textAlign: 'right' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((store) => (
                  <tr key={store.StoreId} style={trStyle}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700, color: T.ink }}>{store.StoreName}</div>
                      <div style={{ fontSize: '11.5px', color: T.muted, marginTop: '3px' }}>Store ID #{store.StoreId}</div>
                    </td>
                    <td style={tdStyle}>{formatContractDate(store.ContractStartDate)}</td>
                    <td style={tdStyle}>{formatContractDate(store.ContractEndDate)}</td>
                    <td style={tdStyle}>
                      {store.contract.days === null
                        ? '—'
                        : store.contract.days < 0
                          ? `เกินมา ${Math.abs(store.contract.days)} วัน`
                          : store.contract.days === 0
                            ? 'หมดอายุวันนี้'
                            : `${store.contract.days} วัน`}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                          display: 'inline-flex',
                          padding: '6px 10px',
                          borderRadius: '999px',
                          background: store.contract.bg,
                          color: store.contract.color,
                          fontSize: '11.5px',
                          fontWeight: 700,
                          whiteSpace: 'nowrap'
                      }}>{store.contract.label}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                        <Button tone="secondary" onClick={() => openRenew(store)}>ต่อสัญญา</Button>
                        {store.contract.key === 'expired' && (
                          store.IsSuspended ? (
                            <Badge tone="danger">ระงับสิทธิ์แล้ว</Badge>
                          ) : (
                            <Button tone="danger" icon="ban" onClick={() => suspendExpiredStore(store)}>
                              ไม่ต่อ / ระงับสิทธิ์
                            </Button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!renewStore} title="ต่อสัญญาร้านค้า"
        subtitle={renewStore ? `ร้าน ${renewStore.StoreName}` : ''}
        onClose={closeRenew} width="620px">
        {renewStore && (<div>
          <div style={{ padding:'14px 16px', border:`1px solid ${T.line}`, borderRadius:T.radiusMd, background:'#FAFBFD', marginBottom:'18px' }}>
            <div style={{ fontSize:'12px', color:T.muted, marginBottom:'5px' }}>สัญญาปัจจุบันสิ้นสุด</div>
            <div style={{ fontSize:'18px', fontWeight:700, color:T.ink }}>{formatContractDate(renewStore.ContractEndDate)}</div>
          </div>

          <Field label="ระยะเวลาที่ต้องการต่อ" required>
            <select value={renewDuration} onChange={(e) => { setRenewDuration(e.target.value); setRenewCustomEnd(''); setRenewError(''); }} style={inputStyle}>
              <option value="6m">6 เดือน</option>
              <option value="1y">1 ปี</option>
              <option value="2y">2 ปี</option>
              <option value="3y">3 ปี</option>
              <option value="custom">กำหนดวันสิ้นสุดเอง</option>
            </select>
          </Field>

          {renewDuration === 'custom' && (
            <div style={{ marginTop:'14px' }}>
              <Field label="วันสิ้นสุดสัญญาใหม่" required hint={`ต้องอยู่หลัง ${formatContractDate(renewStore.ContractEndDate)} และเป็นวันในอนาคต`}>
                <input
                  type="date"
                  value={renewCustomEnd}
                  min={minimumRenewEnd(renewStore)}
                  onChange={(e) => { setRenewCustomEnd(e.target.value); setRenewError(''); }}
                  style={inputStyle}
                />
              </Field>
            </div>
          )}

          {renewNewEnd && (
            <div style={{ marginTop:'16px', padding:'15px 16px', borderRadius:T.radiusMd, background:T.accentSoft, border:`1px solid ${T.accentBorder || '#FFD6C9'}` }}>
              <div style={{ fontSize:'12px', color:T.muted, marginBottom:'6px' }}>ช่วงสัญญาใหม่</div>
              <div style={{ fontSize:'17px', fontWeight:800, color:T.ink }}>
                {formatContractDate(renewNewStart)} <span style={{ color:T.muted, padding:'0 7px' }}>→</span> {formatContractDate(renewNewEnd)}
              </div>
              <div style={{ fontSize:'12px', color:T.muted, marginTop:'6px' }}>
                ตรวจสอบช่วงสัญญาให้ถูกต้องก่อนกดยืนยัน
              </div>
            </div>
          )}

          {renewStore.IsSuspended && (
            <div style={{ marginTop:'16px', padding:'15px 16px', border:`1px solid ${T.line}`, borderRadius:T.radiusMd, background:'#FFF' }}>
              <div style={{ fontSize:'13px', fontWeight:800, color:T.ink, marginBottom:'5px' }}>ร้านนี้ถูกระงับสิทธิ์อยู่</div>
              <div style={{ fontSize:'12px', color:T.muted, marginBottom:'12px' }}>เลือกสถานะร้านหลังจากต่อสัญญาสำเร็จ</div>

              <label style={{ display:'flex', gap:'10px', alignItems:'flex-start', padding:'11px 12px', border:`1px solid ${renewAction === 'renew_unsuspend' ? T.accent : T.line}`, borderRadius:T.radiusMd, cursor:'pointer', marginBottom:'8px', background:renewAction === 'renew_unsuspend' ? T.accentSoft : '#FFF' }}>
                <input
                  type="radio"
                  name="renewAction"
                  checked={renewAction === 'renew_unsuspend'}
                  onChange={() => setRenewAction('renew_unsuspend')}
                  style={{ marginTop:'3px' }}
                />
                <span>
                  <span style={{ display:'block', fontSize:'13px', fontWeight:700, color:T.ink }}>ต่อสัญญาและปลดระงับสิทธิ์</span>
                  <span style={{ display:'block', fontSize:'11.5px', color:T.muted, marginTop:'2px' }}>ร้านจะกลับมาเป็นสิทธิ์ปกติหลังต่อสัญญา</span>
                </span>
              </label>

              <label style={{ display:'flex', gap:'10px', alignItems:'flex-start', padding:'11px 12px', border:`1px solid ${renewAction === 'renew_only' ? T.accent : T.line}`, borderRadius:T.radiusMd, cursor:'pointer', background:renewAction === 'renew_only' ? T.accentSoft : '#FFF' }}>
                <input
                  type="radio"
                  name="renewAction"
                  checked={renewAction === 'renew_only'}
                  onChange={() => setRenewAction('renew_only')}
                  style={{ marginTop:'3px' }}
                />
                <span>
                  <span style={{ display:'block', fontSize:'13px', fontWeight:700, color:T.ink }}>ต่อสัญญาอย่างเดียว</span>
                  <span style={{ display:'block', fontSize:'11.5px', color:T.muted, marginTop:'2px' }}>ร้านจะยังคงถูกระงับสิทธิ์จนกว่าจะปลดระงับภายหลัง</span>
                </span>
              </label>
            </div>
          )}

          {renewError && (
            <div style={{ marginTop:'12px', padding:'10px 12px', borderRadius:T.radiusMd, background:T.redSoft, color:T.down, fontSize:'12.5px' }}>
              {renewError}
            </div>
          )}

          <div style={{ display:'flex', justifyContent:'flex-end', gap:'9px', marginTop:'22px', paddingTop:'16px', borderTop:`1px solid ${T.line}` }}>
            <Button tone="secondary" onClick={closeRenew} disabled={renewSaving}>ยกเลิก</Button>
            <Button onClick={submitRenew} disabled={renewSaving || !renewNewEnd}>
              {renewSaving ? 'กำลังต่อสัญญา...' : 'ยืนยันต่อสัญญา'}
            </Button>
          </div>
        </div>)}
      </Modal>
    </>);
}

function AuditHistoryPage({ ctx }) {
    const { API } = ctx;
    const [logs, setLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');

    const loadLogs = useCallback(async () => {
        setLoadingLogs(true);
        try {
            const data = await callApi(`${API}/api/audit-logs`);
            setLogs(Array.isArray(data) ? data : []);
            setLoadError('');
        }
        catch (err) {
            setLoadError(err.message);
        }
        finally {
            setLoadingLogs(false);
        }
    }, [API]);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    const actionMeta = (action) => {
        const key = String(action || '').toUpperCase();
        if (key.includes('STORE') || key.includes('SUSPEND')) {
            return { group: 'store', label: 'ร้านค้า', bg: T.primarySoft, color: T.primaryDark };
        }
        if (key.includes('ACCOUNT') || key.includes('USER') || key.includes('STAFF') || key.includes('PASSWORD')) {
            return { group: 'account', label: 'บัญชีผู้ใช้', bg: T.deepSoft, color: T.deep };
        }
        if (key.includes('SLIP') || key.includes('PAYMENT')) {
            return { group: 'payment', label: 'การชำระเงิน', bg: T.accentSoft, color: T.accentDark };
        }
        if (key.includes('ORDER') || key.includes('CANCEL')) {
            return { group: 'order', label: 'ออเดอร์', bg: T.greenSoft, color: T.up };
        }
        return { group: 'other', label: 'อื่น ๆ', bg: '#F2F3F7', color: T.text };
    };

    const actionName = (action) => {
        const names = {
            CREATE_STORE: 'เพิ่มร้านค้า',
            UPDATE_STORE: 'แก้ไขข้อมูลร้านค้า',
            DELETE_STORE: 'ลบร้านค้า',
            OPEN_STORE: 'เปิดร้านค้า',
            CLOSE_STORE: 'ปิดร้านค้า',
            SUSPEND_STORE: 'ระงับสิทธิ์ร้านค้า',
            UNSUSPEND_STORE: 'ปลดระงับสิทธิ์ร้านค้า',
            RENEW_CONTRACT: 'ต่อสัญญาร้านค้า',
            OPEN_FOOD_COURT: 'เปิดศูนย์อาหาร',
            CLOSE_FOOD_COURT: 'ปิดศูนย์อาหาร',
            CREATE_ACCOUNT: 'สร้างบัญชีร้านค้า',
            CREATE_STORE_ACCOUNT: 'สร้างบัญชีร้านค้า',
            UPDATE_STORE_ACCOUNT: 'แก้ไขบัญชีร้านค้า',
            DELETE_STORE_ACCOUNT: 'ลบบัญชีร้านค้า',
            UPDATE_ACCOUNT: 'แก้ไขบัญชีร้านค้า',
            DELETE_ACCOUNT: 'ลบบัญชีร้านค้า',
            RESET_PASSWORD: 'เปลี่ยนรหัสผ่าน',
            VERIFY_SLIP_APPROVE: 'อนุมัติสลิปการชำระเงิน',
            VERIFY_SLIP_REJECT: 'ปฏิเสธสลิปการชำระเงิน'
        };
        return names[String(action || '').toUpperCase()] || String(action || '-').replaceAll('_', ' ');
    };

    const filtered = logs.filter((log) => {
        const meta = actionMeta(log.Action);
        if (filter !== 'all' && meta.group !== filter)
            return false;
        const q = query.trim().toLowerCase();
        if (!q)
            return true;
        return `${actionName(log.Action)} ${log.Action || ''} ${log.PerformedBy || ''} ${log.Details || ''}`
            .toLowerCase()
            .includes(q);
    });

    const filters = [
        ['all', 'ทั้งหมด'],
        ['store', 'ร้านค้า'],
        ['account', 'บัญชีผู้ใช้'],
        ['order', 'ออเดอร์'],
        ['payment', 'การชำระเงิน']
    ];

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

        <div style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginTop: '18px'
        }}>
          <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 0 }}>
            <Icon name="search" size={17} color={T.muted} style={{
                position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)'
            }}/>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาการดำเนินการ ผู้ดำเนินการ หรือรายละเอียด..."
              style={{ ...inputStyle, width: '100%', paddingLeft: '40px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
            {filters.map(([id, label]) => (<button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              style={{
                  border: `1px solid ${filter === id ? T.primary : T.line}`,
                  background: filter === id ? T.primarySoft : T.surface,
                  color: filter === id ? T.primaryDark : T.text,
                  borderRadius: '999px',
                  padding: '9px 13px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
              }}
            >{label}</button>))}
          </div>
        </div>
      </Card>

      <Card>
        {loadError ? (<div style={{
            padding: '24px',
            borderRadius: T.radiusMd,
            background: T.redSoft,
            color: T.down,
            fontSize: '14px'
        }}>{loadError}</div>) : loadingLogs ? (<div style={{
            padding: '48px 20px',
            textAlign: 'center',
            color: T.muted,
            fontSize: '14px'
        }}>กำลังโหลดประวัติการดำเนินการ...</div>) : filtered.length === 0 ? (<div style={{
            padding: '48px 20px',
            textAlign: 'center',
            color: T.muted
        }}>
          <div style={{
              width: '48px', height: '48px', margin: '0 auto 12px',
              borderRadius: '50%', background: T.primarySoft,
              display: 'grid', placeItems: 'center', color: T.primary
          }}><Icon name="history" size={23}/></div>
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
                        <span style={{
                            width: '30px', height: '30px', borderRadius: '50%',
                            display: 'grid', placeItems: 'center',
                            background: T.deepSoft, color: T.deep,
                            fontSize: '12px', fontWeight: 700, flexShrink: 0
                        }}>{String(log.PerformedBy || 'E').charAt(0).toUpperCase()}</span>
                        <span style={{ fontWeight: 500, color: T.text }}>{log.PerformedBy || '—'}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, lineHeight: 1.55 }}>{log.Details || '—'}</td>
                    <td style={tdStyle}>
                      <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '6px 10px',
                          borderRadius: '999px',
                          background: meta.bg,
                          color: meta.color,
                          fontSize: '11.5px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                      }}>{meta.label}</span>
                    </td>
                  </tr>);
              })}
            </tbody>
          </table>
        </div>)}
      </Card>
    </>);
}

function StoreAccountsPage({ ctx }) {
    const { API, user, stores, search, pushToast, ask } = ctx;
    const [accounts, setAccounts] = useState([]);
    const [loadError, setLoadError] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [mode, setMode] = useState('create');
    const [form, setForm] = useState(EMPTY_ACCOUNT_FORM);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
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
    const storeName = (id) => stores.find((s) => String(s.StoreId) === String(id))?.StoreName || '—';
    const rows = accounts.filter((a) => {
        if (a.Role !== 'Shop Owner') return false;
        const text = `${a.Username} ${a.FullName} ${storeName(a.StoreId)}`.toLowerCase();
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
              <p style={captionStyle}>
                เปิดไฟล์ main_additions.py แล้วคัดลอกส่วน &quot;บัญชีร้านค้า&quot; ไปวางต่อท้าย main.py จากนั้นรัน backend ใหม่
              </p>
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
                  <td style={tdStyle}>{storeName(a.StoreId)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <Button variant="ghost" icon="key" onClick={() => openResetPassword(a)} style={smallBtn}>
                        แก้ไข / ตั้งรหัสใหม่
                      </Button>
                      <Button variant="danger" icon="trash" onClick={() => removeAccount(a)} style={smallBtn}>
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
        <Field label="ร้านค้า" required error={errors.storeId}>
          <select value={form.storeId} onChange={update('storeId')} style={inputStyle}>
            <option value="">— เลือกร้านค้า —</option>
            {stores.map((s) => (<option key={s.StoreId} value={s.StoreId}>
                {s.StoreName}
              </option>))}
          </select>
        </Field>

        <Field label="ตำแหน่ง" required error={errors.role}>
          <select value={form.role} onChange={update('role')} style={inputStyle}>
            {STORE_ROLES.map((r) => (<option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>))}
          </select>
        </Field>

        <Field label="ชื่อ-นามสกุลผู้ใช้" required error={errors.fullName}>
          <input value={form.fullName} onChange={update('fullName')} maxLength={100} style={inputStyle}/>
        </Field>

        <Field label="ชื่อผู้ใช้ (username)" required error={errors.username} hint={mode === 'password' ? 'แก้ชื่อผู้ใช้ไม่ได้' : 'a-z, 0-9, _ ความยาว 4–20 ตัว'}>
          <input value={form.username} disabled={mode === 'password'} onChange={(e) => setForm((prev) => ({
            ...prev,
            username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20)
        }))} style={{ ...inputStyle, background: mode === 'password' ? '#F3F3F8' : T.surface }}/>
        </Field>

        <div style={twoColStyle}>
          <Field label="รหัสผ่าน" required error={errors.password} hint="อย่างน้อย 6 ตัว ห้ามเว้นวรรค">
            <input type="text" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value.replace(/\s/g, '').slice(0, 50) }))} style={inputStyle}/>
          </Field>
          <Field label="ยืนยันรหัสผ่าน" required error={errors.confirm}>
            <input type="text" value={form.confirm} onChange={(e) => setForm((prev) => ({ ...prev, confirm: e.target.value.replace(/\s/g, '').slice(0, 50) }))} style={inputStyle}/>
          </Field>
        </div>
      </Modal>
    </>);
}
const h2Style = { margin: 0, fontSize: '24px', fontWeight: 700, color: T.ink, lineHeight: 1.3 };
const h3Style = { margin: 0, fontSize: '18px', fontWeight: 600, color: T.ink };
const bodyStyle = { fontSize: '14px', color: T.text, lineHeight: 1.6 };
const captionStyle = { margin: '4px 0 0', fontSize: '12.5px', color: T.muted, lineHeight: 1.5 };
const ellipsisStyle = {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: T.ink,
    fontWeight: 600,
    fontSize: '13px'
};
const shellStyle = {
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    height: '100dvh',
    minHeight: '100dvh',
    overflow: 'hidden',
    background: T.bg,
    color: T.text,
    margin: 0,
    padding: 0
};
const shellBodyStyle = {
    display: 'flex',
    alignItems: 'stretch',
    flex: 1,
    minHeight: 0,
    width: '100%',
    position: 'relative'
};
const mainScrollStyle = {
    flex: '1 1 0%',
    minWidth: 0,
    width: 0,
    maxWidth: '100%',
    overflowY: 'auto',
    overflowX: 'hidden'
};
const sidebarStyle = {
    width: '260px',
    minWidth: '260px',
    padding: '16px 16px 12px',
    boxSizing: 'border-box',
    background: T.sideBg,
    borderRight: `1px solid ${T.line}`,
    display: 'flex',
    flexDirection: 'column',
    alignSelf: 'stretch',
    overflowY: 'auto',
    flexShrink: 0,
    boxShadow: '0 1px 3px rgba(18,25,38,0.02)'
};
const brandStyle = {
    width: '212px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    minWidth: 0
};
const brandTitleStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '20px',
    fontWeight: 700,
    color: T.primary
};
const brandSubtitleStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    marginTop: '4px',
    color: T.muted
};
const sidebarLabelStyle = {
    color: T.ink,
    fontSize: '14px',
    fontWeight: 500,
    padding: '12px 16px',
    marginBottom: '4px'
};
const sidebarItemStyle = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '10px 16px',
    marginBottom: '8px',
    border: 'none',
    borderRadius: T.radiusMd,
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '14px',
    fontFamily: FONT_STACK,
    transition: 'background .18s ease, color .18s ease'
};
const sidebarFootStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '16px 10px 6px',
    marginTop: '12px',
    borderTop: `1px solid ${T.line}`
};
const avatarStyle = {
    width: '34px',
    height: '34px',
    minWidth: '34px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '50%',
    background: T.primary,
    color: '#FFFFFF',
    fontWeight: 700,
    fontSize: '14px'
};
const backdropStyle = {
    position: 'absolute',
    inset: 0,
    background: 'rgba(18,25,38,0.45)',
    zIndex: 55
};
const topbarStyle = {
    minHeight: `${TOPBAR_H}px`,
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    background: T.surface,
    borderBottom: `1px solid ${T.line}`,
    position: 'relative',
    zIndex: 70,
    flexShrink: 0,
    boxSizing: 'border-box',
    flexWrap: 'wrap'
};
const iconButtonStyle = {
    position: 'relative',
    width: '38px',
    height: '38px',
    display: 'grid',
    placeItems: 'center',
    border: 'none',
    borderRadius: T.radiusMd,
    background: T.primarySoft,
    color: T.primary,
    cursor: 'pointer',
    padding: 0,
    transition: 'background .2s ease, color .2s ease'
};
const searchWrapStyle = {
    flex: '0 1 420px',
    minWidth: '180px',
    maxWidth: '420px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 10px',
    border: `1px solid ${T.line}`,
    borderRadius: '8px',
    background: T.surface,
    boxShadow: '0 1px 2px rgba(18,25,38,0.02)'
};
const searchInputStyle = {
    flex: 1,
    minWidth: 0,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: T.text,
    fontSize: '13.5px',
    fontFamily: FONT_STACK,
    padding: '6px 0'
};
const courtPillStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '7px 12px',
    borderRadius: '999px',
    fontSize: '12.5px',
    fontWeight: 700,
    whiteSpace: 'nowrap'
};
const notifBadgeStyle = {
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    minWidth: '19px',
    height: '19px',
    padding: '0 5px',
    borderRadius: '999px',
    background: T.primary,
    color: '#FFFFFF',
    fontSize: '11px',
    fontWeight: 700,
    display: 'grid',
    placeItems: 'center',
    boxSizing: 'border-box'
};
const dropdownBackdropStyle = { position: 'fixed', inset: 0, zIndex: 40 };
const notifPanelStyle = {
    position: 'absolute',
    top: '46px',
    right: 0,
    width: 'min(330px, 90vw)',
    background: T.surface,
    border: `1px solid ${T.line}`,
    borderRadius: T.radiusLg,
    boxShadow: '0 18px 40px rgba(18,25,38,0.16)',
    overflow: 'hidden',
    zIndex: 50
};
const notifHeadStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 16px',
    borderBottom: `1px solid ${T.line}`
};
const notifItemStyle = {
    width: '100%',
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
    padding: '12px 16px',
    border: 'none',
    borderBottom: `1px solid ${T.line}`,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: FONT_STACK
};
const topAccountStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '6px 12px 6px 6px',
    border: 'none',
    borderRadius: '999px',
    background: T.deepSoft,
    maxWidth: '250px',
    cursor: 'pointer',
    fontFamily: FONT_STACK,
    transition: 'background .2s ease'
};
const profilePanelStyle = {
    position: 'absolute',
    top: 'calc(100% + 10px)',
    right: 0,
    width: 'min(290px, 86vw)',
    background: T.surface,
    border: `1px solid ${T.line}`,
    borderRadius: T.radiusLg,
    boxShadow: '0 12px 34px rgba(18,25,38,0.14)',
    padding: '20px',
    zIndex: 80
};
const dropdownItemStyle = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    marginBottom: '2px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: T.text,
    fontSize: '14px',
    fontFamily: FONT_STACK,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'background .2s ease, color .2s ease'
};
const contentStyle = {
    width: '100%',
    maxWidth: '1540px',
    minWidth: 0,
    margin: '0 auto',
    padding: 'clamp(16px, 2.2vw, 24px)',
    minHeight: `calc(100dvh - ${TOPBAR_H}px)`,
    boxSizing: 'border-box',
    overflowX: 'hidden'
};
const courtBannerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 16px',
    marginBottom: '18px',
    borderRadius: T.radiusLg,
    background: T.redSoft,
    border: `1px solid ${T.redSoft}`,
    color: T.down,
    fontSize: '13.5px',
    fontWeight: 600
};
const cardStyle = {
    background: T.surface,
    border: 'none',
    borderRadius: T.radiusLg,
    padding: 'clamp(18px, 2.2vw, 24px)',
    boxSizing: 'border-box',
    position: 'relative',
    boxShadow: T.shadowSm
};
const cardHeadStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '14px'
};
const chartHeadStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '14px',
    flexWrap: 'wrap',
    marginBottom: '6px'
};
const chartGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))',
    gap: '24px'
};
const toolbarStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: '14px',
    flexWrap: 'wrap'
};
const courtControlStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap'
};
const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '760px',
    marginTop: '12px'
};
const thStyle = {
    padding: '16px',
    background: T.surface,
    color: T.ink,
    fontSize: '14px',
    fontWeight: 600,
    textAlign: 'left',
    whiteSpace: 'nowrap',
    borderBottom: `1px solid ${T.line}`
};
const thRightStyle = { ...thStyle, textAlign: 'right' };
const trStyle = { borderBottom: `1px solid ${T.line}` };
const tdStyle = { padding: '16px', fontSize: '14px', color: T.text, verticalAlign: 'middle' };
const tdRightStyle = { ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' };
const cancelStatRowStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: '12px',
    marginBottom: '16px'
};
const cancelStatBoxStyle = {
    background: T.bg,
    borderRadius: T.radiusMd,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
};
const cancelStatLabelStyle = { fontSize: '12.5px', color: T.muted, fontWeight: 600 };
const cancelStatValueStyle = { fontSize: '20px', color: T.ink, fontWeight: 700, lineHeight: 1.3 };
const cancelChipRowStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '4px'
};
const cancelChipStyle = (active) => ({
    padding: '7px 14px',
    borderRadius: '999px',
    fontSize: '12.5px',
    fontWeight: 600,
    fontFamily: FONT_STACK,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    background: active ? T.primarySoft : T.surface,
    color: active ? T.primaryDark : T.text,
    border: `1px solid ${active ? T.primary : T.line}`
});
const cancelItemWrapStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '4px 2px'
};
const cancelItemRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13.5px',
    color: T.text
};
const storeThumbStyle = {
    width: '38px',
    height: '38px',
    borderRadius: T.radiusMd,
    display: 'grid',
    placeItems: 'center',
    background: T.primarySoft,
    color: T.primary,
    fontWeight: 700
};
const inputStyle = {
    width: '100%',
    padding: '11px 13px',
    border: `1px solid ${T.line}`,
    borderRadius: T.radiusMd,
    fontSize: '13.5px',
    fontFamily: FONT_STACK,
    color: T.text,
    background: T.surface,
    boxSizing: 'border-box',
    outlineColor: T.primary
};
const twoColStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))',
    gap: '0 14px'
};
const smallBtn = { padding: '7px 10px', fontSize: '12.5px' };
const storeImagePreviewStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block'
};
const storeImageShadeStyle = {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(42,44,65,0.02) 48%, rgba(42,44,65,0.62) 100%)',
    pointerEvents: 'none'
};
const storeImageChangeBadgeStyle = {
    position: 'absolute',
    left: '16px',
    bottom: '14px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 11px',
    borderRadius: '999px',
    background: 'rgba(42,44,65,0.78)',
    color: '#FFFFFF',
    fontSize: '12px',
    fontWeight: 700,
    backdropFilter: 'blur(7px)'
};
const storeImageEmptyStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '7px',
    width: '100%',
    height: '100%',
    padding: '22px',
    boxSizing: 'border-box'
};
const storeImageIconStyle = {
    position: 'relative',
    width: '58px',
    height: '58px',
    borderRadius: '18px',
    display: 'grid',
    placeItems: 'center',
    background: T.primarySoft,
    marginBottom: '4px'
};
const storeImagePlusStyle = {
    position: 'absolute',
    right: '-3px',
    bottom: '-3px',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    background: T.primary,
    border: `3px solid ${T.surface}`,
    boxSizing: 'content-box'
};
const storeImageFormatPillStyle = {
    marginTop: '3px',
    padding: '5px 10px',
    borderRadius: '999px',
    background: T.trackSoft,
    color: T.muted,
    fontSize: '11.5px',
    fontWeight: 600
};
const storeImageFooterStyle = {
    marginTop: '10px',
    padding: '10px 12px',
    border: `1px solid ${T.line}`,
    borderRadius: T.radiusMd,
    background: '#FAFAFC',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap'
};
function storeImageUploaderStyle(dragOver, hasError, hasImage) {
    return {
        width: '100%',
        height: hasImage ? '230px' : '190px',
        position: 'relative',
        borderRadius: '16px',
        border: `2px dashed ${hasError ? T.down : dragOver ? T.primary : '#D8DCE8'}`,
        background: dragOver ? T.primarySoft : hasImage ? '#F4F5F8' : 'linear-gradient(135deg, #FFFDFC 0%, #FAFAFC 100%)',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        overflow: 'hidden',
        padding: 0,
        fontFamily: FONT_STACK,
        boxSizing: 'border-box',
        transition: 'border-color .18s ease, background .18s ease, box-shadow .18s ease, transform .18s ease',
        boxShadow: dragOver ? `0 0 0 4px ${T.primarySoft}` : 'none'
    };
}
const dateWrapStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '7px 12px',
    border: `1px solid ${T.line}`,
    borderRadius: T.radiusMd,
    background: T.surface
};
const dateInputStyle = {
    minWidth: 0,
    maxWidth: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: T.text,
    fontSize: '13px',
    fontFamily: FONT_STACK
};
const overlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(42,44,65,0.5)',
    display: 'grid',
    placeItems: 'center',
    padding: '18px',
    zIndex: 90
};
const modalStyle = {
    width: '100%',
    background: T.surface,
    borderRadius: '16px',
    boxShadow: '0 26px 60px rgba(42,44,65,0.26)',
    overflow: 'hidden',
    maxHeight: 'calc(100dvh - 24px)'
};
const modalHeadStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '18px 22px',
    borderBottom: `1px solid ${T.line}`
};
const modalFootStyle = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    padding: '14px 22px',
    borderTop: `1px solid ${T.line}`,
    background: '#FAFAFC'
};
const popupNoticeOverlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 140,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '90px 18px 18px',
    pointerEvents: 'none',
    background: 'rgba(42,44,65,0.10)'
};
const popupNoticeStyle = {
    width: 'min(520px, 92vw)',
    background: T.surface,
    borderRadius: '16px',
    boxShadow: '0 24px 60px rgba(42,44,65,0.24)',
    border: `1px solid ${T.line}`,
    padding: '20px 22px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '15px',
    pointerEvents: 'auto'
};
const popupNoticeIconStyle = {
    width: '54px',
    height: '54px',
    minWidth: '54px',
    borderRadius: '16px',
    display: 'grid',
    placeItems: 'center'
};
const popupNoticeCloseStyle = {
    width: '34px',
    height: '34px',
    border: 'none',
    borderRadius: '9px',
    background: T.bg,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    flexShrink: 0
};
const toastWrapStyle = {
    position: 'fixed',
    right: 'clamp(10px, 2vw, 20px)',
    bottom: 'clamp(10px, 2vw, 20px)',
    display: 'flex',
    flexDirection: 'column',
    gap: '9px',
    zIndex: 120,
    maxWidth: 'min(360px, 90vw)'
};
const toastStyle = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '9px',
    padding: '12px 16px',
    borderRadius: T.radiusLg,
    background: T.surface,
    border: `1px solid ${T.line}`,
    boxShadow: '0 12px 30px rgba(42,44,65,0.16)',
    cursor: 'pointer'
};
const tooltipStyle = {
    position: 'absolute',
    top: '8px',
    padding: '10px 13px',
    background: T.surface,
    border: `1px solid ${T.line}`,
    borderRadius: T.radiusLg,
    boxShadow: '0 12px 28px rgba(42,44,65,0.16)',
    pointerEvents: 'none',
    minWidth: '190px',
    zIndex: 5
};
