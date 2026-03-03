import {inject, Injectable, Signal, signal, WritableSignal} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {catchError} from 'rxjs';
import {environment} from '../../environments/environment';
import {User} from '../models/user.model';
import {Router} from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  private _loggedIn: WritableSignal<boolean> = signal(false);
  private _resetPassword: WritableSignal<boolean> = signal(false);
  private _user: WritableSignal<User> = signal({
    username: '',
    email: '',
    groups: [],
  });
  private _hasError: WritableSignal<boolean> = signal(false);
  readonly loggedIn: Signal<boolean> = this._loggedIn.asReadonly();
  readonly user: Signal<User> = this._user.asReadonly();
  readonly hasError: Signal<boolean> = this._hasError.asReadonly();
  readonly resetPassword: Signal<boolean> = this._resetPassword.asReadonly();
  httpClient: HttpClient = inject(HttpClient);
  router: Router = inject(Router);

  login(email: string, password: string): void {
    console.log('Attempting login with:', email, password);
    this._hasError.set(false);
    if(this.resetPassword()) {
      this.httpClient.post(`${this.baseUrl}/auth/complete-new-password`, {
        username: email,
        newPassword: password,
        session: sessionStorage.getItem('sessionToken'),
      }).pipe(
        catchError((error: any): any => {
          console.log(error);
          this._hasError.set(true);
        })
      ).subscribe((response: any): void => {
        sessionStorage.setItem('accessToken', response.AccessToken);
        sessionStorage.setItem('idToken', response.IdToken);
        this.getUser();
      });
    } else {
      this.httpClient.post(`${this.baseUrl}/auth/login`, {
        email: email,
        password: password
      })
        .pipe(
          catchError((error: any): any => {
            console.log(error);
            this._hasError.set(true);
          })
        )
        .subscribe((response: any): void => {
          if(response.message === 'NEW_PASSWORD_REQUIRED') {
            sessionStorage.setItem('sessionToken', response.session);
            this._resetPassword.set(true);
          } else {
            sessionStorage.setItem('accessToken', response.AccessToken);
            sessionStorage.setItem('idToken', response.IdToken);
            this.getUser();
          }
        });
    }
  }

  private getUser(): void {
    this.httpClient.get(`${this.baseUrl}/auth`)
      .pipe(
        catchError( (error: any): any => {
          console.log(error);
          this._hasError.set(true);
        })
      )
      .subscribe((response: any): void => {
        this._hasError.set(false);
        if(this.resetPassword()) {
          this._resetPassword.set(false);
          sessionStorage.setItem('sessionToken', '');
        }
        this._loggedIn.set(true);
        this._user.set(response as User);
        this.router.navigate(['/calendar']);
      });
  }

  logout() {
    if(this.loggedIn()) {
      sessionStorage.setItem('accessToken', '');
      sessionStorage.setItem('idToken', '');
      this._hasError.set(false);
      this._user.set({
        username: '',
        email: '',
        groups: [],
      });
      this._loggedIn.set(false);
      this.router.navigate(['/login']);
    }
  }
}
