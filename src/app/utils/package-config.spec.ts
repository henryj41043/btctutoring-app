import {PACKAGE_CONFIG, perSessionCost, resolvePackageDef, weeklyCost} from './package-config';
import {Package} from '../enums/package.enum';

describe('package-config', () => {
  it('defines every package except CUSTOM', () => {
    for (const pkg of Object.values(Package)) {
      if (pkg === Package.CUSTOM) continue;
      const def = PACKAGE_CONFIG[pkg as Exclude<Package, Package.CUSTOM>];
      expect(def).toBeDefined();
      expect(def.monthlyCost).toBeGreaterThan(0);
      expect(def.sessionsPerWeek).toBeGreaterThan(0);
      expect(def.sessionLengthMin).toBeGreaterThan(0);
    }
  });

  it('derives Succeed weekly and per-session costs with penny rounding', () => {
    const def = PACKAGE_CONFIG[Package.SUCCEED];
    expect(weeklyCost(def)).toBe(83.54);    // round(362 * 12 / 52, 2)
    expect(perSessionCost(def)).toBe(41.77); // round(83.54 / 2, 2)
  });

  describe('resolvePackageDef', () => {
    it('returns the fixed def for a standard package', () => {
      expect(resolvePackageDef(Package.THRIVE)).toEqual({
        monthlyCost: 181, sessionsPerWeek: 1, sessionLengthMin: 30,
      });
    });

    it('returns null for CUSTOM without a complete override', () => {
      expect(resolvePackageDef(Package.CUSTOM)).toBeNull();
      expect(resolvePackageDef(Package.CUSTOM, {monthlyCost: 400})).toBeNull();
    });

    it('returns the override for a fully-configured CUSTOM student', () => {
      const override = {monthlyCost: 400, sessionsPerWeek: 2, sessionLengthMin: 50};
      expect(resolvePackageDef(Package.CUSTOM, override)).toEqual(override);
    });
  });
});
