import {DestroyRef, Component, inject, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {SessionDialogData} from '../interfaces/session-dialog-data.interface';
import {MatTimepickerModule} from '@angular/material/timepicker';
import {provideNativeDateAdapter} from '@angular/material/core';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatSelectModule} from '@angular/material/select';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {DatePipe} from '@angular/common';
import {SessionsService} from '../services/sessions.service';
import {Session} from '../models/session.model';
import {Response} from '../models/response.model';
import {catchError, EMPTY, forkJoin, Observable, of} from 'rxjs';
import {ContactService} from '../services/contact.service';
import {StudentService} from '../services/student.service';
import {StudentStatus} from '../enums/student-status.enum';
import {StaffStatus} from '../enums/staff-status.enum';
import {Service} from '../enums/service.enum';
import {Contact} from '../models/contact.model';
import {Student} from '../models/student.model';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';
import {AuthService} from '../services/auth.service';
import {ScheduleService} from '../services/schedule.service';
import {PackageDef, resolvePackageDef} from '../utils/package-config';
import {availableMakeupMinutes, bankMakeupMinutes, consumeMakeupMinutes} from '../utils/makeup';
import {studentDisplayName} from '../utils/student-name';

@Component({
  selector: 'app-session-dialog',
  providers: [provideNativeDateAdapter()],
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatButtonModule,
    MatTimepickerModule,
    MatDatepickerModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    DatePipe,
  ],
  templateUrl: './session-dialog.html',
  standalone: true,
  styleUrl: './session-dialog.scss'
})
export class SessionDialog implements OnInit {
  protected readonly studentDisplayName = studentDisplayName;
  startTime: Date | undefined;
  endTime: Date | undefined;
  date: Date | undefined;
  errorMessage: String = '';
  notes: string = '';
  hasError: boolean = false;
  selectedType: SessionType = SessionType.TUTORING;
  selectedTutor: string | undefined;
  selectedStudent: string | undefined;
  selectedAttendance: any;
  // Trials are only created from the contact page; the generic dialog offers
  // TRIAL only when the session being edited already is one.
  sessionTypeOptions: SessionType[] =
    Object.values(SessionType).filter(t => t !== SessionType.TRIAL);
  readonly SessionType = SessionType;
  readonly SessionStatus = SessionStatus;
  readonly typeLabels: Record<string, string> = {
    [SessionType.TUTORING]: 'Tutoring',
    [SessionType.MAKE_UP]: 'Make-up',
    [SessionType.ADMIN]: 'Admin',
    [SessionType.TRIAL]: 'Trial',
  };
  // All active staff (Hiring + Active Staff); the `tutors` getter narrows by
  // session type — Admin time is loggable by any staff member, tutoring only
  // by accepting tutors.
  private allStaff: Contact[] = [];
  get tutors(): Contact[] {
    // Locked self-service mode: only the tutor themselves — even when they're
    // at capacity (not currently accepting), their own name must render.
    if (this.isMakeupLocked) {
      const ownId = this.authService.contact().id;
      return this.allStaff.filter(c => c.id === ownId);
    }
    if (this.selectedType === SessionType.ADMIN) {
      return this.allStaff;
    }
    // Trials keep the accepting-students filter off: the assigned tutor may
    // be at capacity and must still be selectable.
    if (this.selectedType === SessionType.TRIAL) {
      return this.allStaff.filter(c => c.is_tutor !== false);
    }
    return this.allStaff.filter(
      c => c.is_tutor !== false && c.currently_accepting_students,
    );
  }
  students: Student[] = [];
  filteredStudents: Student[] = [];
  showStatusConfirm: boolean = false;
  // True while a backend call is in flight — the action buttons are replaced by
  // a spinner so the user can't submit the same session twice.
  submitting: boolean = false;
  showAvailabilityConfirm: boolean = false;
  availabilityTutorName: string = '';
  private availabilityOverridden: boolean = false;
  // Soft warning when an individual session is added/edited for a student who
  // already has a saved monthly schedule (it may exceed their package sessions/week).
  showScheduleWarning: boolean = false;
  scheduleWarningMessage: string = '';
  private scheduleWarningOverridden: boolean = false;
  private pendingAction: (() => void) | null = null;
  private pendingSession: Session | null = null;
  private pendingStudentUpdate: Student | null = null;

