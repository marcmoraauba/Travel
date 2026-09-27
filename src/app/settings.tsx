import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Linking, ScrollView } from 'react-native';
import { Button, Card, Muted, SectionTitle, Title } from '../components/ui';
import { wipeAll } from '../db/repo';
import { hasBackend, hasMap } from '../services/config';
import { space } from '../theme';

const PRIVACY_URL = 'https://github.com/marcmoraauba/travel/blob/main/docs/PRIVACY.md';

export default function SettingsScreen() {
  const db = useSQLiteContext();

  const confirmWipe = () =>
    Alert.alert('Borrar todos los datos', 'Se eliminarán todos tus viajes de este dispositivo. No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await wipeAll(db);
          router.dismissAll();
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg }}>
      <SectionTitle>Privacidad</SectionTitle>
      <Card>
        <Title>Tus datos se quedan en tu móvil</Title>
        <Muted style={{ marginTop: space.xs }}>
          Los viajes se guardan solo en este dispositivo. Para buscar sitios y calcular tiempos se envían
          búsquedas y coordenadas de los lugares a nuestro servidor, que las reenvía a Mapbox. No hay cuentas
          ni publicidad.
        </Muted>
      </Card>
      <Button title="Política de privacidad" variant="secondary" onPress={() => Linking.openURL(PRIVACY_URL)} />
      <Button title="Borrar todos mis datos" variant="danger" onPress={confirmWipe} style={{ marginTop: space.md }} />

      <SectionTitle>Acerca de</SectionTitle>
      <Card>
        <Muted>Versión {Constants.expoConfig?.version ?? '—'}</Muted>
        <Muted>Búsqueda y tiempos reales: {hasBackend() ? 'activados' : 'sin configurar (se usan estimaciones)'}</Muted>
        <Muted>Mapa: {hasMap() ? 'activado' : 'sin configurar'}</Muted>
        <Muted style={{ marginTop: space.sm }}>Datos de mapas © Mapbox © OpenStreetMap</Muted>
      </Card>
    </ScrollView>
  );
}
