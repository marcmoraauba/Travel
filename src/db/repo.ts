import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { datesBetween } from '../core/time';
import type { Booking, Day, DayStop, Guide, GuideLength, Place, Trip } from './types';

/** Acceso a datos. Todas las funciones reciben la BD para poder testearlas y usarlas fuera de React. */

const now = () => new Date().toISOString();
const uuid = () => Crypto.randomUUID();

type Row = Record<string, unknown>;

const toTrip = (r: Row): Trip => ({
  id: r.id as string,
  city: r.city as string,
  centerLat: r.center_lat as number,
  centerLng: r.center_lng as number,
  startDate: r.start_date as string,
  endDate: r.end_date as string,
  pace: r.pace as Trip['pace'],
  transportMode: r.transport_mode as Trip['transportMode'],
  baseName: (r.base_name as string | null) ?? null,
  baseLat: (r.base_lat as number | null) ?? null,
  baseLng: (r.base_lng as number | null) ?? null,
  createdAt: r.created_at as string,
});

const toDay = (r: Row): Day => ({
  id: r.id as string,
  tripId: r.trip_id as string,
  date: r.date as string,
  startTime: r.start_time as string,
  endTime: r.end_time as string,
  notes: r.notes as string,
  optimizedAt: (r.optimized_at as string | null) ?? null,
});

const toPlace = (r: Row): Place => ({
  id: r.id as string,
  tripId: r.trip_id as string,
  dayId: (r.day_id as string | null) ?? null,
  name: r.name as string,
  lat: (r.lat as number | null) ?? null,
  lng: (r.lng as number | null) ?? null,
  address: (r.address as string | null) ?? null,
  category: (r.category as string | null) ?? null,
  visitMinutes: r.visit_minutes as number,
  priority: r.priority as Place['priority'],
  openingHours: (r.opening_hours as string | null) ?? null,
  hoursSource: (r.hours_source as Place['hoursSource']) ?? null,
  price: (r.price as string | null) ?? null,
  requiresBooking: Boolean(r.requires_booking),
  origin: r.origin as Place['origin'],
  geocoded: Boolean(r.geocoded),
  notes: r.notes as string,
  createdAt: r.created_at as string,
});

const toStop = (r: Row): DayStop => ({
  id: r.id as string,
  dayId: r.day_id as string,
  placeId: r.place_id as string,
  position: r.position as number,
  arrival: r.arrival as string,
  start: r.start as string,
  departure: r.departure as string,
  travelMinutes: r.travel_minutes as number,
  waitMinutes: r.wait_minutes as number,
  visited: Boolean(r.visited),
});

const toBooking = (r: Row): Booking => ({
  id: r.id as string,
  placeId: r.place_id as string,
  date: r.date as string,
  time: r.time as string,
  reference: r.reference as string,
});

// ——— Viajes ———

export async function listTrips(db: SQLiteDatabase): Promise<Trip[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM trips ORDER BY start_date DESC');
  return rows.map(toTrip);
}

export async function getTrip(db: SQLiteDatabase, id: string): Promise<Trip | null> {
  const r = await db.getFirstAsync<Row>('SELECT * FROM trips WHERE id = ?', id);
  return r ? toTrip(r) : null;
}

export type NewTrip = Omit<Trip, 'id' | 'createdAt'>;

export async function createTrip(db: SQLiteDatabase, t: NewTrip): Promise<string> {
  const id = uuid();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO trips (id, city, center_lat, center_lng, start_date, end_date, pace, transport_mode,
        base_name, base_lat, base_lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, t.city, t.centerLat, t.centerLng, t.startDate, t.endDate, t.pace, t.transportMode,
      t.baseName, t.baseLat, t.baseLng, now(),
    );
    for (const date of datesBetween(t.startDate, t.endDate)) {
      await db.runAsync('INSERT INTO days (id, trip_id, date) VALUES (?, ?, ?)', uuid(), id, date);
    }
  });
  return id;
}

