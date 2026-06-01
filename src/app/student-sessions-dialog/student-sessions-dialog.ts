import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit} from '@angular/core';
import {DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle
} from '@angular/material/dialog';
import {MatTableModule} from '@angular/material/table';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {catchError, EMPTY} from 'rxjs';
import {SessionsService} from '../services/sessions.service';
import {AuthService} from '../services/auth.service';
import {Session} from '../models/session.model';
import {Student} from '../models/student.model';

@Component({
  selector: 'app-student-sessions-dialog',
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButtonModule,
    MatTableModule,
    MatProgressSpinnerModule,
    DatePipe,
    MatDialogClose,
  ],
  templateUrl: './student-sessions-dialog.html',
  styleUrl: './student-sessions-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class StudentSessionsDialog implements OnInit {
  private sessionsService: SessionsService = inject(SessionsService);
  private authService: AuthService = inject(AuthService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  readonly student = inject<Student>(MAT_DIALOG_DATA);

  protected sessions: Session[] = [];
  protected loading = true;
  protected sessionColumns = ['date', 'time', 'tutor_name', 'status', 'notes'];

  ngOnInit(): void {
    const isAdmin = this.authService.user().groups.includes('Admins');
    const source$ = isAdmin
      ? this.sessionsService.getSessionsByStudent(this.student.id!)
      : this.sessionsService.getSessions(this.authService.contact().id!, this.student.id!);

    source$.pipe(
      catchError(error => {
        console.log(error);
        this.loading = false;
        this.cdr.markForCheck();
        return EMPTY;
      })
    ).subscribe(sessions => {
      this.sessions = sessions.sort((a, b) =>
        new Date(b.start_datetime!).getTime() - new Date(a.start_datetime!).getTime()
      );
      this.loading = false;
      this.cdr.markForCheck();
    });
  }
}
