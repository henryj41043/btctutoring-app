import {
  changeDateBounds,
  dateKeyOf,
  earliestAffectedChange,
  findPendingChange,
  HORIZON_MONTHS_AHEAD,
  monthKey,
  newChangesWithoutSchedule,
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

describe('pendingChangeNote', () => {
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

describe('date helpers', () => {
  it('monthKey and dateKeyOf pad their parts', () => {
    expect(monthKey(2026, 0)).toBe('2026-01');
    expect(monthKey(2026, 11)).toBe('2026-12');
    expect(dateKeyOf(new Date(2026, 8, 5))).toBe('2026-09-05');
    expect(dateKeyOf(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('changeDateBounds runs from tomorrow to the end of the look-ahead', () => {
    expect(HORIZON_MONTHS_AHEAD).toBe(3);
    expect(changeDateBounds(new Date(2026, 8, 14, 15, 30))).toEqual({
      min: new Date(2026, 8, 15),
      max: new Date(2026, 11, 31),
    });
    // Month end rolls into the next month; the year boundary is crossed.
    expect(changeDateBounds(new Date(2026, 10, 30))).toEqual({
      min: new Date(2026, 11, 1),
      max: new Date(2027, 1, 28),
    });
  });
});

describe('validatePendingChanges', () => {
  // Sept 14 2026: tomorrow is Sept 15, the look-ahead ends Dec 31.
  const TODAY = new Date(2026, 8, 14, 15, 0, 0);
  const oct: PendingChange = {package: 'Achieve', effective: '2026-10-14'};
  const ok = (changes: PendingChange[], stored: string[] = []) =>
    validatePendingChanges(changes, 'Succeed', stored, TODAY);

  it('accepts an empty list and a valid multi-step chain on any day', () => {
    expect(ok([])).toBeNull();
    expect(ok([oct, {package: 'Succeed', effective: '2026-12-31'}])).toBeNull();
    expect(ok([{package: 'Achieve', effective: '2026-09-15'}])).toBeNull();
    expect(ok([{package: 'Achieve', effective: '2026-10-01'}])).toBeNull();
  });

  it('requires a package and a date on every row', () => {
    expect(ok([{package: '', effective: '2026-10-14'}])).toBe('Pick a package for every scheduled change.');
    expect(ok([{package: 'Achieve', effective: ''}])).toBe('Pick the date each scheduled package change takes effect.');
  });

  it('requires a real date', () => {
    for (const effective of ['2026-10', '10/14/2026', '2026-02-30', '2026-13-01', '2026-10-14T00:00:00']) {
      expect(ok([{package: 'Achieve', effective}])).toBe('A scheduled change needs a valid date.');
    }
    expect(ok([{package: 'Achieve', effective: '2026-02-30'}], ['2026-02-30']))
      .toBe('A scheduled change needs a valid date.');
  });

  it('requires a future date, unless the date is already stored', () => {
    expect(ok([{package: 'Achieve', effective: '2026-09-14'}]))
      .toBe('A scheduled change must take effect on a future date.');
    expect(ok([{package: 'Achieve', effective: '2026-08-01'}]))
      .toBe('A scheduled change must take effect on a future date.');
    expect(ok([{package: 'Achieve', effective: '2026-08-01'}], ['2026-08-01'])).toBeNull();
  });

  it('stays inside the calendar look-ahead, unless the date is already stored', () => {
    expect(ok([{package: 'Achieve', effective: '2027-01-01'}]))
      .toBe('A scheduled change can be set no further ahead than the calendar (three months after this one).');
    expect(ok([{package: 'Achieve', effective: '2027-01-01'}], ['2027-01-01'])).toBeNull();
  });

  it('accepts a custom price of $0 or more and rejects anything else', () => {
    expect(ok([{...oct, price_override: 0}])).toBeNull();
    expect(ok([{...oct, price_override: 410.4}])).toBeNull();
    expect(ok([{...oct, price_override: undefined}])).toBeNull();
    expect(ok([{...oct, price_override: null as never}])).toBeNull();
    for (const bad of [-1, NaN, Infinity, '5' as never]) {
      expect(ok([{...oct, price_override: bad}])).toBe('A custom price must be $0 or more.');
    }
  });

  it('rejects two changes on the same date', () => {
    expect(ok([oct, {package: 'Excel', effective: '2026-10-14'}]))
      .toBe('Two scheduled changes share the same date — pick different dates.');
    expect(ok([oct, {package: 'Excel', effective: '2026-10-15'}])).toBeNull();
  });

  it('rejects a step whose package equals the previous step (current package first)', () => {
    expect(ok([{package: 'Succeed', effective: '2026-10-14'}]))
      .toBe('The scheduled Succeed package matches the step before it — remove it or pick a different package.');
    expect(ok([oct, {package: 'Achieve', effective: '2026-11-01'}]))
      .toBe('The scheduled Achieve package matches the step before it — remove it or pick a different package.');
  });

  it('allows Custom → Custom only when a custom value differs, and requires all three custom values', () => {
    const c1: PendingChange = {package: 'Custom', effective: '2026-10-14', custom_monthly_cost: 400, custom_sessions_per_week: 2, custom_session_length_min: 30};
    expect(ok([c1, {...c1, effective: '2026-11-01'}]))
      .toBe('The scheduled Custom package matches the step before it — remove it or pick a different package.');
    expect(ok([c1, {...c1, effective: '2026-11-01', custom_monthly_cost: 450}])).toBeNull();
    expect(ok([{package: 'Custom', effective: '2026-10-14', custom_monthly_cost: 400}]))
      .toBe('A scheduled Custom package needs all three custom values.');
    expect(validatePendingChanges([{...c1, custom_monthly_cost: 450}], 'Custom', [], TODAY)).toBeNull();
  });
});

describe('earliestAffectedChange', () => {
  const withSlots = (effective: string, pkg = 'Achieve'): PendingChange => ({package: pkg, effective, schedule: [slot]});
  const bare = (effective: string, pkg = 'Achieve'): PendingChange => ({package: pkg, effective});

  it('is null when nothing generated is affected', () => {
    expect(earliestAffectedChange([], [])).toBeNull();
    expect(earliestAffectedChange([withSlots('2026-10-14')], [withSlots('2026-10-14')])).toBeNull();
    // A change without a schedule generated nothing, whatever happens to it.
    expect(earliestAffectedChange([bare('2026-10-14')], [])).toBeNull();
    expect(earliestAffectedChange([{...bare('2026-10-14'), schedule: []}], [])).toBeNull();
    expect(earliestAffectedChange([], [bare('2026-10-14')])).toBeNull();
    expect(earliestAffectedChange([bare('2026-10-14')], [bare('2026-10-20')])).toBeNull();
  });

  it('flags a removed change', () => {
    expect(earliestAffectedChange([withSlots('2026-10-14'), withSlots('2026-11-20', 'Excel')], [withSlots('2026-10-14')]))
      .toBe('2026-11-20');
  });

  it('flags a change that lost its schedule', () => {
    expect(earliestAffectedChange([withSlots('2026-10-14')], [bare('2026-10-14', 'Excel')])).toBe('2026-10-14');
    expect(earliestAffectedChange([withSlots('2026-10-14')], [{...bare('2026-10-14'), schedule: []}])).toBe('2026-10-14');
  });

  it('flags the earlier of the old and new dates of a re-dated change', () => {
    expect(earliestAffectedChange([withSlots('2026-10-14')], [withSlots('2026-10-28')])).toBe('2026-10-14');
    expect(earliestAffectedChange([withSlots('2026-10-14')], [withSlots('2026-10-05')])).toBe('2026-10-05');
  });

  it('flags a new change that already carries a schedule', () => {
    expect(earliestAffectedChange([], [withSlots('2026-10-14')])).toBe('2026-10-14');
  });

  it('returns the earliest of several', () => {
    expect(earliestAffectedChange(
      [withSlots('2026-12-01'), withSlots('2026-10-14', 'Excel'), withSlots('2026-11-20', 'Thrive')],
      [withSlots('2026-10-14', 'Excel')],
    )).toBe('2026-11-20');
    expect(earliestAffectedChange(
      [withSlots('2026-12-01'), withSlots('2026-10-14', 'Excel')],
      [],
    )).toBe('2026-10-14');
  });

  it('ignores a price or package-name difference while the schedule stays', () => {
    expect(earliestAffectedChange(
      [withSlots('2026-10-14')],
      [{...withSlots('2026-10-14'), price_override: 300}],
    )).toBeNull();
  });
});
