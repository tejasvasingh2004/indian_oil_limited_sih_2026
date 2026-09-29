// Mutable mock-server state: the simulated clock (per-well day offsets), the
// prediction ledger and recommendations/decisions. Lives in memory only.
import type { LedgerEntry, Recommendation } from '@/api/types';
import { WellParams, noise, produced } from './model';
import { WELLS } from './wells';

/** The reference snapshot date (system-design §2.3: BG-023 at production day 45). */
export const BASE_DATE = new Date('2026-09-30T06:00:00Z');

let offsetDays = 0;
export const clockOffset = () => offsetDays;

/** well params at the current simulated time */
export function current(id: string): WellParams | undefined {
  const w = WELLS.find((x) => x.id === id);
  if (!w) return undefined;
  if (w.phase !== 'PRODUCTION') return w;
  return { ...w, day: w.day + offsetDays };
}
export const allCurrent = () => WELLS.map((w) => current(w.id)!);

export const dateAt = (offset: number) => new Date(BASE_DATE.getTime() + offset * 86400000);
export const asOf = () => dateAt(offsetDays).toISOString();

// ---- measurements (model + seeded noise; the reference snapshot is noise-free) --------
export const MEAS_SIGMA = 0.025;
export function measuredOil(p: WellParams, t: number) {
  const m = produced(p, t).oil;
  const isReference = t === WELLS.find((w) => w.id === p.id)!.day;
  return isReference ? m : m * (1 + MEAS_SIGMA * noise(`${p.id}:${t}`));
}
/** 1-day-ahead forecast band used by the ledger: ±(3 % + model bias noise) */
export function forecastFor(p: WellParams, t: number) {
  const m = produced(p, t).oil * (1 + 0.012 * noise(`${p.id}:bias:${t}`));
  const half = m * 0.045;
  return { value: m, lo: m - half, hi: m + half };
}

// ---- ledger ---------------------------------------------------------------------------
function ledgerFor(id: string): LedgerEntry[] {
  const p = current(id)!;
  if (p.phase !== 'PRODUCTION') return [];
  const out: LedgerEntry[] = [];
  for (let t = Math.max(1, p.day - 20); t <= p.day; t++) {
    const f = forecastFor(p, t);
    const actual = measuredOil(p, t);
    out.push({ day: t, predicted: f.value, lo: f.lo, hi: f.hi, actual, in_interval: actual >= f.lo && actual <= f.hi });
  }
  return out;
}
export const getLedger = ledgerFor;

export function advance(days: number) {
  offsetDays = Math.max(0, Math.min(90, offsetDays + days));
}

// ---- recommendations ---------------------------------------------------------------------
export const recommendations: Recommendation[] = [];
