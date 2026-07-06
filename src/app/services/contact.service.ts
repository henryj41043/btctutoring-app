import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {Response} from '../models/response.model';
import {Contact} from '../models/contact.model';

@Injectable({
  providedIn: 'root'
})
export class ContactService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);

  getContact(id: string): Observable<Contact[]> {
    let params: HttpParams = new HttpParams().set('id', id);
    return this.httpClient.get<Contact[]>(`${this.baseUrl}/contacts`, { params: params });
  }

  getContacts(): Observable<Contact[]> {
    return this.httpClient.get<Contact[]>(`${this.baseUrl}/contacts`);
  }

  /** Current staff only (service=Hiring, status=Staff) — for tutor dropdowns. */
  getStaff(): Observable<Contact[]> {
    const params: HttpParams = new HttpParams().set('staff', 'true');
    return this.httpClient.get<Contact[]>(`${this.baseUrl}/contacts`, { params });
  }

  createContact(contact: Contact): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/contacts`, contact);
  }

  updateContact(contact: Contact): Observable<Contact> {
    return this.httpClient.put<Contact>(`${this.baseUrl}/contacts`, contact);
  }

  deleteContact(id: string): Observable<Response> {
    return this.httpClient.delete<Response>(`${this.baseUrl}/contacts/${id}`);
  }

  adminCreateUser(email: string, group: string, id: string): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/auth/user`, {
      email: email,
      group: group,
      id: id,
    });
  }

  adminDeleteUser(id: string): Observable<any> {
    return this.httpClient.delete(`${this.baseUrl}/auth/user/${id}`);
  }
}
