import {Contact} from '../models/contact.model';
import {Session} from '../models/session.model';
import {SessionStatus} from '../enums/session-status.enum';

/** A copy of `date` with the wall time (hours/minutes) taken from `time`. */
export function combineDateTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours());
  combined.setMinutes(time.getMinutes());
  return combined;
}

/** Whole minutes between two times (0 when either is missing). */
export function durationMinutes(start?: Date, end?: Date): number {
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

/** Duration in minutes of a persisted session from its start/end datetimes. */
export function durationOf(session: Session): number {
  if (!session.start_datetime || !session.end_datetime) return 0;
  return Math.round(
    (new Date(session.end_datetime).getTime() - new Date(session.start_datetime).getTime()) / 60000,
  );
}

/**
 * True when the schedule-relevant fields (date/time/tutor/student) would save
 * exactly what the original session already holds — e.g. the admin is only
 * taking attendance or editing notes. Rebuilds the datetimes the same way the
 * update path does so the comparison mirrors what would be persisted.
 */
export function scheduleFieldsUnchanged(
  original: Session,
  date: Date | undefined,
  startTime: Date | undefined,
  endTime: Date | undefined,
  tutorId: string | undefined,
  studentId: string | undefined,
): boolean {
  if (!date || !startTime || !endTime) {
    return false;
  }
  return (
    combineDateTime(date, startTime).toISOString() === original.start_datetime
    && combineDateTime(date, endTime).toISOString() === original.end_datetime
    && tutorId === original.tutor_id
    && studentId === original.student_id
  );
}

/**
 * The occurrences a "this and future" series operation applies to: still
 * PENDING and starting at or after the occurrence being edited/deleted.
 */
export function futureSeriesTargets(sessions: Session[], from: Session): Session[] {
  return sessions.filter(s =>
    s.status === SessionStatus.PENDING &&
    new Date(s.start_datetime!) >= new Date(from.start_datetime!),
  );
}

/**
 * Rebuilds each target occurrence on its own date with the new time range,
 * tutor, and notes — the payload list for a "this and future" series edit.
 */
export function retimeSeriesOccurrences(
  targets: Session[],
  startTime: Date,
  endTime: Date,
  tutor: Contact,
  notes: string,
): Session[] {
  return targets.map(s => {
    const start = new Date(s.start_datetime!);
    start.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
    const end = new Date(s.start_datetime!);
    end.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
    const upd: Session = {...s};
    upd.tutor_id = tutor.id;
    upd.tutor_name = tutor.first_name;
    upd.start_datetime = start.toISOString();
    upd.end_datetime = end.toISOString();
    upd.notes = notes;
    return upd;
  });
}
