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
