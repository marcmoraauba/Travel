import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { DayMap } from '../../components/DayMap';
import { dayLabel } from '../../components/format';
import { useData } from '../../components/useData';
import { Button, Field, Muted, Notice, SectionTitle } from '../../components/ui';
import type { DayPlan } from '../../core/optimizer';
import { DROP_REASON_TEXT, isRoutable, tripBase } from '../../core/planning';
import { formatDuration, formatHHMM, parseHHMM } from '../../core/time';
import * as repo from '../../db/repo';
import { optimizeAndSaveDay } from '../../services/planner';
import { radius, space, useColors } from '../../theme';

const MODE_TEXT = { walking: 'a pie', cycling: 'en bici', driving: 'en coche' } as const;

export default function DayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<{ plan: DayPlan; estimated: boolean; unlocated: string[] } | null>(null);
  const autoRan = useRef(false);

  const { data, reload, db } = useData(
    async (db) => {
      const day = await repo.getDay(db, id);
      if (!day) return null;
      const [trip, days, places, stops] = await Promise.all([
        repo.getTrip(db, day.tripId),
        repo.listDays(db, day.tripId),
        repo.listPlaces(db, day.tripId),
        repo.listStops(db, id),
      ]);
      return { day, trip, index: days.findIndex((d) => d.id === id), places: places.filter((p) => p.dayId === id), stops };
    },
    id,
  );

  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  useEffect(() => {
    if (data?.day) {
      setStartTime(data.day.startTime);
      setEndTime(data.day.endTime);
    }
  }, [data?.day]);

  const optimize = async () => {
    setBusy(true);
    try {
      const r = await optimizeAndSaveDay(db, id);
      setLastRun({ plan: r.plan, estimated: r.matrixSource === 'estimate', unlocated: r.unlocated });
      reload();
    } catch (e) {
      Alert.alert('No se pudo calcular la ruta', String(e));
    } finally {
      setBusy(false);
    }
  };

  // Primera visita a un día con lugares sin ruta: se calcula sola.
  useEffect(() => {
    if (!data?.day || autoRan.current) return;
    if (!data.day.optimizedAt && data.places.some(isRoutable)) {
      autoRan.current = true;
      optimize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!data) return null;
  const { day, trip, places, stops } = data;
  if (!day || !trip) return <Muted style={{ padding: space.lg }}>Este día ya no existe.</Muted>;

  const saveHours = async () => {
    const s = parseHHMM(startTime);
    const e = parseHHMM(endTime);
    if (s === null || e === null || e <= s) {
      Alert.alert('Horario no válido', 'Usa HH:MM y que el fin sea posterior al inicio.');
      return;
    }
    await repo.updateDay(db, id, { startTime, endTime });
    await optimize();
  };

  const byId = new Map(places.map((p) => [p.id, p]));
  const inRoute = new Set(stops.map((s) => s.placeId));
  const notInRoute = places.filter((p) => isRoutable(p) && !inRoute.has(p.id));
  const unlocated = places.filter((p) => !isRoutable(p));
  const droppedReason = new Map(lastRun?.plan.dropped.map((d) => [d.id, d.reason]) ?? []);
  const base = tripBase(trip);
  const mapStops = stops
    .map((s, i) => {
      const p = byId.get(s.placeId);
      return p && isRoutable(p) ? { id: p.id, lat: p.lat, lng: p.lng, label: String(i + 1) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 48 }}>
      <Stack.Screen options={{ title: `Día ${data.index + 1}` }} />
      <Muted style={{ textTransform: 'capitalize', marginBottom: space.md }}>{dayLabel(day.date)}</Muted>

      <DayMap base={base} stops={mapStops} mode={trip.transportMode} />

      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field label="Empiezo" value={startTime} onChangeText={setStartTime} keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Termino" value={endTime} onChangeText={setEndTime} keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      {startTime !== day.startTime || endTime !== day.endTime ? (
        <Button title="Aplicar horario y recalcular" onPress={saveHours} loading={busy} />
      ) : (
        <Button title={stops.length ? 'Recalcular ruta' : 'Calcular ruta'} onPress={optimize} loading={busy} disabled={!places.some(isRoutable)} />
      )}

      {lastRun?.estimated ? (
        <Notice>Tiempos estimados sin conexión. Recalcula con red para usar tiempos reales.</Notice>
      ) : null}

      {places.length === 0 ? (
        <Muted style={{ marginTop: space.lg }}>
          Este día no tiene lugares. Añádelos desde el viaje y asígnales este día, o usa “Repartir por días”.
        </Muted>
      ) : null}

      {stops.length > 0 ? (
        <>
          <SectionTitle>Horario</SectionTitle>
          <TimelineRow time={day.startTime} title={trip.baseName ?? 'Salida'} subtle />
          {stops.map((s, i) => {
            const p = byId.get(s.placeId);
            const prevEnd = i === 0 ? parseHHMM(day.startTime)! : parseHHMM(stops[i - 1].departure)!;
            const leaveAt = parseHHMM(s.arrival)! - s.travelMinutes;
            const pause = leaveAt - prevEnd;
            return (
              <View key={s.id}>
                {pause > 0 ? <TimelineRow time={formatHHMM(prevEnd)} title={`Comida · ${formatDuration(pause)}`} subtle /> : null}
                <Leg text={`${formatDuration(s.travelMinutes)} ${MODE_TEXT[trip.transportMode]}`} />
                {s.waitMinutes > 0 ? <Leg text={`Esperar ${formatDuration(s.waitMinutes)} a que abra`} warn /> : null}
                <Pressable accessibilityRole="button" onPress={() => p && router.push(`/place/${p.id}`)}>
                  <TimelineRow
                    time={s.start}
                    number={i + 1}
                    title={p?.name ?? 'Lugar borrado'}
                    detail={`hasta las ${s.departure}${p?.priority === 'must' ? ' · imprescindible' : ''}`}
                  />
                </Pressable>
              </View>
            );
          })}
          {lastRun ? (
            <>
              <Leg text={`${formatDuration(lastRun.plan.returnTravelMin)} de vuelta`} />
              <TimelineRow time={formatHHMM(lastRun.plan.finishAt)} title={trip.baseName ?? 'Fin del día'} subtle />
            </>
          ) : null}
        </>
      ) : null}

      {notInRoute.length > 0 && day.optimizedAt ? (
        <>
          <SectionTitle>No entran hoy</SectionTitle>
          {notInRoute.map((p) => (
            <Pressable key={p.id} onPress={() => router.push(`/place/${p.id}`)} accessibilityRole="button">
              <Notice>
                {p.name}
                {droppedReason.has(p.id) ? ` — ${DROP_REASON_TEXT[droppedReason.get(p.id)!]}` : ''}. Pásalo a otro día,
                acórtalo o amplía el horario.
              </Notice>
            </Pressable>
          ))}
        </>
      ) : null}

      {unlocated.length > 0 ? (
        <>
          <SectionTitle>Sin ubicar</SectionTitle>
          {unlocated.map((p) => (
            <Pressable key={p.id} onPress={() => router.push(`/place/${p.id}`)} accessibilityRole="button">
              <Notice>{p.name} — ábrelo y búscalo para situarlo en el mapa.</Notice>
            </Pressable>
          ))}
        </>
      ) : null}
    </ScrollView>
  );

  function Leg({ text, warn }: { text: string; warn?: boolean }) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32 }}>
        <View style={{ width: 56 }} />
        <View style={{ width: 2, alignSelf: 'stretch', backgroundColor: c.border, marginHorizontal: 13 }} />
        <Text style={{ color: warn ? c.accent : c.muted, fontSize: 13, marginLeft: space.sm }}>{text}</Text>
      </View>
    );
  }

  function TimelineRow({ time, title, detail, number, subtle }: { time: string; title: string; detail?: string; number?: number; subtle?: boolean }) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.xs }}>
        <Text style={{ width: 56, color: c.text, fontVariant: ['tabular-nums'], fontWeight: '600' }}>{time}</Text>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: subtle ? c.border : c.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: subtle ? c.text : c.primaryText, fontWeight: '700', fontSize: 12 }}>{number ?? '·'}</Text>
        </View>
        <View
          style={{
            flex: 1,
            marginLeft: space.sm,
            padding: subtle ? 0 : space.md,
            borderRadius: radius.md,
            backgroundColor: subtle ? 'transparent' : c.surface,
            borderWidth: subtle ? 0 : 1,
            borderColor: c.border,
          }}
        >
          <Text style={{ color: subtle ? c.muted : c.text, fontSize: 16, fontWeight: subtle ? '400' : '600' }}>{title}</Text>
          {detail ? <Muted>{detail}</Muted> : null}
        </View>
      </View>
    );
  }
}
