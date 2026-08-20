import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {Note} from '../models/note.model';

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

/** A note card's form group. date_time is held as a Date for the pickers. */
export function noteGroup(formBuilder: FormBuilder, note: Note): FormGroup {
  return formBuilder.group({
    id: [note.id, Validators.required],
    message: note.message,
    date_time: noteDate(note.date_time),
    author: note.author,
    author_id: note.author_id,
    recipient: note.recipient,
    recipient_id: note.recipient_id,
    type: note.type ?? '',
    order: note.order ?? null,
  });
}

/** The lowest manual order among the given values (0 when none are set). */
export function minNoteOrder(orders: (number | null | undefined)[]): number {
  const set = orders.filter((o): o is number => o != null);
  return set.length ? Math.min(...set) : 0;
}
