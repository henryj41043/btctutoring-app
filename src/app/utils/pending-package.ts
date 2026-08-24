import {Student} from '../models/student.model';
import {Package} from '../enums/package.enum';
import {monthKey} from './billing-amount';

/** The package-defining fields (current or pending) for one billing month. */
export interface PackageFields {
  package?: Package | '';
  custom_monthly_cost?: number;
  custom_sessions_per_week?: number;
  custom_session_length_min?: number;
}

/**
 * The package fields that govern a given month: the scheduled (pending)
 * change once the viewed month reaches its effective month, else the current
 * package. Lets a future month's billing resolve the new package BEFORE the
 * backend's 1st-of-month cron promotes it. Mirror of the backend helper.
 */
export function packageFieldsForMonth(student: Student, year: number, month: number): PackageFields {
  if (
    student.pending_package &&
    student.pending_package_effective &&
    student.pending_package_effective.slice(0, 7) <= monthKey(year, month)
  ) {
    return {
      package: student.pending_package,
      custom_monthly_cost: student.pending_custom_monthly_cost,
      custom_sessions_per_week: student.pending_custom_sessions_per_week,
      custom_session_length_min: student.pending_custom_session_length_min,
    };
  }
  return {
    package: student.package,
    custom_monthly_cost: student.custom_monthly_cost,
    custom_sessions_per_week: student.custom_sessions_per_week,
    custom_session_length_min: student.custom_session_length_min,
  };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A short display note for a scheduled change, e.g. '→ Achieve from Sep 1',
 * or null when none is pending. The effective date is parsed by components
 * ('YYYY-MM-DD' through new Date() reads as UTC and shifts a day on Eastern
 * browsers).
 */
export function pendingPackageNote(student: Student): string | null {
  if (!student.pending_package || !student.pending_package_effective) {
    return null;
  }
  const [, month, day] = student.pending_package_effective.split('-').map(Number);
  if (!month || !day) {
    return null;
  }
  return `→ ${student.pending_package} from ${MONTH_NAMES[month - 1].slice(0, 3)} ${day}`;
}

/**
 * The next `count` month-1sts after `now`, as effective-date options:
 * {value: '2026-09-01', label: 'September 2026'}.
 */
export function nextMonthFirsts(now: Date, count: number = 6): {value: string; label: string}[] {
  const options: {value: string; label: string}[] = [];
  for (let i = 1; i <= count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-01`;
    options.push({value, label: `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`});
  }
  return options;
}

/**
 * True when the saved student carries a pending change that is new or differs
 * from the prior state — the signal to open the pending-schedule dialog.
 */
export function pendingChanged(prior: Student | undefined, next: Student): boolean {
  if (!next.pending_package) {
    return false;
  }
  // Null-coalesce both sides: form controls hold null where the stored model
  // holds undefined, and that difference is not a change.
  const norm = (value: unknown): unknown => value ?? null;
  return next.pending_package !== prior?.pending_package
    || norm(next.pending_package_effective || null) !== norm(prior?.pending_package_effective || null)
    || norm(next.pending_custom_monthly_cost) !== norm(prior?.pending_custom_monthly_cost)
    || norm(next.pending_custom_sessions_per_week) !== norm(prior?.pending_custom_sessions_per_week)
    || norm(next.pending_custom_session_length_min) !== norm(prior?.pending_custom_session_length_min);
}
