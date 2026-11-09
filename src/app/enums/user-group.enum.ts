export enum UserGroup {
  ADMINS = 'Admins',
  TUTORS = 'Tutors',
  /** Tutors with read-only visibility into their team's sessions. */
  LEAD_TUTORS = 'LeadTutors',
  /**
   * The Head Tutor (client 2026-11-09): a Lead Tutor who also sees the whole
   * organization's Student Roster and every current family's contact
   * details for parent check-ins. Never billing or admin notes.
   */
  HEAD_TUTORS = 'HeadTutors',
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
  [UserGroup.HEAD_TUTORS]: 'Head Tutor',
  [UserGroup.SUPPORT_STAFF]: 'Support Staff',
};
