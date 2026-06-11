import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { NoteService } from './note.service';
import { Note } from '../models/note.model';
import { environment } from '../../environments/environment';

const base = environment.btctutoringServiceUrl;

describe('NoteService', () => {
  let service: NoteService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(NoteService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getNote sets the id param', () => {
    service.getNote('n-1').subscribe();
    httpMock.expectOne(`${base}/notes?id=n-1`).flush({});
  });

  it('getNotesByAuthor sets the author param', () => {
    service.getNotesByAuthor('tutor@example.com').subscribe();
    httpMock.expectOne(`${base}/notes?author=tutor@example.com`).flush([]);
  });

  it('getNotesByRecipient sets the recipient param', () => {
    service.getNotesByRecipient('stu-1').subscribe();
    httpMock.expectOne(`${base}/notes?recipient=stu-1`).flush([]);
  });

  it('getNotes GETs /notes', () => {
    service.getNotes().subscribe();
    httpMock.expectOne(`${base}/notes`).flush([]);
  });

  it('createNote POSTs to /notes', () => {
    const note = { id: 'n-1' } as Note;
    service.createNote(note).subscribe();
    const req = httpMock.expectOne(`${base}/notes`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(note);
    req.flush({ message: 'ok' });
  });

  it('updateNote PUTs to /notes', () => {
    const note = { id: 'n-1' } as Note;
    service.updateNote(note).subscribe();
    const req = httpMock.expectOne(`${base}/notes`);
    expect(req.request.method).toBe('PUT');
    req.flush(note);
  });

  it('deleteNote DELETEs by id', () => {
    service.deleteNote('n-1').subscribe();
    const req = httpMock.expectOne(`${base}/notes/n-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'ok' });
  });
});
