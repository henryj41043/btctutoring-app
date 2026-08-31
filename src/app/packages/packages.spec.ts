import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {MatDialog} from '@angular/material/dialog';
import {Packages} from './packages';
import {PackageService} from '../services/package.service';
import {PackageRow} from '../models/package-row.model';
import {TEST_CATALOG_ROWS} from '../../testing/package-catalog.fixture';

describe('Packages', () => {
  const packageService = {
    getPackages: jest.fn(),
    retirePackage: jest.fn(),
    restorePackage: jest.fn(),
  };
  const dialog = {open: jest.fn()};

  const rowsWithRetired: PackageRow[] = [
    ...TEST_CATALOG_ROWS,
    {id: 'Legacy', monthlyCost: 100, sessionsPerWeek: 1, sessionLengthMin: 30, retired: true},
  ];

  const build = (): Packages => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Packages],
      providers: [
        {provide: PackageService, useValue: packageService},
        {provide: MatDialog, useValue: dialog},
      ],
    });
    return TestBed.createComponent(Packages).componentInstance;
  };

  const rows = (c: Packages): PackageRow[] =>
    (c as unknown as {dataSource: {data: PackageRow[]}}).dataSource.data;
  const priv = (c: Packages) => c as unknown as {
    loading: boolean;
    hasError: boolean;
    showRetired: boolean;
    pendingRetireId: string | null;
    mutatingId: string | null;
  };

  beforeEach(() => {
    sessionStorage.clear();
    jest.clearAllMocks();
    packageService.getPackages.mockReturnValue(of(rowsWithRetired));
    packageService.retirePackage.mockReturnValue(of({id: 'Apex'}));
    packageService.restorePackage.mockReturnValue(of({id: 'Legacy'}));
  });

  it('lists active packages sorted by ascending price, hiding retired by default', () => {
    const c = build();
    c.ngOnInit();
    const data = rows(c);
    expect(data).toHaveLength(12); // Legacy hidden
    expect(data[0].id).toBe('Thrive');
    expect(data[data.length - 1].id).toBe('Apex');
    expect(priv(c).loading).toBe(false);
  });

  it('the show-retired toggle reveals retired rows and persists across visits', () => {
    const c = build();
    c.ngOnInit();
    c.toggleShowRetired(true);
    expect(rows(c).some(r => r.id === 'Legacy')).toBe(true);
    // Cheapest first — the retired $100 Legacy sorts to the top when shown.
    expect(rows(c)[0].id).toBe('Legacy');

    const again = build();
    again.ngOnInit();
    expect(priv(again).showRetired).toBe(true);
  });

  it('retire asks for inline confirmation, then calls the service and reloads', () => {
    const c = build();
    c.ngOnInit();
    const apex = rows(c).find(r => r.id === 'Apex')!;
    c.askRetire(apex, new Event('click'));
    expect(priv(c).pendingRetireId).toBe('Apex');
    expect(packageService.retirePackage).not.toHaveBeenCalled();

    c.confirmRetire(apex);
    expect(packageService.retirePackage).toHaveBeenCalledWith('Apex');
    expect(priv(c).pendingRetireId).toBeNull();
    expect(packageService.getPackages).toHaveBeenCalledTimes(2); // init + reload
  });

  it('cancel keeps the row unretired', () => {
    const c = build();
    c.ngOnInit();
    c.askRetire(rows(c)[0], new Event('click'));
    c.cancelRetire();
    expect(priv(c).pendingRetireId).toBeNull();
    expect(packageService.retirePackage).not.toHaveBeenCalled();
  });

  it('unretire calls restore and reloads', () => {
    const c = build();
    c.ngOnInit();
    c.toggleShowRetired(true);
    const legacy = rows(c).find(r => r.id === 'Legacy')!;
    c.restore(legacy, new Event('click'));
    expect(packageService.restorePackage).toHaveBeenCalledWith('Legacy');
  });

  it('a failed load or mutation shows the error state', () => {
    packageService.getPackages.mockReturnValue(throwError(() => new Error('boom')));
    const c = build();
    c.ngOnInit();
    expect(priv(c).hasError).toBe(true);
    expect(priv(c).loading).toBe(false);

    packageService.getPackages.mockReturnValue(of(rowsWithRetired));
    const c2 = build();
    c2.ngOnInit();
    packageService.retirePackage.mockReturnValue(throwError(() => new Error('bang')));
    c2.confirmRetire(rows(c2)[0]);
    expect(priv(c2).hasError).toBe(true);
    expect(priv(c2).mutatingId).toBeNull();
  });

  it('create opens the dialog and reloads only when a package was created', () => {
    const c = build();
    c.ngOnInit();
    dialog.open.mockReturnValue({afterClosed: () => of(true)});
    c.openCreateDialog();
    expect(dialog.open).toHaveBeenCalled();
    expect(packageService.getPackages).toHaveBeenCalledTimes(2);

    dialog.open.mockReturnValue({afterClosed: () => of(undefined)});
    c.openCreateDialog();
    expect(packageService.getPackages).toHaveBeenCalledTimes(2); // no reload
  });
});
