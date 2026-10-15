import {Weekday, WEEKDAY_BY_JS_DAY} from './weekday.enum';

export enum BillingCycle {
  MONTHLY = 'monthly',
  // 1st & 15th of each month. NOTE: any existing contact records stored with the
  // legacy 'biweekly' value need a one-time update to 'semi_monthly'.
  SEMI_MONTHLY = 'semi_monthly',
  // Once a week on the family's chosen weekday (replaced 'custom', 2026-10-14).
  WEEKLY = 'weekly',
}

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  [BillingCycle.MONTHLY]: 'Monthly',
  [BillingCycle.SEMI_MONTHLY]: 'Semi-monthly',
  [BillingCycle.WEEKLY]: 'Weekly',
};

/** The weekdays a weekly family can be billed on, Sunday first (the billing week's order). */
export const BILLING_WEEKDAYS: {value: Weekday; label: string}[] = WEEKDAY_BY_JS_DAY.map(day => ({
  value: day,
  label: day.charAt(0) + day.slice(1).toLowerCase(),
}));
