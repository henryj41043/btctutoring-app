import {Component, inject} from '@angular/core';
import {
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {HttpErrorResponse} from '@angular/common/http';
import {catchError, EMPTY} from 'rxjs';
import {PackageService} from '../services/package.service';
import {CUSTOM_PACKAGE} from '../utils/package-config';

/**
 * Create-only editor for a catalog package. Packages are immutable after
 * create (the name is the identifier stored on students; frozen prices keep
 * historical billing stable), so there is no edit mode — changing a package
 * means retiring it and creating a replacement here.
 */
@Component({
  selector: 'app-package-dialog',
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
  ],
  templateUrl: './package-dialog.html',
  styleUrl: './package-dialog.scss',
  standalone: true,
})
export class PackageDialog {
  readonly dialogRef = inject(MatDialogRef<PackageDialog>);
  private formBuilder: FormBuilder = inject(FormBuilder);
  private packageService: PackageService = inject(PackageService);

  protected submitting: boolean = false;
  protected errorMessage: string = '';

  protected packageForm: FormGroup = this.formBuilder.group({
    id: ['', Validators.required],
    monthlyCost: [null, [Validators.required, Validators.min(1)]],
    sessionsPerWeek: [null, [Validators.required, Validators.min(1)]],
    sessionLengthMin: [null, [Validators.required, Validators.min(1)]],
  });

  save(): void {
    if (this.submitting) {
      return;
    }
    const value = this.packageForm.value;
    const name = (value.id ?? '').trim();
    this.errorMessage = '';
    if (!name) {
      this.errorMessage = 'The package needs a name.';
      return;
    }
    if (name.toLowerCase() === CUSTOM_PACKAGE.toLowerCase()) {
      this.errorMessage = `'${CUSTOM_PACKAGE}' is reserved for per-student custom packages.`;
      return;
    }
    if (!(value.monthlyCost > 0) || !(value.sessionsPerWeek > 0) || !(value.sessionLengthMin > 0)) {
      this.errorMessage = 'Price, sessions per week, and session length must all be positive.';
      return;
    }
    this.submitting = true;
    this.packageService.createPackage({
      id: name,
      monthlyCost: value.monthlyCost,
      sessionsPerWeek: value.sessionsPerWeek,
      sessionLengthMin: value.sessionLengthMin,
    }).pipe(
      catchError((error: HttpErrorResponse) => {
        this.submitting = false;
        this.errorMessage = error.status === 409
          ? 'A package with this name already exists.'
          : 'Something went wrong creating the package. Please try again.';
        return EMPTY;
      }),
    ).subscribe(() => {
      this.submitting = false;
      this.dialogRef.close(true);
    });
  }
}
