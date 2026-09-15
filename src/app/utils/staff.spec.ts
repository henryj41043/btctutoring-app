import {isCurrentAdmin, isCurrentStaff} from './staff';
import {Contact} from '../models/contact.model';
import {Service} from '../enums/service.enum';
import {StaffStatus} from '../enums/staff-status.enum';
import {UserGroup} from '../enums/user-group.enum';

describe('staff utils', () => {
  const staff = (over: Partial<Contact> = {}): Contact =>
    ({service: Service.HIRING, status: StaffStatus.ACTIVE_STAFF, user_group: UserGroup.ADMINS, ...over}) as Contact;

  it('isCurrentStaff requires Hiring + Staff', () => {
    expect(isCurrentStaff(staff())).toBe(true);
    expect(isCurrentStaff(staff({status: StaffStatus.FORMER_STAFF}))).toBe(false);
    expect(isCurrentStaff(staff({service: Service.EMPLOYMENT_INQUIRY}))).toBe(false);
    expect(isCurrentStaff({} as Contact)).toBe(false);
  });

  it('isCurrentAdmin additionally requires the Admins group', () => {
    expect(isCurrentAdmin(staff())).toBe(true);
    expect(isCurrentAdmin(staff({user_group: UserGroup.TUTORS}))).toBe(false);
    expect(isCurrentAdmin(staff({status: StaffStatus.FORMER_STAFF}))).toBe(false);
    expect(isCurrentAdmin({user_group: UserGroup.ADMINS} as Contact)).toBe(false);
  });
});
