import { describe, expect, it } from 'vitest';
import { namesMatch } from './ai';
import { periodsToOsm } from './index';

describe('namesMatch', () => {
  it('acepta variantes del mismo nombre', () => {
    expect(namesMatch('Colosseo', 'Colosseum')).toBe(true);
    expect(namesMatch('Fontana di Trevi', 'Trevi Fountain')).toBe(true);
    expect(namesMatch('Museo del Prado', 'Museo Nacional del Prado')).toBe(true);
  });
  it('rechaza lugares distintos', () => {
    expect(namesMatch('Panteón', 'Piazza Navona')).toBe(false);
    expect(namesMatch('Sagrada Família', 'Park Güell')).toBe(false);
  });
});

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
