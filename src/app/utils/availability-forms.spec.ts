import {FormBuilder} from '@angular/forms';
import {buildTimeOptions, createAvailabilityGroup} from './availability-forms';
import {Weekday} from '../enums/weekday.enum';

describe('availability-forms', () => {
  describe('buildTimeOptions', () => {
    it('spans 6:00 AM to 9:00 PM in 30-minute steps', () => {
      const options = buildTimeOptions();
      expect(options).toHaveLength(31);
      expect(options[0]).toEqual({value: '06:00', label: '6:00 AM'});
      expect(options.at(-1)).toEqual({value: '21:00', label: '9:00 PM'});
    });

    it('formats noon and half-hours in 12-hour labels', () => {
      const options = buildTimeOptions();
      expect(options.find(o => o.value === '12:00')!.label).toBe('12:00 PM');
      expect(options.find(o => o.value === '13:30')!.label).toBe('1:30 PM');
      expect(options.find(o => o.value === '11:30')!.label).toBe('11:30 AM');
    });
  });

  describe('createAvailabilityGroup', () => {
    const fb = new FormBuilder();

    it('starts empty-but-required for the Add button', () => {
      const group = createAvailabilityGroup(fb);
      expect(group.get('days')!.value).toEqual([]);
      expect(group.get('start_time')!.value).toBe('');
      expect(group.get('end_time')!.value).toBe('');
      expect(group.valid).toBe(false);
    });

    it('prefills an existing block', () => {
      const group = createAvailabilityGroup(fb, {
        days: [Weekday.MONDAY],
        start_time: '09:00',
        end_time: '12:00',
      });
      expect(group.get('days')!.value).toEqual([Weekday.MONDAY]);
      expect(group.get('start_time')!.value).toBe('09:00');
      expect(group.valid).toBe(true);
    });
  });
});
