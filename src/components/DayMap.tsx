import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LatLng, TransportMode } from '../core/geo';
import { hasMap, hasMapModule } from '../services/config';
import { radius, useColors } from '../theme';
import { Muted } from './ui';

export interface MapStop extends LatLng {
  id: string;
  label: string;
}

type Props = { base: LatLng; stops: MapStop[]; mode: TransportMode };

// Carga perezosa: en Expo Go no existe el módulo nativo de Mapbox y ni siquiera se importa.
const Native: ComponentType<Props> | null = hasMap()
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./DayMapNative') as typeof import('./DayMapNative')).DayMapNative
  : null;

/** Mapa del día, o un aviso si no hay mapa disponible (Expo Go o sin token). */
export function DayMap(props: Props) {
  const c = useColors();
  if (Native) return <Native {...props} />;
  return (
    <View style={[styles.placeholder, { borderColor: c.border, backgroundColor: c.surface }]}>
      <Muted>
        {hasMapModule()
          ? 'Mapa desactivado: falta EXPO_PUBLIC_MAPBOX_TOKEN.'
          : 'El mapa no está disponible en Expo Go. El horario y la ruta funcionan igual.'}
      </Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: 90,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    padding: 16,
  },
});
