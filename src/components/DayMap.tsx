import Mapbox, { Camera, LineLayer, MapView, MarkerView, ShapeSource } from '@rnmapbox/maps';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LatLng, TransportMode } from '../core/geo';
import { routeGeometry } from '../services/api';
import { config, hasMap } from '../services/config';
import { radius, useColors } from '../theme';
import { Muted } from './ui';

if (hasMap()) Mapbox.setAccessToken(config.mapboxPublicToken);

export interface MapStop extends LatLng {
  id: string;
  label: string;
}

/** Mapa del día: base (hotel), paradas numeradas y el recorrido. */
export function DayMap({ base, stops, mode }: { base: LatLng; stops: MapStop[]; mode: TransportMode }) {
  const c = useColors();
  const path = useMemo(() => [base, ...stops, base], [base, stops]);
  const key = `${mode}:${path.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')}`;
  // La geometría se guarda junto a la clave de la ruta que la generó; si la ruta cambia, se ignora.
  const [fetched, setFetched] = useState<{ key: string; coords: [number, number][] | null } | null>(null);
  const geometry = fetched?.key === key ? fetched.coords : null;

  useEffect(() => {
    let active = true;
    if (stops.length > 0) {
      routeGeometry(path, mode).then((coords) => {
        if (active) setFetched({ key, coords });
      });
    }
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!hasMap()) {
    return (
      <View style={[styles.placeholder, { borderColor: c.border, backgroundColor: c.surface }]}>
        <Muted>Mapa desactivado: falta EXPO_PUBLIC_MAPBOX_TOKEN.</Muted>
      </View>
    );
  }

  const lngs = path.map((p) => p.lng);
  const lats = path.map((p) => p.lat);
  const line: GeoJSON.Feature = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: geometry ?? path.map((p) => [p.lng, p.lat]) },
  };

  return (
    <View style={[styles.wrap, { borderColor: c.border }]}>
      <MapView style={StyleSheet.absoluteFill} scaleBarEnabled={false} logoEnabled attributionEnabled>
        <Camera
          bounds={{ ne: [Math.max(...lngs), Math.max(...lats)], sw: [Math.min(...lngs), Math.min(...lats)] }}
          padding={{ paddingTop: 48, paddingBottom: 48, paddingLeft: 48, paddingRight: 48 }}
          maxZoomLevel={16}
          animationDuration={0}
        />
        {stops.length > 0 ? (
          <ShapeSource id="route" shape={line}>
            <LineLayer
              id="route-line"
              style={{
                lineColor: c.primary,
                lineWidth: 4,
                lineOpacity: 0.85,
                lineDasharray: geometry ? undefined : [2, 2],
              }}
            />
          </ShapeSource>
        ) : null}
        <MarkerView coordinate={[base.lng, base.lat]}>
          <View style={[styles.pin, { backgroundColor: c.accent }]}>
            <Text style={styles.pinText}>⌂</Text>
          </View>
        </MarkerView>
        {stops.map((s) => (
          <MarkerView key={s.id} coordinate={[s.lng, s.lat]}>
            <View style={[styles.pin, { backgroundColor: c.primary }]}>
              <Text style={styles.pinText}>{s.label}</Text>
            </View>
          </MarkerView>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 280, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, marginBottom: 12 },
  placeholder: {
    height: 120,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    padding: 16,
  },
  pin: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    paddingHorizontal: 4,
  },
  pinText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
