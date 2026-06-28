import {countMissedSlots, proratedFirstMonthCost, ScheduleSlot, semiMonthlySplit} from './proration';
import {PACKAGE_CONFIG} from './package-config';
import {Package} from '../enums/package.enum';
import {Weekday} from '../enums/weekday.enum';

// July 2026: the 1st falls on a Wednesday.
// Wednesdays: 1, 8, 15, 22, 29.  Mondays: 6, 13, 20, 27.
const slot = (weekday: Weekday): ScheduleSlot => ({weekday, start_time: '15:00', end_time: '15:30'});

describe('proration', () => {
  describe('countMissedSlots', () => {
    it('counts slots before a mid-month start date', () => {
      // Wednesdays before the 15th: the 1st and the 8th → 2 missed.
      const missed = countMissedSlots([slot(Weekday.WEDNESDAY)], new Date(2026, 6, 15));
      expect(missed).toBe(2);
    });

    it('counts across multiple weekday slots', () => {
      // Before the 9th: Wednesdays 1 & 8 (2) + Monday 6 (1) → 3 missed.
      const missed = countMissedSlots(
        [slot(Weekday.MONDAY), slot(Weekday.WEDNESDAY)],
        new Date(2026, 6, 9),
      );
      expect(missed).toBe(3);
    });

    it('is zero when starting on the 1st', () => {
      expect(countMissedSlots([slot(Weekday.WEDNESDAY)], new Date(2026, 6, 1))).toBe(0);
    });

    it('is zero for an empty or missing schedule', () => {
      expect(countMissedSlots([], new Date(2026, 6, 15))).toBe(0);
      expect(countMissedSlots(undefined as unknown as [], new Date(2026, 6, 15))).toBe(0);
    });
  });

  describe('proratedFirstMonthCost', () => {
    const succeed = PACKAGE_CONFIG[Package.SUCCEED]; // $362/mo, 2×30/wk, perSession $41.77

    it('reduces the monthly cost by per-session cost × missed sessions', () => {
      // 362 - round(41.77 * 2, 2) = 362 - 83.54 = 278.46
      expect(proratedFirstMonthCost(succeed, 2)).toBe(278.46);
    });

    it('charges the full monthly cost when nothing is missed', () => {
      expect(proratedFirstMonthCost(succeed, 0)).toBe(362);
    });

    it('never goes below zero', () => {
      expect(proratedFirstMonthCost(succeed, 1000)).toBe(0);
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
