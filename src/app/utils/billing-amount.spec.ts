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

  it('falls back to full cost when a mid-month starter has no schedule', () => {
    // start === monthEnd, getDate() > 1 → prorated path is taken, but with no
    // schedule the remaining slots can't be counted → full cost, not $0
    // (studentNeedsAttention flags these).
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

  it('prorates the first partial month from the sessions the student receives', () => {
    // Custom $400/mo, 1×45min, schedule on Wednesdays. July 2026: Wednesdays are
    // 1, 8, 15, 22, 29. Starting the 15th leaves the 15th, 22nd, 29th → 3 slots.
    // weekly = round(400*12/52,2)=92.31; perSession=92.31; round(92.31*3,2)=276.93
    const student = {
      package: Package.CUSTOM,
      custom_monthly_cost: 400,
      custom_sessions_per_week: 1,
      custom_session_length_min: 45,
      package_start_date: '2026-07-15T00:00:00',
      schedule: [{ weekday: Weekday.WEDNESDAY, start_time: '10:00', end_time: '10:45' }],
    } as Student;
    expect(studentMonthlyCharge(student, 2026, 6)).toBe(276.93);
  });

  it('charges one per-session cost when a single session remains (regression)', () => {
    // Succeed $362: 362*12=4344/yr → /52 = 83.54/wk → /2 = 41.77/session.
    // June 2026: Tuesdays 2,9,16,23,30; Thursdays 4,11,18,25. Starting Tue
    // Jun 30 leaves exactly one session → $41.77 (previously mis-billed $27.84
    // by subtracting 8 missed sessions from the flat monthly price).
    const student = succeed({
      package_start_date: '2026-06-30T00:00:00',
      schedule: [
        { weekday: Weekday.TUESDAY, start_time: '10:00', end_time: '10:30' },
        { weekday: Weekday.THURSDAY, start_time: '10:00', end_time: '10:30' },
      ],
    });
    expect(studentMonthlyCharge(student, 2026, 5)).toBe(41.77);
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

  it('splits the prorated first month evenly across the 1st and 15th when starting before the 15th', () => {
    // Monday schedule, July 2026 Mondays: 6, 13, 20, 27. Start Jul 10 →
    // remaining 13, 20, 27 = 3 slots → round(41.77*3,2) = 125.31 → split.
    const s = prorating('2026-07-10T00:00:00');
    expect(studentMonthlyCharge(s, 2026, 6)).toBe(125.31);
    expect(studentSemiMonthlyCharge(s, 2026, 6)).toEqual({ first: 62.66, fifteenth: 62.65 });
    // The following month resumes the normal split.
    expect(studentSemiMonthlyCharge(s, 2026, 7)).toEqual({ first: 181, fifteenth: 181 });
  });

  it('bills the full prorated first month on the 15th of the start month when starting on/after the 15th', () => {
    // Start Jul 20 → remaining Mondays 20, 27 = 2 slots → 83.54, entirely on
    // the 15th of the START month; the 1st stays blank (0).
    const s = prorating('2026-07-20T00:00:00');
    expect(studentSemiMonthlyCharge(s, 2026, 6)).toEqual({ first: 0, fifteenth: 83.54 });
    // The following month resumes the normal split.
    expect(studentSemiMonthlyCharge(s, 2026, 7)).toEqual({ first: 181, fifteenth: 181 });
  });

  it('treats a start exactly on the 15th as billed entirely on the 15th', () => {
    const s = prorating('2026-07-15T00:00:00');
    const prorated = studentMonthlyCharge(s, 2026, 6);
    expect(studentSemiMonthlyCharge(s, 2026, 6)).toEqual({ first: 0, fifteenth: prorated });
  });

  it('treats a start on the 14th as split across both dates', () => {
    // Start Jul 14 → remaining Mondays 20, 27 = 2 slots → 83.54 → 41.77 each.
    const s = prorating('2026-07-14T00:00:00');
    expect(studentSemiMonthlyCharge(s, 2026, 6)).toEqual({ first: 41.77, fifteenth: 41.77 });
  });

  it('falls back to a full-cost split when a mid-month starter has no schedule', () => {
    const s = succeed({ package_start_date: '2026-07-10T00:00:00' });
    expect(studentSemiMonthlyCharge(s, 2026, 6)).toEqual({ first: 181, fifteenth: 181 });
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
