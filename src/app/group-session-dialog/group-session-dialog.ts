import {DestroyRef, Component, inject, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
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
import {MatSelectModule} from '@angular/material/select';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatTimepickerModule} from '@angular/material/timepicker';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {provideNativeDateAdapter} from '@angular/material/core';
import {catchError, EMPTY, forkJoin, of} from 'rxjs';
import {SessionsService} from '../services/sessions.service';
import {ContactService} from '../services/contact.service';
import {StudentService} from '../services/student.service';
import {AuthService} from '../services/auth.service';
import {Session, SessionParticipant} from '../models/session.model';
import {Contact} from '../models/contact.model';
import {SessionStatus} from '../enums/session-status.enum';
import {StudentStatus} from '../enums/student-status.enum';
import {StaffStatus} from '../enums/staff-status.enum';
import {Service} from '../enums/service.enum';
import {studentDisplayName} from '../utils/student-name';
import {contactDisplayName} from '../utils/contact-name';
import {futureSeriesTargets} from '../utils/session-times';
import {
  applyGroupSeriesEdit,
  buildGroupOccurrenceDates,
  buildGroupSessions,
  GROUP_SESSION_MINUTES,
  joinedParticipantNames,
} from '../utils/group-session';

export type GroupSessionDialogMode = 'create' | 'edit' | 'delete';

export interface GroupSessionDialogData {
  mode: GroupSessionDialogMode;
  /** The occurrence being edited/deleted (edit + delete modes). */
  session?: Session;
}

/**
 * Create/edit/delete "BTC & Me" group sessions: one tutor, a roster of
 * enrolled students, exactly 45 minutes, weekly. Create seeds the rest of the
 * current month + all of next month under one series id (the backend cron
 * keeps the series one month ahead after that). Edits to schedule fields
 * (date/time/tutor/roster) on a series occurrence prompt for "this occurrence
 * vs this and future"; attendance/notes-only edits save single-occurrence and
 * echo the stored datetimes untouched. Non-admin tutors get a restricted edit:
 * attendance + notes only.
 */
@Component({
  selector: 'app-group-session-dialog',
  providers: [provideNativeDateAdapter()],
  imports: [
    DatePipe,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatTimepickerModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    FormsModule,
  ],
  templateUrl: './group-session-dialog.html',
  standalone: true,
  styleUrl: './group-session-dialog.scss',
})
export class GroupSessionDialog implements OnInit {
  protected readonly contactDisplayName = contactDisplayName;
  readonly dialogRef = inject(MatDialogRef<GroupSessionDialog>);
  readonly data = inject<GroupSessionDialogData>(MAT_DIALOG_DATA);
  private sessionsService: SessionsService = inject(SessionsService);
  private contactService: ContactService = inject(ContactService);
  private studentService: StudentService = inject(StudentService);
  private authService: AuthService = inject(AuthService);
  private destroyRef: DestroyRef = inject(DestroyRef);

  protected readonly attendanceOptions: SessionStatus[] = Object.values(SessionStatus);

  protected tutors: Contact[] = [];
  /** Roster choices: enrolled active students, plus any stored participants. */
  protected rosterOptions: SessionParticipant[] = [];
  protected selectedTutor: string | undefined;
  protected selectedStudentIds: string[] = [];
  protected date: Date | undefined;
  protected startTime: Date | undefined;
  protected selectedAttendance: SessionStatus | undefined;
  protected notes: string = '';
  protected submitting: boolean = false;
  protected hasError: boolean = false;
  protected errorMessage: string = '';
  protected showSeriesScopePrompt: boolean = false;
  private seriesScope: 'single' | 'future' | null = null;
  private seriesAction: 'edit' | 'delete' | null = null;

  get mode(): GroupSessionDialogMode {
    return this.data.mode;
  }

  get isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  /** Tutors edit only attendance + notes; the schedule/roster is admin-owned. */
  get isRestricted(): boolean {
    return !this.isAdmin;
  }

  get seriesActionLabel(): string {
    return this.seriesAction === 'delete' ? 'deletion' : 'change';
  }

  /** Display-only session end (start + 45 min). */
  get endTime(): Date | null {
    if (!this.startTime) {
      return null;
    }
    return new Date(this.startTime.getTime() + GROUP_SESSION_MINUTES * 60000);
  }

  get canSave(): boolean {
    if (this.submitting) {
      return false;
    }
    if (this.isRestricted) {
      return true;
    }
    return !!this.date && !!this.startTime && !!this.selectedTutor
      && this.selectedStudentIds.length > 0;
  }

