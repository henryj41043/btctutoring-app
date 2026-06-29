import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {ManageScheduleDialog, ManageScheduleDialogData} from './manage-schedule-dialog';
import {ScheduleService} from '../services/schedule.service';
import {AuthService} from '../services/auth.service';
import {Student} from '../models/student.model';
import {Contact} from '../models/contact.model';
import {ScheduleSlot} from '../utils/proration';
import {Weekday} from '../enums/weekday.enum';
import {Package} from '../enums/package.enum';

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
    addMinutesToTime: jest.fn().mockReturnValue('11:00'),
    buildOccurrences: jest.fn().mockReturnValue([{}]),
    findAvailabilityFailures: jest.fn().mockReturnValue([]),
    createSchedule: jest.fn(),
    updateSchedule: jest.fn(),
    deleteSchedule: jest.fn(),
  };
  const authService = {isAdmin: () => isAdmin};

  const build = (data: ManageScheduleDialogData): ManageScheduleDialog => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ManageScheduleDialog],
      providers: [
        {provide: MAT_DIALOG_DATA, useValue: data},
        {provide: MatDialogRef, useValue: dialogRef},
        {provide: ScheduleService, useValue: scheduleService},
        {provide: AuthService, useValue: authService},
      ],
    });
    const c = TestBed.createComponent(ManageScheduleDialog).componentInstance;
    c.ngOnInit();
    return c;
  };

  /** A create-mode dialog with valid, filled slots ready to save. */
  const primedCreate = (): ManageScheduleDialog => {
    const c = build({student: {id: 's-1', name: 'Pat', package: Package.DETERMINATION} as Student, tutor});
    c.scheduleSlots = [
      {weekday: Weekday.MONDAY, start_time: '10:00'},
      {weekday: Weekday.WEDNESDAY, start_time: '10:00'},
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
  });

  describe('ngOnInit', () => {
    it('seeds blank slots for a new schedule (create mode)', () => {
      const c = build({student: {name: 'Pat', package: Package.DETERMINATION} as Student, tutor});
      expect(c.isEdit).toBe(false);
      expect(c.scheduleSlots).toHaveLength(2); // sessionsPerWeek
      expect(c.startDate).toBeInstanceOf(Date);
      expect(c.autoRenew).toBe(true);
    });

    it('pre-seeds slots from an existing schedule (edit mode)', () => {
      const c = build({student: {name: 'Pat', package: Package.DETERMINATION, schedule: slots, auto_renew: false} as Student, tutor});
      expect(c.isEdit).toBe(true);
      expect(c.scheduleSlots).toEqual([
        {weekday: Weekday.MONDAY, start_time: '10:00'},
        {weekday: Weekday.WEDNESDAY, start_time: '10:00'},
      ]);
      expect(c.autoRenew).toBe(false);
    });
  });

  describe('save validation', () => {
    it('blocks when the package is unconfigured', () => {
      scheduleService.resolveDef.mockReturnValue(null);
      const c = build({student: {name: 'Pat', package: Package.CUSTOM} as Student, tutor});
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
      const c = build({student: {id: 's-1', name: 'Pat', package: Package.DETERMINATION, schedule: slots} as Student, tutor});
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
      const c = build({student: {id: 's-1', name: 'Pat', package: Package.DETERMINATION, schedule: slots} as Student, tutor});
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
      const c = build({student: {id: 's-1', name: 'Pat', package: Package.DETERMINATION, schedule: slots} as Student, tutor});
      c.requestDelete();
      expect(c.showDeleteConfirm).toBe(true);
      c.confirmDelete();
      expect(scheduleService.deleteSchedule).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(cleared);
    });

    it('cancelling delete keeps the schedule', () => {
      const c = build({student: {id: 's-1', name: 'Pat', package: Package.DETERMINATION, schedule: slots} as Student, tutor});
      c.requestDelete();
      c.cancelDelete();
      expect(c.showDeleteConfirm).toBe(false);
      expect(scheduleService.deleteSchedule).not.toHaveBeenCalled();
    });

    it('surfaces a delete error', () => {
      scheduleService.deleteSchedule.mockReturnValue(throwError(() => new Error('x')));
      const c = build({student: {id: 's-1', name: 'Pat', package: Package.DETERMINATION, schedule: slots} as Student, tutor});
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
});
