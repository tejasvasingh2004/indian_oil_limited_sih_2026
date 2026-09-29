// Formatting for engineering units and Indian currency conventions.
export const KSC_TO_PSI = 14.2233;
export const kscToPsi = (ksc: number) => ksc * KSC_TO_PSI;
export const psiToKsc = (psi: number) => psi / KSC_TO_PSI;

const nf = (d: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

/** fixed decimals with Indian digit grouping */
export const fmt = (v: number, d = 0) => (Number.isFinite(v) ? nf(d).format(v) : '—');

/** "₹1.38 L" for lakhs, "₹2,900" below one lakh; signed variant for deltas */
export function inr(v: number, opts: { signed?: boolean; lakhDigits?: number } = {}) {
  if (!Number.isFinite(v)) return '—';
  const sign = v < 0 ? '−' : opts.signed ? '+' : '';
  const a = Math.abs(v);
  const body = a >= 1e5 ? `${nf(opts.lakhDigits ?? 2).format(a / 1e5)} L` : nf(0).format(a);
  return `${sign}₹${body}`;
}

export const pct = (v: number, d = 0) => `${fmt(v * 100, d)}%`;

/** signed percent change from a → b, with direction arrow */
export function delta(a: number, b: number, d = 0) {
  if (!a) return { text: '—', dir: 0 as const };
  const c = ((b - a) / Math.abs(a)) * 100;
  const dir = Math.abs(c) < 0.5 ? (0 as const) : c > 0 ? (1 as const) : (-1 as const);
  return { text: `${dir > 0 ? '▲' : dir < 0 ? '▼' : ''}${fmt(Math.abs(c), d)}%`, dir };
}

export function dateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
}
export function dateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';
}

export const LIMIT_LABEL: Record<string, string> = {
  INFLOW: 'Inflow', PUMP: 'Pump', FLOAT: 'Rod float', FATIGUE: 'Fatigue', TORQUE: 'Torque',
};
export const LIMIT_VAR: Record<string, string> = {
  INFLOW: 'var(--limit-inflow)', PUMP: 'var(--limit-pump)', FLOAT: 'var(--limit-float)', FATIGUE: 'var(--limit-fatigue)', TORQUE: 'var(--limit-torque)',
};
export const MODE_LABEL: Record<string, string> = {
  ROD_FAILURE: 'Rod failure', PUMP_UNSETTING: 'Pump unsetting', PUMP_FAILURE: 'Pump failure',
};
