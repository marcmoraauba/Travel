import { DAY_MINUTES, Minutes, parseHHMM, weekdayIndex } from './time';

/**
 * Parser del subconjunto habitual del formato `opening_hours` de OpenStreetMap:
 *
 *   "24/7"
 *   "Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off"
 *   "Tu-Su 09:30-13:30,16:00-19:00"
 *   "09:00-20:00"                         (todos los días)
 *
 * Semántica OSM: las reglas posteriores sustituyen a las anteriores para los días que nombran.
 * Lo que no se entiende (festivos "PH", meses, semanas…) hace que el resultado sea `null`:
 * mejor "desconocido" que un horario inventado.
 */

export type TimeWindow = [Minutes, Minutes];

/** Horario semanal: índice 0 = lunes. Array vacío = cerrado ese día. */
export type WeeklyHours = TimeWindow[][];

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function parseDays(selector: string): number[] | null {
  const days = new Set<number>();
  for (const part of selector.split(',')) {
    const range = part.split('-');
    if (range.length === 1) {
      const i = DAYS.indexOf(range[0]);
      if (i < 0) return null;
      days.add(i);
    } else if (range.length === 2) {
      const a = DAYS.indexOf(range[0]);
      const b = DAYS.indexOf(range[1]);
      if (a < 0 || b < 0) return null;
      // Los rangos pueden dar la vuelta: "Fr-Mo".
      for (let i = a; ; i = (i + 1) % 7) {
        days.add(i);
        if (i === b) break;
      }
    } else {
      return null;
    }
  }
  return [...days];
}

function parseTimes(selector: string): TimeWindow[] | null {
  const windows: TimeWindow[] = [];
  for (const part of selector.split(',')) {
    const [a, b] = part.split('-');
    if (!a || !b) return null;
    const start = parseHHMM(a);
    let end = parseHHMM(b);
    if (start === null || end === null) return null;
    // "20:00-02:00": cierra pasada la medianoche; para planificar un día basta con hasta las 24:00.
    if (end <= start) end = DAY_MINUTES;
    windows.push([start, end]);
  }
  return windows.sort((x, y) => x[0] - y[0]);
}

export function parseOpeningHours(raw: string | null | undefined): WeeklyHours | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  if (text === '24/7') return Array.from({ length: 7 }, () => [[0, DAY_MINUTES]]);

  const week: WeeklyHours = Array.from({ length: 7 }, () => []);
  let touched = false;

  for (const ruleRaw of text.split(';')) {
    const rule = ruleRaw.trim();
    if (!rule) continue;
    const tokens = rule.split(/\s+/);
    let days: number[] = [0, 1, 2, 3, 4, 5, 6];
    let rest = tokens;
    if (/^[A-Z][a-z]/.test(tokens[0])) {
      const parsed = parseDays(tokens[0]);
      if (!parsed) return null;
      days = parsed;
      rest = tokens.slice(1);
    }
    if (rest.length !== 1) return null;
    const spec = rest[0];
    if (spec === 'off' || spec === 'closed') {
      for (const d of days) week[d] = [];
    } else {
      const windows = parseTimes(spec);
      if (!windows) return null;
      for (const d of days) week[d] = windows;
    }
    touched = true;
  }
  return touched ? week : null;
}

/**
 * Ventanas de apertura para una fecha concreta.
 * `null` = horario desconocido (el optimizador lo trata como abierto todo el día).
 * `[]`   = cerrado ese día.
 */
export function windowsForDate(raw: string | null | undefined, isoDate: string): TimeWindow[] | null {
  const week = parseOpeningHours(raw);
  if (!week) return null;
  return week[weekdayIndex(isoDate)];
}
