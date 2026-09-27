import {
  coversWholeMonth, FLAG_LABELS, flagLabels, formatMoney, linePeriod, lineSessions, lineSummary,
  shortDate, statementPackages, toBillingEntry,
} from './statement-view';
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

  it('knows a whole month from a partial one', () => {
    expect(coversWholeMonth(statementLine())).toBe(true);
    expect(coversWholeMonth(statementLine({from: '2026-07-02'}))).toBe(false);
    expect(coversWholeMonth(statementLine({to: '2026-07-30'}))).toBe(false);
    expect(coversWholeMonth(statementLine({from: '2026-02-01', to: '2026-02-28'}))).toBe(true);
    expect(coversWholeMonth(statementLine({from: '2026-09-01', to: '2026-09-30'}))).toBe(true);
    expect(coversWholeMonth(statementLine({from: '2026-12-01', to: '2026-12-31'}))).toBe(true);
    // The 11th is not the 1st even though it ends in "1".
    expect(coversWholeMonth(statementLine({from: '2026-07-11'}))).toBe(false);
  });

  it('describes the days a line covers', () => {
    expect(linePeriod(statementLine())).toBe('Full month');
    expect(linePeriod(statementLine({from: '2026-07-14'}))).toBe('From Jul 14');
    expect(linePeriod(statementLine({to: '2026-07-18'}))).toBe('Through Jul 18');
    expect(linePeriod(statementLine({from: '2026-07-14', to: '2026-07-20'}))).toBe('Jul 14 to Jul 20');
    expect(linePeriod(statementLine({from: '2026-09-14', to: '2026-09-30'}))).toBe('From Sep 14');
    expect(linePeriod(statementLine({from: '2026-07-11', to: '2026-07-21'}))).toBe('Jul 11 to Jul 21');
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
    it('maps a monthly statement', () => {
      const s = statement();
      expect(toBillingEntry(s)).toEqual({
        contact_id: 'c-1',
        name: 'Casey Lee',
        packages: 'Pat: Succeed',
        cycle: 'monthly',
        due_first: 362,
        due_fifteenth: null,
        derived_first: 362,
        derived_fifteenth: null,
        override_first: null,
        override_fifteenth: null,
        total: 362,
        discount: 0,
        discount_percent: 0,
        paid_first: false,
        paid_fifteenth: false,
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
      expect(entry.due_first).toBe(181);
      expect(entry.due_fifteenth).toBe(181.01);
      expect(entry.total).toBe(362.01);
      expect(entry.paid_first).toBe(true);
      expect(entry.paid_fifteenth).toBe(true);
    });

    it('ignores a 15th due on a monthly statement', () => {
      const entry = toBillingEntry(statement({
        dues: [statementDue(), statementDue({day: 15, derived: 50, amount: 50, override: 5, paid: true})],
      }));
      expect(entry.due_fifteenth).toBeNull();
      expect(entry.override_fifteenth).toBeNull();
      expect(entry.paid_fifteenth).toBe(false);
      expect(entry.total).toBe(362);
    });

    it('a half with no charge renders blank', () => {
      const entry = toBillingEntry(semiStatement({
        dues: [
          statementDue({derived: 0, amount: 0}),
          statementDue({day: 15, derived: 126, amount: 126}),
        ],
      }));
      expect(entry.due_first).toBeNull();
      expect(entry.derived_first).toBeNull();
      expect(entry.due_fifteenth).toBe(126);
      expect(entry.total).toBe(126);
    });

    it('an override replaces its half, including $0', () => {
      const entry = toBillingEntry(semiStatement({
        dues: [
          statementDue({derived: 181, override: 150, amount: 150}),
          statementDue({day: 15, derived: 181, override: 0, amount: 0}),
        ],
      }));
      expect(entry.due_first).toBe(150);
      expect(entry.derived_first).toBe(181);
      expect(entry.override_first).toBe(150);
      expect(entry.due_fifteenth).toBe(0);
      expect(entry.override_fifteenth).toBe(0);
      expect(entry.total).toBe(150);
    });

    it('tolerates a statement without dues', () => {
      const entry = toBillingEntry(statement({dues: []}));
      expect(entry.due_first).toBeNull();
      expect(entry.override_first).toBeNull();
      expect(entry.paid_first).toBe(false);
      expect(entry.total).toBe(0);
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
