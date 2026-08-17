import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ReminderDialog, ReminderDialogData } from './reminder-dialog';
import { ReminderService } from '../services/reminder.service';
import { AuthService } from '../services/auth.service';
import { Reminder } from '../models/reminder.model';
import { Contact } from '../models/contact.model';

const admins = [
  { id: 'a-1', first_name: 'Amy', last_name: 'Adams' } as Contact,
];

const existing: Reminder = {
  id: 'rem-1',
  title: 'Call John',
  message: 'Cancels July 31',
  date: '2026-08-01',
  all_admins: false,
  recipient_ids: ['a-1'],
};

describe('ReminderDialog', () => {
  const dialogRef = { close: jest.fn() };
  const reminderService = {
    createReminder: jest.fn(),
    updateReminder: jest.fn(),
    deleteReminder: jest.fn(),
  };

  const build = (data: Partial<ReminderDialogData>): ReminderDialog => {
    TestBed.configureTestingModule({
      imports: [ReminderDialog],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { admins, ...data } },
        { provide: ReminderService, useValue: reminderService },
        { provide: AuthService, useValue: { contact: () => ({ id: 'admin-me' }) } },
      ],
    });
    const c = TestBed.createComponent(ReminderDialog).componentInstance;
    c.ngOnInit();
    return c;
  };

  const form = (c: ReminderDialog) =>
    (c as unknown as { reminderForm: { get(name: string): { value: unknown; setValue(v: unknown): void } } }).reminderForm;
  const priv = (c: ReminderDialog) =>
    c as unknown as { submitting: boolean; hasError: boolean; errorMessage: string };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  describe('create', () => {
    it('creates a reminder and closes with true', () => {
      reminderService.createReminder.mockReturnValue(of({ id: 'rem-9', message: 'ok' }));
      const c = build({ mode: 'create' });
      form(c).get('title').setValue('New reminder');
      form(c).get('date').setValue(new Date(2026, 7, 15));
      c.save();
      expect(reminderService.createReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New reminder',
          date: '2026-08-15',
          all_admins: true,
          recipient_ids: [],
        }),
      );
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('blocks an invalid form without calling the service', () => {
      const c = build({ mode: 'create' });
      c.save();
      expect(reminderService.createReminder).not.toHaveBeenCalled();
    });

    it('requires at least one recipient when not all admins', () => {
      const c = build({ mode: 'create' });
      form(c).get('title').setValue('New reminder');
      form(c).get('date').setValue(new Date(2026, 7, 15));
      form(c).get('all_admins').setValue(false);
      c.save();
      expect(reminderService.createReminder).not.toHaveBeenCalled();
      expect(priv(c).hasError).toBe(true);
    });

    it('ignores double submits while in flight', () => {
      const pending = new Subject<never>();
      reminderService.createReminder.mockReturnValue(pending);
      const c = build({ mode: 'create' });
      form(c).get('title').setValue('New reminder');
      form(c).get('date').setValue(new Date(2026, 7, 15));
      c.save();
      c.save();
      expect(reminderService.createReminder).toHaveBeenCalledTimes(1);
    });

    it('shows an error and re-enables on failure', () => {
      reminderService.createReminder.mockReturnValue(throwError(() => new Error('boom')));
      const c = build({ mode: 'create' });
      form(c).get('title').setValue('New reminder');
      form(c).get('date').setValue(new Date(2026, 7, 15));
      c.save();
      expect(priv(c).hasError).toBe(true);
      expect(priv(c).submitting).toBe(false);
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('edit', () => {
    it('prefills the form and updates with individual recipients', () => {
      reminderService.updateReminder.mockReturnValue(of(existing));
      const c = build({ mode: 'edit', reminder: existing });
      expect(form(c).get('title').value).toBe('Call John');
      c.save();
      expect(reminderService.updateReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'rem-1',
          date: '2026-08-01',
          all_admins: false,
          recipient_ids: ['a-1'],
        }),
      );
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });
  });

  describe('delete', () => {
    it('deletes by id and closes with true', () => {
      reminderService.deleteReminder.mockReturnValue(of({ id: 'rem-1', message: 'ok' }));
      const c = build({ mode: 'delete', reminder: existing });
      c.confirmDelete();
      expect(reminderService.deleteReminder).toHaveBeenCalledWith('rem-1');
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('closes without a call when there is no id', () => {
      const c = build({ mode: 'delete', reminder: {} });
      c.confirmDelete();
      expect(reminderService.deleteReminder).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });

    it('shows an error on delete failure', () => {
      reminderService.deleteReminder.mockReturnValue(throwError(() => new Error('boom')));
      const c = build({ mode: 'delete', reminder: existing });
      c.confirmDelete();
      expect(priv(c).hasError).toBe(true);
      expect(priv(c).submitting).toBe(false);
    });
  });

  it('carries the linked contact through create', () => {
    reminderService.createReminder.mockReturnValue(of({ id: 'rem-9', message: 'ok' }));
    const c = build({ mode: 'create' });
    form(c).get('title').setValue('Linked');
    form(c).get('date').setValue(new Date(2026, 7, 15));
    form(c).get('contact_id').setValue('c-9');
    c.save();
    expect(reminderService.createReminder).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: 'c-9' }),
    );
  });

  it('prefills the linked contact on edit and clears it via None', () => {
    reminderService.updateReminder.mockReturnValue(of(existing));
    const c = build({ mode: 'edit', reminder: { ...existing, contact_id: 'c-9' } });
    expect(form(c).get('contact_id').value).toBe('c-9');
    form(c).get('contact_id').setValue(null);
    c.save();
    expect(reminderService.updateReminder).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: undefined }),
    );
  });

  it('ignores a second delete while one is in flight', () => {
    const pending = new Subject<never>();
    reminderService.deleteReminder.mockReturnValue(pending);
    const c = build({ mode: 'delete', reminder: existing });
    c.confirmDelete();
    c.confirmDelete();
    expect(reminderService.deleteReminder).toHaveBeenCalledTimes(1);
  });

  it('parses non-plain-date strings via the Date fallback', () => {
    const c = build({
      mode: 'edit',
      reminder: { ...existing, date: '2026-08-01T00:00:00' },
    });
    const value = form(c).get('date').value as Date;
    expect(value.getFullYear()).toBe(2026);
  });

  it('toDateString returns undefined for a missing date', () => {
    const c = build({ mode: 'create' });
    const toDateString = (c as unknown as { toDateString(v?: Date | null): string | undefined })
      .toDateString.bind(c);
    expect(toDateString(null)).toBeUndefined();
  });

  it('cancel closes with no result; blocked while submitting', () => {
    const pending = new Subject<never>();
    reminderService.createReminder.mockReturnValue(pending);
    const c = build({ mode: 'create' });
    form(c).get('title').setValue('X');
    form(c).get('date').setValue(new Date(2026, 7, 15));
    c.save();
    c.cancel();
    expect(dialogRef.close).not.toHaveBeenCalled();
    priv(c).submitting = false;
    c.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  describe('v2 fields', () => {
    it('defaults created_by to the acting admin on create', () => {
      reminderService.createReminder.mockReturnValue(of({ id: 'rem-1' }));
      const c = build({ mode: 'create' });
      form(c).get('title').setValue('t');
      form(c).get('date').setValue(new Date(2026, 7, 20));
      c.save();
      expect(reminderService.createReminder).toHaveBeenCalledWith(
        expect.objectContaining({ created_by: 'admin-me' }),
      );
    });

    it('preserves the stored creator and recurrence on edit', () => {
      reminderService.updateReminder.mockReturnValue(of({ id: 'rem-1' }));
      const c = build({
        mode: 'edit',
        reminder: {
          id: 'rem-1', title: 't', message: '', date: '2026-08-20',
          created_by: 'a-2', recurrence: 'monthly', due_date: '2026-08-25',
        },
      });
      c.save();
      expect(reminderService.updateReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          created_by: 'a-2', recurrence: 'monthly', due_date: '2026-08-25',
        }),
      );
    });

    it('sends undefined for no recurrence and a blank due date', () => {
      reminderService.createReminder.mockReturnValue(of({ id: 'rem-1' }));
      const c = build({ mode: 'create' });
      form(c).get('title').setValue('t');
      form(c).get('date').setValue(new Date(2026, 7, 20));
      c.save();
      const sent = reminderService.createReminder.mock.calls.at(-1)![0];
      expect(sent.recurrence).toBeUndefined();
      expect(sent.due_date).toBeUndefined();
    });

    it('leaves created_by unset when the acting admin has no contact id', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [ReminderDialog],
        providers: [
          { provide: MatDialogRef, useValue: dialogRef },
          { provide: MAT_DIALOG_DATA, useValue: { mode: 'create', admins } },
          { provide: ReminderService, useValue: reminderService },
          { provide: AuthService, useValue: { contact: () => ({}) } },
        ],
      });
      const c = TestBed.createComponent(ReminderDialog).componentInstance;
      c.ngOnInit();
      reminderService.createReminder.mockReturnValue(of({ id: 'rem-1' }));
      form(c).get('title').setValue('t');
      form(c).get('date').setValue(new Date(2026, 7, 20));
      c.save();
      expect(reminderService.createReminder.mock.calls.at(-1)![0].created_by)
        .toBeUndefined();
    });

    it('round-trips a picked recurrence and due date', () => {
      reminderService.createReminder.mockReturnValue(of({ id: 'rem-1' }));
      const c = build({ mode: 'create' });
      form(c).get('title').setValue('t');
      form(c).get('date').setValue(new Date(2026, 7, 20));
      form(c).get('recurrence').setValue('weekly');
      form(c).get('due_date').setValue(new Date(2026, 7, 25));
      c.save();
      expect(reminderService.createReminder).toHaveBeenCalledWith(
        expect.objectContaining({ recurrence: 'weekly', due_date: '2026-08-25' }),
      );
    });
  });
});
