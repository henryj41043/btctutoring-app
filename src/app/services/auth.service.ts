import {computed, inject, Injectable, Signal, signal, WritableSignal} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {catchError, finalize, map, Observable, of, shareReplay, switchMap, tap} from 'rxjs';
import {environment} from '../../environments/environment';
import {User} from '../models/user.model';
import {Router} from '@angular/router';
import {Contact} from '../models/contact.model';
import {ContactService} from './contact.service';
import {UserGroup} from '../enums/user-group.enum';
import {jwtExpiresWithin} from '../utils/jwt';

/** Refresh when the access token has less than this long to live. */
const REFRESH_LEAD_SECONDS = 90;

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
  /** True for Lead Tutors — tutors with read-only team session visibility. */
  readonly isLead = computed(() =>
    this._user().groups.includes(UserGroup.LEAD_TUTORS));
  /** Tutors and Lead Tutors — every tutor self-access path accepts both. */
  readonly isTutorLike = computed(() =>
    this._user().groups.includes(UserGroup.TUTORS) ||
    this._user().groups.includes(UserGroup.LEAD_TUTORS));
  httpClient: HttpClient = inject(HttpClient);
  contactService: ContactService = inject(ContactService);
  router: Router = inject(Router);

  // One in-flight refresh at a time: concurrent requests hitting the expiry
  // window all wait on the same exchange instead of racing Cognito.
  private refreshInFlight$: Observable<boolean> | null = null;

  login(email: string, password: string): void {
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
        this.storeTokens(response);
        this.finishLogin();
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
            this.storeTokens(response);
            this.finishLogin();
          }
        });
    }
  }

  /** Access + id tokens, plus the refresh token when Cognito issued one
   *  (a refresh response carries none — the existing one stays valid). */
  private storeTokens(result: {AccessToken?: string; IdToken?: string; RefreshToken?: string}): void {
    sessionStorage.setItem('accessToken', result.AccessToken ?? '');
    sessionStorage.setItem('idToken', result.IdToken ?? '');
    if (result.RefreshToken) {
      sessionStorage.setItem('refreshToken', result.RefreshToken);
    }
  }

  /** Login path: load the identity, then land on the calendar. */
  private finishLogin(): void {
    this.loadIdentity().subscribe(ok => {
      if (ok) {
        void this.router.navigate(['/calendar']);
      }
    });
  }

  /**
   * GET /auth → the contact record → logged in. Shared by login and session
   * restore; emits true once the user is usable, false (with hasError set)
   * otherwise. A user whose contact record is missing can't use the app —
   * surfaced as an error instead of logging in with an id-less contact.
   */
  private loadIdentity(): Observable<boolean> {
    return this.httpClient.get(`${this.baseUrl}/auth`).pipe(
      tap((response: any) => {
        this._user.set(response as User);
        // The Cognito username is what the refresh exchange's secret hash
        // must be computed against — keep it alongside the tokens.
        sessionStorage.setItem('username', (response as User).username ?? '');
      }),
      switchMap(() => this.contactService.getContact(this.user().contact)),
      map((response: any): boolean => {
        this._hasError.set(false);
        if(this.resetPassword()) {
          this._resetPassword.set(false);
          sessionStorage.setItem('sessionToken', '');
        }
        const contact = (response as Contact[])[0];
        if (!contact?.id) {
          this._hasError.set(true);
          return false;
        }
        this._loggedIn.set(true);
        this._contact.set(contact);
        return true;
      }),
      catchError((error: any) => {
        console.log(error);
        this._hasError.set(true);
        return of(false);
      }),
    );
  }

  // ── Session persistence ──────────────────────────────────────────────────

  /** True when this tab holds tokens that could still be exchanged. */
  hasStoredSession(): boolean {
    return !!sessionStorage.getItem('refreshToken') && !!sessionStorage.getItem('username');
  }

  /** True when the access token is missing/expiring and a refresh is possible. */
  needsRefresh(): boolean {
    return this.hasStoredSession()
      && jwtExpiresWithin(sessionStorage.getItem('accessToken'), REFRESH_LEAD_SECONDS);
  }

  /**
   * Exchanges the stored refresh token for fresh access/id tokens. Emits
   * true on success; on failure the refresh token is discarded (so nothing
   * retries a dead exchange) and false is emitted. Concurrent callers share
   * one exchange.
   */
  refreshSession(): Observable<boolean> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }
    const refreshToken = sessionStorage.getItem('refreshToken');
    const username = sessionStorage.getItem('username');
    if (!refreshToken || !username) {
      return of(false);
    }
    this.refreshInFlight$ = this.httpClient
      .post(`${this.baseUrl}/auth/refresh`, {username, refreshToken})
      .pipe(
        map((response: any): boolean => {
          if (!response?.AccessToken) {
            this.dropRefreshToken();
            return false;
          }
          this.storeTokens(response);
          return true;
        }),
        catchError((error: any) => {
          console.log(error);
          this.dropRefreshToken();
          return of(false);
        }),
        finalize(() => (this.refreshInFlight$ = null)),
        shareReplay(1),
      );
    return this.refreshInFlight$;
  }

  private dropRefreshToken(): void {
    sessionStorage.setItem('refreshToken', '');
  }

  /**
   * Rebuilds the in-memory login from this tab's stored tokens (a page
   * reload wipes the signals but not sessionStorage). Refreshes first when
   * the access token is stale; emits true when the user is usable again.
   */
  restoreSession(): Observable<boolean> {
    if (this.loggedIn()) {
      return of(true);
    }
    if (!this.hasStoredSession()) {
      return of(false);
    }
    const ready$ = this.needsRefresh() ? this.refreshSession() : of(true);
    return ready$.pipe(
      switchMap(ok => (ok ? this.loadIdentity() : of(false))),
    );
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
      this.clearStoredSession();
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

  private clearStoredSession(): void {
    sessionStorage.setItem('accessToken', '');
    sessionStorage.setItem('idToken', '');
    sessionStorage.setItem('refreshToken', '');
    sessionStorage.setItem('username', '');
  }
}
