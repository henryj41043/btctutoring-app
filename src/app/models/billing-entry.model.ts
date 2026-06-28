/** A derived row on the Billing page: one contact's charges for the selected month. */
export class BillingEntry {
  contact_id?: string;
  name?: string;
  /** Summary of the contact's students and packages, e.g. "Pat: Succeed; Sam: Thrive". */
  packages?: string;
  cycle?: string; // 'monthly' | 'semi_monthly'
  due_first?: number;
  due_fifteenth?: number | null; // null for monthly contacts
  total?: number;
  paid_first?: boolean;
  paid_fifteenth?: boolean;
  /** True when a student can't be priced confidently (unconfigured/missing schedule). */
  needs_attention?: boolean;
}
