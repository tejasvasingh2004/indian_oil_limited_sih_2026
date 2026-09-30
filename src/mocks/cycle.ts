// Next-cycle evaluation for the Scenario Lab and the optimizer mock.
// Same physics as model.ts, restructured for speed: per design the viscosity,
// deliverability and torque arrays are computed once, then SRP plans and
// cut-offs are searched over them (system-design §11.5, simplified).
import type { SrpBlock } from '@/api/types';
import { reg, BBL_PER_T_CWE } from './registry';
import {
  WellParams, Prices, PRICES, T_RES, MAX_DAY, HZ_MIN, HZ_MAX, FMI_LIMIT, SR_LIMIT, FILLAGE_MIN, FMI_P90_GAP,
  WINDOW_SAMPLES, rVisc, fluidIn, injDays, cycleCost, spmOf, bottleneck,
} from './model';

export interface Design { steamT: number; injKsc: number; soakD: number; stroke: number }
export type Preset = 'balanced' | 'production' | 'energy' | 'reliability';

/** Objective presets reprice the same physics (used in both loops). */
export const PRESET_PRICES: Record<Preset, Prices> = {
  balanced: PRICES,
  production: { ...PRICES, oil: PRICES.oil * 1.35 },
  energy: { ...PRICES, power: PRICES.power * 3 },
  reliability: { ...PRICES, failure: PRICES.failure * 3 },
};

// ---- steam design → next-cycle thermal start ------------------------------------
const QUALITY = reg('steam.quality');
/** saturation temperature, rough fit to steam tables for 1–110 ksc */
const satTempC = (ksc: number) => 100 + 45.5 * Math.log(ksc);
const latent = (tC: number) => (2257 * Math.pow(Math.max(0, 1 - tC / 374), 0.38)) / Math.pow(1 - 100 / 374, 0.38);
/** heat carried per kg of steam above reservoir temperature (kJ/kg) */
export const heatPerKg = (ksc: number) => 4.18 * (satTempC(ksc) - T_RES) + QUALITY * latent(satTempC(ksc));
/** soak efficiency: best near 0.55 × injection time (OIL practice 0.5–0.6) */
export function soakEff(soakD: number, injD: number) {
  const opt = 0.55 * injD;
  const x = (soakD - opt) / opt;
  return 1 - 0.25 * x * x;
}

export function nextCycleParams(p: WellParams, d: Design): WellParams {
  const qRef = p.steamT * heatPerKg(p.injKsc) * soakEff(p.soakD, injDays(p.steamT));
  const q = d.steamT * heatPerKg(d.injKsc) * soakEff(d.soakD, injDays(d.steamT));
  const ratio = q / qRef;
  const s = d.stroke / p.stroke;
  return {
    ...p,
    cycleNo: p.cycleNo + 1, phase: 'PRODUCTION', day: 0,
    T0: T_RES + (p.T0 - T_RES) * Math.pow(ratio, 0.5),
    qi: p.qi * (1 + 0.6 * (Math.pow(ratio, 0.6) - 1)),
    flushAmp: p.flushAmp * Math.pow(ratio, 0.8),
    D: p.D * 1.05, // cycle-to-cycle decline
    steamT: d.steamT, injKsc: d.injKsc, soakD: d.soakD,
    // re-reference stroke-dependent quantities so model.ts functions stay valid at the new stroke
    stroke: d.stroke, pumpCap45: p.pumpCap45 * s, kFmi: p.kFmi * s, sr0: p.sr0 * s,
    kwhPerDay45: p.kwhPerDay45 * Math.pow(s, 0.9),
    hz: p.hzNominal ?? p.hz, hzNominal: undefined,
  };
}

// ---- fast evaluator -------------------------------------------------------------------
interface Physics { r: Float64Array; fin: Float64Array; torque: Float64Array }
function physics(pc: WellParams): Physics {
  const n = MAX_DAY + 1;
  const r = new Float64Array(n), fin = new Float64Array(n), torque = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    r[t] = rVisc(pc, t);
    fin[t] = fluidIn(pc, t);
    torque[t] = pc.torqueBase / Math.pow(r[t], 0.4);
  }
  return { r, fin, torque };
}

function day(pc: WellParams, ph: Physics, t: number, hz: number, prices: Prices, level = 1) {
  const cap = (pc.pumpCap45 * hz) / 45;
  const fluid = Math.min(ph.fin[t], cap, ph.torque[t]);
  const oil = fluid * pc.oilFrac * level;
  const fmi = 1 - pc.kFmi * ph.r[t] * (hz / 45);
  const sr = pc.sr0 * Math.pow(hz / 45, 0.8) * Math.sqrt(ph.r[t]);
  const risk = Math.min(0.35, Math.max(0.02, pc.risk0 * Math.exp(-5 * (fmi - 0.22)) * Math.exp(3 * (sr - pc.sr0))));
  const kwh = pc.kwhPerDay45 * Math.pow(hz / 45, 1.2);
  const fillage = Math.min(1, ph.fin[t] / cap);
  return { pi: oil * prices.oil - kwh * prices.power - (risk * prices.failure) / 30, oil, kwh, risk, fmi, sr, fillage };
}

