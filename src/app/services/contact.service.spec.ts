import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ContactService } from './contact.service';
import { Contact } from '../models/contact.model';
import { environment } from '../../environments/environment';

const base = environment.btctutoringServiceUrl;

describe('ContactService', () => {
  let service: ContactService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ContactService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getContact issues a GET with the id query param', () => {
    const expected = [{ id: 'c-1' }] as Contact[];
    let result: Contact[] | undefined;
    service.getContact('c-1').subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${base}/contacts?id=c-1`);
    expect(req.request.method).toBe('GET');
    req.flush(expected);
    expect(result).toEqual(expected);
  });

  it('getContacts issues a GET for all contacts', () => {
    service.getContacts().subscribe();
    const req = httpMock.expectOne(`${base}/contacts`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getContactsSummary caches and serves stale-while-revalidate', () => {
    const first = [{ id: 'c-1', first_name: 'Ada' }];
    const second = [{ id: 'c-1', first_name: 'Ada' }, { id: 'c-2', first_name: 'Sam' }];

    // First call: no cache — a single fresh emission.
    const seen1: unknown[] = [];
    service.getContactsSummary().subscribe(v => seen1.push(v));
    httpMock.expectOne(`${base}/contacts?view=summary`).flush(first);
    expect(seen1).toEqual([first]);

    // Second call: cached copy emits immediately, then the fresh response.
    const seen2: unknown[] = [];
    service.getContactsSummary().subscribe(v => seen2.push(v));
    expect(seen2).toEqual([first]); // synchronous cache emission
    httpMock.expectOne(`${base}/contacts?view=summary`).flush(second);
    expect(seen2).toEqual([first, second]);
  });

  it('contact writes invalidate the summary cache', () => {
    // Prime the cache.
    service.getContactsSummary().subscribe();
    httpMock.expectOne(`${base}/contacts?view=summary`).flush([{ id: 'c-1' }]);

    // A write clears it…
    service.createContact({ first_name: 'New' } as never).subscribe();
    httpMock.expectOne(`${base}/contacts`).flush({ id: 'c-2' });

    // …so the next summary call has no synchronous cache emission.
    const seen: unknown[] = [];
    service.getContactsSummary().subscribe(v => seen.push(v));
    expect(seen).toEqual([]);
    httpMock.expectOne(`${base}/contacts?view=summary`).flush([]);
    expect(seen).toEqual([[]]);
  });

  it('update and delete also invalidate the summary cache', () => {
    service.getContactsSummary().subscribe();
    httpMock.expectOne(`${base}/contacts?view=summary`).flush([{ id: 'c-1' }]);
    service.updateContact({ id: 'c-1' } as never).subscribe();
    httpMock.expectOne(`${base}/contacts`).flush({ id: 'c-1' });
    const seen: unknown[] = [];
    service.getContactsSummary().subscribe(v => seen.push(v));
    expect(seen).toEqual([]); // no cache
    httpMock.expectOne(`${base}/contacts?view=summary`).flush([{ id: 'c-1' }]);

    service.deleteContact('c-1').subscribe();
    httpMock.expectOne(`${base}/contacts/c-1`).flush({ id: 'c-1' });
    const seen2: unknown[] = [];
    service.getContactsSummary().subscribe(v => seen2.push(v));
    expect(seen2).toEqual([]); // cleared again
    httpMock.expectOne(`${base}/contacts?view=summary`).flush([]);
  });

  it('getStaff sets the staff param', () => {
    service.getStaff().subscribe();
    httpMock.expectOne(`${base}/contacts?staff=true`).flush([]);
  });

  it('createContact POSTs the contact body', () => {
    const contact = { first_name: 'Ada' } as Contact;
    service.createContact(contact).subscribe();
    const req = httpMock.expectOne(`${base}/contacts`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(contact);
    req.flush({ message: 'ok' });
  });

  it('updateContact PUTs the contact body', () => {
    const contact = { id: 'c-1' } as Contact;
    service.updateContact(contact).subscribe();
    const req = httpMock.expectOne(`${base}/contacts`);
    expect(req.request.method).toBe('PUT');
    req.flush(contact);
  });

  it('deleteContact DELETEs by id', () => {
    service.deleteContact('c-1').subscribe();
    const req = httpMock.expectOne(`${base}/contacts/c-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'ok' });
  });

  it('adminCreateUser POSTs to /auth/user', () => {
    service.adminCreateUser('a@b.com', 'Tutors', 'c-1').subscribe();
    const req = httpMock.expectOne(`${base}/auth/user`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      email: 'a@b.com',
      group: 'Tutors',
      id: 'c-1',
    });
    req.flush({});
  });

  it('adminDeleteUser DELETEs /auth/user/:id', () => {
    service.adminDeleteUser('a@b.com').subscribe();
    const req = httpMock.expectOne(`${base}/auth/user/a@b.com`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('adminUpdateUserGroup PUTs to /auth/user/group', () => {
    service.adminUpdateUserGroup('a@b.com', 'Admins').subscribe();
    const req = httpMock.expectOne(`${base}/auth/user/group`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ email: 'a@b.com', group: 'Admins' });
    req.flush({});
  });
});
