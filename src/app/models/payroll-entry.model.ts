export class PayrollEntry {
  name?: string;
  /** Staff hire classification: 'W2' | '1099' (from the contact). */
  hire_type?: string;
  tutoring_hours?: number;
  /** Completed/NCNS trials in the period — actual length at pay_rate; counts toward planning_time. */
  trial_hours?: number;
  /** Completed/NCNS BTC & Me group sessions — each pays a flat 1.0h at pay_rate. */
  group_hours?: number;
  administrative_time?: number;
  /** (tutoring_hours + trial_hours) / 6 — admin and BTC & Me hours earn none. */
  planning_time?: number;
  /** Extra planning hours from per-student extra_planning_minutes credits. */
  extra_planning_time?: number;
  hours_subtotal?: number;
  pay_rate?: number;
  planning_rate?: number;
  planning_compensation?: number;
  tutoring_compensation?: number;
  total_compensation?: number;
}
