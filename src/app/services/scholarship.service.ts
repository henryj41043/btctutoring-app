import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';
import {Response} from '../models/response.model';
import {ScholarshipRecord} from '../models/scholarship-record.model';

@Injectable({
  providedIn: 'root'
})
export class ScholarshipService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);

  /** All records for one month ('YYYY-MM') — the admin Scholarships page. */
  getScholarshipRecordsByMonth(month: string): Observable<ScholarshipRecord[]> {
    return this.httpClient.get<ScholarshipRecord[]>(
      `${this.baseUrl}/scholarships`, {params: {month}});
  }

  /** One family's full month history — the contact page's section. */
  getScholarshipRecordsByContact(contactId: string): Observable<ScholarshipRecord[]> {
    return this.httpClient.get<ScholarshipRecord[]>(
      `${this.baseUrl}/scholarships`, {params: {contact: contactId}});
  }

  upsertScholarshipRecord(record: ScholarshipRecord): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/scholarships`, record);
  }
}
