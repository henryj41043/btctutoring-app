export enum UserGroup {
  ADMINS = 'Admins',
  TUTORS = 'Tutors',
  /** Tutors with read-only visibility into their team's sessions. */
  LEAD_TUTORS = 'LeadTutors',
  /**
   * Non-tutor employees who only log their own hours (client 2026-10-15):
   * their calendar holds nothing but their own Admin Time, and they see no
   * students, billing or other staff's payroll.
   */
  SUPPORT_STAFF = 'SupportStaff',
}

/** Display names for the group select on a staff contact. */
export const USER_GROUP_LABELS: Record<UserGroup, string> = {
  [UserGroup.ADMINS]: 'Admin',
  [UserGroup.TUTORS]: 'Tutor',
  [UserGroup.LEAD_TUTORS]: 'Lead Tutor',
  [UserGroup.SUPPORT_STAFF]: 'Support Staff',
};
