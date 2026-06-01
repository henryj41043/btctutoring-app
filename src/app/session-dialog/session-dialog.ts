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
  tutors: Contact[] = [];
  students: Student[] = [];
  readonly dialogRef = inject(MatDialogRef<SessionDialog>);
  readonly dialogData = inject<SessionDialogData>(MAT_DIALOG_DATA);
  sessionsService: SessionsService = inject(SessionsService);
  contactService: ContactService = inject(ContactService);
  studentService: StudentService = inject(StudentService);

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

  createSession(): void {
    if(this.date && this.startTime && this.endTime) {
      if(this.startTime > this.endTime) {
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
      let tutor: Contact = this.tutors.find(tutor => {
        return tutor.id === this.selectedTutor;
      })!;
      let session: Session = new Session();
      session.type = this.selectedType;
      session.tutor_name = tutor.first_name;
      session.tutor_id = tutor.id;
      if (this.selectedType === SessionType.TUTORING) {
        let student: Student = this.students.find(student => {
          return student.id === this.selectedStudent;
        })!;
        session.student_name = student.name;
        session.student_id = student.id;
      }
      session.start_datetime = submitStartDate.toISOString();
      session.end_datetime = submitEndDate.toISOString();
      session.status = SessionStatus.PENDING;
      session.notes = this.notes;
      console.log(session);
      this.sessionsService.createSession(session).pipe(
        catchError(err =>  {
          this.errorMessage = 'Create session failed';
          this.hasError = true;
          console.log(err);
          return new Observable();
        })
      ).subscribe(
        response => {
          this.hasError = false;
          let tempResponse: Response = response as Response;
          console.log(tempResponse);
          session.id = tempResponse.id;
          this.dialogRef.close(session);
        }
      );
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
      let tutor: Contact = this.tutors.find(tutor => {
        return tutor.id === this.selectedTutor;
      })!;
      let session: Session = new Session();
      session.type = this.selectedType;
      session.tutor_name = tutor.first_name;
      session.tutor_id = tutor.id;
      if (this.selectedType === SessionType.TUTORING) {
        let student: Student = this.students.find(student => {
          return student.id === this.selectedStudent;
        })!;
        session.student_name = student.name;
        session.student_id = student.id;
      }
      session.start_datetime = submitStartDate.toISOString();
      session.end_datetime = submitEndDate.toISOString();
      session.status = this.selectedAttendance;
      session.notes = this.notes;
      session.id = this.dialogData.session.id;
      console.log(session);
      this.sessionsService.updateSession(session).pipe(
        catchError(err =>  {
          this.errorMessage = 'Update session failed';
          this.hasError = true;
          console.log(err);
          return new Observable();
        })
      ).subscribe(
        response => {
          this.hasError = false;
          this.dialogRef.close(response as Session);
        }
      );
    } else {
      this.errorMessage = 'Please enter a valid date and time range';
      this.hasError = true;
    }
  }

  deleteSession(): void {
    let id: string = this.dialogData.session.id as string;
    console.log('Attempting to delete: ' + id);
    this.sessionsService.deleteSession(id).pipe(
      catchError(err =>  {
        this.errorMessage = 'Delete session failed';
        this.hasError = true;
        console.log(err);
        return new Observable();
      })
    ).subscribe(
      response => {
        this.hasError = false;
        this.dialogRef.close(response as Response);
      }
    );
  }

  private getTutors() {
    this.contactService.getContacts()
      .pipe(
        catchError(error => {
          console.log(error);
          return EMPTY;
        })
      )
      .subscribe(contacts => {
        this.tutors = [...contacts.filter(contact => {
          return contact.status === Status.STAFF && contact.currently_accepting_students && contact.service === Service.HIRING;
        })];
      });
  }

  private getStudents() {
    this.studentService.getStudents().pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      })
    ).subscribe(students => {
      this.students = [...students.filter(student => {
        return student.status === Status.ACTIVE_STUDENT;
      })];
    });
  }
}
