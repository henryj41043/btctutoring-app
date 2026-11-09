import {Session} from '../models/session.model';
import {ScheduleSlot} from './proration';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';
import {WEEKDAY_BY_JS_DAY} from '../enums/weekday.enum';
import {easternDateOf, easternSlotToUtc} from './eastern-time';

/**
 * Pre-check for a weekly schedule (mirror of the service's
 * session-conflicts.ts rule): a new slot clashes with a booked session when
 * their times intersect and they share the tutor or the student. Back-to-back
 * is fine and a Cancelled session frees its time. The service refuses the
 * same clash with a 409; checking first lets the schedule dialog stop BEFORE
 * it deletes the sessions it is about to replace.
 */

/** A weekly slot with the tutor who teaches it. */
export interface ClashSlot extends ScheduleSlot {
  tutor_id: string;
}

/** What the check covers: whose schedule, which dates, and which sessions it replaces. */
export interface ClashScope {
  studentId: string;
  from: Date;
  to?: Date;
  /** Sessions the save deletes and regenerates, so they cannot clash. */
  ignoreIds: Set<string>;
}

const SLOT_LABEL = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const TYPE_PHRASE: Record<string, string> = {
  [SessionType.MAKE_UP]: 'a make-up',
  [SessionType.ADMIN]: 'Admin Time',
  [SessionType.TRIAL]: 'a trial',
  [SessionType.CUSTOM_TRIAL]: 'a trial',
  [SessionType.GROUP]: 'a BTC & Me session',
};

/** The student ids a booked session holds (a group's participants count). */
function studentIdsOf(session: Session): string[] {
  const ids = (session.participants ?? []).map(p => p.id);
  return session.student_id ? [session.student_id, ...ids] : ids;
}

/** "Emily already has a make-up with Graham on Thu, Nov 13, 10:00 AM." */
export function clashMessage(booked: Session, shared: 'tutor' | 'student'): string {
  const what = TYPE_PHRASE[booked.type ?? ''] ?? 'a session';
  const when = SLOT_LABEL.format(new Date(booked.start_datetime!));
  if (shared === 'tutor') {
    const withWhom = booked.type !== SessionType.GROUP && booked.student_name ? ` with ${booked.student_name}` : '';
    return `${booked.tutor_name || 'This tutor'} already has ${what}${withWhom} on ${when}.`;
  }
  const withWhom = booked.tutor_name ? ` with ${booked.tutor_name}` : '';
  return `${booked.student_name || 'This student'} already has ${what}${withWhom} on ${when}.`;
}

/** True when [aStart, aEnd) and [bStart, bEnd) intersect. */
function intersects(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** How a booked session clashes with an interval for a tutor, or null. */
function sharedWith(booked: Session, tutorId: string, studentId: string): 'tutor' | 'student' | null {
  if (booked.tutor_id && booked.tutor_id === tutorId) return 'tutor';
  return studentIdsOf(booked).includes(studentId) ? 'student' : null;
}

/**
 * The clash messages for a schedule: every booked session in scope that
 * overlaps a weekly slot on its own (Eastern) date, or one of the one-off
 * sessions. One message per booked session, in time order.
 */
export function scheduleClashes(
  slots: ClashSlot[],
  oneOffs: Session[],
  booked: Session[],
  scope: ClashScope,
): string[] {
  const seen = new Set<string>();
  const hits: {at: number; message: string}[] = [];
  for (const session of booked) {
    if (!session.start_datetime || !session.end_datetime) continue;
    if (session.status === SessionStatus.CANCELLED) continue;
    if (session.id && (scope.ignoreIds.has(session.id) || seen.has(session.id))) continue;
    const start = Date.parse(session.start_datetime);
    const end = Date.parse(session.end_datetime);
    if (end <= scope.from.getTime() || (scope.to && start >= scope.to.getTime())) continue;
    const message = clashOf(session, start, end, slots, oneOffs, scope.studentId);
    if (message) {
      if (session.id) seen.add(session.id);
      hits.push({at: start, message});
    }
  }
  return hits.sort((a, b) => a.at - b.at).map(h => h.message);
}

function clashOf(
  session: Session,
  start: number,
  end: number,
  slots: ClashSlot[],
  oneOffs: Session[],
  studentId: string,
): string | null {
  const date = easternDateOf(new Date(start));
  const weekday = WEEKDAY_BY_JS_DAY[new Date(Date.UTC(date.year, date.month, date.day)).getUTCDay()];
  for (const slot of slots) {
    if (slot.weekday !== weekday) continue;
    const shared = sharedWith(session, slot.tutor_id, studentId);
    if (!shared) continue;
    const slotStart = easternSlotToUtc(date.year, date.month, date.day, slot.start_time).getTime();
    const slotEnd = easternSlotToUtc(date.year, date.month, date.day, slot.end_time).getTime();
    if (intersects(start, end, slotStart, slotEnd)) return clashMessage(session, shared);
  }
  for (const oneOff of oneOffs) {
    const shared = sharedWith(session, oneOff.tutor_id ?? '', studentId);
    if (!shared) continue;
    if (intersects(start, end, Date.parse(oneOff.start_datetime!), Date.parse(oneOff.end_datetime!))) {
      return clashMessage(session, shared);
    }
  }
  return null;
}

/** One line for the dialog: the clash itself, or a count and the first three. */
export function clashSummary(messages: string[]): string {
  if (messages.length === 1) return messages[0];
  const more = messages.length > 3 ? ` (and ${messages.length - 3} more)` : '';
  return `${messages.length} booked sessions overlap this schedule. ${messages.slice(0, 3).join(' ')}${more}`;
}
