import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatDialog} from '@angular/material/dialog';
import {SessionsService} from '../services/sessions.service';
import {AuthService} from '../services/auth.service';
import {Session} from '../models/session.model';
import {catchError, Observable} from 'rxjs';
import {SessionDialog} from '../session-dialog/session-dialog';
import {Response} from '../models/response.model';
import {DatePipe} from '@angular/common';

@Component({
  selector: 'app-sessions-table',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    DatePipe,
  ],
  templateUrl: './sessions-table.html',
  styleUrl: './sessions-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true
})
export class SessionsTable implements OnInit {
  readonly sessionDialog: MatDialog = inject(MatDialog);
  sessionsService: SessionsService = inject(SessionsService);
  authService: AuthService = inject(AuthService);
  eventColumns: string[] = ['date', 'tutor', 'student', 'start', 'end', 'attendance', 'edit', 'delete'];
  eventData: Session[] = [];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.updateSessionsData();
  }

  private updateSessionsData(): void {
    if (this.authService.user().groups.includes('Admins')) {
      this.sessionsService.getAllSessions().pipe(
        catchError(error => {
          console.log(error);
          return new Observable();
        })
      ).subscribe(
        response => {
          console.log(response);
          this.eventData = response as Session[];
          this.cdr.markForCheck();
        }
      );
    } else {
      this.sessionsService.getSessionsByTutor(this.authService.user().email).pipe(
        catchError(error => {
          console.log(error);
          return new Observable();
        })
      ).subscribe(
        response => {
          console.log(response);
          this.eventData = response as Session[];
          this.cdr.markForCheck();
        }
      );
    }
  }

  openCreateSessionDialog(): void {
    console.log('openCreateSessionDialog');
    const sessionDialogRef = this.sessionDialog.open(SessionDialog, {
      data: {type: 'create', session: new Session()},
    });

    sessionDialogRef.afterClosed().subscribe((result: Session): void => {
      console.log('The dialog was closed');
      if (result !== undefined) {
        console.log(result);
        this.eventData = this.eventData.concat(result);
        this.cdr.markForCheck();
      }
    });
  }

  openEditSessionDialog(item: any): void {
    console.log('openEditSessionDialog');
    const sessionDialogRef = this.sessionDialog.open(SessionDialog, {
      data: {type: 'edit', session: item},
    });

    sessionDialogRef.afterClosed().subscribe((result: Session): void => {
      console.log('The dialog was closed');
      if (result !== undefined) {
        console.log(result);
        this.eventData = this.eventData.map((session: Session): Session => {
          if(session.id === result.id) {
            return result;
          }
          return session;
        });
        this.cdr.markForCheck();
      }
    });
  }

  openDeleteSessionDialog(item: any): void {
    console.log('openDeleteSessionDialog');
    const sessionDialogRef = this.sessionDialog.open(SessionDialog, {
      data: {type: 'delete', session: item},
    });

    sessionDialogRef.afterClosed().subscribe((result: Response): void => {
      console.log('The dialog was closed');
      if (result !== undefined) {
        console.log(result);
        this.eventData = this.eventData.filter(session => session.id !== result.id);
        this.cdr.markForCheck();
      }
    });
  }
}
