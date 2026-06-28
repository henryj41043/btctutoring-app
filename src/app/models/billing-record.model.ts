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
}
