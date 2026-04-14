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

  createContact(contact: Contact): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/contacts`, contact);
  }

  updateContact(contact: Contact): Observable<Contact> {
    return this.httpClient.put<Contact>(`${this.baseUrl}/contacts`, contact);
  }

  deleteContact(id: string): Observable<Response> {
    return this.httpClient.delete<Response>(`${this.baseUrl}/contacts/${id}`);
  }
}
