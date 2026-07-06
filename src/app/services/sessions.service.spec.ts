import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { SessionsService } from './sessions.service';
import { Session } from '../models/session.model';
import { environment } from '../../environments/environment';

const base = environment.btctutoringServiceUrl;

describe('SessionsService', () => {
  let service: SessionsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SessionsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getAllSessions GETs /sessions', () => {
    service.getAllSessions().subscribe();
    const req = httpMock.expectOne(`${base}/sessions`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getAllSessions appends from/to range params', () => {
    service.getAllSessions({ from: 'A', to: 'B' }).subscribe();
    httpMock.expectOne(`${base}/sessions?from=A&to=B`).flush([]);
  });

  it('getSessionsByTutor combines tutor with a partial range', () => {
    service.getSessionsByTutor('t-1', { from: 'A' }).subscribe();
    httpMock.expectOne(`${base}/sessions?tutor=t-1&from=A`).flush([]);
    service.getSessionsByTutor('t-1', { to: 'B' }).subscribe();
    httpMock.expectOne(`${base}/sessions?tutor=t-1&to=B`).flush([]);
  });

  it('getSessionsBySeries sets the series param', () => {
    service.getSessionsBySeries('series-1').subscribe();
    httpMock.expectOne(`${base}/sessions?series=series-1`).flush([]);
  });

  it('getSessionsByTutor sets the tutor param', () => {
    service.getSessionsByTutor('tutor@example.com').subscribe();
    httpMock.expectOne(`${base}/sessions?tutor=tutor@example.com`).flush([]);
  });

  it('getSessionsByStudent sets the student param', () => {
    service.getSessionsByStudent('stu-1').subscribe();
    httpMock.expectOne(`${base}/sessions?student=stu-1`).flush([]);
  });

  it('getSessions sets both tutor and student params', () => {
    service.getSessions('tutor@example.com', 'stu-1').subscribe();
    httpMock
      .expectOne(`${base}/sessions?tutor=tutor@example.com&student=stu-1`)
      .flush([]);
  });

  it('createSession POSTs to /sessions', () => {
    const session = { id: 's-1' } as Session;
    service.createSession(session).subscribe();
    const req = httpMock.expectOne(`${base}/sessions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(session);
    req.flush({ message: 'ok' });
  });

  it('createSessions POSTs an array to /sessions/batch', () => {
    const sessions = [{ id: 's-1' }] as Session[];
    service.createSessions(sessions).subscribe();
    const req = httpMock.expectOne(`${base}/sessions/batch`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(sessions);
    req.flush({ message: 'ok' });
  });

  it('updateSession PUTs to /sessions', () => {
    const session = { id: 's-1' } as Session;
    service.updateSession(session).subscribe();
    const req = httpMock.expectOne(`${base}/sessions`);
    expect(req.request.method).toBe('PUT');
    req.flush(session);
  });

  it('deleteSession DELETEs by id', () => {
    service.deleteSession('s-1').subscribe();
    const req = httpMock.expectOne(`${base}/sessions/s-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'ok' });
  });
});
