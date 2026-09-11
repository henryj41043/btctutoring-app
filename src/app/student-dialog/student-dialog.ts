import {Component, DestroyRef, inject, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {MakeupEditDialog, MakeupEditResult} from '../makeup-edit-dialog/makeup-edit-dialog';
import {catchError, EMPTY, of} from 'rxjs';
import {FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {provideNativeDateAdapter} from '@angular/material/core';
import {PendingChange, Student} from '../models/student.model';
import {Contact} from '../models/contact.model';
import {StudentStatus} from '../enums/student-status.enum';
import {StudentService} from '../services/student.service';
import {PackageService} from '../services/package.service';
import {PackageRow} from '../models/package-row.model';
import {
  CUSTOM_PACKAGE,
  PackageCatalog,
  packageSelectOptions,
  perSessionCost,
  resolvePackageDef,
  round2,
  toCatalog,
} from '../utils/package-config';
import {countSlotsBeforeInMonth} from '../utils/proration';
import {monthKey} from '../utils/billing-amount';
import {availableMakeupMinutes} from '../utils/makeup';
import {
  effectiveMonthLabel,
  newChangesWithoutSchedule,
  nextMonthFirsts,
  pendingChangeNote,
  pendingChangesOf,
  validatePendingChanges,
} from '../utils/pending-package';
import {studentDisplayName} from '../utils/student-name';
import {contactDisplayName} from '../utils/contact-name';

export type StudentDialogMode = 'create' | 'edit' | 'delete';

/**
 * What the Student dialog closes with. `true` for a plain create/edit/delete;
 * an object when a mid-month package change needs the caller to open Manage
 * Schedule so the admin redefines the new package's slots, or when a new
 * scheduled change still needs its schedule defined (pending-schedule dialog
 * for that change's effective date).
 */
export type StudentDialogResult =
  | true
  | {
      openScheduleForStudentId?: string;
      openPendingScheduleFor?: {studentId: string; effective: string};
    };

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
    MatIconModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    FormsModule,
  ],
  templateUrl: './student-dialog.html',
  styleUrl: './student-dialog.scss',
})
export class StudentDialog implements OnInit {
  readonly dialogRef = inject(MatDialogRef<StudentDialog>);
  private matDialog = inject(MatDialog);
  readonly data = inject<StudentDialogData>(MAT_DIALOG_DATA);
  private formBuilder: FormBuilder = inject(FormBuilder);
  private studentService: StudentService = inject(StudentService);
  private packageService: PackageService = inject(PackageService);
  private destroyRef: DestroyRef = inject(DestroyRef);

  protected readonly CUSTOM_PACKAGE = CUSTOM_PACKAGE;
  protected statusOptions: string[] = Object.values(StudentStatus);
  /** Active catalog packages by ascending price + Custom (+ any stored retired value). */
  protected packageOptions: string[] = [CUSTOM_PACKAGE];
  /** The admin-managed package catalog; loaded in ngOnInit. */
  protected catalog: PackageCatalog = {};
  protected mode: StudentDialogMode = 'create';
  protected tutors: Contact[] = [];
  /** True if the student began the dialog still in Onboarding status. */
  protected startedInOnboarding: boolean = false;
  // True while a backend request is in flight — swaps the button for a spinner
  // and blocks double-submit.
  protected submitting: boolean = false;
  protected readonly studentDisplayName = studentDisplayName;
  protected readonly contactDisplayName = contactDisplayName;
  protected hasError: boolean = false;
  protected errorMessage: string = '';

  protected studentForm!: FormGroup;

