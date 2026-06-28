import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {BillingRecord} from '../models/billing-record.model';
import {Response} from '../models/response.model';

@Injectable({
  providedIn: 'root'
})
export class BillingService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);

  getBillingRecords(): Observable<BillingRecord[]> {
    return this.httpClient.get<BillingRecord[]>(`${this.baseUrl}/billing`);
  }

  getBillingRecordsByPeriod(periodStart: string): Observable<BillingRecord[]> {
    const params: HttpParams = new HttpParams().set('period', periodStart);
    return this.httpClient.get<BillingRecord[]>(`${this.baseUrl}/billing`, { params });
  }

  getBillingRecordsByContact(contactId: string): Observable<BillingRecord[]> {
    const params: HttpParams = new HttpParams().set('contact', contactId);
    return this.httpClient.get<BillingRecord[]>(`${this.baseUrl}/billing`, { params });
  }

  upsertBillingRecord(record: BillingRecord): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/billing`, record);
  }
}
