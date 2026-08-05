export class PayrollEntry {
  name?: string;
  tutoring_hours?: number;
  /** Completed/NCNS trials in the period — each pays a flat 1.0h at pay_rate. */
  trial_hours?: number;
  administrative_time?: number;
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
