import {ContactDocument, ScanStatus} from '../models/contact-document.model';

/** How often the list is re-read while a scan is running, and for how long. */
export const SCAN_POLL_MS = 4000;
export const SCAN_POLL_MAX = 45;

/** What to say on a document's row about its malware scan; null when clean. */
export function scanNote(status: ScanStatus | undefined): string | null {
  switch (status) {
    case 'scanning':
      return 'Checking for malware…';
    case 'infected':
      return 'Blocked: the malware scan found a threat';
    case 'unscanned':
      return 'Could not be checked for malware. Delete it and upload it again.';
    default:
      return null;
  }
}

/** Only a clean document opens. One stored before scanning has no status. */
export function canOpen(status: ScanStatus | undefined): boolean {
  return status === undefined || status === 'clean';
}

export function anyScanning(documents: ContactDocument[]): boolean {
  return documents.some(document => document.scan_status === 'scanning');
}
