import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {Session} from '../models/session.model';
import {Response} from '../models/response.model';

/** Optional start_datetime range (ISO strings) applied server-side. */
export interface SessionRange {
  from?: string;
  to?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SessionsService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);

  /** Appends optional from/to range params. */
  private withRange(params: HttpParams, range?: SessionRange): HttpParams {
    if (range?.from) params = params.set('from', range.from);
    if (range?.to) params = params.set('to', range.to);
    return params;
  }

  getAllSessions(range?: SessionRange): Observable<Session[]> {
    const params = this.withRange(new HttpParams(), range);
    return this.httpClient.get<Session[]>(`${this.baseUrl}/sessions`, { params });
  }

  getSessionsBySeries(seriesId: string): Observable<Session[]> {
    let params: HttpParams = new HttpParams().set('series', seriesId);
    return this.httpClient.get<Session[]>(`${this.baseUrl}/sessions`, { params: params });
  }

  getSessionsByTutor(tutor: string, range?: SessionRange): Observable<Session[]> {
    const params = this.withRange(new HttpParams().set('tutor', tutor), range);
    return this.httpClient.get<Session[]>(`${this.baseUrl}/sessions`, { params });
  }

  getSessionsByStudent(student: string): Observable<Session[]> {
    let params: HttpParams = new HttpParams().set('student', student);
    return this.httpClient.get<Session[]>(`${this.baseUrl}/sessions`, { params: params });
  }

  getSessions(tutor: string, student: string): Observable<Session[]> {
    let params: HttpParams = new HttpParams()
      .set('tutor', tutor)
      .set('student', student);
    return this.httpClient.get<Session[]>(`${this.baseUrl}/sessions`, { params: params });
  }

  createSession(session: Session): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/sessions`, session);
  }

  createSessions(sessions: Session[]): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/sessions/batch`, sessions);
  }

  updateSession(session: Session): Observable<Session> {
    return this.httpClient.put<Session>(`${this.baseUrl}/sessions`, session);
  }

  deleteSession(id: string): Observable<Response> {
    return this.httpClient.delete<Response>(`${this.baseUrl}/sessions/${id}`);
  }
}
