import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {Response} from '../models/response.model';
import {Student} from '../models/student.model';

@Injectable({
  providedIn: 'root'
})
export class StudentService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);

  getStudent(id: string): Observable<Student> {
    let params: HttpParams = new HttpParams().set('id', id);
    return this.httpClient.get<Student>(`${this.baseUrl}/students`, { params: params });
  }

  getStudentsByContact(contactId: string): Observable<Student[]> {
    let params: HttpParams = new HttpParams().set('contact', contactId);
    return this.httpClient.get<Student[]>(`${this.baseUrl}/students`, { params: params });
  }

  getStudentsByTutor(tutorId: string): Observable<Student[]> {
    let params: HttpParams = new HttpParams().set('tutor', tutorId);
    return this.httpClient.get<Student[]>(`${this.baseUrl}/students`, { params: params });
  }

  getStudents(): Observable<Student[]> {
    return this.httpClient.get<Student[]>(`${this.baseUrl}/students`);
  }

  createStudent(student: Student): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/students`, student);
  }

  updateStudent(student: Student): Observable<Student> {
    return this.httpClient.put<Student>(`${this.baseUrl}/students`, student);
  }

  deleteStudent(id: string): Observable<Response> {
    return this.httpClient.delete<Response>(`${this.baseUrl}/students/${id}`);
  }
}
