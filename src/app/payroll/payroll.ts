import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit, ViewChild} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {provideNativeDateAdapter} from '@angular/material/core';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {FormsModule} from '@angular/forms';
import {AuthService} from '../services/auth.service';
import {SessionsService} from '../services/sessions.service';
import {ContactService} from '../services/contact.service';
import {StudentService} from '../services/student.service';
import {PayrollEntry} from '../models/payroll-entry.model';
import {Contact} from '../models/contact.model';
import {Session} from '../models/session.model';
import {Student} from '../models/student.model';
import {CurrencyPipe, DatePipe} from '@angular/common';
import {catchError, forkJoin, map, Observable, of} from 'rxjs';
import {Service} from '../enums/service.enum';
import {StaffStatus} from '../enums/staff-status.enum';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';

@Component({
  selector: 'app-payroll',
  providers: [provideNativeDateAdapter()],
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    FormsModule,
    DatePipe,
    CurrencyPipe,
  ],
  templateUrl: './payroll.html',
  styleUrl: './payroll.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Payroll implements OnInit {
  private authService: AuthService = inject(AuthService);
  private sessionsService: SessionsService = inject(SessionsService);
  private contactService: ContactService = inject(ContactService);
  private studentService: StudentService = inject(StudentService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  // Cancels in-flight HTTP work when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);

  // Setter-based ViewChilds: the table renders inside an @if, so these don't
  // exist yet at ngAfterViewInit and must be wired when they appear.
  @ViewChild(MatSort) set matSort(sort: MatSort) {
    if (sort) { this.dataSource.sort = sort; }
  }
  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) { this.dataSource.paginator = paginator; }
  }

  protected payrollColumns: string[] = [
    'name',
    'tutoring_hours',
    'administrative_time',
    'hours_subtotal',
    'pay_rate',
    'tutoring_compensation',
    'planning_time',
    'planning_rate',
    'planning_compensation',
    'total_compensation',
  ];
  protected dataSource = new MatTableDataSource<PayrollEntry>([]);
  protected startDate: Date | undefined;
  protected endDate: Date | undefined;
  protected selectedDate: Date = new Date();
  protected loading: boolean = true;

  ngOnInit(): void {
    this.loadPayroll(this.selectedDate);
  }

  onDateChange(date: Date | null): void {
    if (date) {
      this.selectedDate = date;
      this.loadPayroll(date);
    }
  }

  exportPDF(): void {
    const startStr = this.startDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) ?? '';
    const endStr = this.endDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) ?? '';

    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Beyond the Chalkboard Tutoring', 14, 16);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Payroll: ${startStr} – ${endStr}`, 14, 23);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 28,
      margin: { top: 28, bottom: 18 },
      showHead: 'everyPage',
      head: [[
        'Staff Name', 'Tutoring (hrs)', 'Admin Time (hrs)', 'Subtotal (hrs)',
        'Pay Rate', 'Tutoring Comp', 'Planning (hrs)', 'Planning Rate',
        'Planning Comp', 'Total Comp',
      ]],
      body: this.dataSource.data.map(entry => [
        entry.name ?? '',
        entry.tutoring_hours ?? 0,
        entry.administrative_time ?? 0,
        entry.hours_subtotal ?? 0,
        `${this.formatMoney(entry.pay_rate)}/hr`,
        this.formatMoney(entry.tutoring_compensation),
        this.formatPlanningTime(entry),
        `${this.formatMoney(entry.planning_rate)}/hr`,
        this.formatMoney(entry.planning_compensation),
        this.formatMoney(entry.total_compensation),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [17, 138, 178] },
    });

    // Add total page count to each page's footer ("Page X of Y").
    const totalPages = doc.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
      doc.setTextColor(0);
    }

    doc.save(`payroll-${startStr}-${endStr}.pdf`);
  }

  /** Planning cell text: base hours plus any extra-planning credit, e.g. "2.33 +0.5". */
  protected formatPlanningTime(entry: PayrollEntry): string {
    const base = `${entry.planning_time ?? 0}`;
    return entry.extra_planning_time ? `${base} +${entry.extra_planning_time}` : base;
  }

  /** Formats a numeric amount as USD with dollars and cents, e.g. $40.20 / $1,250.00. */
  private formatMoney(value: number | undefined | null): string {
    return (value ?? 0).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private loadPayroll(date: Date): void {
    this.endDate = date;
    if (date.getDate() <= 15) {
      this.startDate = new Date(date.getFullYear(), date.getMonth(), 1);
    } else {
      this.startDate = new Date(date.getFullYear(), date.getMonth(), 16);
    }
    this.dataSource.data = [];
    this.loading = true;
    this.cdr.markForCheck();

    if (this.authService.isAdmin()) {
      // Admins see payroll for every staff tutor (server-side staff filter).
      // ONE sessions fetch for the whole pay period, grouped per tutor in
      // memory — a per-tutor fetch here previously landed N concurrent
      // requests on the backend at once. Students are fetched alongside for
      // their extra-planning credits; any failed fetch degrades to an empty
      // slice, not a blank page.
      forkJoin({
        contacts: this.contactService.getStaff()
          .pipe(catchError(error => { console.log(error); return of([] as Contact[]); })),
        students: this.studentService.getStudents()
          .pipe(catchError(error => { console.log(error); return of([] as Student[]); })),
        sessions: this.sessionsService.getAllSessions(this.payPeriodRange())
          .pipe(catchError(error => { console.log(error); return of([] as Session[]); })),
      }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({contacts, students, sessions}) => {
        const staff = contacts.filter(contact =>
          contact.service === Service.HIRING && contact.status === StaffStatus.ACTIVE_STAFF);
        const extraByStudent = this.extraMinutesByStudent(students);
        const sessionsByTutor = new Map<string, Session[]>();
        sessions.forEach(session => {
          if (session.tutor_id) {
            const list = sessionsByTutor.get(session.tutor_id) ?? [];
            list.push(session);
            sessionsByTutor.set(session.tutor_id, list);
          }
        });
        this.finishLoading(staff.map(contact =>
          this.buildPayrollEntry(contact, sessionsByTutor.get(contact.id!) ?? [], extraByStudent)));
      });
    } else {
      // Tutors only ever see their own payroll. Use the already-loaded contact
      // record (the backend blocks non-admins from listing all contacts).
      const self = this.authService.contact();
      if (self?.id) {
        this.studentService.getStudentsByTutor(self.id)
          .pipe(
            catchError(error => { console.log(error); return of([] as Student[]); }),
            takeUntilDestroyed(this.destroyRef),
          )
          .subscribe(students => {
            this.buildPayrollEntry$(self, this.extraMinutesByStudent(students))
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe(entry => this.finishLoading([entry]));
          });
      } else {
        this.finishLoading([]);
      }
    }
  }

  /** The selected pay period as an ISO range (the calculateTime window). */
  private payPeriodRange(): {from: string; to: string} {
    return {
      from: this.startDate!.toISOString(),
      to: new Date(this.endDate!.getFullYear(), this.endDate!.getMonth(), this.endDate!.getDate(), 23, 59, 59, 999).toISOString(),
    };
  }

  /** student id → extra planning minutes credited per counted session. */
  private extraMinutesByStudent(students: Student[]): Map<string, number> {
    return new Map(students
      .filter(s => !!s.id && (s.extra_planning_minutes ?? 0) > 0)
      .map(s => [s.id!, s.extra_planning_minutes!]));
  }

  private finishLoading(entries: PayrollEntry[]): void {
    this.dataSource.data = entries;
    this.loading = false;
    this.cdr.markForCheck();
  }

  /** Tutor path: fetch only the tutor's own pay-period sessions, then build. */
  private buildPayrollEntry$(contact: Contact, extraByStudent: Map<string, number>): Observable<PayrollEntry> {
    return this.sessionsService.getSessionsByTutor(contact.id!, this.payPeriodRange()).pipe(
      // Return an empty session list on error — EMPTY would never complete and
      // would hang the surrounding forkJoin.
      catchError(error => { console.log(error); return of([] as Session[]); }),
      map(sessions => this.buildPayrollEntry(contact, sessions, extraByStudent)),
    );
  }

  private buildPayrollEntry(contact: Contact, sessions: Session[], extraByStudent: Map<string, number>): PayrollEntry {
    let payrollEntry: PayrollEntry = new PayrollEntry();
    payrollEntry.name = contact.first_name;
    payrollEntry.pay_rate = contact.hourly_rate ?? 0;
    payrollEntry.planning_rate = 15;
    payrollEntry.administrative_time = 0;
    payrollEntry.tutoring_hours = 0;
    let extraPlanningMinutes = 0;
    sessions.forEach(session => {
      if (session.type === SessionType.ADMIN) {
        payrollEntry.administrative_time = payrollEntry.administrative_time! + this.calculateTime(session.start_datetime!, session.end_datetime!);
      } else if (session.status === SessionStatus.COMPLETED || session.status === SessionStatus.NO_CALL_NO_SHOW) {
        const counted = this.calculateTime(session.start_datetime!, session.end_datetime!);
        payrollEntry.tutoring_hours = payrollEntry.tutoring_hours! + counted;
        // Per-session extra planning credit for tagged students — only for
        // sessions inside the pay period (calculateTime returns 0 outside).
        if (counted > 0 && session.student_id) {
          extraPlanningMinutes += extraByStudent.get(session.student_id) ?? 0;
        }
      }
    });
    payrollEntry.planning_time = Math.round((payrollEntry.tutoring_hours / 6) * 100) / 100;
    payrollEntry.extra_planning_time = Math.round((extraPlanningMinutes / 60) * 100) / 100;
    payrollEntry.hours_subtotal = payrollEntry.tutoring_hours + payrollEntry.administrative_time;
    payrollEntry.planning_compensation = Math.round(((payrollEntry.planning_time + payrollEntry.extra_planning_time) * payrollEntry.planning_rate) * 100) / 100;
    payrollEntry.tutoring_compensation = Math.round((payrollEntry.hours_subtotal * payrollEntry.pay_rate!) * 100) / 100;
    payrollEntry.total_compensation = payrollEntry.planning_compensation + payrollEntry.tutoring_compensation;
    return payrollEntry;
  }

  private calculateTime(startTime: string, endTime: string): number {
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    if (startDate.getTime() < this.endDate!.getTime() && startDate.getTime() > this.startDate!.getTime()) {
      const msInHour = 1000 * 60 * 60;
      return Math.round(((endDate.getTime() - startDate.getTime()) / msInHour) * 100) / 100;
    }
    return 0;
  }
}
