import {Package} from '../enums/package.enum';

export const packageMinutesMap: Record<Package, number> = {
  [Package.SUCCEED]: 240,
  [Package.ACHIEVE]: 360,
  [Package.VICTORY]: 360,
  [Package.EMPOWER]: 540,
  [Package.DETERMINATION]: 480,
  [Package.POWER_UP]: 720,
  [Package.THRIVE]: 120,
  [Package.EXCEL]: 180,
  [Package.CUSTOM]: 240,
}
