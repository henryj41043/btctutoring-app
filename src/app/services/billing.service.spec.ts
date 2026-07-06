import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { BillingService } from './billing.service';
import { BillingRecord } from '../models/billing-record.model';
import { environment } from '../../environments/environment';

const base = environment.btctutoringServiceUrl;

describe('BillingService', () => {
  let service: BillingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BillingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getBillingRecords GETs /billing', () => {
    service.getBillingRecords().subscribe();
    const req = httpMock.expectOne(`${base}/billing`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getBillingRecordsByMonth sets the month param', () => {
    service.getBillingRecordsByMonth('2026-07').subscribe();
    httpMock.expectOne(`${base}/billing?month=2026-07`).flush([]);
  });

  it('getBillingRecordsByPeriod sets the period param', () => {
    service.getBillingRecordsByPeriod('2026-07-01').subscribe();
    const req = httpMock.expectOne(`${base}/billing?period=2026-07-01`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getBillingRecordsByContact sets the contact param', () => {
    service.getBillingRecordsByContact('c-1').subscribe();
    const req = httpMock.expectOne(`${base}/billing?contact=c-1`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('upsertBillingRecord POSTs the record', () => {
    const record: BillingRecord = {
      contact_id: 'c-1',
      period_start: '2026-07-01',
      cycle: 'monthly',
      amount: 362,
      paid: true,
    };
    service.upsertBillingRecord(record).subscribe();
    const req = httpMock.expectOne(`${base}/billing`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(record);
    req.flush({ id: 'c-1#2026-07-01' });
  });
});
