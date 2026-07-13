import {PackageDef, perSessionCost, round2} from './package-config';
import {Weekday, WEEKDAY_BY_JS_DAY} from '../enums/weekday.enum';

/** A weekly recurring slot in a student's schedule. */
export interface ScheduleSlot {
  weekday: Weekday;
  start_time: string; // 'HH:mm'
  end_time: string;   // 'HH:mm'
}

/**
 * Counts the package session slots a student actually receives in their partial
 * first month: the weekly schedule slots from their start date (inclusive)
 * through the end of that month. Used to prorate the first month.
 */
export function countRemainingSlots(schedule: ScheduleSlot[], startDate: Date): number {
  if (!schedule || schedule.length === 0) return 0;
  const weekdaysScheduled = schedule.map(s => s.weekday);
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endOfMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);

  let remaining = 0;
  const cursor = new Date(start);
  while (cursor <= endOfMonth) {
    const weekday = WEEKDAY_BY_JS_DAY[cursor.getDay()];
    // A single calendar day can carry more than one slot (two sessions same day).
    remaining += weekdaysScheduled.filter(w => w === weekday).length;
    cursor.setDate(cursor.getDate() + 1);
  }
  return remaining;
}

/**
 * Counts the package session slots occurring from the 1st of `date`'s month up
 * to (but not including) `date`. Used at a mid-month package change to price the
 * old package's portion by the sessions received before the change.
 */
export function countSlotsBeforeInMonth(schedule: ScheduleSlot[], date: Date): number {
  if (!schedule || schedule.length === 0) return 0;
  const weekdaysScheduled = schedule.map(s => s.weekday);
  const cursor = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate()); // exclusive

  let count = 0;
  while (cursor < end) {
    const weekday = WEEKDAY_BY_JS_DAY[cursor.getDay()];
    count += weekdaysScheduled.filter(w => w === weekday).length;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/**
 * The prorated cost of a partial first month: the per-session cost times the
 * sessions the student actually receives (their remaining slots from the start
 * date through month end), with per-step penny rounding. A calendar month can
 * hold more weekly slots than the flat price covers (~4.3 weeks/month), so the
 * result is capped at the monthly cost. e.g. Succeed $362: weekly =
 * round(362*12/52) = 83.54, per-session = 41.77 → one slot left = $41.77.
 */
export function proratedFirstMonthCost(def: PackageDef, remainingSlots: number): number {
  return Math.min(def.monthlyCost, round2(perSessionCost(def) * remainingSlots));
}

/**
 * Splits a billing-period total into two semi-monthly payments (1st and 15th).
 * The second half absorbs any odd penny so the two halves sum exactly to total.
 */
export function semiMonthlySplit(total: number): [number, number] {
  const first = round2(total / 2);
  const second = round2(total - first);
  return [first, second];
}
