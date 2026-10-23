import { describe, expect, it } from 'vitest';
import { parseOrderDate, resolvePeriod } from './dates';
import {
  buildBuckets, buildStoreReport, changePct, hoursFromSchedule, isRevenueOrder, orderNet, orderReceived,
  summarizeMenus, summarizeOrders,
} from './sales';

// ออเดอร์จำลอง : สูตรต้องตรงกับ backend (reports.dashboard / v_order_net)
const order = (id, status, total, extra = {}) => ({
  OrderID: id, StoreId: 1, Status: status, TotalAmount: total, CreatedAt: '2026-10-23 12:15:00', items: [], ...extra,
});

describe('parseOrderDate', () => {
  it('อ่านเวลาไม่มี timezone จาก backend เป็นเวลาไทย (+07:00)', () => {
    expect(parseOrderDate('2026-10-23 12:15:00').toISOString()).toBe('2026-10-23T05:15:00.000Z');
    expect(parseOrderDate('2026-10-23T12:15:00Z').toISOString()).toBe('2026-10-23T12:15:00.000Z');
  });
  it('ค่าว่าง/อ่านไม่ได้ = null', () => {
    expect(parseOrderDate('')).toBeNull();
    expect(parseOrderDate('not a date')).toBeNull();
  });
});

describe('ยอดขาย', () => {
  it('นับเป็นยอดขาย = สำเร็จ + ไม่มารับ ; ยกเลิกไม่นับ', () => {
    expect(isRevenueOrder(order(1, 'Completed', 50))).toBe(true);
    expect(isRevenueOrder(order(2, 'NoShow', 50))).toBe(true);
    expect(isRevenueOrder(order(3, 'Cancelled', 50))).toBe(false);
    expect(isRevenueOrder({ StatusCode: 'COMPLETED' })).toBe(true);
  });

  it('เงินที่รับจริง = การชำระที่ยืนยันแล้ว (รวมส่วนต่างที่โอนเพิ่ม) ไม่ใช่ TotalAmount', () => {
    const o = order(1, 'Completed', 40, { Payments: [
      { PaymentStatus: 'VERIFIED', Amount: 50 }, { PaymentStatus: 'VERIFIED', Amount: 10 }, { PaymentStatus: 'REJECTED', Amount: 99 },
    ] });
    expect(orderReceived(o)).toBe(60);
    expect(orderReceived(order(2, 'Completed', 45))).toBe(45); // ไม่มีข้อมูลการชำระ -> TotalAmount
    expect(orderNet(o, { 1: 15 })).toBe(45);                  // หักเงินคืน
  });

  it('summarizeOrders : ยอดสุทธิ อัตรายกเลิก ค่าเฉลี่ย', () => {
    const s = summarizeOrders([
      order(1, 'Completed', 100), order(2, 'NoShow', 50), order(3, 'Cancelled', 70), order(4, 'Cooking', 30),
    ], { 1: 20 });
    expect(s.sales).toBe(130);           // 100 + 50 - คืน 20
    expect(s.revenueCount).toBe(2);
    expect(s.noShowCount).toBe(1);
    expect(s.cancelledCount).toBe(1);
    expect(s.cancelRate).toBeCloseTo(33.33, 1); // ยกเลิก 1 / จบแล้ว 3 (ยังไม่จบไม่นับ)
    expect(s.grossSales).toBe(220);      // สำเร็จ + ไม่มารับ + ยกเลิก (ก่อนหักยกเลิก)
    expect(s.avgOrder).toBe(65);
    expect(summarizeOrders([]).cancelRate).toBeNull();
  });

  it('changePct : ช่วงก่อนเป็น 0 = เทียบไม่ได้', () => {
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(50, 0)).toBeNull();
  });
});

describe('เมนูขายดี', () => {
  it('เรียงตามจำนวนจาน แล้วตามยอดเงิน ; สัดส่วนคิดจากยอดเงิน', () => {
    const rows = summarizeMenus([
      order(1, 'Completed', 0, { items: [{ ProductId: 1, ProductName: 'A', Qty: 2, UnitPrice: 40 }, { ProductId: 2, ProductName: 'B', Qty: 1, UnitPrice: 100 }] }),
      order(2, 'Completed', 0, { items: [{ ProductId: 2, ProductName: 'B', Qty: 1, UnitPrice: 100 }] }),
    ]);
    expect(rows.map(r => r.name)).toEqual(['B', 'A']); // จานเท่ากัน (2) -> ยอดเงินมากกว่าขึ้นก่อน
    expect(rows[0]).toMatchObject({ qty: 2, amount: 200, orderCount: 2 });
    expect(rows[0].share + rows[1].share).toBeCloseTo(100);
  });
});

describe('กราฟและช่วงเวลา', () => {
  it('hoursFromSchedule : ช่วงชั่วโมงบนกราฟตามเวลาทำการ', () => {
    expect(hoursFromSchedule('08:00', '20:00')).toEqual({ from: 8, to: 19 });
    expect(hoursFromSchedule('08:00', '20:30')).toEqual({ from: 8, to: 20 });
    expect(hoursFromSchedule('20:00', '08:00')).toBeNull();
  });

  it('resolvePeriod : ย้อนหลัง N วันถึงวันที่เลือก', () => {
    const p = resolvePeriod({ anchor: '2026-10-23', days: 7, custom: false });
    expect(p.startISO).toBe('2026-10-17');
    expect(p.days).toBe(7);
  });

  it('buildBuckets : วันเดียว = รายชั่วโมง และขยายแกนถ้ามีออเดอร์นอกเวลาทำการ', () => {
    const period = resolvePeriod({ anchor: '2026-10-23', days: 1, custom: false });
    const b = buildBuckets([order(1, 'Completed', 50, { CreatedAt: '2026-10-23 07:10:00' })], period, { from: 8, to: 19 });
    expect(b[0]).toMatchObject({ label: '07:00', sales: 50, count: 1 });
    expect(b[b.length - 1].label).toBe('19:00');
  });

  it('buildStoreReport : เทียบกับช่วงก่อนหน้าความยาวเท่ากัน และกรองเฉพาะร้านนี้', () => {
    const period = resolvePeriod({ anchor: '2026-10-23', days: 1, custom: false });
    const r = buildStoreReport([
      order(1, 'Completed', 100),
      order(2, 'Completed', 40, { CreatedAt: '2026-10-22 12:00:00' }),
      order(3, 'Completed', 999, { StoreId: 2 }),
    ], 1, period, null, {});
    expect(r.now.sales).toBe(100);
    expect(r.before.sales).toBe(40);
    expect(r.hasPreviousData).toBe(true);
  });
});
