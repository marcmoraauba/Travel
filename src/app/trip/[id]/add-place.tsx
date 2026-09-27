import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { PlaceSearch } from '../../../components/PlaceSearch';
import { Button, Field, Muted, SectionTitle } from '../../../components/ui';
import { parseOpeningHours } from '../../../core/openingHours';
import { createPlace, getTrip, listDays } from '../../../db/repo';
import type { Trip } from '../../../db/types';
import type { SearchResult } from '../../../services/api';
import { space } from '../../../theme';

/** Duración de visita por defecto según categoría (el usuario la ajusta en la ficha). */
function defaultMinutes(category: string | null): number {
  switch (category) {
    case 'museum':
      return 120;
    case 'park':
    case 'viewpoint':
      return 45;
    case 'restaurant':
    case 'cafe':
      return 60;
    default:
      return 60;
  }
}

export default function AddPlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [singleDayId, setSingleDayId] = useState<string | null>(null);
  const [manualName, setManualName] = useState('');

  useEffect(() => {
    getTrip(db, id).then(setTrip);
    // Viaje de un solo día: el lugar va directo a ese día.
    listDays(db, id).then((d) => setSingleDayId(d.length === 1 ? d[0].id : null));
  }, [db, id]);

  const addFromSearch = async (r: SearchResult) => {
    const hoursOk = parseOpeningHours(r.openingHours) !== null;
    const placeId = await createPlace(db, {
      tripId: id,
      dayId: singleDayId,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      address: r.address,
      category: r.category,
      visitMinutes: defaultMinutes(r.category),
      priority: 'optional',
      openingHours: hoursOk ? r.openingHours : null,
      hoursSource: hoursOk ? 'osm' : null,
      price: null,
      requiresBooking: false,
      origin: 'search',
      geocoded: true,
      notes: '',
    });
    router.replace(`/place/${placeId}`);
  };

  const addManual = async () => {
    const name = manualName.trim();
    if (!name) return Alert.alert('Falta el nombre');
    const placeId = await createPlace(db, {
      tripId: id,
      dayId: singleDayId,
      name,
      lat: null,
      lng: null,
      address: null,
      category: null,
      visitMinutes: 60,
      priority: 'optional',
      openingHours: null,
      hoursSource: null,
      price: null,
      requiresBooking: false,
      origin: 'manual',
      geocoded: false,
      notes: '',
    });
    router.replace(`/place/${placeId}`);
  };

  if (!trip) return null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <PlaceSearch
          label={`Buscar en ${trip.city}`}
          placeholder="Coliseo, Museo del Prado…"
          near={{ lat: trip.centerLat, lng: trip.centerLng }}
          onSelect={addFromSearch}
        />

        <SectionTitle>O a mano</SectionTitle>
        <Muted style={{ marginBottom: space.md }}>
          Un lugar sin ubicación no entra en la ruta hasta que le asignes una desde su ficha.
        </Muted>
        <Field label="Nombre" value={manualName} onChangeText={setManualName} placeholder="Heladería que me recomendaron" />
        <Button title="Añadir" variant="secondary" onPress={addManual} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
