import { haversineMeters, LatLng } from './geo';

/**
 * Reparto multi-día (§5, "Multi-día"): se agrupan los lugares por zonas y se asigna una zona por día.
 * Repartir lugares sueltos hace cruzar la ciudad dos veces; repartir zonas, no.
 */

export interface ClusterPlace {
  id: string;
  coords: LatLng;
  durationMin: number;
  /** Índice de día obligatorio (p. ej. tiene reserva ese día). */
  pinnedDay?: number;
  /** Días (índices) en los que está cerrado. */
  closedDays?: number[];
}

export interface DayCapacity {
  /** Minutos disponibles para visitas ese día (ventana menos una estimación de desplazamientos). */
  minutes: number;
}

/** k-means con arranque "el más lejano primero": determinista y sin dependencias. */
function kmeans(points: LatLng[], k: number, iterations = 50): number[] {
  if (points.length === 0) return [];
  const centers: LatLng[] = [points[0]];
  while (centers.length < k) {
    let bestIdx = 0;
    let bestDist = -1;
    points.forEach((p, i) => {
      const d = Math.min(...centers.map((c) => haversineMeters(p, c)));
      if (d > bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    centers.push(points[bestIdx]);
  }

  let assign = points.map(() => 0);
  for (let it = 0; it < iterations; it++) {
    const next = points.map((p) => {
      let best = 0;
      for (let c = 1; c < k; c++) {
        if (haversineMeters(p, centers[c]) < haversineMeters(p, centers[best])) best = c;
      }
      return best;
    });
    const changed = next.some((a, i) => a !== assign[i]);
    assign = next;
    for (let c = 0; c < k; c++) {
      const members = points.filter((_, i) => assign[i] === c);
      if (members.length) {
        centers[c] = {
          lat: members.reduce((s, p) => s + p.lat, 0) / members.length,
          lng: members.reduce((s, p) => s + p.lng, 0) / members.length,
        };
      }
    }
    if (!changed && it > 0) break;
  }
  return assign;
}

function permutations(n: number): number[][] {
  if (n <= 1) return [[0].slice(0, n)];
  const out: number[][] = [];
  const rec = (prefix: number[], rest: number[]) => {
    if (!rest.length) out.push(prefix);
    rest.forEach((x, i) => rec([...prefix, x], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  rec([], [...Array(n).keys()]);
  return out;
}

/**
 * Devuelve, para cada lugar, el índice de día asignado.
 * Pasos: zonas por k-means → cada zona a un día (probando permutaciones, penalizando cierres
 * y lugares fijados) → reequilibrio moviendo lugares de días sobrecargados a la zona vecina.
 */
export function assignPlacesToDays(places: ClusterPlace[], days: DayCapacity[]): Map<string, number> {
  const result = new Map<string, number>();
  const k = days.length;
  if (k === 0 || places.length === 0) return result;
  if (k === 1) {
    places.forEach((p) => result.set(p.id, 0));
    return result;
  }

  const clusters = kmeans(
    places.map((p) => p.coords),
    Math.min(k, places.length),
  );
  const clusterCount = Math.max(...clusters) + 1;

  // Asignación zona → día. Con viajes de hasta 7 días, 7! = 5040 permutaciones: trivial.
  const conflict = (clusterIdx: number, day: number) =>
    places.reduce((acc, p, i) => {
      if (clusters[i] !== clusterIdx) return acc;
      if (p.pinnedDay !== undefined && p.pinnedDay !== day) acc += 1000;
      if (p.closedDays?.includes(day)) acc += 10;
      return acc;
    }, 0);

  let bestPerm: number[] = [...Array(k).keys()];
  if (k <= 7) {
    let bestScore = Infinity;
    for (const perm of permutations(k)) {
      let score = 0;
      for (let c = 0; c < clusterCount; c++) score += conflict(c, perm[c]);
      if (score < bestScore) {
        bestScore = score;
        bestPerm = perm;
      }
    }
  }

  const dayOf = places.map((p, i) => p.pinnedDay ?? bestPerm[clusters[i]]);

  // Los cerrados ese día se mueven al día abierto con centro más cercano.
  const centroid = (day: number): LatLng | null => {
    const members = places.filter((_, i) => dayOf[i] === day);
    if (!members.length) return null;
    return {
      lat: members.reduce((s, p) => s + p.coords.lat, 0) / members.length,
      lng: members.reduce((s, p) => s + p.coords.lng, 0) / members.length,
    };
  };
  const nearestDay = (p: ClusterPlace, allowed: (d: number) => boolean): number | null => {
    let best: number | null = null;
    let bestDist = Infinity;
    for (let d = 0; d < k; d++) {
      if (!allowed(d)) continue;
      const c = centroid(d);
      const dist = c ? haversineMeters(p.coords, c) : 1e9;
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best;
  };

  places.forEach((p, i) => {
    if (p.pinnedDay === undefined && p.closedDays?.includes(dayOf[i])) {
      const d = nearestDay(p, (day) => !p.closedDays?.includes(day));
      if (d !== null) dayOf[i] = d;
    }
  });

  // Reequilibrio por capacidad.
  const load = (day: number) => places.reduce((s, p, i) => (dayOf[i] === day ? s + p.durationMin : s), 0);
  for (let guard = 0; guard < places.length * k; guard++) {
    const over = [...Array(k).keys()].find((d) => load(d) > days[d].minutes);
    if (over === undefined) break;
    // El lugar movible más cercano a otro día con hueco.
    let move: { i: number; to: number; dist: number } | null = null;
    places.forEach((p, i) => {
      if (dayOf[i] !== over || p.pinnedDay !== undefined) return;
      for (let d = 0; d < k; d++) {
        if (d === over || p.closedDays?.includes(d)) continue;
        if (load(d) + p.durationMin > days[d].minutes) continue;
        const c = centroid(d);
        const dist = c ? haversineMeters(p.coords, c) : 0;
        if (!move || dist < move.dist) move = { i, to: d, dist };
      }
    });
    if (!move) break;
    const m = move as { i: number; to: number };
    dayOf[m.i] = m.to;
  }

  places.forEach((p, i) => result.set(p.id, dayOf[i]));
  return result;
}
