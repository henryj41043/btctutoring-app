import {
  CUSTOM_PACKAGE,
  packageSelectOptions,
  perSessionCost,
  resolvePackageDef,
  toCatalog,
  weeklyCost,
} from './package-config';
import {TEST_CATALOG, TEST_CATALOG_ROWS} from '../../testing/package-catalog.fixture';

describe('package-config', () => {
  it('resolves a named package from the catalog', () => {
    expect(resolvePackageDef('Apex', TEST_CATALOG)).toEqual({
      monthlyCost: 1820,
      sessionsPerWeek: 5,
      sessionLengthMin: 60,
    });
  });

  it('resolves a RETIRED package (students on it keep billing)', () => {
    const catalog = {
      Legacy: {monthlyCost: 300, sessionsPerWeek: 1, sessionLengthMin: 30, retired: true},
    };
    expect(resolvePackageDef('Legacy', catalog)).toEqual({
      monthlyCost: 300,
      sessionsPerWeek: 1,
      sessionLengthMin: 30,
    });
  });

  it('derives Succeed weekly and per-session costs', () => {
    const def = TEST_CATALOG['Succeed'];
    expect(weeklyCost(def)).toBe(83.54);
    expect(perSessionCost(def)).toBe(41.77);
  });

  it('returns null for undefined, unknown, empty catalog, or unconfigured custom', () => {
    expect(resolvePackageDef(undefined, TEST_CATALOG)).toBeNull();
    expect(resolvePackageDef('Nonexistent', TEST_CATALOG)).toBeNull();
    expect(resolvePackageDef('Apex', {})).toBeNull();
    expect(resolvePackageDef(CUSTOM_PACKAGE, TEST_CATALOG)).toBeNull();
    expect(resolvePackageDef(CUSTOM_PACKAGE, TEST_CATALOG, {monthlyCost: 400})).toBeNull();
  });

  it('returns the override for a configured custom package (catalog ignored)', () => {
    const override = {monthlyCost: 400, sessionsPerWeek: 2, sessionLengthMin: 50};
    expect(resolvePackageDef(CUSTOM_PACKAGE, {}, override)).toEqual(override);
  });

  it('toCatalog folds rows by name, keeping retired entries and skipping id-less rows', () => {
    const catalog = toCatalog([
      {id: 'Apex', monthlyCost: 1820, sessionsPerWeek: 5, sessionLengthMin: 60},
      {id: 'Old', monthlyCost: 300, sessionsPerWeek: 1, sessionLengthMin: 30, retired: true},
      {monthlyCost: 999, sessionsPerWeek: 9, sessionLengthMin: 90},
    ]);
    expect(catalog['Apex']).toEqual({
      monthlyCost: 1820, sessionsPerWeek: 5, sessionLengthMin: 60, retired: false,
    });
    expect(catalog['Old'].retired).toBe(true);
    expect(Object.keys(catalog)).toHaveLength(2);
  });

  describe('packageSelectOptions', () => {
    it('lists active packages ascending by price, then Custom last', () => {
      const options = packageSelectOptions(toCatalog(TEST_CATALOG_ROWS));
      expect(options[0]).toBe('Thrive'); // cheapest
      expect(options[options.length - 2]).toBe('Apex'); // priciest
      expect(options[options.length - 1]).toBe(CUSTOM_PACKAGE);
      expect(options).toHaveLength(13);
    });

    it('hides retired packages from new selections', () => {
      const rows = TEST_CATALOG_ROWS.map(r =>
        r.id === 'Summit' ? {...r, retired: true} : r);
      const options = packageSelectOptions(toCatalog(rows));
      expect(options).not.toContain('Summit');
    });

    it('appends a stored retired current or pending value so the form never blanks', () => {
      const rows = TEST_CATALOG_ROWS.map(r =>
        r.id === 'Summit' || r.id === 'Excel' ? {...r, retired: true} : r);
      const options = packageSelectOptions(toCatalog(rows), ['Summit', 'Excel']);
      expect(options).toContain('Summit');
      expect(options).toContain('Excel');
      // Appended after Custom, not duplicated into the sorted actives.
      expect(options.indexOf('Summit')).toBeGreaterThan(options.indexOf(CUSTOM_PACKAGE));
    });

    it('does not duplicate an active stored value or append blanks', () => {
      const options = packageSelectOptions(toCatalog(TEST_CATALOG_ROWS), ['Apex', undefined, '']);
      expect(options.filter(o => o === 'Apex')).toHaveLength(1);
      expect(options).toHaveLength(13);
    });
  });
});
