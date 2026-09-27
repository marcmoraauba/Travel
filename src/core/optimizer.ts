import type { TimeWindow } from './openingHours';
import type { Minutes } from './time';

/**
 * Optimizador de un día: TSP con ventanas temporales (§5 del plan).
 *
 * 1. Construcción por inserción voraz: reservas → imprescindibles → opcionales.
 * 2. Mejora con búsqueda local (2-opt, or-opt, reinserción e intercambio de descartados).
 * 3. Coste = desplazamiento + esperas + penalizaciones.
 *
 * Módulo puro: sin red, sin UI, sin fechas del sistema. Todo lo que necesita entra por parámetro.
 */

export type Priority = 'must' | 'optional';

export interface OptStop {
  id: string;
  durationMin: number;
  priority: Priority;
  /** Ventanas de apertura del día. `null` = desconocido (se asume abierto). `[]` = cerrado. */
  windows: TimeWindow[] | null;
  /** Hora de inicio fija (reserva). Llegar tarde la hace inviable. */
  fixedStart?: Minutes;
  category?: string;
}

export interface LunchPreference {
  earliest: Minutes;
  latest: Minutes;
  durationMin: number;
}

export interface Weights {
  /** Coste por minuto de espera frente a un sitio cerrado (los minutos de viaje valen 1). */
  wait: number;
  /** Coste de descartar un opcional, en "minutos equivalentes". */
  dropOptional: number;
  /** Coste de descartar un imprescindible: tan alto que solo ocurre si no cabe de ninguna forma. */
  dropMust: number;
  /** Por cada par de visitas consecutivas de una categoría "pesada". */
  consecutiveHeavy: number;
  /** Por cada minuto que la comida empieza más tarde de lo preferido. */
  lunchLatePerMin: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  wait: 0.5,
  dropOptional: 90,
  dropMust: 100_000,
  consecutiveHeavy: 30,
  lunchLatePerMin: 2,
};

export interface DayInput {
  stops: OptStop[];
  /**
   * Minutos de desplazamiento, tamaño (n+2)×(n+2):
   * índice 0 = punto de partida, 1..n = `stops` en su orden, n+1 = punto final.
   */
  matrix: number[][];
  dayStart: Minutes;
  dayEnd: Minutes;
  /** Colchón añadido a cada desplazamiento hacia una visita (ritmo del viaje). */
  slackMin?: number;
  lunch?: LunchPreference;
  /** Categorías que no conviene encadenar (p. ej. museos). */
  heavyCategories?: string[];
  weights?: Partial<Weights>;
}

export interface ScheduledVisit {
  id: string;
  arrival: Minutes;
  start: Minutes;
  end: Minutes;
  travelMin: number;
  waitMin: number;
}

export type DropReason = 'closed' | 'booking_conflict' | 'no_time';

export interface DayPlan {
  visits: ScheduledVisit[];
  dropped: { id: string; reason: DropReason }[];
  lunch: { start: Minutes; end: Minutes } | null;
  /** Minutos del último desplazamiento hasta el punto final. */
  returnTravelMin: number;
  finishAt: Minutes;
  totalTravelMin: number;
  totalWaitMin: number;
  cost: number;
}

interface Simulation {
  visits: ScheduledVisit[];
  lunch: { start: Minutes; end: Minutes } | null;
  returnTravelMin: number;
  finishAt: Minutes;
  travel: number;
  wait: number;
  penalty: number;
}

const EPS = 1e-6;

export function earliestStart(windows: TimeWindow[] | null, arrive: Minutes, duration: number): Minutes | null {
  if (windows === null) return arrive;
  for (const [open, close] of windows) {
    const s = Math.max(arrive, open);
    if (s + duration <= close) return s;
  }
  return null;
}

export class DayOptimizer {
  private readonly w: Weights;
  private readonly n: number;
  private readonly heavy: Set<string>;

  constructor(private readonly input: DayInput) {
    this.w = { ...DEFAULT_WEIGHTS, ...input.weights };
    this.n = input.stops.length;
    this.heavy = new Set(input.heavyCategories ?? ['museum']);
    const size = this.n + 2;
    if (input.matrix.length !== size || input.matrix.some((row) => row.length !== size)) {
      throw new Error(`La matriz debe ser ${size}×${size} (origen + ${this.n} paradas + destino)`);
    }
  }

