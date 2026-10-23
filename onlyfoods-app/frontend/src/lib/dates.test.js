import { describe, expect, it } from 'vitest';
import { pad2, rangeDayCount, toISODate } from './dates';

describe('lib/dates', () => {
  it('pad2 / toISODate', () => {
    expect(pad2(7)).toBe('07');
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('rangeDayCount นับรวมวันแรกและวันสุดท้าย (ขั้นต่ำ 1 วัน)', () => {
    expect(rangeDayCount('2026-10-17', '2026-10-23')).toBe(7);
    expect(rangeDayCount('2026-10-23', '2026-10-23')).toBe(1);
    expect(rangeDayCount('2026-10-23', '2026-10-01')).toBe(1);
  });
});
