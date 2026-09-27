import * as Location from 'expo-location';
import { haversineMeters, LatLng } from '../core/geo';
import type { SearchResult } from './api';

/**
 * Búsqueda de respaldo sin backend, con el geocodificador del propio móvil (Apple / Google).
 * Solo convierte texto en coordenadas: no conoce horarios ni categorías, y encuentra mejor
 * direcciones y lugares conocidos que comercios pequeños. Suficiente para probar la app sin cuentas.
 */
export async function searchOnDevice(query: string, near?: LatLng, cityName?: string): Promise<SearchResult[]> {
  // Android exige permiso de ubicación para geocodificar.
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Sin permiso de ubicación no se puede buscar sin backend');

  const text = cityName && !query.toLowerCase().includes(cityName.toLowerCase()) ? `${query}, ${cityName}` : query;
  const found = await Location.geocodeAsync(text);
  const results: SearchResult[] = [];
  for (const [i, loc] of found.slice(0, 3).entries()) {
    const point = { lat: loc.latitude, lng: loc.longitude };
    // Con ciudad de referencia, descarta homónimos lejanos.
    if (near && haversineMeters(point, near) > 50_000) continue;
    const [addr] = await Location.reverseGeocodeAsync({ latitude: loc.latitude, longitude: loc.longitude }).catch(() => []);
    const address = addr ? [addr.street && `${addr.street} ${addr.streetNumber ?? ''}`.trim(), addr.city].filter(Boolean).join(', ') : null;
    results.push({
      id: `device-${i}-${point.lat.toFixed(5)},${point.lng.toFixed(5)}`,
      name: near ? query.trim() : (addr?.city ?? query.trim()),
      address: address || null,
      lat: point.lat,
      lng: point.lng,
      category: null,
      openingHours: null,
    });
  }
  return results;
}
