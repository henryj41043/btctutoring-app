import {Statement} from './statement.model';

/** A derived row on the Billing page: one contact's charges for the selected month. */
export class BillingEntry {
  contact_id?: string;
  name?: string;
  /** Summary of the contact's students and packages, e.g. "Pat: Succeed; Sam: Thrive". */
  packages?: string;
  cycle?: string; // 'monthly' | 'semi_monthly'
  /** Effective amounts (the override when one is set, else the derived amount). */
  due_first?: number | null; // null when no charge falls on the 1st (blank half of a prorated month)
  due_fifteenth?: number | null; // null for monthly contacts or a blank 15th half
  /** The package-derived amounts, kept for the override dialog / tooltips. */
  derived_first?: number | null;
  derived_fifteenth?: number | null;
  /** Admin overrides stored on the period records (0 = no charge); null = none. */
  override_first?: number | null;
  override_fifteenth?: number | null;
  total?: number;
  /** Dollars taken off by the student and sibling discounts together (0 when none). */
  discount?: number;
  /** The sibling-discount percent, shown only when it is the sole discount (else 0). */
  discount_percent?: number;
  /** Labels for what makes this month unusual, e.g. 'Prorated start'. */
  labels?: string[];
  /** The service-calculated statement behind the row (the expandable breakdown). */
  statement?: Statement;
  paid_first?: boolean;
  paid_fifteenth?: boolean;
  /** True when a student can't be priced confidently (unconfigured/missing schedule). */
  needs_attention?: boolean;
}
