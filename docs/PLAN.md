# Travel — Planificador de rutas urbanas con IA

Documento de planteamiento. Versión 2 — 27/09/2026.
Versión 1 (31/08/2026): acuerdo previo al desarrollo. Versión 2: F0–F4 construidas; se descarta la
recomendación de lugares por IA (ver §5b) y se fija la voz del sistema para la guía (ver §6).

---

## 1. Qué es

Una app móvil donde el flujo es:

**Viaje → Días → Lugares → Ruta optimizada → Guía narrada**

El usuario mete los sitios que quiere ver en una ciudad —con el buscador o a mano— y la app
decide *en qué orden y a qué hora*
visitarlos para aprovechar el día, respetando horarios de apertura y tiempos reales de
desplazamiento. Al llegar a cada sitio, tiene una explicación lista para leer o escuchar.

## 2. Decisiones tomadas

| Decisión | Elección | Consecuencia |
|---|---|---|
| Alcance | Personal ahora, público después | Sin cuentas de usuario en el MVP, pero backend desde el día 1 y datos preparados para multiusuario |
| Stack | Expo / React Native + TypeScript | iOS y Android con un código; probable en móvil propio desde la primera semana |
| Mapas y lugares | Mapbox + OpenStreetMap | Coste bajo; sin transporte público; horarios OSM irregulares (ver §7) |
| MVP | Ruta óptima primero | La guía IA entra en la fase 4 |
| IA | Solo para la guía narrada | Sin recomendación de lugares: el coste de IA no crece con cada petición (ver §5b) |
| Voz | La del sistema (`expo-speech`) | Gratis y sin conexión; la voz neuronal queda para después |

## 3. Arquitectura

```
┌─────────────────────────────┐
│  App (Expo / React Native)  │
│                             │
│  · UI: expo-router          │
│  · Mapa: @rnmapbox/maps     │
│  · Datos: SQLite local      │  ← local-first: el viaje funciona sin red
│  · Motor de optimización    │  ← TypeScript puro, corre en el móvil
│  · Voz: expo-speech         │
└──────────────┬──────────────┘
               │ HTTPS
┌──────────────┴──────────────┐
│  Backend (Cloudflare Workers)│
│                             │
│  · Proxy de claves API      │  ← Mapbox y Claude nunca viajan en la app
│  · Caché de descripciones   │  ← el texto del Coliseo se genera UNA vez
│  · Más adelante: cuentas    │
└──────┬───────────────┬──────┘
       │               │
   Mapbox API      Claude API
```

**Por qué el backend no es opcional**, aunque la app sea de uso personal: una clave de API dentro
de una app móvil se extrae en minutos, y quien la extraiga gasta a tu cuenta. Además, la caché
de descripciones divide el coste de IA por dos órdenes de magnitud en cuanto haya más de un usuario.

## 4. Modelo de datos

```
Trip        id, ciudad, coords centro, fecha_inicio, fecha_fin, ritmo, modo_transporte
Day         id, trip_id, fecha, hora_inicio, hora_fin, notas
Place       id, trip_id, nombre, coords, categoría, duración_visita_min,
            prioridad (imprescindible|opcional), horarios, precio, requiere_reserva,
            fuente_horarios (osm|manual|ia_sin_verificar),
            origen (manual|busqueda), geocodificado (sí|no)
DayStop     id, day_id, place_id, orden, hora_llegada, hora_salida, min_desplazamiento
Booking     id, place_id, hora_fija, referencia          ← ancla dura en la optimización
Guide       place_id, idioma, longitud (30s|2min|5min), texto, audio_path, generado_en
```

Local-first en SQLite. La sincronización con el backend llega en la fase 6, cuando haya cuentas.

## 5. El motor de optimización (el núcleo)

El reparto de responsabilidades es lo que hace que esto funcione:

> **El algoritmo se ocupa de la geometría y los tiempos. La IA se ocupa del criterio y la explicación.**

Si la IA ordena los puntos, inventa distancias y produce rutas absurdas con aire de seguridad.
Si el algoritmo lo hace todo, no entiende que no apetece encadenar tres museos.

### Entrada
- Lista de lugares con duración de visita, prioridad y horarios
- Matriz de tiempos reales entre lugares (Mapbox Matrix API)
- Ventana del día (p. ej. 09:00–20:00), punto de inicio (hotel) y fin
- Reservas con hora fija
- Preferencias blandas: hora de comer, evitar encadenar museos, atardecer en un mirador concreto

### Algoritmo
Es un **TSP con ventanas temporales**, no un "ordenar por cercanía":

1. **Construcción** — inserción voraz: se colocan primero las anclas duras (reservas), luego los
   imprescindibles, luego los opcionales en el hueco de menor coste.
2. **Mejora** — búsqueda local 2-opt y or-opt sobre la función de coste hasta que no mejore.
3. **Función de coste** — minimiza: tiempo de desplazamiento + esperas por sitios cerrados +
   penalizaciones (imprescindible descartado, comida fuera de rango, museos consecutivos).
4. Corre en milisegundos en el móvil. Módulo de TypeScript puro, **con tests unitarios**, sin
   dependencias de UI ni de red — es la pieza que hay que poder verificar a conciencia.

