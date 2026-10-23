// ตรวจ/อ่านไฟล์รูป + ค่าการครอป (ใช้กับรูปเมนูและรูปโปรไฟล์พนักงาน)

// --- อัปโหลดรูปเมนู: ไม่บังคับใส่ แต่ถ้าใส่ต้องผ่านการตรวจจริง ---
// ต้องตรงกับที่ backend รับ (utils.save_image): png / jpeg / webp / gif และไม่เกิน MAX_IMAGE_BYTES (5 MB)
export const MAX_IMAGE_MB = 5;

// ตรงกับ Product.Description VARCHAR(500)
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export const formatBytes = (bytes) => bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// อ่านไฟล์ + ตรวจชนิด ขนาด และว่าเปิดเป็นรูปได้จริง (กันไฟล์เสีย/เปลี่ยนนามสกุล)
export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      reject(new Error('รองรับเฉพาะไฟล์ PNG, JPG, WEBP หรือ GIF'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error(`ไฟล์มีขนาด ${formatBytes(file.size)} เกินกำหนด ${MAX_IMAGE_MB} MB`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์นี้ได้'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve({
        dataUrl: reader.result,
        info: { name: file.name, size: file.size, width: img.naturalWidth, height: img.naturalHeight },
      });
      img.onerror = () => reject(new Error('ไฟล์รูปเสียหรือไม่ใช่รูปภาพ'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// --- ครอปรูป: ลากเพื่อเลื่อน, เลื่อนแถบ/ล้อเมาส์เพื่อซูม, เลือกสัดส่วนได้ ---
export const CROP_RATIOS = [
  { id: '4:3', label: '4:3', value: 4 / 3 },
  { id: '1:1', label: '1:1', value: 1 },
  { id: '16:9', label: '16:9', value: 16 / 9 },
];

export const CROP_OUTPUT_MAX = 1200;
