# Política de privacidad de Travel

Última actualización: 27 de septiembre de 2026 (añadidas sugerencias y guías con IA).

Travel es un planificador de rutas para viajes. Esta política explica qué datos maneja la app.

## Qué datos se guardan y dónde

- **Tus viajes, lugares, horarios, reservas y notas se guardan solo en tu dispositivo.**
  No tenemos cuentas de usuario y no guardamos copia de esa información en ningún servidor.
- Puedes borrarlo todo en cualquier momento desde **Ajustes → Borrar todos mis datos**,
  o desinstalando la app.

## Qué datos salen del dispositivo

Para que funcionen la búsqueda de lugares, los tiempos de desplazamiento y el mapa, la app envía
a nuestro servidor (un servicio en Cloudflare) y este reenvía a **Mapbox**:

- El texto que escribes en el buscador y la ciudad aproximada en la que buscas.
- Las coordenadas de los lugares de un día, para calcular tiempos y la ruta entre ellos.

Además, el mapa descarga imágenes directamente de Mapbox, que recibe la zona del mapa que estás viendo.

Si usas las **sugerencias de la IA** o las **guías narradas**, nuestro servidor envía a
**Anthropic** (el proveedor del modelo de IA Claude) la ciudad, el número de días, lo que escribas
en "¿Qué te apetece ver?", los nombres de los lugares que ya tienes en el viaje y, para las guías,
el nombre y las coordenadas del lugar. No se envía ningún dato personal. Las guías generadas se
guardan en nuestro servidor, sin asociarlas a nadie, para servir la misma guía a todos los viajeros
que visiten ese lugar. Política de Anthropic: https://www.anthropic.com/legal/privacy

La narración en voz alta usa el motor de voz de tu propio dispositivo: el audio no sale del móvil.

Estos datos no incluyen tu nombre, correo ni ningún identificador personal, no se usan para
publicidad ni se venden. El servidor guarda en caché resultados de búsquedas y rutas durante un
máximo de 24 horas para no repetir peticiones, sin asociarlos a ninguna persona.

Consulta la política de privacidad de Mapbox: https://www.mapbox.com/legal/privacy

## Ubicación

Si lo permites, la app usa tu ubicación **solo mientras la usas** (por ejemplo, para "Usar mi
ubicación" al crear un viaje). No se usa en segundo plano ni se guarda en ningún servidor.
Puedes retirar el permiso en los ajustes del sistema.

## Menores

La app no está dirigida a menores de 13 años y no recoge datos de forma consciente de ellos.

## Cambios y contacto

Si esta política cambia, se actualizará esta página y la fecha de arriba.
Contacto: abre una incidencia en https://github.com/marcmoraauba/travel/issues
