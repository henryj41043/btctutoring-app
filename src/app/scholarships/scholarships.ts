import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {provideNativeDateAdapter} from '@angular/material/core';
import {RouterLink} from '@angular/router';
import {catchError, forkJoin, of} from 'rxjs';
import {AuthService} from '../services/auth.service';
import {ContactService} from '../services/contact.service';
import {StudentService} from '../services/student.service';
import {ScholarshipService} from '../services/scholarship.service';
import {Contact} from '../models/contact.model';
import {Student} from '../models/student.model';
import {StudentStatus} from '../enums/student-status.enum';
import {ScholarshipRecord} from '../models/scholarship-record.model';
import {downloadCsv, toCsvString} from '../utils/csv';
import {TableStateStore} from '../utils/table-state';

/** One at-a-glance row: a scholarship family and its record for the month. */
export interface ScholarshipRow {
  contact: Contact;
  record?: ScholarshipRecord;
}

/**
 * Admin Scholarships page: every scholarship family's monthly checklist at a
 * glance — current families (any ACTIVE scholarship-flagged student) plus
 * any family holding a record for the viewed month
 * (so past months stay complete after a family loses the flag). Rows are
 * read-only; editing happens on the family's contact page. Export = CSV.
 */
@Component({
  selector: 'app-scholarships',
  providers: [provideNativeDateAdapter()],
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTableModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    RouterLink,
  ],
  templateUrl: './scholarships.html',
  styleUrl: './scholarships.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class Scholarships implements OnInit {
  protected authService: AuthService = inject(AuthService);
  private contactService: ContactService = inject(ContactService);
  private studentService: StudentService = inject(StudentService);
  private scholarshipService: ScholarshipService = inject(ScholarshipService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  // Cancels in-flight HTTP work when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);

  // Restores the admin's selected month after navigating away.
  private readonly viewState = new TableStateStore('btc-scholarships-view');

  protected columns: string[] = [
    'family', 'scholarship_name', 'state', 'requested_by_btc',
    'requested_by_family', 'invoice_number', 'paid',
  ];
  protected dataSource = new MatTableDataSource<ScholarshipRow>([]);
  protected selectedDate: Date = new Date();
  /** First-of-month for the selected month, used for the header. */
  protected monthStart: Date = new Date();
  protected loading: boolean = true;

  ngOnInit(): void {
    const savedDate = this.viewState.load().extra?.['selectedDate'];
    if (typeof savedDate === 'string' && !isNaN(Date.parse(savedDate))) {
      this.selectedDate = new Date(savedDate);
    }
    this.loadMonth(this.selectedDate);
  }

  onDateChange(date: Date | null): void {
    if (date) {
      this.selectedDate = date;
      this.viewState.patch({extra: {selectedDate: date.toISOString()}});
      this.loadMonth(date);
    }
  }

  /** 'YYYY-MM' month key for the selected month. */
  private monthKeyOf(date: Date): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  }

  private loadMonth(date: Date): void {
    this.monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    this.loading = true;
    this.dataSource.data = [];
    this.cdr.markForCheck();

    if (!this.authService.isAdmin()) {
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    forkJoin({
      contacts: this.contactService.getContacts().pipe(catchError(() => of([] as Contact[]))),
      students: this.studentService.getStudents().pipe(catchError(() => of([] as Student[]))),
      records: this.scholarshipService
        .getScholarshipRecordsByMonth(this.monthKeyOf(date))
        .pipe(catchError(() => of([] as ScholarshipRecord[]))),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({contacts, students, records}) => {
      this.dataSource.data = this.buildRows(contacts, students, records);
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  /** Current scholarship families ∪ the month's record holders, name-sorted. */
  private buildRows(
    contacts: Contact[],
    students: Student[],
    records: ScholarshipRecord[],
  ): ScholarshipRow[] {
    const recordByContact = new Map(records
      .filter(r => !!r.contact_id)
      .map(r => [r.contact_id!, r]));
    // Active students only (client request): a family whose scholarship
    // student has left stops appearing for NEW months — but any family with a
    // saved record for the viewed month still shows, so history never thins.
    const flaggedContactIds = new Set(students
      .filter(s => !!s.scholarship && !!s.contact_id
        && s.status === StudentStatus.ACTIVE_STUDENT)
      .map(s => s.contact_id!));
    const rowContactIds = new Set([...flaggedContactIds, ...recordByContact.keys()]);

    const rows: ScholarshipRow[] = [];
    for (const contact of contacts) {
      if (!contact.id || !rowContactIds.has(contact.id)) continue;
      rows.push({contact, record: recordByContact.get(contact.id)});
    }
    return rows.sort((a, b) => this.familyName(a).localeCompare(this.familyName(b)));
  }

  familyName(row: ScholarshipRow): string {
    return `${row.contact.first_name ?? ''} ${row.contact.last_name ?? ''}`.trim()
      || (row.contact.email ?? '');
  }

  /** Paid = the month's record carries an invoice-paid date. */
  isPaid(row: ScholarshipRow): boolean {
    return !!row.record?.invoice_paid_date;
  }

  exportCsv(): void {
    const monthKey = this.monthKeyOf(this.selectedDate);
    const header = [
      'Family', 'Scholarship Name', 'State', 'Funds Requested By BTC',
      'Funds Requested By Family', 'Invoice Number', 'Invoice Paid Date',
    ];
    const rows = this.dataSource.data.map(row => [
      this.familyName(row),
      row.contact.scholarship_name ?? '',
      row.record?.scholarship_state ?? '',
      this.csvDate(row.record?.date_funds_requested_by_btc),
      this.csvDate(row.record?.date_funds_requested_by_family),
      row.record?.invoice_number ?? '',
      this.csvDate(row.record?.invoice_paid_date),
    ]);
    downloadCsv(`scholarships-${monthKey}.csv`, toCsvString(header, rows));
  }

  /** 'M/D/YYYY' for Excel, empty when unset (component math — no UTC shift). */
  private csvDate(value: Date | string | number | undefined): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  }
}
