/**
 * Student lifecycle statuses. Split from the old shared Status enum so
 * students can't be marked "Staff" (and contacts can't be "Active Student").
 * String values are unchanged from the shared enum — no data migration.
 */
export enum StudentStatus {
  ONBOARDING = 'Onboarding',
  ACTIVE_STUDENT = 'Active Student',
  PAST_STUDENT = 'Past Student',
  /** The family stopped responding during onboarding — the lifecycle escape. */
  MIA = 'MIA',
  /** Family formally declined services — operationally identical to MIA. */
  DECLINED_SERVICES = 'Declined Services',
}
