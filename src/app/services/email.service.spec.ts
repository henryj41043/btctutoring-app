import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { EmailService } from './email.service';
import { environment } from '../../environments/environment';

const base = environment.btctutoringServiceUrl;

describe('EmailService', () => {
  let service: EmailService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EmailService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('gets a contact\'s emails', () => {
    service.getEmailsForContact('c-1').subscribe();
    const req = httpMock.expectOne(`${base}/emails/contact/c-1`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('gets the unmatched queue', () => {
    service.getUnmatched().subscribe();
    const req = httpMock.expectOne(`${base}/emails/unmatched`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('assigns an email to a contact', () => {
    service.assign('hash-1', 'c-9').subscribe();
    const req = httpMock.expectOne(`${base}/emails/hash-1/assign`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ contact_id: 'c-9' });
    req.flush({});
  });

  it('discards an email', () => {
    service.discard('hash-1').subscribe();
    const req = httpMock.expectOne(`${base}/emails/hash-1/discard`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('fetches a presigned original url', () => {
    service.getOriginalUrl('hash-1').subscribe();
    const req = httpMock.expectOne(`${base}/emails/hash-1/original-url`);
    expect(req.request.method).toBe('GET');
    req.flush({ url: 'https://signed' });
  });
});
