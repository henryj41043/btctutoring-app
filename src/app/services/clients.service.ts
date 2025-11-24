import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {Client} from '../models/client.model';
import {Response} from '../models/response.model';

@Injectable({
  providedIn: 'root'
})
export class ClientsService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);

  getAllClients(): Observable<Client[]> {
    return this.httpClient.get<Client[]>(`${this.baseUrl}/clients`);
  }

  getClient(id: string): Observable<Client> {
    let params = new HttpParams().set('id', id);
    return this.httpClient.get<Client>(`${this.baseUrl}/clients`, {params: params});
  }

  createClient(client: Client): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/clients`, client);
  }

  updateClient(client: Client): Observable<Client> {
    return this.httpClient.put<Client>(`${this.baseUrl}/clients`, client);
  }

  deleteClient(id: string): Observable<Response> {
    return this.httpClient.delete<Response>(`${this.baseUrl}/clients/${id}`);
  }
}
