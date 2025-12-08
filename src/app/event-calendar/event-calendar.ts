import {Component, OnInit, Inject, Renderer2, ChangeDetectionStrategy, ChangeDetectorRef, inject} from '@angular/core';
import {DatePipe, DOCUMENT} from '@angular/common';
import {
  CalendarDatePipe,
  CalendarDayViewComponent,
  CalendarEvent,
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
import {catchError, Observable} from 'rxjs';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {Response} from '../models/response.model';

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
    DatePipe,
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
  readonly CalendarView: typeof CalendarView = CalendarView;
  readonly sessionDialog: MatDialog = inject(MatDialog);
  sessionsService: SessionsService = inject(SessionsService);
  authService: AuthService = inject(AuthService);
  view: CalendarView = CalendarView.Month;
  viewDate: Date = new Date();
  eventColumns: string[] = ['tutor', 'student', 'start', 'end', 'edit', 'delete'];
  eventData: Session[] = [];
  events: CalendarEvent<Session>[] = [];

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
            calEvents.push({
              title: 'Tutor Session',
              start: new Date(session.start as string),
              end: new Date(session.end as string),
              meta: session
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
            calEvents.push({
              title: 'Tutor Session',
              start: new Date(session.start as string),
              end: new Date(session.end as string),
              meta: session
            });
          });
          this.events = calEvents;
          this.cdr.markForCheck();
        }
      );
    }
  }

  setView(view: CalendarView) {
    this.view = view;
  }

  closeOpenMonthViewDay() {
    console.log(this.view);
    console.log(this.viewDate);
  }

  dayClicked({ date, events }: { date: Date; events: CalendarEvent[] }): void {
    console.log("Clicked: " + date.toLocaleDateString());
    let temp: Session[] = [];
    events.forEach((event) => {
      temp.push(event.meta);
    });
    this.eventData = temp;
    this.cdr.markForCheck();
    console.log(this.eventData);
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
        // TODO: check if result is the same day as events in eventData
        this.eventData = this.eventData.concat(result);
        this.cdr.markForCheck();
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
        this.eventData = this.eventData.map((session: Session): Session => {
          if(session.id === result.id) {
            return result;
          }
          return session;
        });
        this.cdr.markForCheck();
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
        this.eventData = this.eventData.filter(session => session.id !== result.id);
        this.cdr.markForCheck();
        this.updateSessionsData();
      }
    });
  }
}
