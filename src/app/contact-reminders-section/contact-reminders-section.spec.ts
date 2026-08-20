import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { ContactRemindersSection } from './contact-reminders-section';
import { ReminderService } from '../services/reminder.service';
import { AuthService } from '../services/auth.service';
import { Reminder } from '../models/reminder.model';

describe('ContactRemindersSection', () => {
  let isAdmin: boolean;
  const reminderService = { getReminders: jest.fn() };
  const router = { navigate: jest.fn() };

  const build = (): ContactRemindersSection => {
    TestBed.configureTestingModule({
      imports: [ContactRemindersSection],
      providers: [
        { provide: ReminderService, useValue: reminderService },
        { provide: AuthService, useValue: { isAdmin: () => isAdmin } },
        { provide: Router, useValue: router },
      ],
    });
    const c = TestBed.createComponent(ContactRemindersSection).componentInstance;
    c.contactId = 'c-1';
    return c;
  };

  const outstanding = (c: ContactRemindersSection): Reminder[] =>
    (c as unknown as { outstandingReminders: Reminder[] }).outstandingReminders;

  beforeEach(() => {
    isAdmin = true;
    router.navigate.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    reminderService.getReminders.mockReturnValue(of([]));
  });

  it('keeps only this contact\'s uncompleted reminders, date-ascending', () => {
    reminderService.getReminders.mockReturnValue(of([
      { id: 'r-later', contact_id: 'c-1', date: '2026-09-01', title: 'Later' },
      { id: 'r-other', contact_id: 'c-2', date: '2026-08-01', title: 'Other contact' },
      { id: 'r-done', contact_id: 'c-1', date: '2026-08-02', completed_at: '2026-08-02T12:00:00Z' },
      { id: 'r-soon', contact_id: 'c-1', date: '2026-08-20', title: 'Soon' },
      { id: 'r-dateless', contact_id: 'c-1', title: 'No date yet' },
      { id: 'r-dateless-2', contact_id: 'c-1', title: 'Also undated' },
    ] as Reminder[]));
    const c = build();
    c.ngOnInit();
    // Both undated reminders sort first (empty-string dates), holding their order.
    expect(outstanding(c).map(r => r.id)).toEqual(['r-dateless', 'r-dateless-2', 'r-soon', 'r-later']);
  });

  it('does not fetch reminders for non-admins', () => {
    isAdmin = false;
    const c = build();
    c.ngOnInit();
    expect(reminderService.getReminders).not.toHaveBeenCalled();
    expect(outstanding(c)).toEqual([]);
  });

  it('swallows a reminders load error', () => {
    reminderService.getReminders.mockReturnValue(throwError(() => new Error('x')));
    const c = build();
    expect(() => c.ngOnInit()).not.toThrow();
    expect(outstanding(c)).toEqual([]);
  });

  it('navigates to the Reminders page on row click', () => {
    const c = build();
    c.goToReminders();
    expect(router.navigate).toHaveBeenCalledWith(['/reminders']);
  });
});
