import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {AmountOverrideRequest, BillingRecord} from '../models/billing-record.model';
import {Response} from '../models/response.model';
import {Statement} from '../models/statement.model';
import {Student} from '../models/student.model';

@Injectable({
  providedIn: 'root'
})
export class BillingService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);

  getBillingRecords(): Observable<BillingRecord[]> {
    return this.httpClient.get<BillingRecord[]>(`${this.baseUrl}/billing`);
  }

  /** All of a month's records (1st + 15th periods); month is 'YYYY-MM'. */
  getBillingRecordsByMonth(month: string): Observable<BillingRecord[]> {
    const params: HttpParams = new HttpParams().set('month', month);
    return this.httpClient.get<BillingRecord[]>(`${this.baseUrl}/billing`, { params });
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

  /** Sets (number, 0 = no charge) or clears (null) a period's amount override. */
  setAmountOverride(request: AmountOverrideRequest): Observable<Response> {
    return this.httpClient.put<Response>(`${this.baseUrl}/billing/override`, request);
  }

  /** Every family's service-calculated statement for a month ('YYYY-MM'). */
  getStatements(month: string): Observable<Statement[]> {
    const params: HttpParams = new HttpParams().set('month', month);
    return this.httpClient.get<Statement[]>(`${this.baseUrl}/billing/statements`, { params });
  }

  /** The family's statement with an unsaved student change applied (nothing is written). */
  previewStatement(month: string, student: Student): Observable<{statement: Statement | null}> {
    return this.httpClient.post<{statement: Statement | null}>(
      `${this.baseUrl}/billing/statements/preview`, {month, student});
  }
}
