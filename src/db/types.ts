import type { TransportMode } from '../core/geo';
import type { Priority } from '../core/optimizer';

/** Modelo de datos (§4 del plan). Local-first en SQLite, preparado para multiusuario. */

export type Pace = 'relaxed' | 'normal' | 'intense';
export type HoursSource = 'osm' | 'manual' | 'ai_unverified';
export type PlaceOrigin = 'manual' | 'search' | 'ai';

export interface Trip {
  id: string;
  city: string;
  centerLat: number;
  centerLng: number;
  startDate: string;
  endDate: string;
  pace: Pace;
  transportMode: TransportMode;
  /** Punto de inicio y fin de cada día (hotel). Opcional: si falta, se usa el centro. */
  baseName: string | null;
  baseLat: number | null;
  baseLng: number | null;
  createdAt: string;
}

export interface Day {
  id: string;
  tripId: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  /** Resultado de la última optimización ya aplicado a day_stops. */
  optimizedAt: string | null;
}

export interface Place {
  id: string;
  tripId: string;
  /** Día asignado; null = aún sin repartir. */
  dayId: string | null;
  name: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  category: string | null;
  visitMinutes: number;
  priority: Priority;
  openingHours: string | null;
  hoursSource: HoursSource | null;
  price: string | null;
  requiresBooking: boolean;
  origin: PlaceOrigin;
  geocoded: boolean;
  notes: string;
  createdAt: string;
}

export interface DayStop {
  id: string;
  dayId: string;
  placeId: string;
  position: number;
  arrival: string;
  start: string;
  departure: string;
  travelMinutes: number;
  waitMinutes: number;
  visited: boolean;
}

export interface Booking {
  id: string;
  placeId: string;
  /** Fecha y hora fijas: "YYYY-MM-DD" + "HH:MM". */
  date: string;
  time: string;
  reference: string;
}

export type GuideLength = 'short' | 'standard' | 'long';

export interface Guide {
  placeId: string;
  language: string;
  length: GuideLength;
  text: string;
  /** Reservado para audio pregenerado (voz neuronal). Hoy se narra con la voz del sistema. */
  audioPath: string | null;
  generatedAt: string;
}
