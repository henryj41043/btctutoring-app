import {Component, inject, OnInit} from '@angular/core';
import {DatePipe} from '@angular/common';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {FormsModule} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatTimepickerModule} from '@angular/material/timepicker';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatSelectModule} from '@angular/material/select';
import {provideNativeDateAdapter} from '@angular/material/core';
import {catchError, EMPTY, of, switchMap} from 'rxjs';
import {Session} from '../models/session.model';
import {Student} from '../models/student.model';
import {Contact} from '../models/contact.model';
import {SessionsService} from '../services/sessions.service';
import {StudentService} from '../services/student.service';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';
import {Response} from '../models/response.model';
import {studentDisplayName} from '../utils/student-name';
import {contactDisplayName} from '../utils/contact-name';
import {StudentStatus} from '../enums/student-status.enum';

/**
 * Allowed trial lengths in minutes, default first: 45 by policy, or 30 when
 * the student can't manage the full session (client 2026-09-22).
 */
export const TRIAL_LENGTH_OPTIONS: readonly number[] = [45, 30];
/** The default (full-length) trial. */
export const TRIAL_LENGTH_MIN = TRIAL_LENGTH_OPTIONS[0];

/**
 * Data needed to schedule a trial: the student, their assigned tutor (the
 * default choice, when they have one) and the tutors that may run the trial.
 */
export interface TrialSessionDialogData {
  student: Student;
  tutor?: Contact;
  tutors?: Contact[];
}

/**
 * What the dialog closes with: the scheduled date ('YYYY-MM-DD') when it also
 * became the student's trial date of record, or `true` when the trial was
 * scheduled without touching it (the student is past onboarding).
 */
export type TrialSessionDialogResult = string | true;

/**
 * Schedules a student's trial session (45 minutes, or 30) with a chosen tutor
 * — the assigned tutor by default, or another tutor when an existing student
 * is trying out a prospective second tutor (client 2026-09-27). Deliberately
 * separate from the generic SessionDialog: trial students are usually still
 * Onboarding (absent from its Active-only lists) and the length is a fixed
 * choice. For an Onboarding student the session's date also becomes the
 * recorded trial_date — one source of truth for the Onboarding table; a
 * student past onboarding keeps their original trial date.
 */
@Component({
  selector: 'app-trial-session-dialog',
  providers: [provideNativeDateAdapter()],
  imports: [
    DatePipe,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDatepickerModule,
    MatTimepickerModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
    MatSelectModule,
    FormsModule,
  ],
  templateUrl: './trial-session-dialog.html',
  styleUrl: './trial-session-dialog.scss',
})
export class TrialSessionDialog implements OnInit {
  readonly dialogRef = inject(MatDialogRef<TrialSessionDialog>);
  readonly data = inject<TrialSessionDialogData>(MAT_DIALOG_DATA);
  private sessionsService: SessionsService = inject(SessionsService);
  private studentService: StudentService = inject(StudentService);

  protected readonly studentDisplayName = studentDisplayName;
  protected readonly contactDisplayName = contactDisplayName;
  /** Tutors offered for the trial; the assigned tutor is always included. */
  protected tutorOptions: Contact[] = [];
  protected selectedTutorId: string | undefined;
  protected readonly lengthOptions = TRIAL_LENGTH_OPTIONS;
  /** Chosen trial length in minutes (45 default, 30 alternative). */
  protected lengthMin: number = TRIAL_LENGTH_MIN;
  protected date: Date | null = null;
  protected startTime: Date | null = null;
  protected notes: string = '';
  protected submitting: boolean = false;
  protected hasError: boolean = false;
  protected errorMessage: string = '';

  ngOnInit(): void {
    const assigned = this.data.tutor;
    const offered = [...(this.data.tutors ?? [])];
    if (assigned?.id && !offered.some(t => t.id === assigned.id)) {
      offered.unshift(assigned);
    }
    this.tutorOptions = offered;
    this.selectedTutorId = assigned?.id ?? (offered.length === 1 ? offered[0].id : undefined);
    // Prefill from the recorded trial date when one exists.
    const stored = this.data.student.trial_date;
    if (stored) {
      const [year, month, day] = stored.split('-').map(Number);
      this.date = year && month && day ? new Date(year, month - 1, day) : new Date(stored);
    } else {
      this.date = new Date();
    }
  }

  /** The computed end time (start + chosen length) for display. */
  get endTime(): Date | null {
    if (!this.startTime) {
      return null;
    }
    return new Date(this.startTime.getTime() + this.lengthMin * 60 * 1000);
  }

  /** The tutor who will run the trial. */
  get selectedTutor(): Contact | undefined {
    return this.tutorOptions.find(t => t.id === this.selectedTutorId);
  }

  /**
   * Only an Onboarding student's trial date follows the scheduled trial; a
   * later trial (e.g. with a second tutor) must not rewrite that history.
   */
  get syncsTrialDate(): boolean {
    const status = this.data.student.status;
    return !status || status === StudentStatus.ONBOARDING;
  }

  get canSave(): boolean {
    return !!this.date && !!this.startTime && !!this.selectedTutor && !this.submitting;
  }

  cancel(): void {
    if (this.submitting) {
      return;
    }
    this.dialogRef.close();
  }

  save(): void {
    const tutor = this.selectedTutor;
    if (!this.canSave || !this.date || !this.startTime || !tutor) {
      return;
    }
    this.submitting = true;
    this.hasError = false;

    const start = new Date(this.date);
    start.setHours(this.startTime.getHours(), this.startTime.getMinutes(), 0, 0);
    const end = new Date(start.getTime() + this.lengthMin * 60 * 1000);

    const session: Session = new Session();
    session.type = SessionType.TRIAL;
    session.tutor_id = tutor.id;
    session.tutor_name = tutor.first_name;
    session.student_id = this.data.student.id;
    session.student_name = studentDisplayName(this.data.student);
    session.start_datetime = start.toISOString();
    session.end_datetime = end.toISOString();
    session.status = SessionStatus.PENDING;
    session.notes = this.notes;

    const iso = `${start.getFullYear()}-${`${start.getMonth() + 1}`.padStart(2, '0')}-${`${start.getDate()}`.padStart(2, '0')}`;

    this.sessionsService
      .createSession(session)
      .pipe(
        // The scheduled date becomes an Onboarding student's trial date.
        switchMap((response: Response) => {
          session.id = response.id;
          if (!this.syncsTrialDate) {
            return of(null);
          }
          return this.studentService.updateStudent({
            id: this.data.student.id,
            contact_id: this.data.student.contact_id,
            name: this.data.student.name,
            trial_date: iso,
          } as Student);
        }),
        catchError(error => {
          console.log(error);
          this.errorMessage = 'Failed to schedule the trial session. Please try again.';
          this.hasError = true;
          this.submitting = false;
          return EMPTY;
        }),
      )
      .subscribe(() => this.dialogRef.close(this.syncsTrialDate ? iso : true));
  }
}
