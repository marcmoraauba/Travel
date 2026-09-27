/**
 * Backend de Travel (Cloudflare Worker).
 *
 * - Proxy de Mapbox: el token secreto nunca viaja dentro de la app.
 * - Caché en el borde: la misma búsqueda o matriz no se paga dos veces.
 * - Fase 4: aquí entrarán la generación de guías con Claude y su caché compartida.
 */

export interface Env {
  /** Token de Mapbox con scopes de Search y Navigation. `wrangler secret put MAPBOX_TOKEN`. */
  MAPBOX_TOKEN: string;
  /** Opcional: si se define, la app debe enviarlo en la cabecera X-App-Key. */
  APP_KEY?: string;
  /** Clave de la API de Claude. `wrangler secret put ANTHROPIC_API_KEY`. */
  ANTHROPIC_API_KEY?: string;
  /**
   * KV para las guías: se generan una vez y sirven para siempre y para todos.
   * `wrangler kv namespace create GUIDES` y pega el id en wrangler.toml.
   */
  GUIDES?: KVNamespace;
}

type Mode = 'walking' | 'cycling' | 'driving';
export interface Point {
  lat: number;
  lng: number;
}

import { generateGuide, recommendPlaces } from './ai';
import { HttpError, sha256 } from './http';

const MAPBOX = 'https://api.mapbox.com';
const MAX_POINTS = 25;
const DAY_SECONDS = 86_400;


const json = (data: unknown, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(maxAge ? { 'Cache-Control': `public, max-age=${maxAge}` } : {}),
    },
  });

function parseMode(v: unknown): Mode {
  if (v === 'walking' || v === 'cycling' || v === 'driving') return v;
  throw new HttpError(400, 'mode debe ser walking, cycling o driving');
}

function parsePoints(v: unknown): Point[] {
  if (!Array.isArray(v) || v.length < 2 || v.length > MAX_POINTS) {
    throw new HttpError(400, `points: entre 2 y ${MAX_POINTS} puntos`);
  }
  return v.map((p) => {
    const lat = Number((p as Point)?.lat);
    const lng = Number((p as Point)?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new HttpError(400, 'coordenadas no válidas');
    }
    // 5 decimales ≈ 1 m: suficiente y mejora el acierto de caché.
    return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
  });
}

const coordPath = (points: Point[]) => points.map((p) => `${p.lng},${p.lat}`).join(';');

async function mapbox(url: URL, env: Env): Promise<unknown> {
  url.searchParams.set('access_token', env.MAPBOX_TOKEN);
  const res = await fetch(url.toString());
  if (!res.ok) throw new HttpError(502, `Mapbox respondió ${res.status}`);
  return res.json();
}

// ——— Búsqueda ———

function normalizeCategory(categories: string[] | undefined): string | null {
  const text = (categories ?? []).join(' ').toLowerCase();
  if (!text) return null;
  const rules: [RegExp, string][] = [
    [/museum|gallery/, 'museum'],
    [/park|garden/, 'park'],
    [/viewpoint|scenic|lookout/, 'viewpoint'],
    [/church|cathedral|basilica|temple|mosque|synagogue|worship/, 'church'],
    [/restaurant|food/, 'restaurant'],
    [/cafe|coffee|bakery/, 'cafe'],
    [/market/, 'market'],
    [/monument|historic|landmark|attraction|castle|palace|ruins/, 'monument'],
  ];
  for (const [re, cat] of rules) if (re.test(text)) return cat;
  return 'other';
}

interface OpenPeriod {
  open?: { day: number; time: string };
  close?: { day: number; time: string };
}

/** Horario estructurado de Mapbox (día 0 = domingo) → cadena OSM `opening_hours`. */
export function periodsToOsm(periods: OpenPeriod[] | undefined): string | null {
  if (!periods?.length) return null;
  const OSM_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const byDay = new Map<number, string[]>();
  const hhmm = (t: string) => (/^\d{4}$/.test(t) ? `${t.slice(0, 2)}:${t.slice(2)}` : null);
  for (const p of periods) {
    if (!p.open || !p.close) return null;
    const a = hhmm(p.open.time);
    const b = hhmm(p.close.time);
    if (!a || !b || p.open.day < 0 || p.open.day > 6) return null;
    byDay.set(p.open.day, [...(byDay.get(p.open.day) ?? []), `${a}-${b}`]);
  }
  const rules: string[] = [];
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const spans = byDay.get(d);
    rules.push(`${OSM_DAYS[d]} ${spans ? spans.join(',') : 'off'}`);
  }
  return rules.join('; ');
}

interface SearchBoxFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    mapbox_id?: string;
    name?: string;
    full_address?: string;
    place_formatted?: string;
    poi_category?: string[];
    coordinates?: { latitude: number; longitude: number };
    metadata?: { open_hours?: { periods?: OpenPeriod[] } };
  };
}

export interface SearchResult {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  category: string | null;
  openingHours: string | null;
}

