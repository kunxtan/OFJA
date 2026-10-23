// เรียก API + ส่งออกไฟล์ CSV/XLSX
import { buildSimpleWorkbook } from '../../../lib/xlsxWriter';

export const REFRESH_MS = 15000;

// ===== เรียก API และจัดการข้อผิดพลาดจาก Backend =====
// ข้อความหลังบังคับปิดแบบยกเลิกทั้งหมด (forced = ผลจาก backend)
export function forceCloseMessage(base, forced) {
    if (!forced) return base;
    const money = (v) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
    let msg = `${base} ยกเลิก ${forced.cancelled} ออเดอร์ คืนเงิน ${money(forced.refund_total)} บาท`;
    if (Number(forced.unverified_total) > 0) msg += ` และรอร้านตรวจสลิปอีก ${money(forced.unverified_total)} บาท`;
    return msg;
}

export async function callApi(url, options = {}) {
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

// ===== ส่งออกข้อมูลเป็น CSV / Excel =====
export function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportCsv(filename, rows) {
    const escape = (v) => {
        let s = v === null || v === undefined ? '' : String(v);
        // ข้อความที่ขึ้นต้นด้วย = + - @ จะถูก Excel ตีเป็นสูตร : ใส่ ' นำหน้า (ตัวเลขติดลบไม่แตะ)
        if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = rows.map((r) => r.map(escape).join(',')).join('\r\n');
    saveBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }), filename);
}

export function exportXlsx(filename, sheets) {
    // buildSimpleWorkbook โยน error ถ้าไม่มีชีตที่มีข้อมูล (ข้อความเดิม "ไม่มีข้อมูลสำหรับสร้างไฟล์ Excel")
    saveBlob(buildSimpleWorkbook(sheets), filename);
}
