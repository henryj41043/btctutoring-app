import {AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatDialog} from '@angular/material/dialog';
import {SessionsService} from '../services/sessions.service';
import {AuthService} from '../services/auth.service';
import {Session} from '../models/session.model';
import {UserGroup} from '../enums/user-group.enum';
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
    MatSortModule,
    MatPaginatorModule,
    DatePipe,
  ],
  templateUrl: './sessions-table.html',
  styleUrl: './sessions-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true
})
export class SessionsTable implements OnInit, AfterViewInit {
  readonly sessionDialog: MatDialog = inject(MatDialog);
  sessionsService: SessionsService = inject(SessionsService);
  authService: AuthService = inject(AuthService);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  eventColumns: string[] = ['date', 'tutor', 'student', 'start', 'end', 'attendance', 'notes', 'edit', 'delete'];
  dataSource = new MatTableDataSource<Session>([]);

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.updateSessionsData();
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sortingDataAccessor = (item, property) => {
      switch (property) {
        case 'date': return item.start_datetime ?? '';
        case 'tutor': return item.tutor_name ?? '';
        case 'student': return item.student_name ?? '';
        case 'attendance': return item.status ?? '';
        default: return (item as any)[property];
      }
    };
  }

  private updateSessionsData(): void {
    const isAdmin = this.authService.isAdmin();
    const isTutor = this.authService.user().groups.includes(UserGroup.TUTORS);

    const source$ = isAdmin
      ? this.sessionsService.getAllSessions()
      : isTutor
        ? this.sessionsService.getSessionsByTutor(this.authService.contact().id!)
        : null;

    if (!source$) {
      this.dataSource.data = [];
      this.cdr.markForCheck();
      return;
    }

    source$.pipe(
      catchError(error => {
        console.log(error);
        return new Observable();
      })
    ).subscribe(response => {
      this.dataSource.data = response as Session[];
      this.cdr.markForCheck();
    });
  }

  openCreateSessionDialog(): void {
    console.log('openCreateSessionDialog');
    const sessionDialogRef = this.sessionDialog.open(SessionDialog, {
      data: {type: 'create', session: new Session()},
    });

    sessionDialogRef.afterClosed().subscribe((result: Session): void => {
      console.log('The dialog was closed');
      if (result !== undefined) {
        this.dataSource.data = [...this.dataSource.data, result];
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
        this.dataSource.data = this.dataSource.data.map(s => s.id === result.id ? result : s);
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
        this.dataSource.data = this.dataSource.data.filter(s => s.id !== result.id);
        this.cdr.markForCheck();
      }
    });
  }
}
