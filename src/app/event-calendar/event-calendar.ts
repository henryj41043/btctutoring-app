import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  inject,
  LOCALE_ID,
  OnInit,
  Renderer2
} from '@angular/core';
import {DOCUMENT, formatDate} from '@angular/common';
import {
  CalendarDatePipe,
  CalendarDayViewComponent,
  CalendarEvent,
  CalendarEventAction,
  CalendarEventTimesChangedEvent,
  CalendarMonthViewComponent,
  CalendarNextViewDirective,
  CalendarPreviousViewDirective,
  CalendarTodayDirective,
  CalendarView,
  CalendarWeekViewComponent,
  DateAdapter,
  provideCalendar
} from 'angular-calendar';
import {adapterFactory} from 'angular-calendar/date-adapters/date-fns';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatTableModule} from '@angular/material/table';
import {SessionDialog} from '../session-dialog/session-dialog';
import {Session} from '../models/session.model';
import {MatDialog} from '@angular/material/dialog';
import {SessionRange, SessionsService} from '../services/sessions.service';
import {ReminderService} from '../services/reminder.service';
import {Reminder} from '../models/reminder.model';
import {ReminderDialog, ReminderDialogMode} from '../reminder-dialog/reminder-dialog';
import {ContactService} from '../services/contact.service';
import {Contact} from '../models/contact.model';
import {AuthService} from '../services/auth.service';
import {catchError, Observable, Subject} from 'rxjs';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {Response} from '../models/response.model';
import {isSameDay, isSameMonth} from 'date-fns';
import {EventColor} from 'calendar-utils';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';
import {UserGroup} from '../enums/user-group.enum';

const colors: Record<string, EventColor> = {
  red: {
    primary: '#ad2121',
    secondary: '#ff7f7f',
  },
  blue: {
    primary: '#0083ff',
    secondary: '#53a8ff',
  },
  yellow: {
    primary: '#e3bc08',
    secondary: '#FDF1BA',
  },
  green: {
    primary: '#18c100',
    secondary: '#87ff78',
  },
  purple: {
    primary: '#7b2fbe',
    secondary: '#d8b4fe',
  },
  orange: {
    primary: '#e07b00',
    secondary: '#ffd9ad',
  },
};

