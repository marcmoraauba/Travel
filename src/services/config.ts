/**
 * Configuración que entra en tiempo de build (variables EXPO_PUBLIC_*, ver .env.example).
 *
 * - API_URL: el Worker de Cloudflare (backend/). Hace de proxy para Mapbox (búsqueda, matriz,
 *   direcciones) y más adelante para Claude. Las claves secretas viven SOLO allí.
 * - MAPBOX_PUBLIC_TOKEN: token público (pk.*) que el SDK de mapas necesita para pintar teselas.
 *   Mapbox lo diseña para ir en el cliente; restríngelo a los scopes de estilos/teselas en su panel.
 */
export const config = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, ''),
  mapboxPublicToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '',
  appKey: process.env.EXPO_PUBLIC_APP_KEY ?? '',
};

export const hasBackend = () => config.apiUrl.length > 0;
export const hasMap = () => config.mapboxPublicToken.startsWith('pk.');
