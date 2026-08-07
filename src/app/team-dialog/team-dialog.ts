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
import {UserGroup} from '../enums/user-group.enum';

export type TeamDialogMode = 'create' | 'edit' | 'delete';

export interface TeamDialogData {
  mode: TeamDialogMode;
  team?: Team;
  /** Every existing team — used to disable already-assigned picker options. */
  teams: Team[];
  /** Contact summaries (id/name/user_group) backing the lead/member pickers. */
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
  /** Contact ids on OTHER teams (lead or member) — one team max per person. */
  private assignedElsewhere = new Set<string>();

  ngOnInit(): void {
    this.mode = this.data.mode;
    const team: Team = this.data.team ?? {};
    for (const other of this.data.teams ?? []) {
      if (team.id && other.id === team.id) continue;
      if (other.lead_contact_id) this.assignedElsewhere.add(other.lead_contact_id);
      for (const id of other.member_contact_ids ?? []) this.assignedElsewhere.add(id);
    }
    this.teamForm = this.formBuilder.group({
      id: [team.id ?? null],
      name: [team.name ?? '', Validators.required],
      lead_contact_id: [team.lead_contact_id ?? null, Validators.required],
      member_contact_ids: [team.member_contact_ids ?? []],
    });
  }

  /** Lead Tutor contacts for the lead picker. */
  get leadOptions(): Contact[] {
    return this.data.contacts.filter(c => c.user_group === UserGroup.LEAD_TUTORS);
  }

  /** Plain tutor contacts for the members picker. */
  get memberOptions(): Contact[] {
    return this.data.contacts.filter(c => c.user_group === UserGroup.TUTORS);
  }

  /** Disables picker options already assigned to a different team. */
  isAssignedElsewhere(contactId: string | undefined): boolean {
    return !!contactId && this.assignedElsewhere.has(contactId);
  }

  displayName(contact: Contact): string {
    return `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim();
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
        // Surface the server's one-team-max message when present — it names
        // the conflicting contact ids.
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
