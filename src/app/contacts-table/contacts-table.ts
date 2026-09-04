import {staffStatusLabel} from '../enums/staff-status.enum';
import {contactStatusChipClass} from '../utils/status-chip';
import {normalizeParentStatus} from '../utils/legacy-status';
import {Service} from '../enums/service.enum';
import {DestroyRef, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatDialog} from '@angular/material/dialog';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatTooltipModule} from '@angular/material/tooltip';
import {catchError, EMPTY, from, mergeMap, of, toArray} from 'rxjs';
import {ContactDialog} from '../contact-dialog/contact-dialog';
import {DeleteContactDialog} from '../delete-contact-dialog/delete-contact-dialog';
import {BatchNoteDialog} from '../batch-note-dialog/batch-note-dialog';
import {NoteService} from '../services/note.service';
import {Note} from '../models/note.model';
import {AuthService} from '../services/auth.service';
import {Contact} from '../models/contact.model';
import {UserGroup} from '../enums/user-group.enum';
import {ContactService} from '../services/contact.service';
import {Response} from '../models/response.model';
import {Router} from '@angular/router';
import {PhonePipe} from '../pipes/phone.pipe';
import {TableStateStore} from '../utils/table-state';

@Component({
  selector: 'app-contacts-table',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    PhonePipe,
  ],
  templateUrl: './contacts-table.html',
  styleUrl: './contacts-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true
})
export class ContactsTable implements OnInit {
  readonly contactDialog: MatDialog = inject(MatDialog);
  private snackBar: MatSnackBar = inject(MatSnackBar);
  private contactService: ContactService = inject(ContactService);
  private noteService: NoteService = inject(NoteService);
  private authService: AuthService = inject(AuthService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  // Cancels in-flight HTTP work when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);
  private router: Router = inject(Router);

  // Setter form: the table is inside an @if, so sort/paginator only exist
  // once loading finishes.
  // Restores the admin's place (page/sort/filters) after navigating away.
  private readonly viewState = new TableStateStore('btc-contacts-view');
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

  contactColumns: string[] = ['first_name', 'last_name', 'email', 'phone_number', 'service', 'status', 'actions'];
  dataSource = new MatTableDataSource<Contact>([]);
  protected readonly statusChipClass = contactStatusChipClass;
  protected readonly serviceOptions: string[] = Object.values(Service);
  /** Display labels across both status families (parent + staff), deduped. */
  protected readonly statusOptions: string[] = [
    'Active Client', 'Former Client', 'MIA', 'Declined Services',
    'Active Staff', 'Former Staff', 'Onboarding',
    'Inquiry submitted', 'Declined offer', 'BTC not Pursuing',
  ];
  protected serviceFilter: string[] = [];
  protected statusFilter: string[] = [];
  /** '' = everyone, 'yes' = scholarship families only, 'no' = the rest. */
  protected scholarshipFilter: '' | 'yes' | 'no' = '';
  private filterText: string = '';
  /** Survives navigation within the tab (matches the roster-filter precedent). */
  private static readonly FILTER_STORAGE_KEY = 'btc-contacts-filters';

  /** Display status: parent contacts map legacy pre-v3 values to their
   *  ParentStatus equivalents; staff labels go through staffStatusLabel. */
  protected statusLabel(contact: Contact): string {
    const status = contact.service === Service.TUTORING
      ? normalizeParentStatus(contact.status)
      : contact.status;
    return staffStatusLabel(status);
  }
  loading: boolean = true;

  ngOnInit(): void {
    // Text search + service/status selects combine (all must match). The
    // predicate reads component state; dataSource.filter only re-triggers it.
    this.dataSource.filterPredicate = (contact) => {
      if (this.serviceFilter.length && !this.serviceFilter.includes(contact.service ?? '')) {
        return false;
      }
      // Status matches on the DISPLAY label so legacy parent values and the
      // 'Staff'→'Active Staff' label behave the way the chips read.
      if (this.statusFilter.length && !this.statusFilter.includes(this.statusLabel(contact))) {
        return false;
      }
      if (this.scholarshipFilter === 'yes' && !contact.scholarship_student) {
        return false;
      }
      if (this.scholarshipFilter === 'no' && contact.scholarship_student) {
        return false;
      }
      if (!this.filterText) {
        return true;
      }
      const haystack = [
        contact.first_name, contact.last_name, contact.email,
        contact.phone_number, contact.service,
        contact.status, this.statusLabel(contact),
      ].join(' ').toLowerCase();
      return haystack.includes(this.filterText);
    };
    this.restoreFilters();
    this.updateClientData();
  }

  applyFilter(value: string): void {
    this.filterText = value.trim().toLowerCase();
    this.refilter();
  }

  onServiceFilterChange(selected: string[]): void {
    this.serviceFilter = selected;
    this.refilter();
  }

  onStatusFilterChange(selected: string[]): void {
    this.statusFilter = selected;
    this.refilter();
  }

  onScholarshipFilterChange(selected: '' | 'yes' | 'no'): void {
    this.scholarshipFilter = selected;
    this.refilter();
  }

  /** Re-runs the predicate (the filter string only needs to change) and
   *  persists the criteria for the session. */
  private refilter(): void {
    this.dataSource.filter = JSON.stringify({
      text: this.filterText, services: this.serviceFilter, statuses: this.statusFilter,
      scholarship: this.scholarshipFilter,
    });
    this.dataSource.paginator?.firstPage();
    try {
      sessionStorage.setItem(ContactsTable.FILTER_STORAGE_KEY, this.dataSource.filter);
    } catch { /* storage unavailable — filters just don't persist */ }
  }

  private restoreFilters(): void {
    try {
      const saved = sessionStorage.getItem(ContactsTable.FILTER_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as {
        text?: string; services?: string[]; statuses?: string[]; scholarship?: '' | 'yes' | 'no';
      };
      this.filterText = parsed.text ?? '';
      this.serviceFilter = parsed.services ?? [];
      this.statusFilter = parsed.statuses ?? [];
      this.scholarshipFilter = parsed.scholarship === 'yes' || parsed.scholarship === 'no'
        ? parsed.scholarship
        : '';
      if (this.filterText || this.serviceFilter.length || this.statusFilter.length || this.scholarshipFilter) {
        this.dataSource.filter = saved;
      }
    } catch { /* corrupt/unavailable storage — start unfiltered */ }
  }

  /** The restored search text, for the input's initial value. */
  protected get searchText(): string {
    return this.filterText;
  }

  private updateClientData(): void {
    if (!this.authService.isAdmin()) {
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }
    // Summary projection + stale-while-revalidate: a cached copy (if any)
    // arrives synchronously so revisits skip the spinner; the fresh response
    // follows and updates the rows in place.
    this.contactService.getContactsSummary().pipe(
      takeUntilDestroyed(this.destroyRef),
      catchError(error => {
        console.log(error);
        this.loading = false;
        this.cdr.markForCheck();
        return EMPTY;
      })
    ).subscribe(response => {
      this.dataSource.data = response as Contact[];
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  /**
   * Copies the currently filtered rows' emails to the clipboard — deduped,
   * blanks skipped, comma-separated so it pastes straight into To/BCC.
   * (Deliberately not a mailto: link — hundreds of recipients exceed mailto
   * URL limits, and web-Gmail users often have no mailto handler.)
   */
  protected copyFilteredEmails(): void {
    const rows = this.dataSource.filteredData;
    const seen = new Set<string>();
    const emails: string[] = [];
    let missing = 0;
    let excluded = 0;
    for (const contact of rows) {
      // Flagged contacts opt out of bulk email (their choice, not a data gap
      // — reported separately from the missing-email count).
      if (contact.exclude_bulk_email) {
        excluded++;
        continue;
      }
      const email = contact.email?.trim();
      if (!email) {
        missing++;
        continue;
      }
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      emails.push(email);
    }
    if (emails.length === 0) {
      this.snackBar.open('No emails to copy in the current view.', undefined, {duration: 4000});
      return;
    }
    const suffixParts: string[] = [];
    if (missing > 0) {
      suffixParts.push(`${missing} contact${missing === 1 ? '' : 's'} without an email`);
    }
    if (excluded > 0) {
      suffixParts.push(`${excluded} excluded from bulk email`);
    }
    const missingSuffix = suffixParts.length > 0 ? ` (${suffixParts.join('; ')})` : '';
    navigator.clipboard.writeText(emails.join(', ')).then(
      () => this.snackBar.open(
        `${emails.length} email${emails.length === 1 ? '' : 's'} copied${missingSuffix}`,
        undefined, {duration: 4000}),
      () => this.snackBar.open('Could not copy to the clipboard.', undefined, {duration: 4000}),
    );
  }

  /**
   * One note, attached to EVERY currently-filtered contact (all pages, same
   * semantics as Copy Emails). The dialog collects the message and shows the
   * recipient count as the confirmation; creates run 5-at-a-time so a big
   * filter set doesn't land hundreds of concurrent requests, per-contact
   * failures are counted rather than rolled back, and the summary lands in
   * a snackbar.
   */
  protected openBatchNoteDialog(): void {
    const recipients = this.dataSource.filteredData;
    if (recipients.length === 0) {
      this.snackBar.open('No contacts in the current view.', undefined, {duration: 4000});
      return;
    }
    const ref = this.contactDialog.open(BatchNoteDialog, {
      data: {count: recipients.length},
      width: '440px',
    });
    ref.afterClosed().subscribe((message: string | null) => {
      if (message) {
        this.createNoteForContacts(message, recipients);
      }
    });
  }

  private createNoteForContacts(message: string, recipients: Contact[]): void {
    const author = this.authService.contact().first_name;
    const authorId = this.authService.contact().id;
    const dateString = new Date().toISOString();
    from(recipients).pipe(
      mergeMap(contact => {
        const note: Note = {
          message,
          date_time: dateString,
          author,
          author_id: authorId,
          recipient: contact.first_name,
          recipient_id: contact.id,
          type: '',
        };
        return this.noteService.createNote(note).pipe(
          catchError(error => {
            console.log(error);
            return of(null); // counted as a failure below, never aborts the batch
          }),
        );
      }, 5),
      toArray(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(results => {
      const failed = results.filter(r => r === null).length;
      const created = results.length - failed;
      const failedSuffix = failed > 0 ? ` (${failed} failed)` : '';
      this.snackBar.open(
        `Note added to ${created} contact${created === 1 ? '' : 's'}${failedSuffix}`,
        undefined, {duration: 5000});
    });
  }

  protected openContactDialog(): void {
    const contactDialogRef = this.contactDialog.open(ContactDialog, {
      maxWidth: '80vw',
      width: 'auto',
      maxHeight: '80vh',
      height: 'auto',
    });
    contactDialogRef.afterClosed().subscribe((response: Response) => {
      if (response) {
        void this.router.navigate([`/contacts`, response.id]);
      }
    });
  }

  protected contactClicked(contact: Contact): void {
    void this.router.navigate([`/contacts`, contact.id]);
  }

  protected openDeleteDialog(contact: Contact): void {
    const ref = this.contactDialog.open(DeleteContactDialog, {
      data: contact,
      width: '420px',
    });
    ref.afterClosed().subscribe((deleted: boolean) => {
      if (deleted) {
        this.dataSource.data = this.dataSource.data.filter(c => c.id !== contact.id);
        this.cdr.markForCheck();
      }
    });
  }
}
