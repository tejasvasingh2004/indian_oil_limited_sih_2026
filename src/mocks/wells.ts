// 33 synthetic wells (the operating count). Each well is sampled from a class
// template and kept only if the model *computes* the intended bottleneck, so
// the field board's counts come from physics rather than labels.
import type { LimitName, FailureMode } from '@/api/types';
import { BG023, WellParams, bottleneck, fmiAt, goodmanSr, hzFloat, mulberry32, resteamWindow } from './model';

type Cls = LimitName | 'INJECTION' | 'SOAK';

const PLAN: Record<string, Cls> = {
  'BG-023': 'INFLOW', 'BG-017': 'INFLOW', 'BG-011': 'FLOAT', 'BG-008': 'FLOAT',
  'BG-030': 'INJECTION', 'BG-014': 'SOAK',
};
const COUNTS: Record<LimitName, number> = { INFLOW: 18, FLOAT: 7, PUMP: 4, FATIGUE: 0, TORQUE: 2 };

const rng = mulberry32(2026);
const U = (a: number, b: number) => a + (b - a) * rng();
const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
const round = (x: number, step: number) => Math.round(x / step) * step;

function modeSplit(top?: FailureMode): Record<FailureMode, number> {
  const w = { ROD_FAILURE: U(0.3, 0.5), PUMP_UNSETTING: U(0.2, 0.4), PUMP_FAILURE: U(0.1, 0.25) };
  if (top) w[top] += 0.35;
  const s = w.ROD_FAILURE + w.PUMP_UNSETTING + w.PUMP_FAILURE;
  return { ROD_FAILURE: w.ROD_FAILURE / s, PUMP_UNSETTING: w.PUMP_UNSETTING / s, PUMP_FAILURE: w.PUMP_FAILURE / s };
}

function base(id: string): WellParams {
  const steamT = round(U(1050, 1550), 50);
  return {
    id, cycleNo: Math.floor(U(3, 10)), phase: 'PRODUCTION', day: 45,
    qi: U(32, 46), D: U(0.003, 0.0048), flushAmp: U(30, 55), flushTau: U(8, 12),
    T0: U(76, 92), tau: U(42, 58), oilFrac: U(0.45, 0.65),
    pumpCap45: U(90, 115), hz: round(U(40, 46), 1), stroke: pick([86, 100, 120]),
    kFmi: U(0.55, 0.75), sr0: U(0.55, 0.74), fatigueBase: U(118, 140), torqueBase: U(130, 152),
    risk0: U(0.05, 0.12), modeSplit: modeSplit(),
    kwhPerDay45: U(400, 560), steamT, injKsc: round(U(86, 96), 1), soakD: round(steamT / 3.1 / 24 * U(0.5, 0.6), 1),
    fmiMinDepthM: round(U(480, 700), 10),
  };
}

function sample(id: string, cls: LimitName): WellParams {
  for (let i = 0; i < 400; i++) {
    const p = base(id);
    if (cls === 'INFLOW') p.day = Math.floor(U(20, 125));
    if (cls === 'FLOAT') {
      Object.assign(p, { day: Math.floor(U(60, 140)), pumpCap45: U(58, 74), qi: U(42, 56), kFmi: U(0.85, 1.0) });
      p.hzNominal = 45;
      p.hz = Math.floor(hzFloat(p, p.day)); // engineers already run at the float-safe speed
    }
    if (cls === 'PUMP') Object.assign(p, { day: Math.floor(U(3, 15)), pumpCap45: U(52, 68), flushAmp: U(50, 70), kFmi: U(0.5, 0.6), hz: round(U(44, 48), 1) });
    if (cls === 'TORQUE') Object.assign(p, { day: Math.floor(U(20, 80)), torqueBase: U(44, 56), kFmi: U(0.5, 0.6) });
    const ok = bottleneck(p, p.day).active === cls && (cls === 'FLOAT' || fmiAt(p, p.day, p.hz) >= 0.17);
    if (ok) return p;
  }
  throw new Error(`could not sample ${id} as ${cls}`);
}

/** set risk0 so the computed 30-day risk equals a target (used for named demo wells) */
function withRisk(p: WellParams, target: number, top: FailureMode): WellParams {
  const factor = Math.exp(-5 * (fmiAt(p, p.day, p.hz) - 0.22)) * Math.exp(3 * (goodmanSr(p, p.day, p.hz) - p.sr0)); // same form as risk30()
  return { ...p, risk0: target / factor, modeSplit: modeSplit(top) };
}

function build(): WellParams[] {
  const ids = Array.from({ length: 33 }, (_, i) => `BG-${String(i + 1).padStart(3, '0')}`);
  const remaining = { ...COUNTS };
  for (const c of Object.values(PLAN)) if (c in remaining) remaining[c as LimitName]--;
  const pool: LimitName[] = (Object.keys(remaining) as LimitName[]).flatMap((k) => Array(remaining[k]).fill(k));
  // deterministic shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const wells = ids.map((id): WellParams => {
    if (id === 'BG-023') return BG023;
    const cls = PLAN[id] ?? pool.pop()!;
    if (cls === 'INJECTION') return { ...base(id), phase: 'INJECTION', day: 0, phaseDay: 6 };
    if (cls === 'SOAK') return { ...base(id), phase: 'SOAK', day: 0, phaseDay: 4 };
    return sample(id, cls);
  });

  // named demo wells (frontend.md §5.1 "Needs attention")
  const byId = (id: string) => wells.findIndex((w) => w.id === id);
  wells[byId('BG-011')] = withRisk(wells[byId('BG-011')], 0.21, 'PUMP_UNSETTING');
  wells[byId('BG-017')] = withRisk(wells[byId('BG-017')], 0.18, 'ROD_FAILURE');
  wells[byId('BG-008')] = { ...wells[byId('BG-008')], fmiMinDepthM: 520 };
  // one well outside the training range (water cut 70% vs 35–65%) to demonstrate the OOD block
  wells[byId('BG-009')] = { ...wells[byId('BG-009')], oilFrac: 0.3 };

  // three wells close to their re-steam window
  let due = 0;
  for (const w of wells) {
    if (due >= 3 || w.phase !== 'PRODUCTION' || PLAN[w.id]) continue;
    if (bottleneck(w, w.day).active !== 'INFLOW') continue;
    const p50 = resteamWindow(w).p50;
    const day = p50 - [9, 18, 26][due];
    const moved = { ...w, day };
    if (bottleneck(moved, day).active === 'INFLOW' && fmiAt(moved, day, moved.hz) >= 0.15) {
      wells[wells.indexOf(w)] = moved;
      due++;
    }
  }
  return wells;
}

export const WELLS: WellParams[] = build();
export const wellById = (id: string) => WELLS.find((w) => w.id === id);
