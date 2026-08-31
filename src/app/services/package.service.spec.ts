import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {PackageService} from './package.service';
import {PackageRow} from '../models/package-row.model';
import {environment} from '../../environments/environment';

const base = environment.btctutoringServiceUrl;
const rows: PackageRow[] = [
  {id: 'Apex', monthlyCost: 1820, sessionsPerWeek: 5, sessionLengthMin: 60, retired: false},
];

describe('PackageService', () => {
  let service: PackageService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PackageService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getPackages fetches the catalog', () => {
    const results: PackageRow[][] = [];
    service.getPackages().subscribe(r => results.push(r));
    const req = httpMock.expectOne(`${base}/packages`);
    expect(req.request.method).toBe('GET');
    req.flush(rows);
    expect(results).toEqual([rows]);
  });

  it('getPackages emits the cache first, then the fresh response (SWR)', () => {
    service.getPackages().subscribe();
    httpMock.expectOne(`${base}/packages`).flush(rows);

    const fresh = [...rows, {id: 'Zenith', monthlyCost: 2000, sessionsPerWeek: 5, sessionLengthMin: 60}];
    const results: PackageRow[][] = [];
    service.getPackages().subscribe(r => results.push(r));
    expect(results).toEqual([rows]); // cached copy, synchronously
    httpMock.expectOne(`${base}/packages`).flush(fresh);
    expect(results).toEqual([rows, fresh]);
  });

  it('createPackage POSTs the row and clears the cache', () => {
    service.getPackages().subscribe();
    httpMock.expectOne(`${base}/packages`).flush(rows);

    const row: PackageRow = {id: 'Zenith', monthlyCost: 2000, sessionsPerWeek: 5, sessionLengthMin: 60};
    service.createPackage(row).subscribe();
    const req = httpMock.expectOne(`${base}/packages`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(row);
    req.flush({id: 'Zenith'});

    // Cache cleared: next read is a single fresh fetch, no cached emission.
    const results: PackageRow[][] = [];
    service.getPackages().subscribe(r => results.push(r));
    expect(results).toEqual([]);
    httpMock.expectOne(`${base}/packages`).flush(rows);
  });

  it('retirePackage DELETEs by name and clears the cache', () => {
    service.getPackages().subscribe();
    httpMock.expectOne(`${base}/packages`).flush(rows);

    service.retirePackage('Apex').subscribe();
    const req = httpMock.expectOne(`${base}/packages/Apex`);
    expect(req.request.method).toBe('DELETE');
    req.flush({id: 'Apex'});

    const results: PackageRow[][] = [];
    service.getPackages().subscribe(r => results.push(r));
    expect(results).toEqual([]);
    httpMock.expectOne(`${base}/packages`).flush(rows);
  });

  it('restorePackage PUTs the restore route and clears the cache', () => {
    service.getPackages().subscribe();
    httpMock.expectOne(`${base}/packages`).flush(rows);

    service.restorePackage('Apex').subscribe();
    const req = httpMock.expectOne(`${base}/packages/Apex/restore`);
    expect(req.request.method).toBe('PUT');
    req.flush({id: 'Apex'});

    const results: PackageRow[][] = [];
    service.getPackages().subscribe(r => results.push(r));
    expect(results).toEqual([]);
    httpMock.expectOne(`${base}/packages`).flush(rows);
  });
});
