export enum BillingCycle {
  MONTHLY = 'monthly',
  // 1st & 15th of each month. NOTE: any existing contact records stored with the
  // legacy 'biweekly' value need a one-time update to 'semi_monthly'.
  SEMI_MONTHLY = 'semi_monthly',
  CUSTOM = 'custom',
}
