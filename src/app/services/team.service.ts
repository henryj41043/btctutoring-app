import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';
import {Response} from '../models/response.model';
import {Team} from '../models/team.model';

@Injectable({
  providedIn: 'root'
})
export class TeamService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);

  getTeams(): Observable<Team[]> {
    return this.httpClient.get<Team[]>(`${this.baseUrl}/teams`);
  }

  createTeam(team: Team): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/teams`, team);
  }

  updateTeam(team: Team): Observable<Team> {
    return this.httpClient.put<Team>(`${this.baseUrl}/teams`, team);
  }

  deleteTeam(id: string): Observable<Response> {
    return this.httpClient.delete<Response>(`${this.baseUrl}/teams/${id}`);
  }
}
