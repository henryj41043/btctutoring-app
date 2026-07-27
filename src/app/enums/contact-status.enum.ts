/**
 * Contact statuses (currently only meaningful for Hiring/staff contacts —
 * family-level status is a deferred follow-up). Split from the old shared
 * Status enum; string values unchanged — no data migration.
 */
export enum ContactStatus {
  STAFF = 'Staff',
  FORMER_STAFF = 'Former Staff',
  MIA = 'MIA',
}
