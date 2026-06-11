import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PhoneFormatDirective } from './phone-format.directive';

describe('PhoneFormatDirective', () => {
  let input: HTMLInputElement;
  let directive: PhoneFormatDirective;

  beforeEach(() => {
    input = document.createElement('input');
    TestBed.configureTestingModule({
      providers: [
        PhoneFormatDirective,
        { provide: ElementRef, useValue: new ElementRef(input) },
      ],
    });
    directive = TestBed.inject(PhoneFormatDirective);
  });

  it('formats the input value and emits the formatted string on input', () => {
    const onChange = jest.fn();
    directive.registerOnChange(onChange);

    input.value = '1234567890';
    directive.onInput();

    expect(input.value).toBe('(123) 456 - 7890');
    expect(onChange).toHaveBeenCalledWith('(123) 456 - 7890');
  });

  it('notifies touched on blur', () => {
    const onTouched = jest.fn();
    directive.registerOnTouched(onTouched);
    directive.onBlur();
    expect(onTouched).toHaveBeenCalledTimes(1);
  });

  it('writeValue formats an incoming value', () => {
    directive.writeValue('1234567890');
    expect(input.value).toBe('(123) 456 - 7890');
  });

  it('writeValue clears the field for nullish values', () => {
    input.value = 'stale';
    directive.writeValue(null);
    expect(input.value).toBe('');
  });

  it('setDisabledState toggles the input disabled property', () => {
    directive.setDisabledState(true);
    expect(input.disabled).toBe(true);
    directive.setDisabledState(false);
    expect(input.disabled).toBe(false);
  });
});
