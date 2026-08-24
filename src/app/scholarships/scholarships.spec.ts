import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {Scholarships, ScholarshipRow} from './scholarships';
import {AuthService} from '../services/auth.service';
import {ContactService} from '../services/contact.service';
import {StudentService} from '../services/student.service';
import {ScholarshipService} from '../services/scholarship.service';
import {Contact} from '../models/contact.model';
import {Student} from '../models/student.model';
import {ScholarshipRecord} from '../models/scholarship-record.model';
import * as csv from '../utils/csv';

const contact = (over: Partial<Contact> = {}): Contact =>
  ({id: 'c-1', first_name: 'Casey', last_name: 'Lee', scholarship_name: 'Fund A', ...over}) as Contact;
const scholarshipStudent = (over: Partial<Student> = {}): Student =>
  ({id: 's-1', contact_id: 'c-1', scholarship: true, ...over}) as Student;
const record = (over: Partial<ScholarshipRecord> = {}): ScholarshipRecord => ({
  contact_id: 'c-1',
  month: '2026-08',
  scholarship_state: 'PA',
  invoice_number: 'INV-8',
  ...over,
});

describe('Scholarships', () => {
  let isAdmin: boolean;
  const contactService = {getContacts: jest.fn()};
  const studentService = {getStudents: jest.fn()};
  const scholarshipService = {getScholarshipRecordsByMonth: jest.fn()};
  const authService = {isAdmin: () => isAdmin};

  const build = (): Scholarships => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Scholarships],
      providers: [
        {provide: AuthService, useValue: authService},
        {provide: ContactService, useValue: contactService},
        {provide: StudentService, useValue: studentService},
        {provide: ScholarshipService, useValue: scholarshipService},
      ],
    });
    const c = TestBed.createComponent(Scholarships).componentInstance;
    c.selectedDate = new Date(2026, 7, 10); // August 2026
    return c;
  };

  const rows = (c: Scholarships): ScholarshipRow[] =>
    (c as unknown as {dataSource: {data: ScholarshipRow[]}}).dataSource.data;

  beforeEach(() => {
    sessionStorage.clear();
    isAdmin = true;
    jest.clearAllMocks();
    contactService.getContacts.mockReturnValue(of([contact()]));
    studentService.getStudents.mockReturnValue(of([scholarshipStudent()]));
    scholarshipService.getScholarshipRecordsByMonth.mockReturnValue(of([record()]));
  });

  it('fetches only the selected month of records', () => {
    const c = build();
    c.ngOnInit();
    expect(scholarshipService.getScholarshipRecordsByMonth).toHaveBeenCalledWith('2026-08');
  });

  it('restores the saved month from session state', () => {
    sessionStorage.setItem('btc-scholarships-view',
      JSON.stringify({extra: {selectedDate: new Date(2026, 2, 10).toISOString()}}));
    const c = build();
    c.ngOnInit();
    expect(scholarshipService.getScholarshipRecordsByMonth).toHaveBeenCalledWith('2026-03');
    c.onDateChange(new Date(2026, 4, 1));
    expect(JSON.parse(sessionStorage.getItem('btc-scholarships-view')!).extra.selectedDate)
      .toBe(new Date(2026, 4, 1).toISOString());
  });

  it('shows nothing for non-admins', () => {
    isAdmin = false;
    const c = build();
    c.ngOnInit();
    expect(rows(c)).toEqual([]);
    expect(contactService.getContacts).not.toHaveBeenCalled();
  });

  it('unions flagged families and record holders without duplicates', () => {
    contactService.getContacts.mockReturnValue(of([
      contact({id: 'c-1', first_name: 'Both'}),        // flagged + record
      contact({id: 'c-2', first_name: 'FlagOnly'}),    // flagged, no record
      contact({id: 'c-3', first_name: 'RecordOnly'}),  // record, no longer flagged
      contact({id: 'c-4', first_name: 'Neither'}),
    ]));
    studentService.getStudents.mockReturnValue(of([
      scholarshipStudent({contact_id: 'c-1'}),
      scholarshipStudent({id: 's-2', contact_id: 'c-2'}),
      scholarshipStudent({id: 's-3', contact_id: 'c-4', scholarship: false}),
    ]));
    scholarshipService.getScholarshipRecordsByMonth.mockReturnValue(of([
      record({contact_id: 'c-1'}),
      record({contact_id: 'c-3', invoice_number: 'INV-3'}),
    ]));
    const c = build();
    c.ngOnInit();
    expect(rows(c).map(r => r.contact.first_name)).toEqual(['Both', 'FlagOnly', 'RecordOnly']);
    expect(rows(c)[0].record?.invoice_number).toBe('INV-8');
    expect(rows(c)[1].record).toBeUndefined();
    expect(rows(c)[2].record?.invoice_number).toBe('INV-3');
  });

  it('paid means the month record carries an invoice-paid date', () => {
    const c = build();
    expect(c.isPaid({contact: contact(), record: record({invoice_paid_date: new Date()})})).toBe(true);
    expect(c.isPaid({contact: contact(), record: record()})).toBe(false);
    expect(c.isPaid({contact: contact()})).toBe(false);
  });

  it('family names fall back to the email when unnamed', () => {
    const c = build();
    expect(c.familyName({contact: contact()})).toBe('Casey Lee');
    expect(c.familyName({contact: contact({first_name: undefined, last_name: undefined, email: 'x@y.z'})}))
      .toBe('x@y.z');
  });

  it('renders an empty table when every source fails', () => {
    const boom = () => throwError(() => new Error('x'));
    contactService.getContacts.mockReturnValue(boom());
    studentService.getStudents.mockReturnValue(boom());
    scholarshipService.getScholarshipRecordsByMonth.mockReturnValue(boom());
    const c = build();
    c.ngOnInit();
    expect(rows(c)).toEqual([]);
    expect((c as unknown as {loading: boolean}).loading).toBe(false);
  });

  it('ignores a null date change', () => {
    const c = build();
    c.ngOnInit();
    scholarshipService.getScholarshipRecordsByMonth.mockClear();
    c.onDateChange(null);
    expect(scholarshipService.getScholarshipRecordsByMonth).not.toHaveBeenCalled();
  });

  it('exports the month as CSV with formatted dates', () => {
    const toCsvSpy = jest.spyOn(csv, 'toCsvString').mockReturnValue('CSV');
    const downloadSpy = jest.spyOn(csv, 'downloadCsv').mockImplementation(() => undefined);
    scholarshipService.getScholarshipRecordsByMonth.mockReturnValue(of([
      record({
        date_funds_requested_by_btc: new Date(2026, 7, 5),
        invoice_paid_date: new Date(2026, 7, 20),
      }),
    ]));
    const c = build();
    c.ngOnInit();
    c.exportCsv();
    expect(toCsvSpy).toHaveBeenCalledWith(
      ['Family', 'Scholarship Name', 'State', 'Funds Requested By BTC',
       'Funds Requested By Family', 'Invoice Number', 'Invoice Paid Date'],
      [['Casey Lee', 'Fund A', 'PA', '8/5/2026', '', 'INV-8', '8/20/2026']],
    );
    expect(downloadSpy).toHaveBeenCalledWith('scholarships-2026-08.csv', 'CSV');
    toCsvSpy.mockRestore();
    downloadSpy.mockRestore();
  });
});
