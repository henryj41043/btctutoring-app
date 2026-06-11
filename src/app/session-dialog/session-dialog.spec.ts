import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SessionDialog } from './session-dialog';
import { SessionsService } from '../services/sessions.service';
import { ContactService } from '../services/contact.service';
import { StudentService } from '../services/student.service';
import { AuthService } from '../services/auth.service';
import { SessionDialogData } from '../interfaces/session-dialog-data.interface';
import { Contact } from '../models/contact.model';
import { Student } from '../models/student.model';
import { Session } from '../models/session.model';
import { Status } from '../enums/status.enum';
import { Service } from '../enums/service.enum';
import { SessionStatus } from '../enums/session-status.enum';
import { SessionType } from '../enums/session-type.enum';
import { Weekday } from '../enums/weekday.enum';

const tutor = (over: Partial<Contact> = {}): Contact =>
  ({
    id: 't-1',
    first_name: 'Tess',
    status: Status.STAFF,
    currently_accepting_students: true,
    service: Service.HIRING,
    availability: [
      { days: Object.values(Weekday), start_time: '09:00', end_time: '17:00' },
    ],
    ...over,
  }) as Contact;

const student = (over: Partial<Student> = {}): Student =>
  ({
    id: 's-1',
    name: 'Pat',
    status: Status.ACTIVE_STUDENT,
    assigned_tutor_id: 't-1',
    available_minutes: 600,
    make_up_minutes: 120,
    ...over,
  }) as Student;

