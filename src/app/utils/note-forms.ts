import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {Note} from '../models/note.model';
import {combineDateTime} from './session-times';

/** Manual order when every note has one; otherwise newest-first by date. */
export function sortNotes(notes: Note[]): Note[] {
  const manual = notes.length > 0 && notes.every(n => n.order != null);
  return [...notes].sort(manual
    ? (a, b) => (a.order! - b.order!)
    : (a, b) => new Date(b.date_time ?? 0).getTime() - new Date(a.date_time ?? 0).getTime());
}

/** The stored date string as a Date for the pickers (null when unset). */
export function noteDate(value?: string): Date | null {
  return value ? new Date(value) : null;
}

/** Serializes the date_time control (a Date) back to an ISO string for the API. */
export function noteDateIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) return value;
  return new Date().toISOString();
}

const isValidDate = (value: unknown): value is Date => value instanceof Date && !isNaN(value.getTime());

/**
 * The note's date and time from the card's two pickers. Each picker has its
 * own control: when both shared date_time, the Material timepicker put its
 * own remembered date back on every time edit, so a changed date was lost
 * (client 2026-11-09). A missing half keeps the stored value's half.
 */
export function mergeNoteDateTime(date: unknown, time: unknown, stored: unknown): Date | null {
  const base = isValidDate(stored) ? stored : null;
  const day = isValidDate(date) ? date : base;
  const clock = isValidDate(time) ? time : base;
  if (day && clock) return combineDateTime(day, clock);
  return day ?? clock ?? null;
}

/** The note to send to the API: the form value without the picker-only controls. */
export function noteFromForm(raw: Record<string, unknown>): Note {
  const {note_date: _date, note_time: _time, ...rest} = raw;
  return {...rest, date_time: noteDateIso(raw['date_time'])} as Note;
}

/**
 * A note card's form group. date_time is held as a Date and stays the value
 * everything else reads; note_date and note_time feed the two pickers and
 * write back into it.
 */
export function noteGroup(formBuilder: FormBuilder, note: Note): FormGroup {
  const group = formBuilder.group({
    id: [note.id, Validators.required],
    message: note.message,
    date_time: noteDate(note.date_time),
    note_date: noteDate(note.date_time),
    note_time: noteDate(note.date_time),
    author: note.author,
    author_id: note.author_id,
    recipient: note.recipient,
    recipient_id: note.recipient_id,
    type: note.type ?? '',
    order: note.order ?? null,
  });
  const sync = () => {
    const merged = mergeNoteDateTime(
      group.get('note_date')!.value,
      group.get('note_time')!.value,
      group.get('date_time')!.value,
    );
    group.get('date_time')!.setValue(merged);
  };
  group.get('note_date')!.valueChanges.subscribe(sync);
  group.get('note_time')!.valueChanges.subscribe(sync);
  return group;
}

/** The lowest manual order among the given values (0 when none are set). */
export function minNoteOrder(orders: (number | null | undefined)[]): number {
  const set = orders.filter((o): o is number => o != null);
  return set.length ? Math.min(...set) : 0;
}
