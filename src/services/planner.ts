import type { SQLiteDatabase } from 'expo-sqlite';
import { assignPlacesToDays } from '../core/clustering';
import { weekdayIndex, parseHHMM } from '../core/time';
import { parseOpeningHours } from '../core/openingHours';
import { optimizeDay, DayPlan } from '../core/optimizer';
import { buildDayInput, isRoutable, matrixPoints, planToStops } from '../core/planning';
import * as repo from '../db/repo';
import { travelMatrix } from './api';

export interface OptimizeResult {
  plan: DayPlan;
  matrixSource: 'mapbox' | 'estimate';
  /** Lugares del día sin coordenadas: no se pueden enrutar hasta que se ubiquen. */
  unlocated: string[];
}

/** Optimiza un día y guarda el resultado como paradas. */
export async function optimizeAndSaveDay(db: SQLiteDatabase, dayId: string): Promise<OptimizeResult> {
  const day = await repo.getDay(db, dayId);
  if (!day) throw new Error('Día no encontrado');
  const trip = await repo.getTrip(db, day.tripId);
  if (!trip) throw new Error('Viaje no encontrado');

  const places = (await repo.listPlaces(db, trip.id)).filter((p) => p.dayId === dayId);
  const bookings = await repo.listBookings(db, trip.id);
  const routable = places.filter(isRoutable);
  const unlocated = places.filter((p) => !isRoutable(p)).map((p) => p.name);

  const { minutes, source } = await travelMatrix(matrixPoints(trip, routable), trip.transportMode);
  const plan = optimizeDay(buildDayInput(trip, day, routable, bookings, minutes));
  await repo.replaceStops(db, dayId, planToStops(plan));
  return { plan, matrixSource: source, unlocated };
}

/**
 * Reparte entre los días del viaje los lugares aún sin día (o todos si `all`), agrupando por zonas.
 * Los lugares con reserva van a su día. Después optimiza cada día.
 */
export async function distributeTrip(db: SQLiteDatabase, tripId: string, all = false): Promise<void> {
  const days = await repo.listDays(db, tripId);
  if (days.length === 0) return;
  const places = (await repo.listPlaces(db, tripId)).filter(isRoutable).filter((p) => all || p.dayId === null);
  const bookings = await repo.listBookings(db, tripId);
  const bookingDay = new Map(bookings.map((b) => [b.placeId, days.findIndex((d) => d.date === b.date)]));

  const capacity = days.map((d) => {
    const span = (parseHHMM(d.endTime) ?? 1200) - (parseHHMM(d.startTime) ?? 540);
    // ~35 % del día se va en desplazamientos, comida y colchones.
    return { minutes: Math.round(span * 0.65) };
  });

  // Si se reparten solo los nuevos, cuenta lo que ya ocupa cada día.
  if (!all) {
    const assigned = (await repo.listPlaces(db, tripId)).filter((p) => p.dayId !== null);
    for (const p of assigned) {
      const idx = days.findIndex((d) => d.id === p.dayId);
      if (idx >= 0) capacity[idx].minutes = Math.max(0, capacity[idx].minutes - p.visitMinutes);
    }
  }

  const assignment = assignPlacesToDays(
    places.map((p) => {
      const week = parseOpeningHours(p.openingHours);
      const pinned = bookingDay.get(p.id);
      return {
        id: p.id,
        coords: { lat: p.lat, lng: p.lng },
        durationMin: p.visitMinutes,
        pinnedDay: pinned !== undefined && pinned >= 0 ? pinned : undefined,
        closedDays: week ? days.map((d, i) => (week[weekdayIndex(d.date)].length === 0 ? i : -1)).filter((i) => i >= 0) : [],
      };
    }),
    capacity,
  );

  for (const p of places) {
    const idx = assignment.get(p.id);
    if (idx !== undefined) await repo.updatePlace(db, p.id, { dayId: days[idx].id });
  }
  for (const d of days) {
    await optimizeAndSaveDay(db, d.id);
  }
}
