import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
import {DatePipe} from '@angular/common';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatDialog} from '@angular/material/dialog';
import {Router} from '@angular/router';
import {catchError, EMPTY, forkJoin, of} from 'rxjs';
import {ReminderService} from '../services/reminder.service';
import {ContactService} from '../services/contact.service';
import {Reminder} from '../models/reminder.model';
import {Contact} from '../models/contact.model';
import {UserGroup} from '../enums/user-group.enum';
import {ReminderDialog, ReminderDialogMode} from '../reminder-dialog/reminder-dialog';

/**
 * Admin-only Reminders page: dated reminders emailed to chosen admins the
 * morning of. Defaults to upcoming reminders; "Show past" reveals fired ones.
 */
@Component({
  selector: 'app-reminders',
  imports: [
    DatePipe,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatSortModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './reminders.html',
  styleUrl: './reminders.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class Reminders implements OnInit {
  private reminderService: ReminderService = inject(ReminderService);
  private contactService: ContactService = inject(ContactService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private dialog: MatDialog = inject(MatDialog);
  private router: Router = inject(Router);

  @ViewChild(MatSort) set matSort(sort: MatSort) {
    if (sort) { this.dataSource.sort = sort; }
  }
  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) { this.dataSource.paginator = paginator; }
  }

  protected columns: string[] = ['date', 'title', 'message', 'recipients', 'contact', 'sent', 'actions'];
  protected dataSource = new MatTableDataSource<Reminder>([]);
  protected loading: boolean = true;
  protected showPast: boolean = false;
  protected admins: Contact[] = [];
  private contacts: Contact[] = [];
  private allReminders: Reminder[] = [];
  private adminNamesById = new Map<string, string>();
  private contactNamesById = new Map<string, string>();
  private filterText: string = '';

  ngOnInit(): void {
    this.dataSource.filterPredicate = (reminder, filter) => {
      const haystack = [reminder.title, reminder.message, this.recipientNames(reminder), this.contactName(reminder)]
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
      reminders: this.reminderService.getReminders()
        .pipe(catchError(error => { console.log(error); return of([] as Reminder[]); })),
      contacts: this.contactService.getContacts()
        .pipe(catchError(error => { console.log(error); return of([] as Contact[]); })),
    }).subscribe(({reminders, contacts}) => {
      this.contacts = contacts;
      this.admins = contacts.filter(c => c.user_group === UserGroup.ADMINS);
      this.adminNamesById = new Map(this.admins
        .filter(a => !!a.id)
        .map(a => [a.id!, `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim()]));
      this.contactNamesById = new Map(contacts
        .filter(c => !!c.id)
        .map(c => [c.id!, `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()]));
      this.allReminders = reminders;
      this.applyView();
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  /** Reloads after a dialog-driven change. */
  private reload(): void {
    this.load();
  }

  /** Today's local wall date 'YYYY-MM-DD' for the upcoming/past split. */
  private today(): string {
    const now = new Date();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    return `${now.getFullYear()}-${m}-${d}`;
  }

  private applyView(): void {
    const today = this.today();
    const visible = this.showPast
      ? this.allReminders
      : this.allReminders.filter(r => (r.date ?? '') >= today);
    this.dataSource.data = [...visible].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  }

  onShowPastChange(showPast: boolean): void {
    this.showPast = showPast;
    this.applyView();
    this.cdr.markForCheck();
  }

  applyFilter(value: string): void {
    this.filterText = value.trim().toLowerCase();
    this.dataSource.filter = this.filterText;
    this.dataSource.paginator?.firstPage();
  }

  recipientNames(reminder: Reminder): string {
    if (reminder.all_admins) {
      return 'All admins';
    }
    const names = (reminder.recipient_ids ?? [])
      .map(id => this.adminNamesById.get(id))
      .filter((name): name is string => !!name);
    return names.join(', ') || '—';
  }

  /** The linked contact's display name, or empty when unlinked/unknown. */
  contactName(reminder: Reminder): string {
    if (!reminder.contact_id) {
      return '';
    }
    return this.contactNamesById.get(reminder.contact_id) ?? '';
  }

  openLinkedContact(reminder: Reminder, event: Event): void {
    event.stopPropagation();
    if (reminder.contact_id) {
      void this.router.navigate(['/contacts', reminder.contact_id]);
    }
  }

  openCreateDialog(): void {
    this.openDialog('create');
  }

  openEditDialog(reminder: Reminder): void {
    this.openDialog('edit', reminder);
  }

  openDeleteDialog(reminder: Reminder, event: Event): void {
    event.stopPropagation();
    this.openDialog('delete', reminder);
  }

  private openDialog(mode: ReminderDialogMode, reminder?: Reminder): void {
    const ref = this.dialog.open(ReminderDialog, {
      data: {mode, reminder, admins: this.admins, contacts: this.contacts},
      width: '440px',
    });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.reload();
      }
    });
  }
}
