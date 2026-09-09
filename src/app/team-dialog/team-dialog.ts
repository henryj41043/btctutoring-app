import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {catchError, EMPTY, Observable} from 'rxjs';
import {TeamService} from '../services/team.service';
import {Team} from '../models/team.model';
import {Contact} from '../models/contact.model';
import {contactDisplayName} from '../utils/contact-name';
import {UserGroup} from '../enums/user-group.enum';
import {Service} from '../enums/service.enum';
import {StaffStatus} from '../enums/staff-status.enum';

export type TeamDialogMode = 'create' | 'edit' | 'delete';

export interface TeamDialogData {
  mode: TeamDialogMode;
  team?: Team;
  /** Every existing team — used to disable already-assigned picker options. */
  teams: Team[];
  /** Contact summaries (id/name/user_group/service/status) backing the lead/member pickers. */
  contacts: Contact[];
}

@Component({
  selector: 'app-team-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './team-dialog.html',
  styleUrl: './team-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class TeamDialog implements OnInit {
  private dialogRef: MatDialogRef<TeamDialog> = inject(MatDialogRef);
  protected data: TeamDialogData = inject<TeamDialogData>(MAT_DIALOG_DATA);
  private formBuilder: FormBuilder = inject(FormBuilder);
  private teamService: TeamService = inject(TeamService);

  protected mode: TeamDialogMode = 'create';
  protected teamForm!: FormGroup;
  protected submitting: boolean = false;
  protected hasError: boolean = false;
  protected errorMessage: string = '';
  /** Contact ids that LEAD another team — a lead heads at most one team. */
  private leadsElsewhere = new Set<string>();

  ngOnInit(): void {
    this.mode = this.data.mode;
    const team: Team = this.data.team ?? {};
    for (const other of this.data.teams ?? []) {
      if (team.id && other.id === team.id) continue;
      if (other.lead_contact_id) this.leadsElsewhere.add(other.lead_contact_id);
    }
    this.teamForm = this.formBuilder.group({
      id: [team.id ?? null],
      name: [team.name ?? '', Validators.required],
      lead_contact_id: [team.lead_contact_id ?? null, Validators.required],
      member_contact_ids: [team.member_contact_ids ?? []],
    });
  }

  /**
   * Current staff only: the Tutors/LeadTutors account group is also carried
   * by Employment Inquiry applicants and former staff (it's set whenever a
   * user profile was ever created), which flooded the pickers with names
   * that can't be on a team. A contact already on THIS team stays listed
   * even after lapsing so it renders and can be removed — never silently dropped.
   */
  private isCurrentStaff(contact: Contact): boolean {
    return contact.service === Service.HIRING && contact.status === StaffStatus.ACTIVE_STAFF;
  }

  /** Active Lead Tutor contacts (plus this team's current lead) for the lead picker. */
  get leadOptions(): Contact[] {
    const currentLead = this.data.team?.lead_contact_id;
    return this.data.contacts.filter(c =>
      c.user_group === UserGroup.LEAD_TUTORS && (this.isCurrentStaff(c) || c.id === currentLead));
  }

  /**
   * Members picker: active tutors AND active Lead Tutors (nested teams — a
   * lead listed as a member brings their whole team into this lead's view),
   * plus this team's current members. The team's own lead is never offered
   * as a member. Membership is not exclusive: a contact may be on several
   * teams, so nothing here is disabled for being "assigned elsewhere".
   */
  get memberOptions(): Contact[] {
    const currentMembers = new Set(this.data.team?.member_contact_ids ?? []);
    const selectedLead: string | null = this.teamForm?.get('lead_contact_id')?.value ?? null;
    return this.data.contacts.filter(c =>
      (c.user_group === UserGroup.TUTORS || c.user_group === UserGroup.LEAD_TUTORS)
      && c.id !== selectedLead
      && (this.isCurrentStaff(c) || currentMembers.has(c.id ?? '')));
  }

  /** Disables lead-picker options that already head a different team (a lead heads at most one). */
  isAssignedElsewhere(contactId: string | undefined): boolean {
    return !!contactId && this.leadsElsewhere.has(contactId);
  }

  displayName(contact: Contact): string {
    return contactDisplayName(contact);
  }

  cancel(): void {
    if (this.submitting) {
      return;
    }
    this.dialogRef.close();
  }

  save(): void {
    if (this.submitting) {
      return;
    }
    if (this.teamForm.invalid) {
      this.teamForm.markAllAsTouched();
      return;
    }
    const raw = this.teamForm.getRawValue();
    const team: Team = {
      id: raw.id ?? undefined,
      name: raw.name,
      lead_contact_id: raw.lead_contact_id,
      // The lead can never be a member; strip defensively before saving.
      member_contact_ids: (raw.member_contact_ids ?? [])
        .filter((id: string) => id !== raw.lead_contact_id),
    };
    this.submitting = true;
    this.hasError = false;
    const request$: Observable<unknown> = this.mode === 'create'
      ? this.teamService.createTeam(team)
      : this.teamService.updateTeam(team);
    request$.pipe(
      catchError(error => {
        console.log(error);
        // Surface the server's validation message when present (e.g. the
        // chosen lead already heads another team).
        const serverMessage = typeof error?.error?.message === 'string'
          ? error.error.message
          : undefined;
        this.fail(serverMessage ?? 'Failed to save the team. Please try again.');
        return EMPTY;
      }),
    ).subscribe(() => this.dialogRef.close(true));
  }

  confirmDelete(): void {
    if (this.submitting) {
      return;
    }
    const id = this.data.team?.id;
    if (!id) {
      this.dialogRef.close();
      return;
    }
    this.submitting = true;
    this.hasError = false;
    this.teamService.deleteTeam(id).pipe(
      catchError(error => {
        console.log(error);
        this.fail('Failed to delete the team. Please try again.');
        return EMPTY;
      }),
    ).subscribe(() => this.dialogRef.close(true));
  }

  private fail(message: string): void {
    this.errorMessage = message;
    this.hasError = true;
    this.submitting = false;
  }
}
