import {AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {provideNativeDateAdapter} from '@angular/material/core';
import {FormsModule} from '@angular/forms';
import {AuthService} from '../services/auth.service';
import {SessionsService} from '../services/sessions.service';
import {ContactService} from '../services/contact.service';
import {PayrollEntry} from '../models/payroll-entry.model';
import {DatePipe} from '@angular/common';
import {catchError, EMPTY} from 'rxjs';
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
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    DatePipe,
  ],
  templateUrl: './payroll.html',
  styleUrl: './payroll.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Payroll implements OnInit, AfterViewInit {
  private authService: AuthService = inject(AuthService);
  private sessionsService: SessionsService = inject(SessionsService);
  private contactService: ContactService = inject(ContactService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

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

  ngOnInit(): void {
    this.loadPayroll(this.selectedDate);
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
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
        `$${entry.pay_rate}/hr`,
        `$${entry.tutoring_compensation}`,
        entry.planning_time ?? 0,
        `$${entry.planning_rate}/hr`,
        `$${entry.planning_compensation}`,
        `$${entry.total_compensation}`,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 66, 66] },
    });

    doc.save(`payroll-${startStr}-${endStr}.pdf`);
  }

  private loadPayroll(date: Date): void {
    this.endDate = date;
    if (date.getDate() <= 15) {
      this.startDate = new Date(date.getFullYear(), date.getMonth(), 1);
    } else {
      this.startDate = new Date(date.getFullYear(), date.getMonth(), 16);
    }
    this.dataSource.data = [];

    this.contactService.getContacts()
      .pipe(catchError(error => { console.log(error); return EMPTY; }))
      .subscribe(contacts => {
        contacts.forEach(contact => {
          if (contact.service === Service.HIRING && contact.status === Status.STAFF) {
            this.sessionsService.getSessionsByTutor(contact.id!)
              .pipe(catchError(error => { console.log(error); return EMPTY; }))
              .subscribe(sessions => {
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
                this.dataSource.data = [...this.dataSource.data, payrollEntry];
                this.cdr.markForCheck();
              });
          }
        });
      });
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
