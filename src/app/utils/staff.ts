import {Contact} from '../models/contact.model';
import {Service} from '../enums/service.enum';
import {StaffStatus} from '../enums/staff-status.enum';
import {UserGroup} from '../enums/user-group.enum';

/** Current staff: service Hiring and status Staff (the team-picker rule). */
export function isCurrentStaff(contact: Contact): boolean {
  return contact.service === Service.HIRING && contact.status === StaffStatus.ACTIVE_STAFF;
}

/**
 * A CURRENT admin: in the Admins group AND current staff. The group alone is
 * not enough — former staff and employment inquiries can still carry it
 * (client 2026-09-14: non-employees appeared as reminder recipients). Mirrors
 * the service-side isCurrentAdmin used for admin emails.
 */
export function isCurrentAdmin(contact: Contact): boolean {
  return contact.user_group === UserGroup.ADMINS && isCurrentStaff(contact);
}
