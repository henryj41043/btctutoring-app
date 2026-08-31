import {currentPeriodAmounts, recomputedBillingRecords} from './billing-recompute';
import {Contact} from '../models/contact.model';
import {Student} from '../models/student.model';
import {BillingRecord} from '../models/billing-record.model';
import {TEST_CATALOG} from '../../testing/package-catalog.fixture';
import {BillingCycle} from '../enums/billing-cycle.enum';
import {StudentStatus} from '../enums/student-status.enum';

// A full month of the Succeed package resolves to $362 (181/181 split).
const enrolled = (over: Partial<Student> = {}): Student => ({
  id: 's-1', contact_id: 'c-1', name: 'Pat', status: StudentStatus.ACTIVE_STUDENT,
  package: 'Succeed', package_start_date: '2020-01-01T00:00:00',
  schedule: [{weekday: 'MONDAY', start_time: '10:00', end_time: '10:30'}],
  ...over,
} as Student);

const contact = (over: Partial<Contact> = {}): Contact =>
  ({id: 'c-1', billing_cycle: BillingCycle.MONTHLY, ...over} as Contact);

describe('billing-recompute', () => {
  describe('currentPeriodAmounts', () => {
    it('returns null with no enrolled students', () => {
      expect(currentPeriodAmounts(contact(), [], 2026, 7, TEST_CATALOG)).toBeNull();
    });

    it('computes a single first-of-month amount for monthly billing', () => {
      const computed = currentPeriodAmounts(contact(), [enrolled()], 2026, 7, TEST_CATALOG)!;
      expect(computed.cycle).toBe(BillingCycle.MONTHLY);
      expect(computed.amounts).toEqual([{day: 1, amount: 362}]);
    });

    it('splits semi-monthly billing across the 1st and 15th', () => {
      const computed = currentPeriodAmounts(
        contact({billing_cycle: BillingCycle.SEMI_MONTHLY}), [enrolled()], 2026, 7,
        TEST_CATALOG,
      )!;
      expect(computed.cycle).toBe(BillingCycle.SEMI_MONTHLY);
      expect(computed.amounts).toEqual([
        {day: 1, amount: 181},
        {day: 15, amount: 181},
      ]);
    });

    it('treats the legacy biweekly value as semi-monthly', () => {
      const computed = currentPeriodAmounts(
        contact({billing_cycle: 'biweekly' as BillingCycle}), [enrolled()], 2026, 7,
        TEST_CATALOG,
      )!;
      expect(computed.cycle).toBe(BillingCycle.SEMI_MONTHLY);
      expect(computed.amounts).toHaveLength(2);
    });

    it('applies the sibling discount across 3+ enrolled students', () => {
      const kids = [enrolled(), enrolled({id: 's-2'}), enrolled({id: 's-3'})];
      const computed = currentPeriodAmounts(contact({sibling_discount: 10}), kids, 2026, 7, TEST_CATALOG)!;
      // 3 × 362 = 1086, minus 10% = 977.4
      expect(computed.amounts).toEqual([{day: 1, amount: 977.4}]);
    });
  });

  describe('recomputedBillingRecords', () => {
    const computed = {cycle: BillingCycle.MONTHLY, amounts: [{day: 1, amount: 362}]};

    it('adjusts only periods that already have a record, keeping paid state', () => {
      const existing: BillingRecord[] = [{
        contact_id: 'c-1', period_start: '2026-08-01', cycle: BillingCycle.MONTHLY,
        amount: 999, paid: true, paid_date: 'd1', invoice_number: 'inv-9',
      }];
      const records = recomputedBillingRecords(existing, 'c-1', computed, 2026, 7);
      expect(records).toEqual([{
        contact_id: 'c-1', period_start: '2026-08-01', cycle: BillingCycle.MONTHLY,
        amount: 362, paid: true, paid_date: 'd1', invoice_number: 'inv-9',
      }]);
    });

    it('creates nothing where no record exists', () => {
      expect(recomputedBillingRecords([], 'c-1', computed, 2026, 7)).toEqual([]);
    });

    it('handles both semi-monthly halves independently', () => {
      const semi = {
        cycle: BillingCycle.SEMI_MONTHLY,
        amounts: [{day: 1, amount: 181}, {day: 15, amount: 181}],
      };
      const existing: BillingRecord[] = [{
        contact_id: 'c-1', period_start: '2026-08-15', cycle: BillingCycle.SEMI_MONTHLY,
        amount: 500, paid: false,
      }];
      const records = recomputedBillingRecords(existing, 'c-1', semi, 2026, 7);
      // Only the 15th had a record — the 1st is skipped, not created.
      expect(records.map(r => r.period_start)).toEqual(['2026-08-15']);
      expect(records[0].amount).toBe(181);
    });
  });
});

describe('currentPeriodAmounts — BTC & Me fee', () => {
  it('adds the flat fee to the day-1 amount for monthly billing', () => {
    const computed = currentPeriodAmounts(
      contact(), [enrolled({btc_and_me: true})], 2026, 7, TEST_CATALOG)!;
    expect(computed.amounts).toEqual([{day: 1, amount: 437}]); // 362 + 75
  });

  it('bills a group-only family (no packaged student)', () => {
    const computed = currentPeriodAmounts(
      contact(),
      [enrolled({package: undefined, schedule: undefined, btc_and_me: true})],
      2026, 7, TEST_CATALOG)!;
    expect(computed).not.toBeNull();
    expect(computed.amounts).toEqual([{day: 1, amount: 75}]);
  });

  it('lands the whole fee on the 1st for semi-monthly billing', () => {
    const computed = currentPeriodAmounts(
      contact({billing_cycle: BillingCycle.SEMI_MONTHLY}),
      [enrolled({btc_and_me: true})],
      2026, 7, TEST_CATALOG)!;
    expect(computed.amounts).toEqual([
      {day: 1, amount: 256}, // 181 + 75
      {day: 15, amount: 181},
    ]);
  });

  it('never sibling-discounts the fee and keys the threshold to packaged students', () => {
    const computed = currentPeriodAmounts(
      contact({sibling_discount: 10}),
      [
        enrolled({id: 's-1', btc_and_me: true}),
        enrolled({id: 's-2'}),
        enrolled({id: 's-3'}),
        // Group-only sibling: must NOT push the packaged count past the
        // threshold on its own (3 packaged students already qualify).
        enrolled({id: 's-4', package: undefined, schedule: undefined, btc_and_me: true}),
      ],
      2026, 7, TEST_CATALOG)!;
    // Packages: 3 × 362 = 1086, less 10% = 977.40; fees: 2 × 75 after discount.
    expect(computed.amounts).toEqual([{day: 1, amount: 1127.4}]);
  });

  it('a group-only sibling does not trigger the sibling discount', () => {
    const computed = currentPeriodAmounts(
      contact({sibling_discount: 10}),
      [
        enrolled({id: 's-1'}),
        enrolled({id: 's-2'}),
        enrolled({id: 's-3', package: undefined, schedule: undefined, btc_and_me: true}),
      ],
      2026, 7, TEST_CATALOG)!;
    // Only 2 packaged students -> no discount; 724 + 75.
    expect(computed.amounts).toEqual([{day: 1, amount: 799}]);
  });
});
