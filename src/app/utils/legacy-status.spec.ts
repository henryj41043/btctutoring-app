import { normalizeParentStatus } from './legacy-status';

describe('normalizeParentStatus', () => {
  it.each([
    ['Active Student', 'Active Client'],
    ['Past Student', 'Former Client'],
    ['Onboarding', 'MIA'],
  ])('maps legacy %s to %s', (legacy, expected) => {
    expect(normalizeParentStatus(legacy)).toBe(expected);
  });

  it.each(['Active Client', 'Former Client', 'MIA', 'Declined Services'])(
    'passes valid parent status %s through unchanged',
    (status) => {
      expect(normalizeParentStatus(status)).toBe(status);
    },
  );

  it('passes empty and undefined through', () => {
    expect(normalizeParentStatus(undefined)).toBeUndefined();
    expect(normalizeParentStatus('')).toBe('');
  });
});
