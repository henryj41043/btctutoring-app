import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
import {DatePipe} from '@angular/common';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {Router} from '@angular/router';
import {catchError, EMPTY} from 'rxjs';
import {StudentService} from '../services/student.service';
import {OnboardingRow} from '../models/onboarding-row.model';
import {Student} from '../models/student.model';
import {Status} from '../enums/status.enum';

/**
 * Admin-only Onboarding page: every student in Onboarding status, joined to
 * their family's name and onboarding dates. Clicking a row opens that family's
 * contact page; checking "Onboarding Complete" advances the student to Active
 * Student (which drops it from the list).
 */
@Component({
  selector: 'app-onboarding',
  imports: [
    DatePipe,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatCheckboxModule,
    MatSortModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class Onboarding implements OnInit {
  private studentService: StudentService = inject(StudentService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private router: Router = inject(Router);

  // Setter form: the table is inside an @if, so sort/paginator only exist
  // once loading finishes.
  @ViewChild(MatSort) set matSort(sort: MatSort) {
    if (sort) { this.dataSource.sort = sort; }
  }
  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) { this.dataSource.paginator = paginator; }
  }

  protected columns: string[] = [
    'name', 'contact_name', 'onboarding_complete', 'inquiry_received',
    'inquiry_note_from_parent', 'consult_date', 'trial_date', 'registration_sent',
    'registration_received', 'scholarship_name', 'scholarship_student', 'twenty_five_received',
  ];
  protected dataSource = new MatTableDataSource<OnboardingRow>([]);
  protected loading: boolean = true;
  // Ids of rows whose completion is being saved — shows a spinner + blocks re-clicks.
  private readonly savingIds = new Set<string>();

  ngOnInit(): void {
    this.studentService.getOnboardingStudents().pipe(
      catchError(error => {
        console.log(error);
        this.loading = false;
        this.cdr.markForCheck();
        return EMPTY;
      })
    ).subscribe(rows => {
      this.dataSource.data = rows;
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  /** Navigates to the family's contact page. */
  openContact(row: OnboardingRow): void {
    void this.router.navigate(['/contacts', row.contact_id]);
  }

  isSaving(row: OnboardingRow): boolean {
    return !!row.id && this.savingIds.has(row.id);
  }

  /** Marks onboarding complete → advances the student to Active Student and drops the row. */
  completeOnboarding(row: OnboardingRow, complete: boolean): void {
    if (!complete || !row.id || this.savingIds.has(row.id)) {
      return;
    }
    this.savingIds.add(row.id);
    this.cdr.markForCheck();
    const student: Student = {
      id: row.id,
      contact_id: row.contact_id,
      name: row.name,
      status: Status.ACTIVE_STUDENT,
      onboarding_complete: true,
    };
    this.studentService.updateStudent(student).pipe(
      catchError(error => {
        console.log(error);
        this.savingIds.delete(row.id!);
        this.cdr.markForCheck();
        return EMPTY;
      })
    ).subscribe(() => {
      this.dataSource.data = this.dataSource.data.filter(r => r.id !== row.id);
      this.savingIds.delete(row.id!);
      this.cdr.markForCheck();
    });
  }
}
