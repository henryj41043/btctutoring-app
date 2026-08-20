import {
  combineDateTime,
  durationMinutes,
  durationOf,
  futureSeriesTargets,
  retimeSeriesOccurrences,
  scheduleFieldsUnchanged,
} from './session-times';
import {Session} from '../models/session.model';
import {SessionStatus} from '../enums/session-status.enum';
import {Contact} from '../models/contact.model';

const at = (iso: string): Date => new Date(iso);

describe('session-times', () => {
  describe('combineDateTime', () => {
    it('takes the date from one value and the wall time from the other', () => {
      const combined = combineDateTime(at('2026-08-20T00:00:00'), at('1970-01-01T14:30:00'));
      expect(combined.getFullYear()).toBe(2026);
      expect(combined.getMonth()).toBe(7);
      expect(combined.getDate()).toBe(20);
      expect(combined.getHours()).toBe(14);
      expect(combined.getMinutes()).toBe(30);
    });

    it('does not mutate the source date', () => {
      const date = at('2026-08-20T09:00:00');
      combineDateTime(date, at('1970-01-01T14:30:00'));
      expect(date.getHours()).toBe(9);
    });
  });

  describe('durationMinutes', () => {
    it('returns whole minutes between two times', () => {
      expect(durationMinutes(at('2026-08-20T10:00:00'), at('2026-08-20T11:15:00'))).toBe(75);
    });

    it('returns 0 when either bound is missing', () => {
      expect(durationMinutes(undefined, at('2026-08-20T11:00:00'))).toBe(0);
      expect(durationMinutes(at('2026-08-20T10:00:00'), undefined)).toBe(0);
    });
  });

  describe('durationOf', () => {
    it('measures a persisted session', () => {
      expect(durationOf({
        start_datetime: '2026-08-20T10:00:00.000Z',
        end_datetime: '2026-08-20T10:45:00.000Z',
      } as Session)).toBe(45);
    });

    it('returns 0 when either datetime is missing', () => {
      expect(durationOf({start_datetime: '2026-08-20T10:00:00.000Z'} as Session)).toBe(0);
      expect(durationOf({end_datetime: '2026-08-20T10:45:00.000Z'} as Session)).toBe(0);
    });
  });

  describe('scheduleFieldsUnchanged', () => {
    const date = at('2026-08-20T00:00:00');
    const start = at('1970-01-01T10:00:00');
    const end = at('1970-01-01T11:00:00');
    const original = {
      start_datetime: combineDateTime(date, start).toISOString(),
      end_datetime: combineDateTime(date, end).toISOString(),
      tutor_id: 't-1',
      student_id: 's-1',
    } as Session;

    it('is true when every schedule-relevant field round-trips', () => {
      expect(scheduleFieldsUnchanged(original, date, start, end, 't-1', 's-1')).toBe(true);
    });

    it('is false when any field differs', () => {
      expect(scheduleFieldsUnchanged(original, date, start, at('1970-01-01T11:30:00'), 't-1', 's-1')).toBe(false);
      expect(scheduleFieldsUnchanged(original, at('2026-08-21T00:00:00'), start, end, 't-1', 's-1')).toBe(false);
      expect(scheduleFieldsUnchanged(original, date, start, end, 't-2', 's-1')).toBe(false);
      expect(scheduleFieldsUnchanged(original, date, start, end, 't-1', 's-2')).toBe(false);
    });

    it('is false when the entered range is incomplete', () => {
      expect(scheduleFieldsUnchanged(original, undefined, start, end, 't-1', 's-1')).toBe(false);
      expect(scheduleFieldsUnchanged(original, date, undefined, end, 't-1', 's-1')).toBe(false);
      expect(scheduleFieldsUnchanged(original, date, start, undefined, 't-1', 's-1')).toBe(false);
    });
  });

  describe('futureSeriesTargets', () => {
    const occurrence = (id: string, start: string, status: SessionStatus): Session =>
      ({id, start_datetime: start, status} as Session);
    const current = occurrence('cur', '2026-08-20T10:00:00.000Z', SessionStatus.PENDING);

    it('keeps only PENDING occurrences at or after the current one', () => {
      const sessions = [
        occurrence('past', '2026-08-13T10:00:00.000Z', SessionStatus.PENDING),
        current,
        occurrence('done', '2026-08-27T10:00:00.000Z', SessionStatus.COMPLETED),
        occurrence('next', '2026-09-03T10:00:00.000Z', SessionStatus.PENDING),
      ];
      expect(futureSeriesTargets(sessions, current).map(s => s.id)).toEqual(['cur', 'next']);
    });

    it('returns empty when nothing qualifies', () => {
      expect(futureSeriesTargets([], current)).toEqual([]);
    });
  });

  describe('retimeSeriesOccurrences', () => {
    it('keeps each occurrence on its own date with the new time range, tutor, and notes', () => {
      const targets = [
        {id: 'a', start_datetime: at('2026-08-20T10:00:00').toISOString(), status: SessionStatus.PENDING},
        {id: 'b', start_datetime: at('2026-08-27T10:00:00').toISOString(), status: SessionStatus.PENDING},
      ] as Session[];
      const tutor = {id: 't-9', first_name: 'Tess'} as Contact;
      const updates = retimeSeriesOccurrences(
        targets, at('1970-01-01T13:00:00'), at('1970-01-01T14:30:00'), tutor, 'moved',
      );
      expect(updates).toHaveLength(2);
      for (const [i, upd] of updates.entries()) {
        const start = new Date(upd.start_datetime!);
        const end = new Date(upd.end_datetime!);
        expect(start.getDate()).toBe(new Date(targets[i].start_datetime!).getDate());
        expect(start.getHours()).toBe(13);
        expect(start.getMinutes()).toBe(0);
        expect(end.getHours()).toBe(14);
        expect(end.getMinutes()).toBe(30);
        expect(upd.tutor_id).toBe('t-9');
        expect(upd.tutor_name).toBe('Tess');
        expect(upd.notes).toBe('moved');
      }
      // The originals are untouched (copies only).
      expect(targets[0].tutor_id).toBeUndefined();
    });
  });
});
