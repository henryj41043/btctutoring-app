import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject} from '@angular/core';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {catchError, EMPTY} from 'rxjs';
import {StudentService} from '../services/student.service';
import {MakeupBatch, Student} from '../models/student.model';
import {MAKEUP_EXPIRY_DAYS} from '../utils/makeup';

export interface MakeupEditDialogData {
  student: Student;
}

/** What the dialog returns on a successful save (callers patch/reload). */
export interface MakeupEditResult {
  make_up_batches: MakeupBatch[];
  make_up_minutes: number;
}

/** One editable row of the ledger. */
interface BatchRow {
  minutes: number;
  /** Original earn date; null = legacy scalar with no expiry data. */
  earned_date: string | null;
  /** Original minutes, to detect edits. */
  originalMinutes: number;
  added: boolean;
  removed: boolean;
  legacy: boolean;
}

/**
 * Admin-only manual editing of a student's make-up ledger. Client-locked
 * rules (2026-08-18): editing an existing bucket's minutes restarts its
 * 90-day expiry clock (earned_date := now) — unless the student is marked
 * never-expire, where provenance dates are kept since no clock applies;
 * newly added buckets get the normal 90 days from now; buckets can be
 * removed outright (no timer reset — they're just gone). Untouched buckets
 * keep their dates. A legacy scalar balance (pre-ledger) shows as one row
 * and converts to a real dated bucket on save.
 */
@Component({
  selector: 'app-makeup-edit-dialog',
  imports: [
    DatePipe,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './makeup-edit-dialog.html',
  styleUrl: './makeup-edit-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class MakeupEditDialog {
  protected data: MakeupEditDialogData = inject(MAT_DIALOG_DATA);
  private dialogRef: MatDialogRef<MakeupEditDialog, MakeupEditResult | null> = inject(MatDialogRef);
  private studentService: StudentService = inject(StudentService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

  protected rows: BatchRow[] = this.seedRows();
  protected addMinutes: number | null = null;
  protected submitting: boolean = false;
  protected hasError: boolean = false;

  protected readonly neverExpire: boolean = !!this.data.student.make_up_never_expire;

  private seedRows(): BatchRow[] {
    const student = this.data.student;
    const batches = student.make_up_batches ?? [];
    if (batches.length > 0) {
      return batches.map(b => ({
        minutes: b.minutes,
        earned_date: b.earned_date,
        originalMinutes: b.minutes,
        added: false,
        removed: false,
        legacy: false,
      }));
    }
    const legacy = student.make_up_minutes ?? 0;
    return legacy > 0
      ? [{minutes: legacy, earned_date: null, originalMinutes: legacy, added: false, removed: false, legacy: true}]
      : [];
  }

  /** A row's expiry for display: Never / — (legacy) / earned + 90d. */
  expiryOf(row: BatchRow): Date | null {
    if (this.neverExpire || this.isDirty(row) || row.earned_date === null) {
      return null;
    }
    return new Date(new Date(row.earned_date).getTime() + MAKEUP_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  }

  /** Edited rows restart their clock on save — surfaced as a live hint. */
  isDirty(row: BatchRow): boolean {
    return !row.added && !row.legacy && row.minutes !== row.originalMinutes;
  }

  addRow(): void {
    const minutes = this.addMinutes ?? 0;
    if (minutes <= 0) {
      return;
    }
    this.rows = [...this.rows, {
      minutes,
      earned_date: null,
      originalMinutes: 0,
      added: true,
      removed: false,
      legacy: false,
    }];
    this.addMinutes = null;
  }

  toggleRemoved(row: BatchRow): void {
    row.removed = !row.removed;
  }

  /** The balance as it will be after saving. */
  get projectedTotal(): number {
    return this.rows
      .filter(r => !r.removed)
      .reduce((sum, r) => sum + (r.minutes > 0 ? r.minutes : 0), 0);
  }

  get valid(): boolean {
    return this.rows.filter(r => !r.removed).every(r => r.minutes > 0);
  }

  save(): void {
    if (this.submitting || !this.valid) {
      return;
    }
    const now = new Date().toISOString();
    const batches: MakeupBatch[] = this.rows
      .filter(r => !r.removed)
      .map(r => {
        // Timer resets: edits + adds + legacy conversions date from now.
        // Never-expire students keep provenance dates on edits (no clock
        // applies), but adds/legacy still need SOME date to exist.
        const resetsClock = r.added || r.legacy || (this.isDirty(r) && !this.neverExpire);
        return {
          minutes: r.minutes,
          earned_date: resetsClock || r.earned_date === null ? now : r.earned_date,
        };
      });
    const total = batches.reduce((sum, b) => sum + b.minutes, 0);
    const student = this.data.student;
    this.submitting = true;
    this.hasError = false;
    this.cdr.markForCheck();
    // Partial update (backend preserves untouched fields) — same shape
    // utils/makeup.ts apply() writes: the ledger plus its denormalized sum.
    this.studentService.updateStudent({
      id: student.id,
      contact_id: student.contact_id,
      name: student.name,
      make_up_batches: batches,
      make_up_minutes: total,
    } as Student).pipe(
      catchError(error => {
        console.log(error);
        this.submitting = false;
        this.hasError = true;
        this.cdr.markForCheck();
        return EMPTY;
      }),
    ).subscribe(() => {
      this.dialogRef.close({make_up_batches: batches, make_up_minutes: total});
    });
  }

  cancel(): void {
    if (this.submitting) {
      return;
    }
    this.dialogRef.close(null);
  }
}
