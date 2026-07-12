import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { StudentService } from './student.service';
import { Student } from '../models/student.model';
import { environment } from '../../environments/environment';

const base = environment.btctutoringServiceUrl;

describe('StudentService', () => {
  let service: StudentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StudentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getStudent sets the id param', () => {
    service.getStudent('s-1').subscribe();
    httpMock.expectOne(`${base}/students?id=s-1`).flush({});
  });

  it('getStudentsByContact sets the contact param', () => {
    service.getStudentsByContact('c-1').subscribe();
    httpMock.expectOne(`${base}/students?contact=c-1`).flush([]);
  });

  it('getStudentsByTutor sets the tutor param', () => {
    service.getStudentsByTutor('tutor@example.com').subscribe();
    httpMock.expectOne(`${base}/students?tutor=tutor@example.com`).flush([]);
  });

  it('getStudents GETs /students', () => {
    service.getStudents().subscribe();
    httpMock.expectOne(`${base}/students`).flush([]);
  });

  it('getOnboardingStudents GETs /students/onboarding', () => {
    service.getOnboardingStudents().subscribe();
    const req = httpMock.expectOne(`${base}/students/onboarding`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createStudent POSTs to /students', () => {
    const student = { id: 's-1' } as Student;
    service.createStudent(student).subscribe();
    const req = httpMock.expectOne(`${base}/students`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(student);
    req.flush({ message: 'ok' });
  });

  it('updateStudent PUTs to /students', () => {
    const student = { id: 's-1' } as Student;
    service.updateStudent(student).subscribe();
    const req = httpMock.expectOne(`${base}/students`);
    expect(req.request.method).toBe('PUT');
    req.flush(student);
  });

  it('deleteStudent DELETEs by id', () => {
    service.deleteStudent('s-1').subscribe();
    const req = httpMock.expectOne(`${base}/students/s-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'ok' });
  });
});
