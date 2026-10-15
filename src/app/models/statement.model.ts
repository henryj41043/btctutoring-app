/**
 * Billing v2 statement: what one family owes in a month, calculated by the
 * service (GET /billing/statements). The app only displays it.
 */
export type LineFlag =
  | 'prorated_start'
  | 'prorated_end'
  | 'package_change'
  | 'price_override'
  | 'discount'
  | 'unpriced'
  /** Statement-level: every line is $0 (a ghost package), nothing is owed. */
  | 'no_charge';

export interface StatementLine {
  student_id?: string;
  student_name: string;
  /** 'package' = a service segment; 'prior_package' = a legacy mid-month change portion. */
  kind: 'package' | 'prior_package';
  package: string;
  /** 'YYYY-MM-DD' first and last billed day inside the month. */
  from: string;
  to: string;
  sessions_billed: number;
  sessions_in_month: number;
  rate: number;
  monthly_price: number;
  /** The charge before the student discount. */
  amount: number;
  discount_percent: number;
  discount_amount: number;
  /** The charge after the student discount. */
  net: number;
  flags: LineFlag[];
  /** Weekly families: the line's charge per Sunday–Saturday week. */
  weeks?: {week_start: string; sessions: number; amount: number}[];
}

export interface StatementDue {
  day: number;
  period_start: string;
  derived: number;
  override: number | null;
  amount: number;
  paid: boolean;
  paid_date?: string;
  invoice_number?: string;
}

export interface Statement {
  contact_id: string;
  contact_name: string;
  /** 'YYYY-MM' */
  month: string;
  cycle: 'monthly' | 'semi_monthly' | 'weekly';
  lines: StatementLine[];
  package_gross: number;
  package_subtotal: number;
  sibling_discount_percent: number;
  sibling_discount_amount: number;
  group_fee: number;
  group_students: string[];
  total: number;
  dues: StatementDue[];
  total_due: number;
  flags: LineFlag[];
  needs_attention: boolean;
  /** Set once the month has closed: the statement no longer recalculates. */
  frozen_at?: string;
  /** A month from before Billing v2: totals from the billing records, no line detail. */
  legacy?: boolean;
}
