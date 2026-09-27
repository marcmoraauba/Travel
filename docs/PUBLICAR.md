# Publicar Travel en App Store y Google Play

Guía paso a paso. Todo se construye en la nube con **EAS** (Expo Application Services): no
necesitas un Mac ni Android Studio. Los importes y requisitos de las tiendas cambian; compruébalos
en sus webs antes de pagar nada.

---

## 0. Qué necesitas antes de empezar

| Cuenta | Coste orientativo | Para qué |
|---|---|---|
| [Expo](https://expo.dev/signup) | Gratis (plan gratuito con builds limitados al mes) | Compilar y enviar a las tiendas |
| [Apple Developer Program](https://developer.apple.com/programs/enroll/) | 99 USD/año | Publicar en App Store |
| [Google Play Console](https://play.google.com/console/signup) | 25 USD, pago único | Publicar en Google Play |
| Mapbox + Cloudflare | Gratis en uso bajo | Mapa, búsqueda y tiempos (ver README) |

> Si te das de alta como **empresa** (p. ej. tu agencia) Apple pide un número D-U-N-S, que tarda
> unos días. Como persona física es inmediato, pero tu nombre aparecerá como vendedor.

**Importante — cuenta personal de Google Play:** las cuentas personales nuevas deben hacer una
**prueba cerrada con al menos 12 testers durante 14 días seguidos** antes de poder publicar en
producción. Las cuentas de organización no tienen este requisito. Empieza la prueba cerrada cuanto
antes (paso 5).

---

## 1. Preparar el proyecto (una vez)

1. **Backend en marcha.** Despliega `backend/` (README → "Cuentas externas"). Los revisores de
   Apple y Google probarán la app de verdad: si la búsqueda no funciona, la rechazan.
2. **Identificadores.** En `app.json` están:
   - `ios.bundleIdentifier` y `android.package`: `com.marcmoraauba.travel`.
     Cámbialos ahora si quieres otro: **después de publicar no se pueden cambiar**.
   - `name`: "Travel". En App Store el nombre debe ser único y "Travel" casi seguro está cogido;
     elige uno propio de hasta 30 caracteres (p. ej. "Travel · Rutas por la ciudad") y ponlo
     igual en `app.json` y en la ficha de la tienda.
3. **Icono.** `assets/` tiene un icono provisional (generado con `scripts/generate-icons.py`).
   Sustitúyelo por uno de diseño manteniendo nombres y tamaños (1024×1024, sin transparencia en `icon.png`).
4. **Política de privacidad pública.** Ambas tiendas exigen una URL accesible sin iniciar sesión.
   `docs/PRIVACY.md` ya está redactada; publícala en una URL pública (GitHub Pages, Notion, tu web)
   y actualiza `PRIVACY_URL` en `src/app/settings.tsx`. Si el repositorio es privado, el enlace de
   GitHub **no** sirve.
5. **Vincular con Expo:**
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```
6. **Variables de entorno para los builds** (una vez por entorno: `development`, `preview`, `production`):
   ```bash
   npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_API_URL --value https://travel-api.<tu-subdominio>.workers.dev --visibility plaintext
   npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_MAPBOX_TOKEN --value pk.xxx --visibility plaintext
   ```
   Si al compilar iOS falla la descarga del SDK de Mapbox pidiendo un *download token*, añade un
   token secreto de Mapbox con el scope `DOWNLOADS:READ` como variable de entorno de EAS
   `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (visibilidad *secret*). El plugin la lee sola; no hace falta tocar `app.json`.

---

## 2. Probar en tu móvil

```bash
# Android: genera un APK instalable directamente
npx eas-cli@latest build --profile preview --platform android

# iOS: registra tu iPhone una vez y compila para él
npx eas-cli@latest device:create
npx eas-cli@latest build --profile preview --platform ios
```

EAS te da un enlace/QR para instalarlo. Haz un viaje real (o una tarde por tu ciudad) antes de enviar.

---

## 3. Compilar para las tiendas

```bash
npx eas-cli@latest build --profile production --platform all
```

- iOS: la primera vez EAS te pide iniciar sesión con tu Apple ID y **crea por ti** certificados y
  perfiles de aprovisionamiento. Acepta que los gestione EAS.
- Android: EAS genera y guarda la clave de firma (*upload key*). No la pierdas: EAS la custodia.
- El número de build (`buildNumber` / `versionCode`) se incrementa solo en cada build de producción.
  Para una versión nueva visible al usuario, sube `version` en `app.json` (1.0.0 → 1.1.0).

---

## 4. App Store (iOS)

1. En [App Store Connect](https://appstoreconnect.apple.com) → **Apps → +** → Nueva app:
   plataforma iOS, nombre, idioma principal Español, el *bundle ID* de `app.json`, SKU cualquiera (p. ej. `travel-001`).
2. Envía el build:
   ```bash
   npx eas-cli@latest submit --platform ios --latest
   ```
   Aparece en **TestFlight** tras unos minutos de procesamiento. Pruébalo desde TestFlight.
3. Rellena la ficha:
   - **Capturas**: iPhone de 6,9" (1320×2868 o 1290×2796). Mínimo 1, recomendado 3–5
     (lista de viajes, día con mapa y horario, ficha de lugar).
   - Descripción, palabras clave, URL de soporte y **URL de la política de privacidad**.
   - **Categoría**: Viajes. **Clasificación por edades**: responde el cuestionario (todo "No" → 4+).
4. **Privacidad de la app** (etiquetas "nutricionales"). Con el comportamiento actual, respuesta prudente:
   - *Ubicación → Ubicación aproximada*: recopilada, **no vinculada** a la identidad, **no** usada para rastreo, finalidad "Funcionalidad de la app".
   - *Búsquedas*: igual (no vinculadas, sin rastreo, funcionalidad).
   - *Otro contenido del usuario* (lo que escribe al pedir sugerencias a la IA): igual.
   - Sin cuentas, sin analítica, sin publicidad.
5. **Cifrado**: `app.json` ya declara `usesNonExemptEncryption: false` (solo HTTPS), así que no te
   lo preguntará en cada build.
6. **Notas para el revisor**: explica que no hay cuenta, y cómo probar: *"Crear viaje → busca
   'Roma' → Sugerencias de la IA → añade las propuestas → abre Día 1 → ▶ Guía en cualquier parada"*.
   Menciona que las sugerencias y guías se generan con IA (Claude, de Anthropic).
7. **Enviar a revisión.** Suele tardar entre 1 y 3 días.

---

## 5. Google Play (Android)

1. En [Play Console](https://play.google.com/console) → **Crear aplicación**: nombre, idioma
   predeterminado Español, App, Gratis.
2. **Primer build a mano** (Google exige que el primer AAB se suba desde la web):
   descarga el `.aab` del build de producción desde expo.dev y súbelo en
   **Pruebas → Prueba interna → Crear versión**.
3. **Cuenta de servicio para envíos automáticos** (a partir del segundo build):
   sigue la guía de Expo "Creating a Google Service Account" y sube la clave JSON a EAS
   (`npx eas-cli@latest credentials` → Android → Google Service Account). Desde entonces:
   ```bash
   npx eas-cli@latest submit --platform android --latest
   ```
   `eas.json` lo envía a la pista **internal** como borrador; promociónalo desde la consola.
4. **Contenido de la aplicación** (menú "Política"): rellena todo:
   - Política de privacidad (URL pública).
   - Acceso a la app: "Toda la funcionalidad está disponible sin restricciones".
   - Anuncios: No.
   - Clasificación de contenido: cuestionario IARC.
   - Público objetivo: 13+ (o 18+).
   - **Seguridad de los datos**: *Ubicación aproximada* y *Historial de búsqueda en la app*:
     recopilados, no compartidos (Mapbox actúa como proveedor de servicio), no opcionales,
     finalidad "Funciones de la app", cifrados en tránsito. Sin datos personales ni cuentas.
5. **Ficha de Play Store**: icono 512×512 (usa `assets/icon.png` reducido), gráfico destacado
   1024×500, mínimo 2 capturas de teléfono, descripción breve (80 caracteres) y completa.
6. **Prueba cerrada** (obligatoria en cuentas personales nuevas): crea una pista de prueba cerrada,
   añade al menos 12 testers (lista de correos de Google) y mantenla 14 días. Después, solicita
   acceso a producción desde el panel.
7. **Producción → Crear versión → Enviar a revisión.** Suele tardar de horas a unos días.

---

## 6. Actualizaciones

- **Cambios solo de JavaScript** (pantallas, textos, lógica): se pueden publicar al instante con
  EAS Update sin pasar por revisión. Actívalo cuando lo necesites:
  `npx expo install expo-updates && npx eas-cli@latest update:configure`.
- **Cambios nativos** (nuevas librerías nativas, permisos, iconos, `app.json`): nuevo build de
  producción + `eas submit` + revisión.

---

## Lista de comprobación antes de enviar

- [ ] Backend desplegado y `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_MAPBOX_TOKEN` en el entorno `production` de EAS
- [ ] Bundle ID / package definitivos
- [ ] Nombre de la app disponible en App Store
- [ ] Icono definitivo
- [ ] Política de privacidad en una URL pública y enlazada en Ajustes
- [ ] Probado en un iPhone y un Android reales (sin red también: debe estimar tiempos)
- [ ] Capturas hechas
- [ ] `npm test && npm run typecheck && npm run lint` en verde
