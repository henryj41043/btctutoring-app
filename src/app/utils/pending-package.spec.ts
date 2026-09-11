import {
  effectiveMonthLabel,
  findPendingChange,
  newChangesWithoutSchedule,
  nextMonthFirsts,
  packageFieldsForMonth,
  pendingChangeNote,
  pendingChangesOf,
  sameChange,
  validatePendingChanges,
  withPendingSchedule,
} from './pending-package';
import {PendingChange, Student} from '../models/student.model';
import {Weekday} from '../enums/weekday.enum';

const slot = {weekday: Weekday.MONDAY, start_time: '10:00', end_time: '10:30'};
const sep: PendingChange = {package: 'Achieve', effective: '2026-09-01'};
const jan: PendingChange = {package: 'Excel', effective: '2027-01-01', schedule: [slot]};
const pendingStudent = (over: Partial<Student> = {}): Student => ({
  package: 'Succeed',
  custom_monthly_cost: 111,
  pending_changes: [sep],
  ...over,
});
const NOW = new Date(2026, 7, 24); // Aug 24, 2026

describe('pendingChangesOf', () => {
  it('returns the list sorted by effective as fresh copies', () => {
    const s = pendingStudent({pending_changes: [jan, sep]});
    const result = pendingChangesOf(s);
    expect(result.map(c => c.effective)).toEqual(['2026-09-01', '2027-01-01']);
    expect(result[0]).not.toBe(sep);
    expect(s.pending_changes![0]).toBe(jan);
  });

  it('drops malformed entries and is empty for undefined / no changes', () => {
    expect(pendingChangesOf(pendingStudent({pending_changes: [sep, null as never, {package: '', effective: 'x'}]})))
      .toEqual([sep]);
    expect(pendingChangesOf(undefined)).toEqual([]);
    expect(pendingChangesOf({} as Student)).toEqual([]);
    expect(pendingChangesOf(pendingStudent({pending_changes: []}))).toEqual([]);
  });

  it('folds a legacy single change (with and without optional fields)', () => {
    expect(pendingChangesOf({
      pending_package: 'Custom',
      pending_package_effective: '2026-10-01',
      pending_custom_monthly_cost: 400,
      pending_custom_sessions_per_week: 2,
      pending_custom_session_length_min: 45,
      pending_schedule: [slot],
      pending_change_notice_sent: '2026-10-01',
    } as Student)).toEqual([{
      package: 'Custom', effective: '2026-10-01',
      custom_monthly_cost: 400, custom_sessions_per_week: 2, custom_session_length_min: 45,
      schedule: [slot], notice_sent: '2026-10-01',
    }]);
    expect(pendingChangesOf({pending_package: 'Excel', pending_package_effective: '2026-10-01', pending_schedule: []} as Student))
      .toEqual([{package: 'Excel', effective: '2026-10-01'}]);
    expect(pendingChangesOf({pending_package: 'Excel'} as Student)).toEqual([]);
  });
});

