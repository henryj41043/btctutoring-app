import {Session} from '../models/session.model';
import {Student} from '../models/student.model';
import {MakeupCandidate, MakeupSkipReason} from '../models/makeup-set.model';
import {SessionType} from '../enums/session-type.enum';
import {SessionStatus} from '../enums/session-status.enum';
import {combineDateTime} from './session-times';
import {serviceEndInstant} from './makeup';
import {HORIZON_MONTHS_AHEAD} from './pending-package';

/** A set holds at most this many make-ups (the service enforces it too). */
export const MAKEUP_SET_MAX = 60;

/** Weekday choices, Monday first; `day` is Date.getDay(). */
export const REPEAT_WEEKDAYS: readonly {day: number; label: string}[] = [
  {day: 1, label: 'Mon'},
  {day: 2, label: 'Tue'},
  {day: 3, label: 'Wed'},
  {day: 4, label: 'Thu'},
  {day: 5, label: 'Fri'},
  {day: 6, label: 'Sat'},
  {day: 0, label: 'Sun'},
];

/**
 * How far a set may run: through the last day of the calendar look-ahead, or
 * the student's last day of service when that comes first.
 */
export function repeatUntilBounds(now: Date, student: Student | undefined): {min: Date; max: Date} {
  const horizon = new Date(now.getFullYear(), now.getMonth() + HORIZON_MONTHS_AHEAD + 1, 0);
  const end = student ? serviceEndInstant(student) : null;
  const max = end && end.getTime() < horizon.getTime()
    ? new Date(end.getFullYear(), end.getMonth(), end.getDate())
    : horizon;
  return {min: new Date(now.getFullYear(), now.getMonth(), now.getDate()), max};
}

/**
 * One make-up on each chosen weekday, from `first` through `until` (both
 * dates included), at the given times. Dates already past are left out.
 */
export function weeklyOccurrences(
  first: Date,
  weekdays: number[],
  until: Date,
  startTime: Date,
  endTime: Date,
  now: Date = new Date(),
): MakeupCandidate[] {
  const candidates: MakeupCandidate[] = [];
  const last = new Date(until.getFullYear(), until.getMonth(), until.getDate(), 23, 59, 59);
  const day = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  while (day.getTime() <= last.getTime() && candidates.length < MAKEUP_SET_MAX) {
    if (weekdays.includes(day.getDay())) {
      const start = combineDateTime(day, startTime);
      start.setSeconds(0, 0);
      const end = combineDateTime(day, endTime);
      end.setSeconds(0, 0);
      if (start.getTime() > now.getTime() && end.getTime() > start.getTime()) {
        candidates.push({start_datetime: start.toISOString(), end_datetime: end.toISOString()});
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return candidates;
}

/**
 * One make-up of `minutes` straight after each of the tutor's upcoming
 * regular sessions with the student, through `until`.
 */
export function afterSessionOccurrences(
  sessions: Session[],
  tutorId: string,
  minutes: number,
  until: Date,
  now: Date = new Date(),
): MakeupCandidate[] {
  if (!(minutes > 0)) {
    return [];
  }
  const last = new Date(until.getFullYear(), until.getMonth(), until.getDate(), 23, 59, 59);
  return sessions
    .filter(s =>
      s.type === SessionType.TUTORING &&
      s.status === SessionStatus.PENDING &&
      s.tutor_id === tutorId &&
      !!s.end_datetime)
    .map(s => new Date(s.end_datetime as string))
    .filter(end => !isNaN(end.getTime()) && end.getTime() > now.getTime() && end.getTime() <= last.getTime())
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, MAKEUP_SET_MAX)
    .map(end => ({
      start_datetime: end.toISOString(),
      end_datetime: new Date(end.getTime() + minutes * 60000).toISOString(),
    }));
}

/** Why a date was left out, in plain words. */
export function skipReasonText(reason: MakeupSkipReason): string {
  switch (reason) {
    case 'expired':
      return 'minutes expire before this date';
    case 'after_service_end':
      return 'after the last day of service';
    default:
      return 'not enough minutes left';
  }
}
