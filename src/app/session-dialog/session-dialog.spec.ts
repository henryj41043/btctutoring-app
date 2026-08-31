import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError, Subject } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SessionDialog } from './session-dialog';
import { SessionsService } from '../services/sessions.service';
import { ContactService } from '../services/contact.service';
import { StudentService } from '../services/student.service';
import { AuthService } from '../services/auth.service';
import { PackageService } from '../services/package.service';
import { TEST_CATALOG, TEST_CATALOG_ROWS } from '../../testing/package-catalog.fixture';
import { SessionDialogData } from '../interfaces/session-dialog-data.interface';
import { Contact } from '../models/contact.model';
import { Student } from '../models/student.model';
import { Session } from '../models/session.model';
import { StudentStatus } from '../enums/student-status.enum';
import { StaffStatus } from '../enums/staff-status.enum';
import { Service } from '../enums/service.enum';
import { SessionStatus } from '../enums/session-status.enum';
import { SessionType } from '../enums/session-type.enum';
import { Weekday } from '../enums/weekday.enum';

const tutor = (over: Partial<Contact> = {}): Contact =>
  ({
    id: 't-1',
    first_name: 'Tess',
    status: StaffStatus.ACTIVE_STAFF,
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
    status: StudentStatus.ACTIVE_STUDENT,
    assigned_tutor_id: 't-1',
    package: 'Determination', // 2 sessions/week, 60 min
    make_up_minutes: 120,
    ...over,
  }) as Student;

const packageServiceStub = { getPackages: () => of(TEST_CATALOG_ROWS) };

