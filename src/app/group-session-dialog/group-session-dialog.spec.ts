import {TestBed} from '@angular/core/testing';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {of, throwError} from 'rxjs';
import {GroupSessionDialog, GroupSessionDialogData} from './group-session-dialog';
import {SessionsService} from '../services/sessions.service';
import {ContactService} from '../services/contact.service';
import {StudentService} from '../services/student.service';
import {AuthService} from '../services/auth.service';
import {Session} from '../models/session.model';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';

const staff = [
  {id: 't-1', first_name: 'Tess', last_name: 'Coach', status: 'Staff', service: 'Hiring', is_tutor: true},
  {id: 't-2', first_name: 'Adam', last_name: 'Admin', status: 'Staff', service: 'Hiring', is_tutor: false},
  {id: 't-3', first_name: 'Gone', last_name: 'Away', status: 'Former Staff', service: 'Hiring', is_tutor: true},
];
const students = [
  {id: 's-a', name: 'Ava', status: 'Active Student', btc_and_me: true},
  {id: 's-b', name: 'Ben', status: 'Active Student', btc_and_me: true},
  {id: 's-c', name: 'Cy', status: 'Active Student', btc_and_me: false},
  {id: 's-d', name: 'Dee', status: 'Onboarding', btc_and_me: true},
];

const storedSession = (over: Partial<Session> = {}): Session => ({
  id: 'g-1',
  type: SessionType.GROUP,
  // Wed Aug 5 2026, 5:00 PM EDT.
  start_datetime: '2026-08-05T21:00:00.000Z',
  end_datetime: '2026-08-05T21:45:00.000Z',
  status: SessionStatus.PENDING,
  tutor_id: 't-1',
  tutor_name: 'Tess',
  participants: [{id: 's-a', name: 'Ava'}],
  student_name: 'Ava',
  series_id: 'series-1',
  notes: 'weekly',
  ...over,
});

