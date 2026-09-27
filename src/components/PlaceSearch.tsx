import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { LatLng } from '../core/geo';
import { searchPlaces, SearchResult } from '../services/api';
import { hasBackend } from '../services/config';
import { searchOnDevice } from '../services/deviceGeocode';
import { space, useColors } from '../theme';
import { Field, Muted } from './ui';

/**
 * Buscador con espera entre pulsaciones (debounce) para no disparar una petición por letra.
 * Con backend busca en Mapbox; sin él, con el geocodificador del móvil (más básico, sin cuentas).
 */
export function PlaceSearch({
  label,
  placeholder,
  near,
  kind = 'poi',
  cityName,
  onSelect,
}: {
  label: string;
  placeholder: string;
  near?: LatLng;
  /** Ciudad del viaje: sin backend se añade a la búsqueda para no encontrar homónimos. */
  cityName?: string;
  kind?: 'poi' | 'city';
  onSelect: (r: SearchResult) => void;
}) {
  const c = useColors();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nearLat = near?.lat;
  const nearLng = near?.lng;
  const active = query.trim().length >= 3;
  const visible = active ? results : [];

  useEffect(() => {
    if (!active) return;
    let current = true;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const center = nearLat !== undefined && nearLng !== undefined ? { lat: nearLat, lng: nearLng } : undefined;
        const r = hasBackend()
          ? await searchPlaces(query.trim(), center, kind)
          : await searchOnDevice(query.trim(), kind === 'city' ? undefined : center, kind === 'city' ? undefined : cityName);
        if (current) setResults(r);
      } catch {
        if (current) setError(hasBackend() ? 'No se pudo buscar. ¿Hay conexión?' : 'No encontrado. Prueba con otro nombre o con la dirección.');
      } finally {
        if (current) setLoading(false);
      }
      // El geocodificador del móvil limita las peticiones: se espera más entre pulsaciones.
    }, hasBackend() ? 350 : 900);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [active, query, nearLat, nearLng, kind, cityName]);

  return (
    <View>
      <Field
        label={label}
        placeholder={placeholder}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
        hint={hasBackend() ? undefined : 'Búsqueda básica del móvil: escribe el nombre o la dirección y espera un momento.'}
      />
      {active && loading ? <ActivityIndicator style={{ marginBottom: space.md }} /> : null}
      {active && error ? <Muted style={{ marginBottom: space.md }}>{error}</Muted> : null}
      {visible.map((r) => (
        <Pressable
          key={r.id}
          accessibilityRole="button"
          onPress={() => {
            onSelect(r);
            setQuery('');
          }}
          style={({ pressed }) => ({
            paddingVertical: space.md,
            borderBottomWidth: 1,
            borderColor: c.border,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{r.name}</Text>
          {r.address ? <Muted>{r.address}</Muted> : null}
        </Pressable>
      ))}
    </View>
  );
}