describe('packageFieldsForMonth', () => {
  it('returns the current fields before the effective month', () => {
    expect(packageFieldsForMonth(pendingStudent(), 2026, 7)).toEqual({
      package: 'Succeed',
      custom_monthly_cost: 111,
      custom_sessions_per_week: undefined,
      custom_session_length_min: undefined,
    });
  });

  it('returns the pending fields from the effective month onward', () => {
    expect(packageFieldsForMonth(pendingStudent(), 2026, 8).package).toBe('Achieve');
    expect(packageFieldsForMonth(pendingStudent(), 2027, 0).package).toBe('Achieve');
  });

  it('resolves the LATEST reached change with several queued (unsorted input)', () => {
    const s = pendingStudent({pending_changes: [
      {package: 'Apex', effective: '2027-01-01'},
      sep,
      {package: 'Excel', effective: '2026-11-01'},
    ]});
    expect(packageFieldsForMonth(s, 2026, 7).package).toBe('Succeed');
    expect(packageFieldsForMonth(s, 2026, 8).package).toBe('Achieve');
    expect(packageFieldsForMonth(s, 2026, 9).package).toBe('Achieve');
    expect(packageFieldsForMonth(s, 2026, 10).package).toBe('Excel');
    expect(packageFieldsForMonth(s, 2027, 5).package).toBe('Apex');
  });

  it('carries the pending CUSTOM overrides', () => {
    const fields = packageFieldsForMonth(pendingStudent({pending_changes: [{
      package: 'Custom', effective: '2026-09-01',
      custom_monthly_cost: 500, custom_sessions_per_week: 2, custom_session_length_min: 45,
    }]}), 2026, 8);
    expect(fields).toEqual({
      package: 'Custom',
      custom_monthly_cost: 500,
      custom_sessions_per_week: 2,
      custom_session_length_min: 45,
    });
  });

  it('reads a legacy single change and handles a year-boundary effective date', () => {
    const legacy = {package: 'Succeed', pending_package: 'Achieve', pending_package_effective: '2027-01-01'} as Student;
    expect(packageFieldsForMonth(legacy, 2026, 11).package).toBe('Succeed');
    expect(packageFieldsForMonth(legacy, 2027, 0).package).toBe('Achieve');
  });
});

describe('pendingChangeNote / effectiveMonthLabel', () => {
  it('formats the change with a component-parsed date (no UTC shift)', () => {
    expect(pendingChangeNote(sep)).toBe('→ Achieve from Sep 1');
    expect(pendingChangeNote(jan)).toBe('→ Excel from Jan 1');
  });

  it('is null when incomplete or malformed', () => {
    expect(pendingChangeNote(undefined)).toBeNull();
    expect(pendingChangeNote({package: 'Achieve'})).toBeNull();
    expect(pendingChangeNote({effective: '2026-09-01'})).toBeNull();
    expect(pendingChangeNote({package: 'Achieve', effective: 'garbage'})).toBeNull();
    expect(pendingChangeNote({package: 'Achieve', effective: '2026-13-01'})).toBeNull();
  });

  it('labels an effective month, falling back to the raw value', () => {
    expect(effectiveMonthLabel('2026-09-01')).toBe('September 2026');
    expect(effectiveMonthLabel('garbage')).toBe('garbage');
    expect(effectiveMonthLabel('2026-13-01')).toBe('2026-13-01');
  });
});

describe('nextMonthFirsts', () => {
  it('lists the next N month-1sts starting NEXT month', () => {
    const options = nextMonthFirsts(NOW);
    expect(options).toHaveLength(6);
    expect(options[0]).toEqual({value: '2026-09-01', label: 'September 2026'});
    expect(options[5]).toEqual({value: '2027-02-01', label: 'February 2027'});
  });

  it('crosses the year boundary from December', () => {
    const options = nextMonthFirsts(new Date(2026, 11, 5), 2);
    expect(options.map(o => o.value)).toEqual(['2027-01-01', '2027-02-01']);
  });
});

describe('findPendingChange / withPendingSchedule / sameChange', () => {
  it('finds by effective date (undefined when absent or unset)', () => {
    const s = pendingStudent({pending_changes: [sep, jan]});
    expect(findPendingChange(s, '2027-01-01')).toEqual(jan);
    expect(findPendingChange(s, '2028-01-01')).toBeUndefined();
    expect(findPendingChange(s, undefined)).toBeUndefined();
    expect(findPendingChange(undefined, '2027-01-01')).toBeUndefined();
  });

  it("replaces only the matching change's schedule, copying the rest", () => {
    const result = withPendingSchedule([sep, jan], '2026-09-01', [slot]);
    expect(result).toEqual([{...sep, schedule: [slot]}, jan]);
    expect(result[1]).not.toBe(jan);
    expect(sep.schedule).toBeUndefined();
  });

  it('compares package, date and null-coalesced customs (schedule ignored)', () => {
    expect(sameChange(sep, {...sep, schedule: [slot], custom_monthly_cost: undefined})).toBe(true);
    expect(sameChange(sep, {...sep, custom_monthly_cost: null as never})).toBe(true);
    expect(sameChange(sep, {...sep, package: 'Excel'})).toBe(false);
    expect(sameChange(sep, {...sep, effective: '2026-10-01'})).toBe(false);
    expect(sameChange(sep, {...sep, custom_sessions_per_week: 2})).toBe(false);
    expect(sameChange(sep, {...sep, custom_session_length_min: 45})).toBe(false);
  });
});

