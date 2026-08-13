import { contactStatusChipClass, studentStatusChipClass } from './status-chip';
import { StudentStatus } from '../enums/student-status.enum';

describe('studentStatusChipClass', () => {
  it('maps each status to its chip modifier', () => {
    expect(studentStatusChipClass(StudentStatus.ACTIVE_STUDENT)).toBe('btc-chip--ok');
    expect(studentStatusChipClass(StudentStatus.ONBOARDING)).toBe('btc-chip--warn');
    expect(studentStatusChipClass(StudentStatus.PAST_STUDENT)).toBe('btc-chip--info');
    expect(studentStatusChipClass(StudentStatus.MIA)).toBe('btc-chip--bad');
    expect(studentStatusChipClass(StudentStatus.DECLINED_SERVICES)).toBe('btc-chip--bad');
  });

  it('falls back to the neutral chip for unknown or missing statuses', () => {
    expect(studentStatusChipClass('Something Else')).toBe('');
    expect(studentStatusChipClass(undefined)).toBe('');
  });
});

describe('contactStatusChipClass', () => {
  it('maps parent and staff statuses onto the shared palette', () => {
    expect(contactStatusChipClass('Staff')).toBe('btc-chip--ok');
    expect(contactStatusChipClass('Active Client')).toBe('btc-chip--ok');
    expect(contactStatusChipClass('Onboarding')).toBe('btc-chip--warn');
    expect(contactStatusChipClass('Former Staff')).toBe('btc-chip--info');
    expect(contactStatusChipClass('Former Client')).toBe('btc-chip--info');
    expect(contactStatusChipClass('MIA')).toBe('btc-chip--bad');
    expect(contactStatusChipClass('Declined Services')).toBe('btc-chip--bad');
    // Hiring-pipeline additions (shared by Hiring + Employment Inquiry).
    expect(contactStatusChipClass('Inquiry submitted')).toBe('btc-chip--warn');
    expect(contactStatusChipClass('Declined offer')).toBe('btc-chip--bad');
    expect(contactStatusChipClass('BTC not Pursuing')).toBe('btc-chip--bad');
  });

  it('falls back to the neutral chip for unknown or missing statuses', () => {
    expect(contactStatusChipClass('Something Else')).toBe('');
    expect(contactStatusChipClass(undefined)).toBe('');
  });
