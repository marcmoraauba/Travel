import type { SQLiteDatabase } from 'expo-sqlite';
import { isRoutable } from '../core/planning';
import * as repo from '../db/repo';
import type { GuideLength, Place, Trip } from '../db/types';
import { fetchGuideText } from './api';

export const GUIDE_LANG = 'es';
export const GUIDE_LENGTHS: { value: GuideLength; label: string }[] = [
  { value: 'short', label: '30 s' },
  { value: 'standard', label: '2 min' },
  { value: 'long', label: '5 min' },
];

/** Guía de un lugar: primero la guardada en el móvil; si no hay, se pide al backend y se guarda. */
export async function getOrFetchGuide(db: SQLiteDatabase, trip: Trip, place: Place, length: GuideLength): Promise<string> {
  const local = await repo.getGuide(db, place.id, GUIDE_LANG, length);
  if (local) return local.text;
  if (!isRoutable(place)) throw new Error('Ubica el lugar en el mapa para poder generar su guía.');
  const text = await fetchGuideText({
    name: place.name,
    city: trip.city,
    lat: place.lat,
    lng: place.lng,
    category: place.category,
    length,
    lang: GUIDE_LANG,
  });
  await repo.saveGuide(db, { placeId: place.id, language: GUIDE_LANG, length, text });
  return text;
}

/**
 * Descarga antes del viaje las guías que falten (§6: en destino puede no haber datos).
 * Devuelve cuántas fallaron; las ya guardadas no se vuelven a pedir.
 */
export async function prepareTripGuides(
  db: SQLiteDatabase,
  tripId: string,
  onProgress: (done: number, total: number) => void,
): Promise<{ failed: number; total: number }> {
  const trip = await repo.getTrip(db, tripId);
  if (!trip) throw new Error('Viaje no encontrado');
  const places = (await repo.listPlaces(db, tripId)).filter(isRoutable);

  const jobs: { place: Place; length: GuideLength }[] = [];
  for (const { value: length } of GUIDE_LENGTHS) {
    const have = await repo.placesWithGuide(db, tripId, GUIDE_LANG, length);
    for (const place of places) if (!have.has(place.id)) jobs.push({ place, length });
  }

  let done = 0;
  let failed = 0;
  onProgress(0, jobs.length);
  // Pocas a la vez: cada guía nueva tarda unos segundos en generarse.
  const queue = [...jobs];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        await getOrFetchGuide(db, trip, job.place, job.length);
      } catch {
        failed += 1;
      }
      done += 1;
      onProgress(done, jobs.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { failed, total: jobs.length };
}

/** Lugares ubicados del viaje y cuántos tienen ya todas sus guías descargadas. */
export async function guideCoverage(db: SQLiteDatabase, tripId: string): Promise<{ ready: number; total: number }> {
  const places = (await repo.listPlaces(db, tripId)).filter(isRoutable);
  const sets = await Promise.all(GUIDE_LENGTHS.map((l) => repo.placesWithGuide(db, tripId, GUIDE_LANG, l.value)));
  const ready = places.filter((p) => sets.every((s) => s.has(p.id))).length;
  return { ready, total: places.length };
}
