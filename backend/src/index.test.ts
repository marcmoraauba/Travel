import { describe, expect, it } from 'vitest';
import { periodsToOsm } from './index';

describe('periodsToOsm', () => {
  it('convierte periodos de Mapbox (0 = domingo) a opening_hours', () => {
    const osm = periodsToOsm([
      { open: { day: 1, time: '0900' }, close: { day: 1, time: '1800' } },
      { open: { day: 6, time: '1000' }, close: { day: 6, time: '1400' } },
    ]);
    expect(osm).toBe('Mo 09:00-18:00; Tu off; We off; Th off; Fr off; Sa 10:00-14:00; Su off');
  });
  it('sin datos → null', () => {
    expect(periodsToOsm(undefined)).toBeNull();
  });
});
