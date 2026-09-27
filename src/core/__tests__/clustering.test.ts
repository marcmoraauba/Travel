import { describe, expect, it } from 'vitest';
import { assignPlacesToDays, ClusterPlace } from '../clustering';
import { datesBetween, formatDuration, formatHHMM, parseHHMM, weekdayIndex } from '../time';
import { estimateMatrix } from '../geo';

const place = (id: string, lat: number, lng: number, extra: Partial<ClusterPlace> = {}): ClusterPlace => ({
  id,
  coords: { lat, lng },
  durationMin: 60,
  ...extra,
});

describe('assignPlacesToDays', () => {
  // Dos barrios de Roma separados: Vaticano (oeste) y Coliseo (este).
  const vaticano = [place('v1', 41.9029, 12.4534), place('v2', 41.9065, 12.4536), place('v3', 41.9022, 12.4572)];
  const coliseo = [place('c1', 41.8902, 12.4922), place('c2', 41.8925, 12.4853), place('c3', 41.8894, 12.4869)];

  it('agrupa por zonas: cada barrio en un día', () => {
    const res = assignPlacesToDays([...vaticano, ...coliseo], [{ minutes: 600 }, { minutes: 600 }]);
    const dayV = new Set(vaticano.map((p) => res.get(p.id)));
    const dayC = new Set(coliseo.map((p) => res.get(p.id)));
    expect(dayV.size).toBe(1);
    expect(dayC.size).toBe(1);
    expect([...dayV][0]).not.toBe([...dayC][0]);
  });

  it('respeta el día fijado por una reserva', () => {
    const pinned = coliseo.map((p) => ({ ...p, pinnedDay: 0 }));
    const res = assignPlacesToDays([...vaticano, ...pinned], [{ minutes: 600 }, { minutes: 600 }]);
    expect(pinned.every((p) => res.get(p.id) === 0)).toBe(true);
    expect(vaticano.every((p) => res.get(p.id) === 1)).toBe(true);
  });

  it('mueve un lugar cerrado a otro día', () => {
    const closed = { ...vaticano[0], closedDays: [0, 2] };
    const res = assignPlacesToDays(
      [closed, ...vaticano.slice(1), ...coliseo],
      [{ minutes: 600 }, { minutes: 600 }, { minutes: 600 }],
    );
    expect(res.get(closed.id)).toBe(1);
  });

  it('reequilibra si un día se sobrecarga', () => {
    const res = assignPlacesToDays([...vaticano, ...coliseo], [{ minutes: 120 }, { minutes: 600 }]);
    const load0 = [...res.values()].filter((d) => d === 0).length * 60;
    expect(load0).toBeLessThanOrEqual(120);
  });

  it('un solo día: todo a ese día', () => {
    const res = assignPlacesToDays(vaticano, [{ minutes: 600 }]);
    expect([...res.values()]).toEqual([0, 0, 0]);
  });
});

describe('utilidades de tiempo y geo', () => {
  it('HH:MM ida y vuelta', () => {
    expect(parseHHMM('09:05')).toBe(545);
    expect(parseHHMM('24:00')).toBe(1440);
    expect(parseHHMM('25:00')).toBeNull();
    expect(formatHHMM(545)).toBe('09:05');
    expect(formatDuration(95)).toBe('1 h 35 min');
    expect(formatDuration(40)).toBe('40 min');
  });

  it('fechas del viaje', () => {
    expect(datesBetween('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(datesBetween('2026-11-02', '2026-10-30')).toEqual([]);
    expect(weekdayIndex('2026-09-27')).toBe(6); // domingo
  });

  it('matriz estimada simétrica y con ceros en la diagonal', () => {
    const m = estimateMatrix(
      [
        { lat: 41.9029, lng: 12.4534 },
        { lat: 41.8902, lng: 12.4922 },
      ],
      'walking',
    );
    expect(m[0][0]).toBe(0);
    expect(m[0][1]).toBe(m[1][0]);
    // ~3,5 km en línea recta → entre 45 y 75 min andando.
    expect(m[0][1]).toBeGreaterThan(45);
    expect(m[0][1]).toBeLessThan(75);
  });
});
