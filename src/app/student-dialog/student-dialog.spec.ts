import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { StudentDialog, StudentDialogData } from './student-dialog';
import { StudentService } from '../services/student.service';
import { Student } from '../models/student.model';
import { Status } from '../enums/status.enum';
import { Package } from '../enums/package.enum';

describe('StudentDialog', () => {
  const dialogRef = { close: jest.fn() };
  const studentService = {
    createStudent: jest.fn(),
    updateStudent: jest.fn(),
    deleteStudent: jest.fn(),
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
  });

  describe('create', () => {
    it('shows only a name field and sensible defaults', () => {
      const c = build({ mode: 'create' });
      expect(priv(c).showOnboardingToggle).toBe(false);
      expect(form(c).get('name')?.value).toBe('');
      expect(form(c).get('status')?.value).toBe(Status.ONBOARDING);
      expect(form(c).get('onboarding_complete')?.value).toBe(false);
      expect(form(c).get('make_up_minutes')?.value).toBe(0);
      expect(form(c).get('contact_id')?.value).toBe('c-1');
    });

    it('defaults tutors to an empty list when none are provided', () => {
      const c = build({ mode: 'create', tutors: undefined as never });
      expect((c as unknown as { tutors: unknown[] }).tutors).toEqual([]);
    });

    it('does nothing when the name is empty', () => {
      const c = build({ mode: 'create' });
      c.save();
      expect(studentService.createStudent).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(form(c).get('name')?.touched).toBe(true);
    });

    it('posts a name-only onboarding student and closes', () => {
      const c = build({ mode: 'create' });
      form(c).get('name')?.setValue('Pat');
      studentService.createStudent.mockReturnValue(of({ id: 's-new' }));
      c.save();
      expect(studentService.createStudent).toHaveBeenCalledWith({
        contact_id: 'c-1',
        name: 'Pat',
        status: Status.ONBOARDING,
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
      status: Status.ONBOARDING,
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
      expect(form(c).get('status')?.value).toBe(Status.ACTIVE_STUDENT);
      expect(priv(c).locked).toBe(false);
    });

    it('unchecking complete does not change the status', () => {
      const c = build({ mode: 'edit', student: onboardingStudent() });
      c.onOnboardingCompleteChange(false);
      expect(form(c).get('status')?.value).toBe(Status.ONBOARDING);
    });

    it('an already-active student is unlocked with no onboarding toggle', () => {
      const c = build({
        mode: 'edit',
        student: onboardingStudent({ status: Status.ACTIVE_STUDENT, onboarding_complete: true }),
      });
      expect(priv(c).startedInOnboarding).toBe(false);
      expect(priv(c).showOnboardingToggle).toBe(false);
      expect(priv(c).locked).toBe(false);
    });

    it('completing onboarding on an already-active student leaves the status alone', () => {
      const c = build({
        mode: 'edit',
        student: onboardingStudent({ status: Status.ACTIVE_STUDENT, onboarding_complete: true }),
      });
      c.onOnboardingCompleteChange(true);
      expect(form(c).get('status')?.value).toBe(Status.ACTIVE_STUDENT);
    });
  });

  describe('edit — save', () => {
    const richStudent = (over: Partial<Student> = {}): Student => ({
      id: 's-1',
      contact_id: 'c-1',
      name: 'Pat',
      birthday: '2015-05-05',
      status: Status.ACTIVE_STUDENT,
      onboarding_complete: true,
      assigned_tutor_id: 't-1',
      package: Package.DETERMINATION,
      scholarship: true,
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
      expect(dialogRef.close).toHaveBeenCalledWith(true);
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

    it('does nothing when the name is cleared', () => {
      const c = build({ mode: 'edit', student: richStudent() });
      form(c).get('name')?.setValue('');
      c.save();
      expect(studentService.updateStudent).not.toHaveBeenCalled();
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
});
