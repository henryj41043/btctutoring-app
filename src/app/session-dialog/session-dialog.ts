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
import {catchError, Observable} from 'rxjs';

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
  styleUrl: './session-dialog.scss'
})
export class SessionDialog implements OnInit {
  startTime: Date | undefined;
  endTime: Date | undefined;
  date: Date | undefined;
  errorMessage: String = '';
  hasError: boolean = false;
  selectedTutor: any;
  selectedStudent: any;
  selectedAttendance: any;
  attendanceOptions = [
    { value: 'Pending' },
    { value: 'Attended' },
    { value: 'Makeup' },
    { value: 'NCNS' },
  ];
  tutors = [
    { name: 'Mario' },
    { name: 'Peach' },
    { name: 'Yoshi' },
    { name: 'Luigi' },
  ];
  students = [
    { name: 'Bowser' },
    { name: 'Koopa' },
    { name: 'Toad' },
    { name: 'Boo' },
  ];
  readonly dialogRef = inject(MatDialogRef<SessionDialog>);
  readonly dialogData = inject<SessionDialogData>(MAT_DIALOG_DATA);
  sessionsService: SessionsService = inject(SessionsService);

  ngOnInit(): void {
    if(this.dialogData.type !== 'create') {
      this.selectedStudent = this.dialogData.session.student;
      this.selectedTutor = this.dialogData.session.tutor;
      this.date = new Date(this.dialogData.session.start as string);
      this.startTime = new Date(this.dialogData.session.start as string);
      this.endTime = new Date(this.dialogData.session.end as string);
      if(!this.dialogData.session.completed && !this.dialogData.session.makeup) {
        this.selectedAttendance = 'Pending';
      } else if(this.dialogData.session.completed && !this.dialogData.session.makeup) {
        this.selectedAttendance = 'Attended';
      } else if(!this.dialogData.session.completed && this.dialogData.session.makeup) {
        this.selectedAttendance = 'Makeup';
      }
    }
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
      let session: Session = new Session();
      session.tutor = this.selectedTutor;
      session.student = this.selectedStudent;
      session.start = submitStartDate.toISOString();
      session.end = submitEndDate.toISOString();
      session.completed = false;
      session.makeup = false;
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
      let session: Session = new Session();
      session.tutor = this.selectedTutor;
      session.student = this.selectedStudent;
      session.start = submitStartDate.toISOString();
      session.end = submitEndDate.toISOString();
      switch (this.selectedAttendance) {
        case 'Pending':
          session.completed = false;
          session.makeup = false;
          break;
        case 'Attended':
          session.completed = true;
          session.makeup = false;
          break;
        case 'Makeup':
          session.completed = false;
          session.makeup = true;
          break;
        default:
          session.completed = false;
          session.makeup = false;
      }
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
}
