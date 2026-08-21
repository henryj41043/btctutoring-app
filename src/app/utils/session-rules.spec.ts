import {
  mutatesStudent,
  pendingMakeupMinutesFor,
  validateMakeupPendingBalance,
  validateSessionLength,
} from './session-rules';
import {Session} from '../models/session.model';
import {Student} from '../models/student.model';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';
import {PackageDef} from './package-config';

const def: PackageDef = {monthlyCost: 400, sessionsPerWeek: 2, sessionLengthMin: 60};
const student = {id: 's-1', name: 'Sam', package: 'Succeed'} as Student;

const pendingMakeup = (id: string, minutes: number, over: Partial<Session> = {}): Session => ({
  id,
  student_id: 's-1',
  type: SessionType.MAKE_UP,
  status: SessionStatus.PENDING,
  start_datetime: '2026-08-20T10:00:00.000Z',
  end_datetime: new Date(new Date('2026-08-20T10:00:00.000Z').getTime() + minutes * 60000).toISOString(),
  ...over,
} as Session);

describe('session-rules', () => {
  describe('validateSessionLength', () => {
    it('requires trials to be exactly 45 minutes', () => {
      expect(validateSessionLength(SessionType.TRIAL, 45, null, undefined)).toBeNull();
      expect(validateSessionLength(SessionType.TRIAL, 60, null, undefined))
        .toBe('Trial sessions are always exactly 45 minutes.');
    });

    it('requires BTC & Me group sessions to be exactly 45 minutes', () => {
      expect(validateSessionLength(SessionType.GROUP, 45, null, undefined)).toBeNull();
      expect(validateSessionLength(SessionType.GROUP, 60, def, student))
        .toBe('BTC & Me sessions are always exactly 45 minutes.');
    });

    it('does not constrain admin or make-up sessions', () => {
      expect(validateSessionLength(SessionType.ADMIN, 600, def, student)).toBeNull();
      expect(validateSessionLength(SessionType.MAKE_UP, 600, def, student)).toBeNull();
    });

    it('does not constrain tutoring without a resolved package', () => {
      expect(validateSessionLength(SessionType.TUTORING, 600, null, student)).toBeNull();
    });

    it('allows tutoring up to the package length and rejects beyond it', () => {
      expect(validateSessionLength(SessionType.TUTORING, 60, def, student)).toBeNull();
      expect(validateSessionLength(SessionType.TUTORING, 61, def, student)).toBe(
        "This session is 61 min, but Sam's Succeed package allows up to 60 min per session.",
      );
    });

    it('falls back to "this student" when no student resolved', () => {
      expect(validateSessionLength(SessionType.TUTORING, 61, def, undefined))
        .toContain("this student's");
    });
  });

  describe('pendingMakeupMinutesFor', () => {
    it('sums only this student\'s PENDING make-up sessions', () => {
      const existing = [
        pendingMakeup('m1', 30),
        pendingMakeup('m2', 45),
        pendingMakeup('other-student', 60, {student_id: 's-2'}),
        pendingMakeup('done', 60, {status: SessionStatus.COMPLETED}),
        pendingMakeup('tutoring', 60, {type: SessionType.TUTORING}),
      ];
      expect(pendingMakeupMinutesFor(existing, 's-1', new Set())).toBe(75);
    });

    it('excludes the ids handled by the current operation', () => {
      const existing = [pendingMakeup('m1', 30), pendingMakeup('m2', 45)];
      expect(pendingMakeupMinutesFor(existing, 's-1', new Set(['m2']))).toBe(30);
    });

    it('treats an id-less session as excludable only via the empty key', () => {
      const existing = [pendingMakeup('m1', 30, {id: undefined})];
      expect(pendingMakeupMinutesFor(existing, 's-1', new Set())).toBe(30);
      expect(pendingMakeupMinutesFor(existing, 's-1', new Set(['']))).toBe(0);
    });
  });

  describe('validateMakeupPendingBalance', () => {
    const banked = {...student, make_up_minutes: 60} as Student;

    it('passes when pending plus the new commit fits the balance', () => {
      expect(validateMakeupPendingBalance(banked, 30, [pendingMakeup('m1', 30)])).toBeNull();
    });

    it('fails with the projected total when the commit would exceed it', () => {
      expect(validateMakeupPendingBalance(banked, 45, [pendingMakeup('m1', 30)])).toBe(
        'Not enough make-up minutes. Sam has 60 min but this would commit 75 pending min.',
      );
    });

    it('honors the exclude set (editing an existing pending session)', () => {
      expect(
        validateMakeupPendingBalance(banked, 60, [pendingMakeup('m1', 30)], new Set(['m1'])),
      ).toBeNull();
    });
  });

  describe('mutatesStudent', () => {
    it('trials never mutate', () => {
      expect(mutatesStudent(SessionType.TRIAL, SessionStatus.CANCELLED)).toBe(false);
      expect(mutatesStudent(SessionType.TRIAL, SessionStatus.COMPLETED)).toBe(false);
    });

    it('BTC & Me group sessions never mutate', () => {
      expect(mutatesStudent(SessionType.GROUP, SessionStatus.CANCELLED)).toBe(false);
      expect(mutatesStudent(SessionType.GROUP, SessionStatus.COMPLETED)).toBe(false);
      expect(mutatesStudent(SessionType.GROUP, SessionStatus.NO_CALL_NO_SHOW)).toBe(false);
    });

    it('make-up mutates on completed and no-call-no-show only', () => {
      expect(mutatesStudent(SessionType.MAKE_UP, SessionStatus.COMPLETED)).toBe(true);
      expect(mutatesStudent(SessionType.MAKE_UP, SessionStatus.NO_CALL_NO_SHOW)).toBe(true);
      expect(mutatesStudent(SessionType.MAKE_UP, SessionStatus.PENDING)).toBe(false);
    });

    it('tutoring mutates only on cancelled', () => {
      expect(mutatesStudent(SessionType.TUTORING, SessionStatus.CANCELLED)).toBe(true);
      expect(mutatesStudent(SessionType.TUTORING, SessionStatus.COMPLETED)).toBe(false);
      expect(mutatesStudent(SessionType.ADMIN, SessionStatus.CANCELLED)).toBe(true);
    });
  });
});
