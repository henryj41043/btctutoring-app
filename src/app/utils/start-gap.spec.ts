import {firstLessonKey, keyToDate, localDateKey, shortDateLabel, startGap, startGapMessage} from './start-gap';
import {Session} from '../models/session.model';
import {SessionType} from '../enums/session-type.enum';
import {SessionStatus} from '../enums/session-status.enum';
import {Weekday} from '../enums/weekday.enum';
import {ScheduleSlot} from '../utils/proration';

const tueThu: ScheduleSlot[] = [
  {weekday: Weekday.TUESDAY, start_time: '13:30', end_time: '14:00'},
  {weekday: Weekday.THURSDAY, start_time: '13:30', end_time: '14:00'},
];

const session = (over: Partial<Session>): Session =>
  ({student_id: 's-1', type: SessionType.TUTORING, status: SessionStatus.PENDING, ...over}) as Session;

describe('start-gap', () => {
  describe('firstLessonKey', () => {
    it('is the earliest tutoring session of the student, whatever its status', () => {
      const sessions = [
        session({start_datetime: '2026-10-29T17:30:00', status: SessionStatus.PENDING}),
        session({start_datetime: '2026-10-27T17:30:00', status: SessionStatus.CANCELLED}),
        session({start_datetime: '2026-10-15T17:00:00', type: SessionType.TRIAL}),
        session({start_datetime: '2026-10-20T17:00:00', type: SessionType.MAKE_UP}),
        session({start_datetime: '2026-10-01T17:00:00', student_id: 's-other'}),
        session({start_datetime: undefined}),
      ];
      expect(firstLessonKey(sessions, 's-1')).toBe('2026-10-27');
    });

    it('treats a session without a type as a lesson (pre-type records)', () => {
      expect(firstLessonKey([session({start_datetime: '2026-10-27T17:30:00', type: undefined})], 's-1'))
        .toBe('2026-10-27');
    });

    it('is undefined with no student id or no lessons', () => {
      expect(firstLessonKey([session({start_datetime: '2026-10-27T17:30:00'})], undefined)).toBeUndefined();
      expect(firstLessonKey([], 's-1')).toBeUndefined();
    });
  });

  describe('startGap', () => {
    it('counts the schedule slots between the start and the first lesson (Charlotte: one phantom Thursday)', () => {
      expect(startGap('2026-10-21T04:00:00.000Z', '2026-10-27', tueThu)).toEqual({
        start: '2026-10-21', first: '2026-10-27', slots: 1,
      });
    });

    it('counts several slots across weeks', () => {
      expect(startGap('2026-10-13', '2026-10-27', tueThu)?.slots).toBe(4);
    });

    it('is null when the start is on or after the first lesson', () => {
      expect(startGap('2026-10-27', '2026-10-27', tueThu)).toBeNull();
      expect(startGap('2026-10-28', '2026-10-27', tueThu)).toBeNull();
    });

    it('is null when no slot falls in the gap (start the day after a lesson day)', () => {
      expect(startGap('2026-10-23', '2026-10-27', tueThu)).toBeNull();
    });

    it('is null without both dates or without a schedule', () => {
      expect(startGap(undefined, '2026-10-27', tueThu)).toBeNull();
      expect(startGap('2026-10-21', undefined, tueThu)).toBeNull();
      expect(startGap('2026-10-21', '2026-10-27', [])).toBeNull();
      expect(startGap('2026-10-21', '2026-10-27', undefined)).toBeNull();
      expect(startGap('nonsense', '2026-10-27', tueThu)).toBeNull();
      expect(startGap('2026-10-21', 'later', tueThu)).toBeNull();
    });
  });

  it('startGapMessage reads naturally for one and for several slots', () => {
    expect(startGapMessage({start: '2026-10-21', first: '2026-10-27', slots: 1})).toBe(
      'Billing starts Oct 21 but the first lesson is Oct 27: 1 scheduled slot will be billed with no session. Move the start date to Oct 27.',
    );
    expect(startGapMessage({start: '2026-10-13', first: '2026-10-27', slots: 4})).toContain('4 scheduled slots will be billed');
  });

  it('date helpers round-trip local keys and label them', () => {
    expect(localDateKey(new Date(2026, 9, 5))).toBe('2026-10-05');
    expect(keyToDate('2026-10-05')?.getDate()).toBe(5);
    expect(keyToDate('')).toBeNull();
    expect(shortDateLabel('2026-10-05')).toBe('Oct 5');
    expect(shortDateLabel('2026-10-05', true)).toBe('Oct 5, 2026');
    expect(shortDateLabel('bad')).toBe('bad');
  });
});
