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
import {MatCheckboxModule} from '@angular/material/checkbox';
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
import {Weekday, WEEKDAY_BY_JS_DAY, WEEKDAY_LABELS} from '../enums/weekday.enum';

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
    MatCheckboxModule,
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
  showAvailabilityConfirm: boolean = false;
  availabilityTutorName: string = '';
  private availabilityOverridden: boolean = false;
  private pendingAction: (() => void) | null = null;
  private pendingSession: Session | null = null;
  private pendingStudentUpdate: Student | null = null;

  // Recurring series (create, TUTORING only)
  repeatWeekly: boolean = false;
  repeatDays: Weekday[] = [];
  repeatEndMode: 'count' | 'fill' = 'count';
  repeatCount: number = 1;
  readonly weekdayOptions: Weekday[] = Object.values(Weekday);
  readonly weekdayLabels = WEEKDAY_LABELS;

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

  get selectedStudentObj(): Student | undefined {
    return this.students.find(s => s.id === this.selectedStudent);
  }

  /** "Make Up" attendance status only applies to regular tutoring sessions. */
  get attendanceOptions(): SessionStatus[] {
    const all = Object.values(SessionStatus);
    return this.selectedType === SessionType.MAKE_UP
      ? all.filter(s => s !== SessionStatus.MAKE_UP)
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

  /** Duration in minutes of a persisted session from its start/end datetimes. */
  private durationOf(session: Session): number {
    if (!session.start_datetime || !session.end_datetime) return 0;
    return Math.round(
      (new Date(session.end_datetime).getTime() - new Date(session.start_datetime).getTime()) / 60000,
    );
  }

  /**
   * Total existing PENDING minutes of the given type already committed for a
   * student, excluding any session ids handled by the current operation.
   */
  private pendingMinutesFor(studentId: string | undefined, type: SessionType, excludeIds: Set<string>): number {
    const existing = this.dialogData.existingSessions ?? [];
    return existing
      .filter(s =>
        s.student_id === studentId &&
        s.type === type &&
        s.status === SessionStatus.PENDING &&
        !excludeIds.has(s.id ?? ''),
      )
      .reduce((sum, s) => sum + this.durationOf(s), 0);
  }

  /**
   * Validates that a student's total pending minutes for the affected bucket
   * stays within their balance after adding `addMinutes`. Pass the ids of any
   * existing sessions this operation replaces so they aren't double-counted.
   * Returns an error message, or null if within balance.
   */
  private validatePendingBalance(
    student: Student,
    type: SessionType,
    addMinutes: number,
    excludeIds: Set<string> = new Set(),
  ): string | null {
    const balance = this.balanceFor(student, type);
    const projected = this.pendingMinutesFor(student.id, type, excludeIds) + addMinutes;
    if (projected > balance) {
      return `Not enough ${this.balanceLabel(type)} minutes. ${student.name} has ${balance} min `
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

  /** True if the tutor has no availability set (skip) or the session fits within a block. */
  private isWithinAvailability(): boolean {
    if (!this.date) return true;
    return this.isDateWithinAvailability(this.date);
  }

  /** Availability check for a specific occurrence date, using the current time range. */
  private isDateWithinAvailability(date: Date): boolean {
    if (!this.startTime || !this.endTime) return true;
    const tutor = this.tutors.find(t => t.id === this.selectedTutor);
    if (!tutor || !tutor.availability || tutor.availability.length === 0) return true;

    const weekday = WEEKDAY_BY_JS_DAY[date.getDay()];
    const startMin = this.startTime.getHours() * 60 + this.startTime.getMinutes();
    const endMin = this.endTime.getHours() * 60 + this.endTime.getMinutes();

    return tutor.availability.some(block =>
      block.days.includes(weekday) &&
      this.timeStringToMinutes(block.start_time) <= startMin &&
      this.timeStringToMinutes(block.end_time) >= endMin,
    );
  }

  private timeStringToMinutes(time: string): number {
    const [h, m] = (time ?? '').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
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

  cancelStatusChange(): void {
    this.showStatusConfirm = false;
    this.pendingSession = null;
    this.pendingStudentUpdate = null;
  }

  confirmStatusChange(): void {
    if (!this.pendingSession) return;
    const doUpdate = () => {
      this.sessionsService.updateSession(this.pendingSession!).pipe(
        catchError(err => {
          this.errorMessage = 'Update session failed';
          this.hasError = true;
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
          return new Observable();
        })
      ).subscribe(() => doUpdate());
    } else {
      doUpdate();
    }
  }

  createSession(): void {
    // Recurring series creation is a separate flow (regular tutoring only).
    if (this.repeatWeekly && this.selectedType === SessionType.TUTORING) {
      this.createSeries();
      return;
    }
    if(this.date && this.startTime && this.endTime) {
      if(this.startTime > this.endTime) {
        this.errorMessage = 'Please enter a valid date and time range';
        this.hasError = true;
        return;
      }
      if (!this.passesAvailabilityGate(() => this.createSession())) {
        return;
      }
      if (this.hasStudent) {
        const student = this.selectedStudentObj;
        if (student) {
          const error = this.validatePendingBalance(student, this.selectedType, this.sessionDurationMinutes);
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
      this.sessionsService.createSession(session).pipe(
        catchError(err => {
          this.errorMessage = 'Create session failed';
          this.hasError = true;
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
    if(this.date && this.startTime && this.endTime) {
      if (this.startTime > this.endTime) {
        this.errorMessage = 'Please enter a valid date and time range';
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
          const balance = this.balanceFor(student, this.selectedType);
          if (balance < duration) {
            this.errorMessage = `Not enough ${this.balanceLabel(this.selectedType)} minutes. ${student.name} has ${balance} min but this session requires ${duration} min.`;
            this.hasError = true;
            return;
          }
          this.pendingStudentUpdate = this.applyMinuteDeduction({ ...student }, duration, this.selectedType, newStatus);
        } else if (student && newStatus === SessionStatus.PENDING) {
          // Editing a still-pending session (e.g. lengthening it): the student's
          // total pending minutes must still fit their balance, even though no
          // minutes are deducted until attendance is taken. Exclude this session's
          // own existing contribution so it isn't double-counted.
          const exclude = new Set<string>([this.dialogData.session.id ?? '']);
          const error = this.validatePendingBalance(student, this.selectedType, this.sessionDurationMinutes, exclude);
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
        this.sessionsService.updateSession(session).pipe(
          catchError(err => {
            this.errorMessage = 'Update session failed';
            this.hasError = true;
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
    this.sessionsService.deleteSession(id).pipe(
      catchError(err => {
        this.errorMessage = 'Delete session failed';
        this.hasError = true;
        return new Observable();
      })
    ).subscribe(response => {
      this.hasError = false;
      this.dialogRef.close(response as Response);
    });
  }

  // ── Recurring series ──────────────────────────────────────────────────────
  createSeries(): void {
    if (!this.date || !this.startTime || !this.endTime) {
      this.errorMessage = 'Please enter a valid date and time range';
      this.hasError = true;
      return;
    }
    if (this.startTime > this.endTime) {
      this.errorMessage = 'Please enter a valid date and time range';
      this.hasError = true;
      return;
    }
    if (this.repeatDays.length === 0) {
      this.errorMessage = 'Select at least one day of the week to repeat on.';
      this.hasError = true;
      return;
    }
    const student = this.selectedStudentObj;
    if (!student) {
      this.errorMessage = 'Please select a student.';
      this.hasError = true;
      return;
    }
    const duration = this.sessionDurationMinutes;
    if (duration <= 0) {
      this.errorMessage = 'Please enter a valid time range.';
      this.hasError = true;
      return;
    }
    const available = student.available_minutes ?? 0;
    // Account for the student's other already-committed pending tutoring minutes.
    const committed = this.pendingMinutesFor(student.id, SessionType.TUTORING, new Set());
    const remaining = available - committed;

    let count: number;
    if (this.repeatEndMode === 'fill') {
      count = Math.floor(remaining / duration);
      if (count < 1) {
        this.errorMessage = `${student.name} has ${remaining} of ${available} available minutes remaining (${committed} already committed) — not enough for even one ${duration}-minute session.`;
        this.hasError = true;
        return;
      }
    } else {
      count = Math.floor(this.repeatCount);
      if (count < 1) {
        this.errorMessage = 'Enter a valid number of sessions.';
        this.hasError = true;
        return;
      }
      if (count * duration > remaining) {
        this.errorMessage = `This series needs ${count * duration} min but ${student.name} has only ${remaining} of ${available} available minutes remaining (${committed} already committed in pending sessions).`;
        this.hasError = true;
        return;
      }
    }

    const occurrences = this.generateOccurrenceDates(this.date, this.repeatDays, count);

    // Validate each occurrence against the tutor's availability.
    if (!this.availabilityOverridden) {
      const failing = occurrences.filter(d => !this.isDateWithinAvailability(d));
      if (failing.length > 0) {
        const tutor = this.tutors.find(t => t.id === this.selectedTutor);
        this.availabilityTutorName = tutor?.first_name ?? 'this tutor';
        if (this.authService.isAdmin()) {
          this.pendingAction = () => { this.availabilityOverridden = true; this.createSeries(); };
          this.showAvailabilityConfirm = true;
          return;
        } else {
          this.errorMessage = `${failing.length} of ${occurrences.length} session(s) fall outside ${this.availabilityTutorName}'s availability.`;
          this.hasError = true;
          return;
        }
      }
    }

    const tutor = this.tutors.find(t => t.id === this.selectedTutor)!;
    const seriesId = crypto.randomUUID();
    const sessions: Session[] = occurrences.map(d => {
      const start = new Date(d);
      start.setHours(this.startTime!.getHours(), this.startTime!.getMinutes(), 0, 0);
      const end = new Date(d);
      end.setHours(this.endTime!.getHours(), this.endTime!.getMinutes(), 0, 0);
      const s = new Session();
      s.type = SessionType.TUTORING;
      s.tutor_id = tutor.id;
      s.tutor_name = tutor.first_name;
      s.student_id = student.id;
      s.student_name = student.name;
      s.start_datetime = start.toISOString();
      s.end_datetime = end.toISOString();
      s.status = SessionStatus.PENDING;
      s.notes = this.notes;
      s.series_id = seriesId;
      return s;
    });

    this.sessionsService.createSessions(sessions).pipe(
      catchError(err => {
        this.errorMessage = 'Create session series failed';
        this.hasError = true;
        return new Observable();
      })
    ).subscribe(response => {
      this.hasError = false;
      this.dialogRef.close(response as Response);
    });
  }

  private generateOccurrenceDates(start: Date, days: Weekday[], count: number): Date[] {
    const result: Date[] = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    let guard = 0;
    while (result.length < count && guard < 731) {
      const weekday = WEEKDAY_BY_JS_DAY[cursor.getDay()];
      if (days.includes(weekday)) {
        result.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
      guard++;
    }
    return result;
  }

  private updateSeriesFuture(): void {
    const current = this.dialogData.session;
    const tutor = this.tutors.find(t => t.id === this.selectedTutor);
    if (!tutor || !current.series_id) {
      this.errorMessage = 'Update session failed';
      this.hasError = true;
      return;
    }
    this.sessionsService.getSessionsBySeries(current.series_id).pipe(
      catchError(err => { this.errorMessage = 'Update session series failed'; this.hasError = true; return of([]); })
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

      // Re-check the student's total pending minutes against their available
      // minutes. The edited (target) occurrences are rewritten to the new
      // duration, so exclude their old contribution and add the new total; all
      // other pending sessions (in this series or not) are counted as-is.
      const student = this.selectedStudentObj;
      if (student) {
        const newDuration = this.sessionDurationMinutes;
        const targetIds = new Set(targets.map(t => t.id ?? ''));
        const error = this.validatePendingBalance(
          student,
          SessionType.TUTORING,
          targets.length * newDuration,
          targetIds,
        );
        if (error) {
          this.errorMessage = error;
          this.hasError = true;
          return;
        }
      }

      // Availability check for each occurrence with the new time range.
      if (!this.availabilityOverridden) {
        const failing = targets.filter(s => !this.isDateWithinAvailability(new Date(s.start_datetime!)));
        if (failing.length > 0) {
          this.availabilityTutorName = tutor.first_name ?? 'this tutor';
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
      forkJoin(updates.map(u => this.sessionsService.updateSession(u))).pipe(
        catchError(err => { this.errorMessage = 'Update session series failed'; this.hasError = true; return new Observable(); })
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
    this.sessionsService.getSessionsBySeries(current.series_id).pipe(
      catchError(err => { this.errorMessage = 'Delete session series failed'; this.hasError = true; return of([]); })
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
        catchError(err => { this.errorMessage = 'Delete session series failed'; this.hasError = true; return new Observable(); })
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

  private applyMinuteDeduction(student: Student, minutes: number, type: SessionType, status: SessionStatus): Student {
    if (type === SessionType.MAKE_UP) {
      // Make-up sessions consume banked make-up minutes only.
      if (status === SessionStatus.COMPLETED || status === SessionStatus.NO_CALL_NO_SHOW) {
        student.make_up_minutes = (student.make_up_minutes ?? 0) - minutes;
      }
      return student;
    }
    // Regular tutoring sessions deduct strictly from available minutes.
    if (status === SessionStatus.COMPLETED || status === SessionStatus.NO_CALL_NO_SHOW) {
      student.available_minutes = (student.available_minutes ?? 0) - minutes;
    } else if (status === SessionStatus.MAKE_UP) {
      // Banking a make-up: move minutes from available into make-up.
      student.available_minutes = (student.available_minutes ?? 0) - minutes;
      student.make_up_minutes = (student.make_up_minutes ?? 0) + minutes;
    }
    return student;
  }

  /** The minute bucket a session of the given type draws from. */
  private balanceFor(student: Student, type: SessionType): number {
    return type === SessionType.MAKE_UP
      ? (student.make_up_minutes ?? 0)
      : (student.available_minutes ?? 0);
  }

  private balanceLabel(type: SessionType): string {
    return type === SessionType.MAKE_UP ? 'make-up' : 'available';
  }

  private getTutors() {
    this.contactService.getContacts()
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
