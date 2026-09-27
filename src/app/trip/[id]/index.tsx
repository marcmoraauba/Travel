import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { dayLabel } from '../../../components/format';
import { useData } from '../../../components/useData';
import { Badge, Button, Card, Muted, Notice, SectionTitle, Title } from '../../../components/ui';
import { deleteTrip, getTrip, listDays, listPlaces } from '../../../db/repo';
import type { Place } from '../../../db/types';
import { hasBackend } from '../../../services/config';
import { guideCoverage, prepareTripGuides } from '../../../services/guides';
import { distributeTrip } from '../../../services/planner';
import { space, useColors } from '../../../theme';

function PlaceRow({ place }: { place: Place }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/place/${place.id}`)}
      style={({ pressed }) => ({
        paddingVertical: space.md,
        borderBottomWidth: 1,
        borderColor: c.border,
        opacity: pressed ? 0.6 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
      })}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: place.priority === 'must' ? c.must : c.optional }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 16 }}>{place.name}</Text>
        <Muted>
          {place.visitMinutes} min{place.lat === null ? ' · sin ubicar' : ''}
        </Muted>
      </View>
    </Pressable>
  );
}

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [busy, setBusy] = useState(false);
  const [guideProgress, setGuideProgress] = useState<{ done: number; total: number } | null>(null);
  const { data, reload, db } = useData(
    async (db) => {
      const [trip, days, places, guides] = await Promise.all([
        getTrip(db, id),
        listDays(db, id),
        listPlaces(db, id),
        guideCoverage(db, id),
      ]);
      return { trip, days, places, guides };
    },
    id,
  );

  if (!data) return null;
  const { trip, days, places, guides } = data;
  if (!trip) return <Muted style={{ padding: space.lg }}>Este viaje ya no existe.</Muted>;

  const unassigned = places.filter((p) => p.dayId === null);

  const distribute = async (all: boolean) => {
    setBusy(true);
    try {
      await distributeTrip(db, trip.id, all);
      reload();
    } catch (e) {
      Alert.alert('No se pudo planificar', String(e));
    } finally {
      setBusy(false);
    }
  };

  const downloadGuides = async () => {
    setGuideProgress({ done: 0, total: 0 });
    try {
      const r = await prepareTripGuides(db, trip.id, (done, total) => setGuideProgress({ done, total }));
      if (r.failed > 0) {
        Alert.alert('Guías incompletas', `No se pudieron descargar ${r.failed} de ${r.total}. Vuelve a intentarlo con conexión.`);
      }
      reload();
    } catch (e) {
      Alert.alert('No se pudieron descargar las guías', e instanceof Error ? e.message : String(e));
    } finally {
      setGuideProgress(null);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Borrar viaje', `Se borrará ${trip.city} con todos sus lugares.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await deleteTrip(db, trip.id);
          router.back();
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 48 }}>
      <Stack.Screen options={{ title: trip.city }} />

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Añadir lugar" onPress={() => router.push(`/trip/${trip.id}/add-place`)} style={{ flex: 1 }} />
        <Button title="Editar" variant="secondary" onPress={() => router.push(`/trip/new?id=${trip.id}`)} />
      </View>

      {unassigned.length > 0 ? (
        <>
          <SectionTitle right={<Badge text={String(unassigned.length)} />}>Sin día asignado</SectionTitle>
          <Notice>
            {days.length > 1
              ? 'Repártelos automáticamente: se agrupan por zonas para no cruzar la ciudad dos veces.'
              : 'Añádelos al día para calcular la ruta.'}
          </Notice>
          <Button title={days.length > 1 ? 'Repartir por días y optimizar' : 'Planificar el día'} loading={busy} onPress={() => distribute(false)} />
          <View style={{ marginTop: space.sm }}>
            {unassigned.map((p) => (
              <PlaceRow key={p.id} place={p} />
            ))}
          </View>
        </>
      ) : null}

      <SectionTitle>Días</SectionTitle>
      {days.map((d, i) => {
        const dayPlaces = places.filter((p) => p.dayId === d.id);
        return (
          <Card key={d.id} onPress={() => router.push(`/day/${d.id}`)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title>Día {i + 1}</Title>
              {d.optimizedAt ? <Badge text="Ruta lista" tone="primary" /> : dayPlaces.length > 0 ? <Badge text="Sin optimizar" tone="warning" /> : null}
            </View>
            <Muted style={{ marginTop: space.xs, textTransform: 'capitalize' }}>{dayLabel(d.date)}</Muted>
            <Muted style={{ marginTop: space.xs }}>
              {dayPlaces.length === 0 ? 'Sin lugares' : `${dayPlaces.length} lugar${dayPlaces.length === 1 ? '' : 'es'} · ${d.startTime}–${d.endTime}`}
            </Muted>
          </Card>
        );
      })}

      {places.length > 0 && unassigned.length === 0 && days.length > 1 ? (
        <Button title="Volver a repartir todo" variant="secondary" loading={busy} onPress={() => distribute(true)} />
      ) : null}

      {guides.total > 0 ? (
        <>
          <SectionTitle right={<Badge text={`${guides.ready}/${guides.total}`} tone={guides.ready === guides.total ? 'primary' : 'warning'} />}>
            Guías narradas
          </SectionTitle>
          {!hasBackend() ? (
            <Muted>Las guías se generan en el servidor: necesitan el backend configurado.</Muted>
          ) : guides.ready === guides.total ? (
            <Muted>Todas descargadas: puedes escucharlas sin conexión.</Muted>
          ) : (
            <>
              <Muted style={{ marginBottom: space.sm }}>
                Descárgalas antes de salir: en destino puede no haber datos.
              </Muted>
              <Button
                title={guideProgress ? `Descargando ${guideProgress.done}/${guideProgress.total}…` : 'Descargar guías del viaje'}
                variant="secondary"
                loading={guideProgress !== null && guideProgress.total === 0}
                disabled={guideProgress !== null}
                onPress={downloadGuides}
              />
            </>
          )}
        </>
      ) : null}

      <Button title="Borrar viaje" variant="danger" onPress={confirmDelete} style={{ marginTop: space.xl }} />
    </ScrollView>
  );
}