  // Deleting a CANCELLED session leaves its banked make-up minutes on the
  // student (un-banking retroactively could go negative) — warn first.
  showCancelledDeleteWarning: boolean = false;
  private cancelledDeleteConfirmed: boolean = false;
  // Series edit/delete scope ("this occurrence" vs "this and future")
  showSeriesScopePrompt: boolean = false;
  private seriesScope: 'single' | 'future' | null = null;
  private seriesAction: 'edit' | 'delete' | null = null;
  readonly dialogRef = inject(MatDialogRef<SessionDialog>);
  readonly dialogData = inject<SessionDialogData>(MAT_DIALOG_DATA);
  sessionsService: SessionsService = inject(SessionsService);
  contactService: ContactService = inject(ContactService);
  studentService: StudentService = inject(StudentService);
  authService: AuthService = inject(AuthService);
  scheduleService: ScheduleService = inject(ScheduleService);
  // Cancels the dropdown loads if the dialog closes before they land.
  private destroyRef: DestroyRef = inject(DestroyRef);

  get selectedStudentObj(): Student | undefined {
    return this.students.find(s => s.id === this.selectedStudent);
  }

  /** The resolved package definition for the selected student (null if CUSTOM is unconfigured). */
  get selectedPackageDef(): PackageDef | null {
    const student = this.selectedStudentObj;
    if (!student) return null;
    return resolvePackageDef(student.package, {
      monthlyCost: student.custom_monthly_cost,
      sessionsPerWeek: student.custom_sessions_per_week,
      sessionLengthMin: student.custom_session_length_min,
    });
  }

  /** The "Cancelled" attendance status only applies to regular tutoring sessions. */
  get attendanceOptions(): SessionStatus[] {
    const all = Object.values(SessionStatus);
    return this.selectedType === SessionType.MAKE_UP
      ? all.filter(s => s !== SessionStatus.CANCELLED)
      : all;
  }

  /** Sessions with a student (TUTORING or MAKE_UP) — ADMIN has none. */
  get hasStudent(): boolean {
    return this.selectedType !== SessionType.ADMIN;
  }

  get seriesActionLabel(): string {
    return this.seriesAction === 'delete' ? 'deletion' : 'change';
  }

  get isStatusLocked(): boolean {
    return this.dialogData.type === 'edit'
      && !!this.dialogData.session.status
      && this.dialogData.session.status !== SessionStatus.PENDING;
  }

  /** View mode: a lead inspecting a team member's session — everything disabled. */
  get isReadOnly(): boolean {
    return this.dialogData.type === 'view';
  }

  /** Tutor self-service create: type + tutor are pinned (make-up, self). */
  get isMakeupLocked(): boolean {
    // Optional-chained: some unit specs drive getters on a bare instance.
    return !!this.dialogData?.lockToMakeup;
  }

  // ── Email notes to parent (opt-in, per save) ─────────────────────────────
  /** Checked = after this save, email the saved notes to the parent. */
  emailNotesToParent: boolean = false;
  /** The save succeeded but the notes email didn't — offer Retry/Close. */
  emailNotesFailed: boolean = false;
  private savedResponse: Session | null = null;

  /** The checkbox shows when completing (or amending) attendance on a
   *  student session — the client's tutors opt in per session. */
  get canEmailNotes(): boolean {
    return this.dialogData?.type === 'edit'
      && !this.isReadOnly
      && this.hasStudent
      && this.selectedAttendance === SessionStatus.COMPLETED;
  }

  private get sessionDurationMinutes(): number {
    if (!this.startTime || !this.endTime) return 0;
    return Math.round((this.endTime.getTime() - this.startTime.getTime()) / 60000);
  }

  /**
   * Returns an error if a tutoring session's duration exceeds the length the
   * student's package allows per session. Only applies to TUTORING sessions with
   * a configured package; ADMIN/MAKE_UP and unconfigured packages aren't
   * constrained (make-up is already bounded by the make-up minutes bank).
   */
  private validateSessionLength(durationMinutes: number): string | null {
    // Trials are fixed-length by policy.
    if (this.selectedType === SessionType.TRIAL) {
      return durationMinutes === 45
        ? null
        : 'Trial sessions are always exactly 45 minutes.';
    }
    if (this.selectedType !== SessionType.TUTORING) return null;
    const def = this.selectedPackageDef;
    if (!def) return null;
    if (durationMinutes > def.sessionLengthMin) {
      const student = this.selectedStudentObj;
      return `This session is ${durationMinutes} min, but ${student?.name ?? 'this student'}'s `
        + `${student?.package} package allows up to ${def.sessionLengthMin} min per session.`;
    }
    return null;
  }

