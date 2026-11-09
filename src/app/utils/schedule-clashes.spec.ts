import {clashMessage, clashSummary, ClashSlot, scheduleClashes} from './schedule-clashes';
import {Session} from '../models/session.model';
import {Weekday} from '../enums/weekday.enum';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';

// 2026-11-16 is a Monday; Eastern is UTC-5 in November.
const monday10: ClashSlot = {weekday: Weekday.MONDAY, start_time: '10:00', end_time: '11:00', tutor_id: 't-1'};

const booked = (over: Partial<Session> = {}): Session =>
  ({
    id: 'b-1',
    type: SessionType.TUTORING,
    status: SessionStatus.PENDING,
    tutor_id: 't-1',
    tutor_name: 'Emily',
    student_id: 's-other',
    student_name: 'Graham',
    start_datetime: '2026-11-16T15:30:00.000Z',
    end_datetime: '2026-11-16T16:15:00.000Z',
    ...over,
  }) as Session;

const scope = (over: Partial<{from: Date; to: Date; ignoreIds: Set<string>}> = {}) => ({
  studentId: 's-1',
  from: new Date('2026-11-09T05:00:00.000Z'),
  ignoreIds: new Set<string>(),
  ...over,
});

describe('scheduleClashes', () => {
  it("flags the tutor's other student booked inside a weekly slot", () => {
    expect(scheduleClashes([monday10], [], [booked()], scope())).toEqual([
      'Emily already has a session with Graham on Mon, Nov 16, 10:30 AM.',
    ]);
  });

  it('allows back-to-back sessions on either side', () => {
    const before = booked({start_datetime: '2026-11-16T14:15:00.000Z', end_datetime: '2026-11-16T15:00:00.000Z'});
    const after = booked({id: 'b-2', start_datetime: '2026-11-16T16:00:00.000Z', end_datetime: '2026-11-16T16:45:00.000Z'});
    expect(scheduleClashes([monday10], [], [before, after], scope())).toEqual([]);
  });

  it('ignores other weekdays, other tutors, cancelled and replaced sessions', () => {
    const list = [
      booked({id: 'tue', start_datetime: '2026-11-17T15:00:00.000Z', end_datetime: '2026-11-17T16:00:00.000Z'}),
      booked({id: 'other-tutor', tutor_id: 't-2'}),
      booked({id: 'cancelled', status: SessionStatus.CANCELLED}),
      booked({id: 'replaced', student_id: 's-1'}),
    ];
    expect(scheduleClashes([monday10], [], list, scope({ignoreIds: new Set(['replaced'])}))).toEqual([]);
  });

  it("flags the student's own session with another tutor", () => {
    const own = booked({tutor_id: 't-9', tutor_name: 'Mo', student_id: 's-1', student_name: 'Pat', type: SessionType.MAKE_UP});
    expect(scheduleClashes([monday10], [], [own], scope())).toEqual([
      'Pat already has a make-up with Mo on Mon, Nov 16, 10:30 AM.',
    ]);
  });

  it('counts a group session the student joins', () => {
    const group = booked({
      tutor_id: 't-9',
      tutor_name: 'Mo',
      type: SessionType.GROUP,
      student_id: undefined,
      student_name: undefined,
      participants: [{id: 's-1', name: 'Pat'}],
    });
    expect(scheduleClashes([monday10], [], [group], scope())).toEqual([
      'This student already has a BTC & Me session with Mo on Mon, Nov 16, 10:30 AM.',
    ]);
  });

  it('keeps to the window: ended before it or starting at its end', () => {
    const early = booked({id: 'early', start_datetime: '2026-11-02T15:00:00.000Z', end_datetime: '2026-11-02T16:00:00.000Z'});
    const late = booked({id: 'late'});
    expect(scheduleClashes([monday10], [], [early, late], scope({to: new Date('2026-11-16T15:30:00.000Z')}))).toEqual([]);
  });

  it('checks the one-off start-week sessions by their exact time', () => {
    const oneOff = {
      tutor_id: 't-1',
      start_datetime: '2026-11-18T20:00:00.000Z',
      end_datetime: '2026-11-18T20:45:00.000Z',
    } as Session;
    const clash = booked({start_datetime: '2026-11-18T20:30:00.000Z', end_datetime: '2026-11-18T21:00:00.000Z'});
    const free = booked({id: 'b-2', tutor_id: 't-2'});
    expect(scheduleClashes([], [oneOff], [clash, free], scope())).toHaveLength(1);
    expect(scheduleClashes([], [{...oneOff, tutor_id: undefined} as Session], [clash], scope())).toEqual([]);
  });

  it('reports each booked session once, in time order, skipping incomplete rows', () => {
    const later = booked({id: 'b-2', start_datetime: '2026-11-23T15:00:00.000Z', end_datetime: '2026-11-23T16:00:00.000Z'});
    const list = [later, booked(), booked(), booked({id: 'no-end', end_datetime: undefined})];
    const out = scheduleClashes([monday10], [], list, scope());
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('Nov 16');
    expect(out[1]).toContain('Nov 23');
  });

  it('a session without an id is still checked', () => {
    expect(scheduleClashes([monday10], [], [booked({id: undefined})], scope())).toHaveLength(1);
  });
});

describe('clashMessage', () => {
  it('names Admin Time and trials, and falls back when names are missing', () => {
    expect(clashMessage(booked({type: SessionType.ADMIN, student_name: undefined, tutor_name: undefined}), 'tutor'))
      .toBe('This tutor already has Admin Time on Mon, Nov 16, 10:30 AM.');
    expect(clashMessage(booked({type: SessionType.TRIAL}), 'tutor')).toContain('a trial with Graham');
    expect(clashMessage(booked({type: SessionType.CUSTOM_TRIAL, tutor_name: ''}), 'student'))
      .toBe('Graham already has a trial on Mon, Nov 16, 10:30 AM.');
    expect(clashMessage(booked({type: SessionType.GROUP}), 'tutor'))
      .toBe('Emily already has a BTC & Me session on Mon, Nov 16, 10:30 AM.');
    expect(clashMessage(booked({type: undefined}), 'tutor')).toContain('a session with Graham');
  });
});

describe('clashSummary', () => {
  it('returns one clash as is and counts several, showing three', () => {
    expect(clashSummary(['A.'])).toBe('A.');
    expect(clashSummary(['A.', 'B.'])).toBe('2 booked sessions overlap this schedule. A. B.');
    expect(clashSummary(['A.', 'B.', 'C.', 'D.', 'E.'])).toBe(
      '5 booked sessions overlap this schedule. A. B. C. (and 2 more)',
    );
  });
});
