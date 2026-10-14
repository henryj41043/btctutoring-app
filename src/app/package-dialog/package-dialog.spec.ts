import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {MatDialogRef} from '@angular/material/dialog';
import {HttpErrorResponse} from '@angular/common/http';
import {PackageDialog} from './package-dialog';
import {PackageService} from '../services/package.service';

describe('PackageDialog', () => {
  const dialogRef = {close: jest.fn()};
  const packageService = {createPackage: jest.fn()};

  const build = (): PackageDialog => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PackageDialog],
      providers: [
        {provide: MatDialogRef, useValue: dialogRef},
        {provide: PackageService, useValue: packageService},
      ],
    });
    return TestBed.createComponent(PackageDialog).componentInstance;
  };

  const priv = (c: PackageDialog) => c as unknown as {
    packageForm: {patchValue: (v: object) => void; invalid: boolean};
    errorMessage: string;
    submitting: boolean;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    packageService.createPackage.mockReturnValue(of({id: 'Zenith'}));
  });

  const fill = (c: PackageDialog, over: object = {}): void => {
    priv(c).packageForm.patchValue({
      id: 'Zenith',
      monthlyCost: 2000,
      sessionsPerWeek: 5,
      sessionLengthMin: 60,
      ...over,
    });
  };

  it('creates a package with a trimmed name and closes with true', () => {
    const c = build();
    fill(c, {id: '  Zenith  '});
    c.save();
    expect(packageService.createPackage).toHaveBeenCalledWith({
      id: 'Zenith',
      monthlyCost: 2000,
      sessionsPerWeek: 5,
      sessionLengthMin: 60,
    });
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it("rejects a blank or reserved 'Custom' name client-side", () => {
    const c = build();
    fill(c, {id: '   '});
    c.save();
    expect(priv(c).errorMessage).toContain('needs a name');

    fill(c, {id: 'cUsToM'});
    c.save();
    expect(priv(c).errorMessage).toContain('reserved');
    expect(packageService.createPackage).not.toHaveBeenCalled();
  });

  it('accepts a $0 price (a ghost package)', () => {
    const c = build();
    fill(c, {id: 'Ghost', monthlyCost: 0});
    expect(priv(c).packageForm.invalid).toBe(false);
    c.save();
    expect(packageService.createPackage).toHaveBeenCalledWith(
      expect.objectContaining({id: 'Ghost', monthlyCost: 0}),
    );
  });

  it('rejects a negative price and non-positive sessions or length client-side', () => {
    const c = build();
    fill(c, {monthlyCost: -1});
    c.save();
    expect(priv(c).errorMessage).toBe('The price must be $0 or more.');
    fill(c, {monthlyCost: 10, sessionsPerWeek: 0});
    c.save();
    expect(priv(c).errorMessage).toBe('Sessions per week and session length must both be positive.');
    fill(c, {sessionsPerWeek: 1, sessionLengthMin: 0});
    c.save();
    expect(priv(c).errorMessage).toBe('Sessions per week and session length must both be positive.');
    expect(packageService.createPackage).not.toHaveBeenCalled();
  });

  it('shows the duplicate-name message on a 409', () => {
    packageService.createPackage.mockReturnValue(
      throwError(() => new HttpErrorResponse({status: 409})));
    const c = build();
    fill(c);
    c.save();
    expect(priv(c).errorMessage).toContain('already exists');
    expect(priv(c).submitting).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('shows a generic message on other failures and re-enables submit', () => {
    packageService.createPackage.mockReturnValue(
      throwError(() => new HttpErrorResponse({status: 500})));
    const c = build();
    fill(c);
    c.save();
    expect(priv(c).errorMessage).toContain('Something went wrong');
    expect(priv(c).submitting).toBe(false);
  });

  it('ignores save while a request is in flight', () => {
    const c = build();
    fill(c);
    priv(c).submitting = true;
    c.save();
    expect(packageService.createPackage).not.toHaveBeenCalled();
  });
});