  /** Duration in minutes of a persisted session from its start/end datetimes. */
  private durationOf(session: Session): number {
    if (!session.start_datetime || !session.end_datetime) return 0;
    return Math.round(
      (new Date(session.end_datetime).getTime() - new Date(session.start_datetime).getTime()) / 60000,
    );
  }

  /**
   * Total existing PENDING make-up minutes already committed for a student,
   * excluding any session ids handled by the current operation.
   */
  private pendingMakeupMinutesFor(studentId: string | undefined, excludeIds: Set<string>): number {
    const existing = this.dialogData.existingSessions ?? [];
    return existing
      .filter(s =>
        s.student_id === studentId &&
        s.type === SessionType.MAKE_UP &&
        s.status === SessionStatus.PENDING &&
        !excludeIds.has(s.id ?? ''),
      )
      .reduce((sum, s) => sum + this.durationOf(s), 0);
  }

  /**
   * Validates that a student's total pending make-up minutes stay within their
   * make-up balance after adding `addMinutes`. Returns an error message or null.
   */
  private validateMakeupPendingBalance(
    student: Student,
    addMinutes: number,
    excludeIds: Set<string> = new Set(),
  ): string | null {
    const balance = availableMakeupMinutes(student);
    const projected = this.pendingMakeupMinutesFor(student.id, excludeIds) + addMinutes;
    if (projected > balance) {
      return `Not enough make-up minutes. ${student.name} has ${balance} min `
        + `but this would commit ${projected} pending min.`;
    }
    return null;
  }

  ngOnInit(): void {
    if (this.dialogData.type === 'create' && this.isMakeupLocked) {
      // Tutor self-service: make-up only, assigned to themselves. Set BEFORE
      // getStudents so the caseload pre-filter sees the selected tutor.
      this.selectedType = SessionType.MAKE_UP;
      this.sessionTypeOptions = [SessionType.MAKE_UP];
      this.selectedTutor = this.authService.contact().id;
    }
    if(this.dialogData.type !== 'create') {
      this.selectedType = this.dialogData.session.type ?? SessionType.TUTORING;
      if (this.selectedType === SessionType.TRIAL) {
        this.sessionTypeOptions = Object.values(SessionType);
      }
      this.selectedStudent = this.dialogData.session.student_id;
      this.selectedTutor = this.dialogData.session.tutor_id;
      this.date = new Date(this.dialogData.session.start_datetime as string);
      this.startTime = new Date(this.dialogData.session.start_datetime as string);
      this.endTime = new Date(this.dialogData.session.end_datetime as string);
      this.selectedAttendance = this.dialogData.session.status;
      this.notes = this.dialogData.session.notes as string;
    }
    if (this.isReadOnly) {
      // View mode renders tutor/student from the session's denormalized names.
      // Skipping the loads matters: leads 403 on the param-less GET /students,
      // and the accepting-only tutors getter could exclude the member anyway.
      return;
    }
    this.getTutors();
    this.getStudents();
  }

  cancel(): void {
    this.dialogRef.close();
  }

  /**
   * Returns true if the session may proceed. For TUTORING sessions that fall
   * outside the assigned tutor's availability: Tutors get a hard error (returns
   * false); Admins get an override confirm (returns false now, `proceed` runs on
   * confirm). Returns true when availability is satisfied, not applicable, or
   * already overridden.
   */
  private passesAvailabilityGate(proceed: () => void): boolean {
    if (this.selectedType !== SessionType.TUTORING || this.availabilityOverridden) {
      return true;
    }
    if (this.isWithinAvailability()) {
      return true;
    }
    const tutor = this.tutors.find(t => t.id === this.selectedTutor);
    this.availabilityTutorName = tutor?.first_name ?? 'this tutor';
    if (this.authService.isAdmin()) {
      this.pendingAction = () => { this.availabilityOverridden = true; proceed(); };
      this.showAvailabilityConfirm = true;
    } else {
      this.errorMessage = `This session falls outside ${this.availabilityTutorName}'s availability.`;
      this.hasError = true;
    }
    return false;
  }

