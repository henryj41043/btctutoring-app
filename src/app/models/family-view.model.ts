/**
 * The read-only family page a tutor opens from their roster (client
 * 2026-11-09): GET /family/:id. The service builds it from a whitelist, so
 * it never carries billing, scholarship, notes or payment data.
 */
export interface FamilySlot {
  weekday: string;
  start_time: string;
  end_time: string;
  /** Present when the slot is taught by someone other than the primary tutor. */
  tutor_id?: string;
  tutor_name?: string;
}

export interface FamilyStudent {
  id: string;
  name: string;
  status: string;
  package: string;
  assigned_tutor_id?: string;
  tutor_name?: string;
  schedule: FamilySlot[];
  /** Make-up minutes usable today (expired lots excluded). */
  make_up_available: number;
  /** Make-up minutes booked on the calendar but not yet held. */
  make_up_pending: number;
  make_up_never_expire: boolean;
}

export interface FamilyView {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  /** Only the students the viewer may see (own, team, or all for admins). */
  students: FamilyStudent[];
}