describe('SessionDialog', () => {
  let isAdmin: boolean;
  let ownContactId: string | undefined;
  const dialogRef = { close: jest.fn() };
  const sessionsService = {
    createSession: jest.fn(),
    createSessions: jest.fn(),
    updateSession: jest.fn(),
    deleteSession: jest.fn(),
    emailSessionNotes: jest.fn(),
    getSessionsBySeries: jest.fn(),
  };
  const contactService = { getContacts: jest.fn(), getStaff: jest.fn() };
  const studentService = {
    getStudents: jest.fn(),
    getStudentsByTutor: jest.fn(),
    updateStudent: jest.fn(),
  };
  const authService = {
    isAdmin: () => isAdmin,
    contact: () => ({ id: ownContactId }),
  };

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
        { provide: PackageService, useValue: packageServiceStub },
      ],
    });
    const c = TestBed.createComponent(SessionDialog).componentInstance;
    // Specs drive the component without ngOnInit; give it the loaded catalog
    // (production state once the SWR fetch lands).
    (c as unknown as { catalog: unknown }).catalog = TEST_CATALOG;
    return c;
  };

  /** A create-mode dialog primed with a valid tutor/student/time selection. */
  const primedCreate = (over: Partial<SessionDialogData> = {}): SessionDialog => {
    const c = build({
      type: 'create',
      session: new Session(),
      existingSessions: [],
      ...over,
    } as SessionDialogData);
    (c as unknown as { allStaff: Contact[] }).allStaff = [tutor()];
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
    ownContactId = 'c-self';
    jest.clearAllMocks();
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

    it('availableMakeup returns the unexpired make-up balance', () => {
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      const s = {
        make_up_batches: [
          { minutes: 40, earned_date: new Date().toISOString() },
          { minutes: 15, earned_date: '2020-01-01T00:00:00Z' }, // expired
        ],
      } as Student;
      expect((c as unknown as { availableMakeup(x: Student): number }).availableMakeup(s)).toBe(40);
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

    it('selectedStudentObj resolves the chosen student', () => {
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.students = [student()];
      c.selectedStudent = 's-1';
      expect(c.selectedStudentObj?.id).toBe('s-1');
    });

    it('selectedPackageDef resolves a standard package and is null for unconfigured custom', () => {
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.students = [student()];
      c.selectedStudent = 's-1';
      expect(c.selectedPackageDef?.sessionsPerWeek).toBe(2);

      c.students = [student({ package: 'Custom' })];
      expect(c.selectedPackageDef).toBeNull();

      c.students = [
        student({
          package: 'Custom',
          custom_monthly_cost: 400,
          custom_sessions_per_week: 1,
          custom_session_length_min: 45,
        }),
      ];
      expect(c.selectedPackageDef?.sessionsPerWeek).toBe(1);
    });
  });

  describe('ngOnInit', () => {
    it('hydrates fields from the session in edit mode and loads tutors/students', () => {
      contactService.getStaff.mockReturnValue(of([tutor()]));
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
      contactService.getStaff.mockReturnValue(of([]));
      studentService.getStudents.mockReturnValue(of([]));
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.ngOnInit();
      expect(c.selectedType).toBe(SessionType.TUTORING);
    });
  });

  describe('tutor/student loading', () => {
    it('getTutors keeps only accepting staff hires; getStudents keeps active students', () => {
      contactService.getStaff.mockReturnValue(
        of([tutor(), { id: 't-x', status: StudentStatus.ACTIVE_STUDENT } as Contact]),
      );
      studentService.getStudents.mockReturnValue(
        of([student(), { id: 's-x', status: StudentStatus.PAST_STUDENT } as Student]),
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

    it('onTutorChange includes students slot-scheduled with the tutor', () => {
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.students = [
        student(),
        student({
          id: 's-slot',
          assigned_tutor_id: 't-9',
          schedule: [
            { weekday: 'WEDNESDAY', start_time: '16:00', end_time: '16:45', tutor_id: 't-1' },
          ],
        } as never),
        student({ id: 's-other', assigned_tutor_id: 't-9' }),
      ];
      c.onTutorChange('t-1');
      expect(c.filteredStudents.map((s) => s.id)).toEqual(['s-1', 's-slot']);
    });

    it('cancel closes the dialog', () => {
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.cancel();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });

    it('swallows tutor/student load errors', () => {
      contactService.getStaff.mockReturnValue(throwError(() => new Error('x')));
      studentService.getStudents.mockReturnValue(throwError(() => new Error('x')));
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.ngOnInit();
      expect(c.tutors).toEqual([]);
      expect(c.students).toEqual([]);
    });
  });

  describe('createSession (single)', () => {
    it('creates a valid tutoring session with no minute checks', () => {
      const c = primedCreate();
      sessionsService.createSession.mockReturnValue(of({ id: 'new-1' }));
      c.createSession();
      const sent = sessionsService.createSession.mock.calls.at(-1)![0] as Session;
      expect(sent.type).toBe(SessionType.TUTORING);
      expect(sent.status).toBe(SessionStatus.PENDING);
      expect(sent.student_id).toBe('s-1');
      expect(sent.tutor_id).toBe('t-1');
      expect(sent.tutor_name).toBe('Tess');
      expect(sent.notes).toBe('n');
      expect(new Date(sent.start_datetime!).getHours()).toBe(10);
      expect(new Date(sent.end_datetime!).getHours()).toBe(11);
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

    it('blocks a make-up session that exceeds the make-up bank', () => {
      const c = primedCreate();
      c.selectedType = SessionType.MAKE_UP;
      c.students = [student({ make_up_minutes: 30 })]; // session is 60 min
      c.createSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('make-up');
      expect(sessionsService.createSession).not.toHaveBeenCalled();
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

    it('blocks a tutoring session longer than the package allows', () => {
      const c = primedCreate();
      c.endTime = new Date(2026, 5, 1, 11, 30); // 90 min vs Determination's 60
      c.createSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('allows up to 60 min');
      expect(sessionsService.createSession).not.toHaveBeenCalled();
    });

    it('allows a tutoring session exactly the package length', () => {
      const c = primedCreate(); // 10:00–11:00 = 60 min == package length
      sessionsService.createSession.mockReturnValue(of({ id: 'ok' }));
      c.createSession();
      expect(sessionsService.createSession).toHaveBeenCalled();
    });

    it('skips the length check when the package is unconfigured', () => {
      const c = primedCreate();
      c.students = [student({ package: 'Custom' })]; // no overrides → def null
      c.endTime = new Date(2026, 5, 1, 12, 0); // 120 min, but no cap to enforce
      sessionsService.createSession.mockReturnValue(of({ id: 'ok' }));
      c.createSession();
      expect(sessionsService.createSession).toHaveBeenCalled();
    });
  });

  describe('schedule-conflict warning (individual sessions)', () => {
    const scheduled = (over: Partial<Student> = {}): Student =>
      student({
        schedule: [
          { weekday: Weekday.MONDAY, start_time: '10:00', end_time: '11:00' },
          { weekday: Weekday.WEDNESDAY, start_time: '10:00', end_time: '11:00' },
        ],
        ...over,
      });

    const scheduledEdit = (over: Partial<Session> = {}): SessionDialog => {
      const c = build({
        type: 'edit',
        session: {
          id: 'sess-1',
          status: SessionStatus.PENDING,
          start_datetime: '2026-06-01T10:00:00Z',
          ...over,
        } as Session,
        existingSessions: [],
      } as SessionDialogData);
      (c as unknown as { allStaff: Contact[] }).allStaff = [tutor()];
      c.students = [scheduled()];
      c.selectedTutor = 't-1';
      c.selectedStudent = 's-1';
      c.selectedType = SessionType.TUTORING;
      c.date = new Date(2026, 5, 1);
      c.startTime = new Date(2026, 5, 1, 10, 0);
      c.endTime = new Date(2026, 5, 1, 11, 0);
      c.selectedAttendance = SessionStatus.PENDING;
      return c;
    };

    it('warns before creating an individual session for a scheduled student', () => {
      const c = primedCreate();
      c.students = [scheduled()];
      c.createSession();
      expect(c.showScheduleWarning).toBe(true);
      expect(c.scheduleWarningMessage).toContain('2 session(s)/week');
      expect(c.scheduleWarningMessage).toContain('Determination');
      expect(sessionsService.createSession).not.toHaveBeenCalled();
    });

    it('creates the session after the warning is confirmed', () => {
      const c = primedCreate();
      c.students = [scheduled()];
      c.createSession();
      sessionsService.createSession.mockReturnValue(of({ id: 'new-1' }));
      c.confirmScheduleWarning();
      expect(sessionsService.createSession).toHaveBeenCalled();
      expect(c.showScheduleWarning).toBe(false);
    });

    it('cancelling the warning aborts and lets it re-trigger', () => {
      const c = primedCreate();
      c.students = [scheduled()];
      c.createSession();
      c.cancelScheduleWarning();
      expect(c.showScheduleWarning).toBe(false);
      expect(sessionsService.createSession).not.toHaveBeenCalled();
      // Not permanently overridden — a second attempt warns again.
      c.createSession();
      expect(c.showScheduleWarning).toBe(true);
    });

    it('does not warn for a student without a saved schedule', () => {
      const c = primedCreate(); // default student has no schedule
      sessionsService.createSession.mockReturnValue(of({ id: 'ok' }));
      c.createSession();
      expect(c.showScheduleWarning).toBe(false);
      expect(sessionsService.createSession).toHaveBeenCalled();
    });

    it('does not warn for a make-up session even if a schedule exists', () => {
      const c = primedCreate();
      c.selectedType = SessionType.MAKE_UP;
      c.students = [scheduled()];
      sessionsService.createSession.mockReturnValue(of({ id: 'ok' }));
      c.createSession();
      expect(c.showScheduleWarning).toBe(false);
      expect(sessionsService.createSession).toHaveBeenCalled();
    });

    it('falls back to the schedule length when the package is unconfigured', () => {
      const c = primedCreate();
      c.students = [scheduled({ package: 'Custom' })]; // resolvePackageDef → null
      c.createSession();
      expect(c.showScheduleWarning).toBe(true);
      expect(c.scheduleWarningMessage).toContain('2 session(s)/week'); // from schedule.length
    });

    it('omits the package suffix when the student has no package set', () => {
      const c = primedCreate();
      c.students = [scheduled({ package: undefined })];
      c.createSession();
      expect(c.showScheduleWarning).toBe(true);
      expect(c.scheduleWarningMessage).toContain('2 session(s)/week.');
      expect(c.scheduleWarningMessage).not.toContain('package).');
    });

    it('warns when editing a non-series individual session for a scheduled student', () => {
      const c = scheduledEdit();
      c.updateSession();
      expect(c.showScheduleWarning).toBe(true);
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
    });

    it('does not warn when editing an occurrence that belongs to the schedule', () => {
      const c = scheduledEdit({ series_id: 'series-1' });
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.updateSession();
      expect(c.showSeriesScopePrompt).toBe(true); // series sessions prompt for scope first
      c.chooseSeriesScope('single');
      expect(c.showScheduleWarning).toBe(false);
      expect(sessionsService.updateSession).toHaveBeenCalled();
    });

    /** An edit dialog whose pickers hold exactly the stored session values, the
     *  way ngOnInit seeds them — i.e. the admin hasn't moved the session. */
    const unchangedEdit = (over: Partial<Session> = {}): SessionDialog => {
      const start = '2026-06-01T14:00:00.000Z';
      const end = '2026-06-01T15:00:00.000Z';
      const c = build({
        type: 'edit',
        session: {
          id: 'sess-1',
          status: SessionStatus.PENDING,
          start_datetime: start,
          end_datetime: end,
          tutor_id: 't-1',
          student_id: 's-1',
          ...over,
        } as Session,
        existingSessions: [],
      } as SessionDialogData);
      (c as unknown as { allStaff: Contact[] }).allStaff = [tutor()];
      c.students = [scheduled()];
      c.selectedTutor = 't-1';
      c.selectedStudent = 's-1';
      c.selectedType = SessionType.TUTORING;
      c.date = new Date(start);
      c.startTime = new Date(start);
      c.endTime = new Date(end);
      c.selectedAttendance = SessionStatus.PENDING;
      return c;
    };

    it('does not warn when only taking attendance on an unchanged session (regression)', () => {
      const c = unchangedEdit();
      c.selectedAttendance = SessionStatus.COMPLETED;
      c.updateSession();
      expect(c.showScheduleWarning).toBe(false);
      // Proceeds straight to the finalize-attendance confirm.
      expect(c.showStatusConfirm).toBe(true);
    });

    it('does not warn when only the notes change on an unchanged session', () => {
      const c = unchangedEdit();
      c.notes = 'updated note';
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.updateSession();
      expect(c.showScheduleWarning).toBe(false);
      expect(sessionsService.updateSession).toHaveBeenCalled();
    });

    it('still warns when the time is moved on a non-series session', () => {
      const c = unchangedEdit();
      c.startTime = new Date(2026, 5, 1, 9, 0);
      c.endTime = new Date(2026, 5, 1, 10, 0);
      c.updateSession();
      expect(c.showScheduleWarning).toBe(true);
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
    });

    it('still warns when the student is switched on an otherwise unchanged session', () => {
      const c = unchangedEdit({ student_id: 's-other' });
      c.updateSession();
      expect(c.showScheduleWarning).toBe(true);
    });
  });

  describe('submit spinner / spam-guard', () => {
    it('sets submitting while a create is in flight and blocks a second submit', () => {
      const c = primedCreate();
      const inflight = new Subject<unknown>();
      sessionsService.createSession.mockReturnValue(inflight.asObservable());
      c.createSession();
      expect(c.submitting).toBe(true);
      c.createSession(); // spam click — no second request
      expect(sessionsService.createSession).toHaveBeenCalledTimes(1);
      inflight.next({ id: 'x' });
    });

    it('clears submitting when a create fails', () => {
      const c = primedCreate();
      sessionsService.createSession.mockReturnValue(throwError(() => new Error('x')));
      c.createSession();
      expect(c.submitting).toBe(false);
    });

    it('sets submitting while a delete is in flight', () => {
      const c = build({
        type: 'delete',
        session: { id: 'sess-1', start_datetime: '2026-06-01T10:00:00Z' } as Session,
        existingSessions: [],
      } as SessionDialogData);
      (c as unknown as { allStaff: Contact[] }).allStaff = [tutor()];
      c.selectedTutor = 't-1';
      const inflight = new Subject<unknown>();
      sessionsService.deleteSession.mockReturnValue(inflight.asObservable());
      c.deleteSession();
      expect(c.submitting).toBe(true);
      inflight.next({ message: 'ok' });
    });

    it('updateSession no-ops while a submit is already in flight', () => {
      const c = primedCreate();
      c.submitting = true;
      c.updateSession();
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
    });

    it('deleteSession no-ops while a submit is already in flight', () => {
      const c = build({
        type: 'delete', session: { id: 'sess-1' } as Session, existingSessions: [],
      } as SessionDialogData);
      c.submitting = true;
      c.deleteSession();
      expect(sessionsService.deleteSession).not.toHaveBeenCalled();
    });

    it('confirmStatusChange no-ops while a submit is already in flight', () => {
      const c = primedCreate();
      c.submitting = true;
      (c as unknown as { pendingSession: Session }).pendingSession = { id: 'x' } as Session;
      c.confirmStatusChange();
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
    });

    it('clears submitting when a delete fails', () => {
      const c = build({
        type: 'delete',
        session: { id: 'sess-1' } as Session,
        existingSessions: [],
      } as SessionDialogData);
      sessionsService.deleteSession.mockReturnValue(throwError(() => new Error('x')));
      c.deleteSession();
      expect(c.submitting).toBe(false);
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
      (c as unknown as { allStaff: Contact[] }).allStaff = [tutor()];
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

    it('prompts for status confirmation when marking a pending tutoring session complete', () => {
      const c = primedEdit(editData());
      c.selectedAttendance = SessionStatus.COMPLETED;
      c.updateSession();
      expect(c.showStatusConfirm).toBe(true);
    });

    it('completing a tutoring session does not stage a student minute change', () => {
      const c = primedEdit(editData());
      c.selectedAttendance = SessionStatus.COMPLETED;
      c.updateSession();
      studentService.updateStudent.mockReturnValue(of({} as Student));
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.confirmStatusChange();
      expect(studentService.updateStudent).not.toHaveBeenCalled();
      expect(sessionsService.updateSession).toHaveBeenCalled();
    });

    it('cancelling a tutoring session banks its minutes to make-up', () => {
      const c = primedEdit(editData());
      c.selectedAttendance = SessionStatus.CANCELLED;
      c.updateSession();
      expect(c.showStatusConfirm).toBe(true);
      studentService.updateStudent.mockReturnValue(of({} as Student));
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.confirmStatusChange();
      const saved = studentService.updateStudent.mock.calls.at(-1)![0] as Student;
      expect(saved.make_up_minutes).toBe(180); // 120 + 60-min session
    });

    it('blocks completing a make-up session beyond the make-up bank', () => {
      const c = primedEdit(editData());
      c.selectedType = SessionType.MAKE_UP;
      c.students = [student({ make_up_minutes: 10 })];
      c.selectedAttendance = SessionStatus.COMPLETED;
      c.updateSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('make-up');
    });

    it('deducts make-up minutes when completing a make-up session', () => {
      const c = primedEdit(editData());
      c.selectedType = SessionType.MAKE_UP;
      c.selectedAttendance = SessionStatus.COMPLETED;
      c.updateSession();
      studentService.updateStudent.mockReturnValue(of({} as Student));
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.confirmStatusChange();
      const saved = studentService.updateStudent.mock.calls.at(-1)![0] as Student;
      expect(saved.make_up_minutes).toBe(60); // 120 - 60
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

    /** Edit data whose scheduling fields exactly match the primed selections. */
    const attendanceOnlyEditData = (over: Partial<Session> = {}) =>
      editData({
        series_id: 'series-1',
        tutor_id: 't-1',
        student_id: 's-1',
        start_datetime: new Date(2026, 5, 1, 10, 0).toISOString(),
        end_datetime: new Date(2026, 5, 1, 11, 0).toISOString(),
        ...over,
      });

    it('skips the scope prompt when only attendance changes on a series session', () => {
      const c = primedEdit(attendanceOnlyEditData());
      c.selectedAttendance = SessionStatus.COMPLETED;
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.updateSession();
      // No series-scope prompt — straight to the normal attendance confirm.
      expect(c.showSeriesScopePrompt).toBe(false);
      c.confirmStatusChange();
      // Single-occurrence update only, no series fan-out.
      expect(sessionsService.updateSession).toHaveBeenCalledTimes(1);
      expect(sessionsService.getSessionsBySeries).not.toHaveBeenCalled();
    });

    it('still prompts for scope when a series session is rescheduled', () => {
      const c = primedEdit(attendanceOnlyEditData());
      // Move the start time — now it's a real reschedule.
      c.startTime = new Date(2026, 5, 1, 12, 0);
      c.endTime = new Date(2026, 5, 1, 13, 0);
      c.updateSession();
      expect(c.showSeriesScopePrompt).toBe(true);
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
    });

    it('rejects when the date/time is missing', () => {
      const c = primedEdit(editData());
      c.date = undefined;
      c.updateSession();
      expect(c.hasError).toBe(true);
    });

    it('updates an admin session without touching student minutes', () => {
      const c = primedEdit(editData());
      c.selectedType = SessionType.ADMIN;
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.updateSession();
      expect(sessionsService.updateSession).toHaveBeenCalled();
    });

    it('surfaces an update error', () => {
      const c = primedEdit(editData());
      sessionsService.updateSession.mockReturnValue(throwError(() => new Error('x')));
      c.updateSession();
      expect(c.hasError).toBe(true);
    });

    it('asks an admin to override availability when editing a single session', () => {
      const c = primedEdit(editData());
      c.startTime = new Date(2026, 5, 1, 18, 0);
      c.endTime = new Date(2026, 5, 1, 19, 0);
      c.updateSession();
      expect(c.showAvailabilityConfirm).toBe(true);
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.confirmAvailabilityOverride();
      expect(sessionsService.updateSession).toHaveBeenCalled();
    });

    it('blocks an edit that exceeds the package session length', () => {
      const c = primedEdit(editData());
      c.endTime = new Date(2026, 5, 1, 11, 30); // 90 min vs 60
      c.updateSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('allows up to 60 min');
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
    });

    it('blocks an over-length series edit before prompting for scope', () => {
      const c = primedEdit(editData({ series_id: 'series-1' }));
      c.endTime = new Date(2026, 5, 1, 11, 30); // 90 min vs 60
      c.updateSession();
      expect(c.hasError).toBe(true);
      expect(c.showSeriesScopePrompt).toBe(false);
      expect(c.errorMessage).toContain('allows up to 60 min');
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
      (c as unknown as { allStaff: Contact[] }).allStaff = [tutor()];
      c.students = [student()];
      c.selectedTutor = 't-1';
      c.selectedStudent = 's-1';
      c.selectedType = SessionType.MAKE_UP;
      c.date = new Date(2026, 5, 1);
      c.startTime = new Date(2026, 5, 1, 10, 0);
      c.endTime = new Date(2026, 5, 1, 11, 0);
      c.selectedAttendance = SessionStatus.COMPLETED;
      return c;
    };

    it('updates the student minutes and the session on confirm', () => {
      const c = primedConfirm();
      c.updateSession();
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

    it('cancelAvailabilityOverride resets the override state', () => {
      const c = primedCreate();
      c.startTime = new Date(2026, 5, 1, 18, 0);
      c.endTime = new Date(2026, 5, 1, 19, 0);
      c.createSession();
      c.cancelAvailabilityOverride();
      expect(c.showAvailabilityConfirm).toBe(false);
    });
  });

  describe('email notes to parent', () => {
    const completedEdit = (over: Partial<Session> = {}): SessionDialog => {
      const c = build({
        type: 'edit',
        session: {
          id: 'sess-1',
          status: SessionStatus.COMPLETED,
          start_datetime: '2026-06-01T10:00:00Z',
          ...over,
        } as Session,
        existingSessions: [],
      } as SessionDialogData);
      (c as unknown as { allStaff: Contact[] }).allStaff = [tutor()];
      c.students = [student()];
      c.selectedTutor = 't-1';
      c.selectedStudent = 's-1';
      c.selectedType = SessionType.TUTORING;
      c.date = new Date(2026, 5, 1);
      c.startTime = new Date(2026, 5, 1, 10, 0);
      c.endTime = new Date(2026, 5, 1, 11, 0);
      c.selectedAttendance = SessionStatus.COMPLETED;
      c.notes = 'Worked on fractions.';
      return c;
    };

    it('offers the checkbox only when completing a student session in edit mode', () => {
      const c = completedEdit();
      expect(c.canEmailNotes).toBe(true);
      c.selectedAttendance = SessionStatus.PENDING;
      expect(c.canEmailNotes).toBe(false);
      c.selectedAttendance = SessionStatus.COMPLETED;
      c.selectedType = SessionType.ADMIN; // no student -> nobody to email
      expect(c.canEmailNotes).toBe(false);
    });

    it('no checkbox in create mode', () => {
      const c = build({
        type: 'create',
        session: new Session(),
        existingSessions: [],
      } as SessionDialogData);
      c.selectedAttendance = SessionStatus.COMPLETED;
      expect(c.canEmailNotes).toBe(false);
    });

    it('checked: saves first, then emails the notes, then closes', () => {
      const c = completedEdit();
      c.emailNotesToParent = true;
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      sessionsService.emailSessionNotes.mockReturnValue(of({ message: 'ok' }));
      c.updateSession();
      expect(sessionsService.updateSession).toHaveBeenCalled();
      expect(sessionsService.emailSessionNotes).toHaveBeenCalledWith('sess-1');
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('unchecked: closes after the save without emailing', () => {
      const c = completedEdit();
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.updateSession();
      expect(sessionsService.emailSessionNotes).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('a failed email keeps the dialog open; Retry re-sends WITHOUT re-saving', () => {
      const c = completedEdit();
      c.emailNotesToParent = true;
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      sessionsService.emailSessionNotes.mockReturnValue(throwError(() => new Error('ses down')));
      c.updateSession();
      expect(c.emailNotesFailed).toBe(true);
      expect(c.submitting).toBe(false);
      expect(dialogRef.close).not.toHaveBeenCalled();

      // Retry succeeds — the session update must NOT run again (its status
      // side effects like make-up banking must never double-apply).
      sessionsService.updateSession.mockClear();
      sessionsService.emailSessionNotes.mockReturnValue(of({ message: 'ok' }));
      c.retryEmailNotes();
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
      expect(sessionsService.emailSessionNotes).toHaveBeenCalledTimes(2);
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('Close Without Emailing closes with the saved response', () => {
      const c = completedEdit();
      c.emailNotesToParent = true;
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      sessionsService.emailSessionNotes.mockReturnValue(throwError(() => new Error('x')));
      c.updateSession();
      c.closeWithoutEmail();
      expect(dialogRef.close).toHaveBeenCalledWith({ id: 'sess-1' });
    });
  });

  describe('make-up locked create (tutor self-service)', () => {
    const buildLocked = (): SessionDialog => {
      isAdmin = false;
      ownContactId = 'c-self';
      contactService.getStaff.mockReturnValue(of([
        // At capacity (not accepting) — must still appear as the locked tutor.
        tutor({ id: 'c-self', first_name: 'Self', currently_accepting_students: false }),
        tutor({ id: 'c-other', first_name: 'Other' }),
      ]));
      studentService.getStudentsByTutor.mockReturnValue(of([
        student({ id: 's-own', assigned_tutor_id: 'c-self' }),
      ]));
      const c = build({
        type: 'create',
        session: new Session(),
        existingSessions: [],
        lockToMakeup: true,
      } as SessionDialogData);
      c.ngOnInit();
      return c;
    };

    it('pins type to MAKE_UP and tutor to self, and pre-filters the caseload', () => {
      const c = buildLocked();
      expect(c.selectedType).toBe(SessionType.MAKE_UP);
      expect(c.sessionTypeOptions).toEqual([SessionType.MAKE_UP]);
      expect(c.selectedTutor).toBe('c-self');
      expect(c.isMakeupLocked).toBe(true);
      // Caseload loaded via the tutor-scoped endpoint and pre-filtered.
      expect(c.filteredStudents.map(s => s.id)).toEqual(['s-own']);
    });

    it('the tutors list contains only the tutor themselves, even at capacity', () => {
      const c = buildLocked();
      expect(c.tutors.map(t => t.id)).toEqual(['c-self']);
    });

    it('an unlocked create is unaffected', () => {
      contactService.getStaff.mockReturnValue(of([]));
      studentService.getStudents.mockReturnValue(of([]));
      const c = build({
        type: 'create',
        session: new Session(),
        existingSessions: [],
      } as SessionDialogData);
      c.ngOnInit();
      expect(c.isMakeupLocked).toBe(false);
      expect(c.sessionTypeOptions.length).toBeGreaterThan(1);
      expect(c.selectedTutor).toBeUndefined();
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
      expect(c.seriesActionLabel).toBe('deletion');
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

    it('warns before deleting a cancelled session; confirm proceeds', () => {
      const c = build({
        type: 'delete',
        session: { id: 'sess-1', status: SessionStatus.CANCELLED } as Session,
      } as SessionDialogData);
      sessionsService.deleteSession.mockReturnValue(of({ message: 'ok' }));
      c.deleteSession();
      // Warned, nothing deleted yet — the banked make-up minutes will persist.
      expect(c.showCancelledDeleteWarning).toBe(true);
      expect(sessionsService.deleteSession).not.toHaveBeenCalled();
      c.confirmCancelledDelete();
      expect(c.showCancelledDeleteWarning).toBe(false);
      expect(sessionsService.deleteSession).toHaveBeenCalledWith('sess-1');
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('Go Back on the cancelled-delete warning aborts the delete', () => {
      const c = build({
        type: 'delete',
        session: { id: 'sess-1', status: SessionStatus.CANCELLED } as Session,
      } as SessionDialogData);
      c.deleteSession();
      c.cancelCancelledDelete();
      expect(c.showCancelledDeleteWarning).toBe(false);
      expect(sessionsService.deleteSession).not.toHaveBeenCalled();
      // A second attempt warns again (the confirmation is not sticky).
      c.deleteSession();
      expect(c.showCancelledDeleteWarning).toBe(true);
    });

    it('does not warn when deleting a non-cancelled session', () => {
      const c = build({
        type: 'delete',
        session: { id: 'sess-1', status: SessionStatus.PENDING } as Session,
      } as SessionDialogData);
      sessionsService.deleteSession.mockReturnValue(of({ message: 'ok' }));
      c.deleteSession();
      expect(c.showCancelledDeleteWarning).toBe(false);
      expect(sessionsService.deleteSession).toHaveBeenCalledWith('sess-1');
    });

    it('a cancelled series occurrence warns after the scope prompt (single path)', () => {
      const c = build({
        type: 'delete',
        session: { id: 'sess-1', series_id: 'series-1', status: SessionStatus.CANCELLED } as Session,
      } as SessionDialogData);
      sessionsService.deleteSession.mockReturnValue(of({ message: 'ok' }));
      c.deleteSession();
      expect(c.showSeriesScopePrompt).toBe(true);
      c.chooseSeriesScope('single');
      expect(c.showCancelledDeleteWarning).toBe(true);
      expect(sessionsService.deleteSession).not.toHaveBeenCalled();
      c.confirmCancelledDelete();
      expect(sessionsService.deleteSession).toHaveBeenCalledWith('sess-1');
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
      (c as unknown as { allStaff: Contact[] }).allStaff = [tutor()];
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
      c.updateSession();
      sessionsService.getSessionsBySeries.mockReturnValue(
        of([
          { id: 'sess-1', status: SessionStatus.PENDING, start_datetime: '2026-06-01T10:00:00Z' },
          { id: 'sess-2', status: SessionStatus.PENDING, start_datetime: '2026-06-08T10:00:00Z' },
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
        session: { id: 'sess-1', series_id: 'series-1', start_datetime: '2026-06-01T10:00:00Z' } as Session,
      } as SessionDialogData);
      c.deleteSession();
      sessionsService.getSessionsBySeries.mockReturnValue(
        of([{ id: 'sess-1', status: SessionStatus.PENDING, start_datetime: '2026-06-01T10:00:00Z' }]),
      );
      sessionsService.deleteSession.mockReturnValue(of({}));
      c.chooseSeriesScope('future');
      expect(dialogRef.close).toHaveBeenCalledWith({ deleted: 1 });
    });

    it('chooseSeriesScope(single) updates just this occurrence', () => {
      const c = seriesEdit();
      c.updateSession();
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.chooseSeriesScope('single');
      expect(sessionsService.updateSession).toHaveBeenCalled();
    });

    it('cancelSeriesScope clears the prompt', () => {
      const c = seriesEdit();
      c.cancelSeriesScope();
      expect(c.showSeriesScopePrompt).toBe(false);
    });

    it('errors when the series tutor cannot be resolved for a future update', () => {
      const c = seriesEdit();
      c.updateSession();
      c.selectedTutor = 'missing';
      c.chooseSeriesScope('future');
      expect(c.hasError).toBe(true);
    });

    it('asks an admin to override availability across the future series', () => {
      const c = seriesEdit();
      c.startTime = new Date(2026, 5, 1, 18, 0);
      c.endTime = new Date(2026, 5, 1, 19, 0);
      c.updateSession();
      sessionsService.getSessionsBySeries.mockReturnValue(
        of([{ id: 'sess-1', status: SessionStatus.PENDING, start_datetime: '2026-06-01T10:00:00Z' }]),
      );
      c.chooseSeriesScope('future');
      expect(c.showAvailabilityConfirm).toBe(true);
    });

    it('reports an error loading the series', () => {
      const c = seriesEdit();
      c.updateSession();
      sessionsService.getSessionsBySeries.mockReturnValue(throwError(() => new Error('x')));
      c.chooseSeriesScope('future');
      expect(c.hasError).toBe(true);
    });

    it('chooseSeriesScope does nothing without a staged action', () => {
      const c = build({ type: 'edit', session: new Session() } as SessionDialogData);
      expect(() => c.chooseSeriesScope('single')).not.toThrow();
    });
  });

  describe('coverage hardening', () => {
    const editFor = (
      sessionOver: Partial<Session> = {},
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
      (c as unknown as { allStaff: Contact[] }).allStaff = [tutor()];
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

    it('blocks lengthening a pending make-up session beyond the make-up bank', () => {
      const c = editFor(
        { type: SessionType.MAKE_UP },
        {
          selectedType: SessionType.MAKE_UP,
          selectedAttendance: SessionStatus.PENDING,
          students: [student({ make_up_minutes: 60 })],
          endTime: new Date(2026, 5, 1, 12, 0), // 120 min
        },
      );
      c.dialogData.existingSessions = [
        {
          id: 'other', student_id: 's-1', type: SessionType.MAKE_UP, status: SessionStatus.PENDING,
          start_datetime: '2026-06-02T10:00:00Z', end_datetime: '2026-06-02T10:30:00Z',
        },
        // missing datetimes -> durationOf returns 0
        { id: 'nodt', student_id: 's-1', type: SessionType.MAKE_UP, status: SessionStatus.PENDING },
      ] as Session[];
      c.updateSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('make-up');
    });

    it('blocks a make-up create when pending make-up already fills the bank', () => {
      const c = primedCreate({
        existingSessions: [
          {
            student_id: 's-1', type: SessionType.MAKE_UP, status: SessionStatus.PENDING,
            start_datetime: '2026-06-02T10:00:00Z', end_datetime: '2026-06-02T11:00:00Z',
          },
        ] as Session[],
      });
      c.selectedType = SessionType.MAKE_UP;
      c.students = [student({ make_up_minutes: 90 })]; // existing 60 + new 60 = 120 > 90
      c.createSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('make-up');
    });

    it('deducts make-up minutes on a no-call-no-show make-up session', () => {
      const c = editFor({}, {
        selectedType: SessionType.MAKE_UP,
        selectedAttendance: SessionStatus.NO_CALL_NO_SHOW,
      });
      c.updateSession();
      studentService.updateStudent.mockReturnValue(of({} as Student));
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.confirmStatusChange();
      const saved = studentService.updateStudent.mock.calls.at(-1)![0] as Student;
      expect(saved.make_up_minutes).toBe(60); // 120 - 60
    });

    it('no-shows a tutoring session without changing student minutes', () => {
      const c = editFor({}, { selectedAttendance: SessionStatus.NO_CALL_NO_SHOW });
      c.updateSession();
      expect(c.showStatusConfirm).toBe(true);
      studentService.updateStudent.mockReturnValue(of({} as Student));
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-1' }));
      c.confirmStatusChange();
      expect(studentService.updateStudent).not.toHaveBeenCalled();
    });

    it('creates a make-up session that fits within the make-up bank', () => {
      const c = primedCreate();
      c.selectedType = SessionType.MAKE_UP;
      c.students = [student({ make_up_minutes: 240 })]; // 60-min session fits
      sessionsService.createSession.mockReturnValue(of({ id: 'mu-1' }));
      c.createSession();
      expect(sessionsService.createSession).toHaveBeenCalled();
    });

    it('reports a session-update failure after the student update succeeds', () => {
      const c = editFor({}, {
        selectedType: SessionType.MAKE_UP,
        selectedAttendance: SessionStatus.COMPLETED,
      });
      c.updateSession(); // stages make-up deduction + pendingSession
      studentService.updateStudent.mockReturnValue(of({} as Student));
      sessionsService.updateSession.mockReturnValue(throwError(() => new Error('x')));
      c.confirmStatusChange();
      expect(c.hasError).toBe(true);
    });

    it('hard-blocks a tutor on out-of-availability future occurrences', () => {
      isAdmin = false;
      const c = editFor({ series_id: 'series-1' }, {
        startTime: new Date(2026, 5, 1, 18, 0),
        endTime: new Date(2026, 5, 1, 19, 0),
      });
      c.updateSession();
      sessionsService.getSessionsBySeries.mockReturnValue(
        of([{ id: 'sess-1', status: SessionStatus.PENDING, start_datetime: '2026-06-01T10:00:00Z' }]),
      );
      c.chooseSeriesScope('future');
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('availability');
    });

    it('surfaces a forkJoin error updating the future series', () => {
      const c = editFor({ series_id: 'series-1' });
      c.updateSession();
      sessionsService.getSessionsBySeries.mockReturnValue(
        of([{ id: 'sess-1', status: SessionStatus.PENDING, start_datetime: '2026-06-01T10:00:00Z' }]),
      );
      sessionsService.updateSession.mockReturnValue(throwError(() => new Error('x')));
      c.chooseSeriesScope('future');
      expect(c.hasError).toBe(true);
    });

    it('deletes a future series, and handles zero/at-error cases', () => {
      const mkDelete = () =>
        build({
          type: 'delete',
          session: { id: 'sess-1', series_id: 'series-1', start_datetime: '2026-06-01T10:00:00Z' } as Session,
        } as SessionDialogData);

      // zero matching future occurrences
      const c1 = mkDelete();
      c1.deleteSession();
      sessionsService.getSessionsBySeries.mockReturnValue(of([]));
      c1.chooseSeriesScope('future');
      expect(dialogRef.close).toHaveBeenCalledWith({ deleted: 0 });

      // load error
      const c2 = mkDelete();
      c2.deleteSession();
      sessionsService.getSessionsBySeries.mockReturnValue(throwError(() => new Error('x')));
      c2.chooseSeriesScope('future');
      expect(c2.hasError).toBe(true);

      // forkJoin delete error
      const c3 = mkDelete();
      c3.deleteSession();
      sessionsService.getSessionsBySeries.mockReturnValue(
        of([{ id: 'sess-1', status: SessionStatus.PENDING, start_datetime: '2026-06-01T10:00:00Z' }]),
      );
      sessionsService.deleteSession.mockReturnValue(throwError(() => new Error('x')));
      c3.chooseSeriesScope('future');
      expect(c3.hasError).toBe(true);
    });
  });

  /** An edit dialog primed on an existing 45-min trial session. */
  const primedTrialEdit = (): SessionDialog => {
    const c = build({
      type: 'edit',
      session: {
        id: 'sess-t',
        type: SessionType.TRIAL,
        status: SessionStatus.PENDING,
        tutor_id: 't-1',
        student_id: 's-1',
        start_datetime: new Date(2026, 5, 1, 10, 0).toISOString(),
        end_datetime: new Date(2026, 5, 1, 10, 45).toISOString(),
      },
      existingSessions: [],
    } as never);
    c.ngOnInit();
    (c as unknown as { allStaff: Contact[] }).allStaff = [tutor()];
    c.students = [student({ id: 's-1', contact_id: 'c-1', name: 'Pat' })];
    c.selectedTutor = 't-1';
    c.selectedStudent = 's-1';
    c.date = new Date(2026, 5, 1);
    c.startTime = new Date(2026, 5, 1, 10, 0);
    c.endTime = new Date(2026, 5, 1, 10, 45);
    c.selectedAttendance = SessionStatus.PENDING;
    return c;
  };

  describe('TRIAL guards', () => {
    it('offers TRIAL in the type dropdown only when editing a trial', () => {
      const createDialog = build();
      expect(createDialog.sessionTypeOptions).not.toContain(SessionType.TRIAL);

      const trialEdit = build({
        type: 'edit',
        session: {
          id: 'sess-t', type: SessionType.TRIAL, status: SessionStatus.PENDING,
          start_datetime: '2026-06-01T10:00:00Z',
        },
      } as never);
      trialEdit.ngOnInit();
      expect(trialEdit.sessionTypeOptions).toContain(SessionType.TRIAL);
    });

    it('lets trial edits pick non-accepting tutors (but never non-tutors)', () => {
      const c = build();
      (c as unknown as { allStaff: Contact[] }).allStaff = [
        tutor({ id: 't-1', currently_accepting_students: false }),
        tutor({ id: 't-2', is_tutor: false }),
      ];
      (c as unknown as { selectedType: SessionType }).selectedType = SessionType.TRIAL;
      expect(c.tutors.map(t => t.id)).toEqual(['t-1']);
    });

    // The trial/make-up bank rules moved to utils/session-rules.ts; their
    // direct cases live in session-rules.spec.ts now.

    it('rejects a trial edit that is not exactly 45 minutes', () => {
      const c = primedTrialEdit();
      c.endTime = new Date(2026, 5, 1, 11, 0); // 60 min
      c.updateSession();
      expect(c.hasError).toBe(true);
      expect((c.errorMessage as string)).toContain('45 minutes');
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
    });

    it('syncs the student trial date when a trial is rescheduled', () => {
      const c = primedTrialEdit();
      // Move to a different DAY, keep 45 minutes.
      c.date = new Date(2026, 5, 3);
      c.startTime = new Date(2026, 5, 3, 10, 0);
      c.endTime = new Date(2026, 5, 3, 10, 45);
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-t' }));
      studentService.updateStudent.mockReturnValue(of({}));
      c.updateSession();
      expect(studentService.updateStudent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 's-1', trial_date: '2026-06-03' }),
      );
    });

    it('syncs with blank family fields when the student is not in the list', () => {
      const c = primedTrialEdit();
      c.students = [];
      studentService.updateStudent.mockReturnValue(of({}));
      (c as unknown as {
        syncTrialDateAfterReschedule: (s: unknown) => void;
      }).syncTrialDateAfterReschedule({
        type: SessionType.TRIAL,
        student_id: 's-1',
        start_datetime: new Date(2026, 5, 4, 10, 0).toISOString(),
      });
      expect(studentService.updateStudent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 's-1', trial_date: '2026-06-04' }),
      );
    });

    it('never syncs non-trial or student-less sessions', () => {
      const sync = (session: unknown) =>
        (build() as unknown as {
          syncTrialDateAfterReschedule: (s: unknown) => void;
        }).syncTrialDateAfterReschedule(session);
      sync({ type: SessionType.TUTORING, student_id: 's-1', start_datetime: '2026-06-04T10:00:00Z' });
      sync({ type: SessionType.TRIAL, start_datetime: '2026-06-04T10:00:00Z' });
      sync({ type: SessionType.TRIAL, student_id: 's-1' });
      expect(studentService.updateStudent).not.toHaveBeenCalled();
    });

    it('does not sync the trial date when only attendance changes', () => {
      const c = primedTrialEdit();
      sessionsService.updateSession.mockReturnValue(of({ id: 'sess-t' }));
      c.updateSession();
      expect(studentService.updateStudent).not.toHaveBeenCalled();
    });
  });

  describe('staff dropdown by session type', () => {
    const staffPool = () => [
      tutor({ id: 't-1', first_name: 'Tess' }),
      tutor({ id: 't-2', first_name: 'Cap', currently_accepting_students: false }),
      tutor({ id: 't-3', first_name: 'Ada', is_tutor: false, currently_accepting_students: false }),
    ];

    it('tutoring sessions only offer accepting tutors', () => {
      const c = build();
      (c as unknown as { allStaff: Contact[] }).allStaff = staffPool();
      (c as unknown as { selectedType: SessionType }).selectedType = SessionType.TUTORING;
      expect(c.tutors.map(t => t.id)).toEqual(['t-1']);
    });

    it('admin sessions offer every active staff member, tutor or not', () => {
      const c = build();
      (c as unknown as { allStaff: Contact[] }).allStaff = staffPool();
      (c as unknown as { selectedType: SessionType }).selectedType = SessionType.ADMIN;
      expect(c.tutors.map(t => t.id)).toEqual(['t-1', 't-2', 't-3']);
    });

    it('treats a missing is_tutor flag as tutor (legacy staff)', () => {
      const c = build();
      (c as unknown as { allStaff: Contact[] }).allStaff = [
        tutor({ id: 't-9', is_tutor: undefined }),
      ];
      (c as unknown as { selectedType: SessionType }).selectedType = SessionType.TUTORING;
      expect(c.tutors.map(t => t.id)).toEqual(['t-9']);
    });
  });

  describe('view mode (lead read-only)', () => {
    const viewSession = (): Session =>
      ({
        id: 's-9',
        type: SessionType.TUTORING,
        tutor_id: 'c-m1',
        tutor_name: 'Tess',
        student_id: 's-1',
        student_name: 'Kai',
        start_datetime: '2026-07-02T10:00:00',
        end_datetime: '2026-07-02T11:00:00',
        status: SessionStatus.COMPLETED,
        notes: 'went well',
      }) as Session;

    it('hydrates from the session but never loads staff or students', () => {
      const c = build({ type: 'view', session: viewSession() } as SessionDialogData);
      c.ngOnInit();
      expect(c.isReadOnly).toBe(true);
      // Leads 403 on the param-less students fetch; view mode must skip both.
      expect(contactService.getStaff).not.toHaveBeenCalled();
      expect(studentService.getStudents).not.toHaveBeenCalled();
      expect(c.selectedTutor).toBe('c-m1');
      expect(c.selectedStudent).toBe('s-1');
      expect(c.selectedAttendance).toBe(SessionStatus.COMPLETED);
      expect(c.notes).toBe('went well');
    });

    it('edit mode still loads staff and students (regression)', () => {
      contactService.getStaff.mockReturnValue(of([tutor()]));
      studentService.getStudents.mockReturnValue(of([student()]));
      const c = build({
        type: 'edit',
        session: viewSession(),
        existingSessions: [],
      } as SessionDialogData);
      c.ngOnInit();
      expect(c.isReadOnly).toBe(false);
      expect(contactService.getStaff).toHaveBeenCalled();
      expect(studentService.getStudents).toHaveBeenCalled();
    });

    it('is not status-locked in view mode (the disable comes from isReadOnly)', () => {
      const c = build({ type: 'view', session: viewSession() } as SessionDialogData);
      c.ngOnInit();
      expect(c.isStatusLocked).toBe(false);
      expect(c.isReadOnly).toBe(true);
    });

    // Rendered against the template: pins the view title, the disabled state
    // of every control, the denormalized tutor/student text fields, and the
    // Close-only action row (no e2e exercises this dialog).
    it('renders every control disabled with a Close-only action row', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [SessionDialog],
        providers: [
          provideNoopAnimations(),
          { provide: MAT_DIALOG_DATA, useValue: { type: 'view', session: viewSession() } },
          { provide: MatDialogRef, useValue: dialogRef },
          { provide: SessionsService, useValue: sessionsService },
          { provide: ContactService, useValue: contactService },
          { provide: StudentService, useValue: studentService },
          { provide: AuthService, useValue: authService },
        { provide: PackageService, useValue: packageServiceStub },
        ],
      });
      const fixture = TestBed.createComponent(SessionDialog);
      fixture.detectChanges();
      // NgModel applies [disabled] via setDisabledState on the next tick.
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('h2')?.textContent).toContain('View Session');
      // Denormalized names render as disabled text inputs.
      const textInputs = Array.from(el.querySelectorAll('input[disabled]'));
      const values = textInputs.map(i => (i as HTMLInputElement).value);
      expect(values).toContain('Tess');
      expect(values).toContain('Kai');
      // Notes disabled; every select disabled.
      const notesArea = el.querySelector('textarea') as HTMLTextAreaElement;
      expect(notesArea.disabled).toBe(true);
      const selects = Array.from(el.querySelectorAll('mat-select'));
      expect(selects.length).toBeGreaterThan(0);
      selects.forEach(sel =>
        expect(sel.getAttribute('aria-disabled')).toBe('true'));
      // Close-only actions: one button, no Update/Create/Confirm.
      const buttons = Array.from(el.querySelectorAll('mat-dialog-actions button'))
        .map(b => b.textContent?.trim());
      expect(buttons).toEqual(['Close']);
    });
  });

  describe('tutor self-edit student handling', () => {
    it('a non-admin loads only their own assigned students', () => {
      isAdmin = false;
      ownContactId = 'c-self';
      contactService.getStaff.mockReturnValue(of([]));
      studentService.getStudentsByTutor.mockReturnValue(
        of([student({ assigned_tutor_id: 'c-self' })]),
      );
      const c = build({
        type: 'edit',
        session: { id: 's-1', tutor_id: 'c-self', start_datetime: '2026-06-01T10:00:00', end_datetime: '2026-06-01T11:00:00' } as Session,
        existingSessions: [],
      } as SessionDialogData);
      c.ngOnInit();
      expect(studentService.getStudentsByTutor).toHaveBeenCalledWith('c-self');
      expect(studentService.getStudents).not.toHaveBeenCalled();
      expect(c.students).toHaveLength(1);
    });

    it('an admin still loads the full student list', () => {
      contactService.getStaff.mockReturnValue(of([]));
      studentService.getStudents.mockReturnValue(of([student()]));
      const c = build({
        type: 'edit',
        session: { id: 's-1', start_datetime: '2026-06-01T10:00:00', end_datetime: '2026-06-01T11:00:00' } as Session,
        existingSessions: [],
      } as SessionDialogData);
      c.ngOnInit();
      expect(studentService.getStudents).toHaveBeenCalled();
      expect(studentService.getStudentsByTutor).not.toHaveBeenCalled();
    });

    it('a missed lookup preserves the stored names instead of writing Unnamed student', () => {
      isAdmin = false;
      ownContactId = 'c-self';
      sessionsService.updateSession.mockReturnValue(of({}));
      // Round-trippable instants: hydration + scheduleFieldsUnchanged compare
      // via toISOString, so the stored strings must be exact ISO output.
      const startIso = new Date(2026, 5, 1, 10, 0).toISOString();
      const endIso = new Date(2026, 5, 1, 11, 0).toISOString();
      const stored = {
        id: 's-1',
        type: SessionType.TUTORING,
        tutor_id: 'c-self',
        tutor_name: 'Tess',
        student_id: 'stu-1',
        student_name: 'Kai Kid',
        series_id: 'series-1', // skips the extra-session schedule gate
        start_datetime: startIso,
        end_datetime: endIso,
        status: SessionStatus.PENDING,
        notes: '',
      } as Session;
      const c = build({ type: 'edit', session: stored, existingSessions: [] } as SessionDialogData);
      c.ngOnInit();
      // Both lists empty — the tutor-role staff projection carries no
      // accepting flag (tutors getter filters everyone out) and the student
      // fetch may have failed. The save must fall back to the stored values.
      (c as unknown as { allStaff: Contact[] }).allStaff = [];
      c.students = [];
      c.updateSession();
      expect(sessionsService.updateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tutor_id: 'c-self',
          tutor_name: 'Tess',
          student_id: 'stu-1',
          student_name: 'Kai Kid',
        }),
      );
      const sent = sessionsService.updateSession.mock.calls.at(-1)![0] as Session;
      expect(sent.student_name).not.toBe('Unnamed student');
    });

    it('a successful lookup still writes the fresh display name', () => {
      sessionsService.updateSession.mockReturnValue(of({}));
      contactService.getStaff.mockReturnValue(of([tutor()]));
      studentService.getStudents.mockReturnValue(of([student({ name: 'Pat' })]));
      const startIso = new Date(2026, 5, 1, 10, 0).toISOString();
      const endIso = new Date(2026, 5, 1, 11, 0).toISOString();
      const stored = {
        id: 's-1',
        type: SessionType.TUTORING,
        tutor_id: 't-1',
        tutor_name: 'Old Name',
        student_id: 's-1',
        student_name: 'Old Student',
        series_id: 'series-1',
        start_datetime: startIso,
        end_datetime: endIso,
        status: SessionStatus.PENDING,
        notes: '',
      } as Session;
      const c = build({ type: 'edit', session: stored, existingSessions: [] } as SessionDialogData);
      c.ngOnInit();
      c.updateSession();
      expect(sessionsService.updateSession).toHaveBeenCalledWith(
        expect.objectContaining({ tutor_name: 'Tess', student_name: 'Pat' }),
      );
    });
  });
});
