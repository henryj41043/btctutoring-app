import {anyScanning, canOpen, SCAN_POLL_MAX, SCAN_POLL_MS, scanNote} from './document-scan';

describe('document-scan', () => {
  it('re-reads every four seconds for three minutes', () => {
    expect(SCAN_POLL_MS).toBe(4000);
    expect(SCAN_POLL_MAX).toBe(45);
  });

  it('describes each scan state', () => {
    expect(scanNote('scanning')).toBe('Checking for malware…');
    expect(scanNote('infected')).toBe('Blocked: the malware scan found a threat');
    expect(scanNote('unscanned')).toBe('Could not be checked for malware. Delete it and upload it again.');
    expect(scanNote('clean')).toBeNull();
    expect(scanNote(undefined)).toBeNull();
  });

  it('opens only clean documents and ones stored before scanning', () => {
    expect(canOpen(undefined)).toBe(true);
    expect(canOpen('clean')).toBe(true);
    expect(canOpen('scanning')).toBe(false);
    expect(canOpen('infected')).toBe(false);
    expect(canOpen('unscanned')).toBe(false);
  });

  it('knows when a scan is still running', () => {
    expect(anyScanning([])).toBe(false);
    expect(anyScanning([{scan_status: 'clean'}, {}])).toBe(false);
    expect(anyScanning([{scan_status: 'clean'}, {scan_status: 'scanning'}])).toBe(true);
  });
});
