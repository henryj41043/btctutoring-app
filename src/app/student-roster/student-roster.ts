import {DestroyRef, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {provideNativeDateAdapter} from '@angular/material/core';
import {MatDialog} from '@angular/material/dialog';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatButtonModule} from '@angular/material/button';
import {Router} from '@angular/router';
import {catchError, EMPTY, of} from 'rxjs';
import {StudentService} from '../services/student.service';
import {SessionsService} from '../services/sessions.service';
import {AuthService} from '../services/auth.service';
import {Student} from '../models/student.model';
import {Session} from '../models/session.model';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';
import {UserGroup} from '../enums/user-group.enum';
import {StudentStatus} from '../enums/student-status.enum';
import {StudentSessionsDialog} from '../student-sessions-dialog/student-sessions-dialog';
import {availableMakeupMinutes} from '../utils/makeup';
import {round2} from '../utils/package-config';
import {studentDisplayName} from '../utils/student-name';
import {studentStatusChipClass} from '../utils/status-chip';
import {TableStateStore} from '../utils/table-state';

/** One monthly-history row: a student's completed work in the chosen month. */
export interface RosterHistoryRow {
  family: string;
  student: string;
  tutors: string;
  sessions: number;
  makeups: number;
  trials: number;
  hours: number;
}

@Component({
  selector: 'app-student-roster',
  providers: [provideNativeDateAdapter()],
  imports: [
    DatePipe,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatSortModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatButtonModule,
  ],
  templateUrl: './student-roster.html',
  styleUrl: './student-roster.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class StudentRoster implements OnInit {
  private studentService: StudentService = inject(StudentService);
  private sessionsService: SessionsService = inject(SessionsService);
  protected authService: AuthService = inject(AuthService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  // Cancels in-flight HTTP work when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);
  private dialog: MatDialog = inject(MatDialog);
  private snackBar: MatSnackBar = inject(MatSnackBar);
  private router: Router = inject(Router);

  // Setter form: the table is inside an @if, so sort/paginator only exist
  // once loading finishes.
  // Restores the admin's place (page/sort/filters) after navigating away.
  private readonly viewState = new TableStateStore('btc-roster-view');
  // The @if swap between current and history tables creates a fresh
  // MatSort/MatPaginator each time — attach whichever data source is showing.
  @ViewChild(MatSort) set matSort(sort: MatSort) {
    if (sort) {
      this.viewState.attachSort(sort);
      if (this.historyMode) {
        this.historyDataSource.sort = sort;
      } else {
        this.dataSource.sort = sort;
      }
    }
  }
  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) {
      this.viewState.attachPaginator(paginator);
      if (this.historyMode) {
        this.historyDataSource.paginator = paginator;
      } else {
        this.dataSource.paginator = paginator;
      }
    }
  }

  protected rosterColumns: string[] = ['contact_name', 'name', 'status', 'package', 'make_up_minutes', 'scholarship', 'actions'];
  protected dataSource = new MatTableDataSource<Student>([]);
  protected readonly studentDisplayName = studentDisplayName;
  protected readonly statusChipClass = studentStatusChipClass;
  protected loading: boolean = true;

  // ── Monthly history (admin-only: the all-sessions endpoint is admin-gated) ──
  protected historyMode: boolean = false;
  protected selectedDate: Date = new Date();
  protected historyColumns: string[] = ['family', 'student', 'tutors', 'sessions', 'makeups', 'trials', 'hours'];
  protected historyDataSource = new MatTableDataSource<RosterHistoryRow>([]);
  protected historyLoading: boolean = false;
  // Every student regardless of status — history months reference students
  // who are no longer on the active roster.
  private allStudents: Student[] = [];

  ngOnInit(): void {
    const saved = this.viewState.load();
    if (saved.filter) {
      this.dataSource.filter = saved.filter;
      this.historyDataSource.filter = saved.filter;
    }
    // Case-insensitive search across the visible columns (mirrors the contacts table).
    this.dataSource.filterPredicate = (student, filter) => {
      const haystack = [student.contact_name, student.name, student.status, student.package]
        .join(' ')
        .toLowerCase();
      return haystack.includes(filter);
    };
    this.historyDataSource.filterPredicate = (row, filter) => {
      const haystack = [row.family, row.student, row.tutors].join(' ').toLowerCase();
      return haystack.includes(filter);
    };

    const isAdmin = this.authService.isAdmin();
    // History mode restores for admins only — tutors never see the toggle.
    if (isAdmin) {
      if (typeof saved.extra?.['historyMode'] === 'boolean') {
        this.historyMode = saved.extra['historyMode'];
      }
      const savedDate = saved.extra?.['selectedDate'];
      if (typeof savedDate === 'string' && !isNaN(Date.parse(savedDate))) {
        this.selectedDate = new Date(savedDate);
      }
    }
    const tutorId = this.authService.contact().id;
    if (!isAdmin && !tutorId) {
      // No resolved contact id — never query with 'undefined'.
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }
    const source$ = isAdmin
      ? this.studentService.getStudents(true)
      : this.studentService.getStudentsByTutor(tutorId!, true);

    source$.pipe(
      catchError(error => {
        console.log(error);
        this.loading = false;
        this.cdr.markForCheck();
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(students => {
      this.allStudents = students;
      // The roster is the ACTIVE roster (other statuses live on the contact
      // page), listed by parent name per the client's request.
      this.dataSource.data = students
        .filter(s => s.status === StudentStatus.ACTIVE_STUDENT)
        .sort((a, b) => (a.contact_name ?? '').localeCompare(b.contact_name ?? ''));
      this.loading = false;
      // A restored history mode loads AFTER students arrive — the rows need
      // the student list for family-name lookups.
      if (this.historyMode) {
        this.loadHistory();
      }
      this.cdr.markForCheck();
    });
  }

  onHistoryToggle(on: boolean): void {
    this.historyMode = on;
    this.viewState.patch({extra: {historyMode: on, selectedDate: this.selectedDate.toISOString()}});
    if (on) {
      this.loadHistory();
    }
    this.cdr.markForCheck();
  }

  onDateChange(date: Date | null): void {
    if (date) {
      this.selectedDate = date;
      this.viewState.patch({extra: {historyMode: this.historyMode, selectedDate: date.toISOString()}});
      this.loadHistory();
    }
  }

  /** The selected calendar month as an ISO range for the sessions query. */
  private monthRange(): {from: string; to: string} {
    const year = this.selectedDate.getFullYear();
    const month = this.selectedDate.getMonth();
    return {
      from: new Date(year, month, 1).toISOString(),
      to: new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString(),
    };
  }

  private loadHistory(): void {
    this.historyLoading = true;
    this.cdr.markForCheck();
    this.sessionsService.getAllSessions(this.monthRange()).pipe(
      // Empty month on error rather than a stuck spinner.
      catchError(error => { console.log(error); return of([] as Session[]); }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(sessions => {
      this.historyDataSource.data = this.buildHistoryRows(sessions);
      this.historyLoading = false;
      this.cdr.markForCheck();
    });
  }

  /** Groups the month's COMPLETED tutoring/make-up/trial sessions per student. */
  private buildHistoryRows(sessions: Session[]): RosterHistoryRow[] {
    const studentById = new Map(this.allStudents.filter(s => !!s.id).map(s => [s.id!, s]));
    const groups = new Map<string, {family: string; student: string; tutors: Set<string>; sessions: number; makeups: number; trials: number; hours: number}>();
    for (const session of sessions) {
      if (session.status !== SessionStatus.COMPLETED) {
        continue;
      }
      if (session.type !== SessionType.TUTORING && session.type !== SessionType.MAKE_UP && session.type !== SessionType.TRIAL) {
        continue; // ADMIN time is staff work, not student attendance
      }
      if (!session.student_id && !session.student_name) {
        continue; // nobody to attribute the session to
      }
      const key = session.student_id ?? `name:${session.student_name}`;
      let group = groups.get(key);
      if (!group) {
        const stored = session.student_id ? studentById.get(session.student_id) : undefined;
        group = {
          family: stored?.contact_name ?? '',
          student: session.student_name || (stored ? studentDisplayName(stored) : ''),
          tutors: new Set<string>(),
          sessions: 0,
          makeups: 0,
          trials: 0,
          hours: 0,
        };
        groups.set(key, group);
      }
      if (session.tutor_name) {
        group.tutors.add(session.tutor_name);
      }
      if (session.type === SessionType.TUTORING) {
        group.sessions++;
      } else if (session.type === SessionType.MAKE_UP) {
        group.makeups++;
      } else {
        group.trials++;
      }
      group.hours += this.sessionHours(session);
    }
    return [...groups.values()]
      .map(group => ({
        family: group.family || '—',
        student: group.student || '—',
        tutors: [...group.tutors].join(', ') || '—',
        sessions: group.sessions,
        makeups: group.makeups,
        trials: group.trials,
        hours: round2(group.hours),
      }))
      .sort((a, b) => a.family.localeCompare(b.family) || a.student.localeCompare(b.student));
  }

  /** A session's duration in hours; malformed or missing datetimes count 0. */
  private sessionHours(session: Session): number {
    if (!session.start_datetime || !session.end_datetime) {
      return 0;
    }
    const ms = new Date(session.end_datetime).getTime() - new Date(session.start_datetime).getTime();
    return ms > 0 ? ms / 3600000 : 0;
  }

  /** The number of students with completed work in the selected month. */
  get historyCount(): number {
    return this.historyDataSource.data.length;
  }

  applyFilter(value: string): void {
    const filter = value.trim().toLowerCase();
    // Both views share the one search box; only the visible table's paginator
    // is ever attached, so both firstPage calls are safe.
    this.dataSource.filter = filter;
    this.historyDataSource.filter = filter;
    this.dataSource.paginator?.firstPage();
    this.historyDataSource.paginator?.firstPage();
    this.viewState.patch({filter});
  }

  /** The restored search text, for the input's initial value. */
  protected get searchText(): string {
    return this.viewState.load().filter ?? '';
  }

  /** The number of active students on the roster (not parents). */
  get activeCount(): number {
    return this.dataSource.data.length;
  }

  /** Row click drills into the student's family contact page. */
  openContact(student: Student): void {
    if (student.contact_id) {
      void this.router.navigate(['/contacts', student.contact_id]);
    }
  }

  openSessionsDialog(student: Student, event: Event): void {
    // Icon-button action — don't also trigger the row's contact navigation.
    event.stopPropagation();
    this.dialog.open(StudentSessionsDialog, {
      data: student,
      width: '700px',
    });
  }

  /** A student's currently-available make-up minutes (expired batches excluded). */
  protected availableMakeup(student: Student): number {
    return availableMakeupMinutes(student);
  }

  /**
   * Copies the filtered rows' parent emails — deduped (siblings share one),
   * blanks skipped, comma-separated for pasting into To/BCC. For tutors the
   * rows are their caseload by construction; admins get the whole roster.
   * (Contacts-table copy-emails precedent: clipboard over mailto.)
   */
  protected copyParentEmails(): void {
    const rows = this.dataSource.filteredData;
    const seen = new Set<string>();
    const emails: string[] = [];
    let missing = 0;
    for (const student of rows) {
      const email = student.contact_email?.trim();
      if (!email) {
        missing++;
        continue;
      }
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      emails.push(email);
    }
    if (emails.length === 0) {
      this.snackBar.open('No parent emails to copy in the current view.', undefined, {duration: 4000});
      return;
    }
    const missingSuffix = missing > 0 ? ` (${missing} student${missing === 1 ? '' : 's'} without one)` : '';
    navigator.clipboard.writeText(emails.join(', ')).then(
      () => this.snackBar.open(
        `${emails.length} parent email${emails.length === 1 ? '' : 's'} copied${missingSuffix}`,
        undefined, {duration: 4000}),
      () => this.snackBar.open('Could not copy to the clipboard.', undefined, {duration: 4000}),
    );
  }
}
