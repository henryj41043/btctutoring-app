import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {provideNativeDateAdapter} from '@angular/material/core';
import {catchError, EMPTY, Observable} from 'rxjs';
import {ReminderService} from '../services/reminder.service';
import {Reminder} from '../models/reminder.model';
import {Contact} from '../models/contact.model';

export type ReminderDialogMode = 'create' | 'edit' | 'delete';

export interface ReminderDialogData {
  mode: ReminderDialogMode;
  reminder?: Reminder;
  /** Admin contacts offered as individual recipients. */
  admins: Contact[];
}

@Component({
  selector: 'app-reminder-dialog',
  providers: [provideNativeDateAdapter()],
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatDatepickerModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './reminder-dialog.html',
  styleUrl: './reminder-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class ReminderDialog implements OnInit {
  private dialogRef: MatDialogRef<ReminderDialog> = inject(MatDialogRef);
  protected data: ReminderDialogData = inject<ReminderDialogData>(MAT_DIALOG_DATA);
  private formBuilder: FormBuilder = inject(FormBuilder);
  private reminderService: ReminderService = inject(ReminderService);

  protected mode: ReminderDialogMode = 'create';
  protected reminderForm!: FormGroup;
  protected submitting: boolean = false;
  protected hasError: boolean = false;
  protected errorMessage: string = '';

  ngOnInit(): void {
    this.mode = this.data.mode;
    const reminder: Reminder = this.data.reminder ?? {};
    this.reminderForm = this.formBuilder.group({
      id: [reminder.id ?? null],
      title: [reminder.title ?? '', Validators.required],
      message: [reminder.message ?? ''],
      date: [this.toDate(reminder.date), Validators.required],
      all_admins: [reminder.all_admins ?? true],
      recipient_ids: [reminder.recipient_ids ?? []],
    });
  }

  cancel(): void {
    if (this.submitting) {
      return;
    }
    this.dialogRef.close();
  }

  save(): void {
    if (this.submitting) {
      return;
    }
    if (this.reminderForm.invalid) {
      this.reminderForm.markAllAsTouched();
      return;
    }
    const raw = this.reminderForm.getRawValue();
    const reminder: Reminder = {
      id: raw.id ?? undefined,
      title: raw.title,
      message: raw.message,
      date: this.toDateString(raw.date),
      all_admins: raw.all_admins,
      recipient_ids: raw.all_admins ? [] : raw.recipient_ids,
    };
    if (!reminder.all_admins && (reminder.recipient_ids ?? []).length === 0) {
      this.fail('Pick at least one admin, or select All admins.');
      return;
    }
    this.submitting = true;
    this.hasError = false;
    const request$: Observable<unknown> = this.mode === 'create'
      ? this.reminderService.createReminder(reminder)
      : this.reminderService.updateReminder(reminder);
    request$.pipe(
      catchError(error => {
        console.log(error);
        this.fail('Failed to save the reminder. Please try again.');
        return EMPTY;
      }),
    ).subscribe(() => this.dialogRef.close(true));
  }

  confirmDelete(): void {
    if (this.submitting) {
      return;
    }
    const id = this.data.reminder?.id;
    if (!id) {
      this.dialogRef.close();
      return;
    }
    this.submitting = true;
    this.hasError = false;
    this.reminderService.deleteReminder(id).pipe(
      catchError(error => {
        console.log(error);
        this.fail('Failed to delete the reminder. Please try again.');
        return EMPTY;
      }),
    ).subscribe(() => this.dialogRef.close(true));
  }

  private fail(message: string): void {
    this.errorMessage = message;
    this.hasError = true;
    this.submitting = false;
  }

  private toDate(value?: string | null): Date | null {
    if (!value) {
      return null;
    }
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) {
      return new Date(value);
    }
    return new Date(year, month - 1, day);
  }

  /** Date → 'YYYY-MM-DD' from local components (the reminder's wall date). */
  private toDateString(value?: Date | null): string | undefined {
    if (!value) {
      return undefined;
    }
    const y = value.getFullYear();
    const m = (value.getMonth() + 1).toString().padStart(2, '0');
    const d = value.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
