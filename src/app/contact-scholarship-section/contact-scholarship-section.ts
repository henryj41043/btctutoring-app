import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, Input, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {FormBuilder, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {provideNativeDateAdapter} from '@angular/material/core';
import {catchError, EMPTY} from 'rxjs';
import {ScholarshipService} from '../services/scholarship.service';
import {AuthService} from '../services/auth.service';
import {ScholarshipRecord} from '../models/scholarship-record.model';

/**
 * The contact page's month-scoped Scholarship checklist (admin-only — the
 * scholarships endpoints are admin-gated). Each calendar month has its own
 * record ('YYYY-MM'-keyed), so month-end no longer means wiping the fields:
 * pick a prior month from the dropdown to read (or correct) its history, and
 * a month with no record yet is a blank form whose Save creates one.
 */
@Component({
  selector: 'app-contact-scholarship-section',
  providers: [provideNativeDateAdapter()],
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './contact-scholarship-section.html',
  styleUrl: './contact-scholarship-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactScholarshipSection implements OnInit {
  @Input({required: true}) contactId!: string;

  private scholarshipService: ScholarshipService = inject(ScholarshipService);
  private authService: AuthService = inject(AuthService);
  private formBuilder: FormBuilder = inject(FormBuilder);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  // Cancels the in-flight read when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);

  private recordsByMonth = new Map<string, ScholarshipRecord>();
  protected monthOptions: string[] = [];
  protected selectedMonth: string = currentMonthKey();
  protected saving: boolean = false;
  protected savedSuccessfully: boolean = false;
  protected hasError: boolean = false;

  protected scholarshipForm: FormGroup = this.formBuilder.group({
    scholarship_state: [''],
    invoice_Month: [''],
    date_funds_requested_by_btc: [null],
    date_funds_requested_by_family: [null],
    invoice_number: [''],
    invoice_paid_date: [null],
  });

  ngOnInit(): void {
    if (!this.authService.isAdmin()) {
      return;
    }
    this.scholarshipService.getScholarshipRecordsByContact(this.contactId).pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(records => {
      this.recordsByMonth = new Map(
        records.filter(r => !!r.month).map(r => [r.month!, r]));
      this.refreshMonthOptions();
      this.loadMonth(this.selectedMonth);
      this.cdr.markForCheck();
    });
  }

  /** Every month with a record, plus the current month, newest first. */
  private refreshMonthOptions(): void {
    const months = new Set(this.recordsByMonth.keys());
    months.add(currentMonthKey());
    this.monthOptions = [...months].sort((a, b) => b.localeCompare(a));
  }

  /** 'September 2026' for a 'YYYY-MM' key (component-parsed — no UTC shift). */
  monthLabel(month: string): string {
    const [year, monthNum] = month.split('-').map(Number);
    if (!year || !monthNum) {
      return month;
    }
    return new Date(year, monthNum - 1, 1)
      .toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
  }

  onMonthChange(month: string): void {
    this.selectedMonth = month;
    this.loadMonth(month);
  }

  /** Patches the month's record into the form, or blanks it (no record yet). */
  private loadMonth(month: string): void {
    const record = this.recordsByMonth.get(month);
    this.scholarshipForm.reset({
      scholarship_state: record?.scholarship_state ?? '',
      invoice_Month: record?.invoice_Month ?? '',
      date_funds_requested_by_btc: toDate(record?.date_funds_requested_by_btc),
      date_funds_requested_by_family: toDate(record?.date_funds_requested_by_family),
      invoice_number: record?.invoice_number ?? '',
      invoice_paid_date: toDate(record?.invoice_paid_date),
    });
    this.savedSuccessfully = false;
    this.hasError = false;
  }

  save(): void {
    if (this.saving) {
      return;
    }
    this.saving = true;
    this.hasError = false;
    const record: ScholarshipRecord = {
      contact_id: this.contactId,
      month: this.selectedMonth,
      ...this.scholarshipForm.value,
    };
    this.scholarshipService.upsertScholarshipRecord(record).pipe(
      catchError(error => {
        console.log(error);
        this.saving = false;
        this.hasError = true;
        this.cdr.markForCheck();
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      this.recordsByMonth.set(this.selectedMonth, record);
      this.refreshMonthOptions();
      this.saving = false;
      this.savedSuccessfully = true;
      // The unsaved-changes hint must clear once the month is persisted.
      this.scholarshipForm.markAsPristine();
      this.cdr.markForCheck();
      setTimeout(() => {
        this.savedSuccessfully = false;
        this.cdr.markForCheck();
      }, 3000);
    });
  }
}

/** Today's 'YYYY-MM' key. */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}

/** API dates arrive as epoch numbers/ISO strings; datepickers want Date. */
function toDate(value: Date | string | number | undefined): Date | null {
  return value ? new Date(value) : null;
}
