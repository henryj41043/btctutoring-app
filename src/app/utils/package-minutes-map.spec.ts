import { packageMinutesMap } from './package-minutes-map';
import { Package } from '../enums/package.enum';

describe('packageMinutesMap', () => {
  it('maps every package to a positive monthly minute allotment', () => {
    for (const pkg of Object.values(Package)) {
      expect(packageMinutesMap[pkg]).toBeGreaterThan(0);
    }
  });

  it('uses the documented base allotments', () => {
    expect(packageMinutesMap[Package.SUCCEED]).toBe(240);
    expect(packageMinutesMap[Package.POWER_UP]).toBe(720);
    expect(packageMinutesMap[Package.THRIVE]).toBe(120);
  });
});
