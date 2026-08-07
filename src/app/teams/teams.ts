import {DestroyRef, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatDialog} from '@angular/material/dialog';
import {catchError, forkJoin, of} from 'rxjs';
import {TeamService} from '../services/team.service';
import {ContactService} from '../services/contact.service';
import {Team} from '../models/team.model';
import {Contact} from '../models/contact.model';
import {TeamDialog, TeamDialogMode} from '../team-dialog/team-dialog';

/**
 * Admin-only Teams page: each team pairs one Lead Tutor with tutor members.
 * Leads get read-only visibility into their team's sessions on the calendar
 * and sessions page.
 */
@Component({
  selector: 'app-teams',
  imports: [
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSortModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './teams.html',
  styleUrl: './teams.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class Teams implements OnInit {
  private teamService: TeamService = inject(TeamService);
  private contactService: ContactService = inject(ContactService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  // Cancels in-flight HTTP work when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);
  private dialog: MatDialog = inject(MatDialog);

  @ViewChild(MatSort) set matSort(sort: MatSort) {
    if (sort) { this.dataSource.sort = sort; }
  }
  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) { this.dataSource.paginator = paginator; }
  }

  protected columns: string[] = ['name', 'lead', 'members', 'actions'];
  protected dataSource = new MatTableDataSource<Team>([]);
  protected loading: boolean = true;
  private teams: Team[] = [];
  private contacts: Contact[] = [];
  private contactNamesById = new Map<string, string>();

  ngOnInit(): void {
    this.dataSource.filterPredicate = (team, filter) => {
      const haystack = [team.name, this.leadName(team), this.memberNames(team)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(filter);
    };
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.cdr.markForCheck();
    forkJoin({
      teams: this.teamService.getTeams()
        .pipe(catchError(error => { console.log(error); return of([] as Team[]); })),
      // Lean cached summary — names + user_group are all the pickers need.
      contacts: this.contactService.getContactsSummary()
        .pipe(catchError(error => { console.log(error); return of([] as Contact[]); })),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({teams, contacts}) => {
      this.teams = teams;
      this.contacts = contacts;
      this.contactNamesById = new Map(contacts
        .filter(c => !!c.id)
        .map(c => [c.id!, `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()]));
      this.dataSource.data = [...teams]
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  applyFilter(value: string): void {
    this.dataSource.filter = value.trim().toLowerCase();
    this.dataSource.paginator?.firstPage();
  }

  leadName(team: Team): string {
    if (!team.lead_contact_id) return '—';
    return this.contactNamesById.get(team.lead_contact_id) ?? '—';
  }

  memberNames(team: Team): string {
    const names = (team.member_contact_ids ?? [])
      .map(id => this.contactNamesById.get(id))
      .filter((name): name is string => !!name);
    return names.join(', ') || '—';
  }

  memberCount(team: Team): number {
    return (team.member_contact_ids ?? []).length;
  }

  openCreateDialog(): void {
    this.openDialog('create');
  }

  openEditDialog(team: Team): void {
    this.openDialog('edit', team);
  }

  openDeleteDialog(team: Team, event: Event): void {
    event.stopPropagation();
    this.openDialog('delete', team);
  }

  private openDialog(mode: TeamDialogMode, team?: Team): void {
    const ref = this.dialog.open(TeamDialog, {
      data: {mode, team, teams: this.teams, contacts: this.contacts},
      width: '440px',
    });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.load();
      }
    });
  }
}
