import {monthKeyOf, upcomingMonthKeys} from './month-key';

describe('month-key', () => {
  it('keys a date by its local month, zero-padded', () => {
    expect(monthKeyOf(new Date(2026, 0, 31))).toBe('2026-01');
    expect(monthKeyOf(new Date(2026, 8, 1))).toBe('2026-09');
    expect(monthKeyOf(new Date(2026, 11, 15))).toBe('2026-12');
  });

  it('lists the months after the current one, soonest first, across the year end', () => {
    expect(upcomingMonthKeys(new Date(2026, 9, 2), 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('is not thrown off by a long month ending on the 31st', () => {
    // Jan 31 + 1 month must be February, not March.
    expect(upcomingMonthKeys(new Date(2027, 0, 31), 2)).toEqual(['2027-02', '2027-03']);
  });

  it('lists exactly the count asked for, and nothing for zero', () => {
    expect(upcomingMonthKeys(new Date(2026, 9, 2), 12)).toHaveLength(12);
    expect(upcomingMonthKeys(new Date(2026, 9, 2), 12)[11]).toBe('2027-10');
    expect(upcomingMonthKeys(new Date(2026, 9, 2), 0)).toEqual([]);
  });
});
