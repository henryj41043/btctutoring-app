import {inject, Injectable} from '@angular/core';
import {HttpBackend, HttpClient, HttpEvent, HttpEventType} from '@angular/common/http';
import {concat, filter, map, Observable, switchMap} from 'rxjs';
import {environment} from '../../environments/environment';
import {Response} from '../models/response.model';
import {
  ContactDocument,
  DocumentUrlMode,
  UploadLink,
  UploadProgress,
} from '../models/contact-document.model';

/** Percentage of an upload event, or null for events that carry no progress. */
export function percentOf(event: HttpEvent<unknown>): number | null {
  if (event.type === HttpEventType.Response) {
    return 100;
  }
  if (event.type !== HttpEventType.UploadProgress) {
    return null;
  }
  return event.total ? Math.min(99, Math.floor((event.loaded / event.total) * 100)) : 0;
}

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);
  /**
   * Storage is not our API: this client skips the interceptors, so the login
   * tokens are never sent to it and a large file is not cut off at 30 seconds.
   */
  private storageClient: HttpClient = new HttpClient(inject(HttpBackend));

  getDocumentsForContact(contactId: string): Observable<ContactDocument[]> {
    return this.httpClient.get<ContactDocument[]>(`${this.baseUrl}/documents/contact/${contactId}`);
  }

  getUrl(id: string, mode: DocumentUrlMode): Observable<{url: string}> {
    return this.httpClient.get<{url: string}>(`${this.baseUrl}/documents/${id}/url`, {params: {mode}});
  }

  deleteDocument(id: string): Observable<Response> {
    return this.httpClient.delete<Response>(`${this.baseUrl}/documents/${id}`);
  }

  deleteForContact(contactId: string): Observable<{deleted: number}> {
    return this.httpClient.delete<{deleted: number}>(`${this.baseUrl}/documents/contact/${contactId}`);
  }

  /**
   * Uploads one file: asks for a link, sends the file to storage, confirms.
   * Emits the percentage as it goes and the stored document at the end.
   */
  upload(contactId: string, file: File, contentType: string): Observable<UploadProgress> {
    return this.httpClient.post<UploadLink>(`${this.baseUrl}/documents/contact/${contactId}/upload-url`, {
      file_name: file.name,
      content_type: contentType,
      size: file.size,
    }).pipe(
      switchMap(link => concat(
        this.storageClient.put(link.url, file, {
          headers: link.headers,
          reportProgress: true,
          observe: 'events',
          responseType: 'text',
        }).pipe(
          map(percentOf),
          filter((percent): percent is number => percent !== null),
          map(percent => ({percent})),
        ),
        this.httpClient.post<ContactDocument>(`${this.baseUrl}/documents/${link.id}/complete`, {}).pipe(
          map(document => ({percent: 100, document})),
        ),
      )),
    );
  }
}
