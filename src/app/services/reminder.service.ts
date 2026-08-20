import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';
import {Response} from '../models/response.model';
import {Reminder} from '../models/reminder.model';

@Injectable({
  providedIn: 'root'
})
export class ReminderService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);

  getReminders(): Observable<Reminder[]> {
    return this.httpClient.get<Reminder[]>(`${this.baseUrl}/reminders`);
  }

  createReminder(reminder: Reminder): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/reminders`, reminder);
  }

  updateReminder(reminder: Reminder): Observable<Reminder> {
    return this.httpClient.put<Reminder>(`${this.baseUrl}/reminders`, reminder);
  }

  completeReminder(id: string): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/reminders/${id}/complete`, {});
  }

  uncompleteReminder(id: string): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/reminders/${id}/uncomplete`, {});
  }

  /** Records the caller's own ack (the backend pins it to their JWT contact). */
  ackReminder(id: string): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/reminders/${id}/ack`, {});
  }

  unackReminder(id: string): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/reminders/${id}/unack`, {});
  }

  deleteReminder(id: string): Observable<Response> {
    return this.httpClient.delete<Response>(`${this.baseUrl}/reminders/${id}`);
  }
}
