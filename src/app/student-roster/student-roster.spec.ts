import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { StudentRoster } from './student-roster';
import { StudentService } from '../services/student.service';
import { AuthService } from '../services/auth.service';
import { StudentSessionsDialog } from '../student-sessions-dialog/student-sessions-dialog';
import { Student } from '../models/student.model';
import { StudentStatus } from '../enums/student-status.enum';

const student = { id: 's-1', name: 'Pat', status: StudentStatus.ACTIVE_STUDENT } as Student;

describe('StudentRoster', () => {
  let isAdmin: boolean;
  let contactId: string | undefined;
  const studentService = {
    getStudents: jest.fn(),
    getStudentsByTutor: jest.fn(),
  };
  const authService = {
    isAdmin: () => isAdmin,
    contact: () => ({ id: contactId }),
  };
  const dialog = { open: jest.fn() };
  const router = { navigate: jest.fn() };

  const build = (): StudentRoster => {
    TestBed.configureTestingModule({
      imports: [StudentRoster],
      providers: [
        { provide: StudentService, useValue: studentService },
        { provide: AuthService, useValue: authService },
        { provide: MatDialog, useValue: dialog },
        { provide: Router, useValue: router },
      ],
    });
    return TestBed.createComponent(StudentRoster).componentInstance;
  };

  beforeEach(() => {
    isAdmin = true;
    contactId = 'contact-1';
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('loads all students (with parent names) for an admin on init', () => {
    studentService.getStudents.mockReturnValue(of([student]));
    const component = build();
    component.ngOnInit();
    expect(studentService.getStudents).toHaveBeenCalledWith(true); // include=contact_name
    expect((component as unknown as { dataSource: { data: Student[] } }).dataSource.data).toEqual([
      student,
    ]);
  });

  it('lists students by parent name (ascending) by default', () => {
    studentService.getStudents.mockReturnValue(
      of([
        { id: 's-1', name: 'Pat', status: StudentStatus.ACTIVE_STUDENT, contact_name: 'Zoe Young' } as Student,
        { id: 's-2', name: 'Sam', status: StudentStatus.ACTIVE_STUDENT, contact_name: 'Ann Lee' } as Student,
        { id: 's-3', name: 'Kim', status: StudentStatus.ACTIVE_STUDENT } as Student, // no parent → first
      ]),
    );
    const component = build();
    component.ngOnInit();
    const data = (component as unknown as { dataSource: { data: Student[] } }).dataSource.data;
    expect(data.map(s => s.id)).toEqual(['s-3', 's-2', 's-1']);
  });

  it('shows only active students on the roster', () => {
    studentService.getStudents.mockReturnValue(
      of([
        student,
        { id: 's-2', name: 'Old', status: StudentStatus.PAST_STUDENT } as Student,
        { id: 's-3', name: 'New', status: StudentStatus.ONBOARDING } as Student,
      ]),
    );
    const component = build();
    component.ngOnInit();
    const data = (component as unknown as { dataSource: { data: Student[] } }).dataSource.data;
    expect(data).toEqual([student]);
  });

  it('filters by parent, student name or package case-insensitively', () => {
    studentService.getStudents.mockReturnValue(
      of([
        student, // Pat, no package
        { id: 's-2', name: 'Sam', status: StudentStatus.ACTIVE_STUDENT, package: 'Succeed', contact_name: 'Ann Lee' } as Student,
      ]),
    );
    const component = build();
    component.ngOnInit();
    const ds = (component as unknown as { dataSource: { filteredData: Student[] } }).dataSource;
    component.applyFilter('  PAT ');
    expect(ds.filteredData.map(s => s.id)).toEqual(['s-1']);
    component.applyFilter('succeed');
    expect(ds.filteredData.map(s => s.id)).toEqual(['s-2']);
    component.applyFilter('ann lee'); // the client's ask: quickly find a parent
    expect(ds.filteredData.map(s => s.id)).toEqual(['s-2']);
    component.applyFilter('');
    expect(ds.filteredData).toHaveLength(2);
  });

  it('shows the available (unexpired) make-up balance', () => {
    const component = build() as unknown as { availableMakeup(s: Student): number };
    const s = {
      make_up_batches: [
        { minutes: 30, earned_date: new Date().toISOString() },
        { minutes: 20, earned_date: '2020-01-01T00:00:00Z' }, // expired
      ],
    } as Student;
    expect(component.availableMakeup(s)).toBe(30);
  });

  it('loads only the tutor’s own students for a non-admin', () => {
    isAdmin = false;
    studentService.getStudentsByTutor.mockReturnValue(of([student]));
    const component = build();
    component.ngOnInit();
    expect(studentService.getStudentsByTutor).toHaveBeenCalledWith('contact-1', true);
  });

  it('swallows load errors and leaves the table empty', () => {
    studentService.getStudents.mockReturnValue(
      throwError(() => new Error('boom')),
    );
    const component = build();
    component.ngOnInit();
    expect((component as unknown as { dataSource: { data: Student[] } }).dataSource.data).toEqual([]);
  });

  it('wires sort and paginator through the view-child setters', () => {
    studentService.getStudents.mockReturnValue(of([]));
    const component = build();
    const sort = {} as MatSort;
    const paginator = {} as MatPaginator;
    component.matSort = sort;
    component.matPaginator = paginator;
    const ds = (component as unknown as { dataSource: MatSort & { sort: MatSort; paginator: MatPaginator } }).dataSource;
    expect(ds.sort).toBe(sort);
    expect(ds.paginator).toBe(paginator);
  });

  it('view-child setters ignore null while the table is hidden', () => {
    studentService.getStudents.mockReturnValue(of([]));
    const component = build();
    component.matSort = null as never;
    component.matPaginator = null as never;
    const ds = (component as unknown as { dataSource: { sort: unknown; paginator: unknown } }).dataSource;
    expect(ds.sort).toBeFalsy();
    expect(ds.paginator).toBeFalsy();
  });

  it('shows the spinner until students load', () => {
    studentService.getStudents.mockReturnValue(of([]));
    const component = build();
    expect((component as unknown as { loading: boolean }).loading).toBe(true);
    component.ngOnInit();
    expect((component as unknown as { loading: boolean }).loading).toBe(false);
  });

  it('clears the spinner when loading fails', () => {
    studentService.getStudents.mockReturnValue(throwError(() => new Error('x')));
    const component = build();
    component.ngOnInit();
    expect((component as unknown as { loading: boolean }).loading).toBe(false);
  });

  it('exposes the expected roster columns without available_minutes', () => {
    studentService.getStudents.mockReturnValue(of([]));
    const component = build();
    expect((component as unknown as { rosterColumns: string[] }).rosterColumns).toEqual([
      'contact_name', 'name', 'status', 'package', 'make_up_minutes', 'scholarship', 'actions',
    ]);
  });

  it('opens the sessions dialog from the icon without triggering row navigation', () => {
    studentService.getStudents.mockReturnValue(of([]));
    const component = build();
    const event = { stopPropagation: jest.fn() } as unknown as Event;
    component.openSessionsDialog(student, event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(dialog.open).toHaveBeenCalledWith(StudentSessionsDialog, {
      data: student,
      width: '700px',
    });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('row click navigates to the family contact page', () => {
    studentService.getStudents.mockReturnValue(of([]));
    const component = build();
    component.openContact({ ...student, contact_id: 'c-9' });
    expect(router.navigate).toHaveBeenCalledWith(['/contacts', 'c-9']);
  });

  it('row click is a no-op for a student without a contact id', () => {
    studentService.getStudents.mockReturnValue(of([]));
    const component = build();
    component.openContact({ ...student, contact_id: undefined });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not query when a tutor has no resolved contact id', () => {
    isAdmin = false;
    contactId = undefined;
    const component = build();
    component.ngOnInit();
    expect(studentService.getStudentsByTutor).not.toHaveBeenCalled();
    expect((component as never as {loading: boolean}).loading).toBe(false);
  });
});
