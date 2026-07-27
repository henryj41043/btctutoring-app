import {StudentStatus} from '../enums/student-status.enum';

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
    default:
      return '';
  }
}
