import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TeamDialog, TeamDialogData } from './team-dialog';
import { TeamService } from '../services/team.service';
import { Team } from '../models/team.model';
import { Contact } from '../models/contact.model';

const leadA = { id: 'c-lead-a', first_name: 'Lea', last_name: 'A', user_group: 'LeadTutors' } as Contact;
const leadB = { id: 'c-lead-b', first_name: 'Lou', last_name: 'B', user_group: 'LeadTutors' } as Contact;
const tutor1 = { id: 'c-m1', first_name: 'Tess', last_name: 'One', user_group: 'Tutors' } as Contact;
const tutor2 = { id: 'c-m2', first_name: 'Tim', last_name: 'Two', user_group: 'Tutors' } as Contact;
const adminC = { id: 'c-adm', first_name: 'Ann', last_name: 'Admin', user_group: 'Admins' } as Contact;
const contacts = [leadA, leadB, tutor1, tutor2, adminC];

const otherTeam: Team = {
  id: 'team-other',
  name: 'Other',
  lead_contact_id: 'c-lead-b',
  member_contact_ids: ['c-m2'],
};

describe('TeamDialog', () => {
  const dialogRef = { close: jest.fn() };
  const teamService = {
    createTeam: jest.fn(),
    updateTeam: jest.fn(),
    deleteTeam: jest.fn(),
  };

  const build = (data: Partial<TeamDialogData>): TeamDialog => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TeamDialog],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { teams: [], contacts, ...data } },
        { provide: TeamService, useValue: teamService },
      ],
    });
    const c = TestBed.createComponent(TeamDialog).componentInstance;
    c.ngOnInit();
    return c;
  };

  const form = (c: TeamDialog) =>
    (c as unknown as { teamForm: { get(name: string): { value: unknown; setValue(v: unknown): void } } }).teamForm;
  const priv = (c: TeamDialog) =>
    c as unknown as { submitting: boolean; hasError: boolean; errorMessage: string };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('offers only LeadTutors as leads and only Tutors as members', () => {
    const c = build({ mode: 'create' });
    expect(c.leadOptions.map(o => o.id)).toEqual(['c-lead-a', 'c-lead-b']);
    expect(c.memberOptions.map(o => o.id)).toEqual(['c-m1', 'c-m2']);
  });

  it('marks contacts on other teams as assigned elsewhere (one team max)', () => {
    const c = build({ mode: 'create', teams: [otherTeam] });
    expect(c.isAssignedElsewhere('c-lead-b')).toBe(true); // other team's lead
    expect(c.isAssignedElsewhere('c-m2')).toBe(true); // other team's member
    expect(c.isAssignedElsewhere('c-m1')).toBe(false);
    expect(c.isAssignedElsewhere(undefined)).toBe(false);
  });

  it('tolerates missing team lists and sparse team records', () => {
    const c = build({
      mode: 'create',
      teams: [
        { id: 't-x', name: 'X' } as Team, // no lead, no members
      ],
    });
    expect(c.isAssignedElsewhere('c-m1')).toBe(false);
    const c2 = build({ mode: 'create', teams: undefined as unknown as Team[] });
    expect(c2.isAssignedElsewhere('c-m1')).toBe(false);
  });

  it('saves an empty member list when none are picked', () => {
    teamService.createTeam.mockReturnValue(of({ id: 'team-1', message: 'ok' }));
    const c = build({ mode: 'create' });
    form(c).get('name').setValue('Team A');
    form(c).get('lead_contact_id').setValue('c-lead-a');
    form(c).get('member_contact_ids').setValue(null);
    c.save();
    expect(teamService.createTeam).toHaveBeenCalledWith(
      expect.objectContaining({ member_contact_ids: [] }),
    );
  });

  it('does not lock a team against its own members in edit mode', () => {
    const c = build({ mode: 'edit', team: otherTeam, teams: [otherTeam] });
    expect(c.isAssignedElsewhere('c-lead-b')).toBe(false);
    expect(c.isAssignedElsewhere('c-m2')).toBe(false);
  });

  describe('create', () => {
    it('creates a team and closes with true', () => {
      teamService.createTeam.mockReturnValue(of({ id: 'team-1', message: 'ok' }));
      const c = build({ mode: 'create' });
      form(c).get('name').setValue('Team A');
      form(c).get('lead_contact_id').setValue('c-lead-a');
      form(c).get('member_contact_ids').setValue(['c-m1']);
      c.save();
      expect(teamService.createTeam).toHaveBeenCalledWith({
        id: undefined,
        name: 'Team A',
        lead_contact_id: 'c-lead-a',
        member_contact_ids: ['c-m1'],
      });
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('strips the chosen lead from the member list defensively', () => {
      teamService.createTeam.mockReturnValue(of({ id: 'team-1', message: 'ok' }));
      const c = build({ mode: 'create' });
      form(c).get('name').setValue('Team A');
      form(c).get('lead_contact_id').setValue('c-lead-a');
      form(c).get('member_contact_ids').setValue(['c-lead-a', 'c-m1']);
      c.save();
      expect(teamService.createTeam).toHaveBeenCalledWith(
        expect.objectContaining({ member_contact_ids: ['c-m1'] }),
      );
    });

    it('blocks an invalid form without calling the service', () => {
      const c = build({ mode: 'create' });
      form(c).get('name').setValue('');
      c.save();
      expect(teamService.createTeam).not.toHaveBeenCalled();
    });

    it('ignores double submits while in flight', () => {
      teamService.createTeam.mockReturnValue(new Subject());
      const c = build({ mode: 'create' });
      form(c).get('name').setValue('Team A');
      form(c).get('lead_contact_id').setValue('c-lead-a');
      c.save();
      c.save();
      expect(teamService.createTeam).toHaveBeenCalledTimes(1);
    });

    it('surfaces the server one-team-max message on a 400', () => {
      teamService.createTeam.mockReturnValue(
        throwError(() => ({
          error: { message: 'Contact(s) already assigned to another team: c-m1' },
        })),
      );
      const c = build({ mode: 'create' });
      form(c).get('name').setValue('Team A');
      form(c).get('lead_contact_id').setValue('c-lead-a');
      c.save();
      expect(priv(c).hasError).toBe(true);
      expect(priv(c).errorMessage).toBe(
        'Contact(s) already assigned to another team: c-m1',
      );
      expect(priv(c).submitting).toBe(false);
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('falls back to a generic message when the error has no server text', () => {
      teamService.createTeam.mockReturnValue(throwError(() => new Error('x')));
      const c = build({ mode: 'create' });
      form(c).get('name').setValue('Team A');
      form(c).get('lead_contact_id').setValue('c-lead-a');
      c.save();
      expect(priv(c).errorMessage).toBe('Failed to save the team. Please try again.');
    });
  });

  describe('edit', () => {
    it('prefills the form and updates', () => {
      teamService.updateTeam.mockReturnValue(of(otherTeam));
      const c = build({ mode: 'edit', team: otherTeam, teams: [otherTeam] });
      expect(form(c).get('name').value).toBe('Other');
      expect(form(c).get('lead_contact_id').value).toBe('c-lead-b');
      expect(form(c).get('member_contact_ids').value).toEqual(['c-m2']);
      c.save();
      expect(teamService.updateTeam).toHaveBeenCalledWith({
        id: 'team-other',
        name: 'Other',
        lead_contact_id: 'c-lead-b',
        member_contact_ids: ['c-m2'],
      });
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });
  });

  describe('delete', () => {
    it('deletes by id and closes with true', () => {
      teamService.deleteTeam.mockReturnValue(of({ id: 'team-other', message: 'ok' }));
      const c = build({ mode: 'delete', team: otherTeam });
      c.confirmDelete();
      expect(teamService.deleteTeam).toHaveBeenCalledWith('team-other');
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('closes without a call when there is no id', () => {
      const c = build({ mode: 'delete', team: {} });
      c.confirmDelete();
      expect(teamService.deleteTeam).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });

    it('shows an error on delete failure', () => {
      teamService.deleteTeam.mockReturnValue(throwError(() => new Error('x')));
      const c = build({ mode: 'delete', team: otherTeam });
      c.confirmDelete();
      expect(priv(c).hasError).toBe(true);
      expect(priv(c).submitting).toBe(false);
    });

    it('ignores a second delete while one is in flight', () => {
      teamService.deleteTeam.mockReturnValue(new Subject());
      const c = build({ mode: 'delete', team: otherTeam });
      c.confirmDelete();
      c.confirmDelete();
      expect(teamService.deleteTeam).toHaveBeenCalledTimes(1);
    });
  });

  it('displayName trims missing name parts', () => {
    const c = build({ mode: 'create' });
    expect(c.displayName({ first_name: 'Solo' } as Contact)).toBe('Solo');
    expect(c.displayName({} as Contact)).toBe('');
  });

  it('cancel closes with no result; blocked while submitting', () => {
    const c = build({ mode: 'create' });
    c.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
    dialogRef.close.mockClear();
    priv(c).submitting = true;
    c.cancel();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});
