import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, NEVER, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { FamilyView } from './family-view';
import { ContactService } from '../services/contact.service';
import { ScheduleService } from '../services/schedule.service';
import { FamilyStudent, FamilyView as Family } from '../models/family-view.model';

describe('FamilyView', () => {
  const contactService = { getFamily: jest.fn() };
  const scheduleService = { formatTime12: (t: string) => `${t}*` };
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const student = (over: Partial<FamilyStudent> = {}): FamilyStudent => ({
    id: 'st-1',
    name: 'Charlotte',
    status: 'Active Student',
    package: 'Succeed',
    assigned_tutor_id: 't-1',
    tutor_name: 'Karrie Tillotson',
    schedule: [{ weekday: 'TUESDAY', start_time: '16:00', end_time: '16:45' }],
    make_up_available: 45,
    make_up_pending: 30,
    make_up_never_expire: false,
    ...over,
  });
  const family = (over: Partial<Family> = {}): Family => ({
    id: 'fam-1',
    first_name: 'Brenda',
    last_name: 'Deming',
    email: 'brenda@example.com',
    phone_number: '555-0100',
    address_line1: '1 Main St',
    address_line2: '',
    city: 'Media',
    state: 'PA',
    zip: '19063',
    students: [student()],
    ...over,
  });

  const build = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [FamilyView],
      providers: [
        provideRouter([]),
        { provide: ContactService, useValue: contactService },
        { provide: ScheduleService, useValue: scheduleService },
        { provide: ActivatedRoute, useValue: { paramMap: params } },
      ],
    });
    const fixture = TestBed.createComponent(FamilyView);
    fixture.detectChanges();
    return fixture;
  };
  const text = (fixture: ReturnType<typeof build>) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    contactService.getFamily.mockReset();
    params = new BehaviorSubject(convertToParamMap({ id: 'fam-1' }));
  });

  it('loads the family from the route and shows the parent and the student', () => {
    contactService.getFamily.mockReturnValue(of(family()));
    const fixture = build();
    expect(contactService.getFamily).toHaveBeenCalledWith('fam-1');
    const page = text(fixture);
    expect(page).toContain('Brenda Deming');
    expect(page).toContain('brenda@example.com');
    expect(page).toContain('555-0100');
    expect(page).toContain('1 Main St');
    expect(page).toContain('Media, PA 19063');
    expect(page).toContain('Charlotte');
    expect(page).toContain('Karrie Tillotson');
    expect(page).toContain('Tue 16:00* to 16:45*');
    expect(page).toContain('45 min available, 30 min booked');
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect(links).toContain('mailto:brenda@example.com');
    expect(links).toContain('tel:555-0100');
  });

  it('reloads when the route changes to another family', () => {
    contactService.getFamily.mockReturnValue(of(family()));
    build();
    params.next(convertToParamMap({ id: 'fam-2' }));
    expect(contactService.getFamily).toHaveBeenLastCalledWith('fam-2');
    params.next(convertToParamMap({}));
    expect(contactService.getFamily).toHaveBeenLastCalledWith('');
  });

  it('says what is missing instead of blank lines', () => {
    contactService.getFamily.mockReturnValue(of(family({
      first_name: '', last_name: '', email: '', phone_number: '',
      address_line1: '', city: '', state: '', zip: '',
      students: [student({ name: '', package: '', tutor_name: undefined, schedule: [], make_up_pending: 0, make_up_never_expire: true })],
    })));
    const page = text(build());
    expect(page).toContain('Parent / guardian');
    expect(page).toContain('No email on file');
    expect(page).toContain('No phone on file');
    expect(page).toContain('No address on file');
    expect(page).toContain('Unnamed student');
    expect(page).toContain('No weekly schedule yet.');
    expect(page).toContain('45 min available');
    expect(page).not.toContain('booked');
    expect(page).toContain('(never expires)');
  });

  it('shows a city line from whatever parts are set', () => {
    contactService.getFamily.mockReturnValue(of(family({ address_line1: '', address_line2: 'Unit 4', city: '', state: 'PA', zip: '' })));
    const page = text(build());
    expect(page).toContain('Unit 4');
    expect(page).toContain('PA');
  });

  it("names the other tutor on a slot that is not the primary tutor's", () => {
    contactService.getFamily.mockReturnValue(of(family({
      students: [student({
        schedule: [
          { weekday: 'MONDAY', start_time: '10:00', end_time: '10:30', tutor_id: 't-2', tutor_name: 'Kelly Holmes' },
          { weekday: 'FRIDAY', start_time: '11:00', end_time: '11:30', tutor_id: 't-3' },
          { weekday: 'WEDNESDAY', start_time: '12:00', end_time: '12:30', tutor_id: 't-1' },
          { weekday: 'ODD', start_time: '1', end_time: '2' },
        ],
      })],
    })));
    const page = text(build());
    expect(page).toContain('Mon 10:00* to 10:30* with Kelly Holmes');
    expect(page).toContain('Fri 11:00* to 11:30* with another tutor');
    expect(page).toContain('Wed 12:00* to 12:30*');
    expect(page).not.toContain('Wed 12:00* to 12:30* with');
    expect(page).toContain('ODD 1* to 2*');
  });

  it.each([
    [403, 'This family has no student on your roster.'],
    [404, 'This family could not be found.'],
    [500, 'The family could not be loaded. Please try again.'],
  ])('explains a %s', (status, message) => {
    contactService.getFamily.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    expect(text(build())).toContain(message);
  });

  it('shows the spinner while loading', () => {
    contactService.getFamily.mockReturnValue(NEVER);
    expect(text(build())).toContain('Loading family');
  });
});
