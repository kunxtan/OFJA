// ฟังก์ชันช่วยของหน้าครัว (ไม่มี UI)

export const getRoleLabel = (role) => {
  const roleMap = {
    'Kitchen Staff': 'พนักงานครัว',
    'Front Staff': 'พนักงานหน้าร้าน',
    'Shop Owner': 'เจ้าของร้าน',
    'Accountant': 'เจ้าหน้าที่บัญชี',
    'Executive': 'ผู้บริหาร',
    'Customer': 'ลูกค้า'
  };
  return roleMap[role] || role || 'ผู้ใช้งาน';
};

export const parseDate = (timeStr) => {
  if (!timeStr) return null;
  if (timeStr instanceof Date) return isNaN(timeStr.getTime()) ? null : timeStr;

  if (typeof timeStr === 'string' && !timeStr.includes('-') && !timeStr.includes('/') && timeStr.includes(':')) {
    const cleanTime = timeStr.replace('น.', '').replace('น', '').trim();
    const parts = cleanTime.split(':').map(Number);
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      const d = new Date();
      d.setHours(parts[0], parts[1], parts[2] || 0, 0);
      return d;
    }
  }

  const formattedStr = typeof timeStr === 'string' ? timeStr.replace(' ', 'T') : timeStr;
  const parsed = new Date(formattedStr);
  return isNaN(parsed.getTime()) ? null : parsed;
};

// Helper เช็คว่าเป็นออเดอร์ของ "วันนี้" หรือไม่ (สำหรับ Auto Reset)
export const isToday = (timeStr) => {
  const d = parseDate(timeStr);
  if (!d) return true; // ถ้าเป็นสตริงเวลาสั้นๆ (เช่น 17:30 น.) ถือว่าเป็นของวันนี้
  const now = new Date();
  return d.getDate() === now.getDate() &&
         d.getMonth() === now.getMonth() &&
         d.getFullYear() === now.getFullYear();
};
