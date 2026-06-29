import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {ScheduleService} from './schedule.service';
import {SessionsService} from './sessions.service';
import {StudentService} from './student.service';
import {Student} from '../models/student.model';
import {Contact} from '../models/contact.model';
import {Session} from '../models/session.model';
import {ScheduleSlot} from '../utils/proration';
import {Weekday} from '../enums/weekday.enum';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';
import {Package} from '../enums/package.enum';
import {Status} from '../enums/status.enum';

const tutor = (over: Partial<Contact> = {}): Contact =>
  ({
    id: 't-1',
    first_name: 'Tess',
    status: Status.STAFF,
    availability: [{days: Object.values(Weekday), start_time: '09:00', end_time: '17:00'}],
    ...over,
  }) as Contact;

const student = (over: Partial<Student> = {}): Student =>
  ({
    id: 's-1',
    name: 'Pat',
    status: Status.ACTIVE_STUDENT,
    assigned_tutor_id: 't-1',
    package: Package.DETERMINATION, // 2/week, 60 min
    make_up_minutes: 0,
    ...over,
  }) as Student;

const slots: ScheduleSlot[] = [
  {weekday: Weekday.MONDAY, start_time: '10:00', end_time: '11:00'},
  {weekday: Weekday.WEDNESDAY, start_time: '10:00', end_time: '11:00'},
];

