import {Component, inject, OnInit} from '@angular/core';
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
import {SessionsService} from '../services/sessions.service';
import {Session} from '../models/session.model';
import {Response} from '../models/response.model';
import {catchError, EMPTY, forkJoin, Observable, of} from 'rxjs';
import {ContactService} from '../services/contact.service';
import {StudentService} from '../services/student.service';
import {Status} from '../enums/status.enum';
import {Service} from '../enums/service.enum';
import {Contact} from '../models/contact.model';
import {Student} from '../models/student.model';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';
import {AuthService} from '../services/auth.service';
import {ScheduleService} from '../services/schedule.service';
import {PackageDef, resolvePackageDef} from '../utils/package-config';
import {availableMakeupMinutes, bankMakeupMinutes, consumeMakeupMinutes} from '../utils/makeup';

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
  ],
  templateUrl: './session-dialog.html',
  standalone: true,
  styleUrl: './session-dialog.scss'
})
export class SessionDialog implements OnInit {
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
  sessionTypeOptions: SessionType[] = Object.values(SessionType);
  readonly SessionType = SessionType;
  readonly SessionStatus = SessionStatus;
  readonly typeLabels: Record<string, string> = {
    [SessionType.TUTORING]: 'Tutoring',
    [SessionType.MAKE_UP]: 'Make-up',
    [SessionType.ADMIN]: 'Admin',
  };
  tutors: Contact[] = [];
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
    if(this.dialogData.type !== 'create') {
      this.selectedType = this.dialogData.session.type ?? SessionType.TUTORING;
      this.selectedStudent = this.dialogData.session.student_id;
      this.selectedTutor = this.dialogData.session.tutor_id;
      this.date = new Date(this.dialogData.session.start_datetime as string);
      this.startTime = new Date(this.dialogData.session.start_datetime as string);
      this.endTime = new Date(this.dialogData.session.end_datetime as string);
      this.selectedAttendance = this.dialogData.session.status;
      this.notes = this.dialogData.session.notes as string;
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
          return new Observable();
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
          return new Observable();
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
        session.student_name = student.name;
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
          return new Observable();
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
      // Series sessions: ask whether to apply to this occurrence or this + future.
      if (this.dialogData.session.series_id && this.seriesScope === null) {
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
      let tutor: Contact = this.tutors.find(t => t.id === this.selectedTutor)!;
      let session: Session = new Session();
      session.type = this.selectedType;
      session.tutor_name = tutor.first_name;
      session.tutor_id = tutor.id;
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
        let student: Student = this.students.find(s => s.id === this.selectedStudent)!;
        session.student_name = student?.name;
        session.student_id = student?.id;

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
            return new Observable();
          })
        ).subscribe(response => {
          this.hasError = false;
          this.dialogRef.close(response as Session);
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
    const id: string = this.dialogData.session.id as string;
    this.submitting = true;
    this.sessionsService.deleteSession(id).pipe(
      catchError(err => {
        this.errorMessage = 'Delete session failed';
        this.hasError = true;
        this.submitting = false;
        return new Observable();
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
        catchError(err => { this.errorMessage = 'Update session series failed'; this.hasError = true; this.submitting = false; return new Observable(); })
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
        catchError(err => { this.errorMessage = 'Delete session series failed'; this.hasError = true; this.submitting = false; return new Observable(); })
      ).subscribe(() => {
        this.hasError = false;
        this.dialogRef.close({ deleted: targets.length });
      });
    });
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

  /** Whether finalizing a session of this type/status changes the student's minute banks. */
  private mutatesStudent(type: SessionType, status: SessionStatus): boolean {
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
      .pipe(catchError(error => { console.log(error); return EMPTY; }))
      .subscribe(contacts => {
        this.tutors = contacts.filter(c => c.status === Status.STAFF && c.currently_accepting_students && c.service === Service.HIRING);
      });
  }

  onTutorChange(tutorId: string): void {
    this.selectedTutor = tutorId;
    this.selectedStudent = undefined;
    this.filteredStudents = this.students.filter(s => s.assigned_tutor_id === tutorId);
  }

  private getStudents() {
    this.studentService.getStudents().pipe(
      catchError(error => { console.log(error); return EMPTY; })
    ).subscribe(students => {
      this.students = students.filter(s => s.status === Status.ACTIVE_STUDENT);
      // Pre-filter for edit mode where tutor is already selected when students load
      if (this.selectedTutor) {
        this.filteredStudents = this.students.filter(s => s.assigned_tutor_id === this.selectedTutor);
      }
    });
  }
}
