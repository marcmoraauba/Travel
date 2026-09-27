import { describe, expect, it } from 'vitest';
import { parseOpeningHours, windowsForDate } from '../openingHours';

describe('parseOpeningHours', () => {
  it('24/7', () => {
    const week = parseOpeningHours('24/7');
    expect(week?.every((d) => d.length === 1 && d[0][0] === 0 && d[0][1] === 1440)).toBe(true);
  });

  it('reglas por días con sobrescritura', () => {
    const week = parseOpeningHours('Mo-Su 09:00-18:00; Mo off; Sa 10:00-14:00')!;
    expect(week[0]).toEqual([]);
    expect(week[1]).toEqual([[540, 1080]]);
    expect(week[5]).toEqual([[600, 840]]);
    expect(week[6]).toEqual([[540, 1080]]);
  });

  it('horario partido y listas de días', () => {
    const week = parseOpeningHours('Tu,Th 09:30-13:30,16:00-19:00')!;
    expect(week[1]).toEqual([
      [570, 810],
      [960, 1140],
    ]);
    expect(week[0]).toEqual([]);
  });

  it('rango que da la vuelta a la semana', () => {
    const week = parseOpeningHours('Fr-Mo 10:00-12:00')!;
    expect([0, 4, 5, 6].every((d) => week[d].length === 1)).toBe(true);
    expect(week[2]).toEqual([]);
  });

  it('sin selector de días = todos', () => {
    expect(parseOpeningHours('09:00-20:00')![3]).toEqual([[540, 1200]]);
  });

  it('cierre pasada la medianoche se recorta a las 24:00', () => {
    expect(parseOpeningHours('Fr 20:00-02:00')![4]).toEqual([[1200, 1440]]);
  });

  it('lo que no entiende devuelve null en vez de inventar', () => {
    expect(parseOpeningHours('Mo-Fr 09:00-18:00; PH off')).toBeNull();
    expect(parseOpeningHours('sunrise-sunset')).toBeNull();
    expect(parseOpeningHours('')).toBeNull();
    expect(parseOpeningHours(null)).toBeNull();
  });
});

describe('windowsForDate', () => {
  it('usa el día de la semana de la fecha', () => {
    // 2026-09-28 es lunes.
    expect(windowsForDate('Mo off; Tu-Su 09:00-18:00', '2026-09-28')).toEqual([]);
    expect(windowsForDate('Mo off; Tu-Su 09:00-18:00', '2026-09-29')).toEqual([[540, 1080]]);
  });
});
