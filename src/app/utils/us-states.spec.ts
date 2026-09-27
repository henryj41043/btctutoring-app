import {US_STATES, ZIP_PATTERN} from './us-states';

describe('us-states', () => {
  it('lists the 50 states plus DC as unique two-letter codes', () => {
    expect(US_STATES).toHaveLength(51);
    expect(new Set(US_STATES).size).toBe(51);
    expect(US_STATES.every(code => /^[A-Z]{2}$/.test(code))).toBe(true);
    expect(US_STATES).toContain('PA');
    expect(US_STATES).toContain('DC');
  });

  it('accepts ZIP and ZIP+4 only', () => {
    expect(ZIP_PATTERN.test('18503')).toBe(true);
    expect(ZIP_PATTERN.test('18503-1234')).toBe(true);
    expect(ZIP_PATTERN.test('1850')).toBe(false);
    expect(ZIP_PATTERN.test('18503-12')).toBe(false);
    expect(ZIP_PATTERN.test('ABCDE')).toBe(false);
  });
});
