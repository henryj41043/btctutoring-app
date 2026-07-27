import { studentStatusChipClass } from './status-chip';
import { StudentStatus } from '../enums/student-status.enum';

describe('studentStatusChipClass', () => {
  it('maps each status to its chip modifier', () => {
    expect(studentStatusChipClass(StudentStatus.ACTIVE_STUDENT)).toBe('btc-chip--ok');
    expect(studentStatusChipClass(StudentStatus.ONBOARDING)).toBe('btc-chip--warn');
    expect(studentStatusChipClass(StudentStatus.PAST_STUDENT)).toBe('btc-chip--info');
    expect(studentStatusChipClass(StudentStatus.MIA)).toBe('btc-chip--bad');
  });

  it('falls back to the neutral chip for unknown or missing statuses', () => {
    expect(studentStatusChipClass('Something Else')).toBe('');
    expect(studentStatusChipClass(undefined)).toBe('');
  });
});
