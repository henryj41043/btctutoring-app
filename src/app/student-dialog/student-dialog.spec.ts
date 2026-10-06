import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MakeupEditDialog } from '../makeup-edit-dialog/makeup-edit-dialog';
import { StudentDialog, StudentDialogData } from './student-dialog';
import { StudentService } from '../services/student.service';
import { ScheduleService } from '../services/schedule.service';
import { PackageService } from '../services/package.service';
import { BillingService } from '../services/billing.service';
import { statement, statementLine } from '../../testing/statement.fixture';
import { TEST_CATALOG_ROWS } from '../../testing/package-catalog.fixture';
import { changeDateBounds, dateKeyOf, monthKey } from '../utils/pending-package';
import { Student } from '../models/student.model';
import { StudentStatus } from '../enums/student-status.enum';
import { Weekday } from '../enums/weekday.enum';

const packageServiceStub = { getPackages: () => of(TEST_CATALOG_ROWS) };

describe('StudentDialog', () => {
  const dialogRef = { close: jest.fn() };
  let editDialogResult: unknown;
  const matDialog = { open: jest.fn(() => ({ afterClosed: () => of(editDialogResult) })) };
  const studentService = {
    createStudent: jest.fn(),
    updateStudent: jest.fn(),
    deleteStudent: jest.fn(),
  };
  const billingService = { previewStatement: jest.fn() };
  const scheduleService = {
    futurePendingTutoring: jest.fn((..._args: unknown[]) => of([])),
    deleteFuturePendingSessions: jest.fn((..._args: unknown[]) => of(0)),
    fillAhead: jest.fn((..._args: unknown[]) => of(null)),
    rebuildFrom: jest.fn((..._args: unknown[]) => of(null)),
  };

  const build = (data: Partial<StudentDialogData>): StudentDialog => {
    const full: StudentDialogData = {
      mode: 'create',
      contactId: 'c-1',
      tutors: [],
      ...data,
    };
    TestBed.configureTestingModule({
      imports: [StudentDialog],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: full },
        { provide: StudentService, useValue: studentService },
        { provide: ScheduleService, useValue: scheduleService },
        { provide: MatDialog, useValue: matDialog },
        { provide: PackageService, useValue: packageServiceStub },
        { provide: BillingService, useValue: billingService },
      ],
    });
    const c = TestBed.createComponent(StudentDialog).componentInstance;
    c.ngOnInit();
    return c;
  };

  const form = (c: StudentDialog): FormGroup =>
    (c as unknown as { studentForm: FormGroup }).studentForm;
  const priv = (c: StudentDialog) =>
    c as unknown as {
      submitting: boolean;
      hasError: boolean;
      errorMessage: string;
      locked: boolean;
      showOnboardingToggle: boolean;
      startedInOnboarding: boolean;
    };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    scheduleService.futurePendingTutoring.mockReturnValue(of([]));
    scheduleService.deleteFuturePendingSessions.mockReturnValue(of(0));
    scheduleService.fillAhead.mockReturnValue(of(null));
    scheduleService.rebuildFrom.mockReturnValue(of(null));
  });

  describe('create', () => {
    it('shows only a name field and sensible defaults', () => {
      const c = build({ mode: 'create' });
      expect(priv(c).showOnboardingToggle).toBe(false);
      expect(form(c).get('name')?.value).toBe('');
      expect(form(c).get('status')?.value).toBe(StudentStatus.ONBOARDING);
      expect(form(c).get('onboarding_complete')?.value).toBe(false);
      expect(form(c).get('make_up_never_expire')?.value).toBe(false);
      expect(form(c).get('contact_id')?.value).toBe('c-1');
      expect(c.makeupBalance).toBe(0); // no student in create mode
    });

    it('exposes the available make-up balance read-only in edit mode', () => {
      const c = build({
        mode: 'edit',
        student: {
          id: 's-1',
          name: 'Pat',
          status: StudentStatus.ACTIVE_STUDENT,
          onboarding_complete: true,
          make_up_batches: [{ minutes: 30, earned_date: new Date().toISOString() }],
        } as Student,
      });
      expect(c.makeupBalance).toBe(30);
    });

    it('persists the never-expire flag via the update payload', () => {
      const c = build({
        mode: 'edit',
        student: {
          id: 's-1', name: 'Pat', status: StudentStatus.ACTIVE_STUDENT, onboarding_complete: true,
        } as Student,
      });
      form(c).get('make_up_never_expire')?.setValue(true);
      studentService.updateStudent.mockReturnValue(of({} as Student));
      c.save();
      expect(studentService.updateStudent.mock.calls[0][0].make_up_never_expire).toBe(true);
    });

    it('defaults tutors to an empty list when none are provided', () => {
      const c = build({ mode: 'create', tutors: undefined as never });
      expect((c as unknown as { tutors: unknown[] }).tutors).toEqual([]);
    });

    it('creates a nameless student (intake before the name is known)', () => {
      studentService.createStudent.mockReturnValue(of({ id: 's-new' }));
      const c = build({ mode: 'create' });
      c.save();
      expect(studentService.createStudent).toHaveBeenCalledWith(
        expect.objectContaining({ name: '', status: StudentStatus.ONBOARDING }),
      );
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('trims a whitespace-only name to empty on create', () => {
      studentService.createStudent.mockReturnValue(of({ id: 's-new' }));
      const c = build({ mode: 'create' });
      form(c).get('name')?.setValue('   ');
      c.save();
      expect(studentService.createStudent).toHaveBeenCalledWith(
        expect.objectContaining({ name: '' }),
      );
    });

    it('posts a name-only onboarding student and closes', () => {
      const c = build({ mode: 'create' });
      form(c).get('name')?.setValue('Pat');
      studentService.createStudent.mockReturnValue(of({ id: 's-new' }));
      c.save();
      expect(studentService.createStudent).toHaveBeenCalledWith({
        contact_id: 'c-1',
        name: 'Pat',
        status: StudentStatus.ONBOARDING,
        onboarding_complete: false,
        make_up_minutes: 0,
      });
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('shows a spinner and blocks a second submit while in flight', () => {
      const c = build({ mode: 'create' });
      form(c).get('name')?.setValue('Pat');
      const inflight = new Subject<unknown>();
      studentService.createStudent.mockReturnValue(inflight.asObservable());
      c.save();
      expect(priv(c).submitting).toBe(true);
      c.save();
      expect(studentService.createStudent).toHaveBeenCalledTimes(1);
      // cancel is a no-op while submitting.
      c.cancel();
      expect(dialogRef.close).not.toHaveBeenCalled();
      inflight.next({ id: 's-new' });
    });

    it('clears submitting and surfaces an error on failure', () => {
      const c = build({ mode: 'create' });
      form(c).get('name')?.setValue('Pat');
      studentService.createStudent.mockReturnValue(throwError(() => new Error('x')));
      c.save();
      expect(priv(c).submitting).toBe(false);
      expect(priv(c).hasError).toBe(true);
      expect(priv(c).errorMessage).toBe('Failed to create the student. Please try again.');
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('edit — onboarding gate', () => {
    const onboardingStudent = (over: Partial<Student> = {}): Student => ({
      id: 's-1',
      contact_id: 'c-1',
      name: 'Pat',
      status: StudentStatus.ONBOARDING,
      onboarding_complete: false,
      make_up_minutes: 0,
      ...over,
    });

    it('locks the post-onboarding fields until onboarding is complete', () => {
      const c = build({ mode: 'edit', student: onboardingStudent() });
      expect(priv(c).startedInOnboarding).toBe(true);
      expect(priv(c).showOnboardingToggle).toBe(true);
      expect(priv(c).locked).toBe(true);
    });

    it('completing onboarding auto-advances to Active and unlocks the fields', () => {
      const c = build({ mode: 'edit', student: onboardingStudent() });
      form(c).get('onboarding_complete')?.setValue(true);
      c.onOnboardingCompleteChange(true);
      expect(form(c).get('status')?.value).toBe(StudentStatus.ACTIVE_STUDENT);
      expect(priv(c).locked).toBe(false);
    });

    it('unchecking complete does not change the status', () => {
      const c = build({ mode: 'edit', student: onboardingStudent() });
      c.onOnboardingCompleteChange(false);
      expect(form(c).get('status')?.value).toBe(StudentStatus.ONBOARDING);
    });

    it('an already-active student is unlocked with no onboarding toggle', () => {
      const c = build({
        mode: 'edit',
        student: onboardingStudent({ status: StudentStatus.ACTIVE_STUDENT, onboarding_complete: true }),
      });
      expect(priv(c).startedInOnboarding).toBe(false);
      expect(priv(c).showOnboardingToggle).toBe(false);
      expect(priv(c).locked).toBe(false);
    });

    it('completing onboarding on an already-active student leaves the status alone', () => {
      const c = build({
        mode: 'edit',
        student: onboardingStudent({ status: StudentStatus.ACTIVE_STUDENT, onboarding_complete: true }),
      });
      c.onOnboardingCompleteChange(true);
      expect(form(c).get('status')?.value).toBe(StudentStatus.ACTIVE_STUDENT);
    });
  });

  describe('edit — save', () => {
    const richStudent = (over: Partial<Student> = {}): Student => ({
      id: 's-1',
      contact_id: 'c-1',
      name: 'Pat',
      birthday: '2015-05-05',
      status: StudentStatus.ACTIVE_STUDENT,
      onboarding_complete: true,
      assigned_tutor_id: 't-1',
      package: 'Determination',
      scholarship: true,
      btc_and_me: true,
      schedule: [{ weekday: 'MONDAY', start_time: '10:00', end_time: '11:00' }],
      package_start_date: '2026-07-01',
      auto_renew: true,
      make_up_minutes: 30,
      ...over,
    });

    it('updates with the carried schedule/billing fields and a string birthday', () => {
      const c = build({ mode: 'edit', student: richStudent() });
      studentService.updateStudent.mockReturnValue(of({ id: 's-1' } as Student));
      c.save();
      expect(studentService.updateStudent).toHaveBeenCalledTimes(1);
      const payload = studentService.updateStudent.mock.calls[0][0] as Student;
      expect(payload.id).toBe('s-1');
      expect(payload.birthday).toBe('2015-05-05');
      expect(payload.schedule).toEqual([
        { weekday: 'MONDAY', start_time: '10:00', end_time: '11:00' },
      ]);
      expect(payload.package_start_date).toBe('2026-07-01');
      expect(payload.auto_renew).toBe(true);
      expect(payload.btc_and_me).toBe(true);
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    describe('per-tutor extra planning overrides', () => {
      const rows = (c: StudentDialog) =>
        (c as unknown as { planningOverrideRows: { tutor_id: string; label: string; minutes: number | null }[] })
          .planningOverrideRows;
      const multiTutorStudent = (over: Partial<Student> = {}) => richStudent({
        schedule: [
          { weekday: 'MONDAY', start_time: '10:00', end_time: '11:00' },
          { weekday: 'WEDNESDAY', start_time: '10:00', end_time: '11:00', tutor_id: 't-2' },
        ] as never,
        ...over,
      });

      it('shows one row per effective tutor for a multi-tutor student', () => {
        const c = build({
          mode: 'edit',
          student: multiTutorStudent(),
          tutors: [
            { id: 't-1', first_name: 'Tess' }, { id: 't-2', first_name: 'Maria' },
          ] as never,
        });
        expect(rows(c).map(r => [r.tutor_id, r.label, r.minutes])).toEqual([
          ['t-1', 'Tess', null],
          ['t-2', 'Maria', null],
        ]);
      });

      it('hides the rows for a single-tutor student without stored overrides', () => {
        const c = build({ mode: 'edit', student: richStudent() });
        expect(rows(c)).toEqual([]);
      });

      it('renders stored overrides, labeling former tutors', () => {
        const c = build({
          mode: 'edit',
          student: richStudent({
            extra_planning_by_tutor: [{ tutor_id: 't-gone', minutes: 30 }],
          }),
          tutors: [{ id: 't-1', first_name: 'Tess' }] as never,
        });
        const gone = rows(c).find(r => r.tutor_id === 't-gone');
        expect(gone).toEqual({ tutor_id: 't-gone', label: '(former tutor)', minutes: 30 });
      });

      it('saves filled rows, omits blanks, and clears only when stored overrides vanish', () => {
        const c = build({
          mode: 'edit',
          student: multiTutorStudent(),
          tutors: [] as never,
        });
        studentService.updateStudent.mockReturnValue(of({} as Student));
        rows(c).find(r => r.tutor_id === 't-2')!.minutes = 25;
        c.save();
        let payload = studentService.updateStudent.mock.calls.at(-1)![0] as Student;
        expect(payload.extra_planning_by_tutor).toEqual([{ tutor_id: 't-2', minutes: 25 }]);

        // All-blank rows on a student WITH stored overrides -> explicit [] clear.
        TestBed.resetTestingModule();
        const c2 = build({
          mode: 'edit',
          student: multiTutorStudent({
            extra_planning_by_tutor: [{ tutor_id: 't-2', minutes: 25 }],
          }),
          tutors: [] as never,
        });
        rows(c2).forEach(r => (r.minutes = null));
        c2.save();
        payload = studentService.updateStudent.mock.calls.at(-1)![0] as Student;
        expect(payload.extra_planning_by_tutor).toEqual([]);

        // Never stored + all blank -> the key is omitted entirely.
        TestBed.resetTestingModule();
        const c3 = build({ mode: 'edit', student: multiTutorStudent(), tutors: [] as never });
        c3.save();
        payload = studentService.updateStudent.mock.calls.at(-1)![0] as Student;
        expect(payload).not.toHaveProperty('extra_planning_by_tutor');
      });
    });

    describe('scheduled package changes', () => {
      const rows = (c: StudentDialog) => c.pendingRows;
      const row = (c: StudentDialog, i: number) => rows(c).at(i);
      const setRow = (c: StudentDialog, i: number, values: Record<string, unknown>) => row(c, i).patchValue(values);
      const now = new Date();
      // The 1sts of the next months: the defaults offered to a new row.
      const firstOf = (i: number): string => dateKeyOf(new Date(now.getFullYear(), now.getMonth() + i, 1));
      // Any day works: five days out is always a future date inside the look-ahead.
      const soon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5);
      const view = (c: StudentDialog) =>
        c as unknown as {
          changeBounds: { min: Date; max: Date };
          currentCustomPrice: number | null;
          formatMoney: (v: number | null) => string;
        };

      it('offers tomorrow through the end of the look-ahead', () => {
        const c = build({ mode: 'edit', student: richStudent() });
        expect(view(c).changeBounds).toEqual(changeDateBounds(new Date()));
        expect(view(c).changeBounds.min).toEqual(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
      });

      it('adding a change saves a list and closes with the pending-schedule signal for it', () => {
        const c = build({ mode: 'edit', student: richStudent() });
        studentService.updateStudent.mockReturnValue(of({} as Student));
        c.addPendingChange();
        expect(rows(c)).toHaveLength(1);
        expect(dateKeyOf(row(c, 0).get('effective')!.value)).toBe(firstOf(1)); // defaulted
        setRow(c, 0, { package: 'Succeed' });
        c.save();
        const payload = studentService.updateStudent.mock.calls[0][0] as Student;
        expect(payload.pending_changes).toEqual([{ package: 'Succeed', effective: firstOf(1) }]);
        expect('pending_package' in payload).toBe(false);
        expect(dialogRef.close).toHaveBeenCalledWith({
          openPendingScheduleFor: { studentId: 's-1', effective: firstOf(1) },
        });
      });

      it('saves a change on any future day picked from the calendar', () => {
        const c = build({ mode: 'edit', student: richStudent() });
        studentService.updateStudent.mockReturnValue(of({} as Student));
        c.addPendingChange();
        setRow(c, 0, { package: 'Succeed', effective: soon });
        expect(c.pendingNoteAt(0)).toBe(
          `→ Succeed from ${soon.toLocaleDateString('en-US', { month: 'short' })} ${soon.getDate()}`,
        );
        c.save();
        const payload = studentService.updateStudent.mock.calls[0][0] as Student;
        expect(payload.pending_changes).toEqual([{ package: 'Succeed', effective: dateKeyOf(soon) }]);
        expect(dialogRef.close).toHaveBeenCalledWith({
          openPendingScheduleFor: { studentId: 's-1', effective: dateKeyOf(soon) },
        });
      });

      it('rejects today, a past day and a day beyond the look-ahead', () => {
        const c = build({ mode: 'edit', student: richStudent() });
        c.addPendingChange();
        setRow(c, 0, { package: 'Succeed', effective: new Date() });
        c.save();
        expect(priv(c).errorMessage).toBe('A scheduled change must take effect on a future date.');
        setRow(c, 0, { effective: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1) });
        c.save();
        expect(priv(c).errorMessage).toBe('A scheduled change must take effect on a future date.');
        setRow(c, 0, { effective: new Date(now.getFullYear(), now.getMonth() + 4, 1) });
        c.save();
        expect(priv(c).errorMessage).toContain('no further ahead than the calendar');
        setRow(c, 0, { effective: null });
        c.save();
        expect(priv(c).errorMessage).toBe('Pick the date each scheduled package change takes effect.');
        expect(studentService.updateStudent).not.toHaveBeenCalled();
      });

      it('a second added change defaults to the next unused 1st and the OLDEST new one is the schedule target', () => {
        const c = build({ mode: 'edit', student: richStudent() });
        studentService.updateStudent.mockReturnValue(of({} as Student));
        c.addPendingChange();
        c.addPendingChange();
        expect(dateKeyOf(row(c, 1).get('effective')!.value)).toBe(firstOf(2));
        setRow(c, 0, { package: 'Succeed', effective: firstOf(2) });
        setRow(c, 1, { package: 'Achieve', effective: firstOf(1) });
        c.save();
        const payload = studentService.updateStudent.mock.calls[0][0] as Student;
        expect(payload.pending_changes!.map(p => p.package)).toEqual(['Succeed', 'Achieve']); // as entered; backend sorts
        expect(dialogRef.close).toHaveBeenCalledWith({
          openPendingScheduleFor: { studentId: 's-1', effective: firstOf(1) },
        });
      });

      it('leaves the date blank once the next three 1sts are all used', () => {
        const c = build({ mode: 'edit', student: richStudent() });
        for (let i = 0; i < 4; i++) {
          c.addPendingChange();
        }
        expect([0, 1, 2].map(i => dateKeyOf(row(c, i).get('effective')!.value))).toEqual([
          firstOf(1), firstOf(2), firstOf(3),
        ]);
        expect(row(c, 3).get('effective')!.value).toBeNull();
      });

      it('an unchanged list closes with plain true and carries schedule + notice stamp through', () => {
        const stored = {
          package: 'Succeed', effective: '2026-09-01', notice_sent: '2026-09-01',
          schedule: [{ weekday: Weekday.MONDAY, start_time: '10:00', end_time: '10:30' }],
        };
        const c = build({ mode: 'edit', student: richStudent({ pending_changes: [stored] }) });
        studentService.updateStudent.mockReturnValue(of({} as Student));
        expect(c.hasPendingScheduleAt(0)).toBe(true);
        expect(row(c, 0).get('effective')!.value).toEqual(new Date(2026, 8, 1));
        c.save();
        const payload = studentService.updateStudent.mock.calls[0][0] as Student;
        expect(payload.pending_changes).toEqual([stored]);
        expect(dialogRef.close).toHaveBeenCalledWith(true);
      });

      it('editing a row\'s package drops its carried schedule so it re-opens the pending-schedule dialog', () => {
        const stored = {
          package: 'Succeed', effective: '2026-09-01',
          schedule: [{ weekday: Weekday.MONDAY, start_time: '10:00', end_time: '10:30' }],
        };
        const c = build({ mode: 'edit', student: richStudent({ pending_changes: [stored] }) });
        studentService.updateStudent.mockReturnValue(of({} as Student));
        row(c, 0).get('package')!.setValue('Achieve');
        expect(c.hasPendingScheduleAt(0)).toBe(false);
        c.save();
        const payload = studentService.updateStudent.mock.calls[0][0] as Student;
        expect(payload.pending_changes).toEqual([{ package: 'Achieve', effective: '2026-09-01' }]);
        expect(dialogRef.close).toHaveBeenCalledWith({
          openPendingScheduleFor: { studentId: 's-1', effective: '2026-09-01' },
        });
      });

      it('changing only the price keeps the carried schedule', () => {
        const stored = {
          package: 'Succeed', effective: '2026-09-01',
          schedule: [{ weekday: Weekday.MONDAY, start_time: '10:00', end_time: '10:30' }],
        };
        const c = build({ mode: 'edit', student: richStudent({ pending_changes: [stored] }) });
        studentService.updateStudent.mockReturnValue(of({} as Student));
        setRow(c, 0, { price_mode: 'custom', price_override: 300 });
        expect(c.hasPendingScheduleAt(0)).toBe(true);
        c.save();
        const payload = studentService.updateStudent.mock.calls[0][0] as Student;
        expect(payload.pending_changes).toEqual([{ ...stored, price_override: 300 }]);
        expect(dialogRef.close).toHaveBeenCalledWith(true);
      });

      it('removing every row clears the list ([]), while a never-scheduled student omits the key', () => {
        const c = build({ mode: 'edit', student: richStudent({ pending_changes: [{ package: 'Succeed', effective: '2026-09-01' }] }) });
        studentService.updateStudent.mockReturnValue(of({} as Student));
        c.removePendingChange(0);
        c.save();
        expect((studentService.updateStudent.mock.calls[0][0] as Student).pending_changes).toEqual([]);
        expect(dialogRef.close).toHaveBeenCalledWith(true);

        TestBed.resetTestingModule();
        const c2 = build({ mode: 'edit', student: richStudent() });
        c2.save();
        const payload = studentService.updateStudent.mock.calls.at(-1)![0] as Student;
        expect('pending_changes' in payload).toBe(false);
      });

      it('surfaces each validation error and never saves', () => {
        const c = build({ mode: 'edit', student: richStudent() });
        c.addPendingChange();
        setRow(c, 0, { package: '' });
        c.save();
        expect(priv(c).errorMessage).toBe('Pick a package for every scheduled change.');
        setRow(c, 0, { package: 'Determination' }); // equals the current package
        c.save();
        expect(priv(c).errorMessage).toContain('matches the step before it');
        setRow(c, 0, { package: 'Custom', custom_monthly_cost: 500 });
        c.save();
        expect(priv(c).errorMessage).toBe('A scheduled Custom package needs all three custom values.');
        c.addPendingChange();
        setRow(c, 0, { package: 'Succeed', custom_monthly_cost: null });
        setRow(c, 1, { package: 'Achieve', effective: firstOf(1) });
        c.save();
        expect(priv(c).errorMessage).toContain('share the same date');
        expect(studentService.updateStudent).not.toHaveBeenCalled();
        expect(priv(c).hasError).toBe(true);
      });

      it('shows per-row notes, keeps a stored past date saveable, and reads a legacy single change', () => {
        const c = build({
          mode: 'edit',
          student: richStudent({ pending_package: 'Achieve', pending_package_effective: '2020-01-01' }),
        });
        studentService.updateStudent.mockReturnValue(of({} as Student));
        expect(rows(c)).toHaveLength(1);
        expect(c.pendingNoteAt(0)).toBe('→ Achieve from Jan 1');
        expect(c.hasPendingScheduleAt(0)).toBe(false);
        c.addPendingChange();
        expect(c.pendingNoteAt(1)).toBeNull(); // no package yet
        expect(c.pendingNoteAt(9)).toBeNull(); // no such row
        c.removePendingChange(1);
        c.save();
        expect((studentService.updateStudent.mock.calls[0][0] as Student).pending_changes)
          .toEqual([{ package: 'Achieve', effective: '2020-01-01' }]);
      });

      it('includes stored change packages in the package options and their slot tutors in planning rows', () => {
        const c = build({
          mode: 'edit',
          student: richStudent({
            assigned_tutor_id: 't-1',
            pending_changes: [{
              package: 'Achieve', effective: '2026-09-01',
              schedule: [{ weekday: Weekday.MONDAY, start_time: '10:00', end_time: '10:30', tutor_id: 't-2' }],
            }],
          }),
          tutors: [{ id: 't-1', first_name: 'Tess', last_name: 'One' }, { id: 't-2', first_name: 'Tim', last_name: 'Two' }] as never,
        });
        expect(priv(c).packageOptions).toContain('Achieve');
        expect(priv(c).planningOverrideRows.map((r: { tutor_id: string }) => r.tutor_id)).toEqual(['t-1', 't-2']);
      });

      describe('price after the change', () => {
        const saved = (): Student => studentService.updateStudent.mock.calls.at(-1)![0];
        beforeEach(() => studentService.updateStudent.mockReturnValue(of({} as Student)));

        it('defaults to the standard price: a custom price resets', () => {
          const c = build({ mode: 'edit', student: richStudent({ price_override: 410.4 }) });
          expect(view(c).currentCustomPrice).toBe(410.4);
          expect(view(c).formatMoney(410.4)).toBe('$410.40');
          c.addPendingChange();
          expect(row(c, 0).get('price_mode')!.value).toBe('standard');
          setRow(c, 0, { package: 'Succeed', price_override: 999 });
          c.save();
          expect(saved().pending_changes).toEqual([{ package: 'Succeed', effective: firstOf(1) }]);
        });

        it('carries the custom price over when asked', () => {
          const c = build({ mode: 'edit', student: richStudent({ price_override: 410.4 }) });
          c.addPendingChange();
          setRow(c, 0, { package: 'Succeed', price_mode: 'keep' });
          c.save();
          expect(saved().pending_changes![0].price_override).toBe(410.4);
        });

        it('carries the price being entered now, not only the stored one', () => {
          const c = build({ mode: 'edit', student: richStudent() });
          form(c).get('price_override')!.setValue('300');
          expect(view(c).currentCustomPrice).toBe(300);
          c.addPendingChange();
          setRow(c, 0, { package: 'Succeed', price_mode: 'keep' });
          c.save();
          expect(saved().pending_changes![0].price_override).toBe(300);
        });

        it('keep falls back to the standard price when no custom price is in effect', () => {
          const c = build({ mode: 'edit', student: richStudent() });
          expect(view(c).currentCustomPrice).toBeNull();
          for (const junk of ['', 'abc', -5]) {
            form(c).get('price_override')!.setValue(junk);
            expect(view(c).currentCustomPrice).toBeNull();
          }
          form(c).get('price_override')!.setValue(null);
          c.addPendingChange();
          setRow(c, 0, { package: 'Succeed', price_mode: 'keep' });
          c.save();
          expect('price_override' in saved().pending_changes![0]).toBe(false);
        });

        it('a Custom current package has no custom price to carry', () => {
          const c = build({
            mode: 'edit',
            student: richStudent({ package: 'Custom', price_override: 300 }),
          });
          expect(view(c).currentCustomPrice).toBeNull();
        });

        it('saves a new custom price, including $0', () => {
          const c = build({ mode: 'edit', student: richStudent() });
          c.addPendingChange();
          setRow(c, 0, { package: 'Succeed', price_mode: 'custom', price_override: '375.50' });
          c.save();
          expect(saved().pending_changes![0].price_override).toBe(375.5);

          TestBed.resetTestingModule();
          const c2 = build({ mode: 'edit', student: richStudent() });
          c2.addPendingChange();
          setRow(c2, 0, { package: 'Succeed', price_mode: 'custom', price_override: 0 });
          c2.save();
          expect(saved().pending_changes![0].price_override).toBe(0);
        });

        it('requires an amount for a new custom price', () => {
          const c = build({ mode: 'edit', student: richStudent() });
          c.addPendingChange();
          for (const blank of [null, '', undefined, -1]) {
            setRow(c, 0, { package: 'Succeed', price_mode: 'custom', price_override: blank });
            c.save();
            expect(priv(c).errorMessage).toBe('A custom price must be $0 or more.');
          }
          expect(studentService.updateStudent).not.toHaveBeenCalled();
        });

        it('a Custom new package never carries a separate custom price', () => {
          const c = build({ mode: 'edit', student: richStudent({ price_override: 410.4 }) });
          c.addPendingChange();
          setRow(c, 0, {
            package: 'Custom', custom_monthly_cost: 500, custom_sessions_per_week: 2,
            custom_session_length_min: 45, price_mode: 'keep',
          });
          c.save();
          expect('price_override' in saved().pending_changes![0]).toBe(false);
        });

        it('loads a stored price as keep when it matches the current one, else as custom', () => {
          const c = build({
            mode: 'edit',
            student: richStudent({
              price_override: 410.4,
              pending_changes: [
                { package: 'Succeed', effective: '2026-09-01', price_override: 410.4 },
                { package: 'Achieve', effective: '2026-10-01', price_override: 300 },
                { package: 'Excel', effective: '2026-11-01' },
              ],
            }),
          });
          expect([0, 1, 2].map(i => row(c, i).get('price_mode')!.value)).toEqual(['keep', 'custom', 'standard']);
          expect(row(c, 1).get('price_override')!.value).toBe(300);
          c.save();
          expect(saved().pending_changes!.map(p => p.price_override)).toEqual([410.4, 300, undefined]);
        });
      });

      describe('preview of the month a change lands in', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('shows the student\'s lines for that month once the row settles', () => {
          billingService.previewStatement.mockReturnValue(of({
            statement: statement({
              lines: [
                statementLine({ student_id: 's-1', student_name: 'Pat', package: 'Determination', to: '2026-07-13', sessions_billed: 1, net: 83.54 }),
                statementLine({ student_id: 's-1', student_name: 'Pat', package: 'Succeed', from: '2026-07-14', sessions_billed: 3, net: 250.62 }),
                statementLine({ student_id: 's-2', student_name: 'Sam', net: 273 }),
              ],
            }),
          }));
          const c = build({ mode: 'edit', student: richStudent() });
          c.addPendingChange();
          expect(c.previewAt(0)).toEqual([]);
          setRow(c, 0, { package: 'Succeed', effective: soon });
          jest.advanceTimersByTime(399);
          expect(billingService.previewStatement).not.toHaveBeenCalled();
          jest.advanceTimersByTime(1);
          const [month, draft] = billingService.previewStatement.mock.calls.at(-1)!;
          expect(month).toBe(monthKey(soon.getFullYear(), soon.getMonth()));
          expect(draft.id).toBe('s-1');
          expect(draft.pending_changes).toEqual([{ package: 'Succeed', effective: dateKeyOf(soon) }]);
          expect(c.previewAt(0)).toEqual([
            'Pat: Determination, through Jul 13, 1 of 4 sessions at $83.54: $83.54',
            'Pat: Succeed, from Jul 14, 3 of 4 sessions at $83.54: $250.62',
          ]);
          expect(c.previewAt(7)).toEqual([]);
        });

        it('stays empty while the rows are invalid, the preview fails or nothing is owed', () => {
          const c = build({ mode: 'edit', student: richStudent() });
          c.addPendingChange();
          setRow(c, 0, { package: '' });
          jest.advanceTimersByTime(400);
          expect(billingService.previewStatement).not.toHaveBeenCalled();

          billingService.previewStatement.mockReturnValue(throwError(() => new Error('boom')));
          setRow(c, 0, { package: 'Succeed' });
          jest.advanceTimersByTime(400);
          expect(c.previewAt(0)).toEqual([]);

          billingService.previewStatement.mockReturnValue(of({ statement: null }));
          setRow(c, 0, { package: 'Achieve' });
          jest.advanceTimersByTime(400);
          expect(c.previewAt(0)).toEqual([]);
          expect(billingService.previewStatement).toHaveBeenCalledTimes(2);
        });

        it('forgets a removed row and never previews an unsaved student', () => {
          billingService.previewStatement.mockReturnValue(of({
            statement: statement({ lines: [statementLine({ student_id: 's-1' })] }),
          }));
          const c = build({ mode: 'edit', student: richStudent() });
          c.addPendingChange();
          setRow(c, 0, { package: 'Succeed' });
          jest.advanceTimersByTime(400);
          expect(c.previewAt(0)).toHaveLength(1);
          c.removePendingChange(0);
          expect(c.previewAt(0)).toEqual([]);

          TestBed.resetTestingModule();
          billingService.previewStatement.mockClear();
          const c2 = build({ mode: 'edit', student: richStudent({ id: undefined }) });
          c2.addPendingChange();
          setRow(c2, 0, { package: 'Succeed' });
          jest.advanceTimersByTime(400);
          expect(billingService.previewStatement).not.toHaveBeenCalled();
        });
      });
    });

    it('round-trips an unchecked BTC & Me flag as false', () => {
      const c = build({ mode: 'edit', student: richStudent({ btc_and_me: undefined }) });
      studentService.updateStudent.mockReturnValue(of({} as Student));
      c.save();
      const payload = studentService.updateStudent.mock.calls[0][0] as Student;
      expect(payload.btc_and_me).toBe(false);
    });

    it('sends an undefined birthday when none is set', () => {
      const c = build({ mode: 'edit', student: richStudent({ birthday: undefined }) });
      studentService.updateStudent.mockReturnValue(of({} as Student));
      c.save();
      const payload = studentService.updateStudent.mock.calls[0][0] as Student;
      expect(payload.birthday).toBeUndefined();
    });

    it('parses an ISO-datetime birthday and re-serializes it as a plain date', () => {
      const c = build({
        mode: 'edit',
        student: richStudent({ birthday: '2015-05-05T00:00:00.000Z' }),
      });
      studentService.updateStudent.mockReturnValue(of({} as Student));
      c.save();
      const payload = studentService.updateStudent.mock.calls[0][0] as Student;
      expect(payload.birthday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('offers only student statuses in the dropdown (no Staff)', () => {
      const c = build({ mode: 'edit', student: richStudent() });
      const options = (c as unknown as { statusOptions: string[] }).statusOptions;
      expect(options).toEqual([
        'Onboarding', 'Active Student', 'Past Student', 'MIA', 'Declined Services',
      ]);
    });

    it('persists a status change while still onboarding (the MIA escape)', () => {
      studentService.updateStudent.mockReturnValue(of(richStudent()));
      const c = build({
        mode: 'edit',
        student: richStudent({ status: StudentStatus.ONBOARDING, onboarding_complete: false }),
      });
      expect((c as unknown as { locked: boolean }).locked).toBe(true);
      form(c).get('status')?.setValue(StudentStatus.MIA);
      c.save();
      expect(studentService.updateStudent).toHaveBeenCalledWith(
        expect.objectContaining({ status: StudentStatus.MIA }),
      );
    });

    it('persists a tutor assigned while still onboarding (locked)', () => {
      studentService.updateStudent.mockReturnValue(of(richStudent()));
      const c = build({
        mode: 'edit',
        student: richStudent({ status: StudentStatus.ONBOARDING, onboarding_complete: false }),
      });
      expect((c as unknown as { locked: boolean }).locked).toBe(true);
      form(c).get('assigned_tutor_id')?.setValue('t-9');
      c.save();
      expect(studentService.updateStudent).toHaveBeenCalledWith(
        expect.objectContaining({ assigned_tutor_id: 't-9' }),
      );
    });

    it('saves a cleared name as empty (fallback renders in the UI)', () => {
      studentService.updateStudent.mockReturnValue(of(richStudent()));
      const c = build({ mode: 'edit', student: richStudent() });
      form(c).get('name')?.setValue('');
      c.save();
      expect(studentService.updateStudent).toHaveBeenCalledWith(
        expect.objectContaining({ name: '' }),
      );
    });

    it('clears submitting and surfaces an error on failure', () => {
      const c = build({ mode: 'edit', student: richStudent() });
      studentService.updateStudent.mockReturnValue(throwError(() => new Error('x')));
      c.save();
      expect(priv(c).submitting).toBe(false);
      expect(priv(c).hasError).toBe(true);
      expect(priv(c).errorMessage).toBe('Failed to save the student. Please try again.');
    });
  });

  describe('delete', () => {
    it('deletes by id and closes', () => {
      const c = build({ mode: 'delete', student: { id: 's-1', name: 'Pat' } as Student });
      studentService.deleteStudent.mockReturnValue(of({ message: 'ok' }));
      c.confirmDelete();
      expect(studentService.deleteStudent).toHaveBeenCalledWith('s-1');
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('just closes when there is no id to delete', () => {
      const c = build({ mode: 'delete', student: { name: 'Pat' } as Student });
      c.confirmDelete();
      expect(studentService.deleteStudent).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });

    it('blocks a second delete while in flight', () => {
      const c = build({ mode: 'delete', student: { id: 's-1' } as Student });
      const inflight = new Subject<unknown>();
      studentService.deleteStudent.mockReturnValue(inflight.asObservable());
      c.confirmDelete();
      expect(priv(c).submitting).toBe(true);
      c.confirmDelete();
      expect(studentService.deleteStudent).toHaveBeenCalledTimes(1);
      inflight.next({ message: 'ok' });
    });

    it('clears submitting and surfaces an error on failure', () => {
      const c = build({ mode: 'delete', student: { id: 's-1' } as Student });
      studentService.deleteStudent.mockReturnValue(throwError(() => new Error('x')));
      c.confirmDelete();
      expect(priv(c).submitting).toBe(false);
      expect(priv(c).hasError).toBe(true);
      expect(priv(c).errorMessage).toBe('Failed to delete the student. Please try again.');
    });
  });

  describe('edit — the current package once service has started', () => {
    const enrolled = (over: Partial<Student> = {}): Student => ({
      id: 's-1',
      contact_id: 'c-1',
      name: 'Pat',
      status: StudentStatus.ACTIVE_STUDENT,
      onboarding_complete: true,
      package: 'Succeed',
      package_start_date: '2026-05-01T00:00:00',
      schedule: [{ weekday: Weekday.MONDAY, start_time: '10:00', end_time: '10:30' }],
      make_up_minutes: 0,
      ...over,
    });
    const lock = (c: StudentDialog) =>
      c as unknown as { serviceStarted: boolean; packageLocked: boolean; correctingPackage: boolean };
    const d = new Date();
    const todayKey = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
    const packageControls = ['package', 'custom_monthly_cost', 'custom_sessions_per_week', 'custom_session_length_min'];

    beforeEach(() => studentService.updateStudent.mockReturnValue(of({} as Student)));

    it('locks the package and its custom values', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      expect(lock(c).serviceStarted).toBe(true);
      expect(lock(c).packageLocked).toBe(true);
      for (const name of packageControls) {
        expect(form(c).get(name)!.disabled).toBe(true);
      }
      expect(form(c).get('name')!.disabled).toBe(false);
    });

    it('a locked save still sends the package, with no proration stamps', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      c.save();
      const payload = studentService.updateStudent.mock.calls[0][0] as Student;
      expect(payload.package).toBe('Succeed');
      expect(payload.package_start_date).toBe('2026-05-01T00:00:00');
      expect('mid_month_change_period' in payload).toBe(false);
      expect('mid_month_prior_charge' in payload).toBe(false);
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('service starting today counts as started; a future start does not', () => {
      expect(lock(build({ mode: 'edit', student: enrolled({ package_start_date: `${todayKey}T00:00:00` }) }))
        .packageLocked).toBe(true);
      TestBed.resetTestingModule();
      const c = build({ mode: 'edit', student: enrolled({ package_start_date: '2999-01-01T00:00:00' }) });
      expect(lock(c).serviceStarted).toBe(false);
      expect(form(c).get('package')!.enabled).toBe(true);
    });

    it('stays open for a student without a package, a start date, or in create mode', () => {
      expect(lock(build({ mode: 'edit', student: enrolled({ package: undefined }) })).serviceStarted).toBe(false);
      TestBed.resetTestingModule();
      expect(lock(build({ mode: 'edit', student: enrolled({ package_start_date: undefined }) })).serviceStarted)
        .toBe(false);
      TestBed.resetTestingModule();
      const c = build({ mode: 'create' });
      expect(lock(c).serviceStarted).toBe(false);
      expect(form(c).get('package')!.enabled).toBe(true);
    });

    it('setting a first package saves and closes normally', () => {
      const c = build({ mode: 'edit', student: enrolled({ package: undefined }) });
      form(c).get('package')?.setValue('Succeed');
      c.save();
      expect(studentService.updateStudent.mock.calls[0][0].package).toBe('Succeed');
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    describe('fixing a data-entry mistake', () => {
      it('unlocks the package; the correction is saved in place and routes to Manage Schedule', () => {
        const c = build({ mode: 'edit', student: enrolled() });
        c.toggleCorrection();
        expect(lock(c).correctingPackage).toBe(true);
        expect(lock(c).packageLocked).toBe(false);
        for (const name of packageControls) {
          expect(form(c).get(name)!.enabled).toBe(true);
        }
        form(c).get('package')?.setValue('Thrive');
        c.save();
        const payload = studentService.updateStudent.mock.calls[0][0] as Student;
        expect(payload.package).toBe('Thrive');
        // In place: the start date stands and nothing is stamped for proration.
        expect(payload.package_start_date).toBe('2026-05-01T00:00:00');
        expect('mid_month_change_period' in payload).toBe(false);
        expect('mid_month_prior_charge' in payload).toBe(false);
        expect(dialogRef.close).toHaveBeenCalledWith({ openScheduleForStudentId: 's-1' });
      });

      it('a corrected package wins over a simultaneous new scheduled change', () => {
        const c = build({ mode: 'edit', student: enrolled() });
        c.toggleCorrection();
        form(c).get('package')?.setValue('Thrive');
        c.addPendingChange();
        c.pendingRows.at(0).patchValue({ package: 'Achieve' });
        c.save();
        expect(dialogRef.close).toHaveBeenCalledWith({ openScheduleForStudentId: 's-1' });
      });

      it('unlocking without changing the package closes normally', () => {
        const c = build({ mode: 'edit', student: enrolled() });
        c.toggleCorrection();
        c.save();
        expect(dialogRef.close).toHaveBeenCalledWith(true);
      });

      it('cancelling the correction restores the stored values and locks again', () => {
        const c = build({
          mode: 'edit',
          student: enrolled({
            package: 'Custom', custom_monthly_cost: 400, custom_sessions_per_week: 2, custom_session_length_min: 45,
          }),
        });
        c.toggleCorrection();
        form(c).patchValue({
          package: 'Thrive', custom_monthly_cost: 1, custom_sessions_per_week: 9, custom_session_length_min: 9,
        });
        c.toggleCorrection();
        expect(lock(c).packageLocked).toBe(true);
        expect(form(c).getRawValue()).toEqual(expect.objectContaining({
          package: 'Custom', custom_monthly_cost: 400, custom_sessions_per_week: 2, custom_session_length_min: 45,
        }));
        expect(form(c).get('package')!.disabled).toBe(true);
      });

      it('restores blanks for values the student never had', () => {
        const c = build({ mode: 'edit', student: enrolled() });
        c.toggleCorrection();
        form(c).patchValue({ custom_monthly_cost: 5 });
        c.toggleCorrection();
        expect(form(c).getRawValue()).toEqual(expect.objectContaining({
          package: 'Succeed', custom_monthly_cost: null, custom_sessions_per_week: null,
          custom_session_length_min: null,
        }));
      });
    });
  });

  it('cancel closes the dialog', () => {
    const c = build({ mode: 'edit', student: { id: 's-1', name: 'Pat' } as Student });
    c.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  describe('date helpers', () => {
    const helpers = (c: StudentDialog) =>
      c as unknown as {
        toDate(value?: string | null): Date | null;
        toDateString(value?: Date | string | null): string | undefined;
      };

    it('toDate returns null for empty input and a local date otherwise', () => {
      const c = build({ mode: 'create' });
      expect(helpers(c).toDate(null)).toBeNull();
      expect(helpers(c).toDate('')).toBeNull();
      const d = helpers(c).toDate('2015-05-05')!;
      expect(d.getFullYear()).toBe(2015);
      expect(d.getMonth()).toBe(4); // 0-based May
      expect(d.getDate()).toBe(5);
    });

    it('toDateString passes strings through, formats Dates, and drops empty values', () => {
      const c = build({ mode: 'create' });
      expect(helpers(c).toDateString(null)).toBeUndefined();
      expect(helpers(c).toDateString('2020-01-02')).toBe('2020-01-02');
      expect(helpers(c).toDateString(new Date(2020, 0, 2))).toBe('2020-01-02');
    });
  });

  describe('make-up ledger editing', () => {
    it('opens the editor and patches the local student on save', () => {
      const student = {
        id: 's-1', name: 'Pat',
        make_up_batches: [{ minutes: 30, earned_date: '2026-08-01T10:00:00Z' }],
        make_up_minutes: 30,
      } as Student;
      editDialogResult = {
        make_up_batches: [{ minutes: 90, earned_date: '2026-08-20T15:00:00Z' }],
        make_up_minutes: 90,
      };
      const c = build({ mode: 'edit', student });
      c.editMakeupMinutes();
      expect(matDialog.open).toHaveBeenCalledWith(MakeupEditDialog, expect.objectContaining({
        data: { student },
      }));
      expect(student.make_up_minutes).toBe(90);
      expect(student.make_up_batches).toEqual([{ minutes: 90, earned_date: '2026-08-20T15:00:00Z' }]);
    });

    it('a cancelled editor leaves the student untouched', () => {
      const student = { id: 's-1', name: 'Pat', make_up_minutes: 30 } as Student;
      editDialogResult = null;
      const c = build({ mode: 'edit', student });
      c.editMakeupMinutes();
      expect(student.make_up_minutes).toBe(30);
    });

    it('no-ops without a student record', () => {
      matDialog.open.mockClear();
      const c = build({ mode: 'create' });
      c.editMakeupMinutes();
      expect(matDialog.open).not.toHaveBeenCalled();
    });
  });

  describe('edit — leaving Active status (upcoming sessions cleanup)', () => {
    const active = (): Student =>
      ({
        id: 's-1',
        contact_id: 'c-1',
        name: 'Pat',
        status: StudentStatus.ACTIVE_STUDENT,
        onboarding_complete: true,
      }) as Student;
    const pendingSessions = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `x-${i}`, type: 'TUTORING', status: 'Pending' }));
    const pub = (c: StudentDialog) =>
      c as unknown as {
        showDeactivateConfirm: boolean;
        upcomingSessionCount: number | null;
        deleteSessionsFailed: boolean;
      };

    beforeEach(() => {
      studentService.updateStudent.mockReturnValue(of({}));
    });

    it('prompts with the count and saves nothing yet', () => {
      scheduleService.futurePendingTutoring.mockReturnValue(of(pendingSessions(3) as never));
      const c = build({ mode: 'edit', student: active() });
      form(c).get('status')?.setValue(StudentStatus.PAST_STUDENT);
      c.save();
      expect(scheduleService.futurePendingTutoring).toHaveBeenCalledWith('s-1');
      expect(pub(c).showDeactivateConfirm).toBe(true);
      expect(pub(c).upcomingSessionCount).toBe(3);
      expect(priv(c).submitting).toBe(false);
      expect(studentService.updateStudent).not.toHaveBeenCalled();
    });

    it('Go Back keeps the dialog open and unsaved', () => {
      scheduleService.futurePendingTutoring.mockReturnValue(of(pendingSessions(1) as never));
      const c = build({ mode: 'edit', student: active() });
      form(c).get('status')?.setValue(StudentStatus.MIA);
      c.save();
      c.cancelDeactivation();
      expect(pub(c).showDeactivateConfirm).toBe(false);
      expect(studentService.updateStudent).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('confirming saves the student, deletes the upcoming sessions, then closes', () => {
      scheduleService.futurePendingTutoring.mockReturnValue(of(pendingSessions(2) as never));
      scheduleService.deleteFuturePendingSessions.mockReturnValue(of(2));
      const c = build({ mode: 'edit', student: active() });
      form(c).get('status')?.setValue(StudentStatus.PAST_STUDENT);
      c.save();
      c.confirmDeactivation();
      expect(studentService.updateStudent).toHaveBeenCalledTimes(1);
      expect((studentService.updateStudent.mock.calls[0][0] as Student).status).toBe(StudentStatus.PAST_STUDENT);
      expect(scheduleService.deleteFuturePendingSessions).toHaveBeenCalledWith('s-1');
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('saves straight away when there are no upcoming sessions', () => {
      scheduleService.futurePendingTutoring.mockReturnValue(of([] as never));
      const c = build({ mode: 'edit', student: active() });
      form(c).get('status')?.setValue(StudentStatus.DECLINED_SERVICES);
      c.save();
      expect(pub(c).showDeactivateConfirm).toBe(false);
      expect(studentService.updateStudent).toHaveBeenCalledTimes(1);
      expect(scheduleService.deleteFuturePendingSessions).toHaveBeenCalledWith('s-1');
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('does not prompt when the status stays Active', () => {
      const c = build({ mode: 'edit', student: active() });
      form(c).get('name')?.setValue('Pat B');
      c.save();
      expect(scheduleService.futurePendingTutoring).not.toHaveBeenCalled();
      expect(scheduleService.deleteFuturePendingSessions).not.toHaveBeenCalled();
      expect(studentService.updateStudent).toHaveBeenCalledTimes(1);
    });

    it('does not prompt when the student was not Active before', () => {
      const d = build({ mode: 'edit', student: { ...active(), status: StudentStatus.ONBOARDING } });
      form(d).get('status')?.setValue(StudentStatus.MIA);
      d.save();
      expect(scheduleService.futurePendingTutoring).not.toHaveBeenCalled();
      expect(scheduleService.deleteFuturePendingSessions).not.toHaveBeenCalled();
      expect(studentService.updateStudent).toHaveBeenCalledTimes(1);
    });

    it('still prompts (without a count) when the count fails', () => {
      scheduleService.futurePendingTutoring.mockReturnValue(throwError(() => new Error('x')));
      const c = build({ mode: 'edit', student: active() });
      form(c).get('status')?.setValue(StudentStatus.PAST_STUDENT);
      c.save();
      expect(pub(c).showDeactivateConfirm).toBe(true);
      expect(pub(c).upcomingSessionCount).toBeNull();
      expect(studentService.updateStudent).not.toHaveBeenCalled();
    });

    it('a failed cleanup after the save surfaces Retry and Close', () => {
      scheduleService.futurePendingTutoring.mockReturnValue(of(pendingSessions(1) as never));
      scheduleService.deleteFuturePendingSessions.mockReturnValue(throwError(() => new Error('x')));
      const c = build({ mode: 'edit', student: active() });
      form(c).get('status')?.setValue(StudentStatus.PAST_STUDENT);
      c.save();
      c.confirmDeactivation();
      expect(studentService.updateStudent).toHaveBeenCalledTimes(1);
      expect(pub(c).deleteSessionsFailed).toBe(true);
      expect(priv(c).errorMessage).toBe('Student saved, but removing the upcoming sessions failed.');
      expect(dialogRef.close).not.toHaveBeenCalled();

      scheduleService.deleteFuturePendingSessions.mockReturnValue(of(1));
      c.retryDeleteSessions();
      expect(studentService.updateStudent).toHaveBeenCalledTimes(1); // never re-saved
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('Close after a failed cleanup still closes as saved', () => {
      scheduleService.futurePendingTutoring.mockReturnValue(of(pendingSessions(1) as never));
      scheduleService.deleteFuturePendingSessions.mockReturnValue(throwError(() => new Error('x')));
      const c = build({ mode: 'edit', student: active() });
      form(c).get('status')?.setValue(StudentStatus.PAST_STUDENT);
      c.save();
      c.confirmDeactivation();
      c.closeAfterSaveWithoutCleanup();
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });
  });

  describe('custom pricing', () => {
    const enrolled = (over: Partial<Student> = {}): Student => ({
      id: 's-1',
      contact_id: 'c-1',
      name: 'Pat',
      status: StudentStatus.ACTIVE_STUDENT,
      onboarding_complete: true,
      package: 'Succeed',
      ...over,
    } as Student);
    const pricing = (c: StudentDialog) =>
      c as unknown as { showPricing: boolean; showPriceOverride: boolean; pricingPreview: string };
    const saved = (): Student => studentService.updateStudent.mock.calls.at(-1)![0];

    beforeEach(() => {
      studentService.updateStudent.mockReturnValue(of({} as Student));
      billingService.previewStatement.mockReturnValue(of({ statement: null }));
    });

    afterEach(() => jest.useRealTimers());

    it('loads the stored values', () => {
      const c = build({
        mode: 'edit',
        student: enrolled({ price_override: 410.4, discount_percent: 10, discount_reason: 'Staff' }),
      });
      expect(form(c).get('price_override')?.value).toBe(410.4);
      expect(form(c).get('discount_percent')?.value).toBe(10);
      expect(form(c).get('discount_reason')?.value).toBe('Staff');
    });

    it('is offered only to an enrolled, unlocked student being edited', () => {
      expect(pricing(build({ mode: 'edit', student: enrolled() })).showPricing).toBe(true);
      TestBed.resetTestingModule();
      expect(pricing(build({ mode: 'edit', student: enrolled({ package: '' }) })).showPricing).toBe(false);
      TestBed.resetTestingModule();
      expect(pricing(build({ mode: 'create' })).showPricing).toBe(false);
      TestBed.resetTestingModule();
      expect(pricing(build({
        mode: 'edit',
        student: enrolled({ status: StudentStatus.ONBOARDING, onboarding_complete: false }),
      })).showPricing).toBe(false);
    });

    it('hides the custom price on a Custom package (it has its own)', () => {
      expect(pricing(build({ mode: 'edit', student: enrolled() })).showPriceOverride).toBe(true);
      TestBed.resetTestingModule();
      expect(pricing(build({ mode: 'edit', student: enrolled({ package: 'Custom' }) })).showPriceOverride)
        .toBe(false);
    });

    it('a plain save sends no pricing keys', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      c.save();
      expect('price_override' in saved()).toBe(false);
      expect('discount_percent' in saved()).toBe(false);
      expect('discount_reason' in saved()).toBe(false);
    });

    it('saves a custom price and a discount with its trimmed reason', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      form(c).patchValue({ price_override: '410.40', discount_percent: 10, discount_reason: '  Staff  ' });
      c.save();
      expect(saved().price_override).toBe(410.4);
      expect(saved().discount_percent).toBe(10);
      expect(saved().discount_reason).toBe('Staff');
    });

    it('saves a $0 custom price', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      form(c).patchValue({ price_override: 0 });
      c.save();
      expect(saved().price_override).toBe(0);
    });

    it('a discount without a reason sends a blank reason', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      form(c).patchValue({ discount_percent: 5, discount_reason: null });
      c.save();
      expect(saved().discount_percent).toBe(5);
      expect(saved().discount_reason).toBe('');
    });

    it('blanking stored values sends null to clear them', () => {
      const c = build({
        mode: 'edit',
        student: enrolled({ price_override: 410.4, discount_percent: 10, discount_reason: 'Staff' }),
      });
      form(c).patchValue({ price_override: null, discount_percent: '' });
      c.save();
      expect(saved().price_override).toBeNull();
      expect(saved().discount_percent).toBeNull();
      expect('discount_reason' in saved()).toBe(false);
    });

    it('a 0% discount clears a stored one and is otherwise omitted', () => {
      const c1 = build({ mode: 'edit', student: enrolled({ discount_percent: 10 }) });
      form(c1).patchValue({ discount_percent: 0 });
      c1.save();
      expect(saved().discount_percent).toBeNull();
      TestBed.resetTestingModule();
      const c2 = build({ mode: 'edit', student: enrolled() });
      form(c2).patchValue({ discount_percent: 0, discount_reason: 'x' });
      c2.save();
      expect('discount_percent' in saved()).toBe(false);
      expect('discount_reason' in saved()).toBe(false);
    });

    it('a Custom package clears a stored custom price and never sends a new one', () => {
      const c1 = build({ mode: 'edit', student: enrolled({ package: 'Custom', price_override: 300 }) });
      c1.save();
      expect(saved().price_override).toBeNull();
      TestBed.resetTestingModule();
      const c2 = build({ mode: 'edit', student: enrolled({ package: 'Custom' }) });
      form(c2).patchValue({ price_override: 300 });
      c2.save();
      expect('price_override' in saved()).toBe(false);
    });

    it('ignores a non-numeric custom price', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      form(c).patchValue({ price_override: 'abc' });
      c.save();
      expect('price_override' in saved()).toBe(false);
    });

    it('rejects a negative price or an out-of-range discount', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      form(c).patchValue({ price_override: -1 });
      c.save();
      expect(priv(c).errorMessage).toBe('The custom monthly price must be $0 or more.');
      form(c).patchValue({ price_override: null, discount_percent: 101 });
      c.save();
      expect(priv(c).errorMessage).toBe('The discount must be between 0 and 100 percent.');
      form(c).patchValue({ discount_percent: -1 });
      c.save();
      expect(priv(c).errorMessage).toBe('The discount must be between 0 and 100 percent.');
      expect(studentService.updateStudent).not.toHaveBeenCalled();
      form(c).patchValue({ discount_percent: 100 });
      c.save();
      expect(studentService.updateStudent).toHaveBeenCalled();
    });

    describe('live preview', () => {
      beforeEach(() => jest.useFakeTimers());

      it('re-prices this month once the fields settle', () => {
        billingService.previewStatement.mockReturnValue(of({
          statement: statement({
            lines: [
              statementLine({ student_id: 's-1', net: 300.1 }),
              statementLine({ student_id: 's-1', net: 110.3 }),
              statementLine({ student_id: 's-2', net: 273 }),
            ],
            total: 683.4,
          }),
        }));
        const c = build({ mode: 'edit', student: enrolled({ discount_reason: 'Staff' }) });
        form(c).patchValue({ price_override: 456 });
        form(c).patchValue({ discount_percent: 10 });
        jest.advanceTimersByTime(399);
        expect(billingService.previewStatement).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(billingService.previewStatement).toHaveBeenCalledTimes(1);
        const now = new Date();
        const [month, draft] = billingService.previewStatement.mock.calls[0];
        expect(month).toBe(monthKey(now.getFullYear(), now.getMonth()));
        expect(draft).toEqual(expect.objectContaining({
          id: 's-1', package: 'Succeed', price_override: 456, discount_percent: 10, discount_reason: 'Staff',
        }));
        expect(pricing(c).pricingPreview).toBe('This month: Pat $410.40 · family total $683.40');
      });

      it('clears when the family would owe nothing or the preview fails', () => {
        const c = build({ mode: 'edit', student: enrolled() });
        (c as unknown as { pricingPreview: string }).pricingPreview = 'old';
        form(c).patchValue({ discount_percent: 10 });
        jest.advanceTimersByTime(400);
        expect(pricing(c).pricingPreview).toBe('');

        (c as unknown as { pricingPreview: string }).pricingPreview = 'old';
        billingService.previewStatement.mockReturnValue(throwError(() => new Error('boom')));
        form(c).patchValue({ discount_percent: 20 });
        jest.advanceTimersByTime(400);
        expect(pricing(c).pricingPreview).toBe('');
        // A failed preview never stops later ones.
        billingService.previewStatement.mockReturnValue(of({ statement: statement({ lines: [], total: 75 }) }));
        form(c).patchValue({ discount_percent: 30 });
        jest.advanceTimersByTime(400);
        expect(pricing(c).pricingPreview).toBe('This month: Pat $0.00 · family total $75.00');
      });

      it('skips invalid fields and a package that is being changed', () => {
        const c = build({ mode: 'edit', student: enrolled() });
        form(c).patchValue({ discount_percent: 150 });
        jest.advanceTimersByTime(400);
        form(c).patchValue({ discount_percent: null, price_override: -5 });
        jest.advanceTimersByTime(400);
        form(c).patchValue({ price_override: 100, package: 'Thrive' });
        jest.advanceTimersByTime(400);
        expect(billingService.previewStatement).not.toHaveBeenCalled();
        expect(pricing(c).pricingPreview).toBe('');
      });

      it('never previews an unsaved student', () => {
        const c1 = build({ mode: 'create' });
        form(c1).patchValue({ discount_percent: 10 });
        jest.advanceTimersByTime(400);
        TestBed.resetTestingModule();
        const c2 = build({ mode: 'edit', student: enrolled({ id: undefined }) });
        form(c2).patchValue({ discount_percent: 10 });
        jest.advanceTimersByTime(400);
        expect(billingService.previewStatement).not.toHaveBeenCalled();
      });
    });
  });

  describe('end of service', () => {
    const key = (d: Date): string =>
      `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const inDays = (n: number): Date => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
    const inMonths = (n: number): Date => new Date(today.getFullYear(), today.getMonth() + n, today.getDate());
    const active = (over: Partial<Student> = {}): Student => ({
      id: 's-1',
      contact_id: 'c-1',
      name: 'Pat',
      status: StudentStatus.ACTIVE_STUDENT,
      onboarding_complete: true,
      package: 'Succeed',
      ...over,
    } as Student);
    const view = (c: StudentDialog) =>
      c as unknown as {
        showServiceEnd: boolean;
        shortNotice: boolean;
        endDateLabel: string;
        confirmingEndDate: boolean;
        showDeactivateConfirm: boolean;
        upcomingSessionCount: number | null;
        endStatusOptions: string[];
      };
    const saved = (): Student => studentService.updateStudent.mock.calls.at(-1)![0];
    const pending = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `x-${i}`, type: 'TUTORING', status: 'Pending' }));

    beforeEach(() => {
      studentService.updateStudent.mockReturnValue(of({}));
      scheduleService.futurePendingTutoring.mockReturnValue(of([]));
      scheduleService.deleteFuturePendingSessions.mockReturnValue(of(0));
      scheduleService.fillAhead.mockReturnValue(of(null));
    });

    it('is offered to a student in service, or one carrying an end date', () => {
      expect(view(build({ mode: 'edit', student: active() })).showServiceEnd).toBe(true);
      TestBed.resetTestingModule();
      expect(view(build({
        mode: 'edit',
        student: active({ status: StudentStatus.PAST_STUDENT, service_end_date: '2026-01-31' }),
      })).showServiceEnd).toBe(true);
      TestBed.resetTestingModule();
      expect(view(build({ mode: 'edit', student: active({ status: StudentStatus.PAST_STUDENT }) })).showServiceEnd)
        .toBe(false);
      TestBed.resetTestingModule();
      expect(view(build({ mode: 'create' })).showServiceEnd).toBe(false);
      TestBed.resetTestingModule();
      expect(view(build({
        mode: 'edit',
        student: active({ status: StudentStatus.ONBOARDING, onboarding_complete: false }),
      })).showServiceEnd).toBe(false);
    });

    it('offers only the statuses that follow service', () => {
      expect(view(build({ mode: 'edit', student: active() })).endStatusOptions).toEqual([
        StudentStatus.PAST_STUDENT, StudentStatus.MIA, StudentStatus.DECLINED_SERVICES,
      ]);
    });

    it('loads the stored end date and end status', () => {
      const c = build({
        mode: 'edit',
        student: active({ service_end_date: '2026-10-15T00:00:00', end_status: StudentStatus.MIA }),
      });
      expect(form(c).get('service_end_date')?.value).toEqual(new Date(2026, 9, 15));
      expect(form(c).get('end_status')?.value).toBe(StudentStatus.MIA);
      expect(view(c).endDateLabel).toBe('Oct 15, 2026');
    });

    it('defaults the end status to Past Student and has no label when blank', () => {
      const c = build({ mode: 'edit', student: active() });
      expect(form(c).get('end_status')?.value).toBe(StudentStatus.PAST_STUDENT);
      expect(form(c).get('service_end_date')?.value).toBeNull();
      expect(view(c).endDateLabel).toBe('');
    });

    it('a plain save sends no end-of-service keys', () => {
      const c = build({ mode: 'edit', student: active() });
      c.save();
      expect('service_end_date' in saved()).toBe(false);
      expect('end_status' in saved()).toBe(false);
      expect(scheduleService.futurePendingTutoring).not.toHaveBeenCalled();
      expect(scheduleService.fillAhead).not.toHaveBeenCalled();
    });

    describe('short notice', () => {
      it('warns under one month and never blocks', () => {
        const c = build({ mode: 'edit', student: active() });
        expect(view(c).shortNotice).toBe(false);
        form(c).get('service_end_date')?.setValue(inDays(10));
        expect(view(c).shortNotice).toBe(true);
        c.save();
        expect(studentService.updateStudent).toHaveBeenCalled();
      });

      it('is satisfied by exactly one month', () => {
        const c = build({ mode: 'edit', student: active() });
        form(c).get('service_end_date')?.setValue(inMonths(1));
        expect(view(c).shortNotice).toBe(false);
        form(c).get('service_end_date')?.setValue(new Date(inMonths(1).getTime() - 24 * 60 * 60 * 1000));
        expect(view(c).shortNotice).toBe(true);
      });

      it('stays quiet for an end date that was already saved', () => {
        const soon = key(inDays(5));
        const c = build({ mode: 'edit', student: active({ service_end_date: soon }) });
        expect(view(c).shortNotice).toBe(false);
      });
    });

    describe('setting an end date', () => {
      it('saves the date and status without a prompt when nothing is scheduled after it', () => {
        const c = build({ mode: 'edit', student: active() });
        const end = inMonths(2);
        form(c).patchValue({ service_end_date: end, end_status: StudentStatus.DECLINED_SERVICES });
        c.save();
        expect(scheduleService.futurePendingTutoring).toHaveBeenCalledWith(
          's-1', expect.any(Date), { from: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1) },
        );
        expect(view(c).showDeactivateConfirm).toBe(false);
        expect(saved().service_end_date).toBe(key(end));
        expect(saved().end_status).toBe(StudentStatus.DECLINED_SERVICES);
        expect(saved().status).toBe(StudentStatus.ACTIVE_STUDENT);
        expect(dialogRef.close).toHaveBeenCalledWith(true);
      });

      it('falls back to Past Student when the end status is blank', () => {
        const c = build({ mode: 'edit', student: active() });
        form(c).patchValue({ service_end_date: inMonths(2), end_status: '' });
        c.save();
        expect(saved().end_status).toBe(StudentStatus.PAST_STUDENT);
      });

      it('prompts with the sessions after the date, then saves and removes them', () => {
        scheduleService.futurePendingTutoring.mockReturnValue(of(pending(4) as never));
        scheduleService.deleteFuturePendingSessions.mockReturnValue(of(4));
        const c = build({ mode: 'edit', student: active() });
        const end = inMonths(2);
        const from = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
        form(c).get('service_end_date')?.setValue(end);
        c.save();
        expect(view(c).showDeactivateConfirm).toBe(true);
        expect(view(c).confirmingEndDate).toBe(true);
        expect(view(c).upcomingSessionCount).toBe(4);
        expect(studentService.updateStudent).not.toHaveBeenCalled();

        c.confirmDeactivation();
        expect(saved().service_end_date).toBe(key(end));
        expect(scheduleService.deleteFuturePendingSessions).toHaveBeenCalledWith('s-1', expect.any(Date), { from });
        expect(dialogRef.close).toHaveBeenCalledWith(true);
      });

      it('an unchanged end date never prompts again', () => {
        const end = key(inMonths(2));
        const c = build({ mode: 'edit', student: active({ service_end_date: end }) });
        c.save();
        expect(scheduleService.futurePendingTutoring).not.toHaveBeenCalled();
        expect(saved().service_end_date).toBe(end);
        expect(saved().end_status).toBe(StudentStatus.PAST_STUDENT);
      });

      it('moving a stored end date prompts for the new one', () => {
        const c = build({ mode: 'edit', student: active({ service_end_date: key(inMonths(3)) }) });
        form(c).get('service_end_date')?.setValue(inMonths(2));
        c.save();
        expect(scheduleService.futurePendingTutoring).toHaveBeenCalledTimes(1);
        expect(saved().service_end_date).toBe(key(inMonths(2)));
      });
    });

    describe('clearing an end date', () => {
      it('sends null and refills the calendar', () => {
        const c = build({
          mode: 'edit',
          student: active({ service_end_date: key(inMonths(2)), end_status: StudentStatus.MIA }),
        });
        form(c).get('service_end_date')?.setValue(null);
        c.save();
        expect(saved().service_end_date).toBeNull();
        expect('end_status' in saved()).toBe(false);
        expect(scheduleService.futurePendingTutoring).not.toHaveBeenCalled();
        expect(scheduleService.fillAhead).toHaveBeenCalledWith(saved());
        expect(dialogRef.close).toHaveBeenCalledWith(true);
      });
    });

    describe('leaving Active', () => {
      it('ends service today and records the new status as the end status', () => {
        const c = build({ mode: 'edit', student: active() });
        form(c).get('status')?.setValue(StudentStatus.MIA);
        c.save();
        expect(view(c).confirmingEndDate).toBe(false);
        expect(scheduleService.futurePendingTutoring).toHaveBeenCalledWith('s-1');
        expect(saved().status).toBe(StudentStatus.MIA);
        expect(saved().service_end_date).toBe(key(today));
        expect(saved().end_status).toBe(StudentStatus.MIA);
      });

      it('pulls a future end date back to today', () => {
        const c = build({ mode: 'edit', student: active({ service_end_date: key(inMonths(2)) }) });
        form(c).get('status')?.setValue(StudentStatus.PAST_STUDENT);
        c.save();
        expect(saved().service_end_date).toBe(key(today));
      });

      it('keeps an end date that already passed', () => {
        const past = key(inDays(-3));
        const c = build({ mode: 'edit', student: active({ service_end_date: past }) });
        form(c).get('status')?.setValue(StudentStatus.PAST_STUDENT);
        c.save();
        expect(saved().service_end_date).toBe(past);
      });

      it('removes every upcoming session, not only those after a date', () => {
        scheduleService.futurePendingTutoring.mockReturnValue(of(pending(2) as never));
        const c = build({ mode: 'edit', student: active() });
        form(c).get('status')?.setValue(StudentStatus.PAST_STUDENT);
        c.save();
        c.confirmDeactivation();
        expect(scheduleService.deleteFuturePendingSessions).toHaveBeenCalledWith('s-1');
      });

      it('going back to Onboarding is not an end of service', () => {
        const c = build({ mode: 'edit', student: active() });
        form(c).get('status')?.setValue(StudentStatus.ONBOARDING);
        c.save();
        expect('service_end_date' in saved()).toBe(false);
        expect('end_status' in saved()).toBe(false);
      });
    });

    describe('a student no longer in service', () => {
      const past = (over: Partial<Student> = {}): Student =>
        active({ status: StudentStatus.PAST_STUDENT, service_end_date: '2026-01-31', ...over });

      it('keeps the stored end date on an ordinary save', () => {
        const c = build({ mode: 'edit', student: past() });
        form(c).get('service_end_date')?.setValue(inMonths(2));
        c.save();
        expect(saved().service_end_date).toBe('2026-01-31');
        expect('end_status' in saved()).toBe(false);
        expect(scheduleService.futurePendingTutoring).not.toHaveBeenCalled();
      });

      it('returning to Active clears a past end date and refills the calendar', () => {
        const c = build({ mode: 'edit', student: past() });
        form(c).get('status')?.setValue(StudentStatus.ACTIVE_STUDENT);
        c.save();
        expect(saved().service_end_date).toBeNull();
        expect('end_status' in saved()).toBe(false);
        expect(scheduleService.fillAhead).toHaveBeenCalled();
      });

      it('returning to Active with a new future end date keeps it', () => {
        const c = build({ mode: 'edit', student: past() });
        const end = inMonths(3);
        form(c).patchValue({ status: StudentStatus.ACTIVE_STUDENT, service_end_date: end });
        c.save();
        expect(saved().service_end_date).toBe(key(end));
        expect(saved().end_status).toBe(StudentStatus.PAST_STUDENT);
        expect(scheduleService.fillAhead).not.toHaveBeenCalled();
      });

      it('a past student without an end date sends nothing', () => {
        const c = build({ mode: 'edit', student: past({ service_end_date: undefined }) });
        c.save();
        expect('service_end_date' in saved()).toBe(false);
      });
    });
  });

  describe('a scheduled change with a schedule is removed or re-dated', () => {
    const monday = [{ weekday: Weekday.MONDAY, start_time: '10:00', end_time: '10:30' }];
    const enrolled = (over: Partial<Student> = {}): Student => ({
      id: 's-1',
      contact_id: 'c-1',
      name: 'Pat',
      status: StudentStatus.ACTIVE_STUDENT,
      onboarding_complete: true,
      package: 'Determination',
      package_start_date: '2026-05-01T00:00:00',
      pending_changes: [
        { package: 'Succeed', effective: '2026-10-14', schedule: monday },
        { package: 'Achieve', effective: '2026-11-20', schedule: monday },
      ],
      ...over,
    } as Student);
    const view = (c: StudentDialog) =>
      c as unknown as {
        showDeactivateConfirm: boolean;
        confirmingRebuild: boolean;
        confirmingEndDate: boolean;
        rebuildLabel: string;
        upcomingSessionCount: number | null;
        deleteSessionsFailed: boolean;
      };
    const pending = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `x-${i}`, type: 'TUTORING', status: 'Pending' }));

    beforeEach(() => {
      // The fixture's change dates are fixed; pin the clock so they stay in
      // the future (a change may only be moved to tomorrow or later).
      jest.useFakeTimers().setSystemTime(new Date(2026, 8, 1, 12, 0));
      studentService.updateStudent.mockReturnValue(of({} as Student));
    });

    afterEach(() => jest.useRealTimers());

    it('an untouched list never prompts or rebuilds', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      c.save();
      expect(scheduleService.futurePendingTutoring).not.toHaveBeenCalled();
      expect(scheduleService.rebuildFrom).not.toHaveBeenCalled();
      expect(view(c).rebuildLabel).toBe('');
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('removing a change prompts with the sessions from its date, saves, removes and rebuilds', () => {
      scheduleService.futurePendingTutoring.mockReturnValue(of(pending(5) as never));
      scheduleService.deleteFuturePendingSessions.mockReturnValue(of(5));
      const c = build({ mode: 'edit', student: enrolled() });
      c.removePendingChange(1);
      c.save();
      expect(scheduleService.futurePendingTutoring).toHaveBeenCalledWith(
        's-1', expect.any(Date), { from: new Date(2026, 10, 20) },
      );
      expect(view(c).showDeactivateConfirm).toBe(true);
      expect(view(c).confirmingRebuild).toBe(true);
      expect(view(c).confirmingEndDate).toBe(false);
      expect(view(c).rebuildLabel).toBe('Nov 20, 2026');
      expect(view(c).upcomingSessionCount).toBe(5);
      expect(studentService.updateStudent).not.toHaveBeenCalled();

      c.confirmDeactivation();
      expect(studentService.updateStudent).toHaveBeenCalledTimes(1);
      expect(scheduleService.deleteFuturePendingSessions).toHaveBeenCalledWith(
        's-1', expect.any(Date), { from: new Date(2026, 10, 20) },
      );
      expect(scheduleService.rebuildFrom).toHaveBeenCalledWith('s-1', '2026-11-20');
      expect(
        scheduleService.deleteFuturePendingSessions.mock.invocationCallOrder[0],
      ).toBeLessThan(scheduleService.rebuildFrom.mock.invocationCallOrder[0]);
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('rebuilds from the earliest affected change', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      c.removePendingChange(1);
      c.removePendingChange(0);
      c.save();
      expect(scheduleService.rebuildFrom).toHaveBeenCalledWith('s-1', '2026-10-14');
    });

    it('moving a change later rebuilds from its old date; earlier, from its new date', () => {
      const c1 = build({ mode: 'edit', student: enrolled() });
      c1.pendingRows.at(0).patchValue({ effective: new Date(2026, 9, 28) });
      c1.save();
      expect(scheduleService.rebuildFrom).toHaveBeenLastCalledWith('s-1', '2026-10-14');

      TestBed.resetTestingModule();
      const c2 = build({ mode: 'edit', student: enrolled() });
      c2.pendingRows.at(0).patchValue({ effective: new Date(2026, 9, 5) });
      c2.save();
      expect(scheduleService.rebuildFrom).toHaveBeenLastCalledWith('s-1', '2026-10-05');
    });

    it('a change that loses its schedule rebuilds, then opens the pending-schedule dialog', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      c.pendingRows.at(0).get('package')!.setValue('Excel');
      c.save();
      expect(scheduleService.rebuildFrom).toHaveBeenCalledWith('s-1', '2026-10-14');
      expect(dialogRef.close).toHaveBeenCalledWith({
        openPendingScheduleFor: { studentId: 's-1', effective: '2026-10-14' },
      });
    });

    it('with nothing to remove it still rebuilds, without a prompt', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      c.removePendingChange(1);
      c.save();
      expect(view(c).showDeactivateConfirm).toBe(false);
      expect(scheduleService.rebuildFrom).toHaveBeenCalledWith('s-1', '2026-11-20');
    });

    it('changes without a schedule generated nothing: no rebuild', () => {
      const c = build({
        mode: 'edit',
        student: enrolled({
          pending_changes: [
            { package: 'Succeed', effective: '2026-10-14' },
            { package: 'Achieve', effective: '2026-11-20', schedule: [] },
          ],
        }),
      });
      c.removePendingChange(1);
      c.pendingRows.at(0).patchValue({ effective: new Date(2026, 9, 20), schedule: monday });
      c.removePendingChange(0);
      c.save();
      expect(scheduleService.rebuildFrom).not.toHaveBeenCalled();
    });

    it('a price-only edit keeps the sessions', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      c.pendingRows.at(0).patchValue({ price_mode: 'custom', price_override: 300 });
      c.save();
      expect(scheduleService.rebuildFrom).not.toHaveBeenCalled();
      expect(scheduleService.futurePendingTutoring).not.toHaveBeenCalled();
    });

    it('a new end date earlier than the affected change wins the window and still rebuilds', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      c.removePendingChange(1);
      form(c).get('service_end_date')!.setValue(new Date(2026, 9, 31));
      c.save();
      // The day after the end date, Nov 1, is earlier than Nov 20.
      expect(scheduleService.deleteFuturePendingSessions).toHaveBeenCalledWith(
        's-1', expect.any(Date), { from: new Date(2026, 10, 1) },
      );
      expect(scheduleService.rebuildFrom).toHaveBeenCalledWith('s-1', '2026-11-01');
    });

    it('an end date later than the affected change leaves the change date in charge', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      c.removePendingChange(1);
      form(c).get('service_end_date')!.setValue(new Date(2026, 11, 15));
      c.save();
      expect(scheduleService.rebuildFrom).toHaveBeenCalledWith('s-1', '2026-11-20');
    });

    it('leaving Active deletes everything upcoming and rebuilds nothing', () => {
      const c = build({ mode: 'edit', student: enrolled() });
      c.removePendingChange(1);
      form(c).get('status')!.setValue(StudentStatus.PAST_STUDENT);
      c.save();
      expect(view(c).confirmingRebuild).toBe(false);
      expect(scheduleService.deleteFuturePendingSessions).toHaveBeenCalledWith('s-1');
      expect(scheduleService.rebuildFrom).not.toHaveBeenCalled();
    });

    it('a student who is not Active is left alone', () => {
      const c = build({ mode: 'edit', student: enrolled({ status: StudentStatus.PAST_STUDENT }) });
      c.removePendingChange(1);
      c.save();
      expect(scheduleService.rebuildFrom).not.toHaveBeenCalled();
      expect(scheduleService.futurePendingTutoring).not.toHaveBeenCalled();
    });

    it('a failed rebuild keeps the dialog open with a retry that rebuilds again', () => {
      scheduleService.rebuildFrom.mockReturnValueOnce(throwError(() => new Error('boom')) as never);
      const c = build({ mode: 'edit', student: enrolled() });
      c.removePendingChange(1);
      c.save();
      expect(view(c).deleteSessionsFailed).toBe(true);
      expect(priv(c).errorMessage).toBe('Student saved, but rebuilding the upcoming sessions failed.');
      expect(priv(c).submitting).toBe(false);
      expect(dialogRef.close).not.toHaveBeenCalled();

      c.retryDeleteSessions();
      expect(scheduleService.rebuildFrom).toHaveBeenCalledTimes(2);
      expect(studentService.updateStudent).toHaveBeenCalledTimes(1);
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('a failed removal never rebuilds', () => {
      scheduleService.deleteFuturePendingSessions.mockReturnValueOnce(throwError(() => new Error('x')) as never);
      const c = build({ mode: 'edit', student: enrolled() });
      c.removePendingChange(1);
      c.save();
      expect(scheduleService.rebuildFrom).not.toHaveBeenCalled();
      expect(view(c).deleteSessionsFailed).toBe(true);
    });
  });
});
