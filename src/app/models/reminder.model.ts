export class Reminder {
  id?: string;
  title?: string;
  message?: string;
  /** The reminder's Eastern wall date, 'YYYY-MM-DD'. Emailed the morning of. */
  date?: string;
  /** When true the digest goes to every admin; recipient_ids is ignored. */
  all_admins?: boolean;
  /** Individual admin recipients (contact ids) when all_admins is false. */
  recipient_ids?: string[];
  /** Optional linked contact the reminder is about (jump-off in the UI). */
  contact_id?: string;
  /** Set by the backend cron once the morning-of email has fired. */
  sent_at?: string;
  created_by?: string;
  /** Calendar meta discriminator — stamped client-side, never persisted. */
  entry_type?: 'reminder';
}
