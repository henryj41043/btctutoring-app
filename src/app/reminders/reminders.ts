import {DestroyRef, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatTooltipModule} from '@angular/material/tooltip';
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
import {TableStateStore} from '../utils/table-state';
import {contactDisplayName} from '../utils/contact-name';

/**
 * Admin-only Reminders page: dated reminders emailed to chosen admins the
 * morning of. Defaults to all uncompleted reminders (overdue stays visible);
 * "Show completed" reveals finished ones.
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
    MatCheckboxModule,
    MatTooltipModule,
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
  // Cancels in-flight HTTP work when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);
  private dialog: MatDialog = inject(MatDialog);
  private router: Router = inject(Router);

  // Restores the admin's place (page/sort/filters) after navigating away.
  private readonly viewState = new TableStateStore('btc-reminders-view');
  @ViewChild(MatSort) set matSort(sort: MatSort) {
    if (sort) {
      this.viewState.attachSort(sort);
      this.dataSource.sort = sort;
    }
  }
  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) {
      this.viewState.attachPaginator(paginator);
      this.dataSource.paginator = paginator;
    }
  }

  protected columns: string[] = ['done', 'date', 'due_date', 'title', 'message', 'recipients', 'created_by', 'contact', 'sent', 'actions'];
  protected dataSource = new MatTableDataSource<Reminder>([]);
  protected loading: boolean = true;
  protected showCompleted: boolean = false;
  protected admins: Contact[] = [];
  private contacts: Contact[] = [];
  private allReminders: Reminder[] = [];
  private adminNamesById = new Map<string, string>();
  private contactNamesById = new Map<string, string>();
  private filterText: string = '';

  ngOnInit(): void {
    const saved = this.viewState.load();
    if (saved.filter) {
      this.filterText = saved.filter;
      this.dataSource.filter = saved.filter;
    }
    if (typeof saved.extra?.['showCompleted'] === 'boolean') {
      this.showCompleted = saved.extra['showCompleted'];
    }
    this.dataSource.filterPredicate = (reminder, filter) => {
      const haystack = [reminder.title, reminder.message, this.recipientNames(reminder), this.contactName(reminder), this.createdByName(reminder)]
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
      // Lean cached summary - recipient/contact names never need full records.
      contacts: this.contactService.getContactsSummary()
        .pipe(catchError(error => { console.log(error); return of([] as Contact[]); })),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({reminders, contacts}) => {
      this.contacts = contacts;
      this.admins = contacts.filter(c => c.user_group === UserGroup.ADMINS);
      // Name-less (newsletter) contacts fall back to their email address.
      this.adminNamesById = new Map(this.admins
        .filter(a => !!a.id)
        .map(a => [a.id!, contactDisplayName(a)]));
      this.contactNamesById = new Map(contacts
        .filter(c => !!c.id)
        .map(c => [c.id!, contactDisplayName(c)]));
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

  private applyView(): void {
    // Outstanding-first: overdue uncompleted reminders stay visible so
    // nothing un-actioned ever silently ages out.
    const visible = this.showCompleted
      ? this.allReminders
      : this.allReminders.filter(r => !r.completed_at);
    this.dataSource.data = [...visible].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  }

  onShowCompletedChange(showCompleted: boolean): void {
    this.showCompleted = showCompleted;
    this.applyView();
    this.viewState.patch({extra: {showCompleted}});
    this.cdr.markForCheck();
  }

  /** Done checkbox: one-time toggles complete/reopen; recurring rows always
   *  complete (their date jump to the next occurrence is the feedback). */
  onToggleComplete(reminder: Reminder): void {
    const request$ = reminder.completed_at
      ? this.reminderService.uncompleteReminder(reminder.id!)
      : this.reminderService.completeReminder(reminder.id!);
    request$.pipe(
      catchError(error => { console.log(error); return EMPTY; }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.reload());
  }

  /** The creating admin's display name, or empty when unset/unknown. */
  createdByName(reminder: Reminder): string {
    if (!reminder.created_by) {
      return '';
    }
    return this.adminNamesById.get(reminder.created_by) ?? '';
  }

  applyFilter(value: string): void {
    this.filterText = value.trim().toLowerCase();
    this.dataSource.filter = this.filterText;
    this.dataSource.paginator?.firstPage();
    this.viewState.patch({filter: this.filterText});
  }

  /** The restored search text, for the input's initial value. */
  protected get searchText(): string {
    return this.filterText;
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
