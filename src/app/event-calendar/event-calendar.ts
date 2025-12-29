import {
  Component,
  OnInit,
  Inject,
  Renderer2,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  LOCALE_ID
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
import {SessionsService} from '../services/sessions.service';
import {AuthService} from '../services/auth.service';
import {catchError, Observable, Subject} from 'rxjs';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {Response} from '../models/response.model';
import {isSameDay, isSameMonth} from 'date-fns';
import { EventColor } from 'calendar-utils';

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
    this.applySystemTheme();
    // Listen for changes in system theme preference
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      this.applySystemTheme();
    });
    this.updateSessionsData();
  }

  private applySystemTheme(): void {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.renderer.addClass(this.document.body, 'dark-theme');
      this.renderer.removeClass(this.document.body, 'light-theme');
    } else {
      this.renderer.addClass(this.document.body, 'light-theme');
      this.renderer.removeClass(this.document.body, 'dark-theme');
    }
  }

  private updateSessionsData(): void {
    if(this.authService.user().groups.includes('Admins')) {
      this.sessionsService.getAllSessions().pipe(
        catchError(error => {
          console.log(error);
          return new Observable();
        })
      ).subscribe(
        response => {
          console.log(response);
          let sessions: Session[] = response as Session[];
          let calEvents: CalendarEvent<Session>[] = [];
          sessions.forEach((session: Session): void => {
            let color: EventColor = this.setColor(session.status as string);
            calEvents.push({
              title: `${session.tutor_name} with ${session.student_name} - ${formatDate(new Date(session.start_datetime as string), 'h:mm a', this.locale)} to ${formatDate(new Date(session.end_datetime as string), 'h:m a', this.locale)}`,
              start: new Date(session.start_datetime as string),
              end: new Date(session.end_datetime as string),
              meta: session,
              actions: this.actions,
              color: color,
              resizable: {
                beforeStart: true,
                afterEnd: true,
              },
              draggable: true,
            });
          });
          this.events = calEvents;
          this.cdr.markForCheck();
        }
      );
    } else {
      this.sessionsService.getSessionsByTutor(this.authService.user().email).pipe(
        catchError(error => {
          console.log(error);
          return new Observable();
        })
      ).subscribe(
        response => {
          console.log(response);
          let sessions: Session[] = response as Session[];
          let calEvents: CalendarEvent<Session>[] = [];
          sessions.forEach((session: Session): void => {
            let color: EventColor = this.setColor(session.status as string);
            calEvents.push({
              title: `${session.tutor_name} with ${session.student_name} - ${formatDate(new Date(session.start_datetime as string), 'h:mm a', this.locale)} to ${formatDate(new Date(session.end_datetime as string), 'h:m a', this.locale)}`,
              start: new Date(session.start_datetime as string),
              end: new Date(session.end_datetime as string),
              meta: session,
              actions: this.actions,
              color: color,
              resizable: {
                beforeStart: true,
                afterEnd: true,
              },
              draggable: true,
            });
          });
          this.events = calEvents;
          this.cdr.markForCheck();
        }
      );
    }
  }

  private setColor(status: string): EventColor {
    switch (status) {
      case 'pending':
        return colors['yellow'];
      case 'completed':
        return colors['green'];
      case 'makeup':
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
      data: {type: 'create', session: new Session()},
    });

    sessionDialogRef.afterClosed().subscribe((result: Session): void => {
      console.log('The dialog was closed');
      if (result !== undefined) {
        console.log(result);
        this.updateSessionsData();
      }
    });
  }

  openEditSessionDialog(item: any): void {
    console.log('openEditSessionDialog');
    const sessionDialogRef = this.sessionDialog.open(SessionDialog, {
      data: {type: 'edit', session: item},
    });

    sessionDialogRef.afterClosed().subscribe((result: Session): void => {
      console.log('The dialog was closed');
      if (result !== undefined) {
        console.log(result);
        this.updateSessionsData();
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
        this.updateSessionsData();
      }
    });
  }
}
