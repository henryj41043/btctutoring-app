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

  it('getScheduledMakeup reads the per-student totals into a map', () => {
    let result: Map<string, number> | undefined;
    service.getScheduledMakeup().subscribe(r => (result = r));
    const req = httpMock.expectOne(`${base}/sessions/makeup-scheduled`);
    expect(req.request.method).toBe('GET');
    req.flush([
      { student_id: 's-1', scheduled_minutes: 75 },
      { student_id: 's-2', scheduled_minutes: 30 },
    ]);
    expect([...result!.entries()]).toEqual([['s-1', 75], ['s-2', 30]]);
  });

  it('getScheduledMakeup tolerates an empty body', () => {
    let result: Map<string, number> | undefined;
    service.getScheduledMakeup().subscribe(r => (result = r));
    httpMock.expectOne(`${base}/sessions/makeup-scheduled`).flush(null);
    expect(result!.size).toBe(0);
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

  it('getTeamSessions GETs /sessions with no tutor param', () => {
    service.getTeamSessions().subscribe();
    const req = httpMock.expectOne(`${base}/sessions`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('tutor')).toBe(false);
    req.flush([]);
  });

  it('getTeamSessions appends only the range params', () => {
    service.getTeamSessions({ from: 'A', to: 'B' }).subscribe();
    const req = httpMock.expectOne(`${base}/sessions?from=A&to=B`);
    expect(req.request.params.has('tutor')).toBe(false);
    req.flush([]);
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

  it('emailSessionNotes POSTs to the email-notes route with an empty body', () => {
    service.emailSessionNotes('s-1').subscribe();
    const req = httpMock.expectOne(`${base}/sessions/s-1/email-notes`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ message: 'ok' });
  });

  it('deleteSession DELETEs by id', () => {
    service.deleteSession('s-1').subscribe();
    const req = httpMock.expectOne(`${base}/sessions/s-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'ok' });
  });

  it('fillHorizon POSTs the student; a rebuild adds the date', () => {
    service.fillHorizon('s-1').subscribe();
    const plain = httpMock.expectOne(`${base}/sessions/horizon/fill?student=s-1`);
    expect(plain.request.method).toBe('POST');
    expect(plain.request.params.has('from')).toBe(false);
    plain.flush({});

    service.fillHorizon('s-1', '2026-10-14').subscribe();
    const rebuild = httpMock.expectOne(`${base}/sessions/horizon/fill?student=s-1&from=2026-10-14`);
    expect(rebuild.request.method).toBe('POST');
    rebuild.flush({});

    service.fillHorizon('s-1', '').subscribe();
    httpMock.expectOne(`${base}/sessions/horizon/fill?student=s-1`).flush({});
  });

  it('setAttendance PUTs the request; a dry run adds the flag', () => {
    let result: unknown;
    service.setAttendance('s-1', {status: 'Completed', notes: 'n'}).subscribe(r => (result = r));
    const real = httpMock.expectOne(`${base}/sessions/s-1/attendance`);
    expect(real.request.method).toBe('PUT');
    expect(real.request.body).toEqual({status: 'Completed', notes: 'n'});
    expect(real.request.params.has('dry_run')).toBe(false);
    real.flush({dry_run: false});
    expect(result).toEqual({dry_run: false});

    service.setAttendance('s-1', {status: 'Cancelled', reason: 'r'}, true).subscribe();
    const preview = httpMock.expectOne(`${base}/sessions/s-1/attendance?dry_run=true`);
    expect(preview.request.method).toBe('PUT');
    preview.flush({dry_run: true});
  });
});
