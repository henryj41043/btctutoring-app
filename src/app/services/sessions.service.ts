import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient, HttpParams} from '@angular/common/http';
import {map, Observable} from 'rxjs';
import {AttendanceRequest, AttendanceResult, Session} from '../models/session.model';
import {Response} from '../models/response.model';

/** Optional start_datetime range (ISO strings) applied server-side. */
export interface SessionRange {
  from?: string;
  to?: string;
}

/** Counts reported by the service-side session horizon fill. */
export interface HorizonFillResult {
  studentsFilled: number;
  sessionsCreated: number;
  groupSessionsCreated: number;
  monthsSkippedNoSchedule: number;
  lockedOut: boolean;
}

import {MakeupSetRequest, MakeupSetResult} from '../models/makeup-set.model';

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

  /**
   * Lead Tutors: the parameterless GET — the server resolves the lead's team
   * and returns own + members' sessions. Same wire shape as getAllSessions;
   * kept separate so intent survives at call sites.
   */
  getTeamSessions(range?: SessionRange): Observable<Session[]> {
    const params = this.withRange(new HttpParams(), range);
    return this.httpClient.get<Session[]>(`${this.baseUrl}/sessions`, { params });
  }

  /**
   * Pending make-up minutes per student id, counted by the service across
   * every tutor. Admins get all students; a tutor gets the students they can
   * see. Students with nothing scheduled are absent (read with `?? 0`).
   */
  getScheduledMakeup(): Observable<Map<string, number>> {
    return this.httpClient
      .get<{student_id: string; scheduled_minutes: number}[]>(`${this.baseUrl}/sessions/makeup-scheduled`)
      .pipe(map(rows => new Map((rows ?? []).map(row => [row.student_id, row.scheduled_minutes]))));
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

  /** Emails the session's STORED notes to the student's parent. */
  emailSessionNotes(id: string): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/sessions/${id}/email-notes`, {});
  }

  deleteSession(id: string): Observable<Response> {
    return this.httpClient.delete<Response>(`${this.baseUrl}/sessions/${id}`);
  }

  /**
   * Takes or corrects attendance. The service checks the role, corrects the
   * student's make-up minutes and records the change. With `dryRun` nothing
   * is written: the result is the preview shown before confirming.
   */
  setAttendance(id: string, request: AttendanceRequest, dryRun: boolean = false): Observable<AttendanceResult> {
    const options = dryRun ? {params: new HttpParams().set('dry_run', 'true')} : {};
    return this.httpClient.put<AttendanceResult>(`${this.baseUrl}/sessions/${id}/attendance`, request, options);
  }

  /**
   * Plans a set of make-ups for one student and, unless `dryRun`, creates
   * the ones the student's minutes cover. The service decides which fit.
   */
  createMakeupSet(request: MakeupSetRequest, dryRun: boolean = false): Observable<MakeupSetResult> {
    const options = dryRun ? {params: new HttpParams().set('dry_run', 'true')} : {};
    return this.httpClient.post<MakeupSetResult>(`${this.baseUrl}/sessions/makeup-set`, request, options);
  }

  /**
   * Asks the service to generate the student's tutoring sessions through the
   * next three months (idempotent per month; the nightly job does the same for
   * everyone). Called right after a schedule save so the calendar fills now.
   */
  fillHorizon(studentId: string, rebuildFrom?: string): Observable<HorizonFillResult> {
    let params = new HttpParams().set('student', studentId);
    if (rebuildFrom) {
      // Rebuild mode ('YYYY-MM-DD'): every stretch from that date, the rest
      // of this month's running schedule included.
      params = params.set('from', rebuildFrom);
    }
    return this.httpClient.post<HorizonFillResult>(`${this.baseUrl}/sessions/horizon/fill`, {}, { params });
  }
}
