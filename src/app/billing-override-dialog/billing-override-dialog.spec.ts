import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { BillingOverrideDialog, BillingOverrideDialogData } from './billing-override-dialog';

describe('BillingOverrideDialog', () => {
  const dialogRef = { close: jest.fn() };

  const build = (data: Partial<BillingOverrideDialogData> = {}): BillingOverrideDialog => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [BillingOverrideDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { contactName: 'Casey Lee', periodLabel: 'Due 1st — July 2026', derived: 362, current: null, ...data } },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
    return TestBed.createComponent(BillingOverrideDialog).componentInstance;
  };
  const state = (c: BillingOverrideDialog) => c as unknown as { noCharge: boolean; amount: number | null; valid: boolean; hasCurrent: boolean };

  beforeEach(() => jest.clearAllMocks());

  it('starts empty and invalid with no current override', () => {
    const c = build();
    expect(state(c).noCharge).toBe(false);
    expect(state(c).amount).toBeNull();
    expect(state(c).valid).toBe(false);
    expect(state(c).hasCurrent).toBe(false);
  });

  it('seeds "no charge" from a current override of 0, and the amount from a positive one', () => {
    expect(state(build({ current: 0 })).noCharge).toBe(true);
    const c = build({ current: 150 });
    expect(state(c).noCharge).toBe(false);
    expect(state(c).amount).toBe(150);
    expect(state(c).hasCurrent).toBe(true);
    expect(state(c).valid).toBe(true);
  });

  it('saves a rounded custom amount', () => {
    const c = build();
    state(c).amount = 99.999;
    expect(state(c).valid).toBe(true);
    c.save();
    expect(dialogRef.close).toHaveBeenCalledWith({ amount_override: 100 });
  });

  it('saves 0 when "no charge" is ticked, whatever the amount field says', () => {
    const c = build();
    state(c).noCharge = true;
    state(c).amount = 500;
    c.save();
    expect(dialogRef.close).toHaveBeenCalledWith({ amount_override: 0 });
  });

  it('refuses to save a negative or non-finite amount', () => {
    const c = build();
    state(c).amount = -5;
    expect(state(c).valid).toBe(false);
    c.save();
    state(c).amount = Number.NaN;
    c.save();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('clear returns null; cancel returns undefined', () => {
    const c = build({ current: 20 });
    c.clear();
    expect(dialogRef.close).toHaveBeenCalledWith({ amount_override: null });
    c.cancel();
    expect(dialogRef.close).toHaveBeenLastCalledWith(undefined);
  });
});
