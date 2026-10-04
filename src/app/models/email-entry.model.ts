/**
 * One parsed inbound email (Email-to-Contact pipeline). Written by the
 * backend's parser; the app only reads and moderates (assign/discard).
 */
export interface EmailEntry {
  id?: string;
  /** matched = filed on a contact; unmatched = awaiting admin review. */
  status?: 'matched' | 'unmatched' | 'discarded' | 'rejected';
  /**
   * Set with status 'rejected': the forward did not come from a known sender,
   * could not be verified as really sent by them, or was flagged by the mail
   * scan. An admin can still assign or discard it.
   */
  rejected_reason?: 'unknown_sender' | 'unverified' | 'spam' | 'virus';
  contact_id?: string;
  /** The ORIGINAL (parent) sender parsed out of the forward. */
  from_email?: string;
  from_name?: string;
  subject?: string;
  /** When the parent sent the original (ISO); absent when unparseable. */
  sent_at?: string;
  /** When the pipeline received the forward (ISO). */
  received_at?: string;
  /**
   * A single email: the newest message with the quoted history stripped.
   * A conversation: every message, oldest first, under sender/date lines.
   */
  body_text?: string;
  s3_key?: string;
  /** The admin inbox that forwarded it into the pipeline. */
  forwarded_by?: string;
  match_method?: 'rfc822' | 'inline' | 'none';
  assigned_by?: string;
  assigned_at?: string;
  created_at?: string;
  /** True when the forward held a conversation (more than one message). */
  is_thread?: boolean;
  message_count?: number;
  /** Everyone found in the conversation's From/To/Cc lines. */
  participants?: EmailParticipant[];
}

export interface EmailParticipant {
  email: string;
  name?: string;
}
