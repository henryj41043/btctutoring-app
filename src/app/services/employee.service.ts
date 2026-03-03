import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {Employee} from '../models/employee.model';
import {Response} from '../models/response.model';

@Injectable({
  providedIn: 'root'
})
export class EmployeeService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);

  getAllEmployees(): Observable<Employee[]> {
    return this.httpClient.get<Employee[]>(`${this.baseUrl}/employees`);
  }

  getEmployee(id: string): Observable<Employee> {
    let params = new HttpParams().set('id', id);
    return this.httpClient.get<Employee>(`${this.baseUrl}/employees`, {params: params});
  }

  createEmployee(employee: Employee): Observable<Response> {
    return this.httpClient.post<Response>(`${this.baseUrl}/employees`, employee);
  }

  updateEmployee(employee: Employee): Observable<Employee> {
    return this.httpClient.put<Employee>(`${this.baseUrl}/employees`, employee);
  }

  deleteEmployee(id: string): Observable<Response> {
    return this.httpClient.delete<Response>(`${this.baseUrl}/employees/${id}`);
  }

  adminCreateUser(email: string, group: string): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/auth/user`, {
      email: email,
      group: group,
    });
  }

  adminDeleteUser(id: string): Observable<any> {
    return this.httpClient.delete(`${this.baseUrl}/auth/user/${id}`);
  }
}
