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
import {SessionsService} from '../services/sessions.service';
import {Session} from '../models/session.model';
import {Response} from '../models/response.model';
import {catchError, EMPTY, Observable} from 'rxjs';
import {ContactService} from '../services/contact.service';
import {StudentService} from '../services/student.service';
import {Status} from '../enums/status.enum';
import {Service} from '../enums/service.enum';
import {Contact} from '../models/contact.model';
import {Student} from '../models/student.model';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';

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
  attendanceOptions: SessionStatus[] = Object.values(SessionStatus);
  sessionTypeOptions: SessionType[] = Object.values(SessionType);
  readonly SessionType = SessionType;
  readonly SessionStatus = SessionStatus;
  tutors: Contact[] = [];
  students: Student[] = [];
  filteredStudents: Student[] = [];
  showStatusConfirm: boolean = false;
  private pendingSession: Session | null = null;
  private pendingStudentUpdate: Student | null = null;
  readonly dialogRef = inject(MatDialogRef<SessionDialog>);
  readonly dialogData = inject<SessionDialogData>(MAT_DIALOG_DATA);
  sessionsService: SessionsService = inject(SessionsService);
  contactService: ContactService = inject(ContactService);
  studentService: StudentService = inject(StudentService);

  get selectedStudentObj(): Student | undefined {
    return this.students.find(s => s.id === this.selectedStudent);
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
    if(this.date && this.startTime && this.endTime) {
      if(this.startTime > this.endTime) {
        this.errorMessage = 'Please enter a valid date and time range';
        this.hasError = true;
        return;
      }
      if (this.selectedType === SessionType.TUTORING) {
        const student = this.selectedStudentObj;
        if (student) {
          const duration = this.sessionDurationMinutes;
          const totalMinutes = (student.available_minutes ?? 0) + (student.make_up_minutes ?? 0);
          if (totalMinutes < duration) {
            this.errorMessage = `Not enough minutes. ${student.name} has ${totalMinutes} min available but this session requires ${duration} min.`;
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
      if (this.selectedType === SessionType.TUTORING) {
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

      const originalStatus = this.dialogData.session.status;
      const newStatus: SessionStatus = this.selectedAttendance;
      const isStatusChange = this.selectedType === SessionType.TUTORING
        && originalStatus === SessionStatus.PENDING
        && newStatus !== SessionStatus.PENDING;

      if (this.selectedType === SessionType.TUTORING) {
        let student: Student = this.students.find(s => s.id === this.selectedStudent)!;
        session.student_name = student?.name;
        session.student_id = student?.id;

        if (isStatusChange && student) {
          const duration = this.sessionDurationMinutes;
          const totalMinutes = (student.available_minutes ?? 0) + (student.make_up_minutes ?? 0);
          if (totalMinutes < duration) {
            this.errorMessage = `Not enough minutes. ${student.name} has ${totalMinutes} min available but this session requires ${duration} min.`;
            this.hasError = true;
            return;
          }
          this.pendingStudentUpdate = this.applyMinuteDeduction({ ...student }, duration, newStatus);
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

  private applyMinuteDeduction(student: Student, minutes: number, status: SessionStatus): Student {
    if (status === SessionStatus.COMPLETED || status === SessionStatus.NO_CALL_NO_SHOW) {
      const makeupDeduction = Math.min(minutes, student.make_up_minutes ?? 0);
      student.make_up_minutes = (student.make_up_minutes ?? 0) - makeupDeduction;
      student.available_minutes = (student.available_minutes ?? 0) - (minutes - makeupDeduction);
    } else if (status === SessionStatus.MAKE_UP) {
      student.available_minutes = (student.available_minutes ?? 0) - minutes;
      student.make_up_minutes = (student.make_up_minutes ?? 0) + minutes;
    }
    return student;
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
