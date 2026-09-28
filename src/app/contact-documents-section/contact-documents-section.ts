import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, Input, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {HttpErrorResponse} from '@angular/common/http';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {catchError, EMPTY} from 'rxjs';
import {DocumentService} from '../services/document.service';
import {AuthService} from '../services/auth.service';
import {ContactDocument, DocumentUrlMode} from '../models/contact-document.model';
import {formatFileSize} from '../utils/file-size';
import {saveFromUrl} from '../utils/save-url';
import {
  DOCUMENT_ACCEPT,
  documentError,
  documentIcon,
  documentTypeOf,
  opensInBrowser,
} from '../utils/document-rules';

/** One file being sent, or one that could not be. */
export interface PendingUpload {
  key: number;
  name: string;
  percent: number;
  error?: string;
}

const UPLOAD_FAILED = 'The upload failed. Please try again.';

/**
 * The contact page's Documents card: files an admin uploaded to this contact
 * (resumes, forms). Admin-only; hidden from everyone else.
 */
@Component({
  selector: 'app-contact-documents-section',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './contact-documents-section.html',
  styleUrl: './contact-documents-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {'[style.display]': "visible ? null : 'none'"},
})
export class ContactDocumentsSection implements OnInit {
  @Input({required: true}) contactId!: string;

  private documentService: DocumentService = inject(DocumentService);
  private authService: AuthService = inject(AuthService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  // Cancels in-flight reads and uploads when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);

  protected visible: boolean = false;
  protected loading: boolean = true;
  protected loadFailed: boolean = false;
  protected documents: ContactDocument[] = [];
  protected uploads: PendingUpload[] = [];
  /** The document whose "Delete?" question is showing. */
  protected pendingDeleteId: string | null = null;
  /** The document being deleted or opened (its row shows a spinner). */
  protected busyId: string | null = null;
  protected actionError: string | null = null;
  private nextKey: number = 1;

  protected readonly accept = DOCUMENT_ACCEPT;
  protected readonly formatFileSize = formatFileSize;
  protected readonly documentIcon = documentIcon;
  protected readonly opensInBrowser = opensInBrowser;

  ngOnInit(): void {
    if (!this.authService.isAdmin()) {
      return;
    }
    this.visible = true;
    this.load();
  }

  private load(): void {
    this.documentService.getDocumentsForContact(this.contactId).pipe(
      catchError(error => {
        console.log(error);
        this.loading = false;
        this.loadFailed = true;
        this.cdr.markForCheck();
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(documents => {
      this.documents = documents;
      this.loading = false;
      this.loadFailed = false;
      this.cdr.markForCheck();
    });
  }

  /** The file picker's change event: every chosen file is checked, then sent. */
  onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Cleared so picking the same file again fires the event again.
    input.value = '';
    files.forEach(file => this.start(file));
    this.cdr.markForCheck();
  }

  private start(file: File): void {
    const upload: PendingUpload = {key: this.nextKey++, name: file.name, percent: 0};
    this.uploads = [...this.uploads, upload];
    const refused = documentError(file);
    if (refused) {
      this.patch(upload.key, {error: refused});
      return;
    }
    this.documentService.upload(this.contactId, file, documentTypeOf(file.name)!).pipe(
      catchError((error: HttpErrorResponse) => {
        console.log(error);
        this.patch(upload.key, {error: this.messageOf(error)});
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(progress => {
      if (progress.document) {
        this.uploads = this.uploads.filter(item => item.key !== upload.key);
        this.documents = [progress.document, ...this.documents];
        this.cdr.markForCheck();
      } else {
        this.patch(upload.key, {percent: progress.percent});
      }
    });
  }

  /** The service explains a refusal (400); anything else is a plain failure. */
  private messageOf(error: HttpErrorResponse): string {
    const message: unknown = error?.error?.message;
    return error?.status === 400 && typeof message === 'string' && message ? message : UPLOAD_FAILED;
  }

  private patch(key: number, changes: Partial<PendingUpload>): void {
    this.uploads = this.uploads.map(item => item.key === key ? {...item, ...changes} : item);
    this.cdr.markForCheck();
  }

  dismissUpload(upload: PendingUpload): void {
    this.uploads = this.uploads.filter(item => item.key !== upload.key);
    this.cdr.markForCheck();
  }

  /** Click on a row: shown in a new tab when the browser can, else downloaded. */
  open(document: ContactDocument): void {
    this.fetch(document, opensInBrowser(document.content_type) ? 'view' : 'download');
  }

  download(document: ContactDocument, event: Event): void {
    event.stopPropagation();
    this.fetch(document, 'download');
  }

  private fetch(document: ContactDocument, mode: DocumentUrlMode): void {
    if (!document.id || this.busyId) {
      return;
    }
    this.busyId = document.id;
    this.actionError = null;
    this.cdr.markForCheck();
    this.documentService.getUrl(document.id, mode).pipe(
      catchError(error => {
        console.log(error);
        this.busyId = null;
        this.actionError = 'The document could not be opened. Please try again.';
        this.cdr.markForCheck();
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({url}) => {
      this.busyId = null;
      this.cdr.markForCheck();
      if (mode === 'view') {
        window.open(url, '_blank');
      } else {
        saveFromUrl(url);
      }
    });
  }

  askDelete(document: ContactDocument, event: Event): void {
    event.stopPropagation();
    this.pendingDeleteId = document.id ?? null;
    this.actionError = null;
    this.cdr.markForCheck();
  }

  cancelDelete(): void {
    this.pendingDeleteId = null;
    this.cdr.markForCheck();
  }

  confirmDelete(document: ContactDocument): void {
    if (!document.id || this.busyId) {
      return;
    }
    const id = document.id;
    this.busyId = id;
    this.pendingDeleteId = null;
    this.cdr.markForCheck();
    this.documentService.deleteDocument(id).pipe(
      catchError(error => {
        console.log(error);
        this.busyId = null;
        this.actionError = 'The document could not be deleted. Please try again.';
        this.cdr.markForCheck();
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      this.busyId = null;
      this.documents = this.documents.filter(item => item.id !== id);
      this.cdr.markForCheck();
    });
  }
}
