import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatDialog} from '@angular/material/dialog';
import {catchError, EMPTY} from 'rxjs';
import {StudentService} from '../services/student.service';
import {AuthService} from '../services/auth.service';
import {Student} from '../models/student.model';
import {UserGroup} from '../enums/user-group.enum';
import {StudentSessionsDialog} from '../student-sessions-dialog/student-sessions-dialog';

@Component({
  selector: 'app-student-roster',
  imports: [
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatSortModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
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

  protected rosterColumns: string[] = ['name', 'status', 'package', 'make_up_minutes', 'scholarship'];
  protected dataSource = new MatTableDataSource<Student>([]);
  protected loading: boolean = true;

  ngOnInit(): void {
    const isAdmin = this.authService.isAdmin();
    const source$ = isAdmin
      ? this.studentService.getStudents()
      : this.studentService.getStudentsByTutor(this.authService.contact().id!);

    source$.pipe(
      catchError(error => {
        console.log(error);
        this.loading = false;
        this.cdr.markForCheck();
        return EMPTY;
      })
    ).subscribe(students => {
      this.dataSource.data = students;
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  openSessionsDialog(student: Student): void {
    this.dialog.open(StudentSessionsDialog, {
      data: student,
      width: '700px',
    });
  }
}
