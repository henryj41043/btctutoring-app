import {Package} from '../enums/package.enum';
import {Status} from '../enums/status.enum';
import {ScheduleSlot} from '../utils/proration';

/** A dated lot of remaining make-up minutes; expires 90 days after earned_date. */
export interface MakeupBatch {
  minutes: number;
  earned_date: string; // ISO
}

export class Student {
  id?: string;
  contact_id?: string;
  name?: string;
  birthday?: string;
  status?: Status;
  /** True once the student has finished onboarding; gates status/package/tutor/schedule edits. */
  onboarding_complete?: boolean;
  assigned_tutor_id?: string;
  package?: Package;
  scholarship?: boolean;
  /** Weekly recurring tutoring slots; the template auto-renew repeats each month. */
  schedule?: ScheduleSlot[];
  /** ISO date the student's package began; drives first-month proration. */
  package_start_date?: string;
  /** When true, next month's sessions + billing are generated automatically. */
  auto_renew?: boolean;
  /** Per-student package values for the CUSTOM package only. */
  custom_monthly_cost?: number;
  custom_sessions_per_week?: number;
  custom_session_length_min?: number;
  make_up_minutes?: number;
  /** Dated lots of remaining make-up minutes; each expires 90 days after earned_date. */
  make_up_batches?: MakeupBatch[];
  /** When true, make-up minutes never expire. */
  make_up_never_expire?: boolean;
  /** Old package's prorated portion for a mid-month package-change month. */
  mid_month_prior_charge?: number;
  /** The 'YYYY-MM' the mid_month_prior_charge applies to (that month only). */
  mid_month_change_period?: string;
  /** @deprecated Replaced by package-driven scheduling; no longer read or written. */
  available_minutes?: number;
  /** Family display name — present only on `?include=contact_name` listings (read-only). */
  contact_name?: string;
}
