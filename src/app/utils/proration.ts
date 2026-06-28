import {PackageDef, perSessionCost, round2} from './package-config';
import {Weekday, WEEKDAY_BY_JS_DAY} from '../enums/weekday.enum';

/** A weekly recurring slot in a student's schedule. */
export interface ScheduleSlot {
  weekday: Weekday;
  start_time: string; // 'HH:mm'
  end_time: string;   // 'HH:mm'
}

/**
 * Counts the package session slots a student "misses" by starting mid-month:
 * the weekly schedule slots that fall on or after the 1st of the start month
 * but strictly before their start date. Used to prorate the first month.
 */
export function countMissedSlots(schedule: ScheduleSlot[], startDate: Date): number {
  if (!schedule || schedule.length === 0) return 0;
  const weekdaysScheduled = schedule.map(s => s.weekday);
  const firstOfMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

  let missed = 0;
  const cursor = new Date(firstOfMonth);
  while (cursor < start) {
    const weekday = WEEKDAY_BY_JS_DAY[cursor.getDay()];
    // A single calendar day can carry more than one slot (two sessions same day).
    missed += weekdaysScheduled.filter(w => w === weekday).length;
    cursor.setDate(cursor.getDate() + 1);
  }
  return missed;
}

/**
 * The prorated cost of a partial first month: the flat monthly cost less the
 * per-session cost of each missed session. Matches the business formula, with
 * per-step penny rounding. Never goes below zero.
 */
export function proratedFirstMonthCost(def: PackageDef, missedSlots: number): number {
  const reduction = round2(perSessionCost(def) * missedSlots);
  return Math.max(0, round2(def.monthlyCost - reduction));
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
