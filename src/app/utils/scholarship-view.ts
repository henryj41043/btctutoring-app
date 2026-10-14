import {formatDate} from '@angular/common';
import {ScholarshipRecord} from '../models/scholarship-record.model';

type DateValue = Date | string | number | null | undefined;

/** '9/3/2026' for a stored date, '' when there is none or it cannot be read. */
export function scholarshipDate(value: DateValue): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? '' : formatDate(date, 'M/d/yyyy', 'en-US');
}

/** 'N/A' when marked so, else the formatted date, else ''. */
export function requestedDateText(value: DateValue, notApplicable: boolean | undefined): string {
  return notApplicable ? 'N/A' : scholarshipDate(value);
}

/** One line for exports: 'Scholarship: PA · Invoice INV-7 · Paid 9/3/2026'. */
export function scholarshipSummary(record: ScholarshipRecord): string {
  const parts: string[] = [];
  if (record.scholarship_state) {
    parts.push(record.scholarship_state);
  }
  if (record.invoice_number) {
    parts.push(`Invoice ${record.invoice_number}`);
  }
  const requestedByBtc = requestedDateText(record.date_funds_requested_by_btc, record.funds_requested_by_btc_na);
  if (requestedByBtc) {
    parts.push(`Requested by BTC ${requestedByBtc}`);
  }
  const requestedByFamily = requestedDateText(record.date_funds_requested_by_family, record.funds_requested_by_family_na);
  if (requestedByFamily) {
    parts.push(`Requested by family ${requestedByFamily}`);
  }
  const paid = scholarshipDate(record.invoice_paid_date);
  if (paid) {
    parts.push(`Paid ${paid}`);
  }
  return parts.length ? `Scholarship: ${parts.join(' · ')}` : 'Scholarship';
}