@Component({
  selector: 'app-event-calendar',
  imports: [
    CalendarPreviousViewDirective,
    CalendarTodayDirective,
    CalendarNextViewDirective,
    CalendarMonthViewComponent,
    CalendarWeekViewComponent,
    CalendarDayViewComponent,
    CalendarDatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './event-calendar.html',
  styleUrl: './event-calendar.scss',
  providers: [
    provideCalendar({
      provide: DateAdapter,
      useFactory: adapterFactory,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true
})
export class EventCalendar implements OnInit {
  private locale = inject(LOCALE_ID);
  readonly CalendarView: typeof CalendarView = CalendarView;
  readonly sessionDialog: MatDialog = inject(MatDialog);
  sessionsService: SessionsService = inject(SessionsService);
  reminderService: ReminderService = inject(ReminderService);
  contactService: ContactService = inject(ContactService);
  authService: AuthService = inject(AuthService);
  view: CalendarView = CalendarView.Month;
  viewDate: Date = new Date();
  events: CalendarEvent<Session | Reminder>[] = [];
  /** True while a month window is being fetched (inline header spinner). */
  loading: boolean = false;
  private allSessions: Session[] = [];
  // Admin-only reminder entries rendered alongside sessions (all-day, blue).
  private reminders: Reminder[] = [];
  // Admin contacts for the reminder dialog's recipient picker.
  private admins: Contact[] = [];
  // All contacts for the dialog's optional linked-contact picker.
  private contacts: Contact[] = [];
  actions: CalendarEventAction[] = [
    {
      label: '<i class="fas fa-fw fa-pencil-alt"></i>',
      a11yLabel: 'Edit',
      onClick: ({ event }: { event: CalendarEvent }): void => {
        this.handleEvent('Edited', event);
      },
    },
    {
      label: '<i class="fas fa-fw fa-trash-alt"></i>',
      a11yLabel: 'Delete',
      onClick: ({ event }: { event: CalendarEvent }): void => {
        this.handleEvent('Deleted', event);
      },
    },
  ];
  reminderActions: CalendarEventAction[] = [
    {
      label: '<i class="fas fa-fw fa-pencil-alt"></i>',
      a11yLabel: 'Edit',
      onClick: ({ event }: { event: CalendarEvent }): void => {
        this.openReminderDialog('edit', event.meta as Reminder);
      },
    },
    {
      label: '<i class="fas fa-fw fa-trash-alt"></i>',
      a11yLabel: 'Delete',
      onClick: ({ event }: { event: CalendarEvent }): void => {
        this.openReminderDialog('delete', event.meta as Reminder);
      },
    },
  ];
  refresh = new Subject<void>();
  activeDayIsOpen: boolean = false;
  // Display-only tutor/student filter (case-insensitive contains). The
  // fetched-month cache is untouched; clearing the box shows everything.
  protected filterText: string = '';

  constructor(
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // App is locked to a single light theme to stay consistent with the brand.
    this.renderer.addClass(this.document.body, 'light-theme');
    this.renderer.removeClass(this.document.body, 'dark-theme');
    this.updateSessionsData();
    this.loadReminders();
  }

  // Months ('YYYY-MM') whose sessions are already loaded. Sessions are fetched
  // per visible month (±1 buffer) instead of the whole table, and merged in.
  private fetchedMonths = new Set<string>();

  private monthKey(date: Date): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  }

  /** The visible month ±1 as month-anchor dates. */
  private visibleWindow(): Date[] {
    const y = this.viewDate.getFullYear();
    const m = this.viewDate.getMonth();
    return [new Date(y, m - 1, 1), new Date(y, m, 1), new Date(y, m + 1, 1)];
  }

  /** Refetches when the viewDate moves into months not yet loaded. */
  onViewDateChange(): void {
    this.activeDayIsOpen = false;
    this.updateSessionsData();
  }

  private updateSessionsData(force: boolean = false): void {
    const isAdmin = this.authService.isAdmin();
    const isTutor = this.authService.user().groups.includes(UserGroup.TUTORS);
    if (!isAdmin && !isTutor) {
      this.events = [];
      this.cdr.markForCheck();
      return;
    }

    if (force) {
      // Data changed (session created/edited/deleted) — drop the cache and
      // reload the visible window fresh.
      this.fetchedMonths.clear();
      this.allSessions = [];
    }

    const missing = this.visibleWindow().filter(
      anchor => !this.fetchedMonths.has(this.monthKey(anchor)),
    );
    if (missing.length === 0) {
      this.rebuildEvents();
      this.cdr.markForCheck();
      return;
    }

    // One span covering every missing month.
    const first = missing[0];
    const last = missing[missing.length - 1];
    const range: SessionRange = {
      from: new Date(first.getFullYear(), first.getMonth(), 1).toISOString(),
      to: new Date(last.getFullYear(), last.getMonth() + 1, 0, 23, 59, 59, 999).toISOString(),
    };
    const source$ = isAdmin
      ? this.sessionsService.getAllSessions(range)
      : this.sessionsService.getSessionsByTutor(this.authService.contact().id!, range);

    this.loading = true;
    this.cdr.markForCheck();
    source$.pipe(
      catchError(error => {
        console.log(error);
        this.loading = false;
        this.cdr.markForCheck();
        return new Observable();
      })
    ).subscribe(response => {
      this.loading = false;
      const sessions: Session[] = response as Session[];
      missing.forEach(anchor => this.fetchedMonths.add(this.monthKey(anchor)));
      // Merge by id so overlapping fetches never duplicate events.
      const byId = new Map(this.allSessions.map(s => [s.id, s]));
      sessions.forEach(s => byId.set(s.id, s));
      this.allSessions = [...byId.values()];
      this.rebuildEvents();
      this.cdr.markForCheck();
    });
  }

  /** Filters the visible events by tutor or student name and re-renders. */
  applyFilter(value: string): void {
    this.filterText = value.trim().toLowerCase();
    // The open-day list would otherwise keep showing filtered-out events.
    this.activeDayIsOpen = false;
    this.rebuildEvents();
    this.cdr.markForCheck();
  }

  /** Sessions + (for admins) reminders, with the display filter applied. */
  private rebuildEvents(): void {
    this.events = [
      ...this.buildCalendarEvents(this.allSessions),
      ...this.buildReminderEvents(this.reminders),
    ];
  }

  /** Admin-only: reminders and the admin contacts for the dialog's recipients. */
  private loadReminders(): void {
    if (!this.authService.isAdmin()) {
      return;
    }
    this.reminderService.getReminders().pipe(
      catchError(error => {
        console.log(error);
        return new Observable<never>();
      })
    ).subscribe(reminders => {
      this.reminders = reminders as Reminder[];
      this.rebuildEvents();
      this.cdr.markForCheck();
    });
    this.contactService.getContacts().pipe(
      catchError(error => {
        console.log(error);
        return new Observable<never>();
      })
    ).subscribe(contacts => {
      this.contacts = contacts as Contact[];
      this.admins = (contacts as Contact[]).filter(c => c.user_group === UserGroup.ADMINS);
      this.cdr.markForCheck();
    });
  }

  isReminderEvent(event: CalendarEvent<Session | Reminder>): boolean {
    return (event.meta as Reminder | undefined)?.entry_type === 'reminder';
  }

  openReminderDialog(mode: ReminderDialogMode, reminder?: Reminder): void {
    const ref = this.sessionDialog.open(ReminderDialog, {
      data: {mode, reminder, admins: this.admins, contacts: this.contacts},
      width: '440px',
    });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.loadReminders();
      }
    });
  }

  /** Reminders render as all-day, non-interactive-drag entries in blue. */
  private buildReminderEvents(reminders: Reminder[]): CalendarEvent<Reminder>[] {
    return reminders
      .filter(reminder => this.reminderMatchesFilter(reminder))
      .map((reminder: Reminder) => {
        const [y, m, d] = (reminder.date ?? '').split('-').map(Number);
        const day = y && m && d ? new Date(y, m - 1, d) : new Date(reminder.date as string);
        return {
          title: `[Reminder] ${reminder.title}`,
          start: day,
          end: day,
          allDay: true,
          meta: {...reminder, entry_type: 'reminder' as const},
          actions: this.reminderActions,
          color: colors['blue'],
          resizable: { beforeStart: false, afterEnd: false },
          draggable: false,
        };
      });
  }

  private reminderMatchesFilter(reminder: Reminder): boolean {
    if (!this.filterText) return true;
    const haystack = `${reminder.title ?? ''} ${reminder.message ?? ''}`.toLowerCase();
    return haystack.includes(this.filterText);
  }

  private matchesFilter(session: Session): boolean {
    if (!this.filterText) return true;
    const haystack = `${session.tutor_name ?? ''} ${session.student_name ?? ''}`.toLowerCase();
    return haystack.includes(this.filterText);
  }

  private buildCalendarEvents(sessions: Session[]): CalendarEvent<Session>[] {
    return sessions.filter(session => this.matchesFilter(session)).map((session: Session) => {
      const isAdmin = session.type === SessionType.ADMIN;
      const isMakeUp = session.type === SessionType.MAKE_UP;
      const timeRange = `${formatDate(new Date(session.start_datetime as string), 'h:mm a', this.locale)} to ${formatDate(new Date(session.end_datetime as string), 'h:mm a', this.locale)}`;
      return {
        title: isAdmin
          ? `${session.tutor_name} - Admin Time - ${timeRange}`
          : `${isMakeUp ? '[Make-up] ' : ''}${session.tutor_name} with ${session.student_name} - ${timeRange}`,
        start: new Date(session.start_datetime as string),
        end: new Date(session.end_datetime as string),
        meta: session,
        actions: this.actions,
        color: this.setColor(session.type, session.status),
        resizable: { beforeStart: true, afterEnd: true },
        draggable: true,
      };
    });
  }

  private setColor(type: SessionType | undefined, status: SessionStatus | undefined): EventColor {
    if (type === SessionType.ADMIN) {
      return colors['purple'];
    }
    if (type === SessionType.MAKE_UP) {
      // Orange marks a SCHEDULED make-up; once finalized it takes the outcome
      // color so a glance distinguishes held make-ups from upcoming ones.
      if (status === SessionStatus.COMPLETED) {
        return colors['green'];
      }
      if (status === SessionStatus.NO_CALL_NO_SHOW) {
        return colors['red'];
      }
      return colors['orange'];
    }
    switch (status) {
      case SessionStatus.PENDING:
        return colors['yellow'];
      case SessionStatus.COMPLETED:
        return colors['green'];
      case SessionStatus.CANCELLED:
        return colors['red'];
      case SessionStatus.NO_CALL_NO_SHOW:
        return colors['red'];
      default:
        return colors['yellow'];
    }
  }

  setView(view: CalendarView) {
    this.view = view;
  }

  closeOpenMonthViewDay() {
    console.log(this.view);
    console.log(this.viewDate);
    this.activeDayIsOpen = false;
  }

  dayClicked({ date, events }: { date: Date; events: CalendarEvent[] }): void {
    console.log("Clicked: " + date.toLocaleDateString());
    if (isSameMonth(date, this.viewDate)) {
      this.activeDayIsOpen = !((isSameDay(this.viewDate, date) && this.activeDayIsOpen) || events.length === 0);
      this.viewDate = date;
    }
  }

  eventTimesChanged({event, newStart, newEnd,}: CalendarEventTimesChangedEvent): void {
    if (this.isReminderEvent(event)) {
      return; // reminders are not draggable/resizable
    }
    this.events = this.events.map((iEvent) => {
      if (iEvent === event) {
        event.meta.start = newStart.toISOString();
        event.meta.end = newEnd?.toISOString();
        return {
          ...event,
          start: newStart,
          end: newEnd,
        };
      }
      return iEvent;
    });
    this.handleEvent('Dropped or resized', event);
  }

  handleEvent(action: string, event: CalendarEvent): void {
    if (this.isReminderEvent(event)) {
      // Reminders route to their own dialog; they are never drag/resized.
      if (action === 'Deleted') {
        this.openReminderDialog('delete', event.meta as Reminder);
      } else {
        this.openReminderDialog('edit', event.meta as Reminder);
      }
      return;
    }
    switch (action) {
      case 'Edited':
        this.openEditSessionDialog(event.meta);
        break;
      case 'Clicked':
        this.openEditSessionDialog(event.meta);
        break;
      case 'Dropped or resized':
        this.openEditSessionDialog(event.meta);
        break;
      case 'Deleted':
        this.openDeleteSessionDialog(event.meta);
        break;
    }
  }

  openCreateSessionDialog(): void {
    console.log('openCreateSessionDialog');
    const sessionDialogRef = this.sessionDialog.open(SessionDialog, {
      data: {type: 'create', session: new Session(), existingSessions: this.allSessions},
    });

    sessionDialogRef.afterClosed().subscribe((result: Session): void => {
      console.log('The dialog was closed');
      if (result !== undefined) {
        console.log(result);
        this.updateSessionsData(true);
      }
    });
  }

  openEditSessionDialog(item: any): void {
    console.log('openEditSessionDialog');
    const sessionDialogRef = this.sessionDialog.open(SessionDialog, {
      data: {type: 'edit', session: item, existingSessions: this.allSessions},
    });

    sessionDialogRef.afterClosed().subscribe((result: Session): void => {
      console.log('The dialog was closed');
      if (result !== undefined) {
        console.log(result);
        this.updateSessionsData(true);
      }
    });
  }

  openDeleteSessionDialog(item: any): void {
    console.log('openDeleteSessionDialog');
    const sessionDialogRef = this.sessionDialog.open(SessionDialog, {
      data: {type: 'delete', session: item},
    });

    sessionDialogRef.afterClosed().subscribe((result: Response): void => {
      console.log('The dialog was closed');
      if (result !== undefined) {
        console.log(result);
        this.updateSessionsData(true);
      }
    });
  }
}
