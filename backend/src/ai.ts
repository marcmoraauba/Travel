import Anthropic from '@anthropic-ai/sdk';
import { HttpError, sha256 } from './http';
import type { Env } from './index';

/**
 * IA del backend (§6 del plan): guía narrada, texto escrito para escucharse,
 * cacheado en KV por (lugar, idioma, longitud).
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
