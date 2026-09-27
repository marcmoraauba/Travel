import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Button, Muted, Notice, Segmented } from '../../components/ui';
import * as repo from '../../db/repo';
import type { GuideLength, Place, Trip } from '../../db/types';
import { getOrFetchGuide, GUIDE_LENGTHS } from '../../services/guides';
import { useNarrator } from '../../services/narrator';
import { space, useColors } from '../../theme';

const RATES = [
  { value: '0.85', label: 'Lento' },
  { value: '1', label: 'Normal' },
  { value: '1.15', label: 'Rápido' },
];

/** Guía narrada de un lugar: lectura y escucha con la voz del sistema. */
export default function GuideScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const db = useSQLiteContext();
  const c = useColors();
  const [place, setPlace] = useState<Place | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [length, setLength] = useState<GuideLength>('standard');
  const [guide, setGuide] = useState<{ length: GuideLength; text: string | null; error: string | null } | null>(null);
  const narrator = useNarrator(guide?.length === length ? guide.text : null);

  useEffect(() => {
    (async () => {
      const p = await repo.getPlace(db, placeId);
      if (!p) return;
      setPlace(p);
      setTrip(await repo.getTrip(db, p.tripId));
    })();
  }, [db, placeId]);

  useEffect(() => {
    if (!place || !trip) return;
    let active = true;
    getOrFetchGuide(db, trip, place, length)
      .then((text) => active && setGuide({ length, text, error: null }))
      .catch((e: unknown) => active && setGuide({ length, text: null, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      active = false;
    };
  }, [db, trip, place, length]);

  if (!place) return null;
  const current = guide?.length === length ? guide : null;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: place.name }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 160 }}>
        <Segmented value={length} onChange={setLength} options={GUIDE_LENGTHS} />
        {!current ? (
          <View style={{ alignItems: 'center', padding: space.xl, gap: space.md }}>
            <ActivityIndicator color={c.primary} />
            <Muted>Preparando la guía…</Muted>
          </View>
        ) : current.error ? (
          <Notice>
            No se pudo cargar la guía: {current.error}. Si estás sin conexión, descarga las guías del viaje antes de salir.
          </Notice>
        ) : (
          current.text!.split(/\n\s*\n|\n/).filter(Boolean).map((para, i) => (
            <Text
              key={i}
              style={{
                color: c.text,
                fontSize: 18,
                lineHeight: 28,
                marginBottom: space.md,
                opacity: narrator.state !== 'idle' && i !== narrator.index ? 0.45 : 1,
              }}
            >
              {para.trim()}
            </Text>
          ))
        )}
        {current?.text ? (
          <Muted style={{ fontSize: 12, marginTop: space.md }}>
            Texto generado por IA con fines divulgativos. Horarios y precios, siempre en la ficha del lugar.
          </Muted>
        ) : null}
      </ScrollView>

      {current?.text ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: space.xl, backgroundColor: c.bg, borderTopWidth: 1, borderColor: c.border }}>
          <Segmented value={String(narrator.rate)} onChange={(r) => narrator.setRate(Number(r))} options={RATES} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {narrator.state === 'playing' ? (
              <Button title="Pausa" onPress={narrator.pause} style={{ flex: 1 }} />
            ) : (
              <Button title={narrator.state === 'paused' ? 'Continuar' : 'Escuchar'} onPress={narrator.play} style={{ flex: 1 }} />
            )}
            {narrator.state !== 'idle' ? <Button title="Parar" variant="secondary" onPress={narrator.stop} /> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
