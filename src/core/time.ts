/** Minutos desde medianoche. Toda la lógica de horarios trabaja en esta unidad. */
export type Minutes = number;

export const DAY_MINUTES = 24 * 60;

/** "09:30" → 570. Devuelve null si el formato no es HH:MM válido. */
export function parseHHMM(value: string): Minutes | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

/** 570 → "09:30". */
export function formatHHMM(minutes: Minutes): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 95 → "1 h 35 min". */
export function formatDuration(minutes: Minutes): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Fechas de calendario en formato ISO "YYYY-MM-DD", sin zona horaria. */
export function parseISODate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1) return null;
  return d;
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Todas las fechas entre inicio y fin, ambas incluidas. */
export function datesBetween(startISO: string, endISO: string): string[] {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  if (!start || !end || end < start) return [];
  const out: string[] = [];
  for (let d = start; d <= end; d = new Date(d.getTime() + 86_400_000)) {
    out.push(toISODate(d));
  }
  return out;
}

/** 0 = lunes … 6 = domingo (convención de OSM opening_hours). */
export function weekdayIndex(iso: string): number {
  const d = parseISODate(iso);
  if (!d) throw new Error(`Fecha inválida: ${iso}`);
  return (d.getUTCDay() + 6) % 7;
}