export async function updateTrip(db: SQLiteDatabase, id: string, t: Partial<NewTrip>): Promise<void> {
  const current = await getTrip(db, id);
  if (!current) return;
  const next = { ...current, ...t };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE trips SET city = ?, center_lat = ?, center_lng = ?, start_date = ?, end_date = ?, pace = ?,
        transport_mode = ?, base_name = ?, base_lat = ?, base_lng = ? WHERE id = ?`,
      next.city, next.centerLat, next.centerLng, next.startDate, next.endDate, next.pace,
      next.transportMode, next.baseName, next.baseLat, next.baseLng, id,
    );
    // Sincroniza los días con el nuevo rango de fechas sin perder los que se mantienen.
    const wanted = new Set(datesBetween(next.startDate, next.endDate));
    const days = await listDays(db, id);
    for (const d of days) {
      if (!wanted.has(d.date)) await db.runAsync('DELETE FROM days WHERE id = ?', d.id);
    }
    const existing = new Set(days.map((d) => d.date));
    for (const date of wanted) {
      if (!existing.has(date)) await db.runAsync('INSERT INTO days (id, trip_id, date) VALUES (?, ?, ?)', uuid(), id, date);
    }
  });
}

export async function deleteTrip(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM trips WHERE id = ?', id);
}

// ——— Días ———

export async function listDays(db: SQLiteDatabase, tripId: string): Promise<Day[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM days WHERE trip_id = ? ORDER BY date', tripId);
  return rows.map(toDay);
}

export async function getDay(db: SQLiteDatabase, id: string): Promise<Day | null> {
  const r = await db.getFirstAsync<Row>('SELECT * FROM days WHERE id = ?', id);
  return r ? toDay(r) : null;
}

export async function updateDay(
  db: SQLiteDatabase,
  id: string,
  d: Partial<Pick<Day, 'startTime' | 'endTime' | 'notes'>>,
): Promise<void> {
  const current = await getDay(db, id);
  if (!current) return;
  const next = { ...current, ...d };
  await db.runAsync(
    'UPDATE days SET start_time = ?, end_time = ?, notes = ? WHERE id = ?',
    next.startTime, next.endTime, next.notes, id,
  );
}

// ——— Lugares ———

export async function listPlaces(db: SQLiteDatabase, tripId: string): Promise<Place[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM places WHERE trip_id = ? ORDER BY created_at', tripId);
  return rows.map(toPlace);
}

export async function getPlace(db: SQLiteDatabase, id: string): Promise<Place | null> {
  const r = await db.getFirstAsync<Row>('SELECT * FROM places WHERE id = ?', id);
  return r ? toPlace(r) : null;
}

export type NewPlace = Omit<Place, 'id' | 'createdAt'>;

export async function createPlace(db: SQLiteDatabase, p: NewPlace): Promise<string> {
  const id = uuid();
  await db.runAsync(
    `INSERT INTO places (id, trip_id, day_id, name, lat, lng, address, category, visit_minutes, priority,
      opening_hours, hours_source, price, requires_booking, origin, geocoded, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, p.tripId, p.dayId, p.name, p.lat, p.lng, p.address, p.category, p.visitMinutes, p.priority,
    p.openingHours, p.hoursSource, p.price, p.requiresBooking ? 1 : 0, p.origin, p.geocoded ? 1 : 0,
    p.notes, now(),
  );
  return id;
}

export async function updatePlace(db: SQLiteDatabase, id: string, p: Partial<NewPlace>): Promise<void> {
  const current = await getPlace(db, id);
  if (!current) return;
  const n = { ...current, ...p };
  await db.runAsync(
    `UPDATE places SET day_id = ?, name = ?, lat = ?, lng = ?, address = ?, category = ?, visit_minutes = ?,
      priority = ?, opening_hours = ?, hours_source = ?, price = ?, requires_booking = ?, origin = ?,
      geocoded = ?, notes = ? WHERE id = ?`,
    n.dayId, n.name, n.lat, n.lng, n.address, n.category, n.visitMinutes, n.priority, n.openingHours,
    n.hoursSource, n.price, n.requiresBooking ? 1 : 0, n.origin, n.geocoded ? 1 : 0, n.notes, id,
  );
}

export async function deletePlace(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM places WHERE id = ?', id);
}

// ——— Reservas ———

export async function getBooking(db: SQLiteDatabase, placeId: string): Promise<Booking | null> {
  const r = await db.getFirstAsync<Row>('SELECT * FROM bookings WHERE place_id = ?', placeId);
  return r ? toBooking(r) : null;
}

