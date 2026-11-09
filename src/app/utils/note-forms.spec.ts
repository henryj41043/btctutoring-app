import {FormBuilder} from '@angular/forms';
import {mergeNoteDateTime, minNoteOrder, noteDate, noteDateIso, noteFromForm, noteGroup, sortNotes} from './note-forms';
import {Note} from '../models/note.model';

describe('note-forms', () => {
  describe('sortNotes', () => {
    it('sorts by manual order when every note has one', () => {
      const notes = [
        {id: 'b', order: 2, date_time: '2026-08-01T10:00:00Z'},
        {id: 'a', order: 1, date_time: '2020-01-01T10:00:00Z'},
      ] as Note[];
      expect(sortNotes(notes).map(n => n.id)).toEqual(['a', 'b']);
    });

    it('sorts newest-first by date when any order is missing', () => {
      const notes = [
        {id: 'old', date_time: '2020-01-01T10:00:00Z', order: 1},
        {id: 'new', date_time: '2026-08-01T10:00:00Z'},
        {id: 'dateless'},
      ] as Note[];
      expect(sortNotes(notes).map(n => n.id)).toEqual(['new', 'old', 'dateless']);
    });

    it('does not mutate the input and handles empty lists', () => {
      const notes = [{id: 'x', date_time: '2026-08-01T10:00:00Z'}] as Note[];
      const sorted = sortNotes(notes);
      expect(sorted).not.toBe(notes);
      expect(sortNotes([])).toEqual([]);
    });
  });

  describe('noteDate / noteDateIso', () => {
    it('parses a stored string and passes null through', () => {
      expect(noteDate('2026-08-20T10:00:00Z')?.toISOString()).toBe('2026-08-20T10:00:00.000Z');
      expect(noteDate(undefined)).toBeNull();
      expect(noteDate('')).toBeNull();
    });

    it('serializes Dates, keeps strings, and defaults blanks to now', () => {
      expect(noteDateIso(new Date('2026-08-20T10:00:00Z'))).toBe('2026-08-20T10:00:00.000Z');
      expect(noteDateIso('2026-08-20T10:00:00Z')).toBe('2026-08-20T10:00:00Z');
      const fallback = noteDateIso('');
      expect(new Date(fallback).getTime()).toBeGreaterThan(0);
      expect(noteDateIso(null)).toBeTruthy();
    });
  });

  describe('noteGroup', () => {
    it('builds the card group with date as a Date and defaults applied', () => {
      const group = noteGroup(new FormBuilder(), {
        id: 'n-1',
        message: 'hello',
        date_time: '2026-08-20T10:00:00Z',
        author: 'Amy',
      } as Note);
      expect(group.get('id')!.value).toBe('n-1');
      expect(group.get('message')!.value).toBe('hello');
      expect((group.get('date_time')!.value as Date).toISOString()).toBe('2026-08-20T10:00:00.000Z');
      expect(group.get('type')!.value).toBe('');
      expect(group.get('order')!.value).toBeNull();
    });

    it('keeps a changed date when the time is edited afterwards (client 2026-11-09)', () => {
      const group = noteGroup(new FormBuilder(), {id: 'n-1', date_time: new Date(2026, 10, 9, 16, 30).toISOString()} as Note);
      group.get('note_date')!.setValue(new Date(2026, 10, 8));
      expect(group.get('date_time')!.value).toEqual(new Date(2026, 10, 8, 16, 30));
      // The timepicker hands back its own remembered day (the 9th) with the new time.
      group.get('note_time')!.setValue(new Date(2026, 10, 9, 15, 15));
      expect(group.get('date_time')!.value).toEqual(new Date(2026, 10, 8, 15, 15));
    });

    it('a time change alone keeps the date, and each picker starts from the stored value', () => {
      const stored = new Date(2026, 10, 2, 9, 0);
      const group = noteGroup(new FormBuilder(), {id: 'n-1', date_time: stored.toISOString()} as Note);
      expect(group.get('note_date')!.value).toEqual(stored);
      expect(group.get('note_time')!.value).toEqual(stored);
      group.get('note_time')!.setValue(new Date(2030, 0, 1, 13, 45));
      expect(group.get('date_time')!.value).toEqual(new Date(2026, 10, 2, 13, 45));
    });
  });

  describe('mergeNoteDateTime', () => {
    const stored = new Date(2026, 10, 9, 16, 30);
    it('takes the day from the date picker and the clock from the time picker', () => {
      expect(mergeNoteDateTime(new Date(2026, 10, 8), new Date(2026, 10, 9, 10, 5), stored)).toEqual(new Date(2026, 10, 8, 10, 5));
    });
    it('fills a cleared or invalid half from the stored value', () => {
      expect(mergeNoteDateTime(null, new Date(2026, 0, 1, 8, 0), stored)).toEqual(new Date(2026, 10, 9, 8, 0));
      expect(mergeNoteDateTime(new Date(2026, 10, 8), new Date(NaN), stored)).toEqual(new Date(2026, 10, 8, 16, 30));
    });
    it('uses whichever half exists when nothing is stored, else null', () => {
      expect(mergeNoteDateTime(new Date(2026, 10, 8), null, null)).toEqual(new Date(2026, 10, 8));
      expect(mergeNoteDateTime(null, new Date(2026, 10, 8, 7, 0), 'x')).toEqual(new Date(2026, 10, 8, 7, 0));
      expect(mergeNoteDateTime(null, null, null)).toBeNull();
    });
  });

  describe('noteFromForm', () => {
    it('drops the picker-only controls and sends date_time as ISO', () => {
      const note = noteFromForm({
        id: 'n-1',
        message: 'm',
        date_time: new Date('2026-11-08T21:30:00.000Z'),
        note_date: new Date(),
        note_time: new Date(),
      });
      expect(note).toEqual({id: 'n-1', message: 'm', date_time: '2026-11-08T21:30:00.000Z'});
    });
  });

  describe('minNoteOrder', () => {
    it('returns the lowest set order, ignoring null/undefined', () => {
      expect(minNoteOrder([3, null, 1, undefined, 2])).toBe(1);
    });

    it('returns 0 when no orders are set', () => {
      expect(minNoteOrder([null, undefined])).toBe(0);
      expect(minNoteOrder([])).toBe(0);
    });
  });
});
