import {Component, inject, OnInit} from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {catchError, EMPTY} from 'rxjs';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {provideNativeDateAdapter} from '@angular/material/core';
import {Student} from '../models/student.model';
import {Contact} from '../models/contact.model';
import {Status} from '../enums/status.enum';
import {Package} from '../enums/package.enum';
import {StudentService} from '../services/student.service';
import {perSessionCost, resolvePackageDef, round2} from '../utils/package-config';
import {countSlotsBeforeInMonth} from '../utils/proration';
import {monthKey} from '../utils/billing-amount';
import {availableMakeupMinutes} from '../utils/makeup';

export type StudentDialogMode = 'create' | 'edit' | 'delete';

/**
 * What the Student dialog closes with. `true` for a plain create/edit/delete;
 * an object when a mid-month package change needs the caller to open Manage
 * Schedule so the admin redefines the new package's slots.
 */
export type StudentDialogResult = true | {openScheduleForStudentId?: string};

/** Data needed to open the Student dialog. */
export interface StudentDialogData {
  mode: StudentDialogMode;
  contactId: string;
  student?: Student;
  tutors: Contact[];
}

/**
 * Create/edit/delete a single student. Replaces the old inline-card flow: a
 * create POSTs only once (on submit) instead of the placeholder-first pattern,
 * and every backend call swaps its button for a spinner + blocks double-submit.
 *
 * Onboarding gate: while a student is still in Onboarding status and not yet
 * marked complete, status/package/tutor/schedule stay hidden. Checking
 * "Onboarding Complete" auto-advances the student to Active Student and reveals
 * those fields for the same edit.
 */
@Component({
  selector: 'app-student-dialog',
  providers: [provideNativeDateAdapter()],
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
  ],
  templateUrl: './student-dialog.html',
  styleUrl: './student-dialog.scss',
})
export class StudentDialog implements OnInit {
  readonly dialogRef = inject(MatDialogRef<StudentDialog>);
  readonly data = inject<StudentDialogData>(MAT_DIALOG_DATA);
  private formBuilder: FormBuilder = inject(FormBuilder);
  private studentService: StudentService = inject(StudentService);

  protected readonly Package = Package;
  protected statusOptions: string[] = Object.values(Status);
  protected packageOptions: string[] = Object.values(Package);
  protected mode: StudentDialogMode = 'create';
  protected tutors: Contact[] = [];
  /** True if the student began the dialog still in Onboarding status. */
  protected startedInOnboarding: boolean = false;
  // True while a backend request is in flight — swaps the button for a spinner
  // and blocks double-submit.
  protected submitting: boolean = false;
  protected hasError: boolean = false;
  protected errorMessage: string = '';

  protected studentForm!: FormGroup;

  ngOnInit(): void {
    this.mode = this.data.mode;
    this.tutors = this.data.tutors ?? [];
    const student: Student = this.data.student ?? {};
    this.startedInOnboarding =
      (student.status ?? Status.ONBOARDING) === Status.ONBOARDING;
    this.studentForm = this.formBuilder.group({
      id: [student.id ?? null],
      contact_id: [student.contact_id ?? this.data.contactId],
      name: [student.name ?? '', Validators.required],
      birthday: [this.toDate(student.birthday)],
      status: [student.status ?? Status.ONBOARDING],
      onboarding_complete: [student.onboarding_complete ?? false],
      assigned_tutor_id: [student.assigned_tutor_id ?? ''],
      package: [student.package ?? ''],
      scholarship: [student.scholarship ?? false],
      make_up_never_expire: [student.make_up_never_expire ?? false],
      custom_monthly_cost: [student.custom_monthly_cost ?? null],
      custom_sessions_per_week: [student.custom_sessions_per_week ?? null],
      custom_session_length_min: [student.custom_session_length_min ?? null],
      // Carried through untouched — owned by the Manage Schedule + billing flows.
      schedule: [student.schedule ?? null],
      package_start_date: [student.package_start_date ?? null],
      auto_renew: [student.auto_renew ?? false],
    });
  }

  /** The student's currently-available make-up minutes (shown read-only). */
  get makeupBalance(): number {
    return this.data.student ? availableMakeupMinutes(this.data.student) : 0;
  }

  /** In edit mode, the post-onboarding fields stay locked until onboarding is complete. */
  get locked(): boolean {
    return (
      this.startedInOnboarding &&
      !this.studentForm.get('onboarding_complete')?.value
    );
  }

