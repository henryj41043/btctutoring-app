import {Session} from '../models/session.model';
import {Student} from '../models/student.model';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';
import {Package} from '../enums/package.enum';
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
  if (type === SessionType.GROUP) {
    return durationMinutes === 45
      ? null
      : 'BTC & Me sessions are always exactly 45 minutes.';
  }
  if (type !== SessionType.TUTORING) return null;
  if (!def) return null;
  const cap = maxSessionLength(def, student);
  if (durationMinutes > cap) {
    return `This session is ${durationMinutes} min, but ${student?.name ?? 'this student'}'s `
      + `${student?.package} package allows up to ${cap} min per session.`;
  }
  return null;
}

/**
 * The longest session a student's package allows. CUSTOM packages may give
 * each schedule slot its own length, so the cap is the LONGEST scheduled slot
 * (never below the package's default length); fixed packages cap at the
 * package length as before.
 */
function maxSessionLength(def: PackageDef, student: Student | undefined): number {
  if (student?.package !== Package.CUSTOM) {
    return def.sessionLengthMin;
  }
  const slotLengths = (student.schedule ?? [])
    .map(slot => timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time))
    .filter(minutes => minutes > 0);
  return Math.max(def.sessionLengthMin, ...slotLengths);
}

/** 'HH:mm' → minutes since midnight (0 for blanks). */
function timeToMinutes(time: string | undefined): number {
  const [h, m] = (time ?? '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
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
  // Trials and BTC & Me group sessions never touch the make-up bank — a
  // cancelled one banks nothing (group billing is a flat monthly fee).
  if (type === SessionType.TRIAL || type === SessionType.GROUP) {
    return false;
  }
  if (type === SessionType.MAKE_UP) {
    return status === SessionStatus.COMPLETED || status === SessionStatus.NO_CALL_NO_SHOW;
  }
  // Regular tutoring only mutates the student when cancelled (minutes are banked).
  return status === SessionStatus.CANCELLED;
}
