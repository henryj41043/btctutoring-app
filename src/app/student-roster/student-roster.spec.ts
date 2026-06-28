import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { StudentRoster } from './student-roster';
import { StudentService } from '../services/student.service';
import { AuthService } from '../services/auth.service';
import { StudentSessionsDialog } from '../student-sessions-dialog/student-sessions-dialog';
import { Student } from '../models/student.model';

const student = { id: 's-1', name: 'Pat' } as Student;

describe('StudentRoster', () => {
  let isAdmin: boolean;
  const studentService = {
    getStudents: jest.fn(),
    getStudentsByTutor: jest.fn(),
  };
  const authService = {
    isAdmin: () => isAdmin,
    contact: () => ({ id: 'contact-1' }),
  };
  const dialog = { open: jest.fn() };

  const build = (): StudentRoster => {
    TestBed.configureTestingModule({
      imports: [StudentRoster],
      providers: [
        { provide: StudentService, useValue: studentService },
        { provide: AuthService, useValue: authService },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    return TestBed.createComponent(StudentRoster).componentInstance;
  };

  beforeEach(() => {
    isAdmin = true;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('loads all students for an admin on init', () => {
    studentService.getStudents.mockReturnValue(of([student]));
    const component = build();
    component.ngOnInit();
    expect(studentService.getStudents).toHaveBeenCalled();
    expect((component as unknown as { dataSource: { data: Student[] } }).dataSource.data).toEqual([
      student,
    ]);
  });

  it('loads only the tutor’s own students for a non-admin', () => {
    isAdmin = false;
    studentService.getStudentsByTutor.mockReturnValue(of([student]));
    const component = build();
    component.ngOnInit();
    expect(studentService.getStudentsByTutor).toHaveBeenCalledWith('contact-1');
  });

  it('swallows load errors and leaves the table empty', () => {
    studentService.getStudents.mockReturnValue(
      throwError(() => new Error('boom')),
    );
    const component = build();
    component.ngOnInit();
    expect((component as unknown as { dataSource: { data: Student[] } }).dataSource.data).toEqual([]);
  });

  it('wires sort and paginator after view init', () => {
    studentService.getStudents.mockReturnValue(of([]));
    const component = build();
    const sort = {} as MatSort;
    const paginator = {} as MatPaginator;
    component.sort = sort;
    component.paginator = paginator;
    component.ngAfterViewInit();
    const ds = (component as unknown as { dataSource: MatSort & { sort: MatSort; paginator: MatPaginator } }).dataSource;
    expect(ds.sort).toBe(sort);
    expect(ds.paginator).toBe(paginator);
  });

  it('exposes the expected roster columns without available_minutes', () => {
    studentService.getStudents.mockReturnValue(of([]));
    const component = build();
    expect((component as unknown as { rosterColumns: string[] }).rosterColumns).toEqual([
      'name', 'status', 'package', 'make_up_minutes', 'scholarship',
    ]);
  });

  it('opens the sessions dialog for a student', () => {
    studentService.getStudents.mockReturnValue(of([]));
    const component = build();
    component.openSessionsDialog(student);
    expect(dialog.open).toHaveBeenCalledWith(StudentSessionsDialog, {
      data: student,
      width: '700px',
    });
  });
});
