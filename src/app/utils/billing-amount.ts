import {Student} from '../models/student.model';
import {resolvePackageDef} from './package-config';
import {countMissedSlots, proratedFirstMonthCost, semiMonthlySplit} from './proration';

/** A student's charge split across a month's two semi-monthly billing dates. */
export interface SemiMonthlyCharge {
  first: number;
  fifteenth: number;
}

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
 * A student's contribution to a month's two semi-monthly billing dates (1st and
 * 15th). Ongoing months split the monthly cost 50/50. The single prorated first
 * month is billed in FULL on the next billing date — never split: on the 15th of
 * the start month when the student starts before the 15th (the 1st left at 0), or
 * on the 1st of the NEXT month when they start on the 15th or later (the 15th left
 * at 0). Normal 50/50 billing resumes the following month.
 */
export function studentSemiMonthlyCharge(student: Student, year: number, month: number): SemiMonthlyCharge {
  const def = resolvePackageDef(student.package, {
    monthlyCost: student.custom_monthly_cost,
    sessionsPerWeek: student.custom_sessions_per_week,
    sessionLengthMin: student.custom_session_length_min,
  });
  if (!def) return {first: 0, fifteenth: 0};

  const normalSplit = (): SemiMonthlyCharge => {
    const [first, fifteenth] = semiMonthlySplit(def.monthlyCost);
    return {first, fifteenth};
  };

  // Legacy student with no recorded start date: treat every month as a full month.
  if (!student.package_start_date) return normalSplit();

  const start = new Date(student.package_start_date);
  const displayedIdx = year * 12 + month;
  const startIdx = start.getFullYear() * 12 + start.getMonth();
  if (displayedIdx < startIdx) return {first: 0, fifteenth: 0}; // package hasn't started

  // Starting on the 1st is a full month — no proration.
  if (start.getDate() <= 1) return normalSplit();

  // The one prorated first month is billed in full on the next billing date: the
  // 15th of the start month (start before the 15th) or the 1st of the next month
  // (start on/after the 15th).
  const prorated = proratedFirstMonthCost(def, countMissedSlots(student.schedule ?? [], start));
  const billedOnFirst = start.getDate() >= 15;
  const proratedIdx = billedOnFirst ? startIdx + 1 : startIdx;
  if (displayedIdx < proratedIdx) return {first: 0, fifteenth: 0}; // started, billed next month
  if (displayedIdx === proratedIdx) {
    return billedOnFirst ? {first: prorated, fifteenth: 0} : {first: 0, fifteenth: prorated};
  }
  return normalSplit(); // after the prorated first month → normal billing
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
