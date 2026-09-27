export interface LatLng {
  lat: number;
  lng: number;
}

export type TransportMode = 'walking' | 'cycling' | 'driving';

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Velocidades medias urbanas (km/h), incluyendo semáforos y aparcar. */
const SPEED_KMH: Record<TransportMode, number> = { walking: 4.5, cycling: 13, driving: 22 };
/** Las calles no van en línea recta: factor de rodeo típico en centros urbanos. */
const DETOUR_FACTOR = 1.3;

/**
 * Matriz de tiempos aproximada (minutos) sin red. Sirve de respaldo cuando no hay conexión
 * o backend; la ruta real se recalcula con la Matrix API cuando vuelve la red.
 */
export function estimateMatrix(points: LatLng[], mode: TransportMode): number[][] {
  const metersPerMin = (SPEED_KMH[mode] * 1000) / 60;
  return points.map((a) =>
    points.map((b) => (a === b ? 0 : Math.round((haversineMeters(a, b) * DETOUR_FACTOR) / metersPerMin))),
  );
}