/** Speeds above the models' training range are not planned (idea.md §11: stay inside the validated range). */
const HZ_TRAINED = reg('ml.trained_vfd_hz_max');

/** Highest speed inside the envelope at day t (P50 float margin, Goodman, fillage, trained range). */
function hzMax(pc: WellParams, ph: Physics, t: number) {
  const hzF = (45 * (1 - FMI_LIMIT)) / (pc.kFmi * ph.r[t]);
  const hzSr = 45 * Math.pow(SR_LIMIT / (pc.sr0 * Math.sqrt(ph.r[t])), 1 / 0.8);
  const hzFill = (45 * ph.fin[t]) / (FILLAGE_MIN * pc.pumpCap45);
  return Math.min(HZ_MAX, HZ_TRAINED, hzF, hzSr, hzFill);
}

export const BLOCK_DAYS = 7;

/** Inner loop: best VFD setting per 7-day block inside the envelope (§11.5). */
function planFast(pc: WellParams, ph: Physics, prices: Prices): SrpBlock[] {
  const raw: SrpBlock[] = [];
  for (let b = 0; b <= MAX_DAY; b += BLOCK_DAYS) {
    const end = Math.min(MAX_DAY, b + BLOCK_DAYS - 1);
    const top = Math.max(HZ_MIN, Math.floor(hzMax(pc, ph, end))); // coldest day of the block
    let best = { hz: HZ_MIN, v: -Infinity };
    for (let hz = HZ_MIN; hz <= top; hz++) {
      const v = day(pc, ph, b, hz, prices).pi + day(pc, ph, end, hz, prices).pi;
      if (v > best.v) best = { hz, v };
    }
    raw.push({ from_day: b, to_day: end, vfd_hz: best.hz, spm: +spmOf(best.hz).toFixed(2) });
  }
  const merged: SrpBlock[] = [];
  for (const blk of raw) {
    const last = merged[merged.length - 1];
    if (last && last.vfd_hz === blk.vfd_hz) last.to_day = blk.to_day;
    else merged.push({ ...blk });
  }
  return merged;
}

export const fixedPlan = (hz: number): SrpBlock[] => [{ from_day: 0, to_day: MAX_DAY, vfd_hz: hz, spm: +spmOf(hz).toFixed(2) }];
export const hzAt = (plan: SrpBlock[], t: number) => (plan.find((b) => t >= b.from_day && t <= b.to_day) ?? plan[plan.length - 1]).vfd_hz;

export interface CycleEval {
  design: Design;
  plan: SrpBlock[];
  injD: number; cutoffDay: number; cycleDays: number;
  cycleOil: number; oilPerCycleDay: number; sor: number; kwhPerBbl: number;
  /** mean 30-day failure risk over the production days */
  risk: number;
  fmiMinP50: number; fmiMinP90: number; fmiMinDay: number; floatFromDay: number | null;
  srMax: number; fillageMin: number; hzMaxUsed: number;
  net: number;
  /** share of production days per active limit */
  limitShare: Record<string, number>;
  /** every 2nd day up to the cut-off */
  trajectory: { day: number[]; oil: number[]; fmi: number[]; hz: number[] };
}