describe('ScheduleService', () => {
  const sessionsService = {
    createSessions: jest.fn(),
    getSessionsByStudent: jest.fn(),
    deleteSession: jest.fn(),
  };
  const studentService = {updateStudent: jest.fn()};
  let service: ScheduleService;

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        ScheduleService,
        {provide: SessionsService, useValue: sessionsService},
        {provide: StudentService, useValue: studentService},
      ],
    });
    service = TestBed.inject(ScheduleService);
  });

  describe('time helpers', () => {
    it('converts HH:mm to minutes (and tolerates blanks)', () => {
      expect(service.timeStringToMinutes('10:30')).toBe(630);
      expect(service.timeStringToMinutes('00:00')).toBe(0);
      expect(service.timeStringToMinutes('')).toBe(0);
    });

    it('adds minutes to a time, wrapping the day', () => {
      expect(service.addMinutesToTime('10:00', 60)).toBe('11:00');
      expect(service.addMinutesToTime('10:15', 50)).toBe('11:05');
      expect(service.addMinutesToTime('23:30', 60)).toBe('00:30');
    });

    it('sets a date to a given time', () => {
      const d = service.atTime(new Date(2026, 6, 1), '13:45');
      expect(d.getHours()).toBe(13);
      expect(d.getMinutes()).toBe(45);
      expect(d.getSeconds()).toBe(0);
    });

    it('formats a 12-hour label', () => {
      expect(service.formatTime12('10:00')).toBe('10:00 AM');
      expect(service.formatTime12('13:05')).toBe('1:05 PM');
      expect(service.formatTime12('00:30')).toBe('12:30 AM');
      expect(service.formatTime12('12:00')).toBe('12:00 PM');
    });
  });

  describe('package + summary', () => {
    it('resolves a configured package def', () => {
      expect(service.resolveDef(student())).toEqual({
        monthlyCost: 728, sessionsPerWeek: 2, sessionLengthMin: 60,
      });
    });

    it('returns null for an unconfigured custom package', () => {
      expect(service.resolveDef(student({package: Package.CUSTOM}))).toBeNull();
    });

    it('summarizes a schedule into day + time labels', () => {
      expect(service.scheduleSummary(slots)).toEqual(['Mon 10:00 AM', 'Wed 10:00 AM']);
      expect(service.scheduleSummary(undefined)).toEqual([]);
    });
  });

  describe('occurrence generation', () => {
    // July 2026: Mondays 6,13,20,27; Wednesdays 1,8,15,22,29.
    it('lists each weekday occurrence from the start through end of month', () => {
      const mondays = service.generateMonthOccurrences(new Date(2026, 6, 1), Weekday.MONDAY);
      expect(mondays.map(d => d.getDate())).toEqual([6, 13, 20, 27]);
      const weds = service.generateMonthOccurrences(new Date(2026, 6, 1), Weekday.WEDNESDAY);
      expect(weds.map(d => d.getDate())).toEqual([1, 8, 15, 22, 29]);
    });

    it('only counts occurrences on or after the start date', () => {
      const mondays = service.generateMonthOccurrences(new Date(2026, 6, 14), Weekday.MONDAY);
      expect(mondays.map(d => d.getDate())).toEqual([20, 27]);
    });

    it('builds occurrences across every slot', () => {
      const occ = service.buildOccurrences(slots, new Date(2026, 6, 1));
      expect(occ.length).toBe(9); // 4 Mondays + 5 Wednesdays
    });
  });

  describe('availability', () => {
    it('passes when the tutor has no availability set', () => {
      expect(service.isDateTimeWithinAvailability(tutor({availability: []}), new Date(2026, 6, 1), 600, 660)).toBe(true);
      expect(service.isDateTimeWithinAvailability(undefined, new Date(2026, 6, 1), 600, 660)).toBe(true);
    });

    it('passes inside and fails outside an availability block', () => {
      const t = tutor();
      expect(service.isDateTimeWithinAvailability(t, new Date(2026, 6, 1), 600, 660)).toBe(true); // 10–11
      expect(service.isDateTimeWithinAvailability(t, new Date(2026, 6, 1), 1080, 1140)).toBe(false); // 18–19
    });

    it('collects out-of-availability occurrences', () => {
      const lateSlots: ScheduleSlot[] = [
        {weekday: Weekday.MONDAY, start_time: '18:00', end_time: '19:00'},
        {weekday: Weekday.WEDNESDAY, start_time: '10:00', end_time: '11:00'},
      ];
      const occ = service.buildOccurrences(lateSlots, new Date(2026, 6, 1));
      const failures = service.findAvailabilityFailures(tutor(), occ);
      expect(failures.length).toBe(4); // the 4 Mondays at 18:00
      expect(failures.every(f => f.slot.start_time === '18:00')).toBe(true);
    });
  });

  describe('buildSessions', () => {
    it('builds pending tutoring sessions tagged with the series id', () => {
      const occ = service.buildOccurrences(slots, new Date(2026, 6, 1));
      const built = service.buildSessions(student(), tutor(), occ, 'series-x', 'hi');
      expect(built.length).toBe(9);
      const first = built[0];
      expect(first.type).toBe(SessionType.TUTORING);
      expect(first.status).toBe(SessionStatus.PENDING);
      expect(first.student_id).toBe('s-1');
      expect(first.tutor_id).toBe('t-1');
      expect(first.tutor_name).toBe('Tess');
      expect(first.series_id).toBe('series-x');
      expect(first.notes).toBe('hi');
      expect(new Date(first.start_datetime!).getHours()).toBe(10);
      expect(new Date(first.end_datetime!).getHours()).toBe(11);
    });
  });

  describe('createSchedule', () => {
    it('creates the month of sessions and persists the template, resolving the student', () => {
      sessionsService.createSessions.mockReturnValue(of({message: 'ok'}));
      studentService.updateStudent.mockReturnValue(of({} as Student));
      let result: Student | undefined;
      service.createSchedule(student(), tutor(), slots, new Date(2026, 6, 1), true).subscribe(s => (result = s));

      const created = sessionsService.createSessions.mock.calls.at(-1)![0] as Session[];
      expect(created.length).toBe(9);
      const seriesId = created[0].series_id;
      expect(created.every(s => s.series_id === seriesId)).toBe(true);

      const saved = studentService.updateStudent.mock.calls.at(-1)![0] as Student;
      expect(saved.schedule).toHaveLength(2);
      expect(saved.assigned_tutor_id).toBe('t-1');
      expect(saved.package_start_date).toContain('2026-07-01');
      expect(saved.auto_renew).toBe(true);
      expect(result).toBe(saved);
    });

    it('skips session creation when the month has no occurrences left', () => {
      studentService.updateStudent.mockReturnValue(of({} as Student));
      // July 31 2026 is a Friday — no Mon/Wed remain.
      service.createSchedule(student(), tutor(), slots, new Date(2026, 6, 31), false).subscribe();
      expect(sessionsService.createSessions).not.toHaveBeenCalled();
      expect(studentService.updateStudent).toHaveBeenCalled();
    });
  });

  describe('updateSchedule / deleteSchedule (clock pinned to 2026-07-01)', () => {
    beforeEach(() => jest.useFakeTimers().setSystemTime(new Date(2026, 6, 1, 9, 0, 0)));
    afterEach(() => jest.useRealTimers());

    const existing = (): Session[] => [
      {id: 'past', type: SessionType.TUTORING, status: SessionStatus.PENDING,
        series_id: 'old-series', start_datetime: new Date(2026, 5, 15, 10, 0).toISOString()} as Session,
      {id: 'future', type: SessionType.TUTORING, status: SessionStatus.PENDING,
        series_id: 'old-series', start_datetime: new Date(2026, 6, 8, 10, 0).toISOString()} as Session,
    ];

    it('deletes future-pending sessions, regenerates with the existing series id, and saves', () => {
      sessionsService.getSessionsByStudent.mockReturnValue(of(existing()));
      sessionsService.deleteSession.mockReturnValue(of({message: 'ok'}));
      sessionsService.createSessions.mockReturnValue(of({message: 'ok'}));
      studentService.updateStudent.mockReturnValue(of({} as Student));

      let result: Student | undefined;
      service.updateSchedule(student(), tutor(), slots, false).subscribe(s => (result = s));

      // Only the future session is deleted; the past one is kept.
      expect(sessionsService.deleteSession).toHaveBeenCalledTimes(1);
      expect(sessionsService.deleteSession).toHaveBeenCalledWith('future');
      // Regenerated sessions reuse the existing series id.
      const created = sessionsService.createSessions.mock.calls.at(-1)![0] as Session[];
      expect(created.every(s => s.series_id === 'old-series')).toBe(true);
      const saved = studentService.updateStudent.mock.calls.at(-1)![0] as Student;
      expect(saved.schedule).toHaveLength(2);
      expect(saved.auto_renew).toBe(false);
      expect(result).toBe(saved);
    });

    it('mints a new series id when no future-pending sessions exist', () => {
      sessionsService.getSessionsByStudent.mockReturnValue(of([existing()[0]])); // past only
      sessionsService.createSessions.mockReturnValue(of({message: 'ok'}));
      studentService.updateStudent.mockReturnValue(of({} as Student));

      service.updateSchedule(student(), tutor(), slots, true).subscribe();
      expect(sessionsService.deleteSession).not.toHaveBeenCalled();
      const created = sessionsService.createSessions.mock.calls.at(-1)![0] as Session[];
      expect(created[0].series_id).not.toBe('old-series');
    });

    it('deleteSchedule removes future-pending sessions and clears the template', () => {
      sessionsService.getSessionsByStudent.mockReturnValue(of(existing()));
      sessionsService.deleteSession.mockReturnValue(of({message: 'ok'}));
      studentService.updateStudent.mockReturnValue(of({} as Student));

      let result: Student | undefined;
      service.deleteSchedule(student({schedule: slots, auto_renew: true})).subscribe(s => (result = s));

      expect(sessionsService.deleteSession).toHaveBeenCalledTimes(1);
      expect(sessionsService.deleteSession).toHaveBeenCalledWith('future');
      const saved = studentService.updateStudent.mock.calls.at(-1)![0] as Student;
      expect(saved.schedule).toEqual([]); // empty array signals the backend to drop it
      expect(saved.auto_renew).toBe(false);
      expect(result!.schedule).toEqual([]);
    });

    it('deleteSchedule still clears the template when there are no sessions to remove', () => {
      sessionsService.getSessionsByStudent.mockReturnValue(of([]));
      studentService.updateStudent.mockReturnValue(of({} as Student));
      service.deleteSchedule(student({schedule: slots})).subscribe();
      expect(sessionsService.deleteSession).not.toHaveBeenCalled();
      expect(studentService.updateStudent).toHaveBeenCalled();
    });
  });

  it('propagates a session-creation error from createSchedule', () => {
    sessionsService.createSessions.mockReturnValue(throwError(() => new Error('x')));
    let errored = false;
    service.createSchedule(student(), tutor(), slots, new Date(2026, 6, 1), true)
      .subscribe({error: () => (errored = true)});
    expect(errored).toBe(true);
    expect(studentService.updateStudent).not.toHaveBeenCalled();
  });
});
