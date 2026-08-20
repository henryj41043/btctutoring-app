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
  /** Optional 'due by' wall date 'YYYY-MM-DD' (display-only). */
  due_date?: string;
  /** Absent = one-time. Recurring reminders roll forward after each send. */
  recurrence?: 'weekly' | 'monthly';
  /** ISO completion stamp — one-time reminders only. */
  completed_at?: string;
  /**
   * Contact ids of admins who have acted on this reminder — a partial-progress
   * log orthogonal to completed_at. Each admin toggles only their own ack;
   * recurring reminders clear acks when they advance to the next occurrence.
   */
  acked_by?: string[];
  /** Free-text note shown only on the Reminders page. */
  note?: string;
  /** Calendar meta discriminator — stamped client-side, never persisted. */
  entry_type?: 'reminder';
}
