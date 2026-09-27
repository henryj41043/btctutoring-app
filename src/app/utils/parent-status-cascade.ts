import {ParentStatus} from '../enums/parent-status.enum';
import {StudentStatus} from '../enums/student-status.enum';

/**
 * The student status a parent-status change cascades to, or null when the
 * change cascades nothing. Deactivating-only by design: a parent returning to
 * Active Client never auto-activates students (they need packages/schedules
 * re-established first).
 */
export function cascadeTargetFor(parentStatus?: string): StudentStatus | null {
  switch (parentStatus) {
    case ParentStatus.FORMER_CLIENT:
      return StudentStatus.PAST_STUDENT;
    case ParentStatus.MIA:
      return StudentStatus.MIA;
    case ParentStatus.DECLINED_SERVICES:
      return StudentStatus.DECLINED_SERVICES;
    default:
      return null;
  }
}

/** A local date as 'YYYY-MM-DD'. */
export function localDateKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The service end date for a student leaving service NOW: an already
 * recorded end date on or before today stands, otherwise service ends today.
 * Null when the student was not in service (nothing to end).
 */
export function serviceEndForLeaving(
  student: {status?: string; service_end_date?: string | null},
  now: Date = new Date(),
): string | null {
  if (student.status !== StudentStatus.ACTIVE_STUDENT) {
    return null;
  }
  const today = localDateKey(now);
  const stored = (student.service_end_date ?? '').slice(0, 10);
  return stored && stored <= today ? stored : today;
}
