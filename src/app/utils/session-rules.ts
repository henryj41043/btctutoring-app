import {Session} from '../models/session.model';
import {Student} from '../models/student.model';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';
import {PackageDef} from './package-config';
import {availableMakeupMinutes} from './makeup';
import {durationOf} from './session-times';

/**
 * Returns an error if a session's duration violates its type's length rules:
 * trials are exactly 45 minutes by policy, and tutoring sessions may not
 * exceed the length the student's package allows per session. ADMIN/MAKE_UP
 * and unconfigured packages aren't constrained (make-up is already bounded by
 * the make-up minutes bank).
 */
export function validateSessionLength(
  type: SessionType,
  durationMinutes: number,
  def: PackageDef | null,
  student: Student | undefined,
): string | null {
  if (type === SessionType.TRIAL) {
    return durationMinutes === 45
      ? null
      : 'Trial sessions are always exactly 45 minutes.';
  }
  if (type !== SessionType.TUTORING) return null;
  if (!def) return null;
  if (durationMinutes > def.sessionLengthMin) {
    return `This session is ${durationMinutes} min, but ${student?.name ?? 'this student'}'s `
      + `${student?.package} package allows up to ${def.sessionLengthMin} min per session.`;
  }
  return null;
}

/**
 * Total existing PENDING make-up minutes already committed for a student,
 * excluding any session ids handled by the current operation.
 */
export function pendingMakeupMinutesFor(
  existing: Session[],
  studentId: string | undefined,
  excludeIds: Set<string>,
): number {
  return existing
    .filter(s =>
      s.student_id === studentId &&
      s.type === SessionType.MAKE_UP &&
      s.status === SessionStatus.PENDING &&
      !excludeIds.has(s.id ?? ''),
    )
    .reduce((sum, s) => sum + durationOf(s), 0);
}

/**
 * Validates that a student's total pending make-up minutes stay within their
 * make-up balance after adding `addMinutes`. Returns an error message or null.
 */
export function validateMakeupPendingBalance(
  student: Student,
  addMinutes: number,
  existing: Session[],
  excludeIds: Set<string> = new Set(),
): string | null {
  const balance = availableMakeupMinutes(student);
  const projected = pendingMakeupMinutesFor(existing, student.id, excludeIds) + addMinutes;
  if (projected > balance) {
    return `Not enough make-up minutes. ${student.name} has ${balance} min `
      + `but this would commit ${projected} pending min.`;
  }
  return null;
}

/** Whether finalizing a session of this type/status changes the student's minute banks. */
export function mutatesStudent(type: SessionType, status: SessionStatus): boolean {
  // Trials never touch the make-up bank — a cancelled trial banks nothing.
  if (type === SessionType.TRIAL) {
    return false;
  }
  if (type === SessionType.MAKE_UP) {
    return status === SessionStatus.COMPLETED || status === SessionStatus.NO_CALL_NO_SHOW;
  }
  // Regular tutoring only mutates the student when cancelled (minutes are banked).
  return status === SessionStatus.CANCELLED;
}
