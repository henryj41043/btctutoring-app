import {Pipe, PipeTransform} from '@angular/core';
import {formatPhone} from '../utils/phone.util';

/** Displays a stored phone value (raw or formatted) as (123) 456 - 7890. */
@Pipe({
  name: 'phone',
  standalone: true,
})
export class PhonePipe implements PipeTransform {
  transform(value: unknown): string {
    return value ? formatPhone(value) : '';
  }
}
