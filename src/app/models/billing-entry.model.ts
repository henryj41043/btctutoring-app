import {Statement} from './statement.model';
import {ScholarshipRecord} from './scholarship-record.model';

/** One amount a family owes in the month: the 1st, the 15th, or a weekly date. */
export interface EntryDue {
  /** 'YYYY-MM-DD': the billing record key for this amount. */
  period_start: string;
  /** '1st' / '15th' for monthly and semi-monthly families; 'Oct 9' for weekly dues. */
  label: string;
  /** The package-derived amount; null when nothing is derived (a blank half). */
  derived: number | null;
  /** The admin override stored on the period record (0 = no charge); null = none. */
  override: number | null;
  /** The effective amount: the override when one is set, else the derived amount. */
  amount: number | null;
  paid: boolean;
}

/** A derived row on the Billing page: one contact's charges for the selected month. */
export class BillingEntry {
  contact_id?: string;
  name?: string;
  /** Summary of the contact's students and packages, e.g. "Pat: Succeed; Sam: Thrive". */
  packages?: string;
  cycle?: string; // 'monthly' | 'semi_monthly' | 'weekly'
  /** The month's dues in date order: one for monthly, two for semi-monthly, one per week for weekly. */
  dues?: EntryDue[];
  total?: number;
  /** Dollars taken off by the student and sibling discounts together (0 when none). */
  discount?: number;
  /** The sibling-discount percent, shown only when it is the sole discount (else 0). */
  discount_percent?: number;
  /** Labels for what makes this month unusual, e.g. 'Prorated start'. */
  labels?: string[];
  /** The service-calculated statement behind the row (the expandable breakdown). */
  statement?: Statement;
  /** True when a student can't be priced confidently (unconfigured/missing schedule). */
  needs_attention?: boolean;
  /**
   * The family's scholarship record for this month, when there is one. Shown
   * as a marker only: it never changes an amount and is not part of the statement.
   */
  scholarship?: ScholarshipRecord;
}
