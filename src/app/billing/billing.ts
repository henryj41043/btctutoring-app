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
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatTooltipModule} from '@angular/material/tooltip';
import {provideNativeDateAdapter} from '@angular/material/core';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {FormsModule} from '@angular/forms';
import {AuthService} from '../services/auth.service';
import {ContactService} from '../services/contact.service';
import {StudentService} from '../services/student.service';
import {BillingService} from '../services/billing.service';
import {Contact} from '../models/contact.model';
import {Student} from '../models/student.model';
import {BillingRecord} from '../models/billing-record.model';
import {BillingEntry} from '../models/billing-entry.model';
import {CurrencyPipe, DatePipe} from '@angular/common';
import {catchError, EMPTY, forkJoin, of} from 'rxjs';
import {Status} from '../enums/status.enum';
import {BillingCycle} from '../enums/billing-cycle.enum';
import {studentMonthlyCharge, studentSemiMonthlyCharge, studentNeedsAttention} from '../utils/billing-amount';
import {round2} from '../utils/package-config';

@Component({
  selector: 'app-billing',
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
    MatCheckboxModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    FormsModule,
    DatePipe,
    CurrencyPipe,
  ],
  templateUrl: './billing.html',
  styleUrl: './billing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Billing implements OnInit {
  protected authService: AuthService = inject(AuthService);
  private contactService: ContactService = inject(ContactService);
  private studentService: StudentService = inject(StudentService);
  private billingService: BillingService = inject(BillingService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

  @ViewChild(MatSort) set matSort(sort: MatSort) {
    if (sort) { this.dataSource.sort = sort; }
  }
  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) { this.dataSource.paginator = paginator; }
  }

  protected billingColumns: string[] = [
    'name', 'packages', 'cycle', 'due_first', 'due_fifteenth', 'total', 'paid',
  ];
  protected dataSource = new MatTableDataSource<BillingEntry>([]);
  protected selectedDate: Date = new Date();
  protected loading: boolean = true;
  /** First-of-month for the selected billing month, used for the header. */
  protected monthStart: Date = new Date();

  ngOnInit(): void {
    this.loadBilling(this.selectedDate);
  }

  onDateChange(date: Date | null): void {
    if (date) {
      this.selectedDate = date;
      this.loadBilling(date);
    }
  }

  /** 'YYYY-MM-DD' period key for the selected month and day-of-month. */
  private periodKey(date: Date, day: number): string {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${y}-${m}-${day.toString().padStart(2, '0')}`;
  }

  /** Normalizes a contact's billing cycle, treating the legacy 'biweekly' as semi-monthly. */
  private normalizeCycle(cycle: string | undefined): string {
    if (cycle === BillingCycle.SEMI_MONTHLY || cycle === 'biweekly') {
      return BillingCycle.SEMI_MONTHLY;
    }
    return BillingCycle.MONTHLY;
  }

  protected isSemiMonthly(entry: BillingEntry): boolean {
    return entry.cycle === BillingCycle.SEMI_MONTHLY;
  }

  private loadBilling(date: Date): void {
    this.monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    this.loading = true;
    this.dataSource.data = [];
    this.cdr.markForCheck();

    if (!this.authService.isAdmin()) {
      this.finishLoading([]);
      return;
    }

    forkJoin({
      contacts: this.contactService.getContacts().pipe(catchError(() => of([] as Contact[]))),
      students: this.studentService.getStudents().pipe(catchError(() => of([] as Student[]))),
      records: this.billingService.getBillingRecords().pipe(catchError(() => of([] as BillingRecord[]))),
    }).subscribe(({contacts, students, records}) => {
      this.finishLoading(this.buildEntries(date, contacts, students, records));
    });
  }

  private buildEntries(
    date: Date,
    contacts: Contact[],
    students: Student[],
    records: BillingRecord[],
  ): BillingEntry[] {
    const year = date.getFullYear();
    const month = date.getMonth();
    const periodFirst = this.periodKey(date, 1);
    const periodFifteenth = this.periodKey(date, 15);
    const recordMap = new Map<string, BillingRecord>();
    for (const r of records) {
      recordMap.set(`${r.contact_id}#${r.period_start}`, r);
    }

    // Group billable students (active, with a package) by their parent contact.
    const byContact = new Map<string, Student[]>();
    for (const s of students) {
      if (s.status !== Status.ACTIVE_STUDENT || !s.package || !s.contact_id) continue;
      const list = byContact.get(s.contact_id) ?? [];
      list.push(s);
      byContact.set(s.contact_id, list);
    }

    const entries: BillingEntry[] = [];
    for (const [contactId, contactStudents] of byContact) {
      const contact = contacts.find(c => c.id === contactId);
      if (!contact) continue;

      const cycle = this.normalizeCycle(contact.billing_cycle);
      const semi = cycle === BillingCycle.SEMI_MONTHLY;

      let dueFirst: number | null;
      let dueFifteenth: number | null;
      let total: number;
      if (semi) {
        let first = 0;
        let fifteenth = 0;
        for (const s of contactStudents) {
          const charge = studentSemiMonthlyCharge(s, year, month);
          first += charge.first;
          fifteenth += charge.fifteenth;
        }
        first = round2(first);
        fifteenth = round2(fifteenth);
        total = round2(first + fifteenth);
        // A half with no charge (e.g. the blank side of a prorated first month,
        // billed in full on the other date) renders as blank rather than $0.00.
        dueFirst = first === 0 ? null : first;
        dueFifteenth = fifteenth === 0 ? null : fifteenth;
      } else {
        total = round2(contactStudents.reduce((sum, s) => sum + studentMonthlyCharge(s, year, month), 0));
        dueFirst = total;
        dueFifteenth = null;
      }
      if (total <= 0) continue; // nobody is billable this month

      const entry: BillingEntry = {
        contact_id: contactId,
        name: `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim(),
        packages: contactStudents.map(s => `${s.name}: ${s.package}`).join('; '),
        cycle,
        due_first: dueFirst,
        due_fifteenth: dueFifteenth,
        total,
        paid_first: recordMap.get(`${contactId}#${periodFirst}`)?.paid ?? false,
        paid_fifteenth: semi ? (recordMap.get(`${contactId}#${periodFifteenth}`)?.paid ?? false) : false,
        needs_attention: contactStudents.some(studentNeedsAttention),
      };
      entries.push(entry);
    }
    return entries.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }

  private finishLoading(entries: BillingEntry[]): void {
    this.dataSource.data = entries;
    this.loading = false;
    this.cdr.markForCheck();
  }

  /** Persists a paid/unpaid toggle for one half of a contact's billing month. */
  togglePaid(entry: BillingEntry, half: 'first' | 'fifteenth', checked: boolean): void {
    const period = this.periodKey(this.selectedDate, half === 'first' ? 1 : 15);
    const amount = (half === 'first' ? entry.due_first : entry.due_fifteenth) ?? 0;
    const record: BillingRecord = {
      contact_id: entry.contact_id,
      period_start: period,
      cycle: entry.cycle,
      amount,
      paid: checked,
      paid_date: checked ? new Date().toISOString() : undefined,
    };
    this.billingService.upsertBillingRecord(record).pipe(
      catchError(error => { console.log(error); return EMPTY; }),
    ).subscribe(() => {
      if (half === 'first') { entry.paid_first = checked; } else { entry.paid_fifteenth = checked; }
      this.cdr.markForCheck();
    });
  }

  private formatMoney(value: number | undefined | null): string {
    return (value ?? 0).toLocaleString('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  exportPDF(): void {
    const monthStr = this.monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Beyond the Chalkboard Tutoring', 14, 16);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Billing: ${monthStr}`, 14, 23);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 28,
      head: [['Contact', 'Students', 'Cycle', 'Due 1st', 'Due 15th', 'Total']],
      body: this.dataSource.data.map(e => [
        e.name ?? '',
        e.packages ?? '',
        e.cycle === BillingCycle.SEMI_MONTHLY ? 'Semi-monthly' : 'Monthly',
        e.due_first == null ? '—' : this.formatMoney(e.due_first),
        e.due_fifteenth == null ? '—' : this.formatMoney(e.due_fifteenth),
        this.formatMoney(e.total),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [17, 138, 178] },
    });

    doc.save(`billing-${monthStr.replace(' ', '-')}.pdf`);
  }
}
