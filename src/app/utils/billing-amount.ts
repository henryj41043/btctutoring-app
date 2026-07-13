import {Student} from '../models/student.model';
import {PackageDef, resolvePackageDef, round2} from './package-config';
import {countRemainingSlots, proratedFirstMonthCost, semiMonthlySplit} from './proration';

/**
 * Applies a family's sibling discount to an amount, but only when the family
 * actually has 2+ enrolled students. A stale percent never discounts an only
 * child. Mirror of the backend billing-amount helper.
 */
export function siblingDiscountedTotal(
  amount: number,
  percent: number | undefined,
  enrolledStudentCount: number,
): number {
  if (!percent || percent <= 0 || enrolledStudentCount < 2) {
    return amount;
  }
  const pct = Math.min(100, Math.max(0, percent));
  return round2(amount * (1 - pct / 100));
}

/** A student's charge split across a month's two semi-monthly billing dates. */
export interface SemiMonthlyCharge {
  first: number;
  fifteenth: number;
}

/**
 * The prorated charge for a mid-month start: per-session cost times the slots
 * the student receives from their start date through month end. Without a
 * schedule the slots can't be counted, so fall back to the full monthly cost
 * rather than silently billing $0 (studentNeedsAttention flags these).
 */
function proratedCharge(def: PackageDef, student: Student, start: Date): number {
  const schedule = student.schedule ?? [];
  if (schedule.length === 0) return def.monthlyCost;
  return proratedFirstMonthCost(def, countRemainingSlots(schedule, start));
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
    return proratedCharge(def, student, start);
  }
  return def.monthlyCost;
}

/**
 * A student's contribution to a month's two semi-monthly billing dates (1st and
 * 15th). Ongoing months split the monthly cost 50/50. The prorated first month
 * is billed in the START month: split evenly across the 1st and 15th when the
 * student starts before the 15th, or entirely on the 15th (the 1st left blank)
 * when they start on the 15th or later. Normal 50/50 billing resumes the
 * following month.
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
  if (displayedIdx > startIdx) return normalSplit(); // ongoing month after the first

  // Starting on the 1st is a full month — no proration.
  if (start.getDate() <= 1) return normalSplit();

  // Prorated first month, billed in the start month: starts on/after the 15th
  // land entirely on the 15th; earlier starts split evenly across both dates.
  const prorated = proratedCharge(def, student, start);
  if (start.getDate() >= 15) return {first: 0, fifteenth: prorated};
  const [first, fifteenth] = semiMonthlySplit(prorated);
  return {first, fifteenth};
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
