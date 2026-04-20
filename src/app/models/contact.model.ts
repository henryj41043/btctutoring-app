import {Service} from '../enums/service.enum';
import {BillingCycle} from '../enums/billing-cycle.enum';

export class Contact {
  id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  service?: Service;
  monthly_charge?: number;
  charge_per_billing_cycle?: number;
  amount_to_be_paid_this_month?: number;
  billing_cycle?: BillingCycle;
  cc_authorization_received?: boolean;
  twenty_five_deducted?: boolean;
  payment_one_received?: boolean;
  payment_two_received?: boolean;
  payment_three_received?: boolean;
  payment_four_received?: boolean;
  special_circumstance?: string;
  scholarship_state?: string;
  invoice_Month?: string;
  date_funds_requested_by_btc?: string;
  date_funds_requested_by_family?: string;
  invoice_number?: string;
  invoice_paid_date?: string;
}
