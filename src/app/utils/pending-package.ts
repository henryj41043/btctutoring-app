import {PendingChange, Student} from '../models/student.model';
import {ScheduleSlot} from './proration';
import {CUSTOM_PACKAGE} from './package-config';

/** Months generated ahead of the current one (mirrors the service). */
export const HORIZON_MONTHS_AHEAD = 3;

/** A month key 'YYYY-MM' (month is 0-indexed). */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** A local date as 'YYYY-MM-DD'. */
export function dateKeyOf(date: Date): string {
  return `${monthKey(date.getFullYear(), date.getMonth())}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * The dates a NEW package change may take effect on: tomorrow through the
 * last day of the calendar look-ahead (client rule 2026-09: future only).
 */
export function changeDateBounds(now: Date): {min: Date; max: Date} {
  return {
    min: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
    max: new Date(now.getFullYear(), now.getMonth() + HORIZON_MONTHS_AHEAD + 1, 0),
  };
}

const byEffective = (a: PendingChange, b: PendingChange): number =>
  a.effective < b.effective ? -1 : a.effective > b.effective ? 1 : 0;

/**
 * The student's scheduled package changes, oldest effective first. Reads the
 * list when present, else folds a legacy single change (the pre-list scalar
 * fields) into a one-entry list. Always a fresh array. Mirror of the backend
 * normalizer.
 */
export function pendingChangesOf(student: Student | undefined): PendingChange[] {
  if (!student) {
    return [];
  }
  if (Array.isArray(student.pending_changes)) {
    return student.pending_changes
      .filter(c => !!c && !!c.package && !!c.effective)
      .map(c => ({...c}))
      .sort(byEffective);
  }
  if (student.pending_package && student.pending_package_effective) {
    const legacy: PendingChange = {
      package: student.pending_package,
      effective: student.pending_package_effective,
    };
    if (student.pending_custom_monthly_cost !== undefined) {
      legacy.custom_monthly_cost = student.pending_custom_monthly_cost;
    }
    if (student.pending_custom_sessions_per_week !== undefined) {
      legacy.custom_sessions_per_week = student.pending_custom_sessions_per_week;
    }
    if (student.pending_custom_session_length_min !== undefined) {
      legacy.custom_session_length_min = student.pending_custom_session_length_min;
    }
    if (student.pending_schedule && student.pending_schedule.length > 0) {
      legacy.schedule = student.pending_schedule;
    }
    if (student.pending_change_notice_sent) {
      legacy.notice_sent = student.pending_change_notice_sent;
    }
    return [legacy];
  }
  return [];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A short display note for one scheduled change, e.g. '→ Achieve from Sep 1',
 * or null when it is incomplete or its date is malformed. The date is parsed
 * by components ('YYYY-MM-DD' through new Date() reads as UTC and shifts a
 * day on Eastern browsers).
 */
export function pendingChangeNote(change: Partial<PendingChange> | undefined): string | null {
  if (!change?.package || !change.effective) {
    return null;
  }
  const [, month, day] = change.effective.split('-').map(Number);
  if (!month || !day || month > 12) {
    return null;
  }
  return `→ ${change.package} from ${MONTH_NAMES[month - 1].slice(0, 3)} ${day}`;
}

/** The scheduled change taking effect on `effective`, if any. */
export function findPendingChange(student: Student | undefined, effective: string | undefined): PendingChange | undefined {
  if (!effective) {
    return undefined;
  }
  return pendingChangesOf(student).find(c => c.effective === effective);
}

/** A copy of the list with the matching change's schedule replaced. */
export function withPendingSchedule(changes: PendingChange[], effective: string, slots: ScheduleSlot[]): PendingChange[] {
  return changes.map(c => (c.effective === effective ? {...c, schedule: slots} : {...c}));
}

/**
 * True when two changes describe the same package definition on the same
 * date. Null-coalesced: form controls hold null where the stored model holds
 * undefined, and that difference is not a change.
 */
export function sameChange(a: PendingChange, b: PendingChange): boolean {
  const norm = (value: unknown): unknown => value ?? null;
  return a.package === b.package
    && a.effective === b.effective
    && norm(a.custom_monthly_cost) === norm(b.custom_monthly_cost)
    && norm(a.custom_sessions_per_week) === norm(b.custom_sessions_per_week)
    && norm(a.custom_session_length_min) === norm(b.custom_session_length_min);
}

/**
 * The changes in `next` that lack a schedule and are new or edited relative
 * to `prior`'s stored changes — the ones the pending-schedule dialog should
 * be opened for (the first, oldest effective, is the auto-open target).
 */
export function newChangesWithoutSchedule(prior: Student | undefined, next: PendingChange[]): PendingChange[] {
  const stored = pendingChangesOf(prior);
  return [...next]
    .sort(byEffective)
    .filter(c => !(c.schedule && c.schedule.length > 0))
    .filter(c => !stored.some(p => sameChange(p, c)));
}

const EFFECTIVE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written 'YYYY-MM-DD'. */
function isRealDate(key: string): boolean {
  if (!EFFECTIVE_PATTERN.test(key)) {
    return false;
  }
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * Validates a scheduled-change list before saving. Returns the first error
 * message, or null when the list is valid. Rules: every row needs a package
 * and a date; a date that is not already stored must be in the FUTURE and
 * inside the calendar look-ahead (stored dates stay saveable so a stuck
 * entry can still be edited or removed); no two changes share a date; each
 * step's package must differ from the previous step (the prior change, or
 * the current package) — except Custom → Custom when any custom value
 * differs; a Custom change needs all three custom values; a custom price
 * must be $0 or more.
 */
export function validatePendingChanges(
  changes: PendingChange[],
  currentPackage: string | undefined,
  storedEffectives: string[],
  now: Date,
): string | null {
  const today = dateKeyOf(now);
  const latest = dateKeyOf(changeDateBounds(now).max);
  for (const c of changes) {
    if (!c.package) {
      return 'Pick a package for every scheduled change.';
    }
    if (!c.effective) {
      return 'Pick the date each scheduled package change takes effect.';
    }
    if (!isRealDate(c.effective)) {
      return 'A scheduled change needs a valid date.';
    }
    if (!storedEffectives.includes(c.effective)) {
      if (c.effective <= today) {
        return 'A scheduled change must take effect on a future date.';
      }
      if (c.effective > latest) {
        return 'A scheduled change can be set no further ahead than the calendar (three months after this one).';
      }
    }
    const price: unknown = c.price_override;
    if (price !== undefined && price !== null
      && (typeof price !== 'number' || !Number.isFinite(price) || price < 0)) {
      return 'A custom price must be $0 or more.';
    }
  }
  const sorted = [...changes].sort(byEffective);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].effective === sorted[i - 1].effective) {
      return 'Two scheduled changes share the same date — pick different dates.';
    }
  }
  let prev: PendingChange | {package: string | undefined} = {package: currentPackage};
  for (const c of sorted) {
    if (c.package === prev.package) {
      const bothCustom = c.package === CUSTOM_PACKAGE;
      const customsDiffer = bothCustom && !sameChange(
        {...(prev as PendingChange), effective: c.effective},
        c,
      );
      if (!customsDiffer) {
        return `The scheduled ${c.package} package matches the step before it — remove it or pick a different package.`;
      }
    }
    if (
      c.package === CUSTOM_PACKAGE &&
      (!c.custom_monthly_cost || !c.custom_sessions_per_week || !c.custom_session_length_min)
    ) {
      return 'A scheduled Custom package needs all three custom values.';
    }
    prev = c;
  }
  return null;
}
