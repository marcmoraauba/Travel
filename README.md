# Travel — planificador de rutas urbanas

App móvil (iOS y Android) que decide **en qué orden y a qué hora** visitar los sitios de un viaje,
respetando horarios de apertura, reservas y tiempos reales de desplazamiento.

**Viaje → Días → Lugares → Ruta optimizada** (la guía narrada con IA llega en la fase 4, ver [`docs/PLAN.md`](docs/PLAN.md)).

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| F0 | Expo + Expo Router, SQLite, modelo de datos, mapa Mapbox | ✅ |
| F1 | Viajes, lugares (buscador y alta manual), ficha editable, lista por días | ✅ (falta la recomendación por IA) |
| F2 | Optimizador con tests, matriz Mapbox, horario + mapa del día | ✅ |
| F3 | Reparto multi-día por zonas | ✅ · recálculo "voy tarde": pendiente |
| F4–F6 | Guía IA, vida en destino, cuentas | pendiente |
| Tiendas | Config EAS, permisos, iconos, privacidad, guía de publicación | ✅ listo para el primer build |

## Estructura

```
src/
  app/          Pantallas (Expo Router): viajes, viaje, lugar, día, ajustes
  core/         Lógica pura con tests: optimizador TSP-TW, horarios OSM, reparto por zonas
  db/           SQLite: esquema con migraciones y repositorio
  services/     Cliente del backend y orquestación (optimizar día, repartir viaje)
  components/   UI compartida, buscador, mapa
backend/        Cloudflare Worker: proxy de Mapbox con caché (y de Claude en F4)
docs/           Plan, guía de publicación, política de privacidad
scripts/        Generador de iconos provisionales
```

## Puesta en marcha

Requisitos: Node 22, una cuenta de [Expo](https://expo.dev) (gratis) y un móvil.

```bash
npm install
cp .env.example .env.local   # rellena los tokens (ver abajo)
npm test                     # tests del motor de rutas
```

La app usa módulos nativos (mapa, SQLite), así que **no funciona en Expo Go**: necesita un
*development build* que se instala en tu móvil una vez.

```bash
npx eas-cli@latest login
npx eas-cli@latest init                              # vincula el proyecto a tu cuenta de Expo
npx eas-cli@latest build --profile development --platform android   # o ios
# Instala el build en el móvil (enlace/QR que da EAS) y después:
npx expo start
```

### Cuentas externas

1. **Mapbox** ([account.mapbox.com](https://account.mapbox.com)):
   - Token **público** (`pk.…`) → `EXPO_PUBLIC_MAPBOX_TOKEN` (pinta el mapa).
   - Token **secreto** (`sk.…`) con permisos de Search y Directions/Matrix → solo en el Worker.
2. **Cloudflare** (gratis) para el backend:
   ```bash
   cd backend && npm install
   npx wrangler login
   npx wrangler secret put MAPBOX_TOKEN
   npx wrangler deploy        # te da la URL → EXPO_PUBLIC_API_URL
   ```

Sin backend la app sigue funcionando: alta manual de lugares y tiempos estimados por distancia.

## Comandos

| | |
|---|---|
| `npm test` | Tests del núcleo (vitest) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint (config de Expo) |
| `npx expo start` | Servidor de desarrollo para el development build |

## Publicar en App Store y Google Play

Paso a paso en **[`docs/PUBLICAR.md`](docs/PUBLICAR.md)**.
