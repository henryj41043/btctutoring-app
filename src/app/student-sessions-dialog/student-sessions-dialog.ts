import {AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
import {DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle
} from '@angular/material/dialog';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {catchError, EMPTY} from 'rxjs';
import {SessionsService} from '../services/sessions.service';
import {AuthService} from '../services/auth.service';
import {Session} from '../models/session.model';
import {Student} from '../models/student.model';
import {UserGroup} from '../enums/user-group.enum';

@Component({
  selector: 'app-student-sessions-dialog',
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButtonModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    DatePipe,
    MatDialogClose,
  ],
  templateUrl: './student-sessions-dialog.html',
  styleUrl: './student-sessions-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class StudentSessionsDialog implements OnInit, AfterViewInit {
  private sessionsService: SessionsService = inject(SessionsService);
  private authService: AuthService = inject(AuthService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  readonly student = inject<Student>(MAT_DIALOG_DATA);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  protected dataSource = new MatTableDataSource<Session>([]);
  protected loading = true;
  protected sessionColumns = ['date', 'time', 'tutor_name', 'status', 'notes'];

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sortingDataAccessor = (item, property) => {
      switch (property) {
        case 'date': return item.start_datetime ?? '';
        case 'tutor_name': return item.tutor_name ?? '';
        case 'status': return item.status ?? '';
        default: return (item as any)[property];
      }
    };
  }

  ngOnInit(): void {
    const isAdmin = this.authService.isAdmin();
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
      this.dataSource.data = sessions.sort((a, b) =>
        new Date(b.start_datetime!).getTime() - new Date(a.start_datetime!).getTime()
      );
      this.loading = false;
      this.cdr.markForCheck();
    });
  }
}
