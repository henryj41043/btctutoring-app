import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { StudentSessionsDialog } from './student-sessions-dialog';
import { SessionsService } from '../services/sessions.service';
import { AuthService } from '../services/auth.service';
import { Student } from '../models/student.model';
import { Session } from '../models/session.model';

const student = { id: 'stu-1', name: 'Pat' } as Student;

describe('StudentSessionsDialog', () => {
  let isAdmin: boolean;
  const sessionsService = {
    getSessionsByStudent: jest.fn(),
    getSessions: jest.fn(),
  };
  const authService = {
    isAdmin: () => isAdmin,
    contact: () => ({ id: 'contact-1' }),
  };

  const build = (): StudentSessionsDialog => {
    TestBed.configureTestingModule({
      imports: [StudentSessionsDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: student },
        { provide: MatDialogRef, useValue: {} },
        { provide: SessionsService, useValue: sessionsService },
        { provide: AuthService, useValue: authService },
      ],
    });
    return TestBed.createComponent(StudentSessionsDialog).componentInstance;
  };

  const ds = (c: StudentSessionsDialog) =>
    (c as unknown as { dataSource: { data: Session[]; sortingDataAccessor: (i: Session, p: string) => unknown; sort: MatSort; paginator: MatPaginator } }).dataSource;
  const loading = (c: StudentSessionsDialog) =>
    (c as unknown as { loading: boolean }).loading;

  beforeEach(() => {
    isAdmin = true;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('loads and sorts sessions newest-first for an admin', () => {
    sessionsService.getSessionsByStudent.mockReturnValue(
      of([
        { id: 'a', start_datetime: '2026-01-01T10:00:00Z' },
        { id: 'b', start_datetime: '2026-02-01T10:00:00Z' },
      ]),
    );
    const component = build();
    component.ngOnInit();
    expect(sessionsService.getSessionsByStudent).toHaveBeenCalledWith('stu-1');
    expect(ds(component).data.map((s) => s.id)).toEqual(['b', 'a']);
    expect(loading(component)).toBe(false);
  });

  it('scopes the query to the tutor for a non-admin', () => {
    isAdmin = false;
    sessionsService.getSessions.mockReturnValue(of([]));
    const component = build();
    component.ngOnInit();
    expect(sessionsService.getSessions).toHaveBeenCalledWith('contact-1', 'stu-1');
  });

  it('stops loading on error', () => {
    sessionsService.getSessionsByStudent.mockReturnValue(
      throwError(() => new Error('boom')),
    );
    const component = build();
    component.ngOnInit();
    expect(loading(component)).toBe(false);
  });

  it('exposes a sorting accessor covering each sortable column', () => {
    sessionsService.getSessionsByStudent.mockReturnValue(of([]));
    const accessor = ds(build()).sortingDataAccessor;
    const session = {
      start_datetime: '2026-01-01',
      tutor_name: 'Tess',
      status: 'Pending',
      notes: 'n',
    } as Session;
    expect(accessor(session, 'date')).toBe('2026-01-01');
    expect(accessor(session, 'tutor_name')).toBe('Tess');
    expect(accessor(session, 'status')).toBe('Pending');
    expect(accessor(session, 'notes')).toBe('n');
    // Empty session exercises the `?? ''` fallbacks.
    expect(accessor({} as Session, 'date')).toBe('');
    expect(accessor({} as Session, 'tutor_name')).toBe('');
    expect(accessor({} as Session, 'status')).toBe('');
  });

  it('assigns sort and paginator through the view-child setters', () => {
    sessionsService.getSessionsByStudent.mockReturnValue(of([]));
    const component = build();
    const sort = {} as MatSort;
    const paginator = {} as MatPaginator;
    (component as unknown as { sort: MatSort }).sort = sort;
    (component as unknown as { paginator: MatPaginator }).paginator = paginator;
    expect(ds(component).sort).toBe(sort);
    expect(ds(component).paginator).toBe(paginator);
    // Null setters are ignored (view children appear behind a spinner @if).
    (component as unknown as { sort: MatSort | undefined }).sort = undefined;
    (component as unknown as { paginator: MatPaginator | undefined }).paginator = undefined;
    expect(ds(component).sort).toBe(sort);
    expect(ds(component).paginator).toBe(paginator);
  });
});
