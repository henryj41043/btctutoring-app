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
import {provideNativeDateAdapter} from '@angular/material/core';
import {catchError, EMPTY, switchMap} from 'rxjs';
import {Session} from '../models/session.model';
import {Student} from '../models/student.model';
import {Contact} from '../models/contact.model';
import {SessionsService} from '../services/sessions.service';
import {StudentService} from '../services/student.service';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';
import {Response} from '../models/response.model';
import {studentDisplayName} from '../utils/student-name';

/** Trials are always exactly this long (client policy). */
export const TRIAL_LENGTH_MIN = 45;

/** Data needed to schedule a trial: the student and their assigned tutor. */
export interface TrialSessionDialogData {
  student: Student;
  tutor: Contact;
}

/**
 * Schedules a student's 45-minute trial session with their assigned tutor.
 * Deliberately separate from the generic SessionDialog: trial students are
 * usually still Onboarding (absent from its Active-only lists) and the length
 * is fixed. On save the session's date also becomes the student's recorded
 * trial_date — one source of truth for the Onboarding table.
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
  protected date: Date | null = null;
  protected startTime: Date | null = null;
  protected notes: string = '';
  protected submitting: boolean = false;
  protected hasError: boolean = false;
  protected errorMessage: string = '';

  ngOnInit(): void {
    // Prefill from the recorded trial date when one exists.
    const stored = this.data.student.trial_date;
    if (stored) {
      const [year, month, day] = stored.split('-').map(Number);
      this.date = year && month && day ? new Date(year, month - 1, day) : new Date(stored);
    } else {
      this.date = new Date();
    }
  }

  /** The computed end time (start + 45 minutes) for display. */
  get endTime(): Date | null {
    if (!this.startTime) {
      return null;
    }
    return new Date(this.startTime.getTime() + TRIAL_LENGTH_MIN * 60 * 1000);
  }

  get canSave(): boolean {
    return !!this.date && !!this.startTime && !this.submitting;
  }

  cancel(): void {
    if (this.submitting) {
      return;
    }
    this.dialogRef.close();
  }

  save(): void {
    if (!this.canSave || !this.date || !this.startTime) {
      return;
    }
    this.submitting = true;
    this.hasError = false;

    const start = new Date(this.date);
    start.setHours(this.startTime.getHours(), this.startTime.getMinutes(), 0, 0);
    const end = new Date(start.getTime() + TRIAL_LENGTH_MIN * 60 * 1000);

    const session: Session = new Session();
    session.type = SessionType.TRIAL;
    session.tutor_id = this.data.tutor.id;
    session.tutor_name = this.data.tutor.first_name;
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
        // The scheduled date becomes the student's recorded trial date.
        switchMap((response: Response) => {
          session.id = response.id;
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
      .subscribe(() => this.dialogRef.close(iso));
  }
}
