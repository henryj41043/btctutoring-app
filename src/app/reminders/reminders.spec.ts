import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { Reminders } from './reminders';
import { ReminderService } from '../services/reminder.service';
import { ContactService } from '../services/contact.service';
import { Reminder } from '../models/reminder.model';
import { ReminderDialog } from '../reminder-dialog/reminder-dialog';

const FUTURE = '2999-01-01';
const PAST = '2000-01-01';

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: 'rem-1',
  title: 'Call John',
  message: 'Cancels July 31',
  date: FUTURE,
  all_admins: true,
  recipient_ids: [],
  ...over,
});

const adminContact = { id: 'a-1', first_name: 'Amy', last_name: 'Adams', user_group: 'Admins' };
const tutorContact = { id: 't-1', first_name: 'Tess', last_name: 'Coach', user_group: 'Tutors' };

describe('Reminders', () => {
  let afterClosed: unknown;
  const reminderService = { getReminders: jest.fn(), completeReminder: jest.fn(), uncompleteReminder: jest.fn() };
  const contactService = { getContactsSummary: jest.fn() };
  const dialog = { open: jest.fn(() => ({ afterClosed: () => of(afterClosed) })) };
  const router = { navigate: jest.fn() };

  const build = (): Reminders => {
    TestBed.configureTestingModule({
      imports: [Reminders],
      providers: [
        { provide: ReminderService, useValue: reminderService },
        { provide: ContactService, useValue: contactService },
        { provide: MatDialog, useValue: dialog },
        { provide: Router, useValue: router },
      ],
    });
    return TestBed.createComponent(Reminders).componentInstance;
  };

  const data = (c: Reminders): Reminder[] =>
    (c as unknown as { dataSource: { data: Reminder[] } }).dataSource.data;

  beforeEach(() => {
    sessionStorage.clear();
    afterClosed = undefined;
    router.navigate.mockClear();
    dialog.open.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    reminderService.getReminders.mockReturnValue(of([reminder()]));
    contactService.getContactsSummary.mockReturnValue(of([adminContact, tutorContact]));
  });

  it('restores the saved filter and show-past toggle for the session', () => {
    sessionStorage.setItem('btc-reminders-view',
      JSON.stringify({ filter: 'bill', extra: { showCompleted: true } }));
    const c = build();
    c.ngOnInit();
    expect((c as any).filterText).toBe('bill');
    expect((c as any).showCompleted).toBe(true);
    c.onShowCompletedChange(false);
    expect(JSON.parse(sessionStorage.getItem('btc-reminders-view')!).extra.showCompleted).toBe(false);
  });

  it('defaults to all uncompleted — overdue reminders stay visible', () => {
    reminderService.getReminders.mockReturnValue(
      of([
        reminder(),
        reminder({ id: 'rem-2', date: PAST, title: 'Overdue' }),
        reminder({ id: 'rem-3', date: PAST, completed_at: '2026-08-01T12:00:00Z' }),
      ]),
    );
    const c = build();
    c.ngOnInit();
    // Overdue-but-uncompleted shows (date asc); completed hides.
    expect(data(c).map(r => r.id)).toEqual(['rem-2', 'rem-1']);
    expect((c as unknown as { loading: boolean }).loading).toBe(false);
  });

  it('shows completed reminders when toggled, sorted by date', () => {
    reminderService.getReminders.mockReturnValue(
      of([
        reminder(),
        reminder({ id: 'rem-2', date: PAST, completed_at: '2026-08-01T12:00:00Z' }),
      ]),
    );
    const c = build();
    c.ngOnInit();
    c.onShowCompletedChange(true);
    expect(data(c).map(r => r.id)).toEqual(['rem-2', 'rem-1']);
    c.onShowCompletedChange(false);
    expect(data(c).map(r => r.id)).toEqual(['rem-1']);
  });

  it('resolves recipient names from admin contacts', () => {
    const c = build();
    c.ngOnInit();
    expect(c.recipientNames(reminder())).toBe('All admins');
    expect(c.recipientNames(reminder({ all_admins: false, recipient_ids: ['a-1'] }))).toBe('Amy Adams');
    expect(c.recipientNames(reminder({ all_admins: false, recipient_ids: ['nobody'] }))).toBe('—');
  });

  it('filters by title, message, or recipient case-insensitively', () => {
    reminderService.getReminders.mockReturnValue(
      of([
        reminder(),
        reminder({ id: 'rem-2', title: 'Other', message: 'Different', all_admins: false, recipient_ids: ['a-1'] }),
      ]),
    );
    const c = build();
    c.ngOnInit();
    const ds = (c as unknown as { dataSource: { filteredData: Reminder[] } }).dataSource;
    c.applyFilter('  CALL ');
    expect(ds.filteredData.map(r => r.id)).toEqual(['rem-1']);
    c.applyFilter('amy adams');
    expect(ds.filteredData.map(r => r.id)).toEqual(['rem-2']);
    c.applyFilter('');
    expect(ds.filteredData).toHaveLength(2);
  });

  it('swallows load errors and renders an empty table', () => {
    reminderService.getReminders.mockReturnValue(throwError(() => new Error('boom')));
    contactService.getContactsSummary.mockReturnValue(throwError(() => new Error('boom')));
    const c = build();
    c.ngOnInit();
    expect(data(c)).toEqual([]);
    expect((c as unknown as { loading: boolean }).loading).toBe(false);
  });

  it('opens the create dialog with admin contacts and reloads on a result', () => {
    afterClosed = true;
    const c = build();
    c.ngOnInit();
    reminderService.getReminders.mockClear();
    c.openCreateDialog();
    expect(dialog.open).toHaveBeenCalledWith(ReminderDialog, expect.objectContaining({
      data: expect.objectContaining({ mode: 'create', admins: [adminContact] }),
    }));
    expect(reminderService.getReminders).toHaveBeenCalled();
  });

  it('row click opens edit; a dismissed dialog does not reload', () => {
    afterClosed = undefined;
    const c = build();
    c.ngOnInit();
    reminderService.getReminders.mockClear();
    c.openEditDialog(reminder());
    expect(dialog.open).toHaveBeenCalledWith(ReminderDialog, expect.objectContaining({
      data: expect.objectContaining({ mode: 'edit' }),
    }));
    expect(reminderService.getReminders).not.toHaveBeenCalled();
  });

  it('delete icon opens the delete dialog and stops row propagation', () => {
    afterClosed = undefined;
    const c = build();
    c.ngOnInit();
    const event = { stopPropagation: jest.fn() } as unknown as Event;
    c.openDeleteDialog(reminder(), event);
    expect((event as unknown as { stopPropagation: jest.Mock }).stopPropagation).toHaveBeenCalled();
    expect(dialog.open).toHaveBeenCalledWith(ReminderDialog, expect.objectContaining({
      data: expect.objectContaining({ mode: 'delete' }),
    }));
  });

  it('handles contacts without ids and reminders without dates or recipients', () => {
    contactService.getContactsSummary.mockReturnValue(
      of([adminContact, { first_name: 'NoId', user_group: 'Admins' }]),
    );
    reminderService.getReminders.mockReturnValue(
      of([reminder({ id: 'rem-2', date: undefined, all_admins: false, recipient_ids: undefined })]),
    );
    const c = build();
    c.ngOnInit();
    // Date-less uncompleted reminders stay visible; recipients render a dash.
    expect(data(c)).toHaveLength(1);
    expect(c.recipientNames(data(c)[0])).toBe('—');
  });

  it('ignores a non-boolean stored showCompleted and empty filters', () => {
    sessionStorage.setItem('btc-reminders-view',
      JSON.stringify({ extra: { showCompleted: 'yes' } }));
    const c = build();
    c.ngOnInit();
    expect((c as unknown as { showCompleted: boolean }).showCompleted).toBe(false);
    // applyFilter before any paginator exists exercises the ?. branch.
    c.applyFilter('x');
    expect((c as unknown as { filterText: string }).filterText).toBe('x');
  });

  it('sorts date-less reminders and maps name-less admins without crashing', () => {
    contactService.getContactsSummary.mockReturnValue(of([
      adminContact,
      { id: 'a-2', user_group: 'Admins' }, // no names -> '' via the ?? fallbacks
    ]));
    reminderService.getReminders.mockReturnValue(of([
      reminder({ id: 'rem-1', date: undefined }), // no date -> '' in the sort
      reminder({ id: 'rem-2' }),
    ]));
    const c = build();
    c.ngOnInit();
    // Date-less sorts first (empty string), both remain visible.
    expect(data(c).map(r => r.id)).toEqual(['rem-1', 'rem-2']);
    // The blank mapped name is filtered out of the join -> dash placeholder.
    expect(c.recipientNames(reminder({ all_admins: false, recipient_ids: ['a-2'] }))).toBe('—');
  });

  it('name-less contacts with an email display as the email', () => {
    contactService.getContactsSummary.mockReturnValue(of([
      adminContact,
      { id: 'a-3', user_group: 'Admins', email: 'third.admin@example.com' },
    ]));
    reminderService.getReminders.mockReturnValue(of([]));
    const c = build();
    c.ngOnInit();
    expect(c.recipientNames(reminder({ all_admins: false, recipient_ids: ['a-3'] })))
      .toBe('third.admin@example.com');
  });

  it('done checkbox completes an uncompleted reminder and reloads', () => {
    reminderService.completeReminder.mockReturnValue(of({ id: 'rem-1' }));
    const c = build();
    c.ngOnInit();
    reminderService.getReminders.mockClear();
    c.onToggleComplete(reminder());
    expect(reminderService.completeReminder).toHaveBeenCalledWith('rem-1');
    expect(reminderService.getReminders).toHaveBeenCalledTimes(1); // reload
  });

  it('done checkbox reopens a completed reminder', () => {
    reminderService.uncompleteReminder.mockReturnValue(of({ id: 'rem-1' }));
    const c = build();
    c.ngOnInit();
    c.onToggleComplete(reminder({ completed_at: '2026-08-01T12:00:00Z' }));
    expect(reminderService.uncompleteReminder).toHaveBeenCalledWith('rem-1');
    expect(reminderService.completeReminder).not.toHaveBeenCalled();
  });

  it('a failed toggle leaves the table intact', () => {
    reminderService.completeReminder.mockReturnValue(throwError(() => new Error('x')));
    const c = build();
    c.ngOnInit();
    const before = data(c).length;
    reminderService.getReminders.mockClear();
    c.onToggleComplete(reminder());
    expect(reminderService.getReminders).not.toHaveBeenCalled();
    expect(data(c).length).toBe(before);
  });

  it('createdByName resolves the admin, blank otherwise', () => {
    const c = build();
    c.ngOnInit();
    expect(c.createdByName(reminder({ created_by: 'a-1' }))).not.toBe('');
    expect(c.createdByName(reminder({ created_by: 'unknown' }))).toBe('');
    expect(c.createdByName(reminder())).toBe('');
  });

  it('resolves and navigates the linked contact', () => {
    const c = build();
    c.ngOnInit();
    // Any contact (not just admins) can be linked.
    expect(c.contactName(reminder({ contact_id: 't-1' }))).toBe('Tess Coach');
    expect(c.contactName(reminder())).toBe('');
    expect(c.contactName(reminder({ contact_id: 'unknown' }))).toBe('');
    const event = { stopPropagation: jest.fn() } as unknown as Event;
    c.openLinkedContact(reminder({ contact_id: 't-1' }), event);
    expect(router.navigate).toHaveBeenCalledWith(['/contacts', 't-1']);
    router.navigate.mockClear();
    c.openLinkedContact(reminder(), event);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('passes the full contact list to the dialog', () => {
    afterClosed = undefined;
    const c = build();
    c.ngOnInit();
    c.openCreateDialog();
    expect(dialog.open).toHaveBeenCalledWith(ReminderDialog, expect.objectContaining({
      data: expect.objectContaining({ contacts: [adminContact, tutorContact] }),
    }));
  });

  it('wires sort and paginator through the view-child setters', () => {
    const c = build();
    const ds = (c as unknown as { dataSource: { sort: unknown; paginator: unknown } }).dataSource;
    const sort = {} as MatSort;
    const paginator = {} as MatPaginator;
    c.matSort = sort;
    c.matPaginator = paginator;
    expect(ds.sort).toBe(sort);
    expect(ds.paginator).toBe(paginator);
    c.matSort = null as never;
    c.matPaginator = null as never;
    expect(ds.sort).toBe(sort);
    expect(ds.paginator).toBe(paginator);
  });
});
