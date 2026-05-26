import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit} from '@angular/core';
import {MatCardModule} from '@angular/material/card';
import {MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {catchError, EMPTY} from 'rxjs';
import {StudentService} from '../services/student.service';
import {AuthService} from '../services/auth.service';
import {Student} from '../models/student.model';

@Component({
  selector: 'app-student-roster',
  imports: [
    MatCardModule,
    MatTableModule,
    MatIconModule,
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

  protected rosterColumns: string[] = ['name', 'status', 'package', 'available_minutes', 'make_up_minutes', 'scholarship'];
  protected rosterStudents: Student[] = [];

  ngOnInit(): void {
    const isAdmin = this.authService.user().groups.includes('Admins');
    const source$ = isAdmin
      ? this.studentService.getStudents()
      : this.studentService.getStudentsByTutor(this.authService.contact().id!);

    source$.pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      })
    ).subscribe(students => {
      this.rosterStudents = students;
      this.cdr.markForCheck();
    });
  }
}
