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