describe('SessionDialog', () => {
  let isAdmin: boolean;
  const dialogRef = { close: jest.fn() };
  const sessionsService = {
    createSession: jest.fn(),
    createSessions: jest.fn(),
    updateSession: jest.fn(),
    deleteSession: jest.fn(),
    getSessionsBySeries: jest.fn(),
  };
  const contactService = { getContacts: jest.fn() };
  const studentService = { getStudents: jest.fn(), updateStudent: jest.fn() };
  const authService = { isAdmin: () => isAdmin };

  const build = (data: SessionDialogData): SessionDialog => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SessionDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: SessionsService, useValue: sessionsService },
        { provide: ContactService, useValue: contactService },
        { provide: StudentService, useValue: studentService },
        { provide: AuthService, useValue: authService },
      ],
    });
    return TestBed.createComponent(SessionDialog).componentInstance;
  };

  /** A create-mode dialog primed with a valid tutor/student/time selection. */
  const primedCreate = (over: Partial<SessionDialogData> = {}): SessionDialog => {
    const c = build({
      type: 'create',
      session: new Session(),
      existingSessions: [],
      ...over,
    } as SessionDialogData);
    c.tutors = [tutor()];
    c.students = [student()];
    c.selectedTutor = 't-1';
    c.selectedStudent = 's-1';
    c.selectedType = SessionType.TUTORING;
    c.date = new Date(2026, 5, 1);
    c.startTime = new Date(2026, 5, 1, 10, 0);
    c.endTime = new Date(2026, 5, 1, 11, 0);
    c.notes = 'n';
    return c;
  };

  beforeEach(() => {
    isAdmin = true;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  describe('getters', () => {
    it('attendanceOptions excludes Cancelled for make-up sessions', () => {
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.selectedType = SessionType.MAKE_UP;
      expect(c.attendanceOptions).not.toContain(SessionStatus.CANCELLED);
      c.selectedType = SessionType.TUTORING;
      expect(c.attendanceOptions).toContain(SessionStatus.CANCELLED);
    });

    it('hasStudent is false only for admin sessions', () => {
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.selectedType = SessionType.ADMIN;
      expect(c.hasStudent).toBe(false);
      c.selectedType = SessionType.TUTORING;
      expect(c.hasStudent).toBe(true);
    });

    it('isStatusLocked is true for an edited, non-pending session', () => {
      const c = build({
        type: 'edit',
        session: { status: SessionStatus.COMPLETED } as Session,
      } as SessionDialogData);
      expect(c.isStatusLocked).toBe(true);
    });

    it('isStatusLocked is false for create mode and pending edits', () => {
      expect(
        build({ type: 'create', session: new Session() } as SessionDialogData)
          .isStatusLocked,
      ).toBe(false);
      expect(
        build({
          type: 'edit',
          session: { status: SessionStatus.PENDING } as Session,
        } as SessionDialogData).isStatusLocked,
      ).toBe(false);
    });

    it('seriesActionLabel reads "change" for an edit action', () => {
      const c = build({ type: 'edit', session: new Session() } as SessionDialogData);
      expect(c.seriesActionLabel).toBe('change');
    });

    it('selectedStudentObj resolves the chosen student', () => {
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.students = [student()];
      c.selectedStudent = 's-1';
      expect(c.selectedStudentObj?.id).toBe('s-1');
    });
  });

  describe('ngOnInit', () => {
    it('hydrates fields from the session in edit mode and loads tutors/students', () => {
      contactService.getContacts.mockReturnValue(of([tutor()]));
      studentService.getStudents.mockReturnValue(of([student()]));
      const c = build({
        type: 'edit',
        session: {
          type: SessionType.TUTORING,
          student_id: 's-1',
          tutor_id: 't-1',
          start_datetime: '2026-06-01T10:00:00Z',
          end_datetime: '2026-06-01T11:00:00Z',
          status: SessionStatus.PENDING,
          notes: 'hi',
        } as Session,
      } as SessionDialogData);
      c.ngOnInit();
      expect(c.selectedStudent).toBe('s-1');
      expect(c.tutors).toHaveLength(1);
      expect(c.students).toHaveLength(1);
      expect(c.filteredStudents).toHaveLength(1);
    });

    it('does not hydrate fields in create mode', () => {
      contactService.getContacts.mockReturnValue(of([]));
      studentService.getStudents.mockReturnValue(of([]));
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.ngOnInit();
      expect(c.selectedType).toBe(SessionType.TUTORING);
    });

    it('defaults the type to tutoring when an edited session has none', () => {
      contactService.getContacts.mockReturnValue(of([]));
      studentService.getStudents.mockReturnValue(of([]));
      const c = build({
        type: 'edit',
        session: {
          start_datetime: '2026-06-01T10:00:00Z',
          end_datetime: '2026-06-01T11:00:00Z',
        } as Session,
      } as SessionDialogData);
      c.ngOnInit();
      expect(c.selectedType).toBe(SessionType.TUTORING);
    });
  });

  describe('tutor/student loading', () => {
    it('getTutors keeps only accepting staff hires; getStudents keeps active students', () => {
      contactService.getContacts.mockReturnValue(
        of([tutor(), { id: 't-x', status: Status.ACTIVE_STUDENT } as Contact]),
      );
      studentService.getStudents.mockReturnValue(
        of([student(), { id: 's-x', status: Status.PAST_STUDENT } as Student]),
      );
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.ngOnInit();
      expect(c.tutors.map((t) => t.id)).toEqual(['t-1']);
      expect(c.students.map((s) => s.id)).toEqual(['s-1']);
    });

    it('onTutorChange resets the student and filters by assignment', () => {
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.students = [student(), student({ id: 's-2', assigned_tutor_id: 't-9' })];
      c.onTutorChange('t-1');
      expect(c.selectedStudent).toBeUndefined();
      expect(c.filteredStudents.map((s) => s.id)).toEqual(['s-1']);
    });

    it('cancel closes the dialog', () => {
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.cancel();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });
  });

  describe('createSession', () => {
    it('creates a valid tutoring session', () => {
      const c = primedCreate();
      sessionsService.createSession.mockReturnValue(of({ id: 'new-1' }));
      c.createSession();
      expect(sessionsService.createSession).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalled();
      const closed = dialogRef.close.mock.calls.at(-1)![0] as Session;
      expect(closed.id).toBe('new-1');
    });

    it('rejects an invalid time range', () => {
      const c = primedCreate();
      c.startTime = new Date(2026, 5, 1, 12, 0);
      c.endTime = new Date(2026, 5, 1, 11, 0);
      c.createSession();
      expect(c.hasError).toBe(true);
      expect(sessionsService.createSession).not.toHaveBeenCalled();
    });

    it('rejects when the date or time is missing', () => {
      const c = primedCreate();
      c.date = undefined;
      c.createSession();
      expect(c.hasError).toBe(true);
    });

    it('blocks a tutor when the session is outside availability', () => {
      isAdmin = false;
      const c = primedCreate();
      c.startTime = new Date(2026, 5, 1, 18, 0);
      c.endTime = new Date(2026, 5, 1, 19, 0);
      c.createSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('availability');
    });

    it('asks an admin to confirm an out-of-availability override, then creates', () => {
      const c = primedCreate();
      c.startTime = new Date(2026, 5, 1, 18, 0);
      c.endTime = new Date(2026, 5, 1, 19, 0);
      c.createSession();
      expect(c.showAvailabilityConfirm).toBe(true);

      sessionsService.createSession.mockReturnValue(of({ id: 'new-1' }));
      c.confirmAvailabilityOverride();
      expect(sessionsService.createSession).toHaveBeenCalled();
    });

    it('blocks creation that would exceed the student balance', () => {
      const c = primedCreate();
      c.students = [student({ available_minutes: 30 })];
      c.createSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('Not enough');
    });

    it('creates an admin session with no student', () => {
      const c = primedCreate();
      c.selectedType = SessionType.ADMIN;
      sessionsService.createSession.mockReturnValue(of({ id: 'a-1' }));
      c.createSession();
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('surfaces a create error', () => {
      const c = primedCreate();
      sessionsService.createSession.mockReturnValue(throwError(() => new Error('x')));
      c.createSession();
      expect(c.hasError).toBe(true);
    });

    it('delegates to createSeries when repeating weekly', () => {
      const c = primedCreate();
      c.repeatWeekly = true;
      c.repeatDays = [];
      c.createSession();
      // createSeries validates repeatDays and errors out.
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('day of the week');
    });
  });

  describe('updateSession', () => {
    const editData = (over: Partial<Session> = {}): SessionDialogData =>
      ({
        type: 'edit',
        session: {
          id: 'sess-1',
          status: SessionStatus.PENDING,
          start_datetime: '2026-06-01T10:00:00Z',
          ...over,
        } as Session,
        existingSessions: [],
      }) as SessionDialogData;

    const primedEdit = (data: SessionDialogData): SessionDialog => {
      const c = build(data);
      c.tutors = [tutor()];
      c.students = [student()];
      c.selectedTutor = 't-1';
      c.selectedStudent = 's-1';
      c.selectedType = SessionType.TUTORING;
      c.date = new Date(2026, 5, 1);
      c.startTime = new Date(2026, 5, 1, 10, 0);
      c.endTime = new Date(2026, 5, 1, 11, 0);
      c.selectedAttendance = SessionStatus.PENDING;
      return c;
    };

    it('updates a still-pending session directly', () => {
      const c = primedEdit(editData());
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.updateSession();
      expect(sessionsService.updateSession).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('prompts for status confirmation when marking a pending session complete', () => {
      const c = primedEdit(editData());
      c.selectedAttendance = SessionStatus.COMPLETED;
      c.updateSession();
      expect(c.showStatusConfirm).toBe(true);
    });

    it('blocks a status change that exceeds the student balance', () => {
      const c = primedEdit(editData());
      c.students = [student({ available_minutes: 10 })];
      c.selectedAttendance = SessionStatus.COMPLETED;
      c.updateSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('Not enough');
    });

    it('rejects an invalid time range', () => {
      const c = primedEdit(editData());
      c.startTime = new Date(2026, 5, 1, 12, 0);
      c.endTime = new Date(2026, 5, 1, 11, 0);
      c.updateSession();
      expect(c.hasError).toBe(true);
    });

    it('shows the series scope prompt for a series session', () => {
      const c = primedEdit(editData({ series_id: 'series-1' }));
      c.updateSession();
      expect(c.showSeriesScopePrompt).toBe(true);
    });

    it('surfaces an update error', () => {
      const c = primedEdit(editData());
      sessionsService.updateSession.mockReturnValue(throwError(() => new Error('x')));
      c.updateSession();
      expect(c.hasError).toBe(true);
    });
  });

  describe('status confirmation', () => {
    const primedConfirm = (): SessionDialog => {
      const c = build({
        type: 'edit',
        session: {
          id: 'sess-1',
          status: SessionStatus.PENDING,
          start_datetime: '2026-06-01T10:00:00Z',
        } as Session,
        existingSessions: [],
      } as SessionDialogData);
      c.tutors = [tutor()];
      c.students = [student()];
      c.selectedTutor = 't-1';
      c.selectedStudent = 's-1';
      c.date = new Date(2026, 5, 1);
      c.startTime = new Date(2026, 5, 1, 10, 0);
      c.endTime = new Date(2026, 5, 1, 11, 0);
      c.selectedAttendance = SessionStatus.COMPLETED;
      return c;
    };

    it('updates the student minutes and the session on confirm', () => {
      const c = primedConfirm();
      c.updateSession(); // stages pendingSession + pendingStudentUpdate
      studentService.updateStudent.mockReturnValue(of({} as Student));
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.confirmStatusChange();
      expect(studentService.updateStudent).toHaveBeenCalled();
      expect(sessionsService.updateSession).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('reports a student-minute update failure', () => {
      const c = primedConfirm();
      c.updateSession();
      studentService.updateStudent.mockReturnValue(throwError(() => new Error('x')));
      c.confirmStatusChange();
      expect(c.hasError).toBe(true);
    });

    it('cancelStatusChange clears the pending state', () => {
      const c = primedConfirm();
      c.updateSession();
      c.cancelStatusChange();
      expect(c.showStatusConfirm).toBe(false);
    });

    it('confirmStatusChange is a no-op with nothing pending', () => {
      const c = primedConfirm();
      c.confirmStatusChange();
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
    });
  });

  describe('deleteSession', () => {
    it('deletes a standalone session', () => {
      const c = build({
        type: 'delete',
        session: { id: 'sess-1' } as Session,
      } as SessionDialogData);
      sessionsService.deleteSession.mockReturnValue(of({ message: 'ok' }));
      c.deleteSession();
      expect(sessionsService.deleteSession).toHaveBeenCalledWith('sess-1');
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('prompts for scope on a series session', () => {
      const c = build({
        type: 'delete',
        session: { id: 'sess-1', series_id: 'series-1' } as Session,
      } as SessionDialogData);
      c.deleteSession();
      expect(c.showSeriesScopePrompt).toBe(true);
    });

    it('surfaces a delete error', () => {
      const c = build({
        type: 'delete',
        session: { id: 'sess-1' } as Session,
      } as SessionDialogData);
      sessionsService.deleteSession.mockReturnValue(throwError(() => new Error('x')));
      c.deleteSession();
      expect(c.hasError).toBe(true);
    });
  });

  describe('createSeries', () => {
    const primedSeries = (over: Partial<Student> = {}): SessionDialog => {
      const c = primedCreate();
      c.students = [student(over)];
      c.repeatWeekly = true;
      c.repeatDays = Object.values(Weekday);
      c.repeatEndMode = 'count';
      c.repeatCount = 2;
      return c;
    };

    it('creates a counted series of sessions', () => {
      const c = primedSeries();
      sessionsService.createSessions.mockReturnValue(of({ message: 'ok' }));
      c.createSession();
      expect(sessionsService.createSessions).toHaveBeenCalled();
      const created = sessionsService.createSessions.mock.calls.at(-1)![0] as Session[];
      expect(created).toHaveLength(2);
      expect(created[0].series_id).toBeDefined();
    });

    it('fills the remaining balance when in fill mode', () => {
      const c = primedSeries({ available_minutes: 180 });
      c.repeatEndMode = 'fill'; // 180 / 60 = 3 sessions
      sessionsService.createSessions.mockReturnValue(of({ message: 'ok' }));
      c.createSession();
      const created = sessionsService.createSessions.mock.calls.at(-1)![0] as Session[];
      expect(created).toHaveLength(3);
    });

    it('rejects a series with no student selected', () => {
      const c = primedSeries();
      c.selectedStudent = undefined;
      c.createSession();
      expect(c.errorMessage).toContain('select a student');
    });

    it('rejects a fill series that cannot fit even one session', () => {
      const c = primedSeries({ available_minutes: 10 });
      c.repeatEndMode = 'fill';
      c.createSession();
      expect(c.errorMessage).toContain('not enough');
    });

    it('rejects a counted series that exceeds the balance', () => {
      const c = primedSeries({ available_minutes: 60 });
      c.repeatCount = 5; // 300 min needed
      c.createSession();
      expect(c.errorMessage).toContain('only');
    });

    it('surfaces a series create error', () => {
      const c = primedSeries();
      sessionsService.createSessions.mockReturnValue(throwError(() => new Error('x')));
      c.createSession();
      expect(c.hasError).toBe(true);
    });
  });

  describe('series scope flows', () => {
    const seriesEdit = (): SessionDialog => {
      const c = build({
        type: 'edit',
        session: {
          id: 'sess-1',
          series_id: 'series-1',
          status: SessionStatus.PENDING,
          start_datetime: '2026-06-01T10:00:00Z',
        } as Session,
        existingSessions: [],
      } as SessionDialogData);
      c.tutors = [tutor()];
      c.students = [student()];
      c.selectedTutor = 't-1';
      c.selectedStudent = 's-1';
      c.date = new Date(2026, 5, 1);
      c.startTime = new Date(2026, 5, 1, 10, 0);
      c.endTime = new Date(2026, 5, 1, 11, 0);
      c.selectedAttendance = SessionStatus.PENDING;
      return c;
    };

    it('chooseSeriesScope(future) updates the whole future series', () => {
      const c = seriesEdit();
      c.updateSession(); // raises the scope prompt (seriesAction = 'edit')
      sessionsService.getSessionsBySeries.mockReturnValue(
        of([
          {
            id: 'sess-1',
            status: SessionStatus.PENDING,
            start_datetime: '2026-06-01T10:00:00Z',
          },
          {
            id: 'sess-2',
            status: SessionStatus.PENDING,
            start_datetime: '2026-06-08T10:00:00Z',
          },
        ]),
      );
      sessionsService.updateSession.mockReturnValue(of({}));
      c.chooseSeriesScope('future');
      expect(sessionsService.getSessionsBySeries).toHaveBeenCalledWith('series-1');
      expect(dialogRef.close).toHaveBeenCalledWith({ updated: 2 });
    });

    it('chooseSeriesScope(future) closes with zero when nothing matches', () => {
      const c = seriesEdit();
      c.updateSession();
      sessionsService.getSessionsBySeries.mockReturnValue(of([]));
      c.chooseSeriesScope('future');
      expect(dialogRef.close).toHaveBeenCalledWith({ updated: 0 });
    });

    it('chooseSeriesScope(future) deletes the whole future series', () => {
      const c = build({
        type: 'delete',
        session: {
          id: 'sess-1',
          series_id: 'series-1',
          start_datetime: '2026-06-01T10:00:00Z',
        } as Session,
      } as SessionDialogData);
      c.deleteSession(); // raises the scope prompt (seriesAction = 'delete')
      sessionsService.getSessionsBySeries.mockReturnValue(
        of([
          {
            id: 'sess-1',
            status: SessionStatus.PENDING,
            start_datetime: '2026-06-01T10:00:00Z',
          },
        ]),
      );
      sessionsService.deleteSession.mockReturnValue(of({}));
      c.chooseSeriesScope('future');
      expect(dialogRef.close).toHaveBeenCalledWith({ deleted: 1 });
    });

    it('chooseSeriesScope(single) updates just this occurrence', () => {
      const c = seriesEdit();
      c.updateSession(); // raises the scope prompt (seriesAction = 'edit')
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.chooseSeriesScope('single');
      expect(sessionsService.updateSession).toHaveBeenCalled();
    });

    it('cancelSeriesScope clears the prompt', () => {
      const c = seriesEdit();
      c.cancelSeriesScope();
      expect(c.showSeriesScopePrompt).toBe(false);
    });
  });

  describe('availability override cancel', () => {
    it('cancelAvailabilityOverride resets the override state', () => {
      const c = primedCreate();
      c.startTime = new Date(2026, 5, 1, 18, 0);
      c.endTime = new Date(2026, 5, 1, 19, 0);
      c.createSession();
      c.cancelAvailabilityOverride();
      expect(c.showAvailabilityConfirm).toBe(false);
    });
  });

  // ── Deeper branch coverage ────────────────────────────────────────────────
  const editFor = (
    sessionOver: Partial<Session>,
    fields: Partial<SessionDialog> = {},
  ): SessionDialog => {
    const c = build({
      type: 'edit',
      session: {
        id: 'sess-1',
        status: SessionStatus.PENDING,
        start_datetime: '2026-06-01T10:00:00Z',
        ...sessionOver,
      } as Session,
      existingSessions: [],
    } as SessionDialogData);
    c.tutors = [tutor()];
    c.students = [student()];
    c.selectedTutor = 't-1';
    c.selectedStudent = 's-1';
    c.selectedType = SessionType.TUTORING;
    c.date = new Date(2026, 5, 1);
    c.startTime = new Date(2026, 5, 1, 10, 0);
    c.endTime = new Date(2026, 5, 1, 11, 0);
    c.selectedAttendance = SessionStatus.PENDING;
    Object.assign(c, fields);
    return c;
  };

  it('counts existing pending minutes and tolerates sessions missing datetimes', () => {
    const c = primedCreate({
      existingSessions: [
        {
          student_id: 's-1',
          type: SessionType.TUTORING,
          status: SessionStatus.PENDING,
          start_datetime: '2026-06-01T10:00:00Z',
          end_datetime: '2026-06-01T10:30:00Z',
        },
        // no datetimes -> durationOf returns 0
        { student_id: 's-1', type: SessionType.TUTORING, status: SessionStatus.PENDING },
        // different student -> excluded
        { student_id: 's-2', type: SessionType.TUTORING, status: SessionStatus.PENDING },
      ] as Session[],
    });
    sessionsService.createSession.mockReturnValue(of({ id: 'new-1' }));
    c.createSession();
    expect(sessionsService.createSession).toHaveBeenCalled();
  });

  it('reads the deletion label for a delete series action', () => {
    const c = build({
      type: 'delete',
      session: { id: 'sess-1', series_id: 'series-1' } as Session,
    } as SessionDialogData);
    c.deleteSession();
    expect(c.seriesActionLabel).toBe('deletion');
  });

  describe('confirmStatusChange internals', () => {
    it('updates directly when no student minute change is pending', () => {
      const c = editFor({});
      (c as unknown as { pendingSession: Session }).pendingSession = new Session();
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.confirmStatusChange();
      expect(sessionsService.updateSession).toHaveBeenCalled();
    });

    it('reports an update failure during confirmation', () => {
      const c = editFor({});
      (c as unknown as { pendingSession: Session }).pendingSession = new Session();
      sessionsService.updateSession.mockReturnValue(throwError(() => new Error('x')));
      c.confirmStatusChange();
      expect(c.hasError).toBe(true);
    });
  });

  describe('updateSession edge cases', () => {
    it('rejects when the date/time is missing', () => {
      const c = editFor({}, { date: undefined });
      c.updateSession();
      expect(c.hasError).toBe(true);
    });

    it('blocks lengthening a still-pending session beyond the balance', () => {
      const c = editFor(
        {},
        {
          students: [student({ available_minutes: 30 })],
          endTime: new Date(2026, 5, 1, 12, 0), // 120 min > 30
        },
      );
      c.updateSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('Not enough');
    });

    it('deducts make-up minutes when completing a make-up session', () => {
      const c = editFor(
        {},
        {
          selectedType: SessionType.MAKE_UP,
          selectedAttendance: SessionStatus.COMPLETED,
        },
      );
      c.updateSession();
      expect(c.showStatusConfirm).toBe(true);
    });

    it('banks minutes when cancelling a tutoring session', () => {
      const c = editFor({}, { selectedAttendance: SessionStatus.CANCELLED });
      c.updateSession();
      expect(c.showStatusConfirm).toBe(true);
    });

    it('asks an admin to override availability when editing a single session', () => {
      const c = editFor(
        {},
        {
          startTime: new Date(2026, 5, 1, 18, 0),
          endTime: new Date(2026, 5, 1, 19, 0),
        },
      );
      c.updateSession();
      expect(c.showAvailabilityConfirm).toBe(true);
    });

    it('deducts available minutes on a no-call-no-show', () => {
      const c = editFor({}, { selectedAttendance: SessionStatus.NO_CALL_NO_SHOW });
      c.updateSession();
      expect(c.showStatusConfirm).toBe(true);
    });

    it('deducts make-up minutes on a no-call-no-show make-up session', () => {
      const c = editFor(
        {},
        {
          selectedType: SessionType.MAKE_UP,
          selectedAttendance: SessionStatus.NO_CALL_NO_SHOW,
        },
      );
      c.updateSession();
      expect(c.showStatusConfirm).toBe(true);
    });

    it('tolerates a status change when the selected student is unresolved', () => {
      const c = editFor(
        {},
        { selectedStudent: 'ghost', selectedAttendance: SessionStatus.COMPLETED },
      );
      c.updateSession();
      // No student record -> staged without a minute update; confirm runs the
      // direct update path.
      expect(c.showStatusConfirm).toBe(true);
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.confirmStatusChange();
      expect(sessionsService.updateSession).toHaveBeenCalled();
    });

    it('treats a tutor with no availability as always available', () => {
      const c = editFor(
        {},
        {
          tutors: [tutor({ availability: [] })],
          startTime: new Date(2026, 5, 1, 18, 0),
          endTime: new Date(2026, 5, 1, 19, 0),
        },
      );
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.updateSession();
      expect(sessionsService.updateSession).toHaveBeenCalled();
    });
  });

  describe('createSeries validation', () => {
    const series = (fields: Partial<SessionDialog>): SessionDialog => {
      const c = primedCreate();
      c.repeatWeekly = true;
      c.repeatDays = Object.values(Weekday);
      c.repeatEndMode = 'count';
      c.repeatCount = 2;
      Object.assign(c, fields);
      return c;
    };

    it('rejects a missing date', () => {
      const c = series({ date: undefined });
      c.createSession();
      expect(c.hasError).toBe(true);
    });

    it('rejects an inverted time range', () => {
      const c = series({
        startTime: new Date(2026, 5, 1, 12, 0),
        endTime: new Date(2026, 5, 1, 11, 0),
      });
      c.createSession();
      expect(c.hasError).toBe(true);
    });

    it('rejects a zero-length session', () => {
      const c = series({
        startTime: new Date(2026, 5, 1, 10, 0),
        endTime: new Date(2026, 5, 1, 10, 0),
      });
      c.createSession();
      expect(c.errorMessage).toContain('valid time range');
    });

    it('rejects a non-positive repeat count', () => {
      const c = series({ repeatCount: 0 });
      c.createSession();
      expect(c.errorMessage).toContain('valid number');
    });

    it('asks an admin to override out-of-availability occurrences', () => {
      const c = series({
        startTime: new Date(2026, 5, 1, 18, 0),
        endTime: new Date(2026, 5, 1, 19, 0),
      });
      c.createSession();
      expect(c.showAvailabilityConfirm).toBe(true);
    });

    it('hard-blocks a tutor on out-of-availability occurrences', () => {
      isAdmin = false;
      const c = series({
        startTime: new Date(2026, 5, 1, 18, 0),
        endTime: new Date(2026, 5, 1, 19, 0),
      });
      c.createSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('availability');
    });
  });

  describe('updateSeriesFuture / deleteSeriesFuture', () => {
    const futureEdit = (): SessionDialog => {
      const c = editFor({ series_id: 'series-1' });
      c.updateSession(); // raise prompt
      return c;
    };

    it('errors when the series tutor cannot be resolved', () => {
      const c = futureEdit();
      c.selectedTutor = 'missing';
      c.chooseSeriesScope('future');
      expect(c.hasError).toBe(true);
    });

    it('asks an admin to override availability across the future series', () => {
      const c = editFor(
        { series_id: 'series-1' },
        {
          startTime: new Date(2026, 5, 1, 18, 0),
          endTime: new Date(2026, 5, 1, 19, 0),
        },
      );
      c.updateSession();
      sessionsService.getSessionsBySeries.mockReturnValue(
        of([
          {
            id: 'sess-1',
            status: SessionStatus.PENDING,
            start_datetime: '2026-06-01T10:00:00Z',
          },
        ]),
      );
      c.chooseSeriesScope('future');
      expect(c.showAvailabilityConfirm).toBe(true);
    });

    it('reports a balance overrun across the future series', () => {
      const c = editFor(
        { series_id: 'series-1' },
        { students: [student({ available_minutes: 10 })] },
      );
      c.updateSession();
      sessionsService.getSessionsBySeries.mockReturnValue(
        of([
          {
            id: 'sess-1',
            status: SessionStatus.PENDING,
            start_datetime: '2026-06-01T10:00:00Z',
          },
        ]),
      );
      c.chooseSeriesScope('future');
      expect(c.hasError).toBe(true);
    });

    it('reports an error loading the series for a future update', () => {
      const c = futureEdit();
      sessionsService.getSessionsBySeries.mockReturnValue(
        throwError(() => new Error('x')),
      );
      c.chooseSeriesScope('future');
      expect(c.hasError).toBe(true);
    });

    it('hard-blocks a tutor on out-of-availability future occurrences', () => {
      isAdmin = false;
      const c = editFor(
        { series_id: 'series-1' },
        {
          startTime: new Date(2026, 5, 1, 18, 0),
          endTime: new Date(2026, 5, 1, 19, 0),
        },
      );
      c.updateSession();
      sessionsService.getSessionsBySeries.mockReturnValue(
        of([
          {
            id: 'sess-1',
            status: SessionStatus.PENDING,
            start_datetime: '2026-06-01T10:00:00Z',
          },
        ]),
      );
      c.chooseSeriesScope('future');
      expect(c.hasError).toBe(true);
    });

    it('surfaces a forkJoin error deleting the future series', () => {
      const c = build({
        type: 'delete',
        session: {
          id: 'sess-1',
          series_id: 'series-1',
          start_datetime: '2026-06-01T10:00:00Z',
        } as Session,
      } as SessionDialogData);
      c.deleteSession();
      sessionsService.getSessionsBySeries.mockReturnValue(
        of([
          {
            id: 'sess-1',
            status: SessionStatus.PENDING,
            start_datetime: '2026-06-01T10:00:00Z',
          },
        ]),
      );
      sessionsService.deleteSession.mockReturnValue(throwError(() => new Error('x')));
      c.chooseSeriesScope('future');
      expect(c.hasError).toBe(true);
    });

    it('surfaces a forkJoin error when updating the future series', () => {
      const c = futureEdit();
      sessionsService.getSessionsBySeries.mockReturnValue(
        of([
          {
            id: 'sess-1',
            status: SessionStatus.PENDING,
            start_datetime: '2026-06-01T10:00:00Z',
          },
        ]),
      );
      sessionsService.updateSession.mockReturnValue(throwError(() => new Error('x')));
      c.chooseSeriesScope('future');
      expect(c.hasError).toBe(true);
    });

    it('surfaces an error loading the series for deletion', () => {
      const c = build({
        type: 'delete',
        session: {
          id: 'sess-1',
          series_id: 'series-1',
          start_datetime: '2026-06-01T10:00:00Z',
        } as Session,
      } as SessionDialogData);
      c.deleteSession();
      sessionsService.getSessionsBySeries.mockReturnValue(
        throwError(() => new Error('x')),
      );
      c.chooseSeriesScope('future');
      expect(c.hasError).toBe(true);
    });

    it('closes with zero deletions when no future occurrences match', () => {
      const c = build({
        type: 'delete',
        session: {
          id: 'sess-1',
          series_id: 'series-1',
          start_datetime: '2026-06-01T10:00:00Z',
        } as Session,
      } as SessionDialogData);
      c.deleteSession();
      sessionsService.getSessionsBySeries.mockReturnValue(of([]));
      c.chooseSeriesScope('future');
      expect(dialogRef.close).toHaveBeenCalledWith({ deleted: 0 });
    });
  });

  describe('defensive branches', () => {
    it('reports a make-up balance shortfall using the make-up label', () => {
      const c = editFor(
        {},
        {
          selectedType: SessionType.MAKE_UP,
          selectedAttendance: SessionStatus.COMPLETED,
          students: [student({ make_up_minutes: undefined })],
        },
      );
      c.updateSession();
      expect(c.errorMessage).toContain('make-up');
    });

    it('reports a tutoring balance shortfall when minutes are unset', () => {
      const c = editFor(
        {},
        {
          selectedAttendance: SessionStatus.COMPLETED,
          students: [student({ available_minutes: undefined })],
        },
      );
      c.updateSession();
      expect(c.hasError).toBe(true);
    });

    it('updates an admin session without touching student minutes', () => {
      const c = editFor({}, { selectedType: SessionType.ADMIN });
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.updateSession();
      expect(sessionsService.updateSession).toHaveBeenCalled();
    });

    it('updates a still-pending session that has no id', () => {
      const c = editFor({ id: undefined });
      sessionsService.updateSession.mockReturnValue(of({}));
      c.updateSession();
      expect(sessionsService.updateSession).toHaveBeenCalled();
    });

    it('handles a create dialog with no existing-session list', () => {
      const c = build({
        type: 'create',
        session: new Session(),
      } as SessionDialogData);
      c.tutors = [tutor()];
      c.students = [student()];
      c.selectedTutor = 't-1';
      c.selectedStudent = 's-1';
      c.selectedType = SessionType.TUTORING;
      c.date = new Date(2026, 5, 1);
      c.startTime = new Date(2026, 5, 1, 10, 0);
      c.endTime = new Date(2026, 5, 1, 11, 0);
      sessionsService.createSession.mockReturnValue(of({ id: 'x' }));
      c.createSession();
      expect(sessionsService.createSession).toHaveBeenCalled();
    });

    it('skips non-matching weekdays when generating occurrences', () => {
      const c = primedCreate();
      c.repeatWeekly = true;
      c.repeatDays = [Weekday.MONDAY]; // most cursor days will not match
      c.repeatEndMode = 'count';
      c.repeatCount = 1;
      c.students = [student({ available_minutes: undefined })];
      c.createSession();
      expect(c.hasError).toBe(true);
    });

    it('chooseSeriesScope does nothing without a staged action', () => {
      const c = build({ type: 'edit', session: new Session() } as SessionDialogData);
      expect(() => c.chooseSeriesScope('single')).not.toThrow();
    });

    it('updates future occurrences that have no id', () => {
      const c = editFor({ series_id: 'series-1' });
      c.updateSession();
      sessionsService.getSessionsBySeries.mockReturnValue(
        of([{ status: SessionStatus.PENDING, start_datetime: '2026-06-01T10:00:00Z' }]),
      );
      sessionsService.updateSession.mockReturnValue(of({}));
      c.chooseSeriesScope('future');
      expect(dialogRef.close).toHaveBeenCalled();
    });
  });

  describe('tutor/student load errors', () => {
    it('swallows a getTutors error', () => {
      contactService.getContacts.mockReturnValue(throwError(() => new Error('x')));
      studentService.getStudents.mockReturnValue(of([]));
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.ngOnInit();
      expect(c.tutors).toEqual([]);
    });

    it('swallows a getStudents error', () => {
      contactService.getContacts.mockReturnValue(of([]));
      studentService.getStudents.mockReturnValue(throwError(() => new Error('x')));
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.ngOnInit();
      expect(c.students).toEqual([]);
    });
  });
});
