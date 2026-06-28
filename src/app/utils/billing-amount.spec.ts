import {studentMonthlyCharge, studentNeedsAttention} from './billing-amount';
import {Student} from '../models/student.model';
import {Package} from '../enums/package.enum';
import {Weekday} from '../enums/weekday.enum';

const succeed = (over: Partial<Student> = {}): Student =>
  ({ package: Package.SUCCEED, ...over }) as Student;

describe('studentMonthlyCharge', () => {
  it('charges the full monthly cost for an ongoing month', () => {
    // Started in a prior month → full Succeed cost.
    expect(studentMonthlyCharge(succeed({ package_start_date: '2026-05-01T00:00:00' }), 2026, 6))
      .toBe(362);
  });

  it('charges full cost when started on the 1st of the month', () => {
    expect(studentMonthlyCharge(succeed({ package_start_date: '2026-07-01T00:00:00' }), 2026, 6))
      .toBe(362);
  });

  it('charges zero before the package starts', () => {
    expect(studentMonthlyCharge(succeed({ package_start_date: '2026-08-01T00:00:00' }), 2026, 6))
      .toBe(0);
  });

  it('charges full cost for a legacy student with no start date', () => {
    expect(studentMonthlyCharge(succeed(), 2026, 6)).toBe(362);
  });

  it('charges zero for an unconfigured custom package', () => {
    expect(studentMonthlyCharge(succeed({ package: Package.CUSTOM }), 2026, 6)).toBe(0);
  });

  it('charges full when started on the last day of the month (boundary)', () => {
    // start === monthEnd, getDate() > 1 → prorated path is taken (not zero).
    // July 31 2026 with no schedule → 0 missed → full cost.
    expect(
      studentMonthlyCharge(succeed({ package_start_date: '2026-07-31T00:00:00' }), 2026, 6),
    ).toBe(362);
  });

  it('charges zero when starting on the 1st of the next month (boundary)', () => {
    expect(
      studentMonthlyCharge(succeed({ package_start_date: '2026-08-01T00:00:00' }), 2026, 6),
    ).toBe(0);
  });

  it('charges full when starting on the last day of the prior month (boundary)', () => {
    // June 30 < July 1 monthStart → ongoing full month.
    expect(
      studentMonthlyCharge(succeed({ package_start_date: '2026-06-30T00:00:00' }), 2026, 6),
    ).toBe(362);
  });

  it('prorates the first partial month from missed slots', () => {
    // Custom $400/wk, 1×45min, schedule on Wednesdays. July 2026: Wednesdays are
    // 1, 8, 15... Starting the 15th misses the 1st and the 8th → 2 slots.
    // weekly = round(400*12/52,2)=92.31; perSession=92.31; 400 - 92.31*2 = 215.38
    const student = {
      package: Package.CUSTOM,
      custom_monthly_cost: 400,
      custom_sessions_per_week: 1,
      custom_session_length_min: 45,
      package_start_date: '2026-07-15T00:00:00',
      schedule: [{ weekday: Weekday.WEDNESDAY, start_time: '10:00', end_time: '10:45' }],
    } as Student;
    expect(studentMonthlyCharge(student, 2026, 6)).toBe(215.38);
  });
});

describe('studentNeedsAttention', () => {
  it('flags an unconfigured custom student', () => {
    expect(studentNeedsAttention(succeed({ package: Package.CUSTOM }))).toBe(true);
  });

  it('flags a student missing a schedule or start date', () => {
    expect(studentNeedsAttention(succeed())).toBe(true);
  });

  it('does not flag a fully-configured student', () => {
    const student = succeed({
      package_start_date: '2026-07-01T00:00:00',
      schedule: [{ weekday: Weekday.MONDAY, start_time: '10:00', end_time: '10:30' }],
    });
    expect(studentNeedsAttention(student)).toBe(false);
  });
});
