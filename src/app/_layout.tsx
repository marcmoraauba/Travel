import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { migrate } from '../db/schema';
import { useColors } from '../theme';

function Loading() {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

export default function RootLayout() {
  const c = useColors();
  return (
    <Suspense fallback={<Loading />}>
      <SQLiteProvider databaseName="travel.db" onInit={migrate} useSuspense>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.primary,
            headerTitleStyle: { color: c.text },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.bg },
            headerBackButtonDisplayMode: 'minimal',
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Mis viajes' }} />
          <Stack.Screen name="settings" options={{ title: 'Ajustes' }} />
          <Stack.Screen name="trip/new" options={{ title: 'Viaje', presentation: 'modal' }} />
          <Stack.Screen name="trip/[id]/index" options={{ title: '' }} />
          <Stack.Screen name="trip/[id]/add-place" options={{ title: 'Añadir lugar', presentation: 'modal' }} />
          <Stack.Screen name="place/[id]" options={{ title: 'Lugar' }} />
          <Stack.Screen name="day/[id]" options={{ title: 'Día' }} />
        </Stack>
      </SQLiteProvider>
    </Suspense>
  );
}
