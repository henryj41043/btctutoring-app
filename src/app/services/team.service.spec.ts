import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TeamService } from './team.service';
import { Team } from '../models/team.model';
import { environment } from '../../environments/environment';

const base = environment.btctutoringServiceUrl;

describe('TeamService', () => {
  let service: TeamService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TeamService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('gets teams', () => {
    service.getTeams().subscribe();
    const req = httpMock.expectOne(`${base}/teams`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('creates a team', () => {
    const team = { name: 'Team A', lead_contact_id: 'c-lead' } as Team;
    service.createTeam(team).subscribe();
    const req = httpMock.expectOne(`${base}/teams`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe(team);
    req.flush({ id: 'team-1', message: 'ok' });
  });

  it('updates a team', () => {
    const team = { id: 'team-1', name: 'Team A' } as Team;
    service.updateTeam(team).subscribe();
    const req = httpMock.expectOne(`${base}/teams`);
    expect(req.request.method).toBe('PUT');
    req.flush(team);
  });

  it('deletes a team', () => {
    service.deleteTeam('team-1').subscribe();
    const req = httpMock.expectOne(`${base}/teams/team-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ id: 'team-1', message: 'ok' });
  });
});
