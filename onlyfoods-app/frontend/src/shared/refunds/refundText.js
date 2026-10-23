// ข้อความ/รูปแบบของรายการคืนเงิน (ใช้ร่วม: หน้าร้าน เจ้าของร้าน บัญชี ผู้บริหาร)

export const TYPE_TH = { FULL_CANCEL: 'ยกเลิกออเดอร์', PRICE_DIFF: 'ส่วนต่างราคาเมนู', ITEM_CANCEL: 'ยกเลิกบางรายการ' };

export const STATUS_TH = { PENDING: 'รอคืนเงิน', DONE: 'คืนเงินแล้ว', FAILED: 'ไม่สำเร็จ' };

// ลูกค้าออนไลน์ที่ยังไม่ได้ระบุบัญชีรับเงินคืน (ร้านยังโอนไม่ได้)
export const awaitingAccount = (r) => r.RefundStatus === 'PENDING' && !r.IsWalkIn && r.PayoutMethod !== 'TRANSFER';

export const PAYOUT_KIND_TH = { PROMPTPAY: 'พร้อมเพย์', BANK: 'ธนาคาร' };

export const ROLE_TH = { FRONT_STAFF: 'หน้าร้าน', STORE_OWNER: 'เจ้าของร้าน', ACCOUNTANT: 'ฝ่ายบัญชี', EXECUTIVE: 'ผู้บริหาร' };

export const money = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const toDate = (v) => (v ? new Date(String(v).replace(' ', 'T')) : null);

export const fmtDateTime = (v) => {
  const d = toDate(v);
  if (!d || Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const fmtPhone = (p) => {
  const s = String(p || '');
  return s.length === 10 ? `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}` : s;
};

// วิธีรับเงินของรายการ : ที่ลูกค้าเลือก (ยังรอคืน) หรือที่ร้านจ่ายจริง (คืนแล้ว)
export function payoutLabel(r) {
  if (r.RefundStatus === 'DONE') return r.PaidMethod === 'TRANSFER' ? 'โอนแล้ว' : 'เงินสด';
  if (r.IsWalkIn) return 'เงินสดที่ร้าน';
  if (r.PayoutMethod !== 'TRANSFER') return 'รอลูกค้าระบุบัญชี';
  const kind = PAYOUT_KIND_TH[r.PayoutKind] || 'โอน';
  return `โอน · ${kind}${r.PayoutAccountNo ? ` ${r.PayoutAccountNo}` : ''}`;
}

export async function readError(res, fallback) {
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail)) return data.detail.map(d => d?.msg).filter(Boolean).join(', ') || fallback;
  } catch { /* ไม่ใช่ JSON */ }
  return fallback;
}