### Multi-día
Con 25 lugares y 3 días, primero se **agrupan por zonas geográficas** y se asigna un grupo por día.
Repartir lugares sueltos hace cruzar la ciudad dos veces; repartir zonas, no.

### Papel de la IA aquí
Hoy ninguno: el optimizador es solo algoritmo, y la duración de visita la pone el usuario (con un
valor por defecto según la categoría). Ideas por si se retoma, ninguna implementada:
- Traducir lenguaje natural a restricciones: *"el domingo tranquilo y comiendo por el centro"*.
- Estimar la duración de visita cuando no hay dato.
- Explicar el resultado: *"te pongo la Sagrada Família a primera hora porque a mediodía la cola se dispara"*.

Cualquiera de ellas se valoraría con el mismo criterio que §5b: cuánto cuesta por petición y si
se puede cachear.

### Límite técnico conocido
La Matrix API de Mapbox admite un número acotado de coordenadas por petición (del orden de 25 para
a pie y coche). Un día real rara vez pasa de 12 paradas, así que no molesta; para multi-día se
trocea por zonas. Se confirma con la documentación vigente antes de implementar.

## 5b. Recomendación de lugares por IA — descartada

Se llegó a construir (la IA proponía lugares y el backend los situaba en Mapbox, dejando aparte los
que no casaban con confianza) y se retiró el 27/09/2026. Motivos:

- **Coste que crece con el uso.** Cada petición de sugerencias es distinta y no se puede cachear:
  unos 0,09 USD por petición, que con 1.000 usuarios activos rondan los 180 USD/mes.
- **Riesgo de abuso.** Es la ruta más fácil de explotar a costa de la cuenta del backend.
- **No es el núcleo.** El valor de la app está en ordenar y programar el día y en la guía; los
  lugares se añaden bien con el buscador.

Si se retoma, necesitaría límites por dispositivo o cuenta (fase 6) o ser una función de pago.

## 6. La guía narrada

- Tres longitudes por lugar: **30 s** (llegada rápida), **2 min** (estándar), **5 min** (a fondo).
- Modo lectura y modo recitado con la **voz del sistema** (`expo-speech`), párrafo a párrafo para que
  pausar y reanudar funcione igual en iOS y Android. La voz neuronal (MP3 pregenerado en el backend,
  columna `guides.audio_path`) queda para después si la del sistema se queda corta.
- **Se genera y descarga al preparar el viaje, no al llegar.** En destino puede no haber datos, y
  esperar a que se genere un texto delante de un monumento arruina el momento.
- Caché en el backend por (lugar, idioma, longitud): se genera una vez y sirve siempre.
- Opcional (fase 5): aviso automático al llegar por geolocalización — *"estás en el Panteón, ¿te lo cuento?"*.

Sobre la fiabilidad: las descripciones son divulgación histórica y cultural, no datos operativos.
Los horarios, precios y reservas **nunca** se generan con IA sin marcarlos como no verificados.

## 7. Riesgos asumidos y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| Mapbox no enruta en transporte público | Proveedor de rutas desacoplado tras una interfaz. A pie cubre los centros históricos; se enchufa un proveedor de transporte público más adelante sin tocar el motor |
| Horarios OSM incompletos | Parser de `opening_hours`, edición manual siempre visible, relleno IA marcado como *sin verificar* |
| Coste de IA al abrir a público | La IA solo genera guías, cacheadas por lugar y compartidas: se pagan una vez (~0,10 USD por lugar). Límite de gasto en la consola de Anthropic y *rate limiting* en Cloudflare |
| Batería con GPS en segundo plano | Geofencing nativo (no polling continuo), y desactivable |
| Datos de POI turísticos pobres en OSM | Alta manual y por pegado de enlace siempre disponibles como vía de escape |

## 8. Fases

**F0 — Esqueleto.** Proyecto Expo, navegación, mapa Mapbox, SQLite, modelo de datos.
**F1 — Viajes y lugares.** Crear viaje; añadir lugares por buscador o a mano; ficha editable, lista por días.
**F2 — Motor de rutas.** Optimizador con tests, matriz Mapbox, vista timeline + mapa del día. *Aquí ya es útil en un viaje real.*
**F3 — Multi-día y en ruta.** Agrupación por zonas, recálculo sobre la marcha ("voy tarde").
**F4 — Guía IA.** Backend proxy + caché, generación de textos, voz, descarga offline.
**F5 — Vida en destino.** Avisos por geolocalización, presupuesto, notas, fotos.
**F6 — Apertura a público.** Cuentas, sincronización, límites de uso, privacidad, publicación en tiendas.

## 9. Cuentas externas necesarias (antes de F2)

- **Mapbox** — token de acceso. Tiene capa gratuita mensual amplia; para uso personal es previsiblemente coste cero.
- **Claude API** — clave, a partir de F4. Con caché el gasto de uso personal es marginal.
- **Cloudflare** — cuenta gratuita para el Worker, a partir de F4 (o antes si se quiere el proxy de Mapbox desde el principio).

Las tarifas vigentes se verifican antes de comprometer nada.

## 10. Fuera de alcance por ahora

Reservas y compra de entradas dentro de la app, vuelos y hoteles, red social o compartir público
de rutas, traducción en tiempo real, realidad aumentada, recomendación de lugares por IA (§5b).
