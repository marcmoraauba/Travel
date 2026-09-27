# Probar Travel en tu móvil

## Opción rápida: Expo Go (5 minutos, sin cuentas)

Necesitas un ordenador con [Node.js 22](https://nodejs.org) y el móvil en la **misma wifi**.

1. Instala **Expo Go** en el móvil (App Store o Google Play).
2. En el ordenador:
   ```bash
   git clone https://github.com/marcmoraauba/Travel.git
   cd Travel
   git checkout claude/app-apple-play-store-io8yr0
   npm install
   npx expo start --go
   ```
3. Escanea el QR que aparece: en iPhone con la cámara, en Android desde Expo Go.
   Si no conecta (wifi de empresa, etc.): `npx expo start --go --tunnel`.

Qué funciona así y qué no:

| Funciona | No funciona (necesita la opción completa) |
|---|---|
| Crear viajes, fechas, ritmo | Mapa (su módulo no existe en Expo Go) |
| Buscar lugares con el buscador **básico del móvil** (direcciones y sitios conocidos) | Horarios automáticos de los sitios (ponlos a mano en la ficha) |
| Optimizar la ruta, repartir por días, reservas, comida, "voy tarde" | Tiempos reales: usa estimaciones por distancia |
| Todo se guarda en el móvil | Guías narradas (se generan en el servidor) |

Es suficiente para comprobar el flujo y el motor de rutas. Para el mapa y las guías, sigue abajo.

---

## Opción completa: build propio

La app completa usa el mapa de Mapbox, que no existe en Expo Go, así que hay que instalar un
build propio. El camino más rápido es Android, porque instalas un APK directamente.

## 1. Una vez: cuentas y backend

1. Crea cuentas (gratis): [Expo](https://expo.dev/signup), [Mapbox](https://account.mapbox.com),
   [Cloudflare](https://dash.cloudflare.com/sign-up) y [Anthropic](https://console.anthropic.com).
   En Anthropic, pon un **límite de gasto mensual** (p. ej. 10 USD) antes de nada.
2. En Mapbox copia dos tokens: el **público** (`pk.…`) y uno **secreto** (`sk.…`) con permisos de
   búsqueda y direcciones.
3. Descarga el código y despliega el backend:
   ```bash
   git clone https://github.com/marcmoraauba/Travel.git
   cd Travel
   git checkout claude/app-apple-play-store-io8yr0
   npm install

   cd backend
   npm install
   npx wrangler login
   npx wrangler secret put MAPBOX_TOKEN          # pega el sk.…
   npx wrangler secret put ANTHROPIC_API_KEY     # pega la clave de Anthropic
   npx wrangler kv namespace create GUIDES       # copia el id que devuelve…
   # …y descomenta el bloque [[kv_namespaces]] de backend/wrangler.toml pegando ese id
   npx wrangler deploy                           # apunta la URL que te da
   cd ..
   ```
   Comprueba que responde abriendo `https://<tu-url>/health` en el navegador: debe decir `{"ok":true}`.

## 2. Compilar e instalar

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://<tu-url> --visibility plaintext
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_MAPBOX_TOKEN --value pk.xxx --visibility plaintext

npx eas-cli@latest build --profile preview --platform android
```

Tarda unos 15–20 minutos. Al terminar, EAS muestra un enlace y un QR: ábrelo desde el Android e
instala el APK (acepta "instalar apps de origen desconocido").

**iPhone:** necesitas la cuenta de Apple Developer (99 USD/año) incluso para probar en tu móvil.
Con ella: `npx eas-cli@latest device:create` (registra tu iPhone) y
`npx eas-cli@latest build --profile preview --platform ios`.

## 3. Qué probar (15 minutos)

Crea el viaje **con fecha de hoy** para poder probar "voy tarde".

1. **Crear viaje:** busca tu ciudad, elige fechas con el selector (hoy y mañana), ritmo y "A pie".
   Opcional: busca tu alojamiento.
2. **Añadir lugares:** 5–6 sitios con el buscador ("Añadir lugar"). En uno, abre la ficha y pon:
   imprescindible, un horario (p. ej. `Mo-Su 10:00-14:00`) y una reserva a una hora.
3. **Repartir por días y optimizar:** comprueba que agrupa por zonas y que el día tiene horario y mapa.
4. **Día:** revisa que la reserva cae a su hora, que respeta el horario y que aparece la comida.
   Cambia "Empiezo/Termino" y recalcula.
5. **Guía:** pulsa "▶ Guía" en una parada. Prueba 30 s / 2 min / 5 min, Escuchar, Pausa,
   Continuar y la velocidad.
6. **Sin conexión:** en el viaje, "Descargar guías del viaje". Activa el modo avión: las guías
   deben abrirse y sonar, y "Recalcular ruta" debe funcionar con tiempos estimados.
7. **Voy tarde:** marca la primera parada como "✓ Hecho" y pulsa "Voy tarde · recalcular desde
   ahora" (acepta el permiso de ubicación).
8. **Ajustes:** "Borrar todos mis datos" debe dejar la app vacía.

## Si algo falla

- **El build falla en EAS:** pega aquí el enlace al log (o las últimas líneas del error).
- **La app se cierra o algo no va:** haz una captura y cuenta el paso exacto.
- **"No se pudo buscar":** revisa `/health` del backend y que `EXPO_PUBLIC_API_URL` no tenga barra final.
- **No sale el mapa:** falta `EXPO_PUBLIC_MAPBOX_TOKEN` en el entorno `preview` de EAS (hay que recompilar tras añadirlo).

## Para seguir desarrollando (opcional)

Con un *development build* ves los cambios de código al instante sin recompilar:

```bash
cp .env.example .env.local        # rellena la URL y el token pk.
npx eas-cli@latest build --profile development --platform android
npx expo start                     # con el móvil en la misma wifi, abre el build instalado
```
