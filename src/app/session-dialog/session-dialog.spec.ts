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
import { Package } from '../enums/package.enum';

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
    package: Package.DETERMINATION, // 2 sessions/week, 60 min
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

      c.students = [student({ package: Package.CUSTOM })];
      expect(c.selectedPackageDef).toBeNull();

      c.students = [
        student({
          package: Package.CUSTOM,
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

    it('swallows tutor/student load errors', () => {
      contactService.getContacts.mockReturnValue(throwError(() => new Error('x')));
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
      c.students = [student({ package: Package.CUSTOM })]; // no overrides → def null
      c.endTime = new Date(2026, 5, 1, 12, 0); // 120 min, but no cap to enforce
      sessionsService.createSession.mockReturnValue(of({ id: 'ok' }));
      c.createSession();
      expect(sessionsService.createSession).toHaveBeenCalled();
    });
  });

  describe('createSchedule (monthly)', () => {
    // July 2026: 1st is a Wednesday. Mondays: 6,13,20,27. Wednesdays: 1,8,15,22,29.
    const primedSchedule = (over: Partial<Student> = {}): SessionDialog => {
      const c = primedCreate();
      c.students = [student(over)];
      c.date = new Date(2026, 6, 1);
      c.createScheduleMode = true;
      c.scheduleSlots = [
        { weekday: Weekday.MONDAY, start_time: '10:00' },
        { weekday: Weekday.WEDNESDAY, start_time: '10:00' },
      ];
      return c;
    };

    it('creates the month of sessions and persists the schedule on the student', () => {
      const c = primedSchedule();
      sessionsService.createSessions.mockReturnValue(of({ message: 'ok' }));
      studentService.updateStudent.mockReturnValue(of({} as Student));
      c.createSession(); // delegates to createSchedule

      expect(sessionsService.createSessions).toHaveBeenCalled();
      const created = sessionsService.createSessions.mock.calls.at(-1)![0] as Session[];
      expect(created.length).toBe(9); // 4 Mondays + 5 Wednesdays

      // Every generated session is a pending tutoring session for this
      // student/tutor, sharing one series id.
      const seriesId = created[0].series_id;
      expect(seriesId).toBeDefined();
      for (const s of created) {
        expect(s.type).toBe(SessionType.TUTORING);
        expect(s.status).toBe(SessionStatus.PENDING);
        expect(s.student_id).toBe('s-1');
        expect(s.tutor_id).toBe('t-1');
        expect(s.tutor_name).toBe('Tess');
        expect(s.series_id).toBe(seriesId);
      }
      // Occurrence counts per weekday and the exact session time window.
      const weekdays = created.map(s => new Date(s.start_datetime!).getDay());
      expect(weekdays.filter(d => d === 1)).toHaveLength(4); // Mondays
      expect(weekdays.filter(d => d === 3)).toHaveLength(5); // Wednesdays
      const first = created[0];
      expect(new Date(first.start_datetime!).getHours()).toBe(10);
      expect(new Date(first.start_datetime!).getMinutes()).toBe(0);
      // end = start + the package's 60-min session length.
      expect(new Date(first.end_datetime!).getHours()).toBe(11);
      expect(new Date(first.end_datetime!).getMinutes()).toBe(0);

      const saved = studentService.updateStudent.mock.calls.at(-1)![0] as Student;
      expect(saved.schedule).toHaveLength(2);
      expect(saved.schedule![0]).toEqual({
        weekday: Weekday.MONDAY, start_time: '10:00', end_time: '11:00',
      });
      expect(saved.assigned_tutor_id).toBe('t-1');
      expect(saved.package_start_date).toContain('2026-07-01');
      expect(saved.auto_renew).toBe(true);
      expect(dialogRef.close).toHaveBeenCalledWith({ created: 9 });
    });

    it('rejects when the slot count does not match the package', () => {
      const c = primedSchedule();
      c.scheduleSlots = [{ weekday: Weekday.MONDAY, start_time: '10:00' }]; // needs 2
      c.createSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('requires 2');
      expect(sessionsService.createSessions).not.toHaveBeenCalled();
    });

    it('rejects when a slot is missing a day or time', () => {
      const c = primedSchedule();
      c.scheduleSlots = [
        { weekday: Weekday.MONDAY, start_time: '' },
        { weekday: null, start_time: '10:00' },
      ];
      c.createSession();
      expect(c.errorMessage).toContain('day and start time');
    });

    it('rejects when the student package is not configured (custom)', () => {
      const c = primedSchedule({ package: Package.CUSTOM });
      c.scheduleSlots = [];
      c.createSession();
      expect(c.errorMessage).toContain("isn't configured");
    });

    it('rejects a schedule with no student', () => {
      const c = primedSchedule();
      c.selectedStudent = undefined;
      c.createSession();
      expect(c.errorMessage).toContain('select a student');
    });

    it('asks an admin to override out-of-availability occurrences, then creates', () => {
      const c = primedSchedule();
      c.scheduleSlots = [
        { weekday: Weekday.MONDAY, start_time: '18:00' },
        { weekday: Weekday.WEDNESDAY, start_time: '18:00' },
      ];
      c.createSession();
      expect(c.showAvailabilityConfirm).toBe(true);

      sessionsService.createSessions.mockReturnValue(of({ message: 'ok' }));
      studentService.updateStudent.mockReturnValue(of({} as Student));
      c.confirmAvailabilityOverride();
      expect(sessionsService.createSessions).toHaveBeenCalled();
    });

    it('hard-blocks a tutor on out-of-availability occurrences', () => {
      isAdmin = false;
      const c = primedSchedule();
      c.scheduleSlots = [
        { weekday: Weekday.MONDAY, start_time: '18:00' },
        { weekday: Weekday.WEDNESDAY, start_time: '18:00' },
      ];
      c.createSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('availability');
    });

    it('surfaces a schedule create error', () => {
      const c = primedSchedule();
      sessionsService.createSessions.mockReturnValue(throwError(() => new Error('x')));
      c.createSession();
      expect(c.hasError).toBe(true);
    });

    it('reseeds slot rows on student/mode change', () => {
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.students = [student()];
      c.createScheduleMode = true;
      c.onStudentChange('s-1');
      expect(c.scheduleSlots).toHaveLength(2); // Succeed = 2/week
      c.createScheduleMode = false;
      c.onScheduleModeChange();
      expect(c.scheduleSlots).toHaveLength(0);
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
      c.tutors = [tutor()];
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

    it('errors when the schedule has no occurrences left in the month', () => {
      const c = primedCreate();
      c.date = new Date(2026, 6, 31); // July 31 2026 (Friday) — no Mon/Wed remain
      c.createScheduleMode = true;
      c.scheduleSlots = [
        { weekday: Weekday.MONDAY, start_time: '10:00' },
        { weekday: Weekday.WEDNESDAY, start_time: '10:00' },
      ];
      c.createSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('no sessions');
    });

    it('seeds zero slots when the selected package is unconfigured', () => {
      const c = build({ type: 'create', session: new Session() } as SessionDialogData);
      c.students = [student({ package: Package.CUSTOM })];
      c.createScheduleMode = true;
      c.onStudentChange('s-1');
      expect(c.scheduleSlots).toHaveLength(0);
    });

    it('admin override confirm path creates the schedule', () => {
      const c = primedCreate();
      c.date = new Date(2026, 6, 1);
      c.createScheduleMode = true;
      c.scheduleSlots = [
        { weekday: Weekday.MONDAY, start_time: '18:00' },
        { weekday: Weekday.WEDNESDAY, start_time: '18:00' },
      ];
      c.createSession();
      expect(c.showAvailabilityConfirm).toBe(true);
      sessionsService.createSessions.mockReturnValue(of({ message: 'ok' }));
      studentService.updateStudent.mockReturnValue(of({} as Student));
      c.confirmAvailabilityOverride();
      expect(sessionsService.createSessions).toHaveBeenCalled();
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

    it('createSchedule requires a start date', () => {
      const c = primedCreate();
      c.createScheduleMode = true;
      c.scheduleSlots = [
        { weekday: Weekday.MONDAY, start_time: '10:00' },
        { weekday: Weekday.WEDNESDAY, start_time: '10:00' },
      ];
      c.date = undefined;
      c.createSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('start date');
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

    it('surfaces a schedule save failure after sessions are created', () => {
      const c = primedCreate();
      c.date = new Date(2026, 6, 1);
      c.createScheduleMode = true;
      c.scheduleSlots = [
        { weekday: Weekday.MONDAY, start_time: '10:00' },
        { weekday: Weekday.WEDNESDAY, start_time: '10:00' },
      ];
      sessionsService.createSessions.mockReturnValue(of({ message: 'ok' }));
      studentService.updateStudent.mockReturnValue(throwError(() => new Error('x')));
      c.createSession();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('saving the schedule failed');
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
});
