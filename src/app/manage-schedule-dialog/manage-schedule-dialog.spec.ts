import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {ManageScheduleDialog, ManageScheduleDialogData} from './manage-schedule-dialog';
import {ScheduleService} from '../services/schedule.service';
import {StudentService} from '../services/student.service';
import {ContactService} from '../services/contact.service';
import {AuthService} from '../services/auth.service';
import {Student} from '../models/student.model';
import {Contact} from '../models/contact.model';
import {ScheduleSlot} from '../utils/proration';
import {Weekday} from '../enums/weekday.enum';
import {PackageService} from '../services/package.service';
import {TEST_CATALOG_ROWS} from '../../testing/package-catalog.fixture';

const def = {monthlyCost: 728, sessionsPerWeek: 2, sessionLengthMin: 60};
const tutor = {id: 't-1', first_name: 'Tess'} as Contact;
const slots: ScheduleSlot[] = [
  {weekday: Weekday.MONDAY, start_time: '10:00', end_time: '11:00'},
  {weekday: Weekday.WEDNESDAY, start_time: '10:00', end_time: '11:00'},
];

describe('ManageScheduleDialog', () => {
  let isAdmin: boolean;
  const dialogRef = {close: jest.fn()};
  const scheduleService = {
    resolveDef: jest.fn(),
    timeStringToMinutes: jest.fn((time: string) => {
      const [h, m] = (time ?? '').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    }),
    addMinutesToTime: jest.fn().mockReturnValue('11:00'),
    buildOccurrences: jest.fn().mockReturnValue([{}]),
    findAvailabilityFailures: jest.fn().mockReturnValue([]),
    createSchedule: jest.fn(),
    updateSchedule: jest.fn(),
    deleteSchedule: jest.fn(),
  };
  const authService = {isAdmin: () => isAdmin};
  const studentService = {updateStudent: jest.fn()};
  const contactService = {getStaff: jest.fn(), getContact: jest.fn()};
  const packageService = {getPackages: () => of(TEST_CATALOG_ROWS)};

  const build = (data: ManageScheduleDialogData): ManageScheduleDialog => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ManageScheduleDialog],
      providers: [
        {provide: MAT_DIALOG_DATA, useValue: data},
        {provide: MatDialogRef, useValue: dialogRef},
        {provide: ScheduleService, useValue: scheduleService},
        {provide: StudentService, useValue: studentService},
        {provide: ContactService, useValue: contactService},
        {provide: AuthService, useValue: authService},
        {provide: PackageService, useValue: packageService},
      ],
    });
    const c = TestBed.createComponent(ManageScheduleDialog).componentInstance;
    c.ngOnInit();
    return c;
  };

  /** A create-mode dialog with valid, filled slots ready to save. */
  const primedCreate = (): ManageScheduleDialog => {
    const c = build({student: {id: 's-1', name: 'Pat', package: 'Determination'} as Student, tutor});
    c.scheduleSlots = [
      {weekday: Weekday.MONDAY, start_time: '10:00', tutor_id: null},
      {weekday: Weekday.WEDNESDAY, start_time: '10:00', tutor_id: null},
    ];
    return c;
  };

  beforeEach(() => {
    isAdmin = true;
    jest.clearAllMocks();
    scheduleService.resolveDef.mockReturnValue(def);
    scheduleService.addMinutesToTime.mockReturnValue('11:00');
    scheduleService.buildOccurrences.mockReturnValue([{}]);
    scheduleService.findAvailabilityFailures.mockReturnValue([]);
    contactService.getStaff.mockReturnValue(of([]));
    contactService.getContact.mockReturnValue(of([]));
  });

  describe('ngOnInit', () => {
    it('seeds blank slots for a new schedule (create mode)', () => {
      const c = build({student: {name: 'Pat', package: 'Determination'} as Student, tutor});
      expect(c.isEdit).toBe(false);
      expect(c.scheduleSlots).toHaveLength(2); // sessionsPerWeek
      expect(c.startDate).toBeInstanceOf(Date);
      expect(c.autoRenew).toBe(true);
    });

    it('pre-seeds slots from an existing schedule (edit mode)', () => {
      const c = build({student: {name: 'Pat', package: 'Determination', schedule: slots, auto_renew: false} as Student, tutor});
      expect(c.isEdit).toBe(true);
      expect(c.scheduleSlots).toEqual([
        {weekday: Weekday.MONDAY, start_time: '10:00', tutor_id: null, length_min: null},
        {weekday: Weekday.WEDNESDAY, start_time: '10:00', tutor_id: null, length_min: null},
      ]);
      expect(c.autoRenew).toBe(false);
    });
  });

  describe('save validation', () => {
    it('blocks when the package is unconfigured', () => {
      scheduleService.resolveDef.mockReturnValue(null);
      const c = build({student: {name: 'Pat', package: 'Custom'} as Student, tutor});
      c.save();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain("isn't configured");
    });

    it('blocks when no tutor is assigned', () => {
      const c = primedCreate();
      c.tutor = undefined;
      c.save();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('Assign a tutor');
    });

    it('blocks when the slot count does not match the package', () => {
      const c = primedCreate();
      c.scheduleSlots = [{weekday: Weekday.MONDAY, start_time: '10:00'}];
      c.save();
      expect(c.errorMessage).toContain('requires 2');
    });

    it('blocks when a slot is missing a day or time', () => {
      const c = primedCreate();
      c.scheduleSlots = [
        {weekday: Weekday.MONDAY, start_time: ''},
        {weekday: null, start_time: '10:00'},
      ];
      c.save();
      expect(c.errorMessage).toContain('day and start time');
    });

    it('blocks when a start date is missing in create mode', () => {
      const c = primedCreate();
      c.startDate = undefined;
      c.save();
      expect(c.errorMessage).toContain('start date');
    });
  });

  describe('save', () => {
    it('creates a new schedule and closes with the updated student', () => {
      const updated = {id: 's-1', schedule: slots} as Student;
      scheduleService.createSchedule.mockReturnValue(of(updated));
      const c = primedCreate();
      c.autoRenew = true;
      c.save();
      expect(scheduleService.createSchedule).toHaveBeenCalled();
      const args = scheduleService.createSchedule.mock.calls.at(-1)!;
      expect(args[2]).toHaveLength(2); // finalized slots
      expect(args[2][0].end_time).toBe('11:00');
      expect(dialogRef.close).toHaveBeenCalledWith(updated);
    });

    it('updates an existing schedule via updateSchedule', () => {
      const updated = {id: 's-1', schedule: slots} as Student;
      scheduleService.updateSchedule.mockReturnValue(of(updated));
      const c = build({student: {id: 's-1', name: 'Pat', package: 'Determination', schedule: slots} as Student, tutor});
      c.save();
      expect(scheduleService.updateSchedule).toHaveBeenCalled();
      expect(scheduleService.createSchedule).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(updated);
    });

    it('surfaces a create error', () => {
      scheduleService.createSchedule.mockReturnValue(throwError(() => new Error('x')));
      const c = primedCreate();
      c.save();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('Creating the schedule failed');
    });

    it('surfaces an update error', () => {
      scheduleService.updateSchedule.mockReturnValue(throwError(() => new Error('x')));
      const c = build({student: {id: 's-1', name: 'Pat', package: 'Determination', schedule: slots} as Student, tutor});
      c.save();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('Updating the schedule failed');
    });
  });

  describe('availability gate', () => {
    it('asks an admin to confirm an out-of-availability schedule, then persists', () => {
      scheduleService.findAvailabilityFailures.mockReturnValue([{}, {}]);
      scheduleService.createSchedule.mockReturnValue(of({} as Student));
      const c = primedCreate();
      c.save();
      expect(c.showAvailabilityConfirm).toBe(true);
      expect(c.availabilityFailCount).toBe(2);
      expect(scheduleService.createSchedule).not.toHaveBeenCalled();

      c.confirmAvailabilityOverride();
      expect(scheduleService.createSchedule).toHaveBeenCalled();
    });

    it('falls back to "this tutor" when the tutor has no first name', () => {
      scheduleService.findAvailabilityFailures.mockReturnValue([{}]);
      const c = primedCreate();
      c.tutor = {id: 't-1'} as Contact; // no first_name
      c.save();
      expect(c.availabilityTutorName).toBe('this tutor');
    });

    it('hard-blocks a non-admin tutor on out-of-availability occurrences', () => {
      isAdmin = false;
      scheduleService.findAvailabilityFailures.mockReturnValue([{}]);
      const c = primedCreate();
      c.save();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('availability');
      expect(scheduleService.createSchedule).not.toHaveBeenCalled();
    });

    it('cancelling the override clears the prompt without saving', () => {
      scheduleService.findAvailabilityFailures.mockReturnValue([{}]);
      const c = primedCreate();
      c.save();
      c.cancelAvailabilityOverride();
      expect(c.showAvailabilityConfirm).toBe(false);
      expect(scheduleService.createSchedule).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('confirms then deletes the schedule, closing with the cleared student', () => {
      const cleared = {id: 's-1', schedule: []} as Student;
      scheduleService.deleteSchedule.mockReturnValue(of(cleared));
      const c = build({student: {id: 's-1', name: 'Pat', package: 'Determination', schedule: slots} as Student, tutor});
      c.requestDelete();
      expect(c.showDeleteConfirm).toBe(true);
      c.confirmDelete();
      expect(scheduleService.deleteSchedule).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(cleared);
    });

    it('cancelling delete keeps the schedule', () => {
      const c = build({student: {id: 's-1', name: 'Pat', package: 'Determination', schedule: slots} as Student, tutor});
      c.requestDelete();
      c.cancelDelete();
      expect(c.showDeleteConfirm).toBe(false);
      expect(scheduleService.deleteSchedule).not.toHaveBeenCalled();
    });

    it('surfaces a delete error', () => {
      scheduleService.deleteSchedule.mockReturnValue(throwError(() => new Error('x')));
      const c = build({student: {id: 's-1', name: 'Pat', package: 'Determination', schedule: slots} as Student, tutor});
      c.requestDelete();
      c.confirmDelete();
      expect(c.hasError).toBe(true);
      expect(c.errorMessage).toContain('Deleting the schedule failed');
    });
  });

  it('cancel closes the dialog with no result', () => {
    const c = primedCreate();
    c.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  describe('pending mode (scheduled package change)', () => {
    // Pending Achieve = 3×30min sessions/week; current Determination = 2×60.
    const pendingStudent = (over: Partial<Student> = {}): Student => ({
      id: 's-1',
      name: 'Pat',
      package: 'Determination',
      schedule: [
        {weekday: Weekday.MONDAY, start_time: '10:00', end_time: '11:00'},
        {weekday: Weekday.WEDNESDAY, start_time: '10:00', end_time: '11:00'},
      ],
      auto_renew: true,
      pending_package: 'Achieve',
      pending_package_effective: '2026-09-01',
      ...over,
    } as Student);

    const primedPending = (over: Partial<Student> = {}): ManageScheduleDialog => {
      const c = build({student: pendingStudent(over), tutor, pendingMode: true});
      c.scheduleSlots = [
        {weekday: Weekday.MONDAY, start_time: '09:00', tutor_id: null},
        {weekday: Weekday.TUESDAY, start_time: '09:00', tutor_id: null},
        {weekday: Weekday.THURSDAY, start_time: '09:00', tutor_id: null},
      ];
      return c;
    };

    beforeEach(() => {
      studentService.updateStudent.mockReturnValue(of({}));
      scheduleService.addMinutesToTime.mockReturnValue('09:30');
    });

    it('resolves the def from the PENDING package, not the current one', () => {
      const c = build({student: pendingStudent(), tutor, pendingMode: true});
      expect(scheduleService.resolveDef).not.toHaveBeenCalled();
      expect(c.def).toEqual({monthlyCost: 546, sessionsPerWeek: 3, sessionLengthMin: 30});
      // Seeded to the pending def's slot count with blank rows.
      expect(c.scheduleSlots).toHaveLength(3);
    });

    it('seeds from an existing pending_schedule', () => {
      const c = build({
        student: pendingStudent({
          pending_schedule: [
            {weekday: Weekday.FRIDAY, start_time: '14:00', end_time: '14:30'},
          ],
        }),
        tutor,
        pendingMode: true,
      });
      expect(c.scheduleSlots[0]).toEqual(
        {weekday: Weekday.FRIDAY, start_time: '14:00', tutor_id: null, length_min: null});
      expect(c.scheduleSlots).toHaveLength(3); // padded to the pending def
    });

    it('validates the slot count against the pending package', () => {
      const c = build({student: pendingStudent(), tutor, pendingMode: true});
      c.scheduleSlots = [{weekday: Weekday.MONDAY, start_time: '09:00', tutor_id: null}];
      c.save();
      expect(c.errorMessage).toBe('Achieve requires 3 session(s) per week.');
      expect(studentService.updateStudent).not.toHaveBeenCalled();
    });

    it('saves ONLY pending_schedule — no sessions, no live-schedule fields', () => {
      const c = primedPending();
      c.save();
      expect(studentService.updateStudent).toHaveBeenCalledTimes(1);
      const payload = studentService.updateStudent.mock.calls[0][0] as Student;
      expect(payload.pending_schedule).toEqual([
        {weekday: Weekday.MONDAY, start_time: '09:00', end_time: '09:30'},
        {weekday: Weekday.TUESDAY, start_time: '09:00', end_time: '09:30'},
        {weekday: Weekday.THURSDAY, start_time: '09:00', end_time: '09:30'},
      ]);
      // The live schedule and its owners are untouched.
      expect(payload.schedule).toEqual(pendingStudent().schedule);
      expect(payload.auto_renew).toBe(true);
      expect(scheduleService.createSchedule).not.toHaveBeenCalled();
      expect(scheduleService.updateSchedule).not.toHaveBeenCalled();
      expect(scheduleService.deleteSchedule).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(
        expect.objectContaining({pending_schedule: payload.pending_schedule}),
      );
    });

    it('anchors the availability check at the effective date', () => {
      const c = primedPending();
      c.save();
      const anchor = scheduleService.buildOccurrences.mock.calls.at(-1)![1] as Date;
      expect(anchor.getFullYear()).toBe(2026);
      expect(anchor.getMonth()).toBe(8); // September
      expect(anchor.getDate()).toBe(1);
    });

    it('availability failures surface the admin override, then save', () => {
      scheduleService.findAvailabilityFailures.mockReturnValueOnce([{}, {}]);
      isAdmin = true;
      const c = primedPending();
      c.save();
      expect(c.showAvailabilityConfirm).toBe(true);
      expect(studentService.updateStudent).not.toHaveBeenCalled();
      c.confirmAvailabilityOverride();
      expect(studentService.updateStudent).toHaveBeenCalledTimes(1);
    });

    it('does not require a start date in pending mode', () => {
      const c = primedPending();
      c.startDate = undefined;
      c.save();
      expect(studentService.updateStudent).toHaveBeenCalled();
      expect(c.hasError).toBe(false);
    });

    it('falls back to today as the availability anchor when the effective date is malformed', () => {
      const c = primedPending({pending_package_effective: 'garbage'});
      c.save();
      const anchor = scheduleService.buildOccurrences.mock.calls.at(-1)![1] as Date;
      expect(anchor.toDateString()).toBe(new Date().toDateString());
      expect(studentService.updateStudent).toHaveBeenCalled();
    });

    it('surfaces a failed pending save and stays open', () => {
      studentService.updateStudent.mockReturnValue(throwError(() => new Error('boom')));
      const c = primedPending();
      c.save();
      expect(c.errorMessage).toBe('Saving the pending schedule failed.');
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('an unconfigured pending CUSTOM blocks with the package error', () => {
      const c = build({
        student: pendingStudent({pending_package: 'Custom'}),
        tutor,
        pendingMode: true,
      });
      expect(c.def).toBeNull();
      c.save();
      expect(c.hasError).toBe(true);
      expect(studentService.updateStudent).not.toHaveBeenCalled();
    });
  });

  describe('per-slot tutors', () => {
    const maria = {id: 't-2', first_name: 'Maria', last_name: 'Cruz',
      status: 'Staff', service: 'Hiring', is_tutor: true} as Contact;
    const former = {id: 't-old', first_name: 'Gone'} as Contact;

    beforeEach(() => {
      contactService.getStaff.mockReturnValue(of([
        maria,
        {id: 't-x', first_name: 'NotTutor', status: 'Staff', service: 'Hiring', is_tutor: false} as Contact,
        {id: 't-y', first_name: 'Left', status: 'Former Staff', service: 'Hiring'} as Contact,
      ]));
      scheduleService.updateSchedule.mockReturnValue(of({} as Student));
      scheduleService.createSchedule.mockReturnValue(of({} as Student));
    });

    it('offers only active tutors as overrides', () => {
      const c = primedCreate();
      expect(c.tutorOptions.map(t => t.id)).toEqual(['t-2']);
    });

    it('fetches a former slot tutor individually so their override renders', () => {
      contactService.getContact.mockReturnValue(of([former]));
      const c = build({
        student: {
          id: 's-1', name: 'Pat', package: 'Determination',
          schedule: [
            {weekday: Weekday.MONDAY, start_time: '10:00', end_time: '11:00', tutor_id: 't-old'},
            {weekday: Weekday.WEDNESDAY, start_time: '10:00', end_time: '11:00'},
          ],
        } as Student,
        tutor,
      });
      expect(contactService.getContact).toHaveBeenCalledWith('t-old');
      expect(c.tutorOptions.some(t => t.id === 't-old')).toBe(true);
      expect(c.scheduleSlots[0].tutor_id).toBe('t-old');
    });

    it('save includes tutor_id only when set — a null override omits the key', () => {
      const c = build({
        student: {
          id: 's-1', name: 'Pat', package: 'Determination',
          schedule: [
            {weekday: Weekday.MONDAY, start_time: '10:00', end_time: '11:00'},
            {weekday: Weekday.WEDNESDAY, start_time: '10:00', end_time: '11:00'},
          ],
        } as Student,
        tutor,
      });
      c.scheduleSlots[1].tutor_id = 't-2';
      c.save();
      const slotsArg = scheduleService.updateSchedule.mock.calls.at(-1)![2] as ScheduleSlot[];
      // Nested null is rejected by dynamoose — the key must be ABSENT.
      expect('tutor_id' in (slotsArg[0] as object)).toBe(false);
      expect(slotsArg[1].tutor_id).toBe('t-2');
      // The resolvable-staff map rides along for denormalized names.
      const mapArg = scheduleService.updateSchedule.mock.calls.at(-1)![4] as Map<string, Contact>;
      expect(mapArg.get('t-2')).toBe(maria);
    });

    it('availability failures report per effective tutor', () => {
      isAdmin = true;
      scheduleService.findAvailabilityFailures
        .mockReturnValueOnce([])        // primary group passes
        .mockReturnValueOnce([{}, {}]); // Maria's group fails twice
      const c = primedCreate();
      c.scheduleSlots[1].tutor_id = 't-2';
      c.save();
      expect(c.showAvailabilityConfirm).toBe(true);
      expect(c.availabilityMessage).toBe("2 session(s) fall outside Maria's availability");
      expect(scheduleService.findAvailabilityFailures).toHaveBeenCalledTimes(2);
      // Confirm proceeds through the same override flow.
      c.confirmAvailabilityOverride();
      expect(scheduleService.createSchedule).toHaveBeenCalled();
    });

    it('non-admins hard-fail on a secondary tutor availability clash', () => {
      isAdmin = false;
      scheduleService.findAvailabilityFailures
        .mockReturnValueOnce([])
        .mockReturnValueOnce([{}]);
      const c = primedCreate();
      c.scheduleSlots[1].tutor_id = 't-2';
      c.save();
      expect(c.showAvailabilityConfirm).toBe(false);
      expect(c.errorMessage).toBe("1 session(s) fall outside Maria's availability.");
      expect(scheduleService.createSchedule).not.toHaveBeenCalled();
    });

    it('pending mode carries slot tutors into pending_schedule', () => {
      studentService.updateStudent.mockReturnValue(of({}));
      scheduleService.addMinutesToTime.mockReturnValue('09:30');
      const c = build({
        student: {
          id: 's-1', name: 'Pat', package: 'Determination',
          pending_package: 'Achieve',
          pending_package_effective: '2026-09-01',
        } as Student,
        tutor,
        pendingMode: true,
      });
      c.scheduleSlots = [
        {weekday: Weekday.MONDAY, start_time: '09:00', tutor_id: 't-2'},
        {weekday: Weekday.TUESDAY, start_time: '09:00', tutor_id: null},
        {weekday: Weekday.THURSDAY, start_time: '09:00', tutor_id: null},
      ];
      c.save();
      const payload = studentService.updateStudent.mock.calls[0][0] as Student;
      expect(payload.pending_schedule![0].tutor_id).toBe('t-2');
      expect('tutor_id' in (payload.pending_schedule![1] as object)).toBe(false);
    });
  });

  describe('per-slot lengths (CUSTOM packages)', () => {
    const customStudent = (over: Partial<Student> = {}): Student => ({
      id: 's-1', name: 'Pat', package: 'Custom',
      custom_monthly_cost: 400, custom_sessions_per_week: 2, custom_session_length_min: 30,
      ...over,
    } as Student);
    const customDef = {monthlyCost: 400, sessionsPerWeek: 2, sessionLengthMin: 30};

    beforeEach(() => {
      scheduleService.resolveDef.mockReturnValue(customDef);
      scheduleService.addMinutesToTime.mockImplementation(
        (start: string, minutes: number) => {
          const [h, m] = start.split(':').map(Number);
          const total = h * 60 + m + minutes;
          return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
        });
      scheduleService.updateSchedule.mockReturnValue(of({} as Student));
      scheduleService.createSchedule.mockReturnValue(of({} as Student));
    });

    it('saves each slot with its own length, default when unset', () => {
      const c = build({student: customStudent(), tutor});
      c.scheduleSlots = [
        {weekday: Weekday.MONDAY, start_time: '10:00', tutor_id: null, length_min: 45},
        {weekday: Weekday.WEDNESDAY, start_time: '10:00', tutor_id: null, length_min: null},
      ];
      c.save();
      const slotsArg = scheduleService.createSchedule.mock.calls.at(-1)![2] as ScheduleSlot[];
      expect(slotsArg[0].end_time).toBe('10:45'); // per-slot 45
      expect(slotsArg[1].end_time).toBe('10:30'); // default 30
    });

    it("derives an existing slot's length on load, null when it matches the default", () => {
      const c = build({
        student: customStudent({
          schedule: [
            {weekday: Weekday.MONDAY, start_time: '10:00', end_time: '10:45'},
            {weekday: Weekday.WEDNESDAY, start_time: '10:00', end_time: '10:30'},
          ],
        }),
        tutor,
      });
      expect(c.scheduleSlots[0].length_min).toBe(45);
      expect(c.scheduleSlots[1].length_min).toBeNull(); // equals the default
    });

    it('fixed packages ignore any stray length and always use the package length', () => {
      scheduleService.resolveDef.mockReturnValue(def); // Determination 60 min
      const c = build({student: {id: 's-1', name: 'Pat', package: 'Determination',
        schedule: slots} as Student, tutor});
      expect(c.isCustomPackage).toBe(false);
      c.scheduleSlots[0].length_min = 45; // not reachable via UI; must be inert
      c.save();
      const slotsArg = scheduleService.updateSchedule.mock.calls.at(-1)![2] as ScheduleSlot[];
      expect(slotsArg[0].end_time).toBe('11:00'); // 60-min package length
    });

    it('pending mode offers per-slot lengths when the PENDING package is CUSTOM', () => {
      studentService.updateStudent.mockReturnValue(of({}));
      const c = build({
        student: customStudent({
          package: 'Determination',
          pending_package: 'Custom',
          pending_custom_monthly_cost: 400,
          pending_custom_sessions_per_week: 2,
          pending_custom_session_length_min: 30,
          pending_package_effective: '2026-10-01',
        }),
        tutor,
        pendingMode: true,
      });
      expect(c.isCustomPackage).toBe(true);
      c.scheduleSlots = [
        {weekday: Weekday.MONDAY, start_time: '09:00', tutor_id: null, length_min: 45},
        {weekday: Weekday.TUESDAY, start_time: '09:00', tutor_id: null, length_min: null},
      ];
      c.save();
      const payload = studentService.updateStudent.mock.calls[0][0] as Student;
      expect(payload.pending_schedule![0].end_time).toBe('09:45');
      expect(payload.pending_schedule![1].end_time).toBe('09:30');
    });
  });
});
