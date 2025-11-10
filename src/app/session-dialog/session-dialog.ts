import {Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
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
import {MatDivider} from '@angular/material/divider';
import {MatSelectModule} from '@angular/material/select';

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
    MatDivider,
    MatTimepickerModule,
    MatDatepickerModule,
    MatSelectModule,
  ],
  templateUrl: './session-dialog.html',
  styleUrl: './session-dialog.scss'
})
export class SessionDialog {
  startTime: Date | undefined;
  endTime: Date | undefined;
  date: Date | undefined;
  errorMessage: String = '';
  hasError: boolean = false;
  selectedTutor: any;
  selectedStudent: any;
  tutors = [
    {
      name: 'Mario',
    },
    {
      name: 'Peach',
    },
    {
      name: 'Yoshi',
    },
    {
      name: 'Luigi',
    },
  ];
  students = [
    {
      name: 'Bowser',
    },
    {
      name: 'Koopa',
    },
    {
      name: 'Toad',
    },
    {
      name: 'Boo',
    },
  ];
  readonly dialogRef = inject(MatDialogRef<SessionDialog>);
  readonly dialogData = inject<SessionDialogData>(MAT_DIALOG_DATA);

  cancel(): void {
    this.dialogRef.close();
  }

  createSession() {
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
      this.hasError = false;
      console.log(submitStartDate.toISOString());
      console.log(submitEndDate.toISOString());
      console.log(this.selectedTutor);
      console.log(this.selectedStudent);
      this.dialogRef.close({
        startTime: submitStartDate.toISOString(),
        endTime: submitEndDate.toISOString(),
      });
      // this.timesheetService.createTimeEntry({
      //   start: submitStartDate.toISOString(),
      //   end: submitEndDate.toISOString()
      // })
      //   .pipe( catchError( (error: any): any => {
      //     console.log(error);
      //   }))
      //   .subscribe((response) => {
      //     console.log(response);
      //   });
    } else {
      this.errorMessage = 'Please enter a valid date and time range';
      this.hasError = true;
    }
  }
}
