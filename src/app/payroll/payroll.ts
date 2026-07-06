import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
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
import {PayrollEntry} from '../models/payroll-entry.model';
import {Contact} from '../models/contact.model';
import {Session} from '../models/session.model';
import {CurrencyPipe, DatePipe} from '@angular/common';
import {catchError, EMPTY, forkJoin, map, Observable, of} from 'rxjs';
import {Service} from '../enums/service.enum';
import {Status} from '../enums/status.enum';
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
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

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
        entry.planning_time ?? 0,
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
      this.contactService.getStaff()
        .pipe(catchError(error => {
          console.log(error);
          this.finishLoading([]);
          return EMPTY;
        }))
        .subscribe(contacts => {
          const staff = contacts.filter(contact =>
            contact.service === Service.HIRING && contact.status === Status.STAFF);
          if (staff.length === 0) {
            this.finishLoading([]);
            return;
          }
          forkJoin(staff.map(contact => this.buildPayrollEntry$(contact)))
            .subscribe(entries => this.finishLoading(entries));
        });
    } else {
      // Tutors only ever see their own payroll. Use the already-loaded contact
      // record (the backend blocks non-admins from listing all contacts).
      const self = this.authService.contact();
      if (self?.id) {
        this.buildPayrollEntry$(self).subscribe(entry => this.finishLoading([entry]));
      } else {
        this.finishLoading([]);
      }
    }
  }

  private finishLoading(entries: PayrollEntry[]): void {
    this.dataSource.data = entries;
    this.loading = false;
    this.cdr.markForCheck();
  }

  private buildPayrollEntry$(contact: Contact): Observable<PayrollEntry> {
    // Only fetch the selected pay period (the calculateTime window) instead of
    // the tutor's entire session history.
    const range = {
      from: this.startDate!.toISOString(),
      to: new Date(this.endDate!.getFullYear(), this.endDate!.getMonth(), this.endDate!.getDate(), 23, 59, 59, 999).toISOString(),
    };
    return this.sessionsService.getSessionsByTutor(contact.id!, range).pipe(
      // Return an empty session list on error — EMPTY would never complete and
      // would hang the surrounding forkJoin.
      catchError(error => { console.log(error); return of([] as Session[]); }),
      map(sessions => {
        let payrollEntry: PayrollEntry = new PayrollEntry();
        payrollEntry.name = contact.first_name;
        payrollEntry.pay_rate = contact.hourly_rate ?? 0;
        payrollEntry.planning_rate = 15;
        payrollEntry.administrative_time = 0;
        payrollEntry.tutoring_hours = 0;
        sessions.forEach(session => {
          if (session.type === SessionType.ADMIN) {
            payrollEntry.administrative_time = payrollEntry.administrative_time! + this.calculateTime(session.start_datetime!, session.end_datetime!);
          } else if (session.status === SessionStatus.COMPLETED || session.status === SessionStatus.NO_CALL_NO_SHOW) {
            payrollEntry.tutoring_hours = payrollEntry.tutoring_hours! + this.calculateTime(session.start_datetime!, session.end_datetime!);
          }
        });
        payrollEntry.planning_time = Math.round((payrollEntry.tutoring_hours / 6) * 100) / 100;
        payrollEntry.hours_subtotal = payrollEntry.tutoring_hours + payrollEntry.administrative_time;
        payrollEntry.planning_compensation = Math.round((payrollEntry.planning_time * payrollEntry.planning_rate) * 100) / 100;
        payrollEntry.tutoring_compensation = Math.round((payrollEntry.hours_subtotal * payrollEntry.pay_rate!) * 100) / 100;
        payrollEntry.total_compensation = payrollEntry.planning_compensation + payrollEntry.tutoring_compensation;
        return payrollEntry;
      }),
    );
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
