import type { Booking, Day, Pace, Place, Trip } from '../db/types';
import type { LatLng } from './geo';
import { windowsForDate } from './openingHours';
import type { DayInput, DayPlan, OptStop } from './optimizer';
import { formatHHMM, Minutes, parseHHMM } from './time';

/**
 * Puente entre el modelo de datos y el optimizador. Puro: la red (matriz) y la BD quedan fuera.
 */

const PACE: Record<Pace, { slackMin: number; lunchMin: number }> = {
  relaxed: { slackMin: 15, lunchMin: 75 },
  normal: { slackMin: 5, lunchMin: 60 },
  intense: { slackMin: 0, lunchMin: 45 },
};

export function tripBase(trip: Trip): LatLng {
  return trip.baseLat !== null && trip.baseLng !== null
    ? { lat: trip.baseLat, lng: trip.baseLng }
    : { lat: trip.centerLat, lng: trip.centerLng };
}

export const isRoutable = (p: Place): p is Place & { lat: number; lng: number } => p.lat !== null && p.lng !== null;

/**
 * Puntos para la matriz, en el orden que espera el optimizador: salida, lugares, base.
 * La salida es la base salvo al recalcular a mitad de día (`origin` = donde está el viajero).
 */
export function matrixPoints(trip: Trip, places: Place[], origin?: LatLng): LatLng[] {
  const base = tripBase(trip);
  return [origin ?? base, ...places.filter(isRoutable).map((p) => ({ lat: p.lat, lng: p.lng })), base];
}

/** Opciones para recalcular a mitad de día: empezar a otra hora (y, vía matriz, desde otro punto). */
export interface ReplanOptions {
  startAt?: Minutes;
}

export function buildDayInput(
  trip: Trip,
  day: Day,
  places: Place[],
  bookings: Booking[],
  matrix: number[][],
  options: ReplanOptions = {},
): DayInput {
  const routable = places.filter(isRoutable);
  const bookingByPlace = new Map(bookings.filter((b) => b.date === day.date).map((b) => [b.placeId, b]));
  const stops: OptStop[] = routable.map((p) => {
    const booking = bookingByPlace.get(p.id);
    const fixed = booking ? parseHHMM(booking.time) : null;
    return {
      id: p.id,
      durationMin: p.visitMinutes,
      priority: p.priority,
      windows: windowsForDate(p.openingHours, day.date),
      fixedStart: fixed ?? undefined,
      category: p.category ?? undefined,
    };
  });
  const pace = PACE[trip.pace];
  const plannedStart = parseHHMM(day.startTime) ?? 9 * 60;
  const dayStart = options.startAt !== undefined ? Math.max(options.startAt, plannedStart) : plannedStart;
  const dayEnd = parseHHMM(day.endTime) ?? 20 * 60;
  return {
    stops,
    matrix,
    dayStart,
    dayEnd,
    slackMin: pace.slackMin,
    // Solo se planifica la comida si el día cubre la franja.
    lunch:
      dayStart < 13 * 60 && dayEnd > 15 * 60
        ? { earliest: 13 * 60, latest: 14 * 60 + 30, durationMin: pace.lunchMin }
        : undefined,
    heavyCategories: ['museum'],
  };
}

export function planToStops(plan: DayPlan, firstPosition = 0) {
  return plan.visits.map((v, i) => ({
    placeId: v.id,
    position: firstPosition + i,
    arrival: formatHHMM(v.arrival),
    start: formatHHMM(v.start),
    departure: formatHHMM(v.end),
    travelMinutes: Math.round(v.travelMin),
    waitMinutes: Math.round(v.waitMin),
  }));
}

export const DROP_REASON_TEXT: Record<string, string> = {
  closed: 'Cerrado ese día',
  booking_conflict: 'La reserva no encaja con el resto del día',
  no_time: 'No cabe en el horario del día',
};
