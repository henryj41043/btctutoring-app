import {scholarshipDate, scholarshipSummary} from './scholarship-view';

describe('scholarship-view', () => {
  describe('scholarshipDate', () => {
    it('formats a Date, an ISO string and an epoch number', () => {
      const date = new Date(2026, 8, 3);
      expect(scholarshipDate(date)).toBe('9/3/2026');
      expect(scholarshipDate(date.toISOString())).toBe('9/3/2026');
      expect(scholarshipDate(date.getTime())).toBe('9/3/2026');
    });

    it.each([null, undefined, '', 'not a date'])('is empty for %p', value => {
      expect(scholarshipDate(value)).toBe('');
    });
  });

  describe('scholarshipSummary', () => {
    it('lists what is filled in, in a fixed order', () => {
      expect(scholarshipSummary({
        scholarship_state: 'PA',
        invoice_number: 'INV-7',
        date_funds_requested_by_btc: new Date(2026, 7, 1),
        date_funds_requested_by_family: new Date(2026, 7, 5),
        invoice_paid_date: new Date(2026, 8, 3),
      })).toBe('Scholarship: PA · Invoice INV-7 · Requested by BTC 8/1/2026 · Requested by family 8/5/2026 · Paid 9/3/2026');
    });

    it('leaves out what is missing', () => {
      expect(scholarshipSummary({invoice_number: 'INV-7'})).toBe('Scholarship: Invoice INV-7');
      expect(scholarshipSummary({scholarship_state: 'PA', invoice_paid_date: new Date(2026, 8, 3)}))
        .toBe('Scholarship: PA · Paid 9/3/2026');
    });

    it('is the bare word for an empty record', () => {
      expect(scholarshipSummary({})).toBe('Scholarship');
      expect(scholarshipSummary({scholarship_state: '', invoice_number: ''})).toBe('Scholarship');
    });
  });
});
