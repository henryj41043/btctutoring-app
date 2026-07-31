/**
 * Parent (Tutoring-contact) statuses — the family-level lifecycle, distinct
 * from staff and student statuses in the v3 split. Deactivating values
 * cascade onto the family's students (see utils/parent-status-cascade.ts);
 * ACTIVE_CLIENT deliberately cascades nothing — reactivating students is a
 * manual, per-student decision.
 */
export enum ParentStatus {
  ACTIVE_CLIENT = 'Active Client',
  FORMER_CLIENT = 'Former Client',
  MIA = 'MIA',
  DECLINED_SERVICES = 'Declined Services',
}
