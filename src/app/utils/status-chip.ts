import {StudentStatus} from '../enums/student-status.enum';
import {StaffStatus} from '../enums/staff-status.enum';
import {ParentStatus} from '../enums/parent-status.enum';

/**
 * btc-chip modifier for a student status, following the sessions-table
 * palette: Active=ok(green), Onboarding=warn(amber), Past=info(blue),
 * MIA=bad(red). Unknown/absent statuses keep the neutral base chip.
 */
export function studentStatusChipClass(status?: string): string {
  switch (status) {
    case StudentStatus.ACTIVE_STUDENT:
      return 'btc-chip--ok';
    case StudentStatus.ONBOARDING:
      return 'btc-chip--warn';
    case StudentStatus.PAST_STUDENT:
      return 'btc-chip--info';
    case StudentStatus.MIA:
      return 'btc-chip--bad';
    // Operationally identical to MIA; the label carries the distinction.
    case StudentStatus.DECLINED_SERVICES:
      return 'btc-chip--bad';
    default:
      return '';
  }
}

/**
 * btc-chip modifier for a CONTACT status (parent or staff vocabulary — the
 * two overlap, so one string-keyed mapper serves both): actives=ok(green),
 * Onboarding=warn(amber), formers=info(blue), MIA/Declined=bad(red).
 */
export function contactStatusChipClass(status?: string): string {
  switch (status) {
    case StaffStatus.ACTIVE_STAFF:
    case ParentStatus.ACTIVE_CLIENT:
      return 'btc-chip--ok';
    case StaffStatus.ONBOARDING:
      return 'btc-chip--warn';
    case StaffStatus.FORMER_STAFF:
    case ParentStatus.FORMER_CLIENT:
      return 'btc-chip--info';
    case ParentStatus.MIA:
    case ParentStatus.DECLINED_SERVICES:
      return 'btc-chip--bad';
    default:
      return '';
  }
}
