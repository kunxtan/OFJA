// รายการคืนเงิน (จำผลไว้ใน lib/apiCache) : หน้า Refund Log ทั้ง 3 บทบาทและการโหลดล่วงหน้าใช้ key เดียวกัน
import { readError } from './refundText';

export const refundsQuery = (apiBase) => [`refunds:${apiBase}`, async () => {
  const res = await fetch(`${apiBase}/api/refunds?limit=2000`);
  if (!res.ok) throw new Error(await readError(res, 'โหลดรายการคืนเงินไม่สำเร็จ'));
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}];
