import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { CalendarEvent, CalendarView } from 'angular-calendar';
import { EventCalendar } from './event-calendar';
import { SessionsService } from '../services/sessions.service';
import { ReminderService } from '../services/reminder.service';
import { ContactService } from '../services/contact.service';
import { Reminder } from '../models/reminder.model';
import { ReminderDialog } from '../reminder-dialog/reminder-dialog';
import { AuthService } from '../services/auth.service';
import { SessionDialog } from '../session-dialog/session-dialog';
import { Session } from '../models/session.model';
import { SessionStatus } from '../enums/session-status.enum';
import { SessionType } from '../enums/session-type.enum';

describe('EventCalendar', () => {
  let isAdmin: boolean;
  let contactId: string | undefined;
  let groups: string[];
  let afterClosed: unknown;
  const sessionsService = {
    getAllSessions: jest.fn(),
    getSessionsByTutor: jest.fn(),
    getTeamSessions: jest.fn(),
  };
  const reminderService = { getReminders: jest.fn() };
  const contactService = { getContactsSummary: jest.fn() };
  const authService = {
    isAdmin: () => isAdmin,
    isLead: () => (groups ?? []).includes('LeadTutors'),
    isTutorLike: () => (groups ?? []).includes('Tutors') || (groups ?? []).includes('LeadTutors'),
    user: () => ({ groups }),
    contact: () => ({ id: contactId }),
  };
  const dialog = {
    open: jest.fn(() => ({ afterClosed: () => of(afterClosed) })),
  };

  const build = (): EventCalendar => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [EventCalendar],
      providers: [
        { provide: SessionsService, useValue: sessionsService },
        { provide: ReminderService, useValue: reminderService },
        { provide: ContactService, useValue: contactService },
        { provide: AuthService, useValue: authService },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    return TestBed.createComponent(EventCalendar).componentInstance;
  };

  beforeEach(() => {
    isAdmin = true;
    contactId = 'contact-1';
    groups = ['Admins'];
    afterClosed = {} as Session;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    reminderService.getReminders.mockReturnValue(of([]));
    contactService.getContactsSummary.mockReturnValue(of([]));
  });


  it('hides completed reminders from the calendar, keeps uncompleted ones', () => {
    reminderService.getReminders.mockReturnValue(of([
      { id: 'r-1', title: 'Open', date: '2026-06-02' },
      { id: 'r-2', title: 'Done', date: '2026-06-03', completed_at: '2026-06-01T12:00:00Z' },
    ] as Reminder[]));
    sessionsService.getAllSessions.mockReturnValue(of([]));
    const c = build();
    c.ngOnInit();
    const titles = c.events.map(e => e.title);
    expect(titles).toContain('[Reminder] Open');
    expect(titles).not.toContain('[Reminder] Done');
  });
  it('themes the body and loads admin sessions on init', () => {
    sessionsService.getAllSessions.mockReturnValue(
      of([
        {
          type: SessionType.TUTORING,
          status: SessionStatus.COMPLETED,
          tutor_name: 'Tess',
          student_name: 'Pat',
          start_datetime: '2026-06-01T09:00:00',
          end_datetime: '2026-06-01T10:00:00',
        },
      ] as Session[]),
    );
    const c = build();
    c.ngOnInit();
    expect(document.body.classList.contains('light-theme')).toBe(true);
    expect(document.body.classList.contains('dark-theme')).toBe(false);
    expect(c.events).toHaveLength(1);
    expect(c.events[0].title).toContain('Tess with Pat');
  });

  it('loads a tutor’s own sessions', () => {
    isAdmin = false;
    groups = ['Tutors'];
    sessionsService.getSessionsByTutor.mockReturnValue(of([]));
    const c = build();
    c.ngOnInit();
    expect(sessionsService.getSessionsByTutor).toHaveBeenCalledWith(
      'contact-1',
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    );
  });

  it('loads the whole team for a lead tutor via the parameterless fetch', () => {
    isAdmin = false;
    groups = ['LeadTutors'];
    contactId = 'c-lead';
    sessionsService.getTeamSessions.mockReturnValue(of([]));
    const c = build();
    c.ngOnInit();
    expect(sessionsService.getTeamSessions).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    );
    expect(sessionsService.getSessionsByTutor).not.toHaveBeenCalled();
    expect(sessionsService.getAllSessions).not.toHaveBeenCalled();
  });

  describe('lead read-only member sessions', () => {
    const ownSession = {
      id: 's-own', tutor_id: 'c-lead', tutor_name: 'Lea', student_name: 'Pat',
      start_datetime: '2026-07-01T10:00:00', end_datetime: '2026-07-01T11:00:00',
    } as Session;
    const memberSession = {
      id: 's-member', tutor_id: 'c-m1', tutor_name: 'Tess', student_name: 'Kai',
      start_datetime: '2026-07-02T10:00:00', end_datetime: '2026-07-02T11:00:00',
    } as Session;

    const buildLead = (): EventCalendar => {
      isAdmin = false;
      groups = ['LeadTutors'];
      contactId = 'c-lead';
      sessionsService.getTeamSessions.mockReturnValue(of([ownSession, memberSession]));
      const c = build();
      c.viewDate = new Date(2026, 6, 15);
      c.ngOnInit();
      return c;
    };

    it('isSessionEditable: admins always, leads own-only', () => {
      const c = buildLead();
      expect((c as any).isSessionEditable(ownSession)).toBe(true);
      expect((c as any).isSessionEditable(memberSession)).toBe(false);
      isAdmin = true;
      expect((c as any).isSessionEditable(memberSession)).toBe(true);
    });

    it('renders member events without actions, drag, or resize', () => {
      const c = buildLead();
      const member = c.events.find(e => (e.meta as Session).id === 's-member')!;
      expect(member.actions).toEqual([]);
      expect(member.draggable).toBe(false);
      expect(member.resizable).toEqual({ beforeStart: false, afterEnd: false });
      const own = c.events.find(e => (e.meta as Session).id === 's-own')!;
      expect(own.actions?.length).toBeGreaterThan(0);
      expect(own.draggable).toBe(true);
      expect(own.resizable).toEqual({ beforeStart: true, afterEnd: true });
    });

    it('clicking a member session opens the view dialog, own opens edit', () => {
      const c = buildLead();
      afterClosed = undefined; // view dialog closes without a result
      const member = c.events.find(e => (e.meta as Session).id === 's-member')!;
      c.handleEvent('Clicked', member);
      expect(dialog.open).toHaveBeenCalledWith(expect.anything(), {
        data: { type: 'view', session: memberSession },
      });

      dialog.open.mockClear();
      afterClosed = undefined;
      const own = c.events.find(e => (e.meta as Session).id === 's-own')!;
      c.handleEvent('Clicked', own);
      const editArgs = dialog.open.mock.calls.at(-1)![1] as { data: { type: string } };
      expect(editArgs.data.type).toBe('edit');
    });
  });

  it('fetches the visible month ±1 and skips refetching cached months', () => {
    sessionsService.getAllSessions.mockReturnValue(of([]));
    const c = build();
    c.viewDate = new Date(2026, 6, 15); // July 2026
    c.ngOnInit();
    expect(sessionsService.getAllSessions).toHaveBeenCalledTimes(1);
    const range = sessionsService.getAllSessions.mock.calls.at(-1)![0] as {
      from: string; to: string;
    };
    // Window = June 1 through August 31.
    expect(new Date(range.from).getMonth()).toBe(5);
    expect(new Date(range.to).getMonth()).toBe(7);

    // Navigating within the cached window does not refetch…
    c.viewDate = new Date(2026, 7, 1); // August (cached)
    c.onViewDateChange();
    expect(sessionsService.getAllSessions).toHaveBeenCalledTimes(2); // Sept missing → fetch
    // …and revisiting July (fully cached) does not.
    c.viewDate = new Date(2026, 6, 15);
    c.onViewDateChange();
    expect(sessionsService.getAllSessions).toHaveBeenCalledTimes(2);
  });

  it('merges refetched sessions by id without duplicating events', () => {
    sessionsService.getAllSessions.mockReturnValue(of([
      { id: 's-1', start_datetime: '2026-07-01T10:00:00', end_datetime: '2026-07-01T11:00:00' },
    ] as Session[]));
    const c = build();
    c.viewDate = new Date(2026, 6, 15);
    c.ngOnInit();
    // Jump two months ahead so a new fetch happens, returning an overlap.
    sessionsService.getAllSessions.mockReturnValue(of([
      { id: 's-1', start_datetime: '2026-07-01T10:00:00', end_datetime: '2026-07-01T11:00:00' },
      { id: 's-2', start_datetime: '2026-09-10T10:00:00', end_datetime: '2026-09-10T11:00:00' },
    ] as Session[]));
    c.viewDate = new Date(2026, 8, 15);
    c.onViewDateChange();
    expect(c.events).toHaveLength(2); // s-1 not duplicated
  });

  it('toggles the header spinner around month fetches and on errors', () => {
    sessionsService.getAllSessions.mockReturnValue(of([]));
    const c = build();
    expect(c.loading).toBe(false);
    c.ngOnInit();
    expect(c.loading).toBe(false); // synchronous mock completes immediately

    sessionsService.getAllSessions.mockReturnValue(throwError(() => new Error('x')));
    c.viewDate = new Date(2027, 0, 15); // uncached → failing fetch
    c.onViewDateChange();
    expect(c.loading).toBe(false); // cleared by the error path
  });

  it('renders no events for a user who is neither admin nor tutor', () => {
    isAdmin = false;
    groups = [];
    const c = build();
    c.ngOnInit();
    expect(c.events).toEqual([]);
  });

  it('keeps events empty on a load error', () => {
    sessionsService.getAllSessions.mockReturnValue(
      throwError(() => new Error('boom')),
    );
    const c = build();
    c.ngOnInit();
    expect(c.events).toEqual([]);
  });

  it('builds admin and make-up event titles', () => {
    sessionsService.getAllSessions.mockReturnValue(
      of([
        {
          id: 'sess-admin',
          type: SessionType.ADMIN,
          tutor_name: 'Tess',
          start_datetime: '2026-06-01T09:00:00',
          end_datetime: '2026-06-01T10:00:00',
        },
        {
          id: 'sess-makeup',
          type: SessionType.MAKE_UP,
          tutor_name: 'Tess',
          student_name: 'Pat',
          start_datetime: '2026-06-02T09:00:00',
          end_datetime: '2026-06-02T10:00:00',
        },
      ] as Session[]),
    );
    const c = build();
    c.ngOnInit();
    expect(c.events[0].title).toContain('Admin Time');
    expect(c.events[1].title).toContain('[Make-up]');
  });

  it('exposes edit and delete actions that open the matching dialog', () => {
    sessionsService.getAllSessions.mockReturnValue(of([]));
    const c = build();
    const event = { meta: {} as Session } as CalendarEvent;
    c.actions[0].onClick!({ event, sourceEvent: new MouseEvent('click') });
    c.actions[1].onClick!({ event, sourceEvent: new MouseEvent('click') });
    const types = dialog.open.mock.calls.map(
      (call) => (call[1] as { data: { type: string } }).data.type,
    );
    expect(types).toContain('edit');
    expect(types).toContain('delete');
  });

  describe('tutor/student filter', () => {
    const sessions = [
      {
        id: 'sess-1',
        type: SessionType.TUTORING,
        status: SessionStatus.PENDING,
        tutor_name: 'Tess Coach',
        student_name: 'Pat Young',
        start_datetime: '2026-06-01T09:00:00',
        end_datetime: '2026-06-01T10:00:00',
      },
      {
        id: 'sess-2',
        type: SessionType.TUTORING,
        status: SessionStatus.PENDING,
        tutor_name: 'Mia Mentor',
        student_name: 'Sam Lee',
        start_datetime: '2026-06-02T09:00:00',
        end_datetime: '2026-06-02T10:00:00',
      },
      {
        id: 'sess-3',
        type: SessionType.ADMIN,
        status: SessionStatus.PENDING,
        tutor_name: 'Tess Coach',
        start_datetime: '2026-06-03T09:00:00', // admin time: no student_name
        end_datetime: '2026-06-03T10:00:00',
      },
    ] as Session[];

    const filtered = (): EventCalendar => {
      sessionsService.getAllSessions.mockReturnValue(of(sessions));
      const c = build();
      c.ngOnInit();
      return c;
    };

    it('filters by tutor name case-insensitively', () => {
      const c = filtered();
      c.applyFilter('  TESS ');
      expect(c.events).toHaveLength(2); // her session and her admin time
      expect(c.events.every(e => e.meta?.tutor_name === 'Tess Coach')).toBe(true);
    });

    it('filters by student name', () => {
      const c = filtered();
      c.applyFilter('sam');
      expect(c.events).toHaveLength(1);
      expect(c.events[0].meta?.student_name).toBe('Sam Lee');
    });

    it('clearing the box shows everything again', () => {
      const c = filtered();
      c.applyFilter('sam');
      c.applyFilter('');
      expect(c.events).toHaveLength(3);
    });

    it('collapses the open day when the filter changes', () => {
      const c = filtered();
      c.activeDayIsOpen = true;
      c.applyFilter('tess');
      expect(c.activeDayIsOpen).toBe(false);
    });

    it('keeps the filter applied across month navigation (cached months)', () => {
      const c = filtered();
      c.applyFilter('sam');
      c.onViewDateChange(); // months already cached — rebuild only
      expect(c.events).toHaveLength(1);
      expect(sessionsService.getAllSessions).toHaveBeenCalledTimes(1);
    });
  });

  describe('admin reminders on the calendar', () => {
    const reminder = {
      id: 'rem-1',
      title: 'Call John',
      message: 'Cancels July 31',
      date: '2026-06-05',
      all_admins: true,
    } as Reminder;

    it('renders reminders as all-day, non-draggable blue entries for admins', () => {
      sessionsService.getAllSessions.mockReturnValue(of([]));
      reminderService.getReminders.mockReturnValue(of([reminder]));
      const c = build();
      c.ngOnInit();
      const entry = c.events.find(e => c.isReminderEvent(e))!;
      expect(entry).toBeDefined();
      expect(entry.title).toBe('[Reminder] Call John');
      expect(entry.allDay).toBe(true);
      expect(entry.draggable).toBe(false);
      expect(entry.start).toEqual(new Date(2026, 5, 5));
    });

    it('does not fetch reminders for non-admin tutors', () => {
      isAdmin = false;
      groups = ['Tutors'];
      sessionsService.getSessionsByTutor.mockReturnValue(of([]));
      const c = build();
      c.ngOnInit();
      expect(reminderService.getReminders).not.toHaveBeenCalled();
    });

    it('clicking a reminder opens the reminder dialog, not the session dialog', () => {
      sessionsService.getAllSessions.mockReturnValue(of([]));
      reminderService.getReminders.mockReturnValue(of([reminder]));
      afterClosed = undefined;
      const c = build();
      c.ngOnInit();
      const entry = c.events.find(e => c.isReminderEvent(e))!;
      c.handleEvent('Clicked', entry);
      expect(dialog.open).toHaveBeenCalledWith(ReminderDialog, expect.objectContaining({
        data: expect.objectContaining({ mode: 'edit' }),
      }));
    });

    it('reminder delete action routes to the delete dialog', () => {
      sessionsService.getAllSessions.mockReturnValue(of([]));
      reminderService.getReminders.mockReturnValue(of([reminder]));
      afterClosed = undefined;
      const c = build();
      c.ngOnInit();
      const entry = c.events.find(e => c.isReminderEvent(e))!;
      c.handleEvent('Deleted', entry);
      expect(dialog.open).toHaveBeenCalledWith(ReminderDialog, expect.objectContaining({
        data: expect.objectContaining({ mode: 'delete' }),
      }));
    });

    it('drag/resize is a no-op for reminders', () => {
      sessionsService.getAllSessions.mockReturnValue(of([]));
      reminderService.getReminders.mockReturnValue(of([reminder]));
      const c = build();
      c.ngOnInit();
      const entry = c.events.find(e => c.isReminderEvent(e))!;
      dialog.open.mockClear();
      c.eventTimesChanged({ event: entry, newStart: new Date(), newEnd: new Date() } as never);
      expect(dialog.open).not.toHaveBeenCalled();
    });

    it('the search box filters reminders by title', () => {
      sessionsService.getAllSessions.mockReturnValue(of([]));
      reminderService.getReminders.mockReturnValue(of([reminder]));
      const c = build();
      c.ngOnInit();
      c.applyFilter('call john');
      expect(c.events.some(e => c.isReminderEvent(e))).toBe(true);
      c.applyFilter('nobody');
      expect(c.events.some(e => c.isReminderEvent(e))).toBe(false);
    });

    it('reminder action buttons open edit and delete dialogs', () => {
      sessionsService.getAllSessions.mockReturnValue(of([]));
      reminderService.getReminders.mockReturnValue(of([reminder]));
      afterClosed = undefined;
      const c = build();
      c.ngOnInit();
      const entry = c.events.find(e => c.isReminderEvent(e))!;
      c.reminderActions[0].onClick({ event: entry } as never);
      expect(dialog.open).toHaveBeenLastCalledWith(ReminderDialog, expect.objectContaining({
        data: expect.objectContaining({ mode: 'edit' }),
      }));
      c.reminderActions[1].onClick({ event: entry } as never);
      expect(dialog.open).toHaveBeenLastCalledWith(ReminderDialog, expect.objectContaining({
        data: expect.objectContaining({ mode: 'delete' }),
      }));
    });

    it('swallows reminder and contact load errors', () => {
      sessionsService.getAllSessions.mockReturnValue(of([]));
      reminderService.getReminders.mockReturnValue(throwError(() => new Error('boom')));
      contactService.getContactsSummary.mockReturnValue(throwError(() => new Error('boom')));
      const c = build();
      expect(() => c.ngOnInit()).not.toThrow();
      expect(c.events.some(e => c.isReminderEvent(e))).toBe(false);
    });

    it('tolerates a malformed reminder date', () => {
      sessionsService.getAllSessions.mockReturnValue(of([]));
      reminderService.getReminders.mockReturnValue(
        of([{ ...reminder, date: 'not-a-date' } as Reminder]),
      );
      const c = build();
      c.ngOnInit();
      expect(c.events.filter(e => c.isReminderEvent(e))).toHaveLength(1);
    });

    it('a closed reminder dialog with a result refetches reminders', () => {
      sessionsService.getAllSessions.mockReturnValue(of([]));
      reminderService.getReminders.mockReturnValue(of([reminder]));
      afterClosed = true;
      const c = build();
      c.ngOnInit();
      reminderService.getReminders.mockClear();
      c.openReminderDialog('edit', reminder);
      expect(reminderService.getReminders).toHaveBeenCalled();
    });
  });

  it('setView changes the active view', () => {
    const c = build();
    c.setView(CalendarView.Week);
    expect(c.view).toBe(CalendarView.Week);
  });

  it('closeOpenMonthViewDay collapses the open day', () => {
    const c = build();
    c.activeDayIsOpen = true;
    c.closeOpenMonthViewDay();
    expect(c.activeDayIsOpen).toBe(false);
  });

  describe('dayClicked', () => {
    it('opens a day that has events in the current month', () => {
      const c = build();
      c.viewDate = new Date(2026, 5, 15);
      c.dayClicked({ date: new Date(2026, 5, 20), events: [{} as CalendarEvent] });
      expect(c.activeDayIsOpen).toBe(true);
      expect(c.viewDate).toEqual(new Date(2026, 5, 20));
    });

    it('closes when the same open day is clicked again', () => {
      const c = build();
      c.viewDate = new Date(2026, 5, 20);
      c.activeDayIsOpen = true;
      c.dayClicked({ date: new Date(2026, 5, 20), events: [{} as CalendarEvent] });
      expect(c.activeDayIsOpen).toBe(false);
    });

    it('ignores clicks outside the current month', () => {
      const c = build();
      c.viewDate = new Date(2026, 5, 15);
      c.activeDayIsOpen = false;
      c.dayClicked({ date: new Date(2026, 6, 1), events: [] });
      expect(c.viewDate).toEqual(new Date(2026, 5, 15));
    });
  });

  it('eventTimesChanged updates the moved event and opens the edit dialog', () => {
    const c = build();
    const event = {
      meta: { id: 's-1' } as Session,
      start: new Date('2026-06-01T09:00:00'),
    } as CalendarEvent<Session>;
    const other = { meta: { id: 's-2' } as Session } as CalendarEvent<Session>;
    c.events = [other, event];
    c.eventTimesChanged({
      event,
      newStart: new Date('2026-06-01T11:00:00'),
      newEnd: new Date('2026-06-01T12:00:00'),
    } as never);
    expect(dialog.open).toHaveBeenCalledWith(
      SessionDialog,
      expect.objectContaining({ data: expect.objectContaining({ type: 'edit' }) }),
    );
  });

  it.each([
    ['Edited', 'edit'],
    ['Clicked', 'edit'],
    ['Dropped or resized', 'edit'],
    ['Deleted', 'delete'],
  ])('handleEvent(%s) opens the %s dialog', (action, type) => {
    sessionsService.getAllSessions.mockReturnValue(of([]));
    const c = build();
    c.handleEvent(action, { meta: {} as Session } as CalendarEvent);
    expect(dialog.open).toHaveBeenCalledWith(
      SessionDialog,
      expect.objectContaining({ data: expect.objectContaining({ type }) }),
    );
  });

  it.each([
    ['openCreateSessionDialog', 'create'],
    ['openEditSessionDialog', 'edit'],
    ['openDeleteSessionDialog', 'delete'],
  ])('%s opens the dialog and reloads on a result', (method, type) => {
    sessionsService.getAllSessions.mockReturnValue(of([]));
    const c = build();
    (c as unknown as Record<string, (x: unknown) => void>)[method]({} as Session);
    expect(dialog.open).toHaveBeenCalledWith(
      SessionDialog,
      expect.objectContaining({ data: expect.objectContaining({ type }) }),
    );
    expect(sessionsService.getAllSessions).toHaveBeenCalled();
  });

  it('does not reload when the dialog is dismissed', () => {
    afterClosed = undefined;
    sessionsService.getAllSessions.mockReturnValue(of([]));
    const c = build();
    sessionsService.getAllSessions.mockClear();
    c.openEditSessionDialog({} as Session);
    expect(sessionsService.getAllSessions).not.toHaveBeenCalled();
  });

  describe('event colors by status', () => {
    const colorFor = (session: Partial<Session>): string => {
      sessionsService.getAllSessions.mockReturnValue(of([
        {
          tutor_name: 'T',
          student_name: 'S',
          start_datetime: '2026-06-01T09:00:00',
          end_datetime: '2026-06-01T10:00:00',
          ...session,
        },
      ] as Session[]));
      const c = build();
      c.ngOnInit();
      return c.events[0].color!.primary;
    };

    it.each([
      [SessionStatus.PENDING, '#e3bc08'],
      [SessionStatus.COMPLETED, '#18c100'],
      [SessionStatus.CANCELLED, '#ad2121'],
      [SessionStatus.NO_CALL_NO_SHOW, '#ad2121'],
    ])('colors %s sessions', (status, primary) => {
      expect(colorFor({ type: SessionType.TUTORING, status })).toBe(primary);
    });

    it.each([
      [SessionStatus.PENDING, '#00897b'],
      [SessionStatus.COMPLETED, '#18c100'],
      [SessionStatus.CANCELLED, '#ad2121'],
      [SessionStatus.NO_CALL_NO_SHOW, '#ad2121'],
    ])('colors TRIAL %s sessions (teal while scheduled)', (status, primary) => {
      expect(colorFor({ type: SessionType.TRIAL, status })).toBe(primary);
    });

    it('prefixes trial titles with [Trial]', () => {
      sessionsService.getAllSessions.mockReturnValue(of([
        {
          type: SessionType.TRIAL,
          status: SessionStatus.PENDING,
          tutor_name: 'T',
          student_name: 'S',
          start_datetime: '2026-06-01T09:00:00',
          end_datetime: '2026-06-01T09:45:00',
        },
      ] as Session[]));
      const c = build();
      c.ngOnInit();
      expect(c.events[0].title).toContain('[Trial] ');
    });

    it('defaults unknown statuses to yellow', () => {
      expect(colorFor({ type: SessionType.TUTORING, status: undefined })).toBe('#e3bc08');
    });

    it('colors admin sessions purple and scheduled make-up sessions orange', () => {
      expect(colorFor({ type: SessionType.ADMIN })).toBe('#7b2fbe');
      expect(colorFor({ type: SessionType.MAKE_UP })).toBe('#e07b00');
      expect(colorFor({ type: SessionType.MAKE_UP, status: SessionStatus.PENDING })).toBe('#e07b00');
    });

    it('colors finalized make-up sessions by outcome (regression: stayed orange)', () => {
      // A held make-up turns green so it's distinguishable from a scheduled one.
      expect(colorFor({ type: SessionType.MAKE_UP, status: SessionStatus.COMPLETED })).toBe('#18c100');
      // No-call-no-shows still consume minutes — red, matching tutoring.
      expect(colorFor({ type: SessionType.MAKE_UP, status: SessionStatus.NO_CALL_NO_SHOW })).toBe('#ad2121');
    });
  });

  it('does not query sessions when a tutor has no resolved contact id', () => {
    isAdmin = false;
    contactId = undefined;
    const component = build();
    component.ngOnInit();
    expect(sessionsService.getSessionsByTutor).not.toHaveBeenCalled();
    expect((component as never as {loading: boolean}).loading).toBe(false);
  });
});
