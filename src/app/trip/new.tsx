import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { PickerField } from '../../components/PickerField';
import { PlaceSearch } from '../../components/PlaceSearch';
import { Badge, Button, Card, Muted, Segmented, Title } from '../../components/ui';
import type { TransportMode } from '../../core/geo';
import { datesBetween, localISODate, parseISODate } from '../../core/time';
import { createTrip, getTrip, updateTrip } from '../../db/repo';
import type { Pace } from '../../db/types';
import { space } from '../../theme';

interface Point {
  name: string;
  lat: number;
  lng: number;
}

const MAX_DAYS = 21;

export default function TripFormScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const today = localISODate(new Date());

  const [city, setCity] = useState<Point | null>(null);
  const [base, setBase] = useState<Point | null>(null);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [pace, setPace] = useState<Pace>('normal');
  const [mode, setMode] = useState<TransportMode>('walking');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!id) return;
    getTrip(db, id).then((t) => {
      if (!t) return;
      setCity({ name: t.city, lat: t.centerLat, lng: t.centerLng });
      if (t.baseName && t.baseLat !== null && t.baseLng !== null) setBase({ name: t.baseName, lat: t.baseLat, lng: t.baseLng });
      setStartDate(t.startDate);
      setEndDate(t.endDate);
      setPace(t.pace);
      setMode(t.transportMode);
    });
  }, [db, id]);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Sin permiso', 'Puedes buscar la ciudad por nombre en su lugar.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync(pos.coords).catch(() => []);
      setCity({ name: geo?.city ?? geo?.region ?? 'Mi ubicación', lat: pos.coords.latitude, lng: pos.coords.longitude });
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    if (!city) return Alert.alert('Falta la ciudad', 'Busca la ciudad del viaje.');
    if (!parseISODate(startDate) || !parseISODate(endDate)) {
      return Alert.alert('Fechas no válidas', 'Usa el formato AAAA-MM-DD, por ejemplo 2026-10-24.');
    }
    const days = datesBetween(startDate, endDate).length;
    if (days === 0) return Alert.alert('Fechas no válidas', 'La fecha de fin debe ser igual o posterior a la de inicio.');
    if (days > MAX_DAYS) return Alert.alert('Viaje demasiado largo', `Máximo ${MAX_DAYS} días por viaje.`);

    setSaving(true);
    try {
      const data = {
        city: city.name,
        centerLat: city.lat,
        centerLng: city.lng,
        startDate,
        endDate,
        pace,
        transportMode: mode,
        baseName: base?.name ?? null,
        baseLat: base?.lat ?? null,
        baseLng: base?.lng ?? null,
      };
      if (id) {
        await updateTrip(db, id, data);
        router.back();
      } else {
        const newId = await createTrip(db, data);
        router.replace(`/trip/${newId}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: id ? 'Editar viaje' : 'Nuevo viaje' }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        {city ? (
          <Card>
            <Muted>Ciudad</Muted>
            <Title>{city.name}</Title>
            <Button title="Cambiar" variant="secondary" onPress={() => setCity(null)} style={{ marginTop: space.sm }} />
          </Card>
        ) : (
          <>
            <PlaceSearch
              label="Ciudad"
              placeholder="Roma, Lisboa, Kioto…"
              kind="city"
              onSelect={(r) => setCity({ name: r.name, lat: r.lat, lng: r.lng })}
            />
            <Button title="Usar mi ubicación" variant="secondary" loading={locating} onPress={useMyLocation} style={{ marginBottom: space.lg }} />
          </>
        )}

        <PickerField
          label="Primer día"
          mode="date"
          value={startDate}
          onChange={(d) => {
            setStartDate(d);
            // Si el inicio pasa del fin, el fin le sigue.
            if (d > endDate) setEndDate(d);
          }}
        />
        <PickerField label="Último día" mode="date" value={endDate} minimumDate={startDate} onChange={setEndDate} />

        <Segmented
          label="Ritmo"
          value={pace}
          onChange={setPace}
          options={[
            { value: 'relaxed', label: 'Tranquilo' },
            { value: 'normal', label: 'Normal' },
            { value: 'intense', label: 'Intenso' },
          ]}
        />
        <Segmented
          label="Cómo te mueves"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'walking', label: 'A pie' },
            { value: 'cycling', label: 'Bici' },
            { value: 'driving', label: 'Coche' },
          ]}
        />

        {base ? (
          <Card>
            <Muted>Alojamiento (inicio y fin de cada día)</Muted>
            <Title>{base.name}</Title>
            <Button title="Quitar" variant="secondary" onPress={() => setBase(null)} style={{ marginTop: space.sm }} />
          </Card>
        ) : city ? (
          <>
            <PlaceSearch
              label="Alojamiento (opcional)"
              placeholder="Hotel o dirección"
              near={city}
              cityName={city.name}
              onSelect={(r) => setBase({ name: r.name, lat: r.lat, lng: r.lng })}
            />
            <Badge text="Sin alojamiento, cada día empieza y acaba en el centro" />
          </>
        ) : null}

        <Button title={id ? 'Guardar' : 'Crear viaje'} loading={saving} onPress={save} style={{ marginTop: space.xl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
