import {countRemainingSlots, proratedFirstMonthCost, ScheduleSlot, semiMonthlySplit} from './proration';
import {PACKAGE_CONFIG} from './package-config';
import {Package} from '../enums/package.enum';
import {Weekday} from '../enums/weekday.enum';

// July 2026: the 1st falls on a Wednesday.
// Wednesdays: 1, 8, 15, 22, 29.  Mondays: 6, 13, 20, 27.
const slot = (weekday: Weekday): ScheduleSlot => ({weekday, start_time: '15:00', end_time: '15:30'});

describe('proration', () => {
  describe('countRemainingSlots', () => {
    it('counts slots from a mid-month start date through month end', () => {
      // Wednesdays on/after the 15th: 15, 22, 29 → 3 remaining.
      const remaining = countRemainingSlots([slot(Weekday.WEDNESDAY)], new Date(2026, 6, 15));
      expect(remaining).toBe(3);
    });

    it('counts across multiple weekday slots', () => {
      // On/after the 9th: Wednesdays 15, 22, 29 (3) + Mondays 13, 20, 27 (3) → 6 remaining.
      const remaining = countRemainingSlots(
        [slot(Weekday.MONDAY), slot(Weekday.WEDNESDAY)],
        new Date(2026, 6, 9),
      );
      expect(remaining).toBe(6);
    });

    it('includes the start date itself', () => {
      // Starting ON a Wednesday: 1, 8, 15, 22, 29 → all 5 count.
      expect(countRemainingSlots([slot(Weekday.WEDNESDAY)], new Date(2026, 6, 1))).toBe(5);
    });

    it('counts a single remaining slot when starting on the last scheduled day', () => {
      // July 29 is the final Wednesday → exactly 1 remaining.
      expect(countRemainingSlots([slot(Weekday.WEDNESDAY)], new Date(2026, 6, 29))).toBe(1);
    });

    it('is zero when no scheduled days remain in the month', () => {
      // July 30–31 (Thu/Fri) hold no Wednesdays.
      expect(countRemainingSlots([slot(Weekday.WEDNESDAY)], new Date(2026, 6, 30))).toBe(0);
    });

    it('is zero for an empty or missing schedule', () => {
      expect(countRemainingSlots([], new Date(2026, 6, 15))).toBe(0);
      expect(countRemainingSlots(undefined as unknown as [], new Date(2026, 6, 15))).toBe(0);
    });
  });

  describe('proratedFirstMonthCost', () => {
    const succeed = PACKAGE_CONFIG[Package.SUCCEED]; // $362/mo, 2×30/wk, perSession $41.77

    it('charges per-session cost × remaining sessions', () => {
      // Succeed: 362*12/52 = 83.54/wk → 41.77/session. One session left → 41.77.
      expect(proratedFirstMonthCost(succeed, 1)).toBe(41.77);
      // round(41.77 * 2, 2) = 83.54
      expect(proratedFirstMonthCost(succeed, 2)).toBe(83.54);
      expect(proratedFirstMonthCost(succeed, 5)).toBe(208.85);
    });

    it('charges nothing when no sessions remain', () => {
      expect(proratedFirstMonthCost(succeed, 0)).toBe(0);
    });

    it('caps at the flat monthly cost', () => {
      // A month can hold ~4.3 weeks of slots; 9 × 41.77 = 375.93 > 362 → capped.
      expect(proratedFirstMonthCost(succeed, 9)).toBe(362);
      expect(proratedFirstMonthCost(succeed, 1000)).toBe(362);
    });
  });

  describe('semiMonthlySplit', () => {
    it('splits evenly when divisible', () => {
      expect(semiMonthlySplit(278.46)).toEqual([139.23, 139.23]);
    });

    it('absorbs the odd penny in the second half and sums to total', () => {
      const [a, b] = semiMonthlySplit(181.01);
      expect(a + b).toBeCloseTo(181.01, 2);
    });
  });
});
