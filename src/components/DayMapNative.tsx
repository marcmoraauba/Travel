import Mapbox, { Camera, LineLayer, MapView, MarkerView, ShapeSource } from '@rnmapbox/maps';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LatLng, TransportMode } from '../core/geo';
import type { MapStop } from './DayMap';
import { routeGeometry } from '../services/api';
import { config } from '../services/config';
import { radius, useColors } from '../theme';

Mapbox.setAccessToken(config.mapboxPublicToken);


/** Mapa del día con Mapbox: base (hotel), paradas numeradas y el recorrido. */
export function DayMapNative({ base, stops, mode }: { base: LatLng; stops: MapStop[]; mode: TransportMode }) {
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
