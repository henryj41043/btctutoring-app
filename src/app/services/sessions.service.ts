import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {Session} from '../models/session.model';
import {Response} from '../models/response.model';

@Injectable({
  providedIn: 'root'
})
export class SessionsService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);

  getAllSessions(): Observable<Session[]> {
    return this.httpClient.get<Session[]>(`${this.baseUrl}/sessions`);
  }

  getSessionsByTutor(tutor: string): Observable<Session[]> {
    let params: HttpParams = new HttpParams().set('tutor', tutor);
    return this.httpClient.get<Session[]>(`${this.baseUrl}/sessions`, { params: params });
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

  updateSession(session: Session): Observable<Session> {
    return this.httpClient.put<Session>(`${this.baseUrl}/sessions`, session);
  }

  deleteSession(id: string): Observable<Response> {
    return this.httpClient.delete<Response>(`${this.baseUrl}/sessions/${id}`);
  }
}
