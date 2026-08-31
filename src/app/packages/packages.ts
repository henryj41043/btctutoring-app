import {DestroyRef, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatDialog} from '@angular/material/dialog';
import {CurrencyPipe} from '@angular/common';
import {catchError, EMPTY, of} from 'rxjs';
import {PackageService} from '../services/package.service';
import {PackageRow} from '../models/package-row.model';
import {PackageDialog} from '../package-dialog/package-dialog';
import {TableStateStore} from '../utils/table-state';

/**
 * Admin-only Packages page: the tutoring package catalog. Packages are
 * IMMUTABLE after create (the name is the identifier stored on students, and
 * frozen prices keep historical billing stable) — the only actions are
 * create, retire, and unretire. To change a package, retire it and create a
 * replacement; students on a retired package keep billing at its price.
 */
@Component({
  selector: 'app-packages',
  imports: [
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    CurrencyPipe,
  ],
  templateUrl: './packages.html',
  styleUrl: './packages.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class Packages implements OnInit {
  private packageService: PackageService = inject(PackageService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  // Cancels in-flight HTTP work when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);
  private dialog: MatDialog = inject(MatDialog);

  // Restores the admin's place (the show-retired toggle) after navigating away.
  private readonly viewState = new TableStateStore('btc-packages-view');

  protected columns: string[] = ['name', 'monthlyCost', 'sessionsPerWeek', 'sessionLengthMin', 'status', 'actions'];
  protected dataSource = new MatTableDataSource<PackageRow>([]);
  protected loading: boolean = true;
  protected hasError: boolean = false;
  protected showRetired: boolean = false;
  /** The row awaiting an inline retire confirmation (by package name). */
  protected pendingRetireId: string | null = null;
  /** A retire/unretire request in flight (by package name). */
  protected mutatingId: string | null = null;
  private rows: PackageRow[] = [];

  ngOnInit(): void {
    this.showRetired = !!this.viewState.load().extra?.['showRetired'];
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.hasError = false;
    this.cdr.markForCheck();
    this.packageService.getPackages().pipe(
      catchError(() => {
        this.hasError = true;
        this.loading = false;
        this.cdr.markForCheck();
        return of(null);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(rows => {
      if (!rows) return;
      this.rows = rows;
      this.applyView();
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  private applyView(): void {
    const visible = this.showRetired ? this.rows : this.rows.filter(r => !r.retired);
    this.dataSource.data = [...visible].sort(
      (a, b) => (a.monthlyCost ?? 0) - (b.monthlyCost ?? 0));
  }

  protected get retiredCount(): number {
    return this.rows.filter(r => !!r.retired).length;
  }

  toggleShowRetired(checked: boolean): void {
    this.showRetired = checked;
    this.viewState.patch({extra: {showRetired: checked}});
    this.applyView();
    this.cdr.markForCheck();
  }

  openCreateDialog(): void {
    const ref = this.dialog.open(PackageDialog, {width: '440px'});
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.load();
      }
    });
  }

  askRetire(row: PackageRow, event: Event): void {
    event.stopPropagation();
    this.pendingRetireId = row.id ?? null;
    this.cdr.markForCheck();
  }

  cancelRetire(): void {
    this.pendingRetireId = null;
    this.cdr.markForCheck();
  }

  confirmRetire(row: PackageRow): void {
    if (!row.id || this.mutatingId) return;
    this.mutate(this.packageService.retirePackage(row.id), row.id);
  }

  restore(row: PackageRow, event: Event): void {
    event.stopPropagation();
    if (!row.id || this.mutatingId) return;
    this.mutate(this.packageService.restorePackage(row.id), row.id);
  }

  private mutate(request$: ReturnType<PackageService['retirePackage']>, id: string): void {
    this.mutatingId = id;
    this.cdr.markForCheck();
    request$.pipe(
      catchError(() => {
        this.hasError = true;
        this.mutatingId = null;
        this.cdr.markForCheck();
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      this.mutatingId = null;
      this.pendingRetireId = null;
      this.load();
    });
  }
}
