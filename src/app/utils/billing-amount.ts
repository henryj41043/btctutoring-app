import {Student} from '../models/student.model';
import {resolvePackageDef} from './package-config';
import {countMissedSlots, proratedFirstMonthCost} from './proration';

/**
 * The amount to charge a student for a given billing month (`month` is
 * 0-indexed). Returns the prorated cost for their first partial month, the full
 * monthly cost for ongoing months, or 0 if the package hasn't started by
 * month-end or isn't configured (e.g. an unconfigured CUSTOM student).
 */
export function studentMonthlyCharge(student: Student, year: number, month: number): number {
  const def = resolvePackageDef(student.package, {
    monthlyCost: student.custom_monthly_cost,
    sessionsPerWeek: student.custom_sessions_per_week,
    sessionLengthMin: student.custom_session_length_min,
  });
  if (!def) return 0;

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  if (!student.package_start_date) {
    // Legacy student with no recorded start date: treat as an ongoing full month.
    return def.monthlyCost;
  }

  const start = new Date(student.package_start_date);
  if (start > monthEnd) return 0; // package hasn't started yet
  // First partial month: started within this month, after the 1st.
  if (start >= monthStart && start <= monthEnd && start.getDate() > 1) {
    return proratedFirstMonthCost(def, countMissedSlots(student.schedule ?? [], start));
  }
  return def.monthlyCost;
}

/**
 * True if a student is billable but can't be priced confidently — an
 * unconfigured CUSTOM package, or a missing schedule/start date that prevents
 * accurate first-month proration. Surfaced as a flag on the billing page.
 */
export function studentNeedsAttention(student: Student): boolean {
  const def = resolvePackageDef(student.package, {
    monthlyCost: student.custom_monthly_cost,
    sessionsPerWeek: student.custom_sessions_per_week,
    sessionLengthMin: student.custom_session_length_min,
  });
  if (!def) return true; // unconfigured custom
  return !student.package_start_date || !student.schedule || student.schedule.length === 0;
}