  /**
   * Returns true if the session may proceed. When the selected student already
   * has a saved monthly schedule, an individual (non-series) TUTORING session is
   * "extra" and may push them past the sessions/week their package allows. We
   * surface a soft "Save Anyway" warning (override) rather than a hard stop:
   * returns false while the warning is shown; `proceed` runs on confirm.
   */
  private passesScheduleGate(proceed: () => void): boolean {
    if (this.selectedType !== SessionType.TUTORING || this.scheduleWarningOverridden) {
      return true;
    }
    // Editing an occurrence that's already part of the schedule isn't an extra session.
    if (this.dialogData.type !== 'create' && this.dialogData.session.series_id) {
      return true;
    }
    // Taking attendance (or editing notes) on an existing session isn't a new
    // "extra" session either — only warn when the scheduling-relevant fields
    // (date/time/tutor/student) actually changed from the original.
    if (this.dialogData.type !== 'create' && this.scheduleFieldsUnchanged()) {
      return true;
    }
    const student = this.selectedStudentObj;
    const schedule = student?.schedule;
    if (!student || !schedule || schedule.length === 0) {
      return true;
    }
    const perWeek = this.selectedPackageDef?.sessionsPerWeek ?? schedule.length;
    const pkg = student.package ? ` (${student.package} package)` : '';
    this.scheduleWarningMessage =
      `${student.name} already has a monthly schedule of ${perWeek} session(s)/week${pkg}. `
      + 'This individual session is outside that schedule and may exceed the sessions '
      + 'their package allows. Save it anyway?';
    this.pendingAction = () => { this.scheduleWarningOverridden = true; proceed(); };
    this.showScheduleWarning = true;
    return false;
  }

  /**
   * True when the schedule-relevant fields (date/time/tutor/student) would save
   * exactly what the original session already holds — e.g. the admin is only
   * taking attendance or editing notes. Rebuilds the datetimes the same way
   * updateSession does so the comparison mirrors what would be persisted.
   */
  private scheduleFieldsUnchanged(): boolean {
    const original = this.dialogData.session;
    if (!this.date || !this.startTime || !this.endTime) {
      return false;
    }
    const start = new Date(this.date);
    start.setHours(this.startTime.getHours());
    start.setMinutes(this.startTime.getMinutes());
    const end = new Date(this.date);
    end.setHours(this.endTime.getHours());
    end.setMinutes(this.endTime.getMinutes());
    return (
      start.toISOString() === original.start_datetime
      && end.toISOString() === original.end_datetime
      && this.selectedTutor === original.tutor_id
      && this.selectedStudent === original.student_id
    );
  }

  /** True if the tutor has no availability set (skip) or the session fits within a block. */
  private isWithinAvailability(): boolean {
    if (!this.date || !this.startTime || !this.endTime) return true;
    const startMin = this.startTime.getHours() * 60 + this.startTime.getMinutes();
    const endMin = this.endTime.getHours() * 60 + this.endTime.getMinutes();
    return this.isDateTimeWithinAvailability(this.date, startMin, endMin);
  }

  /** Availability check for a specific occurrence date and explicit time range (in minutes). */
  private isDateTimeWithinAvailability(date: Date, startMin: number, endMin: number): boolean {
    const tutor = this.tutors.find(t => t.id === this.selectedTutor);
    return this.scheduleService.isDateTimeWithinAvailability(tutor, date, startMin, endMin);
  }

  confirmAvailabilityOverride(): void {
    this.showAvailabilityConfirm = false;
    const action = this.pendingAction;
    this.pendingAction = null;
    action?.();
  }

  cancelAvailabilityOverride(): void {
    this.showAvailabilityConfirm = false;
    this.pendingAction = null;
    this.availabilityOverridden = false;
  }

  confirmScheduleWarning(): void {
    this.showScheduleWarning = false;
    const action = this.pendingAction;
    this.pendingAction = null;
    action?.();
  }

  cancelScheduleWarning(): void {
    this.showScheduleWarning = false;
    this.pendingAction = null;
    this.scheduleWarningOverridden = false;
  }

  cancelStatusChange(): void {
    this.showStatusConfirm = false;
    this.pendingSession = null;
    this.pendingStudentUpdate = null;
  }

  confirmStatusChange(): void {
    if (this.submitting || !this.pendingSession) return;
    this.submitting = true;
    const doUpdate = () => {
      this.sessionsService.updateSession(this.pendingSession!).pipe(
        catchError(err => {
          this.errorMessage = 'Update session failed';
          this.hasError = true;
          this.submitting = false;
          return EMPTY;
        })
      ).subscribe(response => {
        this.hasError = false;
        this.dialogRef.close(response as Session);
      });
    };

    if (this.pendingStudentUpdate) {
      this.studentService.updateStudent(this.pendingStudentUpdate).pipe(
        catchError(err => {
          this.errorMessage = 'Failed to update student minutes';
          this.hasError = true;
          this.submitting = false;
          return EMPTY;
        })
      ).subscribe(() => doUpdate());
    } else {
      doUpdate();
    }
  }

