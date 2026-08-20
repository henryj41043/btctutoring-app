import {Session} from '../models/session.model';

export interface SessionDialogData {
  type: string;
  session: Session;
  /**
   * The sessions currently loaded by the opener (calendar/table). Used to
   * validate a student's total PENDING minutes against their balance so the
   * sum across all of a student's sessions never exceeds available/make-up.
   */
  existingSessions?: Session[];
  /**
   * Tutor self-service create: the dialog is pinned to a MAKE_UP session
   * assigned to the logged-in tutor (type + tutor selects locked). Mirrors
   * the backend rule — non-admins may only create their own make-ups.
   */
  lockToMakeup?: boolean;
}
