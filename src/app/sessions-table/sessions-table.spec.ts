import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { SessionsTable } from './sessions-table';
import { SessionsService } from '../services/sessions.service';
import { AuthService } from '../services/auth.service';
import { SessionDialog } from '../session-dialog/session-dialog';
import { SessionType } from '../enums/session-type.enum';
import { Session } from '../models/session.model';

describe('SessionsTable', () => {
  let isAdmin: boolean;
  let groups: string[];
  let afterClosed: unknown;
  const sessionsService = {
    getAllSessions: jest.fn(),
    getSessionsByTutor: jest.fn(),
  };
  const authService = {
    isAdmin: () => isAdmin,
    user: () => ({ groups }),
    contact: () => ({ id: 'contact-1' }),
  };
  const dialog = {
    open: jest.fn(() => ({ afterClosed: () => of(afterClosed) })),
  };

  const build = (): SessionsTable => {
    TestBed.configureTestingModule({
      imports: [SessionsTable],
      providers: [
        { provide: SessionsService, useValue: sessionsService },
        { provide: AuthService, useValue: authService },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    return TestBed.createComponent(SessionsTable).componentInstance;
  };

  beforeEach(() => {
    isAdmin = true;
    groups = ['Admins'];
    afterClosed = {} as Session;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('loads all sessions for an admin and filters out ADMIN-type rows', () => {
    sessionsService.getAllSessions.mockReturnValue(
      of([
        { id: 'a', type: SessionType.TUTORING },
        { id: 'b', type: SessionType.ADMIN },
      ]),
    );
    const c = build();
    c.ngOnInit();
    expect(c.dataSource.data.map((s) => s.id)).toEqual(['a']);
  });

  it('loads the tutor’s own sessions for a tutor', () => {
    isAdmin = false;
    groups = ['Tutors'];
    sessionsService.getSessionsByTutor.mockReturnValue(of([]));
    const c = build();
    c.ngOnInit();
    expect(sessionsService.getSessionsByTutor).toHaveBeenCalledWith('contact-1');
  });

  it('shows nothing for a user who is neither admin nor tutor', () => {
    isAdmin = false;
    groups = [];
    const c = build();
    c.ngOnInit();
    expect(c.dataSource.data).toEqual([]);
    expect(sessionsService.getAllSessions).not.toHaveBeenCalled();
  });

  it('leaves data untouched on a load error', () => {
    sessionsService.getAllSessions.mockReturnValue(
      throwError(() => new Error('boom')),
    );
    const c = build();
    c.ngOnInit();
    expect(c.dataSource.data).toEqual([]);
  });

  it('configures sort, paginator, and the sorting accessor after view init', () => {
    const c = build();
    c.sort = {} as MatSort;
    c.paginator = {} as MatPaginator;
    c.ngAfterViewInit();
    const accessor = c.dataSource.sortingDataAccessor;
    const s = {
      start_datetime: '2026-01-01',
      tutor_name: 'Tess',
      student_name: 'Pat',
      status: 'Pending',
      notes: 'n',
    } as Session;
    expect(accessor(s, 'date')).toBe('2026-01-01');
    expect(accessor(s, 'tutor')).toBe('Tess');
    expect(accessor(s, 'student')).toBe('Pat');
    expect(accessor(s, 'attendance')).toBe('Pending');
    expect(accessor(s, 'notes')).toBe('n');
    // Empty session exercises the `?? ''` fallbacks for every sortable column.
    expect(accessor({} as Session, 'date')).toBe('');
    expect(accessor({} as Session, 'tutor')).toBe('');
    expect(accessor({} as Session, 'student')).toBe('');
    expect(accessor({} as Session, 'attendance')).toBe('');
  });

  it.each([
    ['openCreateSessionDialog', 'create'],
    ['openEditSessionDialog', 'edit'],
    ['openDeleteSessionDialog', 'delete'],
  ])('%s opens the session dialog and reloads on a result', (method, type) => {
    sessionsService.getAllSessions.mockReturnValue(of([]));
    const c = build();
    (c as unknown as Record<string, (x: unknown) => void>)[method]({} as Session);
    expect(dialog.open).toHaveBeenCalledWith(
      SessionDialog,
      expect.objectContaining({ data: expect.objectContaining({ type }) }),
    );
    // afterClosed emitted a defined result -> data reloaded via getAllSessions.
    expect(sessionsService.getAllSessions).toHaveBeenCalled();
  });

  it.each([
    'openCreateSessionDialog',
    'openEditSessionDialog',
    'openDeleteSessionDialog',
  ])('%s does not reload when the dialog is dismissed', (method) => {
    afterClosed = undefined;
    sessionsService.getAllSessions.mockReturnValue(of([]));
    const c = build();
    sessionsService.getAllSessions.mockClear();
    (c as unknown as Record<string, (x: unknown) => void>)[method]({} as Session);
    expect(sessionsService.getAllSessions).not.toHaveBeenCalled();
  });
});
