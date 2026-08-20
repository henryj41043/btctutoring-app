import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {AvailabilityBlock} from '../models/availability-block.model';

/** 30-min increments from 6:00 AM to 9:00 PM as { value: 'HH:mm', label: '1:00 PM' }. */
export function buildTimeOptions(): {value: string; label: string}[] {
  const options: {value: string; label: string}[] = [];
  for (let minutes = 6 * 60; minutes <= 21 * 60; minutes += 30) {
    const h24 = Math.floor(minutes / 60);
    const m = minutes % 60;
    const value = `${h24.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    const period = h24 < 12 ? 'AM' : 'PM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const label = `${h12}:${m.toString().padStart(2, '0')} ${period}`;
    options.push({value, label});
  }
  return options;
}

/** One availability block's form group (empty for the Add button). */
export function createAvailabilityGroup(formBuilder: FormBuilder, block?: AvailabilityBlock): FormGroup {
  return formBuilder.group({
    days: [block?.days ?? [], Validators.required],
    start_time: [block?.start_time ?? '', Validators.required],
    end_time: [block?.end_time ?? '', Validators.required],
  });
}
