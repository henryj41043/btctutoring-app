import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { StudentRoster, RosterHistoryRow } from './student-roster';
import { StudentService } from '../services/student.service';
import { ContactService } from '../services/contact.service';
import { Contact } from '../models/contact.model';
import { SessionsService } from '../services/sessions.service';
import { AuthService } from '../services/auth.service';
import { StudentSessionsDialog } from '../student-sessions-dialog/student-sessions-dialog';
import { Student } from '../models/student.model';
import { Session } from '../models/session.model';
import { StudentStatus } from '../enums/student-status.enum';
import { SessionStatus } from '../enums/session-status.enum';
import { SessionType } from '../enums/session-type.enum';

const student = { id: 's-1', name: 'Pat', status: StudentStatus.ACTIVE_STUDENT } as Student;

describe('StudentRoster', () => {
  let isAdmin: boolean;
  let contactId: string | undefined;
  const studentService = {
    getStudents: jest.fn(),
    getStudentsByTutor: jest.fn(),
  };
  const sessionsService = { getAllSessions: jest.fn() };
  const contactService = { getStaff: jest.fn(), getContact: jest.fn() };
  const authService = {
    isAdmin: () => isAdmin,
    contact: () => ({ id: contactId }),
  };
  const dialog = { open: jest.fn() };
  const snackBar = { open: jest.fn() };
  const router = { navigate: jest.fn() };

  const build = (): StudentRoster => {
    TestBed.configureTestingModule({
      imports: [StudentRoster],
      providers: [
        { provide: StudentService, useValue: studentService },
        { provide: SessionsService, useValue: sessionsService },
        { provide: ContactService, useValue: contactService },
        { provide: AuthService, useValue: authService },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: Router, useValue: router },
      ],
    });
    return TestBed.createComponent(StudentRoster).componentInstance;
  };

  beforeEach(() => {
    sessionStorage.clear();
    isAdmin = true;
    contactId = 'contact-1';
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    sessionsService.getAllSessions.mockReturnValue(of([]));
    contactService.getStaff.mockReturnValue(of([
      { id: 't-1', first_name: 'Tess', last_name: 'Ng' } as Contact,
    ]));
    contactService.getContact.mockReturnValue(of([]));
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

  it('restores the saved search filter for the session', () => {
    sessionStorage.setItem('btc-roster-view', JSON.stringify({ filter: 'pat' }));
    const c = build();
    c.ngOnInit();
    expect((c as any).dataSource.filter).toBe('pat');
    expect((c as any).searchText).toBe('pat');
    c.applyFilter('  Sam ');
    expect(JSON.parse(sessionStorage.getItem('btc-roster-view')!).filter).toBe('sam');
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
      'contact_name', 'name', 'tutor', 'status', 'package', 'make_up_minutes', 'scholarship', 'actions',
    ]);
  });

  it('resolves the Tutor column from staff, fetches former staff, dashes the rest', () => {
    studentService.getStudents.mockReturnValue(of([
      { ...student, assigned_tutor_id: 't-1' },
      { ...student, id: 's-2', assigned_tutor_id: 't-gone' },
      { ...student, id: 's-3' }, // unassigned
    ] as Student[]));
    contactService.getContact.mockReturnValue(
      of([{ id: 't-gone', email: 'former@example.com' } as Contact]));
    const component = build();
    component.ngOnInit();
    const rows = (component as unknown as { dataSource: { data: Student[] } }).dataSource.data;
    expect(component.tutorName(rows.find(s => s.id === 's-1')!)).toBe('Tess Ng');
    // Former staff resolve by individual fetch — name-less contacts fall back to email.
    expect(contactService.getContact).toHaveBeenCalledWith('t-gone');
    expect(component.tutorName(rows.find(s => s.id === 's-2')!)).toBe('former@example.com');
    expect(component.tutorName(rows.find(s => s.id === 's-3')!)).toBe('—');
  });

  it('the free-text search matches tutor names', () => {
    studentService.getStudents.mockReturnValue(of([
      { ...student, assigned_tutor_id: 't-1' },
      { ...student, id: 's-2', name: 'Sam' },
    ] as Student[]));
    const component = build();
    component.ngOnInit();
    const ds = (component as unknown as { dataSource: { filter: string; filteredData: Student[] } }).dataSource;
    ds.filter = 'tess';
    expect(ds.filteredData.map(s => s.id)).toEqual(['s-1']);
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

  describe('copy parent emails', () => {
    let writeText: jest.Mock;

    beforeEach(() => {
      writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
    });

    const seed = (students: Partial<Student>[]): StudentRoster => {
      studentService.getStudents.mockReturnValue(of(students.map(s => ({
        status: StudentStatus.ACTIVE_STUDENT, ...s,
      })) as Student[]));
      const c = build();
      c.ngOnInit();
      return c;
    };

    it('copies deduped parent emails of the filtered rows (siblings share one)', async () => {
      const c = seed([
        { id: 's1', name: 'Kid One', contact_email: 'lee@x.com' },
        { id: 's2', name: 'Kid Two', contact_email: 'LEE@x.com ' }, // sibling — dupe
        { id: 's3', name: 'Solo', contact_email: 'roe@y.com' },
        { id: 's4', name: 'NoMail' },
      ]);
      (c as any).copyParentEmails();
      await Promise.resolve();
      expect(writeText).toHaveBeenCalledWith('lee@x.com, roe@y.com');
      expect(snackBar.open).toHaveBeenCalledWith(
        '2 parent emails copied (1 student without one)', undefined, { duration: 4000 });
    });

    it('respects the search filter (copies filteredData only)', async () => {
      const c = seed([
        { id: 's1', name: 'Pat', contact_name: 'Lee', contact_email: 'lee@x.com' },
        { id: 's2', name: 'Sam', contact_name: 'Roe', contact_email: 'roe@y.com' },
      ]);
      c.applyFilter('roe');
      (c as any).copyParentEmails();
      await Promise.resolve();
      expect(writeText).toHaveBeenCalledWith('roe@y.com');
    });

    it('reports when nothing is copyable', () => {
      const c = seed([{ id: 's1', name: 'NoMail' }]);
      (c as any).copyParentEmails();
      expect(writeText).not.toHaveBeenCalled();
      expect(snackBar.open).toHaveBeenCalledWith(
        'No parent emails to copy in the current view.', undefined, { duration: 4000 });
    });

    it('reports a clipboard failure', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      const c = seed([{ id: 's1', name: 'Pat', contact_email: 'lee@x.com' }]);
      (c as any).copyParentEmails();
      await Promise.resolve();
      await Promise.resolve();
      expect(snackBar.open).toHaveBeenCalledWith(
        'Could not copy to the clipboard.', undefined, { duration: 4000 });
    });
  });

  describe('monthly history', () => {
    const rows = (c: StudentRoster): RosterHistoryRow[] =>
      (c as unknown as { historyDataSource: { data: RosterHistoryRow[] } }).historyDataSource.data;

    const completed = (over: Partial<Session>): Session => ({
      type: SessionType.TUTORING,
      status: SessionStatus.COMPLETED,
      start_datetime: '2026-07-06T14:00:00.000Z',
      end_datetime: '2026-07-06T15:00:00.000Z',
      student_id: 's-1',
      student_name: 'Pat',
      tutor_name: 'Tutor A',
      ...over,
    } as Session);

    const students = [
      { id: 's-1', name: 'Pat', status: StudentStatus.ACTIVE_STUDENT, contact_name: 'Lee Family' } as Student,
      { id: 's-3', name: 'Quinn', status: StudentStatus.PAST_STUDENT } as Student, // inactive, no family
    ];

    /** Admin component with students loaded and history switched on for July 2026. */
    const buildHistory = (sessions: Session[]): StudentRoster => {
      studentService.getStudents.mockReturnValue(of(students));
      sessionsService.getAllSessions.mockReturnValue(of(sessions));
      const c = build();
      c.ngOnInit();
      (c as unknown as { selectedDate: Date }).selectedDate = new Date(2026, 6, 15);
      c.onHistoryToggle(true);
      return c;
    };

    it('groups the month\'s completed sessions per student with counts, hours, tutors and family', () => {
      const c = buildHistory([
        completed({}),                                                                  // 1h, Tutor A
        completed({ start_datetime: '2026-07-08T14:00:00.000Z', end_datetime: '2026-07-08T15:30:00.000Z', tutor_name: 'Tutor B' }), // 1.5h
        completed({ type: SessionType.MAKE_UP, start_datetime: '2026-07-10T14:00:00.000Z', end_datetime: '2026-07-10T14:30:00.000Z' }), // 0.5h
        completed({ type: SessionType.TRIAL, start_datetime: '2026-07-01T14:00:00.000Z', end_datetime: '2026-07-01T14:45:00.000Z' }),   // 0.75h
        completed({ status: SessionStatus.PENDING }),                                   // not completed
        completed({ status: SessionStatus.CANCELLED }),                                 // not completed
        completed({ type: SessionType.ADMIN, student_id: undefined, student_name: undefined }), // staff time
        completed({ student_id: undefined, student_name: undefined }),                  // nobody to credit
      ]);
      expect(rows(c)).toEqual([{
        family: 'Lee Family',
        student: 'Pat',
        tutors: 'Tutor A, Tutor B',
        sessions: 2,
        makeups: 1,
        trials: 1,
        hours: 3.75,
      }]);
    });

    it('falls back per-field: unknown students, missing names, tutors and durations', () => {
      const c = buildHistory([
        // Known id but no session name → display name from the student list; no family on record.
        completed({ student_id: 's-3', student_name: undefined, tutor_name: undefined,
          start_datetime: undefined, end_datetime: undefined }),
        // Unknown id, no name anywhere → em-dash row; reversed times count 0 hours.
        completed({ student_id: 'ghost', student_name: undefined,
          start_datetime: '2026-07-06T15:00:00.000Z', end_datetime: '2026-07-06T14:00:00.000Z' }),
        // No id at all → grouped by name.
        completed({ student_id: undefined, student_name: 'Name Only', end_datetime: undefined }),
      ]);
      const r = rows(c);
      expect(r).toHaveLength(3);
      expect(r.find(x => x.student === 'Quinn'))
        .toEqual({ family: '—', student: 'Quinn', tutors: '—', sessions: 1, makeups: 0, trials: 0, hours: 0 });
      expect(r.find(x => x.student === 'Name Only'))
        .toEqual({ family: '—', student: 'Name Only', tutors: 'Tutor A', sessions: 1, makeups: 0, trials: 0, hours: 0 });
      expect(r.find(x => x.student === '—'))
        .toEqual({ family: '—', student: '—', tutors: 'Tutor A', sessions: 1, makeups: 0, trials: 0, hours: 0 });
    });

    it('queries the selected calendar month as an inclusive range', () => {
      buildHistory([]);
      expect(sessionsService.getAllSessions).toHaveBeenCalledWith({
        from: new Date(2026, 6, 1).toISOString(),
        to: new Date(2026, 7, 0, 23, 59, 59, 999).toISOString(),
      });
    });

    it('reloads and persists when the month changes; a cleared picker is a no-op', () => {
      const c = buildHistory([]);
      sessionsService.getAllSessions.mockClear();
      c.onDateChange(new Date(2026, 4, 20));
      expect(sessionsService.getAllSessions).toHaveBeenCalledWith({
        from: new Date(2026, 4, 1).toISOString(),
        to: new Date(2026, 5, 0, 23, 59, 59, 999).toISOString(),
      });
      const extra = JSON.parse(sessionStorage.getItem('btc-roster-view')!).extra;
      expect(extra.historyMode).toBe(true);
      expect(extra.selectedDate).toBe(new Date(2026, 4, 20).toISOString());
      sessionsService.getAllSessions.mockClear();
      c.onDateChange(null);
      expect(sessionsService.getAllSessions).not.toHaveBeenCalled();
    });

    it('restores history mode for an admin once students have loaded', () => {
      sessionStorage.setItem('btc-roster-view', JSON.stringify({
        extra: { historyMode: true, selectedDate: new Date(2026, 6, 15).toISOString() },
      }));
      studentService.getStudents.mockReturnValue(of(students));
      const c = build();
      c.ngOnInit();
      expect((c as unknown as { historyMode: boolean }).historyMode).toBe(true);
      expect((c as unknown as { selectedDate: Date }).selectedDate).toEqual(new Date(2026, 6, 15));
      expect(sessionsService.getAllSessions).toHaveBeenCalled();
    });

    it('ignores a saved history mode for non-admins', () => {
      sessionStorage.setItem('btc-roster-view', JSON.stringify({
        extra: { historyMode: true, selectedDate: new Date(2026, 6, 15).toISOString() },
      }));
      isAdmin = false;
      studentService.getStudentsByTutor.mockReturnValue(of([student]));
      const c = build();
      c.ngOnInit();
      expect((c as unknown as { historyMode: boolean }).historyMode).toBe(false);
      expect(sessionsService.getAllSessions).not.toHaveBeenCalled();
    });

    it('ignores corrupt saved history values for an admin', () => {
      sessionStorage.setItem('btc-roster-view', JSON.stringify({
        extra: { historyMode: 'yes', selectedDate: 'not-a-date' },
      }));
      studentService.getStudents.mockReturnValue(of([]));
      const before = new Date().getFullYear();
      const c = build();
      c.ngOnInit();
      expect((c as unknown as { historyMode: boolean }).historyMode).toBe(false);
      expect((c as unknown as { selectedDate: Date }).selectedDate.getFullYear()).toBeGreaterThanOrEqual(before);
    });

    it('toggling off persists without refetching sessions', () => {
      const c = buildHistory([]);
      sessionsService.getAllSessions.mockClear();
      c.onHistoryToggle(false);
      expect((c as unknown as { historyMode: boolean }).historyMode).toBe(false);
      expect(sessionsService.getAllSessions).not.toHaveBeenCalled();
      expect(JSON.parse(sessionStorage.getItem('btc-roster-view')!).extra.historyMode).toBe(false);
    });

    it('swallows a sessions load error and clears the history spinner', () => {
      studentService.getStudents.mockReturnValue(of(students));
      sessionsService.getAllSessions.mockReturnValue(throwError(() => new Error('x')));
      const c = build();
      c.ngOnInit();
      c.onHistoryToggle(true);
      expect(rows(c)).toEqual([]);
      expect((c as unknown as { historyLoading: boolean }).historyLoading).toBe(false);
    });

    it('filters history rows by parent, student or tutor', () => {
      const c = buildHistory([
        completed({}),
        completed({ student_id: undefined, student_name: 'Zed', tutor_name: 'Tutor Z' }),
      ]);
      const ds = (c as unknown as { historyDataSource: { filteredData: RosterHistoryRow[] } }).historyDataSource;
      c.applyFilter('tutor z');
      expect(ds.filteredData.map(r => r.student)).toEqual(['Zed']);
      c.applyFilter('lee family');
      expect(ds.filteredData.map(r => r.student)).toEqual(['Pat']);
      c.applyFilter('');
      expect(ds.filteredData).toHaveLength(2);
    });

    it('wires sort and paginator to the history table while in history mode', () => {
      const c = buildHistory([]);
      const sort = {} as MatSort;
      const paginator = {} as MatPaginator;
      c.matSort = sort;
      c.matPaginator = paginator;
      const ds = (c as unknown as { historyDataSource: { sort: MatSort; paginator: MatPaginator } }).historyDataSource;
      expect(ds.sort).toBe(sort);
      expect(ds.paginator).toBe(paginator);
    });
  });
});
