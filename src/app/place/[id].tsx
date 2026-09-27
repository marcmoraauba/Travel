import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';
import { dayLabel } from '../../components/format';
import { PlaceSearch } from '../../components/PlaceSearch';
import { Badge, Button, Card, Field, Muted, SectionTitle, Segmented, Title } from '../../components/ui';
import { parseOpeningHours } from '../../core/openingHours';
import type { Priority } from '../../core/optimizer';
import { parseHHMM } from '../../core/time';
import * as repo from '../../db/repo';
import type { Day, Place } from '../../db/types';
import { space, useColors } from '../../theme';

const HOURS_SOURCE_TEXT: Record<string, string> = {
  osm: 'Horario de OpenStreetMap',
  manual: 'Horario introducido a mano',
  ai_unverified: 'Horario sugerido por IA · sin verificar',
};

export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const c = useColors();

  const [place, setPlace] = useState<Place | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);

  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [priority, setPriority] = useState<Priority>('optional');
  const [dayId, setDayId] = useState<string | null>(null);
  const [hours, setHours] = useState('');
  const [notes, setNotes] = useState('');
  const [hasBooking, setHasBooking] = useState(false);
  const [bookingTime, setBookingTime] = useState('10:00');
  const [bookingRef, setBookingRef] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number; address: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      const p = await repo.getPlace(db, id);
      if (!p) return;
      const [trip, ds, booking] = await Promise.all([repo.getTrip(db, p.tripId), repo.listDays(db, p.tripId), repo.getBooking(db, p.id)]);
      setPlace(p);
      setDays(ds);
      if (trip) setCenter({ lat: trip.centerLat, lng: trip.centerLng });
      setName(p.name);
      setMinutes(String(p.visitMinutes));
      setPriority(p.priority);
      setDayId(p.dayId);
      setHours(p.openingHours ?? '');
      setNotes(p.notes);
      if (p.lat !== null && p.lng !== null) setLocation({ lat: p.lat, lng: p.lng, address: p.address });
      if (booking) {
        setHasBooking(true);
        setBookingTime(booking.time);
        setBookingRef(booking.reference);
      }
    })();
  }, [db, id]);

  if (!place) return null;

  const hoursValid = hours.trim() === '' || parseOpeningHours(hours) !== null;
  const bookingDay = days.find((d) => d.id === dayId);

  const save = async () => {
    const visit = Number(minutes);
    if (!name.trim()) return Alert.alert('Falta el nombre');
    if (!Number.isFinite(visit) || visit < 5 || visit > 600) return Alert.alert('Duración no válida', 'Entre 5 y 600 minutos.');
    if (!hoursValid) return Alert.alert('Horario no reconocido', 'Revisa el formato del ejemplo o déjalo vacío.');
    if (hasBooking && (!bookingDay || parseHHMM(bookingTime) === null)) {
      return Alert.alert('Reserva incompleta', 'Asigna un día al lugar e indica la hora en formato HH:MM.');
    }

    const hoursChanged = hours.trim() !== (place.openingHours ?? '');
    await repo.updatePlace(db, place.id, {
      name: name.trim(),
      visitMinutes: Math.round(visit),
      priority,
      dayId,
      openingHours: hours.trim() || null,
      hoursSource: hours.trim() ? (hoursChanged ? 'manual' : place.hoursSource) : null,
      notes,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      address: location?.address ?? null,
      geocoded: location !== null,
    });
    if (hasBooking && bookingDay) {
      await repo.saveBooking(db, { placeId: place.id, date: bookingDay.date, time: bookingTime, reference: bookingRef });
    } else {
      await repo.deleteBooking(db, place.id);
    }
    // La ruta de los días afectados ya no es válida.
    for (const d of new Set([place.dayId, dayId])) if (d) await repo.clearStops(db, d);
    router.back();
  };

  const remove = () =>
    Alert.alert('Quitar lugar', `¿Quitar ${place.name} del viaje?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          await repo.deletePlace(db, place.id);
          if (place.dayId) await repo.clearStops(db, place.dayId);
          router.back();
        },
      },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: place.name }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Field label="Nombre" value={name} onChangeText={setName} />

        {location ? (
          <Card>
            <Muted>Ubicación</Muted>
            <Title>{location.address ?? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}</Title>
            <Button title="Cambiar ubicación" variant="secondary" onPress={() => setLocation(null)} style={{ marginTop: space.sm }} />
          </Card>
        ) : (
          <PlaceSearch
            label="Ubicación"
            placeholder="Busca el sitio para situarlo en el mapa"
            near={center ?? undefined}
            onSelect={(r) => setLocation({ lat: r.lat, lng: r.lng, address: r.address ?? r.name })}
          />
        )}

        <Segmented
          label="Prioridad"
          value={priority}
          onChange={setPriority}
          options={[
            { value: 'must', label: 'Imprescindible' },
            { value: 'optional', label: 'Si da tiempo' },
          ]}
        />
        <Field label="Duración de la visita (min)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />

        <SectionTitle>Día</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
          <Button title="Sin asignar" variant={dayId === null ? 'primary' : 'secondary'} onPress={() => setDayId(null)} />
          {days.map((d, i) => (
            <Button key={d.id} title={`Día ${i + 1}`} variant={dayId === d.id ? 'primary' : 'secondary'} onPress={() => setDayId(d.id)} />
          ))}
        </View>
        {bookingDay ? <Muted style={{ marginBottom: space.md, textTransform: 'capitalize' }}>{dayLabel(bookingDay.date)}</Muted> : null}

        <SectionTitle>Horario</SectionTitle>
        {place.hoursSource && hours.trim() === (place.openingHours ?? '') ? (
          <View style={{ marginBottom: space.sm }}>
            <Badge text={HOURS_SOURCE_TEXT[place.hoursSource]} tone={place.hoursSource === 'ai_unverified' ? 'warning' : 'neutral'} />
          </View>
        ) : null}
        <Field
          label="Horario de apertura"
          value={hours}
          onChangeText={setHours}
          placeholder="Tu-Su 09:00-19:00; Mo off"
          autoCapitalize="none"
          autoCorrect={false}
          hint={
            hoursValid
              ? 'Formato OpenStreetMap. Vacío = se asume abierto. Días: Mo Tu We Th Fr Sa Su.'
              : 'No se reconoce el formato. Ejemplo: Mo-Fr 10:00-14:00,17:00-20:00; Sa 10:00-14:00; Su off'
          }
          style={!hoursValid ? { borderColor: c.danger } : undefined}
        />

        <SectionTitle
          right={<Switch value={hasBooking} onValueChange={setHasBooking} accessibilityLabel="Tengo reserva" />}
        >
          Reserva con hora
        </SectionTitle>
        {hasBooking ? (
          <>
            <Muted style={{ marginBottom: space.md }}>
              La ruta del día se construye alrededor de esta hora. {bookingDay ? '' : 'Asigna antes un día al lugar.'}
            </Muted>
            <Field label="Hora" value={bookingTime} onChangeText={setBookingTime} placeholder="HH:MM" keyboardType="numbers-and-punctuation" />
            <Field label="Localizador (opcional)" value={bookingRef} onChangeText={setBookingRef} autoCapitalize="characters" />
          </>
        ) : null}

        <Field label="Notas" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 80, paddingTop: space.md }} />

        <Button title="Guardar" onPress={save} style={{ marginTop: space.md }} />
        <Button title="Quitar del viaje" variant="danger" onPress={remove} style={{ marginTop: space.md }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
