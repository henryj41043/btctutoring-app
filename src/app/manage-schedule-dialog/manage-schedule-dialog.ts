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
import {catchError, EMPTY} from 'rxjs';
import {Student} from '../models/student.model';
import {Contact} from '../models/contact.model';
import {ScheduleSlot} from '../utils/proration';
import {Weekday, WEEKDAY_LABELS} from '../enums/weekday.enum';
import {PackageDef} from '../utils/package-config';
import {ScheduleService} from '../services/schedule.service';
import {AuthService} from '../services/auth.service';

/** Data needed to open the Manage Schedule dialog. */
export interface ManageScheduleDialogData {
  student: Student;
  tutor?: Contact;
}

/** A schedule slot being edited (weekday not chosen yet until picked). */
interface ScheduleSlotInput {
  weekday: Weekday | null;
  start_time: string; // 'HH:mm'
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
  private authService: AuthService = inject(AuthService);

  student!: Student;
  tutor?: Contact;
  def: PackageDef | null = null;
  isEdit: boolean = false;

  scheduleSlots: ScheduleSlotInput[] = [];
  startDate: Date | undefined;
  autoRenew: boolean = true;

  errorMessage: string = '';
  hasError: boolean = false;
  saving: boolean = false;

  // Availability override (admin) / hard block (tutor), mirroring the session dialog.
  showAvailabilityConfirm: boolean = false;
  availabilityTutorName: string = '';
  availabilityFailCount: number = 0;
  private availabilityOverridden: boolean = false;

  // Delete confirmation.
  showDeleteConfirm: boolean = false;

  readonly weekdayOptions: Weekday[] = Object.values(Weekday);
  readonly weekdayLabels = WEEKDAY_LABELS;
  /** 15-min increments 6:00 AM–9:00 PM as { value: 'HH:mm', label: '1:00 PM' }. */
  readonly timeOptions: {value: string; label: string}[] = this.buildTimeOptions();

  ngOnInit(): void {
    this.student = this.data.student;
    this.tutor = this.data.tutor;
    this.def = this.scheduleService.resolveDef(this.student);
    const existing = this.student.schedule ?? [];
    this.isEdit = existing.length > 0;
    this.autoRenew = this.student.auto_renew ?? true;
    if (this.isEdit) {
      this.scheduleSlots = existing.map(s => ({weekday: s.weekday, start_time: s.start_time}));
    } else {
      this.startDate = new Date();
      this.seedScheduleSlots();
    }
  }

  /** Reseeds blank slot rows to match the package's sessions/week (create mode). */
  private seedScheduleSlots(): void {
    const target = this.def ? this.def.sessionsPerWeek : 0;
    const next: ScheduleSlotInput[] = [];
    for (let i = 0; i < target; i++) {
      next.push(this.scheduleSlots[i] ?? {weekday: null, start_time: ''});
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
    if (!this.isEdit && !this.startDate) {
      this.fail('Please choose a start date.');
      return;
    }
    if (this.scheduleSlots.length !== this.def.sessionsPerWeek) {
      this.fail(`${this.student.package} requires ${this.def.sessionsPerWeek} session(s) per week.`);
      return;
    }
    if (this.scheduleSlots.some(s => !s.weekday || !s.start_time)) {
      this.fail('Please choose a day and start time for every session.');
      return;
    }

    const slots: ScheduleSlot[] = this.scheduleSlots.map(s => ({
      weekday: s.weekday as Weekday,
      start_time: s.start_time,
      end_time: this.scheduleService.addMinutesToTime(s.start_time, this.def!.sessionLengthMin),
    }));

    // Validate occurrences against tutor availability (warn-and-override for admins).
    if (!this.availabilityOverridden) {
      const anchor = this.isEdit ? new Date() : this.startDate!;
      const failures = this.scheduleService.findAvailabilityFailures(
        this.tutor,
        this.scheduleService.buildOccurrences(slots, anchor),
      );
      if (failures.length > 0) {
        this.availabilityTutorName = this.tutor.first_name ?? 'this tutor';
        this.availabilityFailCount = failures.length;
        if (this.authService.isAdmin()) {
          this.showAvailabilityConfirm = true;
          return;
        }
        this.fail(`${failures.length} session(s) fall outside ${this.availabilityTutorName}'s availability.`);
        return;
      }
    }

    this.persist(slots);
  }

  private persist(slots: ScheduleSlot[]): void {
    this.saving = true;
    const tutor = this.tutor!;
    const request$ = this.isEdit
      ? this.scheduleService.updateSchedule(this.student, tutor, slots, this.autoRenew)
      : this.scheduleService.createSchedule(this.student, tutor, slots, this.startDate!, this.autoRenew);
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
