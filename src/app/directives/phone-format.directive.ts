import {Directive, ElementRef, forwardRef, HostListener, inject} from '@angular/core';
import {ControlValueAccessor, NG_VALUE_ACCESSOR} from '@angular/forms';
import {formatPhone} from '../utils/phone.util';

/**
 * Live US phone-number mask for an <input>. Implemented as a ControlValueAccessor
 * so it formats both user input and programmatic/edit-mode values, and writes the
 * formatted string back to the bound form control.
 */
@Directive({
  selector: 'input[appPhoneFormat]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PhoneFormatDirective),
      multi: true,
    },
  ],
})
export class PhoneFormatDirective implements ControlValueAccessor {
  private el: HTMLInputElement = inject(ElementRef).nativeElement;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  @HostListener('input')
  onInput(): void {
    const formatted = formatPhone(this.el.value);
    this.el.value = formatted;
    this.onChange(formatted);
  }

  @HostListener('blur')
  onBlur(): void {
    this.onTouched();
  }

  writeValue(value: unknown): void {
    this.el.value = value ? formatPhone(value) : '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.el.disabled = isDisabled;
  }
}
