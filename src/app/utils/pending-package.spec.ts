import {
  nextMonthFirsts,
  packageFieldsForMonth,
  pendingChanged,
  pendingPackageNote,
} from './pending-package';
import {Student} from '../models/student.model';
import {Package} from '../enums/package.enum';

const pendingStudent = (over: Partial<Student> = {}): Student => ({
  package: Package.SUCCEED,
  custom_monthly_cost: 111,
  pending_package: Package.ACHIEVE,
  pending_package_effective: '2026-09-01',
  ...over,
});

describe('packageFieldsForMonth', () => {
  it('returns the current fields before the effective month', () => {
    expect(packageFieldsForMonth(pendingStudent(), 2026, 7)).toEqual({
      package: Package.SUCCEED,
      custom_monthly_cost: 111,
      custom_sessions_per_week: undefined,
      custom_session_length_min: undefined,
    });
  });

  it('returns the pending fields from the effective month onward', () => {
    expect(packageFieldsForMonth(pendingStudent(), 2026, 8).package).toBe(Package.ACHIEVE);
    expect(packageFieldsForMonth(pendingStudent(), 2027, 0).package).toBe(Package.ACHIEVE);
  });

  it('carries the pending CUSTOM overrides', () => {
    const fields = packageFieldsForMonth(pendingStudent({
      pending_package: Package.CUSTOM,
      pending_custom_monthly_cost: 500,
      pending_custom_sessions_per_week: 2,
      pending_custom_session_length_min: 45,
    }), 2026, 8);
    expect(fields).toEqual({
      package: Package.CUSTOM,
      custom_monthly_cost: 500,
      custom_sessions_per_week: 2,
      custom_session_length_min: 45,
    });
  });

  it('ignores a pending package with no effective date, and vice versa', () => {
    expect(packageFieldsForMonth(pendingStudent({pending_package_effective: undefined}), 2026, 8).package)
      .toBe(Package.SUCCEED);
    expect(packageFieldsForMonth(pendingStudent({pending_package: undefined}), 2026, 8).package)
      .toBe(Package.SUCCEED);
  });

  it('handles a year-boundary effective date', () => {
    const s = pendingStudent({pending_package_effective: '2027-01-01'});
    expect(packageFieldsForMonth(s, 2026, 11).package).toBe(Package.SUCCEED);
    expect(packageFieldsForMonth(s, 2027, 0).package).toBe(Package.ACHIEVE);
  });
});

describe('pendingPackageNote', () => {
  it('formats the change with a component-parsed date (no UTC shift)', () => {
    expect(pendingPackageNote(pendingStudent())).toBe('→ Achieve from Sep 1');
    expect(pendingPackageNote(pendingStudent({pending_package_effective: '2027-01-01'})))
      .toBe('→ Achieve from Jan 1');
  });

  it('is null without a pending change or with a malformed date', () => {
    expect(pendingPackageNote({} as Student)).toBeNull();
    expect(pendingPackageNote(pendingStudent({pending_package: undefined}))).toBeNull();
    expect(pendingPackageNote(pendingStudent({pending_package_effective: 'garbage'}))).toBeNull();
  });
});

describe('nextMonthFirsts', () => {
  it('lists the next N month-1sts starting NEXT month', () => {
    const options = nextMonthFirsts(new Date(2026, 7, 24)); // Aug 24
    expect(options).toHaveLength(6);
    expect(options[0]).toEqual({value: '2026-09-01', label: 'September 2026'});
    expect(options[5]).toEqual({value: '2027-02-01', label: 'February 2027'});
  });

  it('crosses the year boundary from December', () => {
    const options = nextMonthFirsts(new Date(2026, 11, 5), 2);
    expect(options.map(o => o.value)).toEqual(['2027-01-01', '2027-02-01']);
  });
});

describe('pendingChanged', () => {
  const prior = pendingStudent();

  it('is false when nothing is pending on the saved student', () => {
    expect(pendingChanged(prior, pendingStudent({pending_package: '' as never}))).toBe(false);
    expect(pendingChanged(undefined, {} as Student)).toBe(false);
  });

  it('is true for a brand-new pending change', () => {
    expect(pendingChanged({package: Package.SUCCEED} as Student, pendingStudent())).toBe(true);
    expect(pendingChanged(undefined, pendingStudent())).toBe(true);
  });

  it('is false when the pending change is unchanged', () => {
    expect(pendingChanged(prior, pendingStudent())).toBe(false);
  });

  it('is true when any pending field differs', () => {
    expect(pendingChanged(prior, pendingStudent({pending_package: Package.EXCEL}))).toBe(true);
    expect(pendingChanged(prior, pendingStudent({pending_package_effective: '2026-10-01'}))).toBe(true);
    expect(pendingChanged(prior, pendingStudent({pending_custom_monthly_cost: 9}))).toBe(true);
    expect(pendingChanged(prior, pendingStudent({pending_custom_sessions_per_week: 9}))).toBe(true);
    expect(pendingChanged(prior, pendingStudent({pending_custom_session_length_min: 9}))).toBe(true);
  });
});
