import { router, Stack } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { dateRange } from '../components/format';
import { useData } from '../components/useData';
import { Button, Card, EmptyState, Muted, Title } from '../components/ui';
import { listTrips } from '../db/repo';
import { space, useColors } from '../theme';

export default function TripsScreen() {
  const c = useColors();
  const { data: trips } = useData(listTrips, '');

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Ajustes" onPress={() => router.push('/settings')} hitSlop={12}>
              <Text style={{ color: c.primary, fontSize: 16 }}>Ajustes</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        contentContainerStyle={{ padding: space.lg, flexGrow: 1 }}
        data={trips ?? []}
        keyExtractor={(t) => t.id}
        ListEmptyComponent={
          trips ? (
            <EmptyState
              title="Tu primer viaje"
              text="Crea un viaje, añade los sitios que quieres ver y la app decide el orden y la hora de cada visita."
              action={<Button title="Crear viaje" onPress={() => router.push('/trip/new')} />}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/trip/${item.id}`)}>
            <Title>{item.city}</Title>
            <Muted style={{ marginTop: space.xs }}>{dateRange(item.startDate, item.endDate)}</Muted>
          </Card>
        )}
        ListFooterComponent={
          trips && trips.length > 0 ? <Button title="Nuevo viaje" onPress={() => router.push('/trip/new')} /> : null
        }
      />
    </View>
  );
}
