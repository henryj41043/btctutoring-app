import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit, ViewChild} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatDialog} from '@angular/material/dialog';
import {SessionRange, SessionsService} from '../services/sessions.service';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {FormsModule} from '@angular/forms';
import {provideNativeDateAdapter} from '@angular/material/core';
import {AuthService} from '../services/auth.service';
import {Session} from '../models/session.model';
import {SessionType} from '../enums/session-type.enum';
import {catchError, EMPTY} from 'rxjs';
import {SessionDialog} from '../session-dialog/session-dialog';
import {Response} from '../models/response.model';
import {DatePipe} from '@angular/common';
import {TableStateStore} from '../utils/table-state';

@Component({
  selector: 'app-sessions-table',
  providers: [provideNativeDateAdapter()],
  imports: [
    MatButtonModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatSortModule,
    MatPaginatorModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatProgressSpinnerModule,
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
  // Cancels in-flight HTTP work when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);

  // Setter form: the table is inside an @if, so sort/paginator only exist
  // once loading finishes.
  // Restores the admin's place (page/sort/filters) after navigating away.
  private readonly viewState = new TableStateStore('btc-sessions-view');
  @ViewChild(MatSort) set matSort(sort: MatSort) {
    if (sort) {
      this.viewState.attachSort(sort);
      this.dataSource.sort = sort;
    }
  }
  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) {
      this.viewState.attachPaginator(paginator);
      this.dataSource.paginator = paginator;
    }
  }

  readonly SessionType = SessionType;
  eventColumns: string[] = ['date', 'tutor', 'student', 'start', 'end', 'attendance', 'notes', 'edit', 'delete'];
  dataSource = new MatTableDataSource<Session>([]);
  /** The month whose sessions are shown; only that month is fetched. */
  selectedDate: Date = new Date();
  loading: boolean = true;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    const savedDate = this.viewState.load().extra?.['selectedDate'];
    if (typeof savedDate === 'string' && !isNaN(Date.parse(savedDate))) {
      this.selectedDate = new Date(savedDate);
    }
    this.dataSource.sortingDataAccessor = (item, property) => {
      switch (property) {
        case 'date': return item.start_datetime ?? '';
        case 'tutor': return item.tutor_name ?? '';
        case 'student': return item.student_name ?? '';
        case 'attendance': return item.status ?? '';
        default: return (item as any)[property];
      }
    };
    this.updateSessionsData();
  }

  onDateChange(date: Date | null): void {
    if (date) {
      this.selectedDate = date;
      this.viewState.patch({extra: {selectedDate: date.toISOString()}});
      this.updateSessionsData();
    }
  }

  /** The selected month as an inclusive ISO datetime range. */
  private selectedMonthRange(): SessionRange {
    const y = this.selectedDate.getFullYear();
    const m = this.selectedDate.getMonth();
    return {
      from: new Date(y, m, 1).toISOString(),
      to: new Date(y, m + 1, 0, 23, 59, 59, 999).toISOString(),
    };
  }

  private updateSessionsData(): void {
    this.loading = true;
    this.cdr.markForCheck();
    const isAdmin = this.authService.isAdmin();
    const isTutorLike = this.authService.isTutorLike();
    const range = this.selectedMonthRange();
    const tutorId = this.authService.contact().id;

    const source$ = isAdmin
      ? this.sessionsService.getAllSessions(range)
      : this.authService.isLead()
        ? this.sessionsService.getTeamSessions(range)
        : isTutorLike && tutorId
          ? this.sessionsService.getSessionsByTutor(tutorId, range)
          : null;

    if (!source$) {
      this.dataSource.data = [];
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    source$.pipe(
      catchError(error => {
        console.log(error);
        this.loading = false;
        this.cdr.markForCheck();
        // EMPTY completes (a bare Observable never would).
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(response => {
      this.dataSource.data = (response as Session[]).filter(s => s.type !== SessionType.ADMIN);
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  openCreateSessionDialog(): void {
    console.log('openCreateSessionDialog');
    const sessionDialogRef = this.sessionDialog.open(SessionDialog, {
      data: {type: 'create', session: new Session(), existingSessions: this.dataSource.data},
    });

    sessionDialogRef.afterClosed().subscribe((result: Session): void => {
      // Reload on any change so single and series operations both reflect.
      if (result !== undefined) {
        this.updateSessionsData();
      }
    });
  }

  openEditSessionDialog(item: any): void {
    const sessionDialogRef = this.sessionDialog.open(SessionDialog, {
      data: {type: 'edit', session: item, existingSessions: this.dataSource.data},
    });

    sessionDialogRef.afterClosed().subscribe((result: Session): void => {
      if (result !== undefined) {
        this.updateSessionsData();
      }
    });
  }

  /**
   * True when the current user may modify this session: admins always; tutors
   * and leads only for their own. A lead's team-member rows get a view (eye)
   * icon instead of edit.
   */
  protected isSessionEditable(item: Session): boolean {
    return this.authService.isAdmin() ||
      item.tutor_id === this.authService.contact().id;
  }

  openViewSessionDialog(item: any): void {
    // Read-only — nothing can change, so no reload on close.
    this.sessionDialog.open(SessionDialog, {
      data: {type: 'view', session: item},
    });
  }

  openDeleteSessionDialog(item: any): void {
    const sessionDialogRef = this.sessionDialog.open(SessionDialog, {
      data: {type: 'delete', session: item},
    });

    sessionDialogRef.afterClosed().subscribe((result: Response): void => {
      if (result !== undefined) {
        this.updateSessionsData();
      }
    });
  }
}