  ngOnInit(): void {
    const session = this.data.session;
    if (session && this.mode !== 'create') {
      this.date = new Date(session.start_datetime as string);
      this.startTime = new Date(session.start_datetime as string);
      this.selectedTutor = session.tutor_id;
      this.selectedStudentIds = (session.participants ?? []).map(p => p.id);
      this.rosterOptions = [...(session.participants ?? [])];
      this.selectedAttendance = session.status;
      this.notes = (session.notes as string) ?? '';
    }
    if (this.isAdmin && this.mode !== 'delete') {
      this.loadTutors();
      this.loadStudents();
    }
  }

  private loadTutors(): void {
    this.contactService.getStaff()
      .pipe(
        catchError(error => { console.log(error); return EMPTY; }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(contacts => {
        this.tutors = contacts.filter(c =>
          c.status === StaffStatus.ACTIVE_STAFF
          && c.service === Service.HIRING
          && c.is_tutor !== false);
      });
  }

  private loadStudents(): void {
    this.studentService.getStudents()
      .pipe(
        catchError(error => { console.log(error); return EMPTY; }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(students => {
        const enrolled: SessionParticipant[] = students
          .filter(s => s.status === StudentStatus.ACTIVE_STUDENT && s.btc_and_me)
          .map(s => ({id: s.id!, name: studentDisplayName(s)}));
        // A stored participant who was since un-flagged must stay renderable
        // (and removable) on the existing roster.
        const stored = this.rosterOptions
          .filter(p => !enrolled.some(e => e.id === p.id));
        this.rosterOptions = [...enrolled, ...stored];
      });
  }

  /** The selected roster as participants, named from the loaded options. */
  private selectedParticipants(): SessionParticipant[] {
    return this.selectedStudentIds
      .map(id => this.rosterOptions.find(p => p.id === id))
      .filter((p): p is SessionParticipant => !!p);
  }

  /** 'HH:mm' wall time of the picked start (interpreted as Eastern on save). */
  private timeString(): string {
    const h = this.startTime!.getHours().toString().padStart(2, '0');
    const m = this.startTime!.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  /**
   * True when date/time/tutor/roster would save exactly what's stored —
   * attendance/notes-only edits are single-occurrence by nature and must not
   * prompt for scope (or re-encode the stored datetimes). Compared in local
   * wall terms, the same view the fields were prefilled from.
   */
  private scheduleFieldsChanged(): boolean {
    const original = this.data.session!;
    const stored = new Date(original.start_datetime as string);
    if (!this.date || !this.startTime) {
      return true;
    }
    if (
      this.date.getFullYear() !== stored.getFullYear()
      || this.date.getMonth() !== stored.getMonth()
      || this.date.getDate() !== stored.getDate()
      || this.startTime.getHours() !== stored.getHours()
      || this.startTime.getMinutes() !== stored.getMinutes()
      || this.selectedTutor !== original.tutor_id
    ) {
      return true;
    }
    const storedIds = (original.participants ?? []).map(p => p.id);
    return storedIds.length !== this.selectedStudentIds.length
      || storedIds.some(id => !this.selectedStudentIds.includes(id));
  }

  cancel(): void {
    if (this.submitting) {
      return;
    }
    this.dialogRef.close();
  }

  save(): void {
    if (!this.canSave) {
      return;
    }
    if (this.mode === 'create') {
      this.createSeries();
      return;
    }
    this.updateSession();
  }

  private createSeries(): void {
    const tutor = this.tutors.find(t => t.id === this.selectedTutor);
    if (!tutor) {
      this.fail('Pick a tutor for the group.');
      return;
    }
    const sessions = buildGroupSessions(
      tutor,
      this.selectedParticipants(),
      buildGroupOccurrenceDates(this.date!),
      this.timeString(),
      crypto.randomUUID(),
      this.notes,
    );
    this.submitting = true;
    this.hasError = false;
    this.sessionsService.createSessions(sessions).pipe(
      catchError(error => {
        console.log(error);
        this.fail('Failed to create the group sessions. Please try again.');
        return EMPTY;
      }),
    ).subscribe(() => this.dialogRef.close({created: sessions.length}));
  }

  private updateSession(): void {
    const original = this.data.session!;
    const scheduleChanged = !this.isRestricted && this.scheduleFieldsChanged();
    // Schedule edits on a series occurrence need a scope decision first.
    if (scheduleChanged && original.series_id && this.seriesScope === null) {
      this.seriesAction = 'edit';
      this.showSeriesScopePrompt = true;
      return;
    }
    if (scheduleChanged && this.seriesScope === 'future') {
      this.updateSeriesFuture();
      return;
    }

    const session: Session = {...original};
    session.status = this.selectedAttendance;
    session.notes = this.notes;
    if (scheduleChanged) {
      // Re-pin the new wall time to Eastern (same conversion as creation).
      const [updated] = applyGroupSeriesEdit(
        [{...original, start_datetime: this.pickedDateIso()}],
        this.timeString(),
        this.currentTutor(),
        this.selectedParticipants(),
        this.notes,
      );
      updated.status = this.selectedAttendance;
      this.persistSingle(updated);
      return;
    }
    // Attendance/notes-only: echo the stored datetimes/roster untouched.
    this.persistSingle(session);
  }

  /** The picked calendar date as an ISO anchor for the wall-time re-pin. */
  private pickedDateIso(): string {
    return new Date(
      this.date!.getFullYear(), this.date!.getMonth(), this.date!.getDate(), 12,
    ).toISOString();
  }

  /** The selected tutor, else the stored one (restricted mode has no list). */
  private currentTutor(): Contact {
    const original = this.data.session!;
    return this.tutors.find(t => t.id === this.selectedTutor)
      ?? {id: original.tutor_id, first_name: original.tutor_name} as Contact;
  }

  private persistSingle(session: Session): void {
    this.submitting = true;
    this.hasError = false;
    this.sessionsService.updateSession(session).pipe(
      catchError(error => {
        console.log(error);
        this.fail('Failed to save the session. Please try again.');
        return EMPTY;
      }),
    ).subscribe(response => this.dialogRef.close(response as Session));
  }

  private updateSeriesFuture(): void {
    const original = this.data.session!;
    this.submitting = true;
    this.hasError = false;
    this.sessionsService.getSessionsBySeries(original.series_id!).pipe(
      catchError(error => {
        console.log(error);
        this.fail('Failed to load the series. Please try again.');
        return of(null);
      }),
    ).subscribe(sessions => {
      if (sessions === null) {
        return;
      }
      const targets = futureSeriesTargets(sessions as Session[], original);
      if (targets.length === 0) {
        this.dialogRef.close({updated: 0});
        return;
      }
      const updates = applyGroupSeriesEdit(
        targets,
        this.timeString(),
        this.currentTutor(),
        this.selectedParticipants(),
        this.notes,
      );
      forkJoin(updates.map(u => this.sessionsService.updateSession(u))).pipe(
        catchError(error => {
          console.log(error);
          this.fail('Failed to update the series. Please try again.');
          return EMPTY;
        }),
      ).subscribe(() => this.dialogRef.close({updated: updates.length}));
    });
  }

  deleteSession(): void {
    if (this.submitting) {
      return;
    }
    const original = this.data.session!;
    if (original.series_id && this.seriesScope === null) {
      this.seriesAction = 'delete';
      this.showSeriesScopePrompt = true;
      return;
    }
    if (this.seriesScope === 'future') {
      this.deleteSeriesFuture();
      return;
    }
    this.submitting = true;
    this.hasError = false;
    this.sessionsService.deleteSession(original.id!).pipe(
      catchError(error => {
        console.log(error);
        this.fail('Failed to delete the session. Please try again.');
        return EMPTY;
      }),
    ).subscribe(response => this.dialogRef.close(response));
  }

  private deleteSeriesFuture(): void {
    const original = this.data.session!;
    this.submitting = true;
    this.hasError = false;
    this.sessionsService.getSessionsBySeries(original.series_id!).pipe(
      catchError(error => {
        console.log(error);
        this.fail('Failed to load the series. Please try again.');
        return of(null);
      }),
    ).subscribe(sessions => {
      if (sessions === null) {
        return;
      }
      const targets = futureSeriesTargets(sessions as Session[], original);
      if (targets.length === 0) {
        this.dialogRef.close({deleted: 0});
        return;
      }
      forkJoin(targets.map(t => this.sessionsService.deleteSession(t.id!))).pipe(
        catchError(error => {
          console.log(error);
          this.fail('Failed to delete the series. Please try again.');
          return EMPTY;
        }),
      ).subscribe(() => this.dialogRef.close({deleted: targets.length}));
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

  private fail(message: string): void {
    this.errorMessage = message;
    this.hasError = true;
    this.submitting = false;
  }
}
