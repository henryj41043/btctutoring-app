import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {Response} from '../models/response.model';
import {Note} from '../models/note.model';

@Injectable({
  providedIn: 'root'
})
export class NoteService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);

  getNote(id: string): Observable<Note> {
    let params: HttpParams = new HttpParams().set('id', id);
    return this.httpClient.get<Note>(`${this.baseUrl}/notes`, { params: params });
  }

  getNotesByAuthor(authorId: string): Observable<Note[]> {
    let params: HttpParams = new HttpParams().set('author', authorId);
    return this.httpClient.get<Note[]>(`${this.baseUrl}/notes`, { params: params });
  }

  getNotesByRecipient(recipientId: string): Observable<Note[]> {
    let params: HttpParams = new HttpParams().set('recipient', recipientId);
    return this.httpClient.get<Note[]>(`${this.baseUrl}/notes`, { params: params });
  }

  getNotes(): Observable<Note[]> {
    return this.httpClient.get<Note[]>(`${this.baseUrl}/notes`);
  }

  createNote(note: Note): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/notes`, note);
  }

  updateNote(note: Note): Observable<Note> {
    return this.httpClient.put<Note>(`${this.baseUrl}/notes`, note);
  }

  deleteNote(id: string): Observable<Response> {
    return this.httpClient.delete<Response>(`${this.baseUrl}/notes/${id}`);
  }
}