  onStudentChange(studentId: string): void {
    this.selectedStudent = studentId;
  }

  createSession(): void {
    if (this.submitting) return;
    if(this.date && this.startTime && this.endTime) {
      if(this.startTime > this.endTime) {
        this.errorMessage = 'Please enter a valid date and time range';
        this.hasError = true;
        return;
      }
      const lengthError = this.validateSessionLength(this.sessionDurationMinutes);
      if (lengthError) {
        this.errorMessage = lengthError;
        this.hasError = true;
        return;
      }
      if (!this.passesAvailabilityGate(() => this.createSession())) {
        return;
      }
      if (!this.passesScheduleGate(() => this.createSession())) {
        return;
      }
      // Make-up sessions still draw from the banked make-up minutes.
      if (this.selectedType === SessionType.MAKE_UP) {
        const student = this.selectedStudentObj;
        if (student) {
          const error = this.validateMakeupPendingBalance(student, this.sessionDurationMinutes);
          if (error) {
            this.errorMessage = error;
            this.hasError = true;
            return;
          }
        }
      }
      let submitStartDate: Date = new Date(this.date);
      submitStartDate.setHours(this.startTime.getHours());
      submitStartDate.setMinutes(this.startTime.getMinutes());
      let submitEndDate: Date = new Date(this.date);
      submitEndDate.setHours(this.endTime.getHours());
      submitEndDate.setMinutes(this.endTime.getMinutes());
      let tutor: Contact = this.tutors.find(tutor => tutor.id === this.selectedTutor)!;
      let session: Session = new Session();
      session.type = this.selectedType;
      session.tutor_name = tutor.first_name;
      session.tutor_id = tutor.id;
      if (this.hasStudent) {
        let student: Student = this.students.find(s => s.id === this.selectedStudent)!;
        session.student_name = studentDisplayName(student);
        session.student_id = student.id;
      }
      session.start_datetime = submitStartDate.toISOString();
      session.end_datetime = submitEndDate.toISOString();
      session.status = SessionStatus.PENDING;
      session.notes = this.notes;
      this.submitting = true;
      this.sessionsService.createSession(session).pipe(
        catchError(err => {
          this.errorMessage = 'Create session failed';
          this.hasError = true;
          this.submitting = false;
          return EMPTY;
        })
      ).subscribe(response => {
        this.hasError = false;
        session.id = (response as Response).id;
        this.dialogRef.close(session);
      });
    } else {
      this.errorMessage = 'Please enter a valid date and time range';
      this.hasError = true;
    }
  }

