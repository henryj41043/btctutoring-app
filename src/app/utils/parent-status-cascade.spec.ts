import {localDateKey, serviceEndForLeaving} from './parent-status-cascade';
import {cascadeTargetFor} from './parent-status-cascade';
import {ParentStatus} from '../enums/parent-status.enum';
import {StudentStatus} from '../enums/student-status.enum';

describe('cascadeTargetFor', () => {
  it('maps Former Client to Past Student', () => {
    expect(cascadeTargetFor(ParentStatus.FORMER_CLIENT)).toBe(StudentStatus.PAST_STUDENT);
  });

  it('maps MIA to MIA', () => {
    expect(cascadeTargetFor(ParentStatus.MIA)).toBe(StudentStatus.MIA);
  });

  it('maps Declined Services to Declined Services', () => {
    expect(cascadeTargetFor(ParentStatus.DECLINED_SERVICES)).toBe(
      StudentStatus.DECLINED_SERVICES,
    );
  });

  it('cascades nothing for Active Client', () => {
    expect(cascadeTargetFor(ParentStatus.ACTIVE_CLIENT)).toBeNull();
  });

  it('cascades nothing for unknown or missing statuses', () => {
    expect(cascadeTargetFor('Staff')).toBeNull();
    expect(cascadeTargetFor(undefined)).toBeNull();
    expect(cascadeTargetFor('')).toBeNull();
  });

  describe('service end for a student leaving now', () => {
    const now = new Date(2026, 8, 5, 15, 0, 0);

    it('formats a local date key with padding', () => {
      expect(localDateKey(now)).toBe('2026-09-05');
      expect(localDateKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    });

    it('ends service today for an Active student', () => {
      expect(serviceEndForLeaving({status: StudentStatus.ACTIVE_STUDENT}, now)).toBe('2026-09-05');
      expect(serviceEndForLeaving({status: StudentStatus.ACTIVE_STUDENT, service_end_date: null}, now))
        .toBe('2026-09-05');
    });

    it('keeps an end date already on or before today', () => {
      expect(serviceEndForLeaving(
        {status: StudentStatus.ACTIVE_STUDENT, service_end_date: '2026-08-31T00:00:00'}, now,
      )).toBe('2026-08-31');
      expect(serviceEndForLeaving(
        {status: StudentStatus.ACTIVE_STUDENT, service_end_date: '2026-09-05'}, now,
      )).toBe('2026-09-05');
    });

    it('pulls a future end date back to today', () => {
      expect(serviceEndForLeaving(
        {status: StudentStatus.ACTIVE_STUDENT, service_end_date: '2026-09-06'}, now,
      )).toBe('2026-09-05');
    });

    it('is null for a student who was not in service', () => {
      expect(serviceEndForLeaving({status: StudentStatus.ONBOARDING}, now)).toBeNull();
      expect(serviceEndForLeaving({status: StudentStatus.PAST_STUDENT, service_end_date: '2026-01-01'}, now))
        .toBeNull();
      expect(serviceEndForLeaving({}, now)).toBeNull();
    });

    it('defaults to the current date', () => {
      expect(serviceEndForLeaving({status: StudentStatus.ACTIVE_STUDENT})).toBe(localDateKey(new Date()));
    });
  });
});
