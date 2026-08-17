import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';
import {Response} from '../models/response.model';
import {EmailEntry} from '../models/email-entry.model';

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);

  getEmailsForContact(contactId: string): Observable<EmailEntry[]> {
    return this.httpClient.get<EmailEntry[]>(`${this.baseUrl}/emails/contact/${contactId}`);
  }

  getUnmatched(): Observable<EmailEntry[]> {
    return this.httpClient.get<EmailEntry[]>(`${this.baseUrl}/emails/unmatched`);
  }

  assign(id: string, contactId: string): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/emails/${id}/assign`, {contact_id: contactId});
  }

  discard(id: string): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/emails/${id}/discard`, {});
  }

  getOriginalUrl(id: string): Observable<{url: string}> {
    return this.httpClient.get<{url: string}>(`${this.baseUrl}/emails/${id}/original-url`);
  }
}
