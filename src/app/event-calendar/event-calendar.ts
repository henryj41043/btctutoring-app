import {Component, OnInit, Inject, Renderer2, ChangeDetectionStrategy, ChangeDetectorRef} from '@angular/core';
import {DOCUMENT} from '@angular/common';
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
import {MatButton} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatTableModule} from '@angular/material/table';

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
    MatButton,
    MatCardModule,
    MatTableModule,
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
  view: CalendarView = CalendarView.Month;
  viewDate: Date = new Date();
  eventColumns: string[] = ['tutor', 'student', 'start', 'end'];
  eventData: any[] = [];
  events: CalendarEvent<{ tutor: string, student: string}>[] = [
    {
      title: 'Tutor Session',
      start: new Date('Mon Oct 20 2025 14:00:00 GMT-0400 (Eastern Daylight Time)'),
      end: new Date('Mon Oct 20 2025 14:30:00 GMT-0400 (Eastern Daylight Time)'),
      meta: {
        tutor: 'Mario',
        student: 'Bowser',
      }
    },
    {
      title: 'Tutor Session',
      start: new Date('Mon Oct 20 2025 16:00:00 GMT-0400 (Eastern Daylight Time)'),
      end: new Date('Mon Oct 20 2025 17:00:00 GMT-0400 (Eastern Daylight Time)'),
      meta: {
        tutor: 'Peach',
        student: 'Yoshi',
      }
    },
    {
      title: 'Tutor Session',
      start: new Date('Thu Oct 16 2025 14:00:00 GMT-0400 (Eastern Daylight Time)'),
      end: new Date('Thu Oct 16 2025 14:30:00 GMT-0400 (Eastern Daylight Time)'),
      meta: {
        tutor: 'Mario',
        student: 'Bowser',
      }
    }
  ];

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

  setView(view: CalendarView) {
    this.view = view;
  }

  closeOpenMonthViewDay() {
    console.log(this.view);
    console.log(this.viewDate);
  }

  dayClicked({ date, events }: { date: Date; events: CalendarEvent[] }): void {
    console.log("Clicked: " + date.toLocaleDateString());
    let temp: any[] = [];
    events.forEach((event) => {
      temp.push({
        tutor: event.meta.tutor,
        student: event.meta.student,
        start: event.start,
        end: event.end ? event.end : new Date(),
      });
    });
    this.eventData = temp;
    this.cdr.markForCheck();
    console.log(this.eventData);
  }
}
