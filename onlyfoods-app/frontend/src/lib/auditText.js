// ประโยคภาษาไทยของ Audit Log (ใช้ร่วมกันระหว่างหน้าผู้บริหารและหน้าฝ่ายบัญชี)
// backend ส่ง Details เป็น `ชนิด รหัส {JSON}` -> แปลงเป็นประโยค ; รหัสที่ไม่รู้จักแสดงข้อความเดิม

const money2 = (v) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
// วันที่จาก backend เป็นเวลาไทยอยู่แล้ว (YYYY-MM-DD หรือ YYYY-MM-DD HH:MM:SS) : ตัดให้สั้นพอ ไม่แปลง timezone
const thaiDate = (iso) => (iso ? String(iso).slice(0, 10) : '-');
const thaiDateTime = (value) => (value ? String(value).replace('T', ' ').slice(0, 16) : '-');
const ISSUE_STATUS_TH = { OPEN: 'รอดำเนินการ', IN_PROGRESS: 'กำลังดำเนินการ', RESOLVED: 'แก้ไขแล้ว', REJECTED: 'ไม่รับเรื่อง' };

export const AUDIT_VERBS = {
    // ออเดอร์
    CREATE_ORDER: 'สร้างออเดอร์',
    CANCEL_ORDER: 'ยกเลิกออเดอร์',
    CUSTOMER_CANCEL_ORDER: 'ลูกค้ายกเลิกออเดอร์',
    CANCEL_REQUEST: 'ขอยกเลิกออเดอร์',
    UPDATE_STATUS: 'เปลี่ยนสถานะออเดอร์',
    CUSTOMER_CHANGE_ITEM: 'ลูกค้าเปลี่ยนเมนูในออเดอร์',
    LATE_PICKUP: 'ลูกค้าแจ้งว่าจะมารับช้า',
    PICKUP_REMINDER: 'ระบบเตือนลูกค้าให้มารับอาหาร',
    RECALL_QUEUE: 'เรียกคิวซ้ำ',
    PRINT_ORDER: 'พิมพ์ใบคิว',
    REPRINT_ORDER: 'พิมพ์ใบคิวซ้ำ',
    PRINT_SKIP: 'ข้ามการพิมพ์ใบคิว',
    // การชำระเงิน
    VERIFY_SLIP_APPROVE: 'อนุมัติสลิปชำระเงิน',
    VERIFY_SLIP_REJECT: 'ปฏิเสธสลิปชำระเงิน',
    UPLOAD_TOP_UP_SLIP: 'ลูกค้าส่งสลิปโอนส่วนต่าง',
    VERIFY_TOP_UP_APPROVE: 'อนุมัติสลิปโอนส่วนต่าง',
    VERIFY_TOP_UP_REJECT: 'ปฏิเสธสลิปโอนส่วนต่าง',
    REFUND_DONE: 'คืนเงินให้ลูกค้าแล้ว',
    REFUND_PAYOUT_SET: 'ลูกค้าเลือกวิธีรับเงินคืน',
    REFUND_PAYOUT_VIEW: 'เจ้าของร้านเปิดดูบัญชีรับเงินคืน',
    // ร้านค้า / สัญญา
    CREATE_STORE: 'เพิ่มร้านค้า',
    UPDATE_STORE: 'แก้ไขข้อมูลร้าน',
    UPDATE_STORE_PROFILE: 'เจ้าของร้านแก้โปรไฟล์ร้าน',
    DELETE_STORE: 'ลบร้านค้า',
    AUTO_DELETE_STORE: 'ระบบลบร้านค้าอัตโนมัติ',
    OPEN_STORE: 'เปิดร้าน',
    CLOSE_STORE: 'ปิดร้าน',
    SUSPEND_STORE: 'ระงับร้าน',
    UNSUSPEND_STORE: 'ปลดระงับร้าน',
    RENEW_CONTRACT: 'ต่อสัญญา',
    CONTRACT_EXTEND: 'ขยายวันสิ้นสุดสัญญา',
    CONTRACT_SHORTEN: 'ลดวันสิ้นสุดสัญญา',
    CONTRACT_END_BACKDATED: 'ตัดสัญญาย้อนหลัง',
    CONTRACT_RESTART: 'เปิดสัญญารอบใหม่',
    // เมนู
    CREATE_PRODUCT: 'เพิ่มเมนู',
    UPDATE_PRODUCT: 'แก้ไขเมนู',
    PRICE_UPDATE: 'เปลี่ยนราคาเมนู',
    DELETE_PRODUCT: 'ลบเมนู',
    OUT_OF_STOCK: 'ตั้งเมนูเป็นของหมด',
    BACK_IN_STOCK: 'เมนูกลับมามีขาย',
    OUT_OF_STOCK_NOTIFY: 'แจ้งลูกค้าว่าเมนูหมด',
    // บัญชีผู้ใช้
    LOGIN: 'เข้าสู่ระบบ',
    LOGIN_FAIL: 'เข้าสู่ระบบไม่สำเร็จ',
    ACCOUNT_LOCKED: 'บัญชีถูกล็อกชั่วคราว',
    PASSWORD_CHANGE: 'เปลี่ยนรหัสผ่านของตัวเอง',
    PASSWORD_RESET: 'ตั้งรหัสผ่านใหม่ให้ผู้ใช้',
    CREATE_STAFF: 'เพิ่มพนักงาน',
    UPDATE_STAFF: 'แก้ไขข้อมูลพนักงาน',
    ACTIVATE_STAFF: 'เปิดใช้งานบัญชีพนักงาน',
    DEACTIVATE_STAFF: 'ปิดใช้งานบัญชีพนักงาน',
    RESET_STAFF_PASSWORD: 'ตั้งรหัสผ่านใหม่ให้พนักงาน',
    DELETE_STAFF: 'ลบพนักงาน',
    ERASE_STAFF: 'ลบข้อมูลพนักงานถาวร',
    CREATE_STORE_ACCOUNT: 'สร้างบัญชีเจ้าของร้าน',
    UPDATE_STORE_ACCOUNT: 'แก้ไขบัญชีเจ้าของร้าน',
    DELETE_STORE_ACCOUNT: 'ลบบัญชีเจ้าของร้าน',
    // ศูนย์อาหาร / รายงานปัญหา
    OPEN_FOOD_COURT: 'เปิดศูนย์อาหาร (สั่งเอง)',
    CLOSE_FOOD_COURT: 'ปิดศูนย์อาหาร (สั่งเอง)',
    FOOD_COURT_AUTO_MODE: 'กลับไปเปิด–ปิดศูนย์อาหารตามเวลาอัตโนมัติ',
    UPDATE_FOOD_COURT_SCHEDULE: 'เปลี่ยนเวลาเปิด–ปิดศูนย์อาหาร',
    CREATE_ISSUE: 'ลูกค้าแจ้งปัญหา',
    UPDATE_ISSUE: 'อัปเดตรายงานปัญหา',
    REFUND_SLIP_APPROVE: 'ตรวจสลิปผ่าน (ออเดอร์ที่ถูกบังคับยกเลิก)',
    REFUND_SLIP_REJECT: 'ตรวจสลิปไม่ผ่าน (ออเดอร์ที่ถูกบังคับยกเลิก)',
    // ระงับบัญชีลูกค้า (ผู้บริหาร) : แถวเก่าก่อนมีระบบระงับแบบกำหนดวันใช้รหัสเดียวกัน
    BAN_USER: 'ระงับบัญชีลูกค้า',
    UNBAN_USER: 'ปลดระงับบัญชีลูกค้า',
    AUTO_UNBAN_USER: 'ระบบปลดระงับบัญชีลูกค้า (ครบกำหนด)',
    USER_APPEAL: 'ลูกค้ายื่นอุทธรณ์การระงับบัญชี',
    USER_APPEAL_APPROVE: 'อนุมัติอุทธรณ์และปลดระงับบัญชี',
    USER_APPEAL_REJECT: 'ไม่อนุมัติอุทธรณ์การระงับบัญชี',
    GOOGLE_LINK: 'เชื่อมบัญชีกับ Google'
};

