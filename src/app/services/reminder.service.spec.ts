import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ReminderService } from './reminder.service';
import { Reminder } from '../models/reminder.model';
import { environment } from '../../environments/environment';

const base = environment.btctutoringServiceUrl;

describe('ReminderService', () => {
  let service: ReminderService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReminderService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('gets reminders', () => {
    service.getReminders().subscribe();
    const req = httpMock.expectOne(`${base}/reminders`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('creates a reminder', () => {
    const reminder = { title: 'Call John' } as Reminder;
    service.createReminder(reminder).subscribe();
    const req = httpMock.expectOne(`${base}/reminders`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe(reminder);
    req.flush({ id: 'rem-1', message: 'ok' });
  });

  it('updates a reminder', () => {
    const reminder = { id: 'rem-1', title: 'Call John' } as Reminder;
    service.updateReminder(reminder).subscribe();
    const req = httpMock.expectOne(`${base}/reminders`);
    expect(req.request.method).toBe('PUT');
    req.flush(reminder);
  });

  it('completes and reopens a reminder via the dedicated routes', () => {
    service.completeReminder('rem-1').subscribe();
    const complete = httpMock.expectOne(`${base}/reminders/rem-1/complete`);
    expect(complete.request.method).toBe('POST');
    expect(complete.request.body).toEqual({});
    complete.flush({ id: 'rem-1', message: 'ok' });

    service.uncompleteReminder('rem-1').subscribe();
    const reopen = httpMock.expectOne(`${base}/reminders/rem-1/uncomplete`);
    expect(reopen.request.method).toBe('POST');
    reopen.flush({ id: 'rem-1', message: 'ok' });
  });

  it('deletes a reminder', () => {
    service.deleteReminder('rem-1').subscribe();
    const req = httpMock.expectOne(`${base}/reminders/rem-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ id: 'rem-1', message: 'ok' });
  });
});