describe('GroupSessionDialog', () => {
  const dialogRef = {close: jest.fn()};
  const sessionsService = {
    createSessions: jest.fn(),
    updateSession: jest.fn(),
    setAttendance: jest.fn(),
    deleteSession: jest.fn(),
    getSessionsBySeries: jest.fn(),
  };
  const contactService = {getStaff: jest.fn()};
  const studentService = {getStudents: jest.fn()};
  const authService = {isAdmin: jest.fn(() => true), contact: jest.fn(() => ({id: 't-1'}))};

  const build = (data: GroupSessionDialogData): GroupSessionDialog => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GroupSessionDialog],
      providers: [
        {provide: MatDialogRef, useValue: dialogRef},
        {provide: MAT_DIALOG_DATA, useValue: data},
        {provide: SessionsService, useValue: sessionsService},
        {provide: ContactService, useValue: contactService},
        {provide: StudentService, useValue: studentService},
        {provide: AuthService, useValue: authService},
      ],
    });
    const component = TestBed.createComponent(GroupSessionDialog).componentInstance;
    component.ngOnInit();
    return component;
  };

  const priv = (c: GroupSessionDialog) => c as unknown as {
    tutors: unknown[];
    rosterOptions: {id: string; name: string}[];
    selectedTutor?: string;
    selectedStudentIds: string[];
    date?: Date;
    startTime?: Date;
    selectedAttendance?: SessionStatus;
    notes: string;
    submitting: boolean;
    hasError: boolean;
    showSeriesScopePrompt: boolean;
    save(): void;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    authService.isAdmin.mockReturnValue(true);
    contactService.getStaff.mockReturnValue(of(staff));
    studentService.getStudents.mockReturnValue(of(students));
    sessionsService.createSessions.mockReturnValue(of({count: 9}));
    sessionsService.updateSession.mockReturnValue(of({id: 'g-1'}));
    sessionsService.setAttendance.mockImplementation((id: string, request: {status: string}) =>
      of({session: {id, status: request.status}, makeup: {before: 0, after: 0, delta: 0, unrecovered: 0}, dry_run: false}));
    sessionsService.deleteSession.mockReturnValue(of({id: 'g-1'}));
  });

  describe('create', () => {
    it('offers active tutors and enrolled active students only', () => {
      const c = build({mode: 'create'});
      expect(priv(c).tutors).toEqual([staff[0]]);
      expect(priv(c).rosterOptions).toEqual([
        {id: 's-a', name: 'Ava'},
        {id: 's-b', name: 'Ben'},
      ]);
    });

    it('creates the weekly series through end of next month in one batch', () => {
      const c = build({mode: 'create'});
      const p = priv(c);
      p.selectedTutor = 't-1';
      p.selectedStudentIds = ['s-a', 's-b'];
      p.date = new Date(2026, 7, 5); // Wed Aug 5
      p.startTime = new Date(2026, 7, 5, 17, 0);
      p.notes = 'weekly group';
      c.save();
      expect(sessionsService.createSessions).toHaveBeenCalledTimes(1);
      const sessions: Session[] = sessionsService.createSessions.mock.calls[0][0];
      expect(sessions).toHaveLength(9); // Aug 5..26 + all Sep Wednesdays
      expect(sessions[0].type).toBe(SessionType.GROUP);
      expect(sessions[0].start_datetime).toBe('2026-08-05T21:00:00.000Z');
      expect(sessions[0].end_datetime).toBe('2026-08-05T21:45:00.000Z');
      expect(sessions[0].student_name).toBe('Ava, Ben');
      expect(sessions.every(s => s.series_id === sessions[0].series_id)).toBe(true);
      expect(dialogRef.close).toHaveBeenCalledWith({created: 9});
    });

    it('blocks saving without a tutor, date, time, or roster', () => {
      const c = build({mode: 'create'});
      const p = priv(c);
      expect(c.canSave).toBe(false);
      p.selectedTutor = 't-1';
      p.date = new Date(2026, 7, 5);
      p.startTime = new Date(2026, 7, 5, 17, 0);
      expect(c.canSave).toBe(false); // roster empty
      p.selectedStudentIds = ['s-a'];
      expect(c.canSave).toBe(true);
      c.save();
      expect(sessionsService.createSessions).toHaveBeenCalled();
    });

    it('surfaces a failed batch create and re-enables the form', () => {
      sessionsService.createSessions.mockReturnValue(throwError(() => new Error('boom')));
      const c = build({mode: 'create'});
      const p = priv(c);
      p.selectedTutor = 't-1';
      p.selectedStudentIds = ['s-a'];
      p.date = new Date(2026, 7, 5);
      p.startTime = new Date(2026, 7, 5, 17, 0);
      c.save();
      expect(p.hasError).toBe(true);
      expect(p.submitting).toBe(false);
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('edit (admin)', () => {
    it('prefills from the stored occurrence', () => {
      const c = build({mode: 'edit', session: storedSession()});
      const p = priv(c);
      expect(p.selectedTutor).toBe('t-1');
      expect(p.selectedStudentIds).toEqual(['s-a']);
      expect(p.selectedAttendance).toBe(SessionStatus.PENDING);
      expect(p.notes).toBe('weekly');
    });

    it('keeps a since-unflagged stored participant selectable', () => {
      const c = build({
        mode: 'edit',
        session: storedSession({participants: [{id: 's-z', name: 'Zoe'}], student_name: 'Zoe'}),
      });
      expect(priv(c).rosterOptions).toEqual([
        {id: 's-a', name: 'Ava'},
        {id: 's-b', name: 'Ben'},
        {id: 's-z', name: 'Zoe'},
      ]);
    });

    it('attendance/notes-only edits save single-occurrence, echoing stored datetimes', () => {
      const c = build({mode: 'edit', session: storedSession()});
      const p = priv(c);
      p.selectedAttendance = SessionStatus.COMPLETED;
      p.notes = 'great session';
      c.save();
      expect(p.showSeriesScopePrompt).toBe(false);
      expect(sessionsService.updateSession).toHaveBeenCalledTimes(1);
      const updated: Session = sessionsService.updateSession.mock.calls[0][0];
      expect(updated.start_datetime).toBe('2026-08-05T21:00:00.000Z');
      expect(updated.end_datetime).toBe('2026-08-05T21:45:00.000Z');
      // The fields are saved with the status as stored; attendance follows.
      expect(updated.status).toBe(SessionStatus.PENDING);
      expect(updated.notes).toBe('great session');
      expect(updated.participants).toEqual([{id: 's-a', name: 'Ava'}]);
      expect(sessionsService.setAttendance).toHaveBeenCalledWith(
        'g-1', {status: SessionStatus.COMPLETED, notes: 'great session'},
      );
      expect(sessionsService.updateSession.mock.invocationCallOrder[0])
        .toBeLessThan(sessionsService.setAttendance.mock.invocationCallOrder[0]);
      expect(dialogRef.close).toHaveBeenCalledWith({id: 'g-1', status: SessionStatus.COMPLETED});
    });

    it('a roster change on a series occurrence prompts for scope', () => {
      const c = build({mode: 'edit', session: storedSession()});
      const p = priv(c);
      p.selectedStudentIds = ['s-a', 's-b'];
      c.save();
      expect(p.showSeriesScopePrompt).toBe(true);
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
    });

    it('single scope re-pins the occurrence with the new roster and time', () => {
      const c = build({mode: 'edit', session: storedSession()});
      const p = priv(c);
      p.selectedStudentIds = ['s-a', 's-b'];
      p.startTime = new Date(2026, 7, 5, 18, 30);
      c.save();
      c.chooseSeriesScope('single');
      expect(sessionsService.updateSession).toHaveBeenCalledTimes(1);
      const updated: Session = sessionsService.updateSession.mock.calls[0][0];
      expect(updated.id).toBe('g-1');
      expect(updated.start_datetime).toBe('2026-08-05T22:30:00.000Z'); // 6:30 PM EDT
      expect(updated.end_datetime).toBe('2026-08-05T23:15:00.000Z');
      expect(updated.participants).toEqual([
        {id: 's-a', name: 'Ava'},
        {id: 's-b', name: 'Ben'},
      ]);
      expect(updated.student_name).toBe('Ava, Ben');
    });

    it('future scope rewrites every pending occurrence from this one on', () => {
      sessionsService.getSessionsBySeries.mockReturnValue(of([
        storedSession({id: 'g-0', start_datetime: '2026-07-29T21:00:00.000Z', status: SessionStatus.COMPLETED}),
        storedSession(),
        storedSession({id: 'g-2', start_datetime: '2026-08-12T21:00:00.000Z'}),
      ]));
      const c = build({mode: 'edit', session: storedSession()});
      const p = priv(c);
      p.selectedStudentIds = ['s-a', 's-b'];
      c.save();
      c.chooseSeriesScope('future');
      expect(sessionsService.getSessionsBySeries).toHaveBeenCalledWith('series-1');
      // Completed July occurrence untouched; both pending ones rewritten.
      expect(sessionsService.updateSession).toHaveBeenCalledTimes(2);
      const ids = sessionsService.updateSession.mock.calls.map(call => (call[0] as Session).id);
      expect(ids).toEqual(['g-1', 'g-2']);
      const first: Session = sessionsService.updateSession.mock.calls[0][0];
      expect(first.participants).toEqual([
        {id: 's-a', name: 'Ava'},
        {id: 's-b', name: 'Ben'},
      ]);
      expect(dialogRef.close).toHaveBeenCalledWith({updated: 2});
    });

    it('a seriesless occurrence edits directly without a prompt', () => {
      const c = build({mode: 'edit', session: storedSession({series_id: undefined})});
      const p = priv(c);
      p.selectedStudentIds = ['s-a', 's-b'];
      c.save();
      expect(p.showSeriesScopePrompt).toBe(false);
      expect(sessionsService.updateSession).toHaveBeenCalledTimes(1);
    });

    it('cancelling the scope prompt resets the pending action', () => {
      const c = build({mode: 'edit', session: storedSession()});
      const p = priv(c);
      p.selectedStudentIds = ['s-a', 's-b'];
      c.save();
      c.cancelSeriesScope();
      expect(p.showSeriesScopePrompt).toBe(false);
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
    });
  });

  describe('edit (tutor, restricted)', () => {
    beforeEach(() => authService.isAdmin.mockReturnValue(false));

    it('loads no dropdowns and saves attendance + notes only', () => {
      const c = build({mode: 'edit', session: storedSession()});
      const p = priv(c);
      expect(contactService.getStaff).not.toHaveBeenCalled();
      expect(studentService.getStudents).not.toHaveBeenCalled();
      expect(c.canSave).toBe(true);
      p.selectedAttendance = SessionStatus.COMPLETED;
      c.save();
      const updated: Session = sessionsService.updateSession.mock.calls[0][0];
      expect(updated.status).toBe(SessionStatus.PENDING);
      expect(sessionsService.setAttendance.mock.calls[0][1].status).toBe(SessionStatus.COMPLETED);
      // Stored schedule/roster echoed untouched.
      expect(updated.start_datetime).toBe('2026-08-05T21:00:00.000Z');
      expect(updated.tutor_id).toBe('t-1');
      expect(updated.participants).toEqual([{id: 's-a', name: 'Ava'}]);
    });
  });

  describe('delete', () => {
    it('prompts for scope on a series occurrence', () => {
      const c = build({mode: 'delete', session: storedSession()});
      c.deleteSession();
      expect(priv(c).showSeriesScopePrompt).toBe(true);
      expect(sessionsService.deleteSession).not.toHaveBeenCalled();
    });

    it('single scope deletes just this occurrence', () => {
      const c = build({mode: 'delete', session: storedSession()});
      c.deleteSession();
      c.chooseSeriesScope('single');
      expect(sessionsService.deleteSession).toHaveBeenCalledWith('g-1');
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('future scope deletes every pending occurrence from this one on', () => {
      sessionsService.getSessionsBySeries.mockReturnValue(of([
        storedSession({id: 'g-0', start_datetime: '2026-07-29T21:00:00.000Z', status: SessionStatus.COMPLETED}),
        storedSession(),
        storedSession({id: 'g-2', start_datetime: '2026-08-12T21:00:00.000Z'}),
      ]));
      const c = build({mode: 'delete', session: storedSession()});
      c.deleteSession();
      c.chooseSeriesScope('future');
      expect(sessionsService.deleteSession).toHaveBeenCalledTimes(2);
      expect(dialogRef.close).toHaveBeenCalledWith({deleted: 2});
    });

    it('a seriesless occurrence deletes directly', () => {
      const c = build({mode: 'delete', session: storedSession({series_id: undefined})});
      c.deleteSession();
      expect(sessionsService.deleteSession).toHaveBeenCalledWith('g-1');
    });
  });

  describe('failure paths', () => {
    it('a failed single update keeps the dialog open with an error', () => {
      sessionsService.updateSession.mockReturnValue(throwError(() => new Error('boom')));
      const c = build({mode: 'edit', session: storedSession()});
      const p = priv(c);
      p.selectedAttendance = SessionStatus.COMPLETED;
      c.save();
      expect(p.hasError).toBe(true);
      expect(p.submitting).toBe(false);
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('a failed series load during a future edit surfaces the error', () => {
      sessionsService.getSessionsBySeries.mockReturnValue(throwError(() => new Error('boom')));
      const c = build({mode: 'edit', session: storedSession()});
      const p = priv(c);
      p.selectedStudentIds = ['s-a', 's-b'];
      c.save();
      c.chooseSeriesScope('future');
      expect(p.hasError).toBe(true);
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('a failed series update surfaces the error', () => {
      sessionsService.getSessionsBySeries.mockReturnValue(of([storedSession()]));
      sessionsService.updateSession.mockReturnValue(throwError(() => new Error('boom')));
      const c = build({mode: 'edit', session: storedSession()});
      const p = priv(c);
      p.selectedStudentIds = ['s-a', 's-b'];
      c.save();
      c.chooseSeriesScope('future');
      expect(p.hasError).toBe(true);
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('a future edit with no pending targets closes with zero updates', () => {
      sessionsService.getSessionsBySeries.mockReturnValue(of([
        storedSession({status: SessionStatus.COMPLETED}),
      ]));
      const c = build({mode: 'edit', session: storedSession()});
      const p = priv(c);
      p.selectedStudentIds = ['s-a', 's-b'];
      c.save();
      c.chooseSeriesScope('future');
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith({updated: 0});
    });

    it('a failed single delete keeps the dialog open with an error', () => {
      sessionsService.deleteSession.mockReturnValue(throwError(() => new Error('boom')));
      const c = build({mode: 'delete', session: storedSession({series_id: undefined})});
      c.deleteSession();
      expect(priv(c).hasError).toBe(true);
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('a failed series load during a future delete surfaces the error', () => {
      sessionsService.getSessionsBySeries.mockReturnValue(throwError(() => new Error('boom')));
      const c = build({mode: 'delete', session: storedSession()});
      c.deleteSession();
      c.chooseSeriesScope('future');
      expect(priv(c).hasError).toBe(true);
      expect(sessionsService.deleteSession).not.toHaveBeenCalled();
    });

    it('a failed series delete surfaces the error', () => {
      sessionsService.getSessionsBySeries.mockReturnValue(of([storedSession()]));
      sessionsService.deleteSession.mockReturnValue(throwError(() => new Error('boom')));
      const c = build({mode: 'delete', session: storedSession()});
      c.deleteSession();
      c.chooseSeriesScope('future');
      expect(priv(c).hasError).toBe(true);
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('a future delete with no pending targets closes with zero deletes', () => {
      sessionsService.getSessionsBySeries.mockReturnValue(of([
        storedSession({status: SessionStatus.CANCELLED}),
      ]));
      const c = build({mode: 'delete', session: storedSession()});
      c.deleteSession();
      c.chooseSeriesScope('future');
      expect(sessionsService.deleteSession).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith({deleted: 0});
    });

    it('failed staff/student loads are swallowed (empty dropdowns)', () => {
      contactService.getStaff.mockReturnValue(throwError(() => new Error('boom')));
      studentService.getStudents.mockReturnValue(throwError(() => new Error('boom')));
      const c = build({mode: 'create'});
      expect(priv(c).tutors).toEqual([]);
      expect(priv(c).rosterOptions).toEqual([]);
    });

    it('create fails cleanly when the selected tutor is not loadable', () => {
      contactService.getStaff.mockReturnValue(of([]));
      const c = build({mode: 'create'});
      const p = priv(c);
      p.selectedTutor = 't-ghost';
      p.selectedStudentIds = ['s-a'];
      p.date = new Date(2026, 7, 5);
      p.startTime = new Date(2026, 7, 5, 17, 0);
      c.save();
      expect(p.hasError).toBe(true);
      expect(sessionsService.createSessions).not.toHaveBeenCalled();
    });

    it('guards double submits and cancel-while-submitting', () => {
      const c = build({mode: 'edit', session: storedSession()});
      const p = priv(c);
      p.submitting = true;
      expect(c.canSave).toBe(false);
      c.save();
      c.deleteSession();
      c.cancel();
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
      expect(sessionsService.deleteSession).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });

  it('labels the scope prompt by the pending action', () => {
    const edited = build({mode: 'edit', session: storedSession()});
    priv(edited).selectedStudentIds = ['s-a', 's-b'];
    edited.save();
    expect(edited.seriesActionLabel).toBe('change');
    const deleted = build({mode: 'delete', session: storedSession()});
    deleted.deleteSession();
    expect(deleted.seriesActionLabel).toBe('deletion');
  });

  it('endTime renders 45 minutes after the picked start', () => {
    const c = build({mode: 'create'});
    const p = priv(c);
    expect(c.endTime).toBeNull();
    p.startTime = new Date(2026, 7, 5, 17, 0);
    expect(c.endTime!.getHours()).toBe(17);
    expect(c.endTime!.getMinutes()).toBe(45);
  });

  it('cancel closes without saving', () => {
    const c = build({mode: 'create'});
    c.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
    expect(sessionsService.createSessions).not.toHaveBeenCalled();
  });

  describe('attendance lock', () => {
    const lock = (c: GroupSessionDialog) => c as unknown as {
      isFinalized: boolean;
      canCorrectAttendance: boolean;
      correcting: boolean;
      correctionStatus: SessionStatus | null;
      correctionReason: string;
      correctionOptions: SessionStatus[];
      errorMessage: string;
    };
    const finalized = () => storedSession({status: SessionStatus.COMPLETED});

    it('a pending session is open; a finalized one is final for the tutor', () => {
      expect(lock(build({mode: 'edit', session: storedSession()})).isFinalized).toBe(false);
      expect(lock(build({mode: 'create'})).isFinalized).toBe(false);
      expect(lock(build({mode: 'delete', session: finalized()})).isFinalized).toBe(false);
      authService.isAdmin.mockReturnValue(false);
      const c = build({mode: 'edit', session: finalized()});
      expect(lock(c).isFinalized).toBe(true);
      expect(lock(c).canCorrectAttendance).toBe(false);
    });

    it('a session with no stored status counts as pending', () => {
      const c = build({mode: 'edit', session: storedSession({status: undefined})});
      expect(lock(c).isFinalized).toBe(false);
    });

    it('a notes edit on a finalized session is an ordinary save', () => {
      authService.isAdmin.mockReturnValue(false);
      const c = build({mode: 'edit', session: finalized()});
      priv(c).notes = 'fixed a typo';
      c.save();
      expect(sessionsService.updateSession.mock.calls[0][0]).toEqual(
        expect.objectContaining({status: SessionStatus.COMPLETED, notes: 'fixed a typo'}),
      );
      expect(sessionsService.setAttendance).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith({id: 'g-1'});
    });

    it('an admin corrects attendance with a reason', () => {
      const c = build({mode: 'edit', session: finalized()});
      expect(lock(c).canCorrectAttendance).toBe(true);
      expect(lock(c).correctionOptions).toEqual([
        SessionStatus.PENDING, SessionStatus.CANCELLED, SessionStatus.NO_CALL_NO_SHOW,
      ]);
      lock(c).correctionStatus = SessionStatus.CANCELLED;
      lock(c).correctionReason = 'old';
      priv(c).hasError = true;
      c.startCorrection();
      expect(lock(c).correcting).toBe(true);
      expect(lock(c).correctionStatus).toBeNull();
      expect(lock(c).correctionReason).toBe('');
      expect(priv(c).hasError).toBe(false);

      c.confirmCorrection();
      expect(lock(c).errorMessage).toBe('Choose the corrected attendance.');
      lock(c).correctionStatus = SessionStatus.CANCELLED;
      lock(c).correctionReason = '   ';
      c.confirmCorrection();
      expect(lock(c).errorMessage).toBe('A reason is required to change attendance.');
      expect(sessionsService.setAttendance).not.toHaveBeenCalled();

      lock(c).correctionReason = '  Class was called off  ';
      c.confirmCorrection();
      expect(sessionsService.setAttendance).toHaveBeenCalledWith(
        'g-1', {status: SessionStatus.CANCELLED, reason: 'Class was called off'},
      );
      expect(sessionsService.updateSession).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith({id: 'g-1', status: SessionStatus.CANCELLED});
    });

    it('Go Back closes the panel without saving', () => {
      const c = build({mode: 'edit', session: finalized()});
      c.startCorrection();
      priv(c).hasError = true;
      c.cancelCorrection();
      expect(lock(c).correcting).toBe(false);
      expect(priv(c).hasError).toBe(false);
      expect(sessionsService.setAttendance).not.toHaveBeenCalled();
    });

    it('needs a stored id and never saves twice', () => {
      const unsaved = build({mode: 'edit', session: storedSession({id: undefined, status: SessionStatus.COMPLETED})});
      lock(unsaved).correctionStatus = SessionStatus.CANCELLED;
      lock(unsaved).correctionReason = 'x';
      unsaved.confirmCorrection();
      expect(lock(unsaved).errorMessage).toBe('Choose the corrected attendance.');
      const c = build({mode: 'edit', session: finalized()});
      lock(c).correctionStatus = SessionStatus.CANCELLED;
      lock(c).correctionReason = 'x';
      priv(c).submitting = true;
      c.confirmCorrection();
      expect(sessionsService.setAttendance).not.toHaveBeenCalled();
    });

    it('shows the service message when a correction or attendance is refused', () => {
      sessionsService.setAttendance.mockReturnValue(throwError(() => ({
        error: {message: 'Attendance is final. Ask an admin to correct it.'},
      })));
      const c = build({mode: 'edit', session: finalized()});
      lock(c).correctionStatus = SessionStatus.CANCELLED;
      lock(c).correctionReason = 'x';
      c.confirmCorrection();
      expect(lock(c).errorMessage).toBe('Attendance is final. Ask an admin to correct it.');
      expect(priv(c).submitting).toBe(false);

      const first = build({mode: 'edit', session: storedSession()});
      priv(first).selectedAttendance = SessionStatus.COMPLETED;
      first.save();
      expect(lock(first).errorMessage).toBe('Attendance is final. Ask an admin to correct it.');
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('falls back to plain messages when the service sent none', () => {
      sessionsService.setAttendance.mockReturnValue(throwError(() => new Error('x')));
      const c = build({mode: 'edit', session: finalized()});
      lock(c).correctionStatus = SessionStatus.CANCELLED;
      lock(c).correctionReason = 'x';
      c.confirmCorrection();
      expect(lock(c).errorMessage).toBe('Changing attendance failed. Please try again.');
      const first = build({mode: 'edit', session: storedSession()});
      priv(first).selectedAttendance = SessionStatus.COMPLETED;
      first.save();
      expect(lock(first).errorMessage).toBe('Failed to save the session. Please try again.');
    });
  });
});