export const auditCodesMatching = (keyword) => Object.keys(AUDIT_VERBS)
    .filter((code) => AUDIT_VERBS[code].toLowerCase().includes(keyword));

// ===== รายละเอียดภาษาไทย : backend ส่ง Details มาเป็น `ชนิด รหัส {JSON}` (เช่น `Product 12 {"name":"ข้าวมันไก่"}`)
// ดึง JSON ท้ายข้อความมาแต่งเป็นประโยค ; รหัสที่ไม่รู้จักแสดงข้อความเดิม
const AUDIT_ORDER_STATUS_TH = {
    VERIFYING_SLIP: 'รอตรวจสลิป', PENDING: 'รอร้านรับออเดอร์', COOKING: 'กำลังทำ', COOKED: 'ทำเสร็จแล้ว',
    READY: 'เรียกคิวแล้ว', COMPLETED: 'รับอาหารแล้ว', PENDING_CANCELLATION: 'รออนุมัติยกเลิก',
    AWAITING_TOP_UP: 'รอโอนส่วนต่าง', CANCELLED: 'ยกเลิก', NO_SHOW: 'ไม่มารับอาหาร'
};
const AUDIT_ROLE_TH = { STORE_OWNER: 'เจ้าของร้าน', FRONT_STAFF: 'พนักงานหน้าร้าน', KITCHEN_STAFF: 'พนักงานครัว' };
const AUDIT_FIELD_TH = { password: 'รหัสผ่าน', full_name: 'ชื่อ', role: 'ตำแหน่ง', store_id: 'ร้าน', phone: 'เบอร์โทร', email: 'อีเมล' };
const PROFILE_FIELD_TH = { image: 'รูปร้าน', description: 'รายละเอียดร้าน', contact_name: 'ชื่อผู้ติดต่อ', contact_phone: 'เบอร์โทร', contact_line: 'LINE', contact_email: 'อีเมล' };
export function auditPayload(raw) {
    const i = raw.indexOf('{');
    if (i < 0) return {};
    try {
        const value = JSON.parse(raw.slice(i));
        return value && typeof value === 'object' ? value : {};
    }
    catch {
        return {};
    }
}
const auditQuote = (text) => (text ? `“${text}”` : '');
const baht = (v) => (v !== undefined && v !== null && v !== '' ? `${money2(v)} บาท` : '');
const why = (text) => (text ? `เหตุผล: ${text}` : '');
const who = (p) => (p.username ? `@${p.username}` : '');
// แต่ละรหัส -> ส่วนขยายต่อท้ายชื่อการกระทำ (p = ข้อมูล JSON, log = แถว audit)
const forcedClose = (p) => [
    p.open_orders ? `ขณะมีออเดอร์ค้าง ${p.open_orders} ออเดอร์` : '',
    p.on_open_orders === 'finish' ? 'ให้ทำต่อจนเสร็จ' : '',
    p.on_open_orders === 'cancel' ? `ยกเลิกทั้งหมด ${p.cancelled ?? ''} ออเดอร์ คืนเงิน ${baht(p.refund_total)}${Number(p.unverified_total) > 0 ? ` รอตรวจสลิป ${baht(p.unverified_total)}` : ''}` : ''
];
const AUDIT_DETAIL = {
    CREATE_ORDER: (p) => [p.total !== undefined ? `ยอด ${baht(p.total)}` : '', p.walk_in ? 'สั่งที่หน้าร้าน' : ''],
    CANCEL_ORDER: (p) => [why(p.reason), p.forced ? '(ผู้บริหารบังคับปิด)' : ''],
    CLOSE_STORE: forcedClose,
    REFUND_SLIP_APPROVE: (p) => [baht(p.amount)],
    REFUND_SLIP_REJECT: (p) => [baht(p.amount), why(p.reason)],
    CANCEL_REQUEST: (p) => [why(p.reason)],
    UPDATE_STATUS: (p) => [p.status ? `เป็น ${auditQuote(AUDIT_ORDER_STATUS_TH[p.status] || p.status)}` : '', why(p.reason)],
    CUSTOMER_CHANGE_ITEM: (p) => [p.product ? `เป็น ${auditQuote(p.product)} ${baht(p.price)}` : '', Number(p.refund_diff) > 0 ? `คืนส่วนต่าง ${baht(p.refund_diff)}` : '', Number(p.top_up_due) > 0 ? `ต้องโอนเพิ่ม ${baht(p.top_up_due)}` : ''],
    LATE_PICKUP: (p) => [p.minutes ? `อีก ${p.minutes} นาที` : '', p.count ? `ครั้งที่ ${p.count}` : ''],
    PICKUP_REMINDER: (p) => [p.waited_minutes ? `รอมาแล้ว ${p.waited_minutes} นาที` : ''],
    PRINT_ORDER: (p) => [p.printer ? `เครื่อง ${p.printer}` : ''],
    REPRINT_ORDER: (p) => [p.printer ? `เครื่อง ${p.printer}` : ''],
    PRINT_SKIP: (p) => [why(p.reason)],
    VERIFY_SLIP_REJECT: (p) => [why(p.reason)],
    UPLOAD_TOP_UP_SLIP: (p) => [baht(p.amount)],
    VERIFY_TOP_UP_APPROVE: (p) => [baht(p.amount)],
    VERIFY_TOP_UP_REJECT: (p) => [why(p.reason)],
    REFUND_DONE: (p) => [baht(p.amount)],
    CREATE_STORE: (p) => [p.queue_code ? `รหัสคิว ${p.queue_code}` : '', p.start && p.end ? `สัญญา ${thaiDate(p.start)} ถึง ${thaiDate(p.end)}` : ''],
    UPDATE_STORE: (p) => [p.name ? `ชื่อร้าน ${auditQuote(p.name)}` : '', p.queue_code ? `รหัสคิว ${p.queue_code}` : ''],
    UPDATE_STORE_PROFILE: (p) => [auditQuote(p.name), Array.isArray(p.changed) && p.changed.length ? `แก้${p.changed.map((f) => PROFILE_FIELD_TH[f] || f).join(', ')}` : ''],
    AUTO_DELETE_STORE: (p) => [why(p.reason)],
    RENEW_CONTRACT: (p) => [p.end ? `ถึง ${thaiDate(p.end)}` : ''],
    CONTRACT_EXTEND: (p) => [p.end ? `เป็น ${thaiDate(p.end)}` : '', why(p.reason)],
    CONTRACT_SHORTEN: (p) => [p.end ? `เป็น ${thaiDate(p.end)}` : '', why(p.reason)],
    CONTRACT_END_BACKDATED: (p) => [p.end ? `เป็น ${thaiDate(p.end)}` : '', why(p.reason)],
    CONTRACT_RESTART: (p) => [p.start && p.end ? `${thaiDate(p.start)} ถึง ${thaiDate(p.end)}` : '', why(p.reason)],
    CREATE_PRODUCT: (p) => [auditQuote(p.name), baht(p.price)],
    UPDATE_PRODUCT: (p) => [auditQuote(p.name)],
    PRICE_UPDATE: (p) => [auditQuote(p.name), p.price !== undefined ? `เป็น ${baht(p.price)}` : ''],
    DELETE_PRODUCT: (p) => [auditQuote(p.name)],
    OUT_OF_STOCK: (p) => [auditQuote(p.name), p.from_order ? `(จากออเดอร์ #${p.from_order})` : ''],
    BACK_IN_STOCK: (p) => [auditQuote(p.name)],
    OUT_OF_STOCK_NOTIFY: (p) => [auditQuote(p.name), p.orders ? `${p.orders} ออเดอร์` : ''],
    LOGIN: (p) => [p.method === 'google' ? 'ด้วย Google' : p.method === 'google_link' ? 'ด้วย Google (เพิ่งเชื่อมบัญชี)' : ''],
    BAN_USER: (p) => [who(p), p.days ? `${p.days} วัน (ถึง ${thaiDateTime(p.until)})` : p.suspension_id ? 'ไม่มีกำหนด' : '', why(p.reason)],
    UNBAN_USER: (p) => [who(p), p.note ? `หมายเหตุ: ${p.note}` : !p.suspension_id && p.reason ? `หมายเหตุ: ${p.reason}` : ''],
    AUTO_UNBAN_USER: (p) => [who(p), p.until ? `ครบกำหนด ${thaiDateTime(p.until)}` : ''],
    USER_APPEAL: (p) => [who(p), p.text ? `ข้อความ: ${p.text}` : ''],
    USER_APPEAL_APPROVE: (p) => [who(p), p.note ? `ข้อความ: ${p.note}` : ''],
    USER_APPEAL_REJECT: (p) => [who(p), p.response ? `ข้อความ: ${p.response}` : ''],
    GOOGLE_LINK: (p) => [p.email ? `อีเมล ${p.email}` : ''],
    LOGIN_FAIL: (p, log) => [p.reason === 'unknown_username' ? `ไม่พบชื่อผู้ใช้ ${auditQuote(log.EntityId)}` : p.failed_count ? `รหัสผ่านไม่ถูกต้อง (ครั้งที่ ${p.failed_count})` : 'รหัสผ่านไม่ถูกต้อง', p.throttled_seconds ? `ต้องรอ ${p.throttled_seconds} วินาทีก่อนลองใหม่` : ''],
    ACCOUNT_LOCKED: (p) => [p.failed_count ? `ใส่รหัสผ่านผิด ${p.failed_count} ครั้ง` : ''],
    CREATE_STAFF: (p) => [who(p), AUDIT_ROLE_TH[p.role] ? `ตำแหน่ง${AUDIT_ROLE_TH[p.role]}` : ''],
    UPDATE_STAFF: (p) => [AUDIT_ROLE_TH[p.role] ? `เปลี่ยนตำแหน่งเป็น${AUDIT_ROLE_TH[p.role]}` : ''],
    ACTIVATE_STAFF: (p) => [who(p)],
    DEACTIVATE_STAFF: (p) => [who(p)],
    DELETE_STAFF: (p) => [who(p)],
    CREATE_STORE_ACCOUNT: (p) => [who(p)],
    UPDATE_STORE_ACCOUNT: (p) => [Array.isArray(p.changed) && p.changed.length ? `แก้${p.changed.map((f) => AUDIT_FIELD_TH[f] || f).join(', ')}` : ''],
    DELETE_STORE_ACCOUNT: (p) => [who(p)],
    OPEN_FOOD_COURT: (p) => [p.override_until ? `ถึง ${thaiDateTime(p.override_until)}` : ''],
    CLOSE_FOOD_COURT: (p) => [p.override_until ? `ถึง ${thaiDateTime(p.override_until)}` : '', ...forcedClose(p)],
    UPDATE_FOOD_COURT_SCHEDULE: (p) => [p.open && p.close ? `เป็นเปิด ${p.open} น. ปิด ${p.close} น.` : ''],
    UPDATE_ISSUE: (p) => [p.status ? `เป็น ${auditQuote(ISSUE_STATUS_TH[p.status] || p.status)}` : '', p.note ? `ข้อความ: ${p.note}` : '']
};

export const formatAuditDetails = (log) => {
    const action = String(log.Action || '').toUpperCase();
    const raw = String(log.Details || '').trim();
    const verb = AUDIT_VERBS[action];
    if (!verb) return raw || '—';
    const storeName = String(log.StoreName || '');
    const store = log.StoreId != null ? `${storeName ? `${storeName.startsWith('ร้าน') ? '' : 'ร้าน'}${storeName} ` : 'ร้านค้า '}(รหัสร้าน #${log.StoreId})` : '';
    const order = log.OrderId != null ? `ออเดอร์ #${log.OrderId}` : '';
    const queue = log.QueueLabel ? `คิว ${log.QueueLabel}` : '';
    const extra = (AUDIT_DETAIL[action]?.(auditPayload(raw), log) || []).filter(Boolean).join(' · ');
    return [extra ? `${verb} ${extra}` : verb, order, queue, store].filter(Boolean).join(' · ');
};