  updateSession(): void {
    if (this.submitting) return;
    if(this.date && this.startTime && this.endTime) {
      if (this.startTime > this.endTime) {
        this.errorMessage = 'Please enter a valid date and time range';
        this.hasError = true;
        return;
      }
      // Enforce the package's per-session length for single edits and for the
      // "this & future" series path (which reuses this time range).
      const lengthError = this.validateSessionLength(this.sessionDurationMinutes);
      if (lengthError) {
        this.errorMessage = lengthError;
        this.hasError = true;
        return;
      }
      // Series sessions: ask whether to apply to this occurrence or this +
      // future — but only for actual reschedules. Attendance/notes-only edits
      // (no date/time/tutor/student change) are inherently single-occurrence,
      // so the prompt would only confuse.
      if (
        this.dialogData.session.series_id &&
        this.seriesScope === null &&
        !this.scheduleFieldsUnchanged()
      ) {
        this.seriesAction = 'edit';
        this.showSeriesScopePrompt = true;
        return;
      }
      if (this.seriesScope === 'future') {
        this.updateSeriesFuture();
        return;
      }
      if (!this.passesAvailabilityGate(() => this.updateSession())) {
        return;
      }
      if (!this.passesScheduleGate(() => this.updateSession())) {
        return;
      }
      let submitStartDate: Date = new Date(this.date);
      submitStartDate.setHours(this.startTime.getHours());
      submitStartDate.setMinutes(this.startTime.getMinutes());
      let submitEndDate: Date = new Date(this.date);
      submitEndDate.setHours(this.endTime.getHours());
      submitEndDate.setMinutes(this.endTime.getMinutes());
      // Tutor-role users get a names-only staff projection (no accepting
      // flag), so the accepting-filtered `tutors` getter can be empty for
      // them — fall back to the stored session's values rather than
      // crashing or degrading the denormalized names.
      const tutor: Contact | undefined = this.tutors.find(t => t.id === this.selectedTutor);
      let session: Session = new Session();
      session.type = this.selectedType;
      session.tutor_name = tutor?.first_name ?? this.dialogData.session.tutor_name;
      session.tutor_id = tutor?.id ?? this.dialogData.session.tutor_id;
      session.start_datetime = submitStartDate.toISOString();
      session.end_datetime = submitEndDate.toISOString();
      session.status = this.selectedAttendance;
      session.notes = this.notes;
      session.id = this.dialogData.session.id;
      session.series_id = this.dialogData.session.series_id;

      const originalStatus = this.dialogData.session.status;
      const newStatus: SessionStatus = this.selectedAttendance;
      const isStatusChange = this.hasStudent
        && originalStatus === SessionStatus.PENDING
        && newStatus !== SessionStatus.PENDING;

      if (this.hasStudent) {
        // A missed lookup (e.g. the student list failed to load) must never
        // overwrite the stored denormalized name with 'Unnamed student'.
        const student: Student | undefined = this.students.find(s => s.id === this.selectedStudent);
        session.student_name = student
          ? studentDisplayName(student)
          : this.dialogData.session.student_name;
        session.student_id = student?.id ?? this.dialogData.session.student_id;

        if (isStatusChange && student) {
          const duration = this.sessionDurationMinutes;
          // Completing/no-showing a make-up session consumes banked make-up minutes.
          if (this.selectedType === SessionType.MAKE_UP
            && (newStatus === SessionStatus.COMPLETED || newStatus === SessionStatus.NO_CALL_NO_SHOW)) {
            const balance = availableMakeupMinutes(student);
            if (balance < duration) {
              this.errorMessage = `Not enough make-up minutes. ${student.name} has ${balance} min but this session requires ${duration} min.`;
              this.hasError = true;
              return;
            }
          }
          // Only cancelled tutoring (banks minutes) and finalized make-up (deducts
          // minutes) mutate the student; completing a tutoring session does not.
          if (this.mutatesStudent(this.selectedType, newStatus)) {
            this.pendingStudentUpdate = this.selectedType === SessionType.MAKE_UP
              ? consumeMakeupMinutes({ ...student }, duration)
              : bankMakeupMinutes({ ...student }, duration, session.start_datetime as string);
          }
        } else if (student && newStatus === SessionStatus.PENDING && this.selectedType === SessionType.MAKE_UP) {
          // Editing a still-pending make-up session (e.g. lengthening it): the
          // student's total pending make-up minutes must still fit their balance.
          const exclude = new Set<string>([this.dialogData.session.id ?? '']);
          const error = this.validateMakeupPendingBalance(student, this.sessionDurationMinutes, exclude);
          if (error) {
            this.errorMessage = error;
            this.hasError = true;
            return;
          }
        }
      }

      if (isStatusChange) {
        this.pendingSession = session;
        this.showStatusConfirm = true;
      } else {
        this.submitting = true;
        this.sessionsService.updateSession(session).pipe(
          catchError(err => {
            this.errorMessage = 'Update session failed';
            this.hasError = true;
            this.submitting = false;
            return EMPTY;
          })
        ).subscribe(response => {
          this.hasError = false;
          this.syncTrialDateAfterReschedule(session);
          this.closeAfterUpdate(response as Session);
        });
      }
    } else {
      this.errorMessage = 'Please enter a valid date and time range';
      this.hasError = true;
    }
  }

  deleteSession(): void {
    if (this.submitting) return;
    // Series sessions: ask whether to delete this occurrence or this + future.
    if (this.dialogData.session.series_id && this.seriesScope === null) {
      this.seriesAction = 'delete';
      this.showSeriesScopePrompt = true;
      return;
    }
    if (this.seriesScope === 'future') {
      this.deleteSeriesFuture();
      return;
    }
    // Single delete of a cancelled session: the minutes it banked stay on the
    // student's balance with no source session left to trace them to.
    if (
      this.dialogData.session.status === SessionStatus.CANCELLED &&
      !this.cancelledDeleteConfirmed
    ) {
      this.showCancelledDeleteWarning = true;
      return;
    }
    const id: string = this.dialogData.session.id as string;
    this.submitting = true;
    this.sessionsService.deleteSession(id).pipe(
      catchError(err => {
        this.errorMessage = 'Delete session failed';
        this.hasError = true;
        this.submitting = false;
        return EMPTY;
      })
    ).subscribe(response => {
      this.hasError = false;
      this.dialogRef.close(response as Response);
    });
  }

