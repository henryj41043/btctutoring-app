import {studentMonthlyCharge, studentSemiMonthlyCharge, studentNeedsAttention} from './billing-amount';
import {Student} from '../models/student.model';
import {Package} from '../enums/package.enum';
import {Weekday} from '../enums/weekday.enum';

const succeed = (over: Partial<Student> = {}): Student =>
  ({ package: Package.SUCCEED, ...over }) as Student;

// A Succeed student with a Monday schedule, so mid-month starts actually prorate.
const prorating = (start: string): Student =>
  succeed({
    package_start_date: start,
    schedule: [{ weekday: Weekday.MONDAY, start_time: '10:00', end_time: '10:30' }],
  });

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

describe('studentSemiMonthlyCharge', () => {
  it('splits an ongoing month 50/50', () => {
    expect(studentSemiMonthlyCharge(succeed({ package_start_date: '2026-05-01T00:00:00' }), 2026, 6))
      .toEqual({ first: 181, fifteenth: 181 });
  });

  it('splits 50/50 for a legacy student with no start date', () => {
    expect(studentSemiMonthlyCharge(succeed(), 2026, 6)).toEqual({ first: 181, fifteenth: 181 });
  });

  it('charges nothing for an unconfigured custom package', () => {
    expect(studentSemiMonthlyCharge(succeed({ package: Package.CUSTOM }), 2026, 6))
      .toEqual({ first: 0, fifteenth: 0 });
  });

  it('charges nothing before the package starts', () => {
    expect(studentSemiMonthlyCharge(succeed({ package_start_date: '2026-08-01T00:00:00' }), 2026, 6))
      .toEqual({ first: 0, fifteenth: 0 });
  });

  it('splits 50/50 when starting on the 1st (no proration)', () => {
    expect(studentSemiMonthlyCharge(succeed({ package_start_date: '2026-07-01T00:00:00' }), 2026, 6))
      .toEqual({ first: 181, fifteenth: 181 });
  });

  it('bills the full prorated first month on the 15th when starting before the 15th', () => {
    const s = prorating('2026-07-10T00:00:00');
    const prorated = studentMonthlyCharge(s, 2026, 6); // July's prorated value
    expect(prorated).toBeGreaterThan(0);
    expect(prorated).toBeLessThan(362);
    // Prorated lands in full on the 15th of the start month; the 1st stays blank (0).
    expect(studentSemiMonthlyCharge(s, 2026, 6)).toEqual({ first: 0, fifteenth: prorated });
    // The following month resumes the normal split.
    expect(studentSemiMonthlyCharge(s, 2026, 7)).toEqual({ first: 181, fifteenth: 181 });
  });

  it('bills the full prorated first month on the 1st of next month when starting on/after the 15th', () => {
    const s = prorating('2026-07-20T00:00:00');
    const prorated = studentMonthlyCharge(s, 2026, 6); // July's prorated value
    expect(prorated).toBeGreaterThan(0);
    expect(prorated).toBeLessThan(362);
    // Start month: nothing is billed yet.
    expect(studentSemiMonthlyCharge(s, 2026, 6)).toEqual({ first: 0, fifteenth: 0 });
    // Next month (August): prorated in full on the 1st, the 15th stays blank (0).
    expect(studentSemiMonthlyCharge(s, 2026, 7)).toEqual({ first: prorated, fifteenth: 0 });
    // The month after resumes the normal split.
    expect(studentSemiMonthlyCharge(s, 2026, 8)).toEqual({ first: 181, fifteenth: 181 });
  });

  it('treats a start exactly on the 15th as billed on the 1st of next month', () => {
    const s = prorating('2026-07-15T00:00:00');
    const prorated = studentMonthlyCharge(s, 2026, 6);
    expect(studentSemiMonthlyCharge(s, 2026, 6)).toEqual({ first: 0, fifteenth: 0 });
    expect(studentSemiMonthlyCharge(s, 2026, 7)).toEqual({ first: prorated, fifteenth: 0 });
  });

  it('treats a start on the 14th as billed on the 15th of the start month', () => {
    const s = prorating('2026-07-14T00:00:00');
    const prorated = studentMonthlyCharge(s, 2026, 6);
    expect(studentSemiMonthlyCharge(s, 2026, 6)).toEqual({ first: 0, fifteenth: prorated });
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
