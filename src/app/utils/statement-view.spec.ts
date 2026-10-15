import {
  coversWholeMonth, cycleLabel, duesTotal, FLAG_LABELS, flagLabels, formatMoney, linePeriod, lineSessions, lineSummary,
  shortDate, statementPackages, toBillingEntry,
} from './statement-view';
import {EntryDue} from '../models/billing-entry.model';
import {StatementDue} from '../models/statement.model';
import {semiStatement, statement, statementDue, statementLine} from '../../testing/statement.fixture';
import {LineFlag} from '../models/statement.model';

describe('statement-view', () => {
  it('labels every flag', () => {
    expect(FLAG_LABELS).toEqual({
      prorated_start: 'Prorated start',
      prorated_end: 'Prorated end',
      package_change: 'Package change',
      price_override: 'Custom price',
      discount: 'Discount',
      unpriced: 'Not priced',
      no_charge: 'No charge',
    });
    expect(flagLabels(['prorated_start', 'discount'])).toEqual(['Prorated start', 'Discount']);
    expect(flagLabels(undefined)).toEqual([]);
    expect(flagLabels(['nope' as LineFlag, 'unpriced'])).toEqual(['Not priced']);
  });

  it('formats money with cents and a zero fallback', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(formatMoney(undefined)).toBe('$0.00');
    expect(formatMoney(null)).toBe('$0.00');
  });

  it('renders a short wall date', () => {
    expect(shortDate('2026-09-14')).toBe('Sep 14');
    expect(shortDate('2026-01-01')).toBe('Jan 1');
  });

  it('knows a whole month from a partial one by the session counts', () => {
    expect(coversWholeMonth(statementLine())).toBe(true);
    // October under the straddling-weeks rule runs Oct 4 to Oct 31 and is still full.
    expect(coversWholeMonth(statementLine({from: '2026-10-04', to: '2026-10-31', sessions_billed: 8, sessions_in_month: 8}))).toBe(true);
    expect(coversWholeMonth(statementLine({from: '2026-07-02', sessions_billed: 3}))).toBe(false);
    expect(coversWholeMonth(statementLine({to: '2026-07-30', sessions_billed: 3}))).toBe(false);
    // An inner line of a package-change month: fewer sessions than the month holds.
    expect(coversWholeMonth(statementLine({from: '2026-07-14', sessions_billed: 2, flags: ['package_change']}))).toBe(false);
  });

  it('falls back to the calendar dates for lines without session counts', () => {
    const uncounted = {sessions_in_month: 0, sessions_billed: 0};
    expect(coversWholeMonth(statementLine({...uncounted}))).toBe(true);
    expect(coversWholeMonth(statementLine({...uncounted, from: '2026-07-02'}))).toBe(false);
    expect(coversWholeMonth(statementLine({...uncounted, to: '2026-07-30'}))).toBe(false);
    expect(coversWholeMonth(statementLine({...uncounted, from: '2026-02-01', to: '2026-02-28'}))).toBe(true);
    expect(coversWholeMonth(statementLine({...uncounted, from: '2026-12-01', to: '2026-12-31'}))).toBe(true);
    // The 11th is not the 1st even though it ends in "1".
    expect(coversWholeMonth(statementLine({...uncounted, from: '2026-07-11'}))).toBe(false);
    expect(coversWholeMonth(statementLine({kind: 'prior_package', to: '2026-07-13'}))).toBe(false);
  });

  it('describes the days a line covers', () => {
    const partial = {sessions_billed: 2};
    expect(linePeriod(statementLine())).toBe('Full month');
    expect(linePeriod(statementLine({...partial, from: '2026-07-14'}))).toBe('From Jul 14');
    expect(linePeriod(statementLine({...partial, to: '2026-07-18'}))).toBe('Through Jul 18');
    expect(linePeriod(statementLine({...partial, from: '2026-07-14', to: '2026-07-20'}))).toBe('Jul 14 to Jul 20');
    expect(linePeriod(statementLine({...partial, from: '2026-09-14', to: '2026-09-30'}))).toBe('From Sep 14');
    expect(linePeriod(statementLine({...partial, from: '2026-07-11', to: '2026-07-21'}))).toBe('Jul 11 to Jul 21');
  });

  it('reads From and Through against the statement month when given', () => {
    const partial = {sessions_billed: 1, sessions_in_month: 10};
    // A September statement carrying the Oct 1 to 3 week.
    expect(linePeriod(statementLine({...partial, from: '2026-10-01', to: '2026-10-03'}), '2026-09')).toBe('Oct 1 to Oct 3');
    expect(linePeriod(statementLine({...partial, from: '2026-09-14', to: '2026-10-03'}), '2026-09')).toBe('Sep 14 to Oct 3');
    // A December statement carrying Nov 29 to Dec 1.
    expect(linePeriod(statementLine({...partial, from: '2026-11-29', to: '2026-12-01'}), '2026-12')).toBe('Nov 29 to Dec 1');
    expect(linePeriod(statementLine({...partial, from: '2026-12-01', to: '2026-12-10'}), '2026-12')).toBe('Through Dec 10');
    // Without the month the line's own month is assumed.
    expect(linePeriod(statementLine({...partial, from: '2026-10-01', to: '2026-10-03'}))).toBe('Through Oct 3');
  });

  it('shows counted sessions only', () => {
    expect(lineSessions(statementLine({sessions_billed: 3}))).toBe('3 of 4');
    expect(lineSessions(statementLine({sessions_billed: 0}))).toBe('0 of 4');
    expect(lineSessions(statementLine({sessions_in_month: 0}))).toBe('—');
    expect(lineSessions(statementLine({kind: 'prior_package'}))).toBe('—');
  });

  describe('lineSummary', () => {
    it('a full month', () => {
      expect(lineSummary(statementLine())).toBe('Pat: Succeed, full month');
    });

    it('a prorated start', () => {
      expect(lineSummary(statementLine({from: '2026-07-14', sessions_billed: 3, flags: ['prorated_start']})))
        .toBe('Pat: Succeed, from Jul 14, 3 of 4 sessions at $83.54');
      expect(lineSummary(statementLine({from: '2026-10-01', to: '2026-10-03', sessions_billed: 1, sessions_in_month: 10, flags: ['prorated_start']}), '2026-09'))
        .toBe('Pat: Succeed, Oct 1 to Oct 3, 1 of 10 sessions at $83.54');
    });

    it('a legacy prior-package portion has no session count', () => {
      expect(lineSummary(statementLine({kind: 'prior_package', package: 'Previous package', to: '2026-07-13'})))
        .toBe('Pat: Previous package, through Jul 13');
    });

    it('a partial month without a schedule has no session count', () => {
      expect(lineSummary(statementLine({from: '2026-07-14', sessions_in_month: 0})))
        .toBe('Pat: Succeed, from Jul 14');
    });

    it('custom price and discount', () => {
      expect(lineSummary(statementLine({
        monthly_price: 410.4, flags: ['price_override', 'discount'],
        discount_percent: 10, discount_amount: 41.04,
      }))).toBe('Pat: Succeed, full month, custom price $410.40, less 10% ($41.04)');
    });

    it('an unpriced package', () => {
      expect(lineSummary(statementLine({package: 'Custom', flags: ['unpriced']})))
        .toBe('Pat: Custom, not priced');
    });
  });

  it('lists each student package once, then the group enrollments', () => {
    expect(statementPackages(statement({
      lines: [
        statementLine({kind: 'prior_package', package: 'Previous package'}),
        statementLine({package: 'Start'}),
        statementLine({package: 'Succeed'}),
        statementLine({package: 'Succeed'}),
        statementLine({student_name: 'Sam', package: 'Start'}),
      ],
      group_students: ['Sam', 'Kai'],
    }))).toBe('Pat: Start; Pat: Succeed; Sam: Start; Sam: BTC & Me; Kai: BTC & Me');
    expect(statementPackages(statement({lines: [], group_students: undefined as never}))).toBe('');
  });

  describe('toBillingEntry', () => {
    const due = (over: Partial<EntryDue> = {}): EntryDue => ({
      period_start: '2026-07-01', label: '1st', derived: 362, override: null, amount: 362, paid: false, ...over,
    });

    it('maps a monthly statement to one due on the 1st', () => {
      const s = statement();
      expect(toBillingEntry(s)).toEqual({
        contact_id: 'c-1',
        name: 'Casey Lee',
        packages: 'Pat: Succeed',
        cycle: 'monthly',
        dues: [due()],
        total: 362,
        discount: 0,
        discount_percent: 0,
        needs_attention: false,
        labels: [],
        statement: s,
      });
    });

    it('maps both halves of a semi-monthly statement', () => {
      const entry = toBillingEntry(semiStatement({
        dues: [
          statementDue({derived: 181, amount: 181, paid: true}),
          statementDue({day: 15, period_start: '2026-07-15', derived: 181.01, amount: 181.01, paid: true}),
        ],
      }));
      expect(entry.dues).toEqual([
        due({derived: 181, amount: 181, paid: true}),
        due({period_start: '2026-07-15', label: '15th', derived: 181.01, amount: 181.01, paid: true}),
      ]);
      expect(entry.total).toBe(362.01);
    });

    it('ignores a 15th due on a monthly statement', () => {
      const entry = toBillingEntry(statement({
        dues: [statementDue(), statementDue({day: 15, derived: 50, amount: 50, override: 5, paid: true})],
      }));
      expect(entry.dues).toHaveLength(1);
      expect(entry.total).toBe(362);
    });

    it('a half with no charge renders blank', () => {
      const entry = toBillingEntry(semiStatement({
        dues: [
          statementDue({derived: 0, amount: 0}),
          statementDue({day: 15, derived: 126, amount: 126}),
        ],
      }));
      expect(entry.dues![0]).toEqual(due({derived: null, amount: null}));
      expect(entry.dues![1].amount).toBe(126);
      expect(entry.total).toBe(126);
    });

    it('an override replaces its half, including $0', () => {
      const entry = toBillingEntry(semiStatement({
        dues: [
          statementDue({derived: 181, override: 150, amount: 150}),
          statementDue({day: 15, derived: 181, override: 0, amount: 0}),
        ],
      }));
      expect(entry.dues![0]).toEqual(expect.objectContaining({derived: 181, override: 150, amount: 150}));
      expect(entry.dues![1]).toEqual(expect.objectContaining({derived: 181, override: 0, amount: 0}));
      expect(entry.total).toBe(150);
    });

    it('tolerates a statement without dues', () => {
      const entry = toBillingEntry(statement({dues: []}));
      expect(entry.dues).toEqual([]);
      expect(entry.total).toBe(0);
      expect(toBillingEntry(statement({dues: undefined as unknown as StatementDue[]})).dues).toEqual([]);
    });

    it('maps every weekly due, dated and labelled by its day', () => {
      const weekly = statement({
        cycle: 'weekly',
        dues: [
          statementDue({day: 4, period_start: '2026-09-04', derived: 105.23, amount: 105.23}),
          statementDue({day: 11, period_start: '2026-09-11', derived: 105.23, amount: 105.23, paid: true}),
          statementDue({day: 18, period_start: '2026-09-18', derived: 105.23, override: 0, amount: 0}),
          statementDue({day: 25, period_start: '2026-09-25', derived: 105.23, amount: 105.23}),
          statementDue({day: 2, period_start: '2026-10-02', derived: 52.62, amount: 52.62}),
        ],
      });
      const entry = toBillingEntry(weekly);
      expect(entry.dues!.map(d => [d.label, d.amount, d.paid])).toEqual([
        ['Sep 4', 105.23, false],
        ['Sep 11', 105.23, true],
        ['Sep 18', 0, false],
        ['Sep 25', 105.23, false],
        ['Oct 2', 52.62, false],
      ]);
      expect(entry.dues![2].override).toBe(0);
      expect(entry.total).toBe(368.31);
    });

    it('labels the cycle, with the weekday read off a weekly family\'s first due', () => {
      expect(cycleLabel('monthly')).toBe('Monthly');
      expect(cycleLabel(undefined)).toBe('Monthly');
      expect(cycleLabel('semi_monthly')).toBe('Semi-monthly');
      expect(cycleLabel('weekly')).toBe('Weekly');
      expect(cycleLabel('weekly', [due({period_start: '2026-10-09'})])).toBe('Weekly (Fri)');
      expect(cycleLabel('weekly', [due({period_start: '2026-10-04'})])).toBe('Weekly (Sun)');
    });

    it('duesTotal counts the effective amounts, blanks as nothing', () => {
      expect(duesTotal([])).toBe(0);
      expect(duesTotal([due({amount: 0.1}), due({amount: 0.2}), due({amount: null})])).toBe(0.3);
    });

    it('shows the sibling percent only when it is the sole discount', () => {
      const sibling = toBillingEntry(statement({sibling_discount_percent: 10, sibling_discount_amount: 36.2}));
      expect(sibling.discount).toBe(36.2);
      expect(sibling.discount_percent).toBe(10);

      const both = toBillingEntry(statement({
        lines: [
          statementLine({discount_percent: 10, discount_amount: 0.1}),
          statementLine({discount_percent: 10, discount_amount: 0.2}),
        ],
        sibling_discount_percent: 5,
        sibling_discount_amount: 1,
      }));
      // 0.1 + 0.2 + 1 is re-rounded.
      expect(both.discount).toBe(1.3);
      expect(both.discount_percent).toBe(0);
    });

    it('carries labels and the attention flag', () => {
      const entry = toBillingEntry(statement({flags: ['prorated_end', 'price_override'], needs_attention: true}));
      expect(entry.labels).toEqual(['Prorated end', 'Custom price']);
      expect(entry.needs_attention).toBe(true);
    });
  });
});
