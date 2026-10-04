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

  /** Forwards the Hub refused (unknown or unverified sender, spam, virus). */
  getRejected(): Observable<EmailEntry[]> {
    return this.httpClient.get<EmailEntry[]>(`${this.baseUrl}/emails/rejected`);
  }

  assign(id: string, contactId: string): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/emails/${id}/assign`, {contact_id: contactId});
  }

  discard(id: string): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/emails/${id}/discard`, {});
  }

  /** Removes every email filed on a contact (the contact is being deleted). */
  discardForContact(contactId: string): Observable<{discarded: number}> {
    return this.httpClient.post<{discarded: number}>(`${this.baseUrl}/emails/contact/${contactId}/discard`, {});
  }

  getOriginalUrl(id: string): Observable<{url: string}> {
    return this.httpClient.get<{url: string}>(`${this.baseUrl}/emails/${id}/original-url`);
  }
}
