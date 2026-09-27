import { estimateMatrix, LatLng, TransportMode } from '../core/geo';
import type { GuideLength } from '../db/types';
import { config, hasBackend } from './config';

/** Cliente del backend (backend/src/index.ts). Si no hay backend o red, degrada con elegancia. */

export interface SearchResult {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  category: string | null;
  openingHours: string | null;
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 12_000): Promise<T> {
  if (!hasBackend()) throw new Error('Backend no configurado (EXPO_PUBLIC_API_URL)');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(config.appKey ? { 'X-App-Key': config.appKey } : {}),
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `HTTP ${res.status} en ${path}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/** Busca lugares (POI) cerca de un punto, o ciudades si `kind` = 'city'. */
export async function searchPlaces(query: string, near?: LatLng, kind: 'poi' | 'city' = 'poi'): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, kind });
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lng', String(near.lng));
  }
  const data = await request<{ results: SearchResult[] }>(`/v1/search?${params}`);
  return data.results;
}

export interface TravelMatrix {
  minutes: number[][];
  source: 'mapbox' | 'estimate';
}

/** Matriz de tiempos reales; si falla la red o hay demasiados puntos, estimación local. */
export async function travelMatrix(points: LatLng[], mode: TransportMode): Promise<TravelMatrix> {
  if (hasBackend() && points.length <= 25) {
    try {
      const data = await request<{ minutes: (number | null)[][] }>('/v1/matrix', {
        method: 'POST',
        body: JSON.stringify({ mode, points }),
      });
      const fallback = estimateMatrix(points, mode);
      // Un par sin ruta (null) se sustituye por la estimación en vez de romper el cálculo.
      const minutes = data.minutes.map((row, i) => row.map((v, j) => (v === null ? fallback[i][j] : v)));
      return { minutes, source: 'mapbox' };
    } catch {
      // Sin red en destino: se sigue con la estimación.
    }
  }
  return { minutes: estimateMatrix(points, mode), source: 'estimate' };
}

/** Geometría real del recorrido para pintarla en el mapa. `null` = pintar líneas rectas. */
export async function routeGeometry(points: LatLng[], mode: TransportMode): Promise<[number, number][] | null> {
  if (!hasBackend() || points.length < 2 || points.length > 25) return null;
  try {
    const data = await request<{ coordinates: [number, number][] }>('/v1/directions', {
      method: 'POST',
      body: JSON.stringify({ mode, points }),
    });
    return data.coordinates;
  } catch {
    return null;
  }
}

// ——— IA ———

export interface Suggestion {
  name: string;
  category: string;
  reason: string;
  visitMinutes: number;
  priority: 'must' | 'optional';
  /** Resultado del mapa que casa con la sugerencia; null = no se ha podido ubicar con confianza. */
  match: SearchResult | null;
}

export async function recommendPlaces(input: {
  city: string;
  lat: number;
  lng: number;
  days: number;
  request: string;
  existing: string[];
}): Promise<Suggestion[]> {
  const data = await request<{ suggestions: Suggestion[] }>(
    '/v1/recommend',
    { method: 'POST', body: JSON.stringify({ ...input, lang: 'es' }) },
    90_000,
  );
  return data.suggestions;
}

export async function fetchGuideText(input: {
  name: string;
  city: string;
  lat: number;
  lng: number;
  category: string | null;
  length: GuideLength;
  lang: string;
}): Promise<string> {
  const data = await request<{ text: string }>('/v1/guide', { method: 'POST', body: JSON.stringify(input) }, 90_000);
  return data.text;
}
