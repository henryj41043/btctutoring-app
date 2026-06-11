import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ClientsService } from './clients.service';
import { Client } from '../models/client.model';
import { environment } from '../../environments/environment';

const base = environment.btctutoringServiceUrl;

describe('ClientsService', () => {
  let service: ClientsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ClientsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getAllClients GETs /clients', () => {
    service.getAllClients().subscribe();
    httpMock.expectOne(`${base}/clients`).flush([]);
  });

  it('getClient sets the id param', () => {
    service.getClient('c-1').subscribe();
    httpMock.expectOne(`${base}/clients?id=c-1`).flush({} as Client);
  });

  it('createClient POSTs to /clients', () => {
    const client = { id: 'c-1' } as Client;
    service.createClient(client).subscribe();
    const req = httpMock.expectOne(`${base}/clients`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(client);
    req.flush({ message: 'ok' });
  });

  it('updateClient PUTs to /clients', () => {
    const client = { id: 'c-1' } as Client;
    service.updateClient(client).subscribe();
    const req = httpMock.expectOne(`${base}/clients`);
    expect(req.request.method).toBe('PUT');
    req.flush(client);
  });

  it('deleteClient DELETEs by id', () => {
    service.deleteClient('c-1').subscribe();
    const req = httpMock.expectOne(`${base}/clients/c-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'ok' });
  });
});
