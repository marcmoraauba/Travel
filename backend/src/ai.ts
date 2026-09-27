import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import { HttpError, sha256 } from './http';
import type { Env, Point, SearchResult } from './index';

/**
 * IA del backend (§5b y §6 del plan):
 * - Recomendación de lugares: la IA propone nombres; aquí se geocodifican contra Mapbox y solo
 *   los que casan con confianza llevan coordenadas. El resto lo resuelve el usuario.
 * - Guía narrada: texto escrito para escucharse, cacheado en KV por (lugar, idioma, longitud).
 */

const MODEL = 'claude-opus-5';
/** Si el modelo declina una petición, la API la reintenta con el modelo recomendado. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function client(env: Env) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'IA no configurada: falta ANTHROPIC_API_KEY en el Worker');
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 });
}

const str = (v: unknown, max: number, field: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${field} es obligatorio`);
  return v.trim().slice(0, max);
};
const num = (v: unknown, field: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `${field} no válido`);
  return n;
};
const lang = (v: unknown) => (typeof v === 'string' && /^[a-z]{2}$/.test(v) ? v : 'es');

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['the', 'del', 'los', 'las', 'della', 'di'].includes(w));
}

/** Coincidencia de nombres tolerante: "Colosseo" ~ "Coliseo" no, pero "Museo del Prado" ~ "Prado Museum" sí. */
export function namesMatch(a: string, b: string) {
  const wa = normalize(a);
  const wb = new Set(normalize(b));
  if (!wa.length || !wb.size) return false;
  const shared = wa.filter((w) => wb.has(w) || [...wb].some((x) => x.startsWith(w.slice(0, 5)) && w.length >= 5)).length;
  return shared / Math.min(wa.length, wb.size) >= 0.5;
}

function distanceKm(a: Point, b: Point) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(toRad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

// ——— Recomendación ———

const CATEGORIES = ['museum', 'monument', 'church', 'park', 'viewpoint', 'market', 'restaurant', 'cafe', 'other'] as const;

const Recommendation = z.object({
  places: z.array(
    z.object({
      name: z.string().describe('Nombre con el que aparece en los mapas, en el idioma local si es el habitual'),
      searchQuery: z.string().describe('Texto para buscarlo en un mapa: nombre local + ciudad'),
      category: z.enum(CATEGORIES),
      reason: z.string().describe('Una frase: por qué merece la pena, en el idioma del usuario'),
      visitMinutes: z.number().int().describe('Duración realista de la visita en minutos'),
      priority: z.enum(['must', 'optional']),
    }),
  ),
});

export async function recommendPlaces(
  env: Env,
  body: unknown,
  geocode: (q: string, near: Point) => Promise<SearchResult[]>,
) {
  const b = (body ?? {}) as Record<string, unknown>;
  const city = str(b.city, 100, 'city');
  const center = { lat: num(b.lat, 'lat'), lng: num(b.lng, 'lng') };
  const days = Math.min(Math.max(Math.round(num(b.days ?? 1, 'days')), 1), 21);
  const request = typeof b.request === 'string' ? b.request.trim().slice(0, 500) : '';
  const existing = Array.isArray(b.existing) ? b.existing.filter((x) => typeof x === 'string').slice(0, 100) : [];
  const language = lang(b.lang);
  const count = Math.min(Math.max(days * 4, 5), 20);

  const response = await client(env).beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(Recommendation) },
    system:
      'Eres un guía local experto que ayuda a planificar visitas urbanas. Propón lugares reales y ' +
      'visitables que existan hoy, con el nombre exacto con el que aparecen en los mapas. No incluyas ' +
      'horarios ni precios: la app los obtiene de otras fuentes. Si el usuario pide algo concreto ' +
      '(con niños, gratis, poco turístico, un barrio), ajústate a ello.',
    messages: [
      {
        role: 'user',
        content:
          `Ciudad: ${city}. Días de visita: ${days}. Propón unos ${count} lugares.\n` +
          (request ? `Lo que busca el viajero: ${request}\n` : '') +
          (existing.length ? `Ya tiene en su lista (no los repitas): ${existing.join('; ')}\n` : '') +
          `Responde en el idioma con código "${language}".`,
      },
    ],
  });
  if (response.stop_reason === 'refusal') throw new HttpError(422, 'La IA no ha podido responder a esta petición');
  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, 'Respuesta de la IA no válida');

  // Geocodificación: solo entra con coordenadas lo que casa por nombre y está cerca de la ciudad.
  const suggestions = await Promise.all(
    parsed.places.slice(0, 20).map(async (p) => {
      let match: SearchResult | null = null;
      try {
        const candidates = await geocode(p.searchQuery || `${p.name} ${city}`, center);
        match =
          candidates.find((c) => distanceKm(center, c) <= 30 && (namesMatch(p.name, c.name) || namesMatch(c.name, p.name))) ??
          null;
      } catch {
        match = null;
      }
      return {
        name: p.name,
        category: p.category,
        reason: p.reason,
        visitMinutes: Math.min(Math.max(p.visitMinutes, 10), 480),
        priority: p.priority,
        match,
      };
    }),
  );
  return { suggestions };
}