  ngOnInit(): void {
    this.mode = this.data.mode;
    this.tutors = this.data.tutors ?? [];
    const student: Student = this.data.student ?? {};
    // Catalog for the package selects; a stored retired (or unknown) value is
    // appended so an open form never blanks an existing selection.
    this.packageService.getPackages().pipe(
      catchError(() => of([] as PackageRow[])),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(rows => {
      this.catalog = toCatalog(rows);
      this.packageOptions = packageSelectOptions(this.catalog, [
        student.package,
        ...pendingChangesOf(student).map(c => c.package),
      ]);
    });
    this.startedInOnboarding =
      (student.status ?? StudentStatus.ONBOARDING) === StudentStatus.ONBOARDING;
    this.studentForm = this.formBuilder.group({
      id: [student.id ?? null],
      contact_id: [student.contact_id ?? this.data.contactId],
      // Optional: intake often starts before the family shares a name.
      name: [student.name ?? ''],
      birthday: [this.toDate(student.birthday)],
      status: [student.status ?? StudentStatus.ONBOARDING],
      onboarding_complete: [student.onboarding_complete ?? false],
      assigned_tutor_id: [student.assigned_tutor_id ?? ''],
      package: [student.package ?? ''],
      scholarship: [student.scholarship ?? false],
      btc_and_me: [student.btc_and_me ?? false],
      make_up_never_expire: [student.make_up_never_expire ?? false],
      // One row per scheduled change (schedule/notice stamp carried through).
      pending_changes: this.formBuilder.array(pendingChangesOf(student).map(c => this.pendingRow(c))),
      extra_planning_minutes: [student.extra_planning_minutes ?? null],
      custom_monthly_cost: [student.custom_monthly_cost ?? null],
      custom_sessions_per_week: [student.custom_sessions_per_week ?? null],
      custom_session_length_min: [student.custom_session_length_min ?? null],
      // Carried through untouched — owned by the Manage Schedule + billing flows.
      schedule: [student.schedule ?? null],
      package_start_date: [student.package_start_date ?? null],
      auto_renew: [student.auto_renew ?? false],
    });
    this.buildPlanningOverrideRows(student);
    this.pendingMonthOptions = nextMonthFirsts(new Date());
    // Stored effective dates outside the rolling window must stay selectable.
    for (const stored of pendingChangesOf(student).map(c => c.effective).reverse()) {
      if (!this.pendingMonthOptions.some(o => o.value === stored)) {
        this.pendingMonthOptions = [
          {value: stored, label: effectiveMonthLabel(stored)},
          ...this.pendingMonthOptions,
        ];
      }
    }
  }

  /** Effective-month choices for a scheduled package change (next 6 firsts). */
  protected pendingMonthOptions: {value: string; label: string}[] = [];

  /** The scheduled-change rows (one FormGroup per change). */
  get pendingRows(): FormArray<FormGroup> {
    return this.studentForm.get('pending_changes') as FormArray<FormGroup>;
  }

  /**
   * One form row for a scheduled change. Editing the package definition
   * (package or any custom value) drops the row's carried schedule — those
   * slots belonged to the old definition — so the pending-schedule dialog
   * opens for it again after save.
   */
  private pendingRow(change: Partial<PendingChange> = {}): FormGroup {
    const row = this.formBuilder.group({
      package: [change.package ?? ''],
      custom_monthly_cost: [change.custom_monthly_cost ?? null],
      custom_sessions_per_week: [change.custom_sessions_per_week ?? null],
      custom_session_length_min: [change.custom_session_length_min ?? null],
      effective: [change.effective ?? ''],
      // Carried through untouched — owned by the pending-schedule dialog.
      schedule: [change.schedule ?? null],
      // Backend-owned advance-notice stamp, carried through.
      notice_sent: [change.notice_sent ?? null],
    });
    for (const name of ['package', 'custom_monthly_cost', 'custom_sessions_per_week', 'custom_session_length_min']) {
      row.get(name)!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        row.get('schedule')!.setValue(null, {emitEvent: false});
      });
    }
    return row;
  }

  /** Adds a blank scheduled change, defaulting to the first month not already used. */
  addPendingChange(): void {
    const used = new Set(this.pendingRows.controls.map(r => r.get('effective')?.value as string));
    const effective = this.pendingMonthOptions.find(o => !used.has(o.value))?.value ?? '';
    this.pendingRows.push(this.pendingRow({effective}));
  }

  removePendingChange(index: number): void {
    this.pendingRows.removeAt(index);
  }

  /** The row's summary, e.g. '→ Achieve from Sep 1' (null while incomplete). */
  pendingNoteAt(index: number): string | null {
    const row = this.pendingRows.at(index);
    return pendingChangeNote({
      package: row?.get('package')?.value || undefined,
      effective: row?.get('effective')?.value || undefined,
    });
  }

  /** True when the row already carries slots for its package definition. */
  hasPendingScheduleAt(index: number): boolean {
    const schedule = this.pendingRows.at(index)?.get('schedule')?.value as unknown;
    return Array.isArray(schedule) && schedule.length > 0;
  }

  /**
   * Per-tutor extra-planning override rows (default + overrides model): one
   * row per effective tutor (assigned + per-slot, live and pending schedules)
   * plus any stored override's tutor. Shown only when the student actually
   * has several tutors (or stored overrides) — single-tutor students just use
   * the default field. Blank minutes = use the default.
   */
  protected planningOverrideRows: {tutor_id: string; label: string; minutes: number | null}[] = [];

  private buildPlanningOverrideRows(student: Student): void {
    const stored = new Map((student.extra_planning_by_tutor ?? [])
      .filter(o => !!o?.tutor_id)
      .map(o => [o.tutor_id, o.minutes]));
    const effective = new Set<string>();
    if (student.assigned_tutor_id) {
      effective.add(student.assigned_tutor_id);
    }
    const queuedSlots = pendingChangesOf(student).flatMap(c => c.schedule ?? []);
    for (const slot of [...(student.schedule ?? []), ...queuedSlots]) {
      if (slot?.tutor_id) {
        effective.add(slot.tutor_id);
      }
    }
    if (effective.size < 2 && stored.size === 0) {
      this.planningOverrideRows = [];
      return;
    }
    const ids = [...new Set([...effective, ...stored.keys()])];
    this.planningOverrideRows = ids.map(id => {
      const tutor = this.tutors.find(t => t.id === id);
      return {
        tutor_id: id,
        label: tutor ? contactDisplayName(tutor) : '(former tutor)',
        minutes: stored.get(id) ?? null,
      };
    });
  }

  /** The student's currently-available make-up minutes (shown read-only). */
  get makeupBalance(): number {
    return this.data.student ? availableMakeupMinutes(this.data.student) : 0;
  }

  /** Opens the ledger editor; a save patches the local student so the
   *  balance line refreshes without reloading the whole dialog. */
  editMakeupMinutes(): void {
    const student = this.data.student;
    if (!student) {
      return;
    }
    const ref = this.matDialog.open(MakeupEditDialog, {
      data: {student},
      width: '520px',
    });
    ref.afterClosed().subscribe((result: MakeupEditResult | null | undefined) => {
      if (result) {
        student.make_up_batches = result.make_up_batches;
        student.make_up_minutes = result.make_up_minutes;
      }
    });
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
    if (complete && this.studentForm.get('status')?.value === StudentStatus.ONBOARDING) {
      this.studentForm.get('status')?.setValue(StudentStatus.ACTIVE_STUDENT);
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
    this.submitting = true;
    this.hasError = false;
    // The name is optional at intake (families often haven't shared it yet);
    // status/onboarding_complete are set here (and defaulted again
    // server-side) so onboarding always starts clean.
    const student: Student = {
      contact_id: this.data.contactId,
      name: (this.studentForm.get('name')!.value ?? '').trim(),
      status: StudentStatus.ONBOARDING,
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
    const {pending_changes: pendingRows, ...raw} = this.studentForm.getRawValue();
    const student: Student = {
      ...raw,
      name: (raw.name ?? '').trim(),
      birthday: this.toDateString(raw.birthday),
    };
    const changes = this.pendingChangesFromRows(pendingRows as Record<string, unknown>[]);
    // Per-tutor planning overrides: blank rows mean "use the default". An
    // explicit [] only goes out when stored overrides are being cleared —
    // otherwise the key is omitted so the backend leaves the field alone.
    const overrides = this.planningOverrideRows
      .filter(r => r.minutes !== null && r.minutes !== undefined && !isNaN(Number(r.minutes)))
      .map(r => ({tutor_id: r.tutor_id, minutes: Number(r.minutes)}));
    if (overrides.length > 0) {
      student.extra_planning_by_tutor = overrides;
    } else if ((this.data.student?.extra_planning_by_tutor ?? []).length > 0) {
      student.extra_planning_by_tutor = [];
    } else {
      delete student.extra_planning_by_tutor;
    }
    const storedChanges = pendingChangesOf(this.data.student);
    const pendingError = validatePendingChanges(
      changes, student.package, storedChanges.map(c => c.effective), new Date());
    if (pendingError) {
      this.fail(pendingError);
      return;
    }
    if (changes.length === 0 && storedChanges.length === 0) {
      // Nothing scheduled before or after — omit the key entirely so a plain
      // save never issues a gratuitous backend $REMOVE.
      delete student.pending_changes;
    } else {
      student.pending_changes = changes; // [] = clear them all
    }
    this.submitting = true;
    this.hasError = false;
    const packageChanged = this.applyMidMonthPackageChange(student);
    // The mid-month flow wins when both fire; the pending-schedule dialog can
    // follow on a later edit. Otherwise the first new/edited change without a
    // schedule gets its slots defined next.
    const scheduleTarget = packageChanged
      ? undefined
      : newChangesWithoutSchedule(this.data.student, changes)[0];
    this.studentService
      .updateStudent(student)
      .pipe(
        catchError(error => {
          console.log(error);
          this.fail('Failed to save the student. Please try again.');
          return EMPTY;
        }),
      )
      .subscribe(() => {
        if (packageChanged) {
          this.dialogRef.close({openScheduleForStudentId: student.id});
        } else if (scheduleTarget && student.id) {
          this.dialogRef.close({
            openPendingScheduleFor: {studentId: student.id, effective: scheduleTarget.effective},
          });
        } else {
          this.dialogRef.close(true);
        }
      });
  }

  /** Form rows → scheduled changes (optional fields only when set). */
  private pendingChangesFromRows(rows: Record<string, unknown>[]): PendingChange[] {
    return (rows ?? []).map(row => {
      const change: PendingChange = {
        package: (row['package'] as string) ?? '',
        effective: (row['effective'] as string) ?? '',
      };
      for (const key of ['custom_monthly_cost', 'custom_sessions_per_week', 'custom_session_length_min'] as const) {
        const value = row[key];
        if (value !== null && value !== undefined && value !== '' && !isNaN(Number(value))) {
          change[key] = Number(value);
        }
      }
      const schedule = row['schedule'];
      if (Array.isArray(schedule) && schedule.length > 0) {
        change.schedule = schedule;
      }
      if (typeof row['notice_sent'] === 'string' && row['notice_sent']) {
        change.notice_sent = row['notice_sent'];
      }
      return change;
    });
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
    const oldDef = resolvePackageDef(oldPackage, this.catalog, {
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
