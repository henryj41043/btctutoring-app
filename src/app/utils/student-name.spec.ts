import { studentDisplayName } from './student-name';

describe('studentDisplayName', () => {
  it('returns the trimmed name when present', () => {
    expect(studentDisplayName({ name: '  Pat Young  ' })).toBe('Pat Young');
  });

  it('falls back for missing, empty, or whitespace names', () => {
    expect(studentDisplayName({ name: '' })).toBe('Unnamed student');
    expect(studentDisplayName({ name: '   ' })).toBe('Unnamed student');
    expect(studentDisplayName({})).toBe('Unnamed student');
    expect(studentDisplayName(undefined)).toBe('Unnamed student');
    expect(studentDisplayName(null)).toBe('Unnamed student');
  });
});
