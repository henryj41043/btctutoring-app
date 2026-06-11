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
});
