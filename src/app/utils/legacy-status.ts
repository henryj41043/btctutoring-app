import {ParentStatus} from '../enums/parent-status.enum';

/**
 * Pre-status-v3 contact statuses that can still appear on Tutoring (parent)
 * records — the shared enum era stored student-ish stages on the contact.
 * Mapped to their v3 ParentStatus equivalents ('Onboarding' families were
 * verified stale — MIA is v3's "went quiet during onboarding").
 *
 * Prod was swept 2026-08-12 (334 records); this read-time mapping is the
 * guard against any stragglers or future regressions, and self-heals on the
 * next save since the dropdown then holds a valid value.
 */
const LEGACY_PARENT_STATUS: Record<string, string> = {
  'Active Student': ParentStatus.ACTIVE_CLIENT,
  'Past Student': ParentStatus.FORMER_CLIENT,
  'Onboarding': ParentStatus.MIA,
};

export function normalizeParentStatus(status: string | undefined): string | undefined {
  if (!status) return status;
  return LEGACY_PARENT_STATUS[status] ?? status;
}
