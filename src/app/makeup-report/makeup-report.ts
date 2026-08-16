import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit, ViewChild} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {catchError, EMPTY} from 'rxjs';
import {StudentService} from '../services/student.service';
import {Student} from '../models/student.model';
import {availableMakeupMinutes, MakeupBatchView, unexpiredBatchViews} from '../utils/makeup';
import {studentDisplayName} from '../utils/student-name';
import {TableStateStore} from '../utils/table-state';

/** One report row: a student holding an available make-up balance. */
export interface MakeupReportRow {
  student: Student;
  available: number;
  batches: MakeupBatchView[];
  /** Soonest batch expiry; null = never expires (exempt) or legacy scalar. */
  soonestExpiry: Date | null;
  /** True when the balance predates the batch ledger — no expiry data. */
  legacy: boolean;
}

/**
 * Admin-only report of every student with available make-up minutes: totals,
 * when they expire, and the cancelled sessions they came from — the at-a-glance
 * reference for parent questions. Rows expand to per-batch detail.
 */
@Component({
  selector: 'app-makeup-report',
  imports: [
    DatePipe,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './makeup-report.html',
  styleUrl: './makeup-report.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class MakeupReport implements OnInit {
  private studentService: StudentService = inject(StudentService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  // Cancels the in-flight load when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);

  // Restores the admin's place (page/sort/filters) after navigating away.
  private readonly viewState = new TableStateStore('btc-makeup-view');
  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) {
      this.viewState.attachPaginator(paginator);
      this.dataSource.paginator = paginator;
    }
  }

  protected reportColumns: string[] = ['contact_name', 'name', 'available', 'soonest_expiry'];
  protected dataSource = new MatTableDataSource<MakeupReportRow>([]);
  protected readonly studentDisplayName = studentDisplayName;
  protected loading: boolean = true;
  /** The student id whose per-batch detail row is open. */
  protected expandedId: string | null = null;

  ngOnInit(): void {
    const savedFilter = this.viewState.load().filter;
    if (savedFilter) {
      this.dataSource.filter = savedFilter;
    }
    this.dataSource.filterPredicate = (row, filter) => {
      const haystack = [row.student.contact_name, row.student.name]
        .join(' ')
        .toLowerCase();
      return haystack.includes(filter);
    };

    this.studentService.getStudents(true).pipe(
      catchError(error => {
        console.log(error);
        this.loading = false;
        this.cdr.markForCheck();
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(students => {
      this.dataSource.data = this.buildRows(students);
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  /** Rows for every student with a balance, soonest-to-expire first. */
  private buildRows(students: Student[]): MakeupReportRow[] {
    const now = new Date();
    return students
      .map(student => {
        const available = availableMakeupMinutes(student, now);
        const batches = unexpiredBatchViews(student, now);
        const expiries = batches
          .map(b => b.expires)
          .filter((d): d is Date => d !== null);
        return {
          student,
          available,
          batches,
          soonestExpiry: expiries.length
            ? new Date(Math.min(...expiries.map(d => d.getTime())))
            : null,
          legacy: available > 0 && batches.length === 0,
        };
      })
      .filter(row => row.available > 0)
      .sort((a, b) => {
        // Dated expiries first (soonest up top); never-expire/legacy sink.
        if (a.soonestExpiry === null && b.soonestExpiry === null) {
          return (a.student.contact_name ?? '').localeCompare(b.student.contact_name ?? '');
        }
        if (a.soonestExpiry === null) return 1;
        if (b.soonestExpiry === null) return -1;
        return a.soonestExpiry.getTime() - b.soonestExpiry.getTime();
      });
  }

  applyFilter(value: string): void {
    this.dataSource.filter = value.trim().toLowerCase();
    this.dataSource.paginator?.firstPage();
    this.viewState.patch({filter: this.dataSource.filter});
  }

  /** The restored search text, for the input's initial value. */
  protected get searchText(): string {
    return this.viewState.load().filter ?? '';
  }

  toggleExpanded(row: MakeupReportRow): void {
    this.expandedId = this.expandedId === row.student.id ? null : (row.student.id ?? null);
  }

  isExpanded(row: MakeupReportRow): boolean {
    return this.expandedId === row.student.id;
  }
}
