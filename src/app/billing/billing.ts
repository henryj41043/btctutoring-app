import {DestroyRef, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
import {Router} from '@angular/router';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import jsPDF from 'jspdf';
import autoTable, {RowInput, Styles} from 'jspdf-autotable';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatDatepicker, MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatTooltipModule} from '@angular/material/tooltip';
import {provideNativeDateAdapter} from '@angular/material/core';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatDialog} from '@angular/material/dialog';
import {BillingOverrideDialog, BillingOverrideDialogData, BillingOverrideResult} from '../billing-override-dialog/billing-override-dialog';
import {FormsModule} from '@angular/forms';
import {AuthService} from '../services/auth.service';
import {BillingService} from '../services/billing.service';
import {NoteService} from '../services/note.service';
import {Note} from '../models/note.model';
import {BillingRecord} from '../models/billing-record.model';
import {BillingEntry} from '../models/billing-entry.model';
import {CurrencyPipe, DatePipe} from '@angular/common';
import {catchError, EMPTY} from 'rxjs';
import {BillingCycle} from '../enums/billing-cycle.enum';
import {round2} from '../utils/package-config';
import {TableStateStore} from '../utils/table-state';
import {StatementLine} from '../models/statement.model';
import {flagLabels, formatMoney, linePeriod, lineSessions, lineSummary, toBillingEntry} from '../utils/statement-view';

/** The month picker shows and announces a month, never a day. */
const MONTH_FORMATS = {
  parse: {dateInput: null},
  display: {
    dateInput: {year: 'numeric', month: 'long'},
    monthYearLabel: {year: 'numeric', month: 'short'},
    dateA11yLabel: {year: 'numeric', month: 'long'},
    monthYearA11yLabel: {year: 'numeric', month: 'long'},
  },
};

