import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {ScholarshipService} from './scholarship.service';
import {environment} from '../../environments/environment';

describe('ScholarshipService', () => {
  let service: ScholarshipService;
  let httpMock: HttpTestingController;
  const base = environment.btctutoringServiceUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ScholarshipService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches a month of records', () => {
    service.getScholarshipRecordsByMonth('2026-08').subscribe();
    const req = httpMock.expectOne(`${base}/scholarships?month=2026-08`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('fetches a contact history', () => {
    service.getScholarshipRecordsByContact('c-1').subscribe();
    const req = httpMock.expectOne(`${base}/scholarships?contact=c-1`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('upserts a record', () => {
    const record = {contact_id: 'c-1', month: '2026-08', invoice_number: 'INV-9'};
    service.upsertScholarshipRecord(record).subscribe();
    const req = httpMock.expectOne(`${base}/scholarships`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(record);
    req.flush({id: 'c-1#2026-08', message: 'ok'});
  });
});
