import {Contact} from '../models/contact.model';
import {Session, SessionParticipant} from '../models/session.model';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';
import {WEEKDAY_BY_JS_DAY} from '../enums/weekday.enum';
import {easternSlotToUtc} from './eastern-time';

/** BTC & Me sessions are always exactly 45 minutes (client policy). */
export const GROUP_SESSION_MINUTES = 45;

/** The denormalized display string for a roster ("Ava, Ben, Cy"). */
export function joinedParticipantNames(participants: SessionParticipant[]): string {
  return participants.map(p => p.name).join(', ');
}

/**
 * The weekly occurrence dates for a new group series: every date on the start
 * date's weekday from the start through the END OF THE FOLLOWING month. (The
 * backend cron then keeps the series one month ahead each 1st.)
 */
export function buildGroupOccurrenceDates(start: Date): Date[] {
  const weekday = WEEKDAY_BY_JS_DAY[start.getDay()];
  const dates: Date[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endOfNextMonth = new Date(start.getFullYear(), start.getMonth() + 2, 0);
  while (cursor <= endOfNextMonth) {
    if (WEEKDAY_BY_JS_DAY[cursor.getDay()] === weekday) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/**
 * Builds the PENDING GROUP sessions for a set of occurrence dates at an
 * Eastern wall time ('HH:mm' — pinned via the same conversion as the backend
 * cron, so both halves generate identical instants). student_id stays empty;
 * the joined roster names are denormalized into student_name.
 */
export function buildGroupSessions(
  tutor: Contact,
  participants: SessionParticipant[],
  dates: Date[],
  time: string,
  seriesId: string,
  notes: string = '',
): Session[] {
  return dates.map(date => {
    const start = easternSlotToUtc(date.getFullYear(), date.getMonth(), date.getDate(), time);
    const session = new Session();
    session.type = SessionType.GROUP;
    session.tutor_id = tutor.id;
    session.tutor_name = tutor.first_name;
    session.participants = participants;
    session.student_name = joinedParticipantNames(participants);
    session.start_datetime = start.toISOString();
    session.end_datetime = new Date(start.getTime() + GROUP_SESSION_MINUTES * 60000).toISOString();
    session.status = SessionStatus.PENDING;
    session.notes = notes;
    session.series_id = seriesId;
    return session;
  });
}

/**
 * Rebuilds each target occurrence on its own calendar date with a new Eastern
 * wall time, tutor, roster, and notes — the payload list for a "this and
 * future" group-series edit. Attendance is untouched (targets are PENDING).
 */
export function applyGroupSeriesEdit(
  targets: Session[],
  time: string,
  tutor: Contact,
  participants: SessionParticipant[],
  notes: string,
): Session[] {
  return targets.map(target => {
    const date = new Date(target.start_datetime!);
    const start = easternSlotToUtc(date.getFullYear(), date.getMonth(), date.getDate(), time);
    const updated: Session = {...target};
    updated.tutor_id = tutor.id;
    updated.tutor_name = tutor.first_name;
    updated.participants = participants;
    updated.student_name = joinedParticipantNames(participants);
    updated.start_datetime = start.toISOString();
    updated.end_datetime = new Date(start.getTime() + GROUP_SESSION_MINUTES * 60000).toISOString();
    updated.notes = notes;
    return updated;
  });
}
