import {computed, inject, Injectable, Signal, signal, WritableSignal} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {catchError, Observable} from 'rxjs';
import {environment} from '../../environments/environment';
import {User} from '../models/user.model';
import {Router} from '@angular/router';
import {Contact} from '../models/contact.model';
import {ContactService} from './contact.service';
import {UserGroup} from '../enums/user-group.enum';

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
    contact: '',
  });
  private _contact: WritableSignal<Contact> = signal(new Contact());
  private _hasError: WritableSignal<boolean> = signal(false);
  readonly loggedIn: Signal<boolean> = this._loggedIn.asReadonly();
  readonly user: Signal<User> = this._user.asReadonly();
  readonly contact: Signal<Contact> = this._contact.asReadonly();
  readonly hasError: Signal<boolean> = this._hasError.asReadonly();
  readonly resetPassword: Signal<boolean> = this._resetPassword.asReadonly();
  /** True when the logged-in user belongs to the Admins group.
   *  Admins access overrides Tutors even if both groups are present. */
  readonly isAdmin = computed(() => this._user().groups.includes(UserGroup.ADMINS));
  httpClient: HttpClient = inject(HttpClient);
  contactService: ContactService = inject(ContactService);
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
        this._user.set(response as User);
        this.getContact();
      });
  }

  private getContact(): void {
    this.contactService.getContact(this.user().contact)
      .pipe(
        catchError((error: any): any => {
          console.log(error);
          this._hasError.set(true);
        })
      )
      .subscribe((response: any): void => {
        console.log(response);
        this._hasError.set(false);
        if(this.resetPassword()) {
          this._resetPassword.set(false);
          sessionStorage.setItem('sessionToken', '');
        }
        this._loggedIn.set(true);
        this._contact.set(response[0] as Contact);
        void this.router.navigate(['/calendar']);
      });
  }

  /** Change the password for the logged-in user (access token sent by the interceptor). */
  changePassword(previousPassword: string, proposedPassword: string): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/auth/change-password`, {
      previousPassword,
      proposedPassword,
    });
  }

  /** Start the forgot-password flow — Cognito emails a reset code. */
  forgotPassword(email: string): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/auth/forgot-password`, { email });
  }

  /** Complete the forgot-password flow with the emailed code and a new password. */
  confirmForgotPassword(email: string, code: string, newPassword: string): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/auth/confirm-forgot-password`, {
      email,
      code,
      newPassword,
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
        contact: '',
      });
      this._contact.set(new Contact());
      this._loggedIn.set(false);
      void this.router.navigate(['/login']);
    }
  }
}
