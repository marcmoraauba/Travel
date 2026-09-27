import { describe, expect, it } from 'vitest';
import { DayInput, OptStop, optimizeDay, scheduleFixedOrder } from '../optimizer';

/** Puntos en una recta: la distancia entre i y j es |x_i - x_j| minutos. */
function lineMatrix(xs: number[]): number[][] {
  return xs.map((a) => xs.map((b) => Math.abs(a - b)));
}

const stop = (id: string, extra: Partial<OptStop> = {}): OptStop => ({
  id,
  durationMin: 60,
  priority: 'must',
  windows: null,
  ...extra,
});

describe('optimizeDay', () => {
  it('ordena por geometría y no por orden de entrada', () => {
    // Hotel en 0, lugares desordenados en 30, 10, 20; se vuelve al hotel.
    const input: DayInput = {
      stops: [stop('C'), stop('A'), stop('B')],
      matrix: lineMatrix([0, 30, 10, 20, 0]),
      dayStart: 9 * 60,
      dayEnd: 20 * 60,
    };
    const plan = optimizeDay(input);
    const ids = plan.visits.map((v) => v.id);
    // Cualquier recorrido monótono es óptimo (60 min en total).
    expect([['A', 'B', 'C'], ['C', 'B', 'A']]).toContainEqual(ids);
    expect(plan.totalTravelMin).toBe(60);
    expect(plan.dropped).toEqual([]);
  });

  it('respeta horarios de apertura aunque suponga más desplazamiento', () => {
    // El museo lejano solo abre por la mañana: tiene que ir primero.
    const input: DayInput = {
      stops: [stop('cerca'), stop('museo', { windows: [[9 * 60, 11 * 60]] })],
      matrix: lineMatrix([0, 5, 40, 0]),
      dayStart: 9 * 60,
      dayEnd: 20 * 60,
    };
    const plan = optimizeDay(input);
    expect(plan.visits.map((v) => v.id)).toEqual(['museo', 'cerca']);
    expect(plan.visits[0].end).toBeLessThanOrEqual(11 * 60);
  });

  it('coloca la reserva a su hora exacta', () => {
    const input: DayInput = {
      stops: [stop('libre1'), stop('reserva', { fixedStart: 12 * 60 }), stop('libre2')],
      matrix: lineMatrix([0, 10, 20, 30, 0]),
      dayStart: 9 * 60,
      dayEnd: 20 * 60,
    };
    const plan = optimizeDay(input);
    const reserva = plan.visits.find((v) => v.id === 'reserva');
    expect(reserva?.start).toBe(12 * 60);
    expect(plan.dropped).toEqual([]);
  });

  it('descarta primero los opcionales cuando no cabe todo', () => {
    const input: DayInput = {
      stops: [
        stop('opcional', { priority: 'optional', durationMin: 180 }),
        stop('imprescindible', { durationMin: 180 }),
      ],
      matrix: lineMatrix([0, 10, 10, 0]),
      dayStart: 9 * 60,
      dayEnd: 13 * 60,
    };
    const plan = optimizeDay(input);
    expect(plan.visits.map((v) => v.id)).toEqual(['imprescindible']);
    expect(plan.dropped).toEqual([{ id: 'opcional', reason: 'no_time' }]);
  });

  it('marca como cerrado un lugar sin ventanas ese día', () => {
    const plan = optimizeDay({
      stops: [stop('abierto'), stop('cerrado', { windows: [] })],
      matrix: lineMatrix([0, 10, 20, 0]),
      dayStart: 9 * 60,
      dayEnd: 20 * 60,
    });
    expect(plan.dropped).toEqual([{ id: 'cerrado', reason: 'closed' }]);
  });

  it('informa del conflicto cuando la reserva es imposible', () => {
    const plan = optimizeDay({
      stops: [stop('reserva', { fixedStart: 9 * 60 + 5 })],
      matrix: lineMatrix([0, 30, 0]),
      dayStart: 9 * 60,
      dayEnd: 20 * 60,
    });
    expect(plan.dropped).toEqual([{ id: 'reserva', reason: 'booking_conflict' }]);
  });

  it('evita encadenar museos si hay alternativa barata', () => {
    // Dos museos y un parque muy juntos: se intercala el parque.
    const plan = optimizeDay({
      stops: [
        stop('m1', { category: 'museum' }),
        stop('m2', { category: 'museum' }),
        stop('parque', { category: 'park' }),
      ],
      matrix: lineMatrix([0, 1, 2, 3, 0]),
      dayStart: 9 * 60,
      dayEnd: 20 * 60,
    });
    const cats = plan.visits.map((v) => v.id);
    expect(cats[1]).toBe('parque');
  });

  it('incluye la comida dentro del rango preferido', () => {
    const plan = optimizeDay({
      stops: [stop('a', { durationMin: 150 }), stop('b', { durationMin: 150 })],
      matrix: lineMatrix([0, 10, 20, 0]),
      dayStart: 9 * 60,
      dayEnd: 20 * 60,
      lunch: { earliest: 13 * 60, latest: 14 * 60 + 30, durationMin: 60 },
    });
    expect(plan.lunch).not.toBeNull();
    expect(plan.lunch!.start).toBeGreaterThanOrEqual(13 * 60);
    expect(plan.lunch!.start).toBeLessThanOrEqual(14 * 60 + 30);
    // Ninguna visita se solapa con la comida.
    for (const v of plan.visits) {
      expect(v.end <= plan.lunch!.start || v.start >= plan.lunch!.end).toBe(true);
    }
  });

  it('las horas son coherentes: llegada + espera = inicio, inicio + duración = fin', () => {
    const plan = optimizeDay({
      stops: [stop('a', { windows: [[10 * 60, 18 * 60]] }), stop('b'), stop('c', { durationMin: 45 })],
      matrix: lineMatrix([0, 15, 25, 35, 0]),
      dayStart: 9 * 60,
      dayEnd: 20 * 60,
      slackMin: 5,
    });
    for (const v of plan.visits) {
      expect(v.arrival + v.waitMin).toBe(v.start);
      expect(v.end).toBeGreaterThan(v.start);
    }
    expect(plan.finishAt).toBeLessThanOrEqual(20 * 60);
  });

  it('escala a un día cargado en poco tiempo', () => {
    const n = 15;
    const xs = [0, ...Array.from({ length: n }, (_, i) => ((i * 37) % 50) + 1), 0];
    const stops = Array.from({ length: n }, (_, i) =>
      stop(`p${i}`, { durationMin: 20, priority: i % 3 === 0 ? 'must' : 'optional' }),
    );
    const t0 = Date.now();
    const plan = optimizeDay({ stops, matrix: lineMatrix(xs), dayStart: 9 * 60, dayEnd: 21 * 60 });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(plan.visits.length + plan.dropped.length).toBe(n);
  });

  it('rechaza una matriz con dimensiones incorrectas', () => {
    expect(() =>
      optimizeDay({ stops: [stop('a')], matrix: [[0]], dayStart: 0, dayEnd: 100 }),
    ).toThrow();
  });
});

describe('scheduleFixedOrder', () => {
  it('respeta el orden del usuario y recalcula horas', () => {
    const input: DayInput = {
      stops: [stop('A'), stop('B')],
      matrix: lineMatrix([0, 10, 20, 0]),
      dayStart: 9 * 60,
      dayEnd: 20 * 60,
    };
    const plan = scheduleFixedOrder(input, ['B', 'A']);
    expect(plan?.visits.map((v) => v.id)).toEqual(['B', 'A']);
    expect(plan?.visits[0].arrival).toBe(9 * 60 + 20);
  });

  it('devuelve null si el orden es inviable', () => {
    const input: DayInput = {
      stops: [stop('A', { windows: [[9 * 60, 10 * 60 + 15]] }), stop('B')],
      matrix: lineMatrix([0, 10, 10, 0]),
      dayStart: 9 * 60,
      dayEnd: 20 * 60,
    };
    expect(scheduleFixedOrder(input, ['B', 'A'])).toBeNull();
  });
});
