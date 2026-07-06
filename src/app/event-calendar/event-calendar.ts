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
import {MatTableModule} from '@angular/material/table';
import {SessionDialog} from '../session-dialog/session-dialog';
import {Session} from '../models/session.model';
import {MatDialog} from '@angular/material/dialog';
import {SessionRange, SessionsService} from '../services/sessions.service';
import {AuthService} from '../services/auth.service';
import {catchError, Observable, Subject} from 'rxjs';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
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
    MatTableModule,
    MatIconModule,
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
  authService: AuthService = inject(AuthService);
  view: CalendarView = CalendarView.Month;
  viewDate: Date = new Date();
  events: CalendarEvent<Session>[] = [];
  private allSessions: Session[] = [];
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
  refresh = new Subject<void>();
  activeDayIsOpen: boolean = false;

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
      this.events = this.buildCalendarEvents(this.allSessions);
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

    source$.pipe(
      catchError(error => {
        console.log(error);
        return new Observable();
      })
    ).subscribe(response => {
      const sessions: Session[] = response as Session[];
      missing.forEach(anchor => this.fetchedMonths.add(this.monthKey(anchor)));
      // Merge by id so overlapping fetches never duplicate events.
      const byId = new Map(this.allSessions.map(s => [s.id, s]));
      sessions.forEach(s => byId.set(s.id, s));
      this.allSessions = [...byId.values()];
      this.events = this.buildCalendarEvents(this.allSessions);
      this.cdr.markForCheck();
    });
  }

  private buildCalendarEvents(sessions: Session[]): CalendarEvent<Session>[] {
    return sessions.map((session: Session) => {
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
