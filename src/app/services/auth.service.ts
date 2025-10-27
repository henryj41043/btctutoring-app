import {inject, Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'https://bitshiftstudio.io'; // Replace with your actual API base URL
  httpClient: HttpClient = inject(HttpClient);

  login(email: string, password: string): Observable<any> {
    return this.httpClient.post(`${this.apiUrl}/auth/login`, {
      email: email,
      password: password
    });
  }

  getUser(): Observable<any> {
    return this.httpClient.get(`${this.apiUrl}/users/user`);
  }
}
