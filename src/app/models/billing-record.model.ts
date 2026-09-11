/** A persisted billing payment record for one contact and one billing period. */
export class BillingRecord {
  id?: string;
  contact_id?: string;
  period_start?: string; // 'YYYY-MM-DD'
  cycle?: string; // 'monthly' | 'semi_monthly'
  amount?: number;
  paid?: boolean;
  paid_date?: string;
  invoice_number?: string;
  /** Admin override of the derived amount for this period (0 = no charge); absent/null = derived. */
  amount_override?: number | null;
}

/** PUT /billing/override payload: a non-negative number sets, null clears. */
export interface AmountOverrideRequest {
  contact_id: string;
  period_start: string;
  cycle: string;
  amount_override: number | null;
}