@Component({
  selector: 'app-billing',
  providers: [provideNativeDateAdapter(MONTH_FORMATS)],
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
  private billingService: BillingService = inject(BillingService);
  private noteService: NoteService = inject(NoteService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private router: Router = inject(Router);
  private dialog: MatDialog = inject(MatDialog);
  // Cancels in-flight HTTP work when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);

  // Restores the admin's place (page/sort/filters) after navigating away.
  private readonly viewState = new TableStateStore('btc-billing-view');
  @ViewChild(MatSort) set matSort(sort: MatSort) {
    if (sort) {
      this.viewState.attachSort(sort);
      this.dataSource.sort = sort;
    }
  }
  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) {
      this.viewState.attachPaginator(paginator);
      this.dataSource.paginator = paginator;
    }
  }

  protected billingColumns: string[] = [
    'expand', 'name', 'packages', 'cycle', 'due_first', 'due_fifteenth', 'discount', 'total', 'paid',
  ];
  protected dataSource = new MatTableDataSource<BillingEntry>([]);
  protected selectedDate: Date = new Date();
  protected loading: boolean = true;
  /** True when the statements could not be loaded — shown loudly. */
  protected hasError: boolean = false;
  /** Contact ids of the rows whose breakdown is open. */
  private expanded = new Set<string>();
  protected readonly detailColumns: string[] = ['detail'];
  /** First-of-month for the selected billing month, used for the header. */
  protected monthStart: Date = new Date();

  ngOnInit(): void {
    const savedDate = this.viewState.load().extra?.['selectedDate'];
    if (typeof savedDate === 'string' && !isNaN(Date.parse(savedDate))) {
      this.selectedDate = new Date(savedDate);
    }
    this.loadBilling(this.selectedDate);
  }

  /** Billing is per month: whatever day arrives, the month is what's selected. */
  onDateChange(date: Date | null): void {
    if (date) {
      this.selectedDate = new Date(date.getFullYear(), date.getMonth(), 1);
      this.viewState.patch({extra: {selectedDate: this.selectedDate.toISOString()}});
      this.loadBilling(this.selectedDate);
    }
  }

  /** The picker stops at the month view: choosing a month selects it and closes. */
  onMonthSelected(date: Date, picker: Pick<MatDatepicker<Date>, 'close'>): void {
    picker.close();
    this.onDateChange(date);
  }

  /** Steps to the previous (-1) or next (+1) month. */
  shiftMonth(delta: number): void {
    this.onDateChange(new Date(this.monthStart.getFullYear(), this.monthStart.getMonth() + delta, 1));
  }

  /** 'YYYY-MM' month key for the selected billing month. */
  private monthKeyOf(date: Date): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  }

  /** 'YYYY-MM-DD' period key for the selected month and day-of-month. */
  private periodKey(date: Date, day: number): string {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${y}-${m}-${day.toString().padStart(2, '0')}`;
  }

  protected isSemiMonthly(entry: BillingEntry): boolean {
    return entry.cycle === BillingCycle.SEMI_MONTHLY;
  }

  private loadBilling(date: Date): void {
    this.monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    this.loading = true;
    this.hasError = false;
    this.expanded.clear();
    this.dataSource.data = [];
    this.cdr.markForCheck();

    if (!this.authService.isAdmin()) {
      this.finishLoading([]);
      return;
    }

    // The service calculates every amount; a failure is shown loudly rather
    // than as an empty (and misleading) month.
    this.billingService.getStatements(this.monthKeyOf(date)).pipe(
      catchError(() => {
        this.hasError = true;
        this.finishLoading([]);
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(statements => {
      this.finishLoading((statements ?? []).map(toBillingEntry));
    });
  }

  /** Opens or closes a row's breakdown; never also navigates to the contact. */
  toggleExpanded(entry: BillingEntry, event: Event): void {
    event.stopPropagation();
    if (!entry.contact_id) return;
    if (this.expanded.has(entry.contact_id)) {
      this.expanded.delete(entry.contact_id);
    } else {
      this.expanded.add(entry.contact_id);
    }
  }

  protected isExpanded(entry: BillingEntry): boolean {
    return !!entry.contact_id && this.expanded.has(entry.contact_id);
  }

  protected linePeriod(line: StatementLine): string { return linePeriod(line); }
  protected lineSessions(line: StatementLine): string { return lineSessions(line); }
  protected lineLabels(line: StatementLine): string[] { return flagLabels(line.flags); }

  /** True when a period's amount is an admin override rather than derived. */
  protected isOverridden(entry: BillingEntry, half: 'first' | 'fifteenth'): boolean {
    return (half === 'first' ? entry.override_first : entry.override_fifteenth) != null;
  }

  /** Tooltip for an overridden cell: what the package math would have charged. */
  protected overrideTooltip(entry: BillingEntry, half: 'first' | 'fifteenth'): string {
    const derived = half === 'first' ? entry.derived_first : entry.derived_fifteenth;
    return `Overridden — calculated amount ${derived == null ? '—' : this.formatMoney(derived)}`;
  }

  /** Opens the per-period override editor; persists the result and patches the row. */
  openOverrideDialog(entry: BillingEntry, half: 'first' | 'fifteenth', event: Event): void {
    // Icon-button action — never also navigate to the contact.
    event.stopPropagation();
    if (!entry.contact_id) return;
    const period = this.periodKey(this.selectedDate, half === 'first' ? 1 : 15);
    const data: BillingOverrideDialogData = {
      contactName: entry.name ?? '',
      periodLabel: `Due ${half === 'first' ? '1st' : '15th'} — ${this.monthStart.toLocaleDateString('en-US', {month: 'long', year: 'numeric'})}`,
      derived: (half === 'first' ? entry.derived_first : entry.derived_fifteenth) ?? null,
      current: (half === 'first' ? entry.override_first : entry.override_fifteenth) ?? null,
    };
    const ref = this.dialog.open<BillingOverrideDialog, BillingOverrideDialogData, BillingOverrideResult | undefined>(
      BillingOverrideDialog, {data, width: '420px'},
    );
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      this.billingService.setAmountOverride({
        contact_id: entry.contact_id!,
        period_start: period,
        cycle: entry.cycle ?? BillingCycle.MONTHLY,
        amount_override: result.amount_override,
      }).pipe(
        catchError(error => { console.log(error); return EMPTY; }),
      ).subscribe(() => {
        this.applyOverride(entry, half, result.amount_override);
        this.cdr.markForCheck();
      });
    });
  }

  /** Patches a row's effective dues and total after an override is saved or cleared. */
  private applyOverride(entry: BillingEntry, half: 'first' | 'fifteenth', override: number | null): void {
    if (half === 'first') {
      entry.override_first = override;
      entry.due_first = override ?? entry.derived_first ?? null;
    } else {
      entry.override_fifteenth = override;
      entry.due_fifteenth = override ?? entry.derived_fifteenth ?? null;
    }
    entry.total = round2((entry.due_first ?? 0) + (entry.due_fifteenth ?? 0));
    // A fresh array reference so the OnPush table re-renders the footer totals.
    this.dataSource.data = [...this.dataSource.data];
  }

  private finishLoading(entries: BillingEntry[]): void {
    this.dataSource.data = entries;
    this.loading = false;
    this.cdr.markForCheck();
  }

  /** Row click: jump to the family's contact page. */
  openContact(entry: BillingEntry): void {
    if (entry.contact_id) {
      void this.router.navigate(['/contacts', entry.contact_id]);
    }
  }

  /** Persists a paid/unpaid toggle for one half of a contact's billing month. */
  togglePaid(entry: BillingEntry, half: 'first' | 'fifteenth', checked: boolean): void {
    const period = this.periodKey(this.selectedDate, half === 'first' ? 1 : 15);
    const amount = (half === 'first' ? entry.due_first : entry.due_fifteenth) ?? 0;
    const override = half === 'first' ? entry.override_first : entry.override_fifteenth;
    const record: BillingRecord = {
      contact_id: entry.contact_id,
      period_start: period,
      cycle: entry.cycle,
      amount,
      paid: checked,
      paid_date: checked ? new Date().toISOString() : undefined,
      // The upsert replaces the whole record — carry the override we loaded.
      ...(override != null ? {amount_override: override} : {}),
    };
    this.billingService.upsertBillingRecord(record).pipe(
      catchError(error => { console.log(error); return EMPTY; }),
    ).subscribe(() => {
      if (half === 'first') { entry.paid_first = checked; } else { entry.paid_fifteenth = checked; }
      if (checked) {
        // Client request: marking paid files a note on the family's contact
        // page. Best-effort — a note failure never blocks the paid toggle.
        this.writePaymentNote(entry, amount, period);
      }
      this.cdr.markForCheck();
    });
  }

  /** 'YYYY-MM-DD' period key rendered as e.g. 'Aug 1, 2026' (local wall date). */
  private formatPeriod(period: string): string {
    const [y, m, d] = period.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  private writePaymentNote(entry: BillingEntry, amount: number, period: string): void {
    const note: Note = {
      message: `Payment received: ${this.formatMoney(amount)} for ${this.formatPeriod(period)}`
        + (entry.packages ? ` (${entry.packages})` : ''),
      date_time: new Date().toISOString(),
      author: this.authService.contact().first_name,
      author_id: this.authService.contact().id,
      recipient: entry.name,
      recipient_id: entry.contact_id,
      type: '',
    };
    this.noteService.createNote(note).pipe(
      catchError(error => { console.log(error); return EMPTY; }),
    ).subscribe();
  }

  private formatMoney(value: number | undefined | null): string {
    return formatMoney(value);
  }

  /** Sum of the Total column across all rows (there is no filtering, so this
   *  is the full month regardless of the paginator page). */
  protected get grandTotal(): number {
    return round2(this.dataSource.data.reduce((sum, e) => sum + (e.total ?? 0), 0));
  }

  protected get grandDueFirst(): number {
    return round2(this.dataSource.data.reduce((sum, e) => sum + (e.due_first ?? 0), 0));
  }

  protected get grandDueFifteenth(): number {
    return round2(this.dataSource.data.reduce((sum, e) => sum + (e.due_fifteenth ?? 0), 0));
  }

  /** A due cell for the PDF: '—', 'No charge', '$x.xx' or '$x.xx*' when overridden. */
  private pdfDue(entry: BillingEntry, half: 'first' | 'fifteenth'): string {
    const due = half === 'first' ? entry.due_first : entry.due_fifteenth;
    if (due == null) return '—';
    if (!this.isOverridden(entry, half)) return this.formatMoney(due);
    return due === 0 ? 'No charge' : `${this.formatMoney(due)}*`;
  }

  private pdfDiscount(entry: BillingEntry): string {
    if (!entry.discount) return '—';
    const amount = `-${this.formatMoney(entry.discount)}`;
    return entry.discount_percent ? `${amount} (${entry.discount_percent}%)` : amount;
  }

  /**
   * The breakdown rows under a family whose month is unusual (prorated,
   * changed, custom-priced or discounted); an ordinary full month needs none.
   */
  private pdfDetailRows(entry: BillingEntry): RowInput[] {
    const statement = entry.statement;
    if (!statement || (entry.labels ?? []).length === 0) return [];
    const styles: Partial<Styles> = {fontSize: 8, textColor: 90, fontStyle: 'italic'};
    const row = (text: string, amount: number): RowInput => [
      {content: `    ${text}`, colSpan: 6, styles},
      {content: this.formatMoney(amount), styles},
    ];
    const rows = statement.lines.map(line => {
      const labels = flagLabels(line.flags);
      return row(`${lineSummary(line)}${labels.length ? ` [${labels.join(', ')}]` : ''}`, line.net);
    });
    if (statement.sibling_discount_amount > 0) {
      rows.push(row(`Sibling discount ${statement.sibling_discount_percent}%`, -statement.sibling_discount_amount));
    }
    if (statement.group_fee > 0) {
      rows.push(row(`BTC & Me fee (${statement.group_students.join(', ')})`, statement.group_fee));
    }
    return rows;
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
    if (this.dataSource.data.some(e => this.isOverridden(e, 'first') || this.isOverridden(e, 'fifteenth'))) {
      doc.text('* manually overridden amount', 120, 23);
    }
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 28,
      head: [['Contact', 'Students', 'Cycle', 'Due 1st', 'Due 15th', 'Discount', 'Total']],
      body: this.dataSource.data.flatMap((e): RowInput[] => [
        [
          e.name ?? '',
          e.packages ?? '',
          e.cycle === BillingCycle.SEMI_MONTHLY ? 'Semi-monthly' : 'Monthly',
          this.pdfDue(e, 'first'),
          this.pdfDue(e, 'fifteenth'),
          this.pdfDiscount(e),
          this.formatMoney(e.total),
        ],
        ...this.pdfDetailRows(e),
      ]),
      foot: [[
        'Grand Total', '', '', this.formatMoney(this.grandDueFirst),
        this.formatMoney(this.grandDueFifteenth), '', this.formatMoney(this.grandTotal),
      ]],
      showFoot: 'lastPage',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [17, 138, 178] },
      footStyles: { fillColor: [17, 138, 178] },
    });

    doc.save(`billing-${monthStr.replace(' ', '-')}.pdf`);
  }
}
