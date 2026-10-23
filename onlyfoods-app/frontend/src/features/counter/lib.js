// ฟังก์ชันช่วยของหน้าพนักงานหน้าร้าน (ไม่มี UI)

// ออเดอร์ walk-in (ไม่มีบัญชีลูกค้า) : backend ส่ง IsWalkIn เป็น 0/1
export const isWalkInOrder = (o) => Boolean(Number(o?.IsWalkIn)) || !o?.UserId;

export const fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// ข้อความ error จาก backend : detail เป็นข้อความ หรือรายการ (422 ของ pydantic) -> ไม่ให้ขึ้น [object Object]
export const apiErrorText = (data, fallback) => {
  if (typeof data?.detail === 'string') return data.detail;
  if (Array.isArray(data?.detail)) return data.detail.map(d => d?.msg).filter(Boolean).join(', ') || fallback;
  return fallback;
};

// ชนิดของ toast จากข้อความ (เดิมขึ้น ✓ สีเขียวทุกข้อความ แม้เป็น error)
export const toastKind = (msg) => {
  const t = String(msg || '');
  if (/ไม่สำเร็จ|ไม่ได้|ไม่สามารถ|ผิดพลาด|ไม่พอ|ไม่พบ|กรุณา|error|HTTP|⚠️|❌|🔒/i.test(t)) return 'error';
  return 'success';
};