  /** Simula un orden concreto (índices de `stops`). `null` si incumple alguna restricción dura. */
  simulate(order: number[]): Simulation | null {
    const { stops, matrix, dayStart, dayEnd, lunch: lunchPref } = this.input;
    const slack = this.input.slackMin ?? 0;
    let t = dayStart;
    let prev = 0;
    let travel = 0;
    let wait = 0;
    let penalty = 0;
    let lunch: Simulation['lunch'] = null;
    const visits: ScheduledVisit[] = [];

    const takeLunchNow = () => {
      if (lunchPref && !lunch && t >= lunchPref.earliest) {
        lunch = { start: t, end: t + lunchPref.durationMin };
        penalty += Math.max(0, t - lunchPref.latest) * this.w.lunchLatePerMin;
        t = lunch.end;
      }
    };

    for (let k = 0; k < order.length; k++) {
      const i = order[k];
      const stop = stops[i];
      takeLunchNow();
      const leg = matrix[prev][i + 1] + slack;
      const arrive = t + leg;
      let start: Minutes | null;
      if (stop.fixedStart !== undefined) {
        start = arrive <= stop.fixedStart ? stop.fixedStart : null;
      } else {
        start = earliestStart(stop.windows, arrive, stop.durationMin);
      }
      if (start === null) return null;

      // Si toca esperar a que abra y la espera cubre la comida, se come mientras tanto.
      if (lunchPref && !lunch) {
        const ls = Math.max(arrive, lunchPref.earliest);
        if (ls + lunchPref.durationMin <= start && ls <= lunchPref.latest) {
          lunch = { start: ls, end: ls + lunchPref.durationMin };
        }
      }

      if (k > 0 && stop.category && this.heavy.has(stop.category) && stops[order[k - 1]].category === stop.category) {
        penalty += this.w.consecutiveHeavy;
      }

      const waitMin = start - arrive;
      visits.push({ id: stop.id, arrival: arrive, start, end: start + stop.durationMin, travelMin: leg, waitMin });
      travel += leg;
      wait += waitMin;
      t = start + stop.durationMin;
      prev = i + 1;
    }

    takeLunchNow();
    const returnTravelMin = matrix[prev][this.n + 1];
    const finishAt = t + returnTravelMin;
    if (finishAt > dayEnd + EPS) return null;
    travel += returnTravelMin;

    return { visits, lunch, returnTravelMin, finishAt, travel, wait, penalty };
  }

  private dropPenalty(dropped: number[]): number {
    let p = 0;
    for (const i of dropped) {
      p += this.input.stops[i].priority === 'must' || this.input.stops[i].fixedStart !== undefined
        ? this.w.dropMust
        : this.w.dropOptional;
    }
    return p;
  }

  private routeCost(order: number[]): number {
    const sim = this.simulate(order);
    if (!sim) return Infinity;
    return sim.travel + sim.wait * this.w.wait + sim.penalty;
  }

  cost(order: number[], dropped: number[]): number {
    return this.routeCost(order) + this.dropPenalty(dropped);
  }

  private bestInsertion(order: number[], i: number): { order: number[]; cost: number } | null {
    let best: { order: number[]; cost: number } | null = null;
    for (let pos = 0; pos <= order.length; pos++) {
      const cand = [...order.slice(0, pos), i, ...order.slice(pos)];
      const c = this.routeCost(cand);
      if (c < Infinity && (!best || c < best.cost - EPS)) best = { order: cand, cost: c };
    }
    return best;
  }

  private construct(): { order: number[]; dropped: number[] } {
    const { stops } = this.input;
    const tier = (s: OptStop) => (s.fixedStart !== undefined ? 0 : s.priority === 'must' ? 1 : 2);
    const openSpan = (s: OptStop) =>
      s.windows === null ? Infinity : s.windows.reduce((acc, [a, b]) => acc + (b - a), 0);
    const indices = stops.map((_, i) => i);
    indices.sort((a, b) => {
      const sa = stops[a];
      const sb = stops[b];
      return (
        tier(sa) - tier(sb) ||
        (sa.fixedStart ?? 0) - (sb.fixedStart ?? 0) ||
        openSpan(sa) - openSpan(sb) ||
        sb.durationMin - sa.durationMin ||
        a - b
      );
    });

    let order: number[] = [];
    const dropped: number[] = [];
    for (const i of indices) {
      const ins = this.bestInsertion(order, i);
      if (ins) order = ins.order;
      else dropped.push(i);
    }
    return { order, dropped };
  }

