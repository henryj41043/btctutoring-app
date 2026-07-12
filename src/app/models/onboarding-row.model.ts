/**
 * A denormalized Onboarding-page row: one student in `Onboarding` status merged
 * with its family's (contact's) name and onboarding dates. Served by
 * GET /students/onboarding so the table renders from one small payload.
 * Date fields arrive as ISO strings over HTTP.
 */
export interface OnboardingRow {
  id?: string;
  contact_id: string;
  name: string;
  status: string;
  onboarding_complete: boolean;
  contact_name: string;
  inquiry_received?: string;
  inquiry_note_from_parent?: string;
  consult_date?: string;
  trial_date?: string;
  registration_sent?: string;
  registration_received?: string;
  scholarship_name?: string;
  scholarship_student?: boolean;
  twenty_five_received?: boolean;
}
