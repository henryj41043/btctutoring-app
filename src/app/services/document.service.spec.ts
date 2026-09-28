import { TestBed } from '@angular/core/testing';
import { HttpEventType, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DocumentService, percentOf } from './document.service';
import { UploadProgress } from '../models/contact-document.model';
import { environment } from '../../environments/environment';

const base = environment.btctutoringServiceUrl;

describe('DocumentService', () => {
  let service: DocumentService;
  let httpMock: HttpTestingController;
  const intercepted: string[] = [];

  beforeEach(() => {
    intercepted.length = 0;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([(request, next) => {
          intercepted.push(request.url);
          return next(request.clone({ setHeaders: { Authorization: 'Bearer token' } }));
        }])),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(DocumentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists the documents of a contact', () => {
    let result: unknown;
    service.getDocumentsForContact('c-1').subscribe(r => (result = r));
    const req = httpMock.expectOne(`${base}/documents/contact/c-1`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'd-1' }]);
    expect(result).toEqual([{ id: 'd-1' }]);
  });

  it.each(['view', 'download'] as const)('asks for a %s link', mode => {
    let result: unknown;
    service.getUrl('d-1', mode).subscribe(r => (result = r));
    const req = httpMock.expectOne(`${base}/documents/d-1/url?mode=${mode}`);
    expect(req.request.method).toBe('GET');
    req.flush({ url: 'https://signed' });
    expect(result).toEqual({ url: 'https://signed' });
  });

  it('deletes one document, and all of a contact', () => {
    service.deleteDocument('d-1').subscribe();
    const one = httpMock.expectOne(`${base}/documents/d-1`);
    expect(one.request.method).toBe('DELETE');
    one.flush({});
    let result: unknown;
    service.deleteForContact('c-1').subscribe(r => (result = r));
    const all = httpMock.expectOne(`${base}/documents/contact/c-1`);
    expect(all.request.method).toBe('DELETE');
    all.flush({ deleted: 2 });
    expect(result).toEqual({ deleted: 2 });
  });

  describe('upload', () => {
    const file = new File(['hello world'], 'resume.pdf');

    it('asks for a link, sends the file to storage, then confirms', () => {
      const seen: UploadProgress[] = [];
      let done = false;
      service.upload('c-1', file, 'application/pdf').subscribe({
        next: p => seen.push(p),
        complete: () => (done = true),
      });

      const link = httpMock.expectOne(`${base}/documents/contact/c-1/upload-url`);
      expect(link.request.method).toBe('POST');
      expect(link.request.body).toEqual({ file_name: 'resume.pdf', content_type: 'application/pdf', size: 11 });
      httpMock.expectNone(`${base}/documents/d-1/complete`);
      link.flush({ id: 'd-1', url: 'https://storage.example/put?sig=1', headers: { 'Content-Type': 'application/pdf' } });

      const put = httpMock.expectOne('https://storage.example/put?sig=1');
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toBe(file);
      expect(put.request.headers.get('Content-Type')).toBe('application/pdf');
      expect(put.request.reportProgress).toBe(true);
      expect(put.request.responseType).toBe('text');
      // Storage is not our API: no login token, no interceptor at all.
      expect(put.request.headers.has('Authorization')).toBe(false);
      expect(intercepted).toEqual([`${base}/documents/contact/c-1/upload-url`]);

      httpMock.expectNone(`${base}/documents/d-1/complete`);
      put.event({ type: HttpEventType.Sent });
      put.event({ type: HttpEventType.UploadProgress, loaded: 5, total: 11 });
      put.flush('');
      expect(seen).toEqual([{ percent: 45 }, { percent: 100 }]);

      const complete = httpMock.expectOne(`${base}/documents/d-1/complete`);
      expect(complete.request.method).toBe('POST');
      expect(complete.request.body).toEqual({});
      expect(complete.request.headers.get('Authorization')).toBe('Bearer token');
      complete.flush({ id: 'd-1', status: 'ready' });
      expect(seen[seen.length - 1]).toEqual({ percent: 100, document: { id: 'd-1', status: 'ready' } });
      expect(done).toBe(true);
    });

    it('does not confirm when storage refuses the file', () => {
      let failed: unknown;
      service.upload('c-1', file, 'application/pdf').subscribe({ error: e => (failed = e) });
      httpMock.expectOne(`${base}/documents/contact/c-1/upload-url`)
        .flush({ id: 'd-1', url: 'https://storage.example/put', headers: {} });
      httpMock.expectOne('https://storage.example/put').flush('denied', { status: 403, statusText: 'Forbidden' });
      httpMock.expectNone(`${base}/documents/d-1/complete`);
      expect(failed).toBeDefined();
    });
  });

  describe('percentOf', () => {
    it('reads the share that was sent, never 100 before the answer', () => {
      expect(percentOf({ type: HttpEventType.UploadProgress, loaded: 50, total: 200 })).toBe(25);
      expect(percentOf({ type: HttpEventType.UploadProgress, loaded: 199, total: 200 })).toBe(99);
      expect(percentOf({ type: HttpEventType.UploadProgress, loaded: 200, total: 200 })).toBe(99);
      expect(percentOf({ type: HttpEventType.UploadProgress, loaded: 10 })).toBe(0);
      expect(percentOf({ type: HttpEventType.UploadProgress, loaded: 10, total: 0 })).toBe(0);
    });

    it('is 100 on the answer and null for anything else', () => {
      expect(percentOf({ type: HttpEventType.Response } as never)).toBe(100);
      expect(percentOf({ type: HttpEventType.Sent })).toBeNull();
      expect(percentOf({ type: HttpEventType.DownloadProgress, loaded: 1, total: 2 })).toBeNull();
    });
  });
});
