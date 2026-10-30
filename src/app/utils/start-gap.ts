import {Session} from '../models/session.model';
import {ScheduleSlot} from './proration';
import {SessionType} from '../enums/session-type.enum';
import {WEEKDAY_BY_JS_DAY} from '../enums/weekday.enum';

/**
 * The first scheduled lesson of a student, and the gap before it that billing
 * would charge for.
 *
 * Statements bill a student's schedule SLOTS from the package start date,
 * never the sessions on the calendar. A start date set before the first
 * lesson (a sign-up day, a deleted first session) therefore bills slots that
 * never happened (client 2026-10-30: Charlotte Deming, start Oct 21, first
 * lesson Oct 27, one phantom Thursday billed).
 */

/** 'YYYY-MM-DD' in local time. */
export function localDateKey(date: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 'YYYY-MM-DD' → local Date, or null when malformed. */
export function keyToDate(key: string | undefined | null): Date | null {
  const [y, m, d] = (key ?? '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/**
 * The date key of the student's earliest tutoring session (any status: a
 * cancelled first lesson still marks where the schedule began). Make-ups,
 * trials, admin time and group sessions are not lessons of the schedule.
 */
export function firstLessonKey(sessions: Session[], studentId: string | undefined): string | undefined {
  if (!studentId) return undefined;
  const keys = sessions
    .filter(s => s.student_id === studentId && (s.type ?? SessionType.TUTORING) === SessionType.TUTORING)
    .map(s => (s.start_datetime ? localDateKey(new Date(s.start_datetime)) : ''))
    .filter(k => !!k)
    .sort();
  return keys[0];
}

export interface StartGap {
  /** The package start, 'YYYY-MM-DD'. */
  start: string;
  /** The first lesson, 'YYYY-MM-DD'. */
  first: string;
  /** Schedule slots between the two that billing would charge for. */
  slots: number;
}

/**
 * The slots billing charges before the first lesson: the schedule's weekdays
 * from the start date up to the day before the first lesson. Null when the
 * start is on or after the first lesson, when either date is unknown, or
 * when no slot falls in between (nothing is billed, nothing to warn about).
 */
export function startGap(
  startKey: string | undefined | null,
  firstKey: string | undefined | null,
  schedule: ScheduleSlot[] | undefined,
): StartGap | null {
  const start = (startKey ?? '').slice(0, 10);
  const first = (firstKey ?? '').slice(0, 10);
  if (!start || !first || start >= first || !schedule?.length) return null;
  const weekdays = new Set(schedule.map(s => s.weekday));
  let slots = 0;
  const cursor = keyToDate(start);
  const end = keyToDate(first);
  if (!cursor || !end) return null;
  for (; cursor < end; cursor.setDate(cursor.getDate() + 1)) {
    if (weekdays.has(WEEKDAY_BY_JS_DAY[cursor.getDay()])) slots += 1;
  }
  return slots > 0 ? {start, first, slots} : null;
}

/** e.g. 'Oct 27' or 'Oct 27, 2026' with the year. */
export function shortDateLabel(key: string, withYear: boolean = false): string {
  const date = keyToDate(key);
  return date
    ? date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', ...(withYear ? {year: 'numeric'} : {})})
    : key;
}

/** The warning text for a gap, e.g. "Billing starts Oct 21 but the first lesson is Oct 27: 1 scheduled slot will be billed with no session. Move the start date to Oct 27." */
export function startGapMessage(gap: StartGap): string {
  const first = shortDateLabel(gap.first);
  return `Billing starts ${shortDateLabel(gap.start)} but the first lesson is ${first}: ` +
    `${gap.slots} scheduled slot${gap.slots === 1 ? '' : 's'} will be billed with no session. ` +
    `Move the start date to ${first}.`;
}
