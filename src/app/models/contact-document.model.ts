/** Where a document stands with the malware scan. */
export type ScanStatus = 'scanning' | 'clean' | 'infected' | 'unscanned';

/** One file an admin uploaded to a contact (a resume, a signed form). */
export interface ContactDocument {
  id?: string;
  contact_id?: string;
  file_name?: string;
  content_type?: string;
  /** Bytes. */
  size?: number;
  status?: 'pending' | 'ready';
  /** Absent on documents stored before scanning existed; those still open. */
  scan_status?: ScanStatus;
  uploaded_by?: string;
  uploaded_at?: string;
}

/** A one-time link the browser sends the file to. */
export interface UploadLink {
  id: string;
  url: string;
  /** Headers that must go with the upload (they are part of the link's signature). */
  headers: Record<string, string>;
}

export type DocumentUrlMode = 'view' | 'download';

/** Progress of one upload: a percentage while sending, the document when done. */
export interface UploadProgress {
  percent: number;
  document?: ContactDocument;
}