export async function searchMapbox(
  env: Env,
  opts: { q: string; kind: 'poi' | 'city'; near?: Point; lang?: string; limit?: number },
): Promise<SearchResult[]> {
  const { q, kind } = opts;
  const upstream = new URL(`${MAPBOX}/search/searchbox/v1/forward`);
  upstream.searchParams.set('q', q);
  upstream.searchParams.set('limit', String(opts.limit ?? 8));
  upstream.searchParams.set('language', opts.lang ?? 'es');
  upstream.searchParams.set('types', kind === 'city' ? 'place' : 'poi,address');
  if (opts.near) upstream.searchParams.set('proximity', `${opts.near.lng},${opts.near.lat}`);

  const data = (await mapbox(upstream, env)) as { features?: SearchBoxFeature[] };
  return (data.features ?? [])
    .map((f, i) => {
      const p = f.properties ?? {};
      const coords = p.coordinates
        ? { lat: p.coordinates.latitude, lng: p.coordinates.longitude }
        : f.geometry?.coordinates
          ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }
          : null;
      if (!coords || !p.name) return null;
      const result: SearchResult = {
        id: p.mapbox_id ?? `${i}`,
        name: p.name,
        address: p.full_address ?? p.place_formatted ?? null,
        lat: coords.lat,
        lng: coords.lng,
        category: kind === 'city' ? null : normalizeCategory(p.poi_category),
        openingHours: periodsToOsm(p.metadata?.open_hours?.periods),
      };
      return result;
    })
    .filter((r) => r !== null);
}

async function search(url: URL, env: Env) {
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2 || q.length > 200) throw new HttpError(400, 'q: entre 2 y 200 caracteres');
  const kind = url.searchParams.get('kind') === 'city' ? 'city' : 'poi';
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  const near = url.searchParams.has('lat') && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
  const results = await searchMapbox(env, { q, kind, near, lang: url.searchParams.get('lang') ?? 'es' });
  return { results };
}

// ——— Matriz y direcciones ———

async function matrix(body: unknown, env: Env) {
  const { mode, points } = body as { mode: unknown; points: unknown };
  const pts = parsePoints(points);
  const upstream = new URL(`${MAPBOX}/directions-matrix/v1/mapbox/${parseMode(mode)}/${coordPath(pts)}`);
  upstream.searchParams.set('annotations', 'duration');
  const data = (await mapbox(upstream, env)) as { code?: string; durations?: (number | null)[][] };
  if (data.code !== 'Ok' || !data.durations) throw new HttpError(502, `Matrix: ${data.code ?? 'sin datos'}`);
  return { minutes: data.durations.map((row) => row.map((s) => (s === null ? null : Math.round(s / 60)))) };
}

async function directions(body: unknown, env: Env) {
  const { mode, points } = body as { mode: unknown; points: unknown };
  const pts = parsePoints(points);
  const upstream = new URL(`${MAPBOX}/directions/v5/mapbox/${parseMode(mode)}/${coordPath(pts)}`);
  upstream.searchParams.set('geometries', 'geojson');
  upstream.searchParams.set('overview', 'full');
  const data = (await mapbox(upstream, env)) as {
    code?: string;
    routes?: { geometry?: { coordinates?: [number, number][] } }[];
  };
  const coordinates = data.routes?.[0]?.geometry?.coordinates;
  if (data.code !== 'Ok' || !coordinates) throw new HttpError(502, `Directions: ${data.code ?? 'sin ruta'}`);
  return { coordinates };
}

// ——— Router con caché ———

async function cached(cacheKeyUrl: string, ctx: ExecutionContext, produce: () => Promise<unknown>) {
  const cache = caches.default;
  const key = new Request(cacheKeyUrl, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = json(await produce(), 200, DAY_SECONDS);
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function readJson(request: Request): Promise<{ text: string; body: unknown }> {
  const text = await request.text();
  if (text.length > 10_000) throw new HttpError(413, 'Petición demasiado grande');
  try {
    return { text, body: JSON.parse(text) };
  } catch {
    throw new HttpError(400, 'JSON no válido');
  }
}


export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/health') return json({ ok: true });
      if (env.APP_KEY && request.headers.get('X-App-Key') !== env.APP_KEY) throw new HttpError(401, 'No autorizado');
      if (!env.MAPBOX_TOKEN) throw new HttpError(500, 'Falta MAPBOX_TOKEN en el Worker');

      if (request.method === 'GET' && url.pathname === '/v1/search') {
        url.searchParams.sort();
        return await cached(`https://cache.travel/search?${url.searchParams}`, ctx, () => search(url, env));
      }
      if (request.method === 'POST' && url.pathname === '/v1/recommend') {
        const { body } = await readJson(request);
        return json(await recommendPlaces(env, body, (q, near) => searchMapbox(env, { q, kind: 'poi', near, limit: 3 })));
      }
      if (request.method === 'POST' && url.pathname === '/v1/guide') {
        const { body } = await readJson(request);
        return json(await generateGuide(env, body, ctx));
      }
      if (request.method === 'POST' && (url.pathname === '/v1/matrix' || url.pathname === '/v1/directions')) {
        const { text, body } = await readJson(request);
        const handler = url.pathname === '/v1/matrix' ? matrix : directions;
        const key = `https://cache.travel${url.pathname}/${await sha256(text)}`;
        return await cached(key, ctx, () => handler(body, env));
      }
      throw new HttpError(404, 'No encontrado');
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Error interno' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
