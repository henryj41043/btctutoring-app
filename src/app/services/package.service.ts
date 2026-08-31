import {inject, Injectable} from '@angular/core';
import {environment} from '../../environments/environment';
import {HttpClient} from '@angular/common/http';
import {concat, Observable, of, tap} from 'rxjs';
import {Response} from '../models/response.model';
import {PackageRow} from '../models/package-row.model';

@Injectable({
  providedIn: 'root'
})
export class PackageService {
  private baseUrl: string = environment.btctutoringServiceUrl;
  httpClient: HttpClient = inject(HttpClient);

  // In-memory copy of the last catalog response. Every page/dialog that needs
  // package definitions fetches in ngOnInit, so repeat opens paint instantly
  // from this while a background refresh runs (stale-while-revalidate); any
  // catalog write clears it.
  private catalogCache: PackageRow[] | null = null;

  /**
   * The full catalog, retired rows included — consumers filter. Emits the
   * cached copy immediately when one exists, then the fresh server response.
   */
  getPackages(): Observable<PackageRow[]> {
    const fresh$ = this.httpClient
      .get<PackageRow[]>(`${this.baseUrl}/packages`)
      .pipe(tap(rows => (this.catalogCache = rows)));
    return this.catalogCache ? concat(of(this.catalogCache), fresh$) : fresh$;
  }

  createPackage(row: PackageRow): Observable<Response> {
    return this.httpClient
      .post<Response>(`${this.baseUrl}/packages`, row)
      .pipe(tap(() => (this.catalogCache = null)));
  }

  /** Retire = hide from selects; students on it keep resolving/billing. */
  retirePackage(id: string): Observable<Response> {
    return this.httpClient
      .delete<Response>(`${this.baseUrl}/packages/${id}`)
      .pipe(tap(() => (this.catalogCache = null)));
  }

  restorePackage(id: string): Observable<Response> {
    return this.httpClient
      .put<Response>(`${this.baseUrl}/packages/${id}/restore`, {})
      .pipe(tap(() => (this.catalogCache = null)));
  }
}
