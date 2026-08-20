import {FormBuilder} from '@angular/forms';
import {minNoteOrder, noteDate, noteDateIso, noteGroup, sortNotes} from './note-forms';
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