  private improve(order: number[], dropped: number[]): { order: number[]; dropped: number[] } {
    let cur = this.cost(order, dropped);
    const accept = (o: number[], d: number[]) => {
      const c = this.cost(o, d);
      if (c < cur - EPS) {
        order = o;
        dropped = d;
        cur = c;
        return true;
      }
      return false;
    };

    for (let iter = 0; iter < 100; iter++) {
      let improved = false;

      // 2-opt: invertir un tramo.
      for (let i = 0; i < order.length - 1; i++) {
        for (let j = i + 1; j < order.length; j++) {
          const cand = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
          if (accept(cand, dropped)) improved = true;
        }
      }

      // or-opt: mover un tramo de 1 a 3 paradas a otra posición.
      for (let len = 1; len <= 3; len++) {
        for (let i = 0; i + len <= order.length; i++) {
          const seg = order.slice(i, i + len);
          const rest = [...order.slice(0, i), ...order.slice(i + len)];
          for (let pos = 0; pos <= rest.length; pos++) {
            if (pos === i) continue;
            const cand = [...rest.slice(0, pos), ...seg, ...rest.slice(pos)];
            if (accept(cand, dropped)) {
              improved = true;
              break;
            }
          }
        }
      }

      // Reinsertar descartados, o cambiarlos por una visita de menor prioridad.
      for (const d of [...dropped]) {
        const otherDropped = dropped.filter((x) => x !== d);
        const ins = this.bestInsertion(order, d);
        if (ins && accept(ins.order, otherDropped)) {
          improved = true;
          continue;
        }
        for (const k of order) {
          const without = order.filter((x) => x !== k);
          const swap = this.bestInsertion(without, d);
          if (swap && accept(swap.order, [...otherDropped, k])) {
            improved = true;
            break;
          }
        }
      }

      if (!improved) break;
    }
    return { order, dropped };
  }

  private reasonFor(i: number): DropReason {
    const s = this.input.stops[i];
    if (s.fixedStart !== undefined) return 'booking_conflict';
    if (s.windows !== null && s.windows.length === 0) return 'closed';
    return 'no_time';
  }

  run(): DayPlan {
    const built = this.construct();
    const { order, dropped } = this.improve(built.order, built.dropped);
    return this.toPlan(order, dropped);
  }

  toPlan(order: number[], dropped: number[]): DayPlan {
    const sim = this.simulate(order);
    if (!sim) throw new Error('Orden inviable');
    return {
      visits: sim.visits,
      dropped: dropped.map((i) => ({ id: this.input.stops[i].id, reason: this.reasonFor(i) })),
      lunch: sim.lunch,
      returnTravelMin: sim.returnTravelMin,
      finishAt: sim.finishAt,
      totalTravelMin: sim.travel,
      totalWaitMin: sim.wait,
      cost: this.cost(order, dropped),
    };
  }
}

export function optimizeDay(input: DayInput): DayPlan {
  return new DayOptimizer(input).run();
}

/**
 * Programa un orden fijado por el usuario (sin reordenar). Útil cuando arrastra paradas a mano:
 * se respetan sus decisiones y solo se recalculan las horas. `null` si ese orden es inviable.
 */
export function scheduleFixedOrder(input: DayInput, ids: string[]): DayPlan | null {
  const opt = new DayOptimizer(input);
  const index = new Map(input.stops.map((s, i) => [s.id, i]));
  const order = ids.map((id) => {
    const i = index.get(id);
    if (i === undefined) throw new Error(`Parada desconocida: ${id}`);
    return i;
  });
  const inOrder = new Set(order);
  const dropped = input.stops.map((_, i) => i).filter((i) => !inOrder.has(i));
  return opt.simulate(order) ? opt.toPlan(order, dropped) : null;
}
