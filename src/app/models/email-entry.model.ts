/**
 * One parsed inbound email (Email-to-Contact pipeline). Written by the
 * backend's parser; the app only reads and moderates (assign/discard).
 */
export interface EmailEntry {
  id?: string;
  /** matched = filed on a contact; unmatched = awaiting admin review. */
  status?: 'matched' | 'unmatched' | 'discarded';
  contact_id?: string;
  /** The ORIGINAL (parent) sender parsed out of the forward. */
  from_email?: string;
  from_name?: string;
  subject?: string;
  /** When the parent sent the original (ISO); absent when unparseable. */
  sent_at?: string;
  /** When the pipeline received the forward (ISO). */
  received_at?: string;
  /** Quoted-history-stripped newest message only. */
  body_text?: string;
  s3_key?: string;
  /** The admin inbox that forwarded it into the pipeline. */
  forwarded_by?: string;
  match_method?: 'rfc822' | 'inline' | 'none';
  assigned_by?: string;
  assigned_at?: string;
  created_at?: string;
}
