import {ChangeDetectionStrategy, ChangeDetectorRef, Component, forwardRef, inject, Input, OnChanges, SimpleChanges} from '@angular/core';
import {FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor} from '@angular/forms';
import {MatAutocompleteModule, MatAutocompleteSelectedEvent} from '@angular/material/autocomplete';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';

/** One pickable option: the emitted value and its display label. */
export interface FilterSelectOption {
  value: string;
  label: string;
}

/**
 * A type-to-filter replacement for mat-select on LARGE option lists (e.g. the
 * 1000+-contact pickers): typing narrows the options, picking one emits its
 * value, and free text never leaks out — blur without a valid pick reverts to
 * the current selection (or clears it when `clearable`). Implements
 * ControlValueAccessor, so it works with ngModel and formControlName alike.
 */
@Component({
  selector: 'app-filter-select',
  imports: [FormsModule, MatAutocompleteModule, MatFormFieldModule, MatInputModule],
  templateUrl: './filter-select.html',
  styleUrl: './filter-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => FilterSelect),
    multi: true,
  }],
})
export class FilterSelect implements ControlValueAccessor, OnChanges {
  @Input({required: true}) options: FilterSelectOption[] = [];
  @Input() label: string = '';
  /** Allow clearing the selection by emptying the input (emits null). */
  @Input() clearable: boolean = false;

  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

  protected searchText: string = '';
  protected disabled: boolean = false;
  private selectedValue: string | null = null;
  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  /**
   * Options often arrive after writeValue — re-resolve the shown label. But
   * ONLY when the box still shows the previous options' label for the
   * selection: parents commonly bind a getter that builds a fresh options
   * array every change-detection cycle, so this fires constantly — resetting
   * unconditionally would clobber every keystroke of in-progress typing.
   */
  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['options'];
    if (!change || this.selectedValue === null) {
      return;
    }
    const previous = (change.previousValue ?? []) as FilterSelectOption[];
    const previousLabel =
      previous.find(o => o.value === this.selectedValue)?.label ?? '';
    if (this.searchText === previousLabel && this.searchText !== this.selectedLabel) {
      this.searchText = this.selectedLabel;
      this.cdr.markForCheck();
    }
  }

  /** Case-insensitive substring filter over the labels. */
  get filteredOptions(): FilterSelectOption[] {
    const needle = this.searchText.trim().toLowerCase();
    const selected = this.selectedLabel;
    // Showing the full list again when the text is exactly the current
    // selection lets the user reopen and switch without erasing first.
    if (!needle || this.searchText === selected) {
      return this.options;
    }
    return this.options.filter(o => o.label.toLowerCase().includes(needle));
  }

  private get selectedLabel(): string {
    return this.options.find(o => o.value === this.selectedValue)?.label ?? '';
  }

  /** Maps a selected value to its label for the input display. */
  protected displayLabel = (value: string | null): string => {
    if (value === null || value === undefined) {
      return '';
    }
    return this.options.find(o => o.value === value)?.label ?? value;
  };

  onSearchChange(text: string): void {
    this.searchText = text;
  }

  /** Set on selection so the panel close that follows doesn't re-resolve. */
  private selectionHandled = false;

  onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const value = event.option.value as string;
    this.selectionHandled = true;
    this.selectedValue = value;
    this.searchText = this.selectedLabel;
    this.onChange(value);
    this.onTouched();
  }

  /**
   * Free text never leaks: when the panel closes without a pick, revert to the
   * selection, or clear if allowed. The panel's close (not input blur) is the
   * signal — blur fires BEFORE a clicked option's click lands, and reverting
   * then re-renders the filtered list mid-click, destroying the option under
   * the cursor so the selection never registers.
   */
  onPanelClosed(): void {
    if (this.selectionHandled) {
      this.selectionHandled = false;
      return;
    }
    const exact = this.options.find(
      o => o.label.toLowerCase() === this.searchText.trim().toLowerCase());
    if (exact && exact.value !== this.selectedValue) {
      this.selectedValue = exact.value;
      this.onChange(exact.value);
    } else if (this.clearable && this.searchText.trim() === '') {
      this.selectedValue = null;
      this.onChange(null);
    }
    this.searchText = this.selectedLabel;
    this.onTouched();
    this.cdr.markForCheck();
  }

  // ── ControlValueAccessor ──────────────────────────────────────────────────
  writeValue(value: string | null): void {
    this.selectedValue = value ?? null;
    this.searchText = this.selectedLabel;
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }
}
