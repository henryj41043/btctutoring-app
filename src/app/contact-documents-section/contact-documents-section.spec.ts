import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { ContactDocumentsSection, PendingUpload } from './contact-documents-section';
import { DocumentService } from '../services/document.service';
import { AuthService } from '../services/auth.service';
import { ContactDocument, UploadProgress } from '../models/contact-document.model';
import * as saveUrl from '../utils/save-url';

jest.mock('../utils/save-url', () => ({ saveFromUrl: jest.fn() }));

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const pdf: ContactDocument = {
  id: 'd-1',
  file_name: 'resume.pdf',
  content_type: 'application/pdf',
  size: 1468006,
  uploaded_by: 'abby',
  uploaded_at: '2026-09-20T15:00:00.000Z',
};
const word: ContactDocument = { id: 'd-2', file_name: 'letter.docx', content_type: DOCX, size: 2048 };

interface Internals {
  visible: boolean;
  loading: boolean;
  loadFailed: boolean;
  documents: ContactDocument[];
  uploads: PendingUpload[];
  pendingDeleteId: string | null;
  busyId: string | null;
  actionError: string | null;
}

describe('ContactDocumentsSection', () => {
  let isAdmin: boolean;
  const documentService = {
    getDocumentsForContact: jest.fn(),
    getUrl: jest.fn(),
    deleteDocument: jest.fn(),
    upload: jest.fn(),
  };
  let fixture: ComponentFixture<ContactDocumentsSection>;
  let component: ContactDocumentsSection;
  let open: jest.SpyInstance;
  const click = new Event('click');

  const build = (): Internals => {
    TestBed.configureTestingModule({
      imports: [ContactDocumentsSection],
      providers: [
        { provide: DocumentService, useValue: documentService },
        { provide: AuthService, useValue: { isAdmin: () => isAdmin } },
      ],
    });
    fixture = TestBed.createComponent(ContactDocumentsSection);
    fixture.componentRef.setInput('contactId', 'c-1');
    component = fixture.componentInstance;
    fixture.detectChanges();
    return component as unknown as Internals;
  };

  const render = (): HTMLElement => {
    fixture.detectChanges();
    return fixture.nativeElement;
  };

  const pick = (...files: File[]): HTMLInputElement => {
    const input = { files, value: 'C:\\fakepath\\x' } as unknown as HTMLInputElement;
    component.onFilesPicked({ target: input } as unknown as Event);
    return input;
  };

  const fileOf = (name: string, size = 10): File => {
    const file = new File(['x'], name);
    Object.defineProperty(file, 'size', { value: size });
    return file;
  };

  beforeEach(() => {
    isAdmin = true;
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    open = jest.spyOn(window, 'open').mockImplementation(() => null);
    documentService.getDocumentsForContact.mockReturnValue(of([pdf, word]));
    documentService.getUrl.mockReturnValue(of({ url: 'https://signed' }));
    documentService.deleteDocument.mockReturnValue(of({}));
  });

  afterEach(() => jest.restoreAllMocks());

  describe('loading', () => {
    it('shows the documents of the contact to an admin', () => {
      const c = build();
      expect(documentService.getDocumentsForContact).toHaveBeenCalledWith('c-1');
      expect(c).toMatchObject({ visible: true, loading: false, loadFailed: false, documents: [pdf, word] });
      const el = render();
      expect(fixture.nativeElement.style.display).toBe('');
      const rows = Array.from(el.querySelectorAll('.document-row'));
      expect(rows).toHaveLength(2);
      expect(rows[0].querySelector('.document-name')?.textContent).toBe('resume.pdf');
      expect(rows[0].querySelector('.document-icon')?.textContent).toBe('picture_as_pdf');
      expect(rows[0].querySelector('.document-meta')?.textContent?.replace(/\s+/g, ' ').trim())
        .toBe('1.4 MB · Sep 20, 2026 · abby');
      expect(rows[1].querySelector('.document-meta')?.textContent?.replace(/\s+/g, ' ').trim())
        .toBe('2 KB ·');
      expect(el.querySelector('.documents-empty')).toBeNull();
      expect(el.querySelector('input[type=file]')?.getAttribute('accept')).toBe('.pdf,.jpg,.jpeg,.png,.doc,.docx');
    });

    it('is hidden and loads nothing for anyone else', () => {
      isAdmin = false;
      const c = build();
      expect(documentService.getDocumentsForContact).not.toHaveBeenCalled();
      expect(c.visible).toBe(false);
      expect(fixture.nativeElement.style.display).toBe('none');
    });

    it('stays visible with a note when there is nothing yet', () => {
      documentService.getDocumentsForContact.mockReturnValue(of([]));
      build();
      const el = render();
      expect(fixture.nativeElement.style.display).toBe('');
      expect(el.querySelector('.documents-empty')?.textContent).toBe('No documents yet.');
      expect(el.querySelector('.document-list')).toBeNull();
    });

    it('shows a spinner while loading', () => {
      documentService.getDocumentsForContact.mockReturnValue(new Subject());
      const c = build();
      expect(c.loading).toBe(true);
      expect(render().querySelector('mat-spinner')).not.toBeNull();
    });

    it('says so when the list cannot be loaded', () => {
      documentService.getDocumentsForContact.mockReturnValue(throwError(() => new Error('boom')));
      const c = build();
      expect(c).toMatchObject({ loading: false, loadFailed: true, documents: [] });
      expect(render().querySelector('.documents-error')?.textContent)
        .toBe('The documents could not be loaded. Reload the page to try again.');
    });
  });

  describe('uploading', () => {
    it('sends each file with its type and shows the progress', () => {
      const progress = new Subject<UploadProgress>();
      documentService.upload.mockReturnValue(progress);
      const c = build();
      const file = fileOf('CV.DOCX');
      const input = pick(file);
      expect(input.value).toBe('');
      expect(documentService.upload).toHaveBeenCalledWith('c-1', file, DOCX);
      expect(c.uploads).toEqual([{ key: 1, name: 'CV.DOCX', percent: 0 }]);

      progress.next({ percent: 45 });
      expect(c.uploads).toEqual([{ key: 1, name: 'CV.DOCX', percent: 45 }]);
      const el = render();
      expect(el.querySelector('.upload-name')?.textContent).toBe('CV.DOCX');
      expect(el.querySelector('.upload-percent')?.textContent).toBe('45%');
      expect(el.querySelector('mat-progress-bar')).not.toBeNull();

      const stored: ContactDocument = { id: 'd-9', file_name: 'CV.DOCX' };
      progress.next({ percent: 100, document: stored });
      expect(c.uploads).toEqual([]);
      expect(c.documents).toEqual([stored, pdf, word]);
      expect(render().querySelectorAll('.document-row')).toHaveLength(3);
    });

    it('tracks several files apart', () => {
      const first = new Subject<UploadProgress>();
      const second = new Subject<UploadProgress>();
      documentService.upload.mockReturnValueOnce(first).mockReturnValueOnce(second);
      const c = build();
      pick(fileOf('a.pdf'), fileOf('b.png'));
      second.next({ percent: 30 });
      expect(c.uploads).toEqual([
        { key: 1, name: 'a.pdf', percent: 0 },
        { key: 2, name: 'b.png', percent: 30 },
      ]);
      first.next({ percent: 100, document: { id: 'a' } });
      expect(c.uploads).toEqual([{ key: 2, name: 'b.png', percent: 30 }]);
    });

    it.each([
      ['notes.zip', 10, 'Only PDF, Word (.doc, .docx), JPG and PNG files can be uploaded.'],
      ['big.pdf', 15 * 1024 * 1024 + 1, 'The file is larger than 15 MB.'],
    ])('refuses %s without calling the service', (name, size, message) => {
      const c = build();
      pick(fileOf(name, size));
      expect(documentService.upload).not.toHaveBeenCalled();
      expect(c.uploads).toEqual([{ key: 1, name, percent: 0, error: message }]);
      const el = render();
      expect(el.querySelector('.upload-error')?.textContent).toBe(message);
      expect(el.querySelector('.upload-row')?.classList.contains('upload-row--failed')).toBe(true);
      expect(el.querySelector('mat-progress-bar')).toBeNull();
    });

    it('shows the reason the service gives for a refusal', () => {
      documentService.upload.mockReturnValue(throwError(() => new HttpErrorResponse({
        status: 400,
        error: { message: 'The file received does not match the upload request.' },
      })));
      const c = build();
      pick(fileOf('a.pdf'));
      expect(c.uploads[0].error).toBe('The file received does not match the upload request.');
    });

    it.each([
      ['a server error', new HttpErrorResponse({ status: 500, error: { message: 'Internal' } })],
      ['a refusal without a reason', new HttpErrorResponse({ status: 400, error: {} })],
      ['a refusal with a list of reasons', new HttpErrorResponse({ status: 400, error: { message: ['a', 'b'] } })],
      ['an empty reason', new HttpErrorResponse({ status: 400, error: { message: '' } })],
      ['no answer at all', new HttpErrorResponse({ status: 0, error: null })],
      ['an unknown failure', undefined as unknown as HttpErrorResponse],
    ])('shows a plain message for %s', (_what, error) => {
      documentService.upload.mockReturnValue(throwError(() => error));
      const c = build();
      pick(fileOf('a.pdf'));
      expect(c.uploads[0].error).toBe('The upload failed. Please try again.');
      expect(c.documents).toEqual([pdf, word]);
    });

    it('dismisses a failed upload', () => {
      const c = build();
      pick(fileOf('a.zip'), fileOf('b.zip'));
      component.dismissUpload(c.uploads[0]);
      expect(c.uploads.map(u => u.name)).toEqual(['b.zip']);
    });

    it('copes with a picker that holds no files', () => {
      const c = build();
      component.onFilesPicked({ target: { value: '' } } as unknown as Event);
      expect(c.uploads).toEqual([]);
    });

    it('opens the file picker from the button', () => {
      build();
      const el = render();
      const input = el.querySelector('input[type=file]') as HTMLInputElement;
      const pickerClick = jest.spyOn(input, 'click').mockImplementation(() => undefined);
      (el.querySelector('.upload-button') as HTMLButtonElement).click();
      expect(pickerClick).toHaveBeenCalled();
    });
  });

  describe('opening', () => {
    it('shows a PDF in a new tab', () => {
      const c = build();
      component.open(pdf);
      expect(documentService.getUrl).toHaveBeenCalledWith('d-1', 'view');
      expect(open).toHaveBeenCalledWith('https://signed', '_blank');
      expect(saveUrl.saveFromUrl).not.toHaveBeenCalled();
      expect(c.busyId).toBeNull();
    });

    it('downloads a Word file', () => {
      build();
      component.open(word);
      expect(documentService.getUrl).toHaveBeenCalledWith('d-2', 'download');
      expect(saveUrl.saveFromUrl).toHaveBeenCalledWith('https://signed');
      expect(open).not.toHaveBeenCalled();
    });

    it('downloads a PDF from the download button, without opening the row', () => {
      build();
      const stop = jest.spyOn(click, 'stopPropagation');
      component.download(pdf, click);
      expect(stop).toHaveBeenCalled();
      expect(documentService.getUrl).toHaveBeenCalledWith('d-1', 'download');
      expect(saveUrl.saveFromUrl).toHaveBeenCalledWith('https://signed');
    });

    it('marks the row busy while the link is fetched and ignores other clicks', () => {
      const link = new Subject<{ url: string }>();
      documentService.getUrl.mockReturnValue(link);
      const c = build();
      c.actionError = 'old';
      component.open(pdf);
      expect(c.busyId).toBe('d-1');
      expect(c.actionError).toBeNull();
      component.open(word);
      expect(documentService.getUrl).toHaveBeenCalledTimes(1);
      link.next({ url: 'https://signed' });
      expect(c.busyId).toBeNull();
    });

    it('does nothing for a document without an id', () => {
      build();
      component.open({ file_name: 'x.pdf', content_type: 'application/pdf' });
      expect(documentService.getUrl).not.toHaveBeenCalled();
    });

    it('says so when the link cannot be fetched', () => {
      documentService.getUrl.mockReturnValue(throwError(() => new Error('boom')));
      const c = build();
      component.open(pdf);
      expect(c.busyId).toBeNull();
      expect(c.actionError).toBe('The document could not be opened. Please try again.');
      expect(open).not.toHaveBeenCalled();
      expect(render().querySelector('.documents-error')?.textContent)
        .toBe('The document could not be opened. Please try again.');
    });

    it('opens from a click on the row', () => {
      build();
      (render().querySelector('.document-open') as HTMLButtonElement).click();
      expect(documentService.getUrl).toHaveBeenCalledWith('d-1', 'view');
    });
  });

  describe('deleting', () => {
    it('asks first, then deletes and removes the row', () => {
      const c = build();
      const stop = jest.spyOn(click, 'stopPropagation');
      c.actionError = 'old';
      component.askDelete(pdf, click);
      expect(stop).toHaveBeenCalled();
      expect(c.pendingDeleteId).toBe('d-1');
      expect(c.actionError).toBeNull();
      expect(documentService.deleteDocument).not.toHaveBeenCalled();
      expect(render().querySelector('.confirm-delete')?.textContent).toContain('Delete resume.pdf?');

      component.confirmDelete(pdf);
      expect(documentService.deleteDocument).toHaveBeenCalledWith('d-1');
      expect(c).toMatchObject({ pendingDeleteId: null, busyId: null, documents: [word] });
      expect(render().querySelectorAll('.document-row')).toHaveLength(1);
    });

    it('can be cancelled', () => {
      const c = build();
      component.askDelete(pdf, click);
      component.cancelDelete();
      expect(c.pendingDeleteId).toBeNull();
      expect(documentService.deleteDocument).not.toHaveBeenCalled();
      expect(render().querySelector('.confirm-delete')).toBeNull();
    });

    it('shows a spinner on the row while deleting and ignores a second delete', () => {
      documentService.deleteDocument.mockReturnValue(new Subject());
      const c = build();
      component.askDelete(pdf, click);
      component.confirmDelete(pdf);
      expect(c.busyId).toBe('d-1');
      expect(c.pendingDeleteId).toBeNull();
      component.confirmDelete(word);
      expect(documentService.deleteDocument).toHaveBeenCalledTimes(1);
      expect(render().querySelector('.document-row mat-spinner')).not.toBeNull();
    });

    it('keeps the row and says so when the delete fails', () => {
      documentService.deleteDocument.mockReturnValue(throwError(() => new Error('boom')));
      const c = build();
      component.confirmDelete(pdf);
      expect(c).toMatchObject({
        busyId: null,
        documents: [pdf, word],
        actionError: 'The document could not be deleted. Please try again.',
      });
    });

    it('does nothing for a document without an id', () => {
      const c = build();
      component.askDelete({ file_name: 'x' }, click);
      expect(c.pendingDeleteId).toBeNull();
      component.confirmDelete({ file_name: 'x' });
      expect(documentService.deleteDocument).not.toHaveBeenCalled();
    });
  });

  describe('malware scan', () => {
    const scanning: ContactDocument = { ...pdf, id: 'd-3', scan_status: 'scanning' };
    const clean: ContactDocument = { ...scanning, scan_status: 'clean' };

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('keeps a document closed while it is checked, then opens it up by itself', () => {
      documentService.getDocumentsForContact
        .mockReturnValueOnce(of([scanning, word]))
        .mockReturnValueOnce(of([scanning, word]))
        .mockReturnValue(of([clean, word]));
      const c = build();
      let row = render().querySelector('.document-row') as HTMLElement;
      expect(row.querySelector('.document-scan')?.textContent).toBe('Checking for malware…');
      expect((row.querySelector('.document-open') as HTMLButtonElement).disabled).toBe(true);
      expect(row.querySelector('mat-spinner')).not.toBeNull();
      expect(row.querySelector('[aria-label="Download document"]')).toBeNull();
      expect(row.querySelector('[aria-label="Delete document"]')).not.toBeNull();
      expect(row.classList).not.toContain('document-row--blocked');
      component.open(scanning);
      component.download(scanning, click);
      expect(documentService.getUrl).not.toHaveBeenCalled();

      jest.advanceTimersByTime(3999);
      expect(documentService.getDocumentsForContact).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1);
      expect(documentService.getDocumentsForContact).toHaveBeenCalledTimes(2);
      expect(documentService.getDocumentsForContact).toHaveBeenLastCalledWith('c-1');
      jest.advanceTimersByTime(4000);
      expect(documentService.getDocumentsForContact).toHaveBeenCalledTimes(3);
      expect(c.documents).toEqual([clean, word]);

      row = render().querySelector('.document-row') as HTMLElement;
      expect(row.querySelector('.document-scan')).toBeNull();
      expect((row.querySelector('.document-open') as HTMLButtonElement).disabled).toBe(false);
      expect(row.querySelector('[aria-label="Download document"]')).not.toBeNull();
      // Nothing left to wait for: the re-reads stop.
      jest.advanceTimersByTime(60000);
      expect(documentService.getDocumentsForContact).toHaveBeenCalledTimes(3);
    });

    it('does not re-read when nothing is being checked', () => {
      build();
      jest.advanceTimersByTime(60000);
      expect(documentService.getDocumentsForContact).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['infected', 'Blocked: the malware scan found a threat'],
      ['unscanned', 'Could not be checked for malware. Delete it and upload it again.'],
    ] as const)('shows a document that is %s as blocked, with delete only', (scan_status, note) => {
      documentService.getDocumentsForContact.mockReturnValue(of([{ ...pdf, scan_status }]));
      build();
      const row = render().querySelector('.document-row') as HTMLElement;
      expect(row.classList).toContain('document-row--blocked');
      expect(row.querySelector('.document-scan')?.textContent).toBe(note);
      expect((row.querySelector('.document-open') as HTMLButtonElement).disabled).toBe(true);
      expect(row.querySelector('mat-spinner')).toBeNull();
      expect(row.querySelector('[aria-label="Download document"]')).toBeNull();
      expect(row.querySelector('[aria-label="Delete document"]')).not.toBeNull();
      jest.advanceTimersByTime(60000);
      expect(documentService.getDocumentsForContact).toHaveBeenCalledTimes(1);
    });

    it('keeps trying after a failed re-read, and keeps the list', () => {
      documentService.getDocumentsForContact
        .mockReturnValueOnce(of([scanning]))
        .mockReturnValueOnce(throwError(() => new Error('boom')))
        .mockReturnValue(of([clean]));
      const c = build();
      jest.advanceTimersByTime(4000);
      expect(c.documents).toEqual([scanning]);
      expect(c.loadFailed).toBe(false);
      jest.advanceTimersByTime(4000);
      expect(c.documents).toEqual([clean]);
    });

    it('stops after three minutes of waiting', () => {
      documentService.getDocumentsForContact.mockReturnValue(of([scanning]));
      build();
      jest.advanceTimersByTime(4000 * 60);
      expect(documentService.getDocumentsForContact).toHaveBeenCalledTimes(46);
    });

    it('starts watching again after an upload, with a fresh three minutes', () => {
      documentService.getDocumentsForContact.mockReturnValue(of([scanning]));
      const progress = new Subject<UploadProgress>();
      documentService.upload.mockReturnValue(progress);
      const c = build();
      jest.advanceTimersByTime(4000 * 60);
      expect(documentService.getDocumentsForContact).toHaveBeenCalledTimes(46);
      pick(fileOf('new.pdf'));
      progress.next({ percent: 100, document: { ...scanning, id: 'd-4' } });
      expect(c.documents.map(document => document.id)).toEqual(['d-4', 'd-3']);
      jest.advanceTimersByTime(4000);
      expect(documentService.getDocumentsForContact).toHaveBeenCalledTimes(47);
      jest.advanceTimersByTime(4000 * 60);
      expect(documentService.getDocumentsForContact).toHaveBeenCalledTimes(91);
    });

    it('runs one re-read at a time when uploads finish close together', () => {
      documentService.getDocumentsForContact.mockReturnValueOnce(of([]))
        .mockReturnValue(of([clean]));
      const progress = new Subject<UploadProgress>();
      documentService.upload.mockReturnValue(progress);
      build();
      pick(fileOf('a.pdf'), fileOf('b.pdf'));
      progress.next({ percent: 100, document: scanning });
      jest.advanceTimersByTime(4000);
      expect(documentService.getDocumentsForContact).toHaveBeenCalledTimes(2);
    });

    it('shows the reason the service gives when a document is refused', () => {
      documentService.getUrl.mockReturnValue(throwError(() => new HttpErrorResponse({
        status: 400,
        error: { message: 'This file is still being checked for malware. Try again in a moment.' },
      })));
      const c = build();
      component.open(pdf);
      expect(c.actionError).toBe('This file is still being checked for malware. Try again in a moment.');
    });

    it('stops re-reading when the page is left', () => {
      documentService.getDocumentsForContact.mockReturnValue(of([scanning]));
      build();
      fixture.destroy();
      jest.advanceTimersByTime(60000);
      expect(documentService.getDocumentsForContact).toHaveBeenCalledTimes(1);
    });
  });
});