describe('newChangesWithoutSchedule', () => {
  it('returns new or edited changes lacking a schedule, oldest first', () => {
    const prior = pendingStudent({pending_changes: [sep]});
    const next: PendingChange[] = [
      {package: 'Apex', effective: '2027-03-01'},
      sep, // unchanged → skipped
      {...sep, effective: '2026-10-01'}, // re-dated → new
      jan, // has a schedule → skipped
    ];
    expect(newChangesWithoutSchedule(prior, next).map(c => c.effective))
      .toEqual(['2026-10-01', '2027-03-01']);
    expect(newChangesWithoutSchedule(undefined, [sep])).toEqual([sep]);
    expect(newChangesWithoutSchedule(prior, [])).toEqual([]);
  });
});

describe('validatePendingChanges', () => {
  const ok = (changes: PendingChange[], stored: string[] = []) =>
    validatePendingChanges(changes, 'Succeed', stored, NOW);

  it('accepts an empty list and a valid multi-step chain', () => {
    expect(ok([])).toBeNull();
    expect(ok([sep, {package: 'Succeed', effective: '2027-01-01'}])).toBeNull(); // back to the current package later is fine
  });

  it('requires a package and an effective month on every row', () => {
    expect(ok([{package: '', effective: '2026-09-01'}])).toBe('Pick a package for every scheduled change.');
    expect(ok([{package: 'Achieve', effective: ''}])).toBe('Pick the month each scheduled package change takes effect.');
  });

  it('requires the 1st of a future month, unless the date is already stored', () => {
    expect(ok([{package: 'Achieve', effective: '2026-09-15'}])).toBe('A scheduled change must take effect on the 1st of a month.');
    expect(ok([{package: 'Achieve', effective: '2026-08-01'}])).toBe('A scheduled change must take effect in a future month.');
    expect(ok([{package: 'Achieve', effective: '2026-08-01'}], ['2026-08-01'])).toBeNull();
    expect(ok([{package: 'Achieve', effective: '2026-09-01'}])).toBeNull(); // next month is future
  });

  it('rejects two changes in the same month', () => {
    expect(ok([sep, {package: 'Excel', effective: '2026-09-01'}]))
      .toBe('Two scheduled changes share the same month — pick different months.');
  });

  it('rejects a step whose package equals the previous step (current package first)', () => {
    expect(ok([{package: 'Succeed', effective: '2026-09-01'}]))
      .toBe('The scheduled Succeed package matches the step before it — remove it or pick a different package.');
    expect(ok([sep, {package: 'Achieve', effective: '2026-10-01'}]))
      .toBe('The scheduled Achieve package matches the step before it — remove it or pick a different package.');
  });

  it('allows Custom → Custom only when a custom value differs, and requires all three custom values', () => {
    const c1: PendingChange = {package: 'Custom', effective: '2026-09-01', custom_monthly_cost: 400, custom_sessions_per_week: 2, custom_session_length_min: 30};
    expect(ok([c1, {...c1, effective: '2026-10-01'}]))
      .toBe('The scheduled Custom package matches the step before it — remove it or pick a different package.');
    expect(ok([c1, {...c1, effective: '2026-10-01', custom_monthly_cost: 450}])).toBeNull();
    expect(ok([{package: 'Custom', effective: '2026-09-01', custom_monthly_cost: 400}]))
      .toBe('A scheduled Custom package needs all three custom values.');
    expect(validatePendingChanges([{...c1, custom_monthly_cost: 450}], 'Custom', [], NOW)).toBeNull();
  });
});