  private updateSeriesFuture(): void {
    const current = this.dialogData.session;
    const tutor = this.tutors.find(t => t.id === this.selectedTutor);
    if (!tutor || !current.series_id) {
      this.errorMessage = 'Update session failed';
      this.hasError = true;
      return;
    }
    this.submitting = true;
    this.sessionsService.getSessionsBySeries(current.series_id).pipe(
      catchError(err => { this.errorMessage = 'Update session series failed'; this.hasError = true; this.submitting = false; return of([]); })
    ).subscribe(sessions => {
      const allSessions = sessions as Session[];
      const targets = allSessions.filter(s =>
        s.status === SessionStatus.PENDING &&
        new Date(s.start_datetime!) >= new Date(current.start_datetime!),
      );
      if (targets.length === 0) {
        this.dialogRef.close({ updated: 0 });
        return;
      }

      // Availability check for each occurrence with the new time range.
      if (!this.availabilityOverridden) {
        const failing = targets.filter(s => !this.isDateTimeWithinAvailability(
          new Date(s.start_datetime!),
          this.startTime!.getHours() * 60 + this.startTime!.getMinutes(),
          this.endTime!.getHours() * 60 + this.endTime!.getMinutes(),
        ));
        if (failing.length > 0) {
          this.availabilityTutorName = tutor.first_name ?? 'this tutor';
          // Stop for the override prompt — drop the spinner so its buttons show.
          this.submitting = false;
          if (this.authService.isAdmin()) {
            this.pendingAction = () => { this.availabilityOverridden = true; this.updateSeriesFuture(); };
            this.showAvailabilityConfirm = true;
            return;
          } else {
            this.errorMessage = `${failing.length} occurrence(s) fall outside ${this.availabilityTutorName}'s availability.`;
            this.hasError = true;
            return;
          }
        }
      }
      const updates = targets.map(s => {
        const start = new Date(s.start_datetime!);
        start.setHours(this.startTime!.getHours(), this.startTime!.getMinutes(), 0, 0);
        const end = new Date(s.start_datetime!);
        end.setHours(this.endTime!.getHours(), this.endTime!.getMinutes(), 0, 0);
        const upd: Session = { ...s };
        upd.tutor_id = tutor.id;
        upd.tutor_name = tutor.first_name;
        upd.start_datetime = start.toISOString();
        upd.end_datetime = end.toISOString();
        upd.notes = this.notes;
        return upd;
      });
      this.submitting = true;
      forkJoin(updates.map(u => this.sessionsService.updateSession(u))).pipe(
        catchError(err => { this.errorMessage = 'Update session series failed'; this.hasError = true; this.submitting = false; return EMPTY; })
      ).subscribe(() => {
        this.hasError = false;
        this.dialogRef.close({ updated: updates.length });
      });
    });
  }

  private deleteSeriesFuture(): void {
    const current = this.dialogData.session;
    if (!current.series_id) {
      this.errorMessage = 'Delete session failed';
      this.hasError = true;
      return;
    }
    this.submitting = true;
    this.sessionsService.getSessionsBySeries(current.series_id).pipe(
      catchError(err => { this.errorMessage = 'Delete session series failed'; this.hasError = true; this.submitting = false; return of([]); })
    ).subscribe(sessions => {
      const targets = (sessions as Session[]).filter(s =>
        s.status === SessionStatus.PENDING &&
        new Date(s.start_datetime!) >= new Date(current.start_datetime!),
      );
      if (targets.length === 0) {
        this.dialogRef.close({ deleted: 0 });
        return;
      }
      forkJoin(targets.map(s => this.sessionsService.deleteSession(s.id!))).pipe(
        catchError(err => { this.errorMessage = 'Delete session series failed'; this.hasError = true; this.submitting = false; return EMPTY; })
      ).subscribe(() => {
        this.hasError = false;
        this.dialogRef.close({ deleted: targets.length });
      });
    });
  }

  /**
   * The update is saved — if the tutor opted in, email the (now stored)
   * notes before closing. A failed send keeps the dialog open with a Retry
   * that ONLY re-sends the email — never re-runs the update, whose status
   * transition side effects (make-up banking) must not double-apply.
   */
  private closeAfterUpdate(response: Session): void {
    const id = this.dialogData.session.id;
    if (!this.emailNotesToParent || !id) {
      this.dialogRef.close(response);
      return;
    }
    this.sessionsService.emailSessionNotes(id).pipe(
      catchError(err => {
        console.log(err);
        this.savedResponse = response;
        this.emailNotesFailed = true;
        this.submitting = false;
        return EMPTY;
      }),
    ).subscribe(() => {
      this.dialogRef.close(response);
    });
  }

