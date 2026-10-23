// ค่าเริ่มต้นและการตรวจฟอร์มร้านค้า

export const MAX_IMAGE_MB = 5;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// เดิม 2 วิ (orders 5000 แถว + อีก 4 endpoint ทุก 2 วิ = server/DB โหลดหนัก)
export const FOOD_CATEGORIES = [
    'อาหารจานเดียว',
    'ก๋วยเตี๋ยว / เส้น',
    'ตามสั่ง',
    'อาหารอีสาน',
    'เครื่องดื่ม',
    'ของหวาน / เบเกอรี',
    'ทานเล่น',
    'อื่น ๆ'
];

export const EMPTY_STORE_FORM = {
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

export function looksLikeGarbage(value) {
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

export const EMAIL_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

// รหัสผ่าน: ต้องตรงกับ backend (config.MIN_PASSWORD_LENGTH = 8 ; bcrypt รับได้ไม่เกิน 72)
export const STORE_PASSWORD_MIN = 8;

export const STORE_PASSWORD_MAX = 72;

// เบอร์ร้าน: ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0 (พิมพ์ขีด/เว้นวรรคมาได้) -> ข้อความผิด หรือ '' ถ้าถูก
// ใช้ทั้งฟอร์มเพิ่มร้าน และตอนแก้เบอร์ในหน้าดู/แก้ไขร้าน (backend ตรวจซ้ำด้วย utils.validate_phone)
export function storePhoneError(value) {
    const phone = String(value || '').replace(/[\s-]/g, '');
    if (!phone) return 'กรุณากรอกเบอร์โทรติดต่อ';
    if (!/^0\d{8,9}$/.test(phone)) return 'เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก และขึ้นต้นด้วย 0';
    if (looksLikeGarbage(phone)) return 'เบอร์โทรนี้ไม่ถูกต้อง';
    return '';
}

export function validateStoreForm(form, mode = 'create') {
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
