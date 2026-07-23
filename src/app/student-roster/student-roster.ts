import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatDialog} from '@angular/material/dialog';
import {catchError, EMPTY} from 'rxjs';
import {StudentService} from '../services/student.service';
import {AuthService} from '../services/auth.service';
import {Student} from '../models/student.model';
import {UserGroup} from '../enums/user-group.enum';
import {Status} from '../enums/status.enum';
import {StudentSessionsDialog} from '../student-sessions-dialog/student-sessions-dialog';
import {availableMakeupMinutes} from '../utils/makeup';

@Component({
  selector: 'app-student-roster',
  imports: [
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatSortModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './student-roster.html',
  styleUrl: './student-roster.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class StudentRoster implements OnInit {
  private studentService: StudentService = inject(StudentService);
  private authService: AuthService = inject(AuthService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private dialog: MatDialog = inject(MatDialog);

  // Setter form: the table is inside an @if, so sort/paginator only exist
  // once loading finishes.
  @ViewChild(MatSort) set matSort(sort: MatSort) {
    if (sort) { this.dataSource.sort = sort; }
  }
  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) { this.dataSource.paginator = paginator; }
  }

  protected rosterColumns: string[] = ['contact_name', 'name', 'status', 'package', 'make_up_minutes', 'scholarship'];
  protected dataSource = new MatTableDataSource<Student>([]);
  protected loading: boolean = true;

  ngOnInit(): void {
    // Case-insensitive search across the visible columns (mirrors the contacts table).
    this.dataSource.filterPredicate = (student, filter) => {
      const haystack = [student.contact_name, student.name, student.status, student.package]
        .join(' ')
        .toLowerCase();
      return haystack.includes(filter);
    };

    const isAdmin = this.authService.isAdmin();
    const source$ = isAdmin
      ? this.studentService.getStudents(true)
      : this.studentService.getStudentsByTutor(this.authService.contact().id!, true);

    source$.pipe(
      catchError(error => {
        console.log(error);
        this.loading = false;
        this.cdr.markForCheck();
        return EMPTY;
      })
    ).subscribe(students => {
      // The roster is the ACTIVE roster (other statuses live on the contact
      // page), listed by parent name per the client's request.
      this.dataSource.data = students
        .filter(s => s.status === Status.ACTIVE_STUDENT)
        .sort((a, b) => (a.contact_name ?? '').localeCompare(b.contact_name ?? ''));
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  applyFilter(value: string): void {
    this.dataSource.filter = value.trim().toLowerCase();
    this.dataSource.paginator?.firstPage();
  }

  openSessionsDialog(student: Student): void {
    this.dialog.open(StudentSessionsDialog, {
      data: student,
      width: '700px',
    });
  }

  /** A student's currently-available make-up minutes (expired batches excluded). */
  protected availableMakeup(student: Student): number {
    return availableMakeupMinutes(student);
  }
}
