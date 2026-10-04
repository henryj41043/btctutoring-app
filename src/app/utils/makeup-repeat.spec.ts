import {
  afterSessionOccurrences,
  MAKEUP_SET_MAX,
  REPEAT_WEEKDAYS,
  repeatUntilBounds,
  skipReasonText,
  weeklyOccurrences,
} from './makeup-repeat';
import {Session} from '../models/session.model';
import {Student} from '../models/student.model';
import {SessionType} from '../enums/session-type.enum';
import {SessionStatus} from '../enums/session-status.enum';

const NOW = new Date(2026, 9, 5, 9, 0); // Mon Oct 5 2026, 9:00
const at = (hour: number, minute = 0) => new Date(2026, 0, 1, hour, minute);
const local = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

describe('makeup-repeat', () => {
  it('lists the weekdays Monday first and caps a set at 60', () => {
    expect(REPEAT_WEEKDAYS.map(w => w.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(REPEAT_WEEKDAYS.map(w => w.day)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(MAKEUP_SET_MAX).toBe(60);
  });

  describe('repeatUntilBounds', () => {
    it('runs from today through the last day of the three-month look-ahead', () => {
      const bounds = repeatUntilBounds(NOW, undefined);
      expect(bounds.min).toEqual(new Date(2026, 9, 5));
      expect(bounds.max).toEqual(new Date(2027, 0, 31));
    });

    it('stops at the last day of service when that comes first', () => {
      expect(repeatUntilBounds(NOW, {service_end_date: '2026-11-15'} as Student).max)
        .toEqual(new Date(2026, 10, 15));
    });

    it('keeps the look-ahead when the service ends later, or has no end', () => {
      expect(repeatUntilBounds(NOW, {service_end_date: '2027-06-30'} as Student).max)
        .toEqual(new Date(2027, 0, 31));
      expect(repeatUntilBounds(NOW, {} as Student).max).toEqual(new Date(2027, 0, 31));
    });
  });

  describe('weeklyOccurrences', () => {
    it('proposes one make-up on each ticked weekday through the until date', () => {
      const result = weeklyOccurrences(
        new Date(2026, 9, 5), [1, 3], new Date(2026, 9, 14), at(16, 0), at(16, 15), NOW);
      expect(result.map(c => local(c.start_datetime))).toEqual(['10/5 16:00', '10/7 16:00', '10/12 16:00', '10/14 16:00']);
      expect(result.map(c => local(c.end_datetime))).toEqual(['10/5 16:15', '10/7 16:15', '10/12 16:15', '10/14 16:15']);
    });

    it('includes the until date itself and starts no earlier than the first date', () => {
      const result = weeklyOccurrences(
        new Date(2026, 9, 7), [1, 3], new Date(2026, 9, 12), at(16, 0), at(16, 15), NOW);
      expect(result.map(c => local(c.start_datetime))).toEqual(['10/7 16:00', '10/12 16:00']);
    });

    it('leaves out a time that has already passed today', () => {
      const result = weeklyOccurrences(
        new Date(2026, 9, 5), [1], new Date(2026, 9, 12), at(8, 0), at(8, 15), NOW);
      expect(result.map(c => local(c.start_datetime))).toEqual(['10/12 8:00']);
      // Exactly now is not in the future either.
      expect(weeklyOccurrences(new Date(2026, 9, 5), [1], new Date(2026, 9, 5), at(9, 0), at(9, 15), NOW)).toEqual([]);
    });

    it('proposes nothing without weekdays, or when the end is not after the start', () => {
      expect(weeklyOccurrences(new Date(2026, 9, 5), [], new Date(2026, 9, 30), at(16), at(17), NOW)).toEqual([]);
      expect(weeklyOccurrences(new Date(2026, 9, 5), [1], new Date(2026, 9, 30), at(16), at(16), NOW)).toEqual([]);
      expect(weeklyOccurrences(new Date(2026, 9, 5), [1], new Date(2026, 9, 30), at(17), at(16), NOW)).toEqual([]);
    });

    it('proposes nothing when until is before the first date', () => {
      expect(weeklyOccurrences(new Date(2026, 9, 12), [1], new Date(2026, 9, 5), at(16), at(17), NOW)).toEqual([]);
    });

    it('stops at 60', () => {
      const every = [0, 1, 2, 3, 4, 5, 6];
      const result = weeklyOccurrences(new Date(2026, 9, 6), every, new Date(2027, 0, 31), at(16), at(17), NOW);
      expect(result).toHaveLength(60);
    });

    it('zeroes the seconds so repeated previews send the same times', () => {
      const result = weeklyOccurrences(
        new Date(2026, 9, 6), [2], new Date(2026, 9, 6), new Date(2026, 0, 1, 16, 0, 42, 7), new Date(2026, 0, 1, 16, 15, 42, 7), NOW);
      expect(new Date(result[0].start_datetime).getSeconds()).toBe(0);
      expect(new Date(result[0].end_datetime).getMilliseconds()).toBe(0);
    });

    it('uses the current time by default', () => {
      const tomorrow = new Date(Date.now() + 86400000);
      const result = weeklyOccurrences(tomorrow, [tomorrow.getDay()], tomorrow, at(12), at(13));
      expect(result).toHaveLength(1);
    });
  });

  describe('afterSessionOccurrences', () => {
    const regular = (day: number, over: Partial<Session> = {}): Session => ({
      type: SessionType.TUTORING,
      status: SessionStatus.PENDING,
      tutor_id: 't-1',
      start_datetime: new Date(2026, 9, day, 15, 0).toISOString(),
      end_datetime: new Date(2026, 9, day, 15, 45).toISOString(),
      ...over,
    } as Session);

    it('adds the minutes straight after each upcoming regular session, in date order', () => {
      const result = afterSessionOccurrences(
        [regular(14), regular(7)], 't-1', 15, new Date(2026, 9, 31), NOW);
      expect(result.map(c => local(c.start_datetime))).toEqual(['10/7 15:45', '10/14 15:45']);
      expect(result.map(c => local(c.end_datetime))).toEqual(['10/7 16:00', '10/14 16:00']);
    });

    it('ignores other types, finished sessions, other tutors and sessions without an end', () => {
      const result = afterSessionOccurrences([
        regular(7, {type: SessionType.MAKE_UP}),
        regular(8, {status: SessionStatus.COMPLETED}),
        regular(9, {tutor_id: 't-2'}),
        regular(10, {end_datetime: undefined}),
        regular(11, {end_datetime: 'not a date'}),
        regular(12),
      ], 't-1', 15, new Date(2026, 9, 31), NOW);
      expect(result.map(c => local(c.start_datetime))).toEqual(['10/12 15:45']);
    });

    it('ignores sessions that already ended and those after the until date', () => {
      const result = afterSessionOccurrences([
        regular(5, {end_datetime: new Date(2026, 9, 5, 8, 0).toISOString()}),
        regular(5, {end_datetime: NOW.toISOString()}),
        regular(20),
        regular(21),
      ], 't-1', 15, new Date(2026, 9, 20), NOW);
      expect(result.map(c => local(c.start_datetime))).toEqual(['10/20 15:45']);
    });

    it.each([0, -5, NaN])('proposes nothing for %p minutes', minutes => {
      expect(afterSessionOccurrences([regular(7)], 't-1', minutes, new Date(2026, 9, 31), NOW)).toEqual([]);
    });

    it('stops at 60 and uses the current time by default', () => {
      const soon = Date.now() + 3600000;
      const many = Array.from({length: 70}, (_, i) => regular(1, {
        end_datetime: new Date(soon + i * 60000).toISOString(),
      }));
      expect(afterSessionOccurrences(many, 't-1', 15, new Date(Date.now() + 5 * 86400000))).toHaveLength(60);
    });
  });

  it('explains each skip reason in plain words', () => {
    expect(skipReasonText('expired')).toBe('minutes expire before this date');
    expect(skipReasonText('after_service_end')).toBe('after the last day of service');
    expect(skipReasonText('insufficient')).toBe('not enough minutes left');
  });
});