  /** Retry ONLY the notes email (the session itself is already saved). */
  retryEmailNotes(): void {
    this.emailNotesFailed = false;
    this.submitting = true;
    this.closeAfterUpdate(this.savedResponse!);
  }

  /** Give up on the email; the saved session still closes normally. */
  closeWithoutEmail(): void {
    this.dialogRef.close(this.savedResponse);
  }

  confirmCancelledDelete(): void {
    this.cancelledDeleteConfirmed = true;
    this.showCancelledDeleteWarning = false;
    this.deleteSession();
  }

  cancelCancelledDelete(): void {
    this.showCancelledDeleteWarning = false;
    // Reset the series choice too so a re-attempt starts from the beginning.
    this.seriesScope = null;
    this.seriesAction = null;
  }

  chooseSeriesScope(scope: 'single' | 'future'): void {
    this.seriesScope = scope;
    this.showSeriesScopePrompt = false;
    if (this.seriesAction === 'edit') {
      this.updateSession();
    } else if (this.seriesAction === 'delete') {
      this.deleteSession();
    }
  }

  cancelSeriesScope(): void {
    this.showSeriesScopePrompt = false;
    this.seriesScope = null;
    this.seriesAction = null;
  }

  /**
   * A rescheduled trial's session date is the trial date of record — keep the
   * student's trial_date in sync (fire-and-forget; the Onboarding table reads it).
   */
  private syncTrialDateAfterReschedule(session: Session): void {
    if (session.type !== SessionType.TRIAL || !session.student_id || !session.start_datetime) {
      return;
    }
    const original = this.dialogData.session.start_datetime;
    if (original && new Date(original).toDateString() === new Date(session.start_datetime).toDateString()) {
      return;
    }
    const start = new Date(session.start_datetime);
    const iso = `${start.getFullYear()}-${`${start.getMonth() + 1}`.padStart(2, '0')}-${`${start.getDate()}`.padStart(2, '0')}`;
    const student = this.students.find(s => s.id === session.student_id);
    this.studentService.updateStudent({
      id: session.student_id,
      contact_id: student?.contact_id,
      name: student?.name,
      trial_date: iso,
    } as Student).pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      }),
    ).subscribe();
  }

  /** Whether finalizing a session of this type/status changes the student's minute banks. */
  private mutatesStudent(type: SessionType, status: SessionStatus): boolean {
    // Trials never touch the make-up bank — a cancelled trial banks nothing.
    if (type === SessionType.TRIAL) {
      return false;
    }
    if (type === SessionType.MAKE_UP) {
      return status === SessionStatus.COMPLETED || status === SessionStatus.NO_CALL_NO_SHOW;
    }
    // Regular tutoring only mutates the student when cancelled (minutes are banked).
    return status === SessionStatus.CANCELLED;
  }

  /** The student's currently-available make-up minutes (expired batches excluded). */
  protected availableMakeup(student: Student): number {
    return availableMakeupMinutes(student);
  }

  private getTutors() {
    this.contactService.getStaff()
      .pipe(
        catchError(error => { console.log(error); return EMPTY; }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(contacts => {
        this.allStaff = contacts.filter(c => c.status === StaffStatus.ACTIVE_STAFF && c.service === Service.HIRING);
      });
  }

  onTutorChange(tutorId: string): void {
    this.selectedTutor = tutorId;
    this.selectedStudent = undefined;
    this.filteredStudents = this.students.filter(s => s.assigned_tutor_id === tutorId);
  }

  private getStudents() {
    // The param-less list is admin-only; tutors and leads may only list
    // their own assigned students — the previous unconditional call 403'd
    // silently for them, leaving the student dropdown empty.
    const ownId = this.authService.contact().id;
    const source$ = this.authService.isAdmin() || !ownId
      ? this.studentService.getStudents()
      : this.studentService.getStudentsByTutor(ownId);
    source$.pipe(
      catchError(error => { console.log(error); return EMPTY; }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(students => {
      // Trial students are usually still Onboarding — include them when this
      // dialog is working on a trial session.
      this.students = students.filter(s =>
        s.status === StudentStatus.ACTIVE_STUDENT ||
        (this.selectedType === SessionType.TRIAL && s.status === StudentStatus.ONBOARDING));
      // Pre-filter for edit mode where tutor is already selected when students load
      if (this.selectedTutor) {
        this.filteredStudents = this.students.filter(s => s.assigned_tutor_id === this.selectedTutor);
      }
    });
  }
}
