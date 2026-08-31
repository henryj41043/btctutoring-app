import {Component, inject, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {provideNativeDateAdapter} from '@angular/material/core';
import {catchError, EMPTY, of} from 'rxjs';
import {Student} from '../models/student.model';
import {Contact} from '../models/contact.model';
import {ScheduleSlot} from '../utils/proration';
import {Weekday, WEEKDAY_LABELS} from '../enums/weekday.enum';
import {Package} from '../enums/package.enum';
import {PackageDef} from '../utils/package-config';
import {ScheduleService} from '../services/schedule.service';
import {StudentService} from '../services/student.service';
import {ContactService} from '../services/contact.service';
import {AuthService} from '../services/auth.service';
import {resolvePackageDef} from '../utils/package-config';
import {pendingPackageNote} from '../utils/pending-package';
import {groupSlotsByEffectiveTutor} from '../utils/slot-tutor';
import {StaffStatus} from '../enums/staff-status.enum';
import {Service} from '../enums/service.enum';

/** Data needed to open the Manage Schedule dialog. */
export interface ManageScheduleDialogData {
  student: Student;
  tutor?: Contact;
  /**
   * Pending mode: edit the slots for a SCHEDULED package change. Validates
   * against the pending package's definition and persists only
   * pending_schedule — no sessions are created or deleted, and the live
   * schedule/package_start_date/auto_renew stay untouched.
   */
  pendingMode?: boolean;
}

/** A schedule slot being edited (weekday not chosen yet until picked). */
interface ScheduleSlotInput {
  weekday: Weekday | null;
  start_time: string; // 'HH:mm'
  /** Per-slot tutor override; null = the student's primary tutor. */
  tutor_id: string | null;
  /** CUSTOM packages only: this slot's length; null = the package default. */
  length_min: number | null;
}

@Component({
  selector: 'app-manage-schedule-dialog',
  providers: [provideNativeDateAdapter()],
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDatepickerModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: './manage-schedule-dialog.html',
  standalone: true,
  styleUrl: './manage-schedule-dialog.scss',
})
export class ManageScheduleDialog implements OnInit {
  readonly dialogRef = inject(MatDialogRef<ManageScheduleDialog>);
  readonly data = inject<ManageScheduleDialogData>(MAT_DIALOG_DATA);
  private scheduleService: ScheduleService = inject(ScheduleService);
  private studentService: StudentService = inject(StudentService);
  private contactService: ContactService = inject(ContactService);
  private authService: AuthService = inject(AuthService);

  student!: Student;
  tutor?: Contact;
  def: PackageDef | null = null;
  isEdit: boolean = false;
  pendingMode: boolean = false;

  scheduleSlots: ScheduleSlotInput[] = [];
  startDate: Date | undefined;
  autoRenew: boolean = true;
  /** Active tutors offered as per-slot overrides. */
  tutorOptions: Contact[] = [];
  /** Every resolvable tutor contact (options + fetched former staff). */
  private staffById = new Map<string, Contact>();

  errorMessage: string = '';
  hasError: boolean = false;
  saving: boolean = false;

  // Availability override (admin) / hard block (tutor), mirroring the session dialog.
  showAvailabilityConfirm: boolean = false;
  availabilityTutorName: string = '';
  availabilityFailCount: number = 0;
  /** Per-tutor availability failure summary for the confirm block. */
  availabilityMessage: string = '';
  private availabilityOverridden: boolean = false;

  // Delete confirmation.
  showDeleteConfirm: boolean = false;

  readonly weekdayOptions: Weekday[] = Object.values(Weekday);
  readonly weekdayLabels = WEEKDAY_LABELS;
  /** 15-min increments 6:00 AM–9:00 PM as { value: 'HH:mm', label: '1:00 PM' }. */
  readonly timeOptions: {value: string; label: string}[] = this.buildTimeOptions();
  /** Per-slot length choices for CUSTOM packages (minutes). */
  readonly lengthOptions: number[] = [15, 30, 45, 60, 75, 90, 105, 120];

  /** CUSTOM packages may vary each slot's length; fixed packages never do. */
  get isCustomPackage(): boolean {
    const pkg = this.pendingMode ? this.student.pending_package : this.student.package;
    return pkg === Package.CUSTOM;
  }

  ngOnInit(): void {
    this.student = this.data.student;
    this.tutor = this.data.tutor;
    this.pendingMode = this.data.pendingMode ?? false;
    this.loadTutorOptions();
    if (this.pendingMode) {
      // The slots being edited belong to the FUTURE package.
      this.def = resolvePackageDef(this.student.pending_package || undefined, {
        monthlyCost: this.student.pending_custom_monthly_cost,
        sessionsPerWeek: this.student.pending_custom_sessions_per_week,
        sessionLengthMin: this.student.pending_custom_session_length_min,
      });
      this.scheduleSlots = (this.student.pending_schedule ?? []).map(
        s => ({weekday: s.weekday, start_time: s.start_time, tutor_id: s.tutor_id ?? null,
               length_min: this.slotLength(s)}));
      this.seedScheduleSlots();
      return;
    }
    this.def = this.scheduleService.resolveDef(this.student);
    const existing = this.student.schedule ?? [];
    this.isEdit = existing.length > 0;
    this.autoRenew = this.student.auto_renew ?? true;
    if (this.isEdit) {
      this.scheduleSlots = existing.map(
        s => ({weekday: s.weekday, start_time: s.start_time, tutor_id: s.tutor_id ?? null,
               length_min: this.slotLength(s)}));
    } else {
      this.startDate = new Date();
      this.seedScheduleSlots();
    }
  }

  /**
   * Loads the per-slot tutor choices (active tutors), then individually
   * fetches any slot tutor no longer in that list (former staff) so an
   * existing override still renders and stays selectable.
   */
  private loadTutorOptions(): void {
    this.contactService.getStaff().pipe(
      catchError(() => of([] as Contact[])),
    ).subscribe(contacts => {
      this.tutorOptions = contacts.filter(c =>
        c.status === StaffStatus.ACTIVE_STAFF
        && c.service === Service.HIRING
        && c.is_tutor !== false);
      this.staffById = new Map(this.tutorOptions.map(c => [c.id!, c]));
      const slots = this.pendingMode
        ? this.student.pending_schedule ?? []
        : this.student.schedule ?? [];
      const missing = [...new Set(slots.map(s => s.tutor_id).filter(
        (id): id is string => !!id && !this.staffById.has(id)))];
      for (const id of missing) {
        this.contactService.getContact(id).pipe(
          catchError(() => of([] as Contact[])),
        ).subscribe(found => {
          if (found[0]) {
            this.staffById.set(id, found[0]);
            this.tutorOptions = [...this.tutorOptions, found[0]];
          }
        });
      }
    });
  }

  /** The pending-mode header line, e.g. '→ Achieve from Sep 1'. */
  get pendingNote(): string | null {
    return pendingPackageNote(this.student);
  }

  /** The package name governing this dialog's slot rules. */
  get packageLabel(): string {
    return (this.pendingMode ? this.student.pending_package : this.student.package) || '';
  }

  /**
   * A stored slot's length in minutes, or null when it matches the package
   * default (so unchanged slots keep following a later default change).
   */
  private slotLength(slot: ScheduleSlot): number | null {
    if (!this.isCustomPackage || !slot.start_time || !slot.end_time) {
      return null;
    }
    const minutes = this.scheduleService.timeStringToMinutes(slot.end_time)
      - this.scheduleService.timeStringToMinutes(slot.start_time);
    return minutes > 0 && minutes !== this.def?.sessionLengthMin ? minutes : null;
  }

  /** Reseeds blank slot rows to match the package's sessions/week (create mode). */
  private seedScheduleSlots(): void {
    const target = this.def ? this.def.sessionsPerWeek : 0;
    const next: ScheduleSlotInput[] = [];
    for (let i = 0; i < target; i++) {
      next.push(this.scheduleSlots[i]
        ?? {weekday: null, start_time: '', tutor_id: null, length_min: null});
    }
    this.scheduleSlots = next;
  }

  cancel(): void {
    this.dialogRef.close();
  }

  save(): void {
    this.hasError = false;
    if (!this.def) {
      this.fail(`${this.student.name}'s package isn't configured. Set its values on the student first.`);
      return;
    }
    if (!this.tutor) {
      this.fail('Assign a tutor to this student before setting up a schedule.');
      return;
    }
    if (!this.pendingMode && !this.isEdit && !this.startDate) {
      this.fail('Please choose a start date.');
      return;
    }
    if (this.scheduleSlots.length !== this.def.sessionsPerWeek) {
      this.fail(`${this.packageLabel} requires ${this.def.sessionsPerWeek} session(s) per week.`);
      return;
    }
    if (this.scheduleSlots.some(s => !s.weekday || !s.start_time)) {
      this.fail('Please choose a day and start time for every session.');
      return;
    }

    // The override key is OMITTED when null: dynamoose rejects a nested
    // null (buildStudentAttributes strips nulls at the top level only).
    // CUSTOM packages may give each slot its own length; fixed packages
    // always use the package's length.
    const slots: ScheduleSlot[] = this.scheduleSlots.map(s => ({
      weekday: s.weekday as Weekday,
      start_time: s.start_time,
      end_time: this.scheduleService.addMinutesToTime(
        s.start_time,
        (this.isCustomPackage ? s.length_min : null) ?? this.def!.sessionLengthMin,
      ),
      ...(s.tutor_id ? {tutor_id: s.tutor_id} : {}),
    }));

    // Validate occurrences against each EFFECTIVE tutor's availability
    // (warn-and-override for admins). Pending mode anchors at the effective
    // date so the checked occurrences fall in the schedule's start month.
    if (!this.availabilityOverridden) {
      const anchor = this.pendingMode
        ? this.effectiveAnchor()
        : this.isEdit ? new Date() : this.startDate!;
      const groups = groupSlotsByEffectiveTutor(
        slots, {...this.student, assigned_tutor_id: this.tutor.id});
      const perTutor: {name: string; count: number}[] = [];
      for (const [tutorId, groupSlots] of groups) {
        const contact = tutorId === this.tutor.id
          ? this.tutor
          : this.staffById.get(tutorId);
        const failures = this.scheduleService.findAvailabilityFailures(
          contact,
          this.scheduleService.buildOccurrences(groupSlots, anchor),
        );
        if (failures.length > 0) {
          perTutor.push({
            name: contact?.first_name ?? 'this tutor',
            count: failures.length,
          });
        }
      }
      if (perTutor.length > 0) {
        const message = perTutor
          .map(f => `${f.count} session(s) fall outside ${f.name}'s availability`)
          .join('; ');
        this.availabilityTutorName = perTutor.map(f => f.name).join(', ');
        this.availabilityFailCount = perTutor.reduce((sum, f) => sum + f.count, 0);
        this.availabilityMessage = message;
        if (this.authService.isAdmin()) {
          this.showAvailabilityConfirm = true;
          return;
        }
        this.fail(`${message}.`);
        return;
      }
    }

    this.persist(slots);
  }

  /** The effective date as a local Date (component parse — never new Date(string)). */
  private effectiveAnchor(): Date {
    const [y, m, d] = (this.student.pending_package_effective ?? '').split('-').map(Number);
    if (!y || !m || !d) {
      return new Date();
    }
    return new Date(y, m - 1, d);
  }

  private persist(slots: ScheduleSlot[]): void {
    this.saving = true;
    if (this.pendingMode) {
      // Only the pending slots change — no sessions, no live-schedule fields.
      this.studentService
        .updateStudent({...this.student, pending_schedule: slots})
        .pipe(
          catchError(() => {
            this.saving = false;
            this.fail('Saving the pending schedule failed.');
            return EMPTY;
          }),
        )
        .subscribe(() => {
          this.saving = false;
          this.dialogRef.close({...this.student, pending_schedule: slots});
        });
      return;
    }
    const tutor = this.tutor!;
    const request$ = this.isEdit
      ? this.scheduleService.updateSchedule(this.student, tutor, slots, this.autoRenew, this.staffById)
      : this.scheduleService.createSchedule(this.student, tutor, slots, this.startDate!, this.autoRenew, this.staffById);
    request$
      .pipe(
        catchError(() => {
          this.saving = false;
          this.fail(this.isEdit ? 'Updating the schedule failed.' : 'Creating the schedule failed.');
          return EMPTY;
        }),
      )
      .subscribe(updated => {
        this.saving = false;
        this.dialogRef.close(updated);
      });
  }

  confirmAvailabilityOverride(): void {
    this.showAvailabilityConfirm = false;
    this.availabilityOverridden = true;
    this.save();
  }

  cancelAvailabilityOverride(): void {
    this.showAvailabilityConfirm = false;
    this.availabilityOverridden = false;
  }

  requestDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  confirmDelete(): void {
    this.showDeleteConfirm = false;
    this.saving = true;
    this.scheduleService
      .deleteSchedule(this.student)
      .pipe(
        catchError(() => {
          this.saving = false;
          this.fail('Deleting the schedule failed.');
          return EMPTY;
        }),
      )
      .subscribe(cleared => {
        this.saving = false;
        this.dialogRef.close(cleared);
      });
  }

  private fail(message: string): void {
    this.errorMessage = message;
    this.hasError = true;
  }

  private buildTimeOptions(): {value: string; label: string}[] {
    const options: {value: string; label: string}[] = [];
    for (let minutes = 6 * 60; minutes <= 21 * 60; minutes += 15) {
      const h24 = Math.floor(minutes / 60);
      const m = minutes % 60;
      const value = `${h24.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      const period = h24 < 12 ? 'AM' : 'PM';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      options.push({value, label: `${h12}:${m.toString().padStart(2, '0')} ${period}`});
    }
    return options;
  }
}
