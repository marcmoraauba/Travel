import { describe, expect, it } from 'vitest';
import type { Booking, Day, Place, Trip } from '../../db/types';
import { buildDayInput, matrixPoints, planToStops } from '../planning';
import { splitForSpeech } from '../speechText';
import { localISODate, localMinutes } from '../time';

const trip: Trip = {
  id: 't', city: 'Roma', centerLat: 41.9, centerLng: 12.49, startDate: '2026-10-05', endDate: '2026-10-05',
  pace: 'normal', transportMode: 'walking', baseName: null, baseLat: null, baseLng: null, createdAt: '',
};
const day: Day = { id: 'd', tripId: 't', date: '2026-10-05', startTime: '09:00', endTime: '20:00', notes: '', optimizedAt: null };
const place = (id: string, extra: Partial<Place> = {}): Place => ({
  id, tripId: 't', dayId: 'd', name: id, lat: 41.9, lng: 12.5, address: null, category: null, visitMinutes: 60,
  priority: 'optional', openingHours: null, hoursSource: null, price: null, requiresBooking: false, origin: 'manual',
  geocoded: true, notes: '', createdAt: '', ...extra,
});
const zero = (n: number) => Array.from({ length: n }, () => Array(n).fill(0));

describe('buildDayInput', () => {
  it('traduce reservas del día, horarios y comida', () => {
    const bookings: Booking[] = [
      { id: 'b', placeId: 'a', date: '2026-10-05', time: '12:00', reference: '' },
      { id: 'c', placeId: 'b', date: '2026-10-06', time: '10:00', reference: '' },
    ];
    // 2026-10-05 es lunes.
    const input = buildDayInput(trip, day, [place('a'), place('b', { openingHours: 'Mo off; Tu-Su 09:00-18:00' })], bookings, zero(4));
    expect(input.stops[0].fixedStart).toBe(720);
    expect(input.stops[1].fixedStart).toBeUndefined();
    expect(input.stops[1].windows).toEqual([]);
    expect(input.lunch).toBeDefined();
  });

  it('al recalcular empieza a la hora indicada y sin comida si ya pasó', () => {
    const input = buildDayInput(trip, day, [place('a')], [], zero(3), { startAt: 16 * 60 });
    expect(input.dayStart).toBe(960);
    expect(input.lunch).toBeUndefined();
  });

  it('nunca empieza antes del inicio planificado', () => {
    expect(buildDayInput(trip, day, [place('a')], [], zero(3), { startAt: 7 * 60 }).dayStart).toBe(540);
  });

  it('ignora lugares sin ubicar', () => {
    expect(buildDayInput(trip, day, [place('a'), place('x', { lat: null, lng: null })], [], zero(3)).stops).toHaveLength(1);
  });
});

describe('matrixPoints y planToStops', () => {
  it('sale del origen indicado y vuelve a la base', () => {
    const pts = matrixPoints(trip, [place('a')], { lat: 1, lng: 2 });
    expect(pts[0]).toEqual({ lat: 1, lng: 2 });
    expect(pts[2]).toEqual({ lat: 41.9, lng: 12.49 });
  });

  it('numera a partir de la posición indicada', () => {
    const stops = planToStops(
      {
        visits: [{ id: 'a', arrival: 600, start: 610, end: 670, travelMin: 12, waitMin: 10 }],
        dropped: [], lunch: null, returnTravelMin: 0, finishAt: 700, totalTravelMin: 12, totalWaitMin: 10, cost: 0,
      },
      3,
    );
    expect(stops[0]).toMatchObject({ position: 3, arrival: '10:00', start: '10:10', departure: '11:10' });
  });
});

describe('splitForSpeech', () => {
  it('separa por párrafos', () => {
    expect(splitForSpeech('Uno.\n\nDos.\nTres.')).toEqual(['Uno.', 'Dos.', 'Tres.']);
  });
  it('parte párrafos largos por frases sin pasar del máximo', () => {
    const para = Array.from({ length: 30 }, (_, i) => `Frase número ${i}.`).join(' ');
    const parts = splitForSpeech(para, 100);
    expect(parts.every((p) => p.length <= 100)).toBe(true);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(para);
  });
});

describe('hora local', () => {
  it('usa la zona del dispositivo', () => {
    const d = new Date(2026, 9, 5, 23, 45);
    expect(localISODate(d)).toBe('2026-10-05');
    expect(localMinutes(d)).toBe(23 * 60 + 45);
  });
});