export async function listBookings(db: SQLiteDatabase, tripId: string): Promise<Booking[]> {
  const rows = await db.getAllAsync<Row>(
    'SELECT b.* FROM bookings b JOIN places p ON p.id = b.place_id WHERE p.trip_id = ?',
    tripId,
  );
  return rows.map(toBooking);
}

export async function saveBooking(db: SQLiteDatabase, b: Omit<Booking, 'id'>): Promise<void> {
  await db.runAsync(
    `INSERT INTO bookings (id, place_id, date, time, reference) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(place_id) DO UPDATE SET date = excluded.date, time = excluded.time, reference = excluded.reference`,
    uuid(), b.placeId, b.date, b.time, b.reference,
  );
}

export async function deleteBooking(db: SQLiteDatabase, placeId: string): Promise<void> {
  await db.runAsync('DELETE FROM bookings WHERE place_id = ?', placeId);
}

// ——— Paradas optimizadas ———

export async function listStops(db: SQLiteDatabase, dayId: string): Promise<DayStop[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM day_stops WHERE day_id = ? ORDER BY position', dayId);
  return rows.map(toStop);
}

export async function replaceStops(
  db: SQLiteDatabase,
  dayId: string,
  stops: (Omit<DayStop, 'id' | 'dayId' | 'visited'> & { visited?: boolean })[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM day_stops WHERE day_id = ?', dayId);
    for (const s of stops) {
      await db.runAsync(
        `INSERT INTO day_stops (id, day_id, place_id, position, arrival, start, departure, travel_minutes, wait_minutes, visited)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        uuid(), dayId, s.placeId, s.position, s.arrival, s.start, s.departure, s.travelMinutes, s.waitMinutes,
        s.visited ? 1 : 0,
      );
    }
    await db.runAsync('UPDATE days SET optimized_at = ? WHERE id = ?', now(), dayId);
  });
}

export async function setStopVisited(db: SQLiteDatabase, stopId: string, visited: boolean): Promise<void> {
  await db.runAsync('UPDATE day_stops SET visited = ? WHERE id = ?', visited ? 1 : 0, stopId);
}

export async function clearStops(db: SQLiteDatabase, dayId: string): Promise<void> {
  await db.runAsync('DELETE FROM day_stops WHERE day_id = ?', dayId);
  await db.runAsync('UPDATE days SET optimized_at = NULL WHERE id = ?', dayId);
}

// ——— Guías ———

const toGuide = (r: Row): Guide => ({
  placeId: r.place_id as string,
  language: r.language as string,
  length: r.length as GuideLength,
  text: r.text as string,
  audioPath: (r.audio_path as string | null) ?? null,
  generatedAt: r.generated_at as string,
});

export async function getGuide(db: SQLiteDatabase, placeId: string, language: string, length: GuideLength): Promise<Guide | null> {
  const r = await db.getFirstAsync<Row>(
    'SELECT * FROM guides WHERE place_id = ? AND language = ? AND length = ?',
    placeId, language, length,
  );
  return r ? toGuide(r) : null;
}

/** Ids de lugares del viaje que ya tienen guardada una guía de esa longitud. */
export async function placesWithGuide(db: SQLiteDatabase, tripId: string, language: string, length: GuideLength): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ place_id: string }>(
    `SELECT g.place_id FROM guides g JOIN places p ON p.id = g.place_id
     WHERE p.trip_id = ? AND g.language = ? AND g.length = ?`,
    tripId, language, length,
  );
  return new Set(rows.map((r) => r.place_id));
}

export async function saveGuide(db: SQLiteDatabase, g: Omit<Guide, 'generatedAt' | 'audioPath'>): Promise<void> {
  await db.runAsync(
    `INSERT INTO guides (place_id, language, length, text, audio_path, generated_at) VALUES (?, ?, ?, ?, NULL, ?)
     ON CONFLICT(place_id, language, length) DO UPDATE SET text = excluded.text, generated_at = excluded.generated_at`,
    g.placeId, g.language, g.length, g.text, now(),
  );
}

/** Borra todos los datos locales (Ajustes → "Borrar mis datos"; lo exigen las tiendas). */
export async function wipeAll(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('DELETE FROM trips;');
}