// ——— Guía narrada ———

const LENGTHS = {
  short: { words: 75, label: 'unos 30 segundos' },
  standard: { words: 300, label: 'unos 2 minutos' },
  long: { words: 750, label: 'unos 5 minutos' },
} as const;
type GuideLength = keyof typeof LENGTHS;

const GUIDE_SYSTEM = `Escribes guiones de audioguía que se escuchan con auriculares delante del lugar, leídos por una voz sintética.

Escribe para el oído, no para la vista:
- Frases cortas y naturales. Una idea por frase.
- Habla de tú al viajero y sitúalo: "fíjate en…", "a tu izquierda…", solo si es algo que seguro se ve.
- Sin listas, títulos, paréntesis, abreviaturas, emojis ni markdown. Solo párrafos de texto plano.
- Fechas y números como se dicen en voz alta ("a finales del siglo quince", "unos cincuenta metros").
- Empieza directamente con algo que enganche; nada de "Bienvenido a…".
- Cuenta historia, curiosidades y qué mirar. Nunca horarios, precios ni reservas.

Rigor: es divulgación, así que solo afirma lo que sea historia bien establecida. Si no conoces bien el lugar, cuenta menos y más general, sin inventar fechas, nombres ni anécdotas.`;

export async function generateGuide(env: Env, body: unknown, ctx: ExecutionContext) {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = str(b.name, 150, 'name');
  const city = str(b.city, 100, 'city');
  const lat = num(b.lat, 'lat');
  const lng = num(b.lng, 'lng');
  const category = typeof b.category === 'string' ? b.category.slice(0, 30) : '';
  const language = lang(b.lang);
  const length: GuideLength = b.length === 'short' || b.length === 'long' ? b.length : 'standard';

  // Clave estable: el mismo lugar da la misma guía a todos los usuarios.
  const key = `guide:v1:${language}:${length}:${await sha256(`${normalize(name).join(' ')}|${lat.toFixed(3)}|${lng.toFixed(3)}`)}`;
  const hit = await env.GUIDES?.get(key);
  if (hit) return { text: hit, cached: true };

  const spec = LENGTHS[length];
  const response = await client(env).beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: GUIDE_SYSTEM,
    messages: [
      {
        role: 'user',
        content:
          `Lugar: ${name}${category ? ` (${category})` : ''}, en ${city}. Coordenadas ${lat.toFixed(5)}, ${lng.toFixed(5)}.\n` +
          `Escribe un guion de ${spec.label} (alrededor de ${spec.words} palabras) en el idioma con código "${language}".`,
      },
    ],
  });
  if (response.stop_reason === 'refusal') throw new HttpError(422, 'La IA no ha podido generar esta guía');
  const text = response.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n')
    .trim();
  if (!text) throw new HttpError(502, 'Guía vacía');

  if (env.GUIDES) ctx.waitUntil(env.GUIDES.put(key, text));
  return { text, cached: false };
}
