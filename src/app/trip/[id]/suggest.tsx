import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Button, Field, Muted, Notice, SectionTitle } from '../../../components/ui';
import { parseOpeningHours } from '../../../core/openingHours';
import { createPlace, getTrip, listDays, listPlaces } from '../../../db/repo';
import type { Trip } from '../../../db/types';
import { recommendPlaces, Suggestion } from '../../../services/api';
import { hasBackend } from '../../../services/config';
import { radius, space, useColors } from '../../../theme';

const EXAMPLES = ['Los imprescindibles', 'Con niños', 'Poco turístico', 'Arte y museos', 'Gratis'];

/**
 * Recomendación por IA (§5b del plan): la IA propone nombres, el backend los sitúa en el mapa
 * y aquí el usuario elige. Lo que no se ha podido ubicar se muestra aparte para resolverlo o descartarlo.
 */
export default function SuggestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const c = useColors();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState(1);
  const [singleDayId, setSingleDayId] = useState<string | null>(null);
  const [existing, setExisting] = useState<string[]>([]);
  const [wish, setWish] = useState('Los imprescindibles');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    getTrip(db, id).then(setTrip);
    listDays(db, id).then((d) => {
      setDays(d.length);
      setSingleDayId(d.length === 1 ? d[0].id : null);
    });
    listPlaces(db, id).then((p) => setExisting(p.map((x) => x.name)));
  }, [db, id]);

  if (!trip) return null;

  const ask = async () => {
    setLoading(true);
    setSuggestions(null);
    try {
      const s = await recommendPlaces({
        city: trip.city,
        lat: trip.centerLat,
        lng: trip.centerLng,
        days,
        request: wish,
        existing,
      });
      setSuggestions(s);
      // Preselecciona los imprescindibles que se han podido ubicar.
      setSelected(new Set(s.flatMap((x, i) => (x.match && x.priority === 'must' ? [i] : []))));
    } catch (e) {
      Alert.alert('No se pudieron obtener sugerencias', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const add = async () => {
    if (!suggestions) return;
    setSaving(true);
    try {
      for (const i of selected) {
        const s = suggestions[i];
        const m = s.match;
        const hoursOk = m ? parseOpeningHours(m.openingHours) !== null : false;
        await createPlace(db, {
          tripId: id,
          dayId: singleDayId,
          name: m?.name ?? s.name,
          lat: m?.lat ?? null,
          lng: m?.lng ?? null,
          address: m?.address ?? null,
          category: s.category,
          visitMinutes: s.visitMinutes,
          priority: s.priority,
          openingHours: hoursOk ? m!.openingHours : null,
          hoursSource: hoursOk ? 'osm' : null,
          price: null,
          requiresBooking: false,
          origin: 'ai',
          geocoded: m !== null,
          notes: s.reason,
        });
      }
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const located = suggestions?.map((s, i) => ({ s, i })).filter(({ s }) => s.match) ?? [];
  const unlocated = suggestions?.map((s, i) => ({ s, i })).filter(({ s }) => !s.match) ?? [];

  const Row = ({ s, i }: { s: Suggestion; i: number }) => {
    const on = selected.has(i);
    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        onPress={() => toggle(i)}
        style={{
          flexDirection: 'row',
          gap: space.md,
          padding: space.md,
          marginBottom: space.sm,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: on ? c.primary : c.border,
          backgroundColor: c.surface,
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: on ? c.primary : c.muted,
            backgroundColor: on ? c.primary : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 2,
          }}
        >
          {on ? <Text style={{ color: c.primaryText, fontWeight: '700' }}>✓</Text> : null}
        </View>
        <View style={{ flex: 1, gap: space.xs }}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{s.match?.name ?? s.name}</Text>
          <Muted>{s.reason}</Muted>
          <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
            <Badge text={`${s.visitMinutes} min`} />
            {s.priority === 'must' ? <Badge text="Imprescindible" tone="primary" /> : null}
            {!s.match ? <Badge text="Sin ubicar" tone="warning" /> : null}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {!hasBackend() ? <Notice>Las sugerencias necesitan el backend configurado (EXPO_PUBLIC_API_URL).</Notice> : null}
        <Field
          label={`¿Qué te apetece ver en ${trip.city}?`}
          value={wish}
          onChangeText={setWish}
          placeholder="Imprescindibles, tranquilo, con niños…"
          multiline
          style={{ minHeight: 64, paddingTop: space.md }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
          {EXAMPLES.map((e) => (
            <Pressable key={e} onPress={() => setWish(e)} accessibilityRole="button">
              <Badge text={e} tone={wish === e ? 'primary' : 'neutral'} />
            </Pressable>
          ))}
        </View>
        <Button title={suggestions ? 'Pedir otras' : 'Pedir sugerencias'} onPress={ask} loading={loading} disabled={!hasBackend()} />
        {loading ? <Muted style={{ marginTop: space.sm, textAlign: 'center' }}>Pensando y situando cada sitio en el mapa…</Muted> : null}

        {located.length > 0 ? (
          <>
            <SectionTitle>Sugerencias</SectionTitle>
            {located.map(({ s, i }) => (
              <Row key={i} s={s} i={i} />
            ))}
          </>
        ) : null}

        {unlocated.length > 0 ? (
          <>
            <SectionTitle>No las encuentro en el mapa</SectionTitle>
            <Muted style={{ marginBottom: space.md }}>
              Si las añades, entran sin ubicación: ábrelas después y búscalas para que cuenten en la ruta.
            </Muted>
            {unlocated.map(({ s, i }) => (
              <Row key={i} s={s} i={i} />
            ))}
          </>
        ) : null}

        {suggestions && suggestions.length === 0 ? <Muted style={{ marginTop: space.lg }}>Sin sugerencias. Prueba a pedirlo de otra forma.</Muted> : null}

        {suggestions && selected.size > 0 ? (
          <Button title={`Añadir ${selected.size} al viaje`} onPress={add} loading={saving} style={{ marginTop: space.lg }} />
        ) : null}
        <Muted style={{ marginTop: space.lg, fontSize: 12 }}>
          Sugerencias generadas por IA. Los horarios nunca los inventa: vienen del mapa o los pones tú.
        </Muted>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
