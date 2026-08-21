import {
  applyGroupSeriesEdit,
  buildGroupOccurrenceDates,
  buildGroupSessions,
  GROUP_SESSION_MINUTES,
  joinedParticipantNames,
} from './group-session';
import {Contact} from '../models/contact.model';
import {Session, SessionParticipant} from '../models/session.model';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';

const tutor: Contact = {id: 't-1', first_name: 'Tess'} as Contact;
const roster: SessionParticipant[] = [
  {id: 's-a', name: 'Ava'},
  {id: 's-b', name: 'Ben'},
];

describe('joinedParticipantNames', () => {
  it('joins roster names for display', () => {
    expect(joinedParticipantNames(roster)).toBe('Ava, Ben');
    expect(joinedParticipantNames([])).toBe('');
  });
});

describe('buildGroupOccurrenceDates', () => {
  it('generates the start weekday through the END of the following month', () => {
    // Wed Aug 5 2026 → Aug 5,12,19,26 + Sep 2,9,16,23,30 = 9 Wednesdays.
    const dates = buildGroupOccurrenceDates(new Date(2026, 7, 5));
    expect(dates).toHaveLength(9);
    expect(dates[0].toDateString()).toBe(new Date(2026, 7, 5).toDateString());
    expect(dates.at(-1)!.toDateString()).toBe(new Date(2026, 8, 30).toDateString());
    expect(dates.every(d => d.getDay() === 3)).toBe(true);
  });

  it('starts mid-month from the given date, not the month start', () => {
    // Wed Aug 19 2026 → Aug 19,26 + all 5 September Wednesdays.
    const dates = buildGroupOccurrenceDates(new Date(2026, 7, 19));
    expect(dates).toHaveLength(7);
    expect(dates[0].getDate()).toBe(19);
  });

  it('crosses a year boundary (December start)', () => {
    // Wed Dec 2 2026 → Dec 2,9,16,23,30 + Jan 2027 6,13,20,27 = 9.
    const dates = buildGroupOccurrenceDates(new Date(2026, 11, 2));
    expect(dates).toHaveLength(9);
    expect(dates.at(-1)!.getFullYear()).toBe(2027);
    expect(dates.at(-1)!.getDate()).toBe(27);
  });
});

describe('buildGroupSessions', () => {
  it('builds Eastern-pinned 45-minute PENDING GROUP sessions with the roster', () => {
    const sessions = buildGroupSessions(
      tutor, roster, [new Date(2026, 7, 5)], '17:00', 'series-1', 'weekly group',
    );
    expect(sessions).toHaveLength(1);
    const s = sessions[0];
    expect(s.type).toBe(SessionType.GROUP);
    // 5:00 PM EDT = 21:00Z; always exactly 45 minutes.
    expect(s.start_datetime).toBe('2026-08-05T21:00:00.000Z');
    expect(s.end_datetime).toBe('2026-08-05T21:45:00.000Z');
    expect(s.status).toBe(SessionStatus.PENDING);
    expect(s.tutor_id).toBe('t-1');
    expect(s.tutor_name).toBe('Tess');
    expect(s.participants).toEqual(roster);
    expect(s.student_name).toBe('Ava, Ben');
    expect(s.student_id).toBeUndefined();
    expect(s.series_id).toBe('series-1');
    expect(s.notes).toBe('weekly group');
  });

  it('pins the same wall time across a DST boundary (EST dates)', () => {
    const sessions = buildGroupSessions(
      tutor, roster, [new Date(2026, 10, 4)], '17:00', 'series-1',
    );
    // 5:00 PM EST = 22:00Z.
    expect(sessions[0].start_datetime).toBe('2026-11-04T22:00:00.000Z');
  });

  it('defaults notes to empty', () => {
    const sessions = buildGroupSessions(tutor, roster, [new Date(2026, 7, 5)], '17:00', 'x');
    expect(sessions[0].notes).toBe('');
  });
});

describe('applyGroupSeriesEdit', () => {
  const target = (over: Partial<Session> = {}): Session => ({
    id: 'g-1',
    type: SessionType.GROUP,
    start_datetime: '2026-08-05T21:00:00.000Z',
    end_datetime: '2026-08-05T21:45:00.000Z',
    status: SessionStatus.PENDING,
    tutor_id: 't-1',
    tutor_name: 'Tess',
    participants: [{id: 's-a', name: 'Ava'}],
    student_name: 'Ava',
    series_id: 'series-1',
    notes: 'old',
    ...over,
  });

  it('retimes each occurrence on its own date with the new roster and tutor', () => {
    const newTutor: Contact = {id: 't-2', first_name: 'Toby'} as Contact;
    const updated = applyGroupSeriesEdit(
      [target(), target({id: 'g-2', start_datetime: '2026-08-12T21:00:00.000Z'})],
      '18:30',
      newTutor,
      roster,
      'new notes',
    );
    expect(updated.map(u => u.start_datetime)).toEqual([
      '2026-08-05T22:30:00.000Z', // 6:30 PM EDT
      '2026-08-12T22:30:00.000Z',
    ]);
    expect(updated[0].end_datetime).toBe('2026-08-05T23:15:00.000Z');
    expect(updated[0].tutor_id).toBe('t-2');
    expect(updated[0].tutor_name).toBe('Toby');
    expect(updated[0].participants).toEqual(roster);
    expect(updated[0].student_name).toBe('Ava, Ben');
    expect(updated[0].notes).toBe('new notes');
    // Occurrence identity and attendance stay untouched.
    expect(updated[0].id).toBe('g-1');
    expect(updated[0].status).toBe(SessionStatus.PENDING);
    expect(updated[0].series_id).toBe('series-1');
  });

  it('uses the constant length for the recomputed end', () => {
    const [u] = applyGroupSeriesEdit([target()], '17:00', tutor, roster, '');
    const dur = (new Date(u.end_datetime!).getTime() - new Date(u.start_datetime!).getTime()) / 60000;
    expect(dur).toBe(GROUP_SESSION_MINUTES);
  });
});
