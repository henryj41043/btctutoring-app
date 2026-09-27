import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { TrialSessionDialog, TrialSessionDialogData } from './trial-session-dialog';
import { SessionsService } from '../services/sessions.service';
import { StudentService } from '../services/student.service';
import { SessionType } from '../enums/session-type.enum';
import { SessionStatus } from '../enums/session-status.enum';
import { Session } from '../models/session.model';
import { Student } from '../models/student.model';
import { StudentStatus } from '../enums/student-status.enum';

describe('TrialSessionDialog', () => {
  const sessionsService = { createSession: jest.fn() };
  const studentService = { updateStudent: jest.fn() };
  const dialogRef = { close: jest.fn() };

  const data = (over: Partial<TrialSessionDialogData['student']> = {}): TrialSessionDialogData => ({
    student: {
      id: 's-1',
      contact_id: 'c-1',
      name: 'Pat',
      assigned_tutor_id: 't-1',
      ...over,
    } as Student,
    tutor: { id: 't-1', first_name: 'Tess' },
    tutors: [
      { id: 't-1', first_name: 'Tess' },
      { id: 't-2', first_name: 'Christian' },
    ],
  });

  const build = (dialogData: TrialSessionDialogData = data()): TrialSessionDialog => {
    TestBed.configureTestingModule({
      imports: [TrialSessionDialog],
      providers: [
        { provide: SessionsService, useValue: sessionsService },
        { provide: StudentService, useValue: studentService },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
      ],
    });
    return TestBed.createComponent(TrialSessionDialog).componentInstance;
  };

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    sessionsService.createSession.mockReturnValue(of({ id: 'sess-9' }));
    studentService.updateStudent.mockReturnValue(of({}));
    dialogRef.close.mockClear();
  });

  it('prefills the date from the stored trial date', () => {
    const c = build(data({ trial_date: '2026-08-20' }));
    c.ngOnInit();
    const date = (c as unknown as { date: Date }).date;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(20);
  });

  it('creates a PENDING 45-minute TRIAL and syncs the trial date', () => {
    const c = build();
    c.ngOnInit();
    (c as unknown as { date: Date }).date = new Date(2026, 7, 21);
    (c as unknown as { startTime: Date }).startTime = new Date(2026, 7, 21, 10, 0);
    (c as unknown as { notes: string }).notes = 'first meeting';

    (c as unknown as { save: () => void }).save();

    const session = sessionsService.createSession.mock.calls[0][0] as Session;
    expect(session.type).toBe(SessionType.TRIAL);
    expect(session.status).toBe(SessionStatus.PENDING);
    expect(session.tutor_id).toBe('t-1');
    expect(session.tutor_name).toBe('Tess');
    expect(session.student_id).toBe('s-1');
    expect(session.student_name).toBe('Pat');
    expect(session.notes).toBe('first meeting');
    const start = new Date(session.start_datetime!);
    const end = new Date(session.end_datetime!);
    expect(end.getTime() - start.getTime()).toBe(45 * 60 * 1000);
    expect(start.getHours()).toBe(10);

    // The session's date becomes the trial date of record.
    expect(studentService.updateStudent).toHaveBeenCalledWith({
      id: 's-1', contact_id: 'c-1', name: 'Pat', trial_date: '2026-08-21',
    });
    expect(dialogRef.close).toHaveBeenCalledWith('2026-08-21');
  });

  describe('choosing the tutor', () => {
    const view = (c: TrialSessionDialog) =>
      c as unknown as {
        tutorOptions: { id: string }[];
        selectedTutorId: string | undefined;
        date: Date;
        startTime: Date;
        canSave: boolean;
        syncsTrialDate: boolean;
        save: () => void;
      };
    const prime = (c: TrialSessionDialog) => {
      view(c).date = new Date(2026, 8, 30);
      view(c).startTime = new Date(2026, 8, 30, 16, 0);
    };

    it('defaults to the assigned tutor and offers the others', () => {
      const c = build();
      c.ngOnInit();
      expect(view(c).selectedTutorId).toBe('t-1');
      expect(view(c).tutorOptions.map(t => t.id)).toEqual(['t-1', 't-2']);
    });

    it('schedules the trial with the tutor that was picked', () => {
      const c = build();
      c.ngOnInit();
      prime(c);
      view(c).selectedTutorId = 't-2';
      view(c).save();
      const session = sessionsService.createSession.mock.calls.at(-1)![0] as Session;
      expect(session.tutor_id).toBe('t-2');
      expect(session.tutor_name).toBe('Christian');
      expect(session.student_id).toBe('s-1');
    });

    it('adds an assigned tutor missing from the offered list (e.g. no longer current staff)', () => {
      const c = build({
        ...data(),
        tutor: { id: 't-9', first_name: 'Former' },
      } as TrialSessionDialogData);
      c.ngOnInit();
      expect(view(c).tutorOptions.map(t => t.id)).toEqual(['t-9', 't-1', 't-2']);
      expect(view(c).selectedTutorId).toBe('t-9');
    });

    it('requires a choice when there is no assigned tutor and several are offered', () => {
      const c = build({ ...data(), tutor: undefined } as TrialSessionDialogData);
      c.ngOnInit();
      prime(c);
      expect(view(c).selectedTutorId).toBeUndefined();
      expect(view(c).canSave).toBe(false);
      sessionsService.createSession.mockClear();
      view(c).save();
      expect(sessionsService.createSession).not.toHaveBeenCalled();
      view(c).selectedTutorId = 't-2';
      expect(view(c).canSave).toBe(true);
    });

    it('preselects the only tutor when just one is offered', () => {
      const c = build({
        student: data().student,
        tutors: [{ id: 't-2', first_name: 'Christian' }],
      } as TrialSessionDialogData);
      c.ngOnInit();
      expect(view(c).selectedTutorId).toBe('t-2');
    });

    it('works with no tutor list at all (assigned tutor only)', () => {
      const c = build({ student: data().student, tutor: { id: 't-1', first_name: 'Tess' } } as TrialSessionDialogData);
      c.ngOnInit();
      expect(view(c).tutorOptions.map(t => t.id)).toEqual(['t-1']);
      expect(view(c).selectedTutorId).toBe('t-1');
    });

    it('keeps an ACTIVE student\'s original trial date (no student update) and closes with true', () => {
      const c = build(data({ status: StudentStatus.ACTIVE_STUDENT, trial_date: '2026-01-10' }));
      c.ngOnInit();
      prime(c);
      view(c).selectedTutorId = 't-2';
      studentService.updateStudent.mockClear();
      view(c).save();
      expect(view(c).syncsTrialDate).toBe(false);
      expect(sessionsService.createSession).toHaveBeenCalled();
      expect(studentService.updateStudent).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('still syncs the trial date for an Onboarding student', () => {
      const c = build(data({ status: StudentStatus.ONBOARDING }));
      c.ngOnInit();
      prime(c);
      studentService.updateStudent.mockClear();
      view(c).save();
      expect(studentService.updateStudent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 's-1', trial_date: '2026-09-30' }),
      );
      expect(dialogRef.close).toHaveBeenCalledWith('2026-09-30');
    });
  });

  it('creates a 30-minute TRIAL when the shorter length is chosen', () => {
    const c = build();
    c.ngOnInit();
    expect((c as unknown as { lengthMin: number }).lengthMin).toBe(45); // default
    (c as unknown as { lengthMin: number }).lengthMin = 30;
    (c as unknown as { date: Date }).date = new Date(2026, 7, 21);
    (c as unknown as { startTime: Date }).startTime = new Date(2026, 7, 21, 10, 0);
    (c as unknown as { save: () => void }).save();
    const session = sessionsService.createSession.mock.calls[0][0] as Session;
    expect(session.type).toBe(SessionType.TRIAL);
    const start = new Date(session.start_datetime!);
    const end = new Date(session.end_datetime!);
    expect(end.getTime() - start.getTime()).toBe(30 * 60 * 1000);
  });

  it('offers exactly the 45 and 30 minute lengths, default first', () => {
    const c = build();
    expect((c as unknown as { lengthOptions: readonly number[] }).lengthOptions).toEqual([45, 30]);
  });

  it('shows the computed end time for the chosen length', () => {
    const c = build();
    c.ngOnInit();
    (c as unknown as { lengthMin: number }).lengthMin = 30;
    (c as unknown as { startTime: Date }).startTime = new Date(2026, 7, 21, 10, 30);
    const end = (c as unknown as { endTime: Date }).endTime;
    expect(end.getHours()).toBe(11);
    expect(end.getMinutes()).toBe(0);
  });

  it('shows the computed end time (start + 45 minutes)', () => {
    const c = build();
    c.ngOnInit();
    (c as unknown as { startTime: Date }).startTime = new Date(2026, 7, 21, 10, 30);
    const end = (c as unknown as { endTime: Date }).endTime;
    expect(end.getHours()).toBe(11);
    expect(end.getMinutes()).toBe(15);
  });

  it('cannot save without a start time', () => {
    const c = build();
    c.ngOnInit();
    expect((c as unknown as { canSave: boolean }).canSave).toBe(false);
    (c as unknown as { save: () => void }).save();
    expect(sessionsService.createSession).not.toHaveBeenCalled();
  });

  it('endTime is null before a start time is picked', () => {
    const c = build();
    c.ngOnInit();
    expect((c as unknown as { endTime: Date | null }).endTime).toBeNull();
  });

  it('defaults the date to today without a stored trial date', () => {
    const c = build(data({ trial_date: undefined }));
    c.ngOnInit();
    expect((c as unknown as { date: Date }).date.toDateString()).toBe(new Date().toDateString());
  });

  it('parses a non-Y-M-D stored trial date via the Date fallback', () => {
    const c = build(data({ trial_date: '2026-08-20T00:00:00.000Z' }));
    c.ngOnInit();
    expect((c as unknown as { date: Date }).date).toBeInstanceOf(Date);
  });

  it('cancel closes unless a save is in flight', () => {
    const c = build();
    c.ngOnInit();
    (c as unknown as { submitting: boolean }).submitting = true;
    (c as unknown as { cancel: () => void }).cancel();
    expect(dialogRef.close).not.toHaveBeenCalled();
    (c as unknown as { submitting: boolean }).submitting = false;
    (c as unknown as { cancel: () => void }).cancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  it('surfaces an error and re-enables the form when the create fails', () => {
    sessionsService.createSession.mockReturnValue(throwError(() => new Error('x')));
    const c = build();
    c.ngOnInit();
    (c as unknown as { startTime: Date }).startTime = new Date(2026, 7, 21, 10, 0);
    (c as unknown as { save: () => void }).save();
    expect((c as unknown as { hasError: boolean }).hasError).toBe(true);
    expect((c as unknown as { submitting: boolean }).submitting).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});
