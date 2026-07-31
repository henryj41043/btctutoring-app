/**
 * Staff (Hiring-contact) statuses. Forked from the old ContactStatus enum in
 * the v3 status split. ACTIVE_STAFF keeps the stored string 'Staff' — backend
 * scans filter on it and every staff record carries it — and is rendered as
 * "Active Staff" via STAFF_STATUS_LABELS instead of migrating data.
 */
export enum StaffStatus {
  ACTIVE_STAFF = 'Staff',
  FORMER_STAFF = 'Former Staff',
  ONBOARDING = 'Onboarding',
  MIA = 'MIA',
}

/** Display labels — only the legacy 'Staff' string needs prettifying. */
export const STAFF_STATUS_LABELS: Record<string, string> = {
  [StaffStatus.ACTIVE_STAFF]: 'Active Staff',
};

/** The label for a stored staff status (fallback: the raw value). */
export function staffStatusLabel(status?: string): string {
  return (status && STAFF_STATUS_LABELS[status]) || status || '';
}
