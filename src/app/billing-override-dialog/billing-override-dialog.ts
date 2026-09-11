import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {CurrencyPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';

export interface BillingOverrideDialogData {
  contactName: string;
  /** e.g. 'Due 1st — September 2026'. */
  periodLabel: string;
  /** The package-derived amount for the period (null when nothing is derived). */
  derived: number | null;
  /** The override currently stored (0 = no charge); null when none. */
  current: number | null;
}

/** What the dialog returns: the new override, null to clear, or undefined when cancelled. */
export interface BillingOverrideResult {
  amount_override: number | null;
}

/**
 * Per-period billing override (client request 2026-09): bill a family a
 * custom amount for a due date, or nothing at all ("No charge" = an
 * override of $0). The caller persists the result; this dialog only
 * collects it.
 */
@Component({
  selector: 'app-billing-override-dialog',
  imports: [
    CurrencyPipe,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './billing-override-dialog.html',
  styleUrl: './billing-override-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class BillingOverrideDialog {
  protected data: BillingOverrideDialogData = inject(MAT_DIALOG_DATA);
  private dialogRef: MatDialogRef<BillingOverrideDialog, BillingOverrideResult | undefined> = inject(MatDialogRef);

  protected noCharge: boolean = this.data.current === 0;
  protected amount: number | null =
    this.data.current !== null && this.data.current !== 0 ? this.data.current : null;

  /** True while the form describes a persistable override. */
  protected get valid(): boolean {
    if (this.noCharge) return true;
    return this.amount !== null && Number.isFinite(this.amount) && this.amount >= 0;
  }

  protected get hasCurrent(): boolean {
    return this.data.current !== null;
  }

  save(): void {
    if (!this.valid) return;
    const value = this.noCharge ? 0 : Math.round((this.amount as number) * 100) / 100;
    this.dialogRef.close({amount_override: value});
  }

  clear(): void {
    this.dialogRef.close({amount_override: null});
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