  /** The Onboarding Complete toggle only makes sense for a student still onboarding. */
  get showOnboardingToggle(): boolean {
    return this.mode === 'edit' && this.startedInOnboarding;
  }

  /** Completing onboarding auto-advances the student from Onboarding to Active. */
  onOnboardingCompleteChange(complete: boolean): void {
    if (complete && this.studentForm.get('status')?.value === Status.ONBOARDING) {
      this.studentForm.get('status')?.setValue(Status.ACTIVE_STUDENT);
    }
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
    if (this.mode === 'create') {
      this.create();
    } else {
      this.update();
    }
  }

  private create(): void {
    const nameControl = this.studentForm.get('name')!;
    if (nameControl.invalid) {
      nameControl.markAsTouched();
      return;
    }
    this.submitting = true;
    this.hasError = false;
    // A new student needs only a name; status/onboarding_complete are set here
    // (and defaulted again server-side) so onboarding always starts clean.
    const student: Student = {
      contact_id: this.data.contactId,
      name: nameControl.value,
      status: Status.ONBOARDING,
      onboarding_complete: false,
      make_up_minutes: 0,
    };
    this.studentService
      .createStudent(student)
      .pipe(
        catchError(error => {
          console.log(error);
          this.fail('Failed to create the student. Please try again.');
          return EMPTY;
        }),
      )
      .subscribe(() => this.dialogRef.close(true));
  }

  private update(): void {
    const nameControl = this.studentForm.get('name')!;
    if (nameControl.invalid) {
      nameControl.markAsTouched();
      return;
    }
    this.submitting = true;
    this.hasError = false;
    const raw = this.studentForm.getRawValue();
    const student: Student = {
      ...raw,
      birthday: this.toDateString(raw.birthday),
    };
    const packageChanged = this.applyMidMonthPackageChange(student);
    this.studentService
      .updateStudent(student)
      .pipe(
        catchError(error => {
          console.log(error);
          this.fail('Failed to save the student. Please try again.');
          return EMPTY;
        }),
      )
      .subscribe(() =>
        this.dialogRef.close(
          packageChanged ? {openScheduleForStudentId: student.id} : true,
        ),
      );
  }

  /**
   * When an existing student's package changes, stamps the student so billing
   * prorates the old package before today and the new package after (Option A):
   * records the old package's per-session portion for the sessions already
   * received this month, and restarts the package from today. Returns true if a
   * change was applied (the caller then routes the admin to Manage Schedule to
   * redefine the new package's slots).
   */
  private applyMidMonthPackageChange(student: Student): boolean {
    const prior = this.data.student;
    const oldPackage = prior?.package;
    if (!oldPackage || oldPackage === student.package) {
      return false;
    }

    const changeDate = new Date();
    const oldDef = resolvePackageDef(oldPackage, {
      monthlyCost: prior?.custom_monthly_cost,
      sessionsPerWeek: prior?.custom_sessions_per_week,
      sessionLengthMin: prior?.custom_session_length_min,
    });
    const priorSlots = countSlotsBeforeInMonth(prior?.schedule ?? [], changeDate);
    const priorCharge = oldDef ? round2(perSessionCost(oldDef) * priorSlots) : 0;

    const y = changeDate.getFullYear();
    const m = (changeDate.getMonth() + 1).toString().padStart(2, '0');
    const d = changeDate.getDate().toString().padStart(2, '0');
    student.package_start_date = `${y}-${m}-${d}T00:00:00`;
    student.mid_month_prior_charge = priorCharge;
    student.mid_month_change_period = monthKey(y, changeDate.getMonth());
    return true;
  }

  confirmDelete(): void {
    if (this.submitting) {
      return;
    }
    const id = this.data.student?.id;
    if (!id) {
      this.dialogRef.close();
      return;
    }
    this.submitting = true;
    this.hasError = false;
    this.studentService
      .deleteStudent(id)
      .pipe(
        catchError(error => {
          console.log(error);
          this.fail('Failed to delete the student. Please try again.');
          return EMPTY;
        }),
      )
      .subscribe(() => this.dialogRef.close(true));
  }

  private fail(message: string): void {
    this.errorMessage = message;
    this.hasError = true;
    this.submitting = false;
  }

  /** 'YYYY-MM-DD' → a local Date (avoids the UTC-parse off-by-one on the day). */
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

  /** Date → 'YYYY-MM-DD' from local components (matches how birthdays are stored). */
  private toDateString(value?: Date | string | null): string | undefined {
    if (!value) {
      return undefined;
    }
    if (typeof value === 'string') {
      return value;
    }
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
