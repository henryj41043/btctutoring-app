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
  const reminderService = { getReminders: jest.fn() };
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
    afterClosed = undefined;
    router.navigate.mockClear();
    dialog.open.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    reminderService.getReminders.mockReturnValue(of([reminder()]));
    contactService.getContactsSummary.mockReturnValue(of([adminContact, tutorContact]));
  });

  it('loads reminders and defaults to upcoming only', () => {
    reminderService.getReminders.mockReturnValue(
      of([reminder(), reminder({ id: 'rem-2', date: PAST, title: 'Old' })]),
    );
    const c = build();
    c.ngOnInit();
    expect(data(c).map(r => r.id)).toEqual(['rem-1']);
    expect((c as unknown as { loading: boolean }).loading).toBe(false);
  });

  it('shows past reminders when toggled, sorted by date', () => {
    reminderService.getReminders.mockReturnValue(
      of([reminder(), reminder({ id: 'rem-2', date: PAST, title: 'Old' })]),
    );
    const c = build();
    c.ngOnInit();
    c.onShowPastChange(true);
    expect(data(c).map(r => r.id)).toEqual(['rem-2', 'rem-1']);
    c.onShowPastChange(false);
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
    // Date-less reminders are treated as past (dropped from upcoming)…
    expect(data(c)).toEqual([]);
    // …but visible with the toggle, and their recipients render as a dash.
    c.onShowPastChange(true);
    expect(data(c)).toHaveLength(1);
    expect(c.recipientNames(data(c)[0])).toBe('—');
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