function aggregate(pc: WellParams, ph: Physics, design: Design, plan: SrpBlock[], cutoff: number | 'optimal', prices = PRICES, level = 1): CycleEval {
  const injD = injDays(design.steamT);
  const off = injD + design.soakD;
  const C = cycleCost(design.steamT);
  const days = [];
  let cum = 0, bestT = 60, bestAvg = -Infinity;
  for (let t = 0; t <= MAX_DAY; t++) {
    const d = day(pc, ph, t, hzAt(plan, t), prices, level);
    days.push(d);
    cum += d.pi;
    if (t >= 60 && (cutoff === 'optimal' ? true : t === cutoff)) {
      const avg = (cum - C) / (off + t);
      if (cutoff !== 'optimal' || avg > bestAvg) { bestAvg = avg; bestT = t; }
    }
  }
  const T = bestT;
  let oil = 0, kwh = 0, risk = 0, fmiMin = Infinity, fmiMinDay = 0, srMax = 0, fillMin = 1, hzUsed = 0;
  let floatFrom: number | null = null;
  for (let t = 0; t <= T; t++) {
    const d = days[t];
    oil += d.oil; kwh += d.kwh; risk += d.risk;
    if (d.fmi < fmiMin) { fmiMin = d.fmi; fmiMinDay = t; }
    if (floatFrom === null && d.fmi < FMI_LIMIT) floatFrom = t;
    srMax = Math.max(srMax, d.sr); fillMin = Math.min(fillMin, d.fillage);
    hzUsed = Math.max(hzUsed, hzAt(plan, t));
  }
  const trajectory = { day: [] as number[], oil: [] as number[], fmi: [] as number[], hz: [] as number[] };
  for (let t = 0; t <= T; t += 2) {
    trajectory.day.push(t); trajectory.oil.push(days[t].oil); trajectory.fmi.push(days[t].fmi); trajectory.hz.push(hzAt(plan, t));
  }
  const limitShare: Record<string, number> = {};
  for (let t = 0; t <= T; t += 5) {
    const a = bottleneck(pc, t).active;
    limitShare[a] = (limitShare[a] ?? 0) + 1;
  }
  const n = Object.values(limitShare).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(limitShare)) limitShare[k] /= n;
  return {
    design, plan: plan.filter((b) => b.from_day <= T).map((b) => ({ ...b, to_day: Math.min(b.to_day, T) })),
    injD, cutoffDay: T, cycleDays: off + T,
    cycleOil: oil, oilPerCycleDay: oil / (off + T), sor: (design.steamT * BBL_PER_T_CWE) / oil,
    kwhPerBbl: kwh / oil, risk: risk / (T + 1),
    fmiMinP50: fmiMin, fmiMinP90: fmiMin - FMI_P90_GAP, fmiMinDay, floatFromDay: floatFrom,
    srMax, fillageMin: fillMin, hzMaxUsed: hzUsed,
    net: bestAvg, limitShare, trajectory,
  };
}

export type PlanSpec = { kind: 'optimal'; preset: Preset } | { kind: 'fixed'; hz: number };

export function evaluateCycle(p: WellParams, design: Design, planSpec: PlanSpec, cutoff: number | 'optimal' = 'optimal'): CycleEval {
  return evaluateCycleParams(nextCycleParams(p, design), design, planSpec, cutoff);
}

/** Evaluate a cycle whose parameters are already set (used for past cycles in backtests). */
export function evaluateCycleParams(pc: WellParams, design: Design, planSpec: PlanSpec, cutoff: number | 'optimal' = 'optimal', level = 1): CycleEval {
  const ph = physics(pc);
  const plan = planSpec.kind === 'fixed' ? fixedPlan(planSpec.hz) : planFast(pc, ph, PRESET_PRICES[planSpec.preset]);
  return aggregate(pc, ph, design, plan, cutoff, PRICES, level);
}

/** P10/P50/P90 re-steam window and net ₹/day interval for a chosen design + plan. */
export function cycleUncertainty(p: WellParams, e: CycleEval) {
  const res = WINDOW_SAMPLES.map((s) => {
    const pc = nextCycleParams({ ...p, D: p.D * s.dScale }, e.design);
    return aggregate(pc, physics(pc), e.design, e.plan.length ? extendPlan(e.plan) : e.plan, 'optimal', PRICES, s.level);
  });
  const days = res.map((r) => r.cutoffDay).sort((a, b) => a - b);
  const nets = res.map((r) => r.net).sort((a, b) => a - b);
  const oils = res.map((r) => r.cycleOil).sort((a, b) => a - b);
  return { p10: days[0], p50: e.cutoffDay, p90: days[2], netLo: nets[0], netHi: nets[2], oilLo: oils[0], oilHi: oils[2] };
}
/** keep the last block running past the cut-off so alternative cut-offs can be evaluated */
const extendPlan = (plan: SrpBlock[]) => plan.map((b, i) => (i === plan.length - 1 ? { ...b, to_day: MAX_DAY } : b));

/** Grid of steam designs searched by the optimizer mock. */
export function designGrid(steamAvailable: number, strokes: number[]): Design[] {
  const out: Design[] = [];
  const steamMin = reg('limits.steam_t_min');
  for (let steamT = steamMin; steamT <= steamAvailable; steamT += 50)
    for (let soakD = reg('limits.soak_d_min'); soakD <= reg('limits.soak_d_max'); soakD++)
      for (const injKsc of [86, 91, 96])
        for (const stroke of strokes) out.push({ steamT, injKsc, soakD, stroke });
  return out;
}

/** Stateful evaluator for the optimizer: one physics pass per design, four plans. */
export function evaluateDesignAllPresets(p: WellParams, design: Design) {
  const pc = nextCycleParams(p, design);
  const ph = physics(pc);
  const presets: Preset[] = ['balanced', 'production', 'energy', 'reliability'];
  return Object.fromEntries(presets.map((k) => [k, aggregate(pc, ph, design, planFast(pc, ph, PRESET_PRICES[k]), 'optimal')])) as Record<Preset, CycleEval>;
}
