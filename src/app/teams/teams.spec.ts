import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { Teams } from './teams';
import { TeamService } from '../services/team.service';
import { ContactService } from '../services/contact.service';
import { Team } from '../models/team.model';
import { Contact } from '../models/contact.model';
import { TeamDialog } from '../team-dialog/team-dialog';

const leadContact = {
  id: 'c-lead', first_name: 'Lea', last_name: 'Lead', user_group: 'LeadTutors',
} as Contact;
const tutorContact = {
  id: 'c-m1', first_name: 'Tess', last_name: 'Tutor', user_group: 'Tutors',
} as Contact;

const team = (over: Partial<Team> = {}): Team => ({
  id: 'team-1',
  name: 'Team A',
  lead_contact_id: 'c-lead',
  member_contact_ids: ['c-m1'],
  ...over,
});

describe('Teams', () => {
  let afterClosed: unknown;
  const teamService = { getTeams: jest.fn() };
  const contactService = { getContactsSummary: jest.fn() };
  const dialog = { open: jest.fn(() => ({ afterClosed: () => of(afterClosed) })) };

  const build = (): Teams => {
    TestBed.configureTestingModule({
      imports: [Teams],
      providers: [
        { provide: TeamService, useValue: teamService },
        { provide: ContactService, useValue: contactService },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    return TestBed.createComponent(Teams).componentInstance;
  };

  const data = (c: Teams): Team[] =>
    (c as unknown as { dataSource: { data: Team[] } }).dataSource.data;

  beforeEach(() => {
    afterClosed = undefined;
    dialog.open.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    teamService.getTeams.mockReturnValue(of([team()]));
    contactService.getContactsSummary.mockReturnValue(of([leadContact, tutorContact]));
  });

  it('loads teams sorted by name and resolves lead/member names', () => {
    teamService.getTeams.mockReturnValue(of([
      team({ id: 'team-2', name: 'Zeta' }),
      team({ id: 'team-1', name: 'Alpha' }),
    ]));
    const c = build();
    c.ngOnInit();
    expect(data(c).map(t => t.name)).toEqual(['Alpha', 'Zeta']);
    expect(c.leadName(team())).toBe('Lea Lead');
    expect(c.memberNames(team())).toBe('Tess Tutor');
    expect(c.memberCount(team())).toBe(1);
  });

  it('renders placeholders for unknown or missing lead/members', () => {
    const c = build();
    c.ngOnInit();
    expect(c.leadName(team({ lead_contact_id: undefined }))).toBe('—');
    expect(c.leadName(team({ lead_contact_id: 'c-gone' }))).toBe('—');
    expect(c.memberNames(team({ member_contact_ids: [] }))).toBe('—');
    expect(c.memberNames(team({ member_contact_ids: ['c-gone'] }))).toBe('—');
    expect(c.memberCount(team({ member_contact_ids: undefined }))).toBe(0);
  });

  it('handles contacts without ids or name parts', () => {
    contactService.getContactsSummary.mockReturnValue(of([
      { first_name: 'NoId' } as Contact,
      { id: 'c-solo', first_name: 'Solo' } as Contact,
      { id: 'c-blank' } as Contact,
    ]));
    const c = build();
    c.ngOnInit();
    expect(c.leadName(team({ lead_contact_id: 'c-solo' }))).toBe('Solo');
    expect(c.leadName(team({ lead_contact_id: 'c-blank' }))).toBe('');
    expect(c.memberNames(team({ member_contact_ids: ['c-solo'] }))).toBe('Solo');
  });

  it('sorts teams with missing names without crashing', () => {
    teamService.getTeams.mockReturnValue(of([
      team({ id: 't-1', name: undefined }),
      team({ id: 't-2', name: 'Alpha' }),
    ]));
    const c = build();
    c.ngOnInit();
    expect(data(c)).toHaveLength(2);
  });

  it('filters by team, lead, or member name case-insensitively', () => {
    const c = build();
    c.ngOnInit();
    c.applyFilter('  TESS ');
    expect((c as unknown as { dataSource: { filter: string } }).dataSource.filter).toBe('tess');
    expect((c as unknown as {
      dataSource: { filterPredicate(t: Team, f: string): boolean };
    }).dataSource.filterPredicate(team(), 'tess')).toBe(true);
    expect((c as unknown as {
      dataSource: { filterPredicate(t: Team, f: string): boolean };
    }).dataSource.filterPredicate(team(), 'nobody')).toBe(false);
  });

  it('swallows load errors and renders an empty table', () => {
    teamService.getTeams.mockReturnValue(throwError(() => new Error('boom')));
    contactService.getContactsSummary.mockReturnValue(throwError(() => new Error('boom')));
    const c = build();
    c.ngOnInit();
    expect(data(c)).toEqual([]);
    expect((c as unknown as { loading: boolean }).loading).toBe(false);
  });

  it('opens the create dialog with teams + contacts and reloads on a result', () => {
    afterClosed = true;
    const c = build();
    c.ngOnInit();
    teamService.getTeams.mockClear();
    c.openCreateDialog();
    expect(dialog.open).toHaveBeenCalledWith(TeamDialog, {
      data: { mode: 'create', team: undefined, teams: [team()], contacts: [leadContact, tutorContact] },
      width: '440px',
    });
    expect(teamService.getTeams).toHaveBeenCalledTimes(1); // reload
  });

  it('row click opens edit; a dismissed dialog does not reload', () => {
    afterClosed = undefined;
    const c = build();
    c.ngOnInit();
    teamService.getTeams.mockClear();
    c.openEditDialog(team());
    const args = dialog.open.mock.calls.at(-1)![1] as { data: { mode: string; team: Team } };
    expect(args.data.mode).toBe('edit');
    expect(args.data.team).toEqual(team());
    expect(teamService.getTeams).not.toHaveBeenCalled();
  });

  it('delete icon opens the delete dialog and stops row propagation', () => {
    const c = build();
    c.ngOnInit();
    const event = { stopPropagation: jest.fn() } as unknown as Event;
    c.openDeleteDialog(team(), event);
    expect(event.stopPropagation).toHaveBeenCalled();
    const args = dialog.open.mock.calls.at(-1)![1] as { data: { mode: string } };
    expect(args.data.mode).toBe('delete');
  });

  it('wires sort and paginator through the view-child setters', () => {
    const c = build();
    c.matSort = {} as MatSort;
    c.matPaginator = { firstPage: jest.fn() } as unknown as MatPaginator;
    const ds = (c as unknown as { dataSource: { sort: unknown; paginator: unknown } }).dataSource;
    expect(ds.sort).toBeTruthy();
    expect(ds.paginator).toBeTruthy();
    c.matSort = null as never;
    c.matPaginator = null as never;
    expect(ds.sort).toBeTruthy();
  });
});
