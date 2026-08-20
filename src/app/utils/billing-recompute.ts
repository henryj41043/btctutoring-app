import {Contact} from '../models/contact.model';
import {Student} from '../models/student.model';
import {BillingRecord} from '../models/billing-record.model';
import {BillingCycle} from '../enums/billing-cycle.enum';
import {siblingDiscountedTotal, studentMonthlyCharge, studentSemiMonthlyCharge} from './billing-amount';
import {round2} from './package-config';

export interface PeriodAmounts {
  cycle: BillingCycle;
  amounts: {day: number; amount: number}[];
}

/**
 * The recomputed (Option A) charge per due day for the given month, across
 * the family's enrolled students, with the sibling discount applied. Returns
 * null when no student is enrolled (nothing to bill).
 */
export function currentPeriodAmounts(
  contact: Contact,
  enrolled: Student[],
  year: number,
  month: number,
): PeriodAmounts | null {
  if (enrolled.length === 0) {
    return null;
  }
  const semi =
    contact.billing_cycle === BillingCycle.SEMI_MONTHLY ||
    (contact.billing_cycle as string) === 'biweekly';
  const cycle = semi ? BillingCycle.SEMI_MONTHLY : BillingCycle.MONTHLY;
  const pct = contact.sibling_discount;
  const count = enrolled.length;

  const amounts: {day: number; amount: number}[] = [];
  if (semi) {
    let first = 0;
    let fifteenth = 0;
    for (const s of enrolled) {
      const charge = studentSemiMonthlyCharge(s, year, month);
      first += charge.first;
      fifteenth += charge.fifteenth;
    }
    amounts.push({day: 1, amount: siblingDiscountedTotal(round2(first), pct, count)});
    amounts.push({day: 15, amount: siblingDiscountedTotal(round2(fifteenth), pct, count)});
  } else {
    const total = round2(enrolled.reduce((sum, s) => sum + studentMonthlyCharge(s, year, month), 0));
    amounts.push({day: 1, amount: siblingDiscountedTotal(total, pct, count)});
  }
  return {cycle, amounts};
}

/**
 * The adjusted billing records for the periods that ALREADY have a generated
 * record — new periods are never created here (the Billing page derives those
 * live). Each adjustment keeps the prior record's paid state.
 */
export function recomputedBillingRecords(
  existing: BillingRecord[],
  contactId: string,
  computed: PeriodAmounts,
  year: number,
  month: number,
): BillingRecord[] {
  const m = (month + 1).toString().padStart(2, '0');
  const records: BillingRecord[] = [];
  for (const {day, amount} of computed.amounts) {
    const period = `${year}-${m}-${day.toString().padStart(2, '0')}`;
    const prior = existing.find(r => r.period_start === period);
    if (!prior) {
      continue; // only adjust records that already exist
    }
    records.push({
      contact_id: contactId,
      period_start: period,
      cycle: computed.cycle,
      amount,
      paid: prior.paid,
      paid_date: prior.paid_date,
      invoice_number: prior.invoice_number,
    });
  }
  return records;
}
