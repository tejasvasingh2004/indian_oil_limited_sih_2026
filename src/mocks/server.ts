// Mock implementation of the API in system-design.md §5. Every response is built
// from the mock twin; nothing here is a literal KPI. Swap this module for the
// real client once the backend exists (see api/client.ts).
import type {
  Bottleneck, BottleneckSpan, Computed, Confidence, FieldKpis, LimitName, Lever, ProductionSeries, Quantity,
  ResteamWindow, RodProfile, Trust, TrustFactor, TrustStatus, WellState, WellSummary, FailureMode,
} from '@/api/types';
import { BBL_PER_T_CWE, reg } from './registry';
import {
  WellParams, bottleneck, fmiAt, goodmanSr, hzPolicy, kwhPerDay, limits, piDaily, produced, resteamWindow, risk30,
  spmOf, tNwb, tPump, unit, viscosityCp, FMI_LIMIT, FMI_P90_GAP, SR_LIMIT, FILLAGE_MIN, HZ_MAX, HZ_MIN, PRICES,
  injDays, cycleCost, MAX_DAY, WINDOW_SAMPLES, hzFloat,
} from './model';
import { evidence } from './evidence';
import { allCurrent, asOf, clockOffset, current, dateAt, getLedger, measuredOil } from './state';

// ---- helpers -------------------------------------------------------------------------------
const sim = (value: number, unitStr?: string): Quantity => ({ value, unit: unitStr, provenance: 'SIMULATED' });
const calc = (value: number, evidence_id: string, extra: Partial<Omit<Quantity, 'provenance'>> & { provenance?: Computed } = {}): Quantity =>
  ({ value, provenance: extra.provenance ?? 'DERIVED', evidence_id, ...extra }) as Quantity;

const TRAINED_WATER_CUT: [number, number] = [0.35, 0.65];
const TRAINED_HZ_MAX = reg('ml.trained_vfd_hz_max');
const PRACTICE_CUTOFF_DAY = 150;
const snap = (p: WellParams) => `well_state:${p.id}@cycle${p.cycleNo}d${p.day}`;

/** Ramey-style tubing temperature (system-design §7.4), simplified */
function tubingTemp(p: WellParams, t: number, z: number) {
  const pumpDepth = reg('srp.pump_depth_m');
  const g = 0.017;
  const tGeo = (d: number) => 28 + g * d;
  const A = 800 * (produced(p, t).fluid / 62);
  return tGeo(z) + g * A + (tPump(p, t) - tGeo(pumpDepth) - g * A) * Math.exp(-(pumpDepth - z) / A);
}

function impactIndex(p: WellParams, t: number, hz = p.hz) {
  const fmi = fmiAt(p, t, hz);
  const { fillage } = produced(p, t, hz);
  return Math.max(0, (FMI_LIMIT - fmi) / FMI_LIMIT) + 0.9 * Math.max(0, 1 - fillage / 0.8) * (hz / 45) ** 2;
}

function cumOilTo(p: WellParams, T: number) {
  let s = 0;
  for (let t = 0; t <= T; t++) s += produced(p, t, hzPolicy(p, t)).oil;
  return s;
}

function dqOf(p: WellParams) {
  const score = p.id === 'BG-023' ? 0.92 : 0.84 + 0.14 * unit(p.id + ':dq');
  const flags = score < 0.9 ? ['IMPUTED_2H_GAP', 'SPIKE_REMOVED'] : ['IMPUTED_2H_GAP'];
  return { score, flags };
}

function oodOf(p: WellParams) {
  const wc = 1 - p.oilFrac;
  const outside = wc < TRAINED_WATER_CUT[0] || wc > TRAINED_WATER_CUT[1];
  const score = outside ? 0.86 : 0.2 + 0.3 * unit(p.id + ':ood');
  return {
    flag: outside, score, threshold: 0.8,
    detail: outside ? `Water cut ${(wc * 100).toFixed(0)}% is outside the model's training range (${TRAINED_WATER_CUT[0] * 100}–${TRAINED_WATER_CUT[1] * 100}%).` : undefined,
  };
}

function ledgerCoverage(id: string) {
  const l = getLedger(id);
  return l.length ? l.filter((e) => e.in_interval).length / l.length : 1;
}

export function trustLevel(factors: TrustFactor[], critical: string[]): Confidence {
  const reds = factors.filter((f) => f.status === 'RED');
  if (reds.some((f) => critical.includes(f.factor)) || reds.length >= 2) return 'LOW';
  if (factors.some((f) => f.status === 'AMBER') || reds.length === 1) return 'MEDIUM';
  return 'HIGH';
}
export const CRITICAL = ['DATA_FRESHNESS', 'OOD_DISTANCE', 'OPTIMIZER_SANITY'];

export function stateTrust(p: WellParams): Trust {
  const dq = dqOf(p);
  const ood = oodOf(p);
  // physics–ML agreement: mean |measured − physics| / physics over the last 14 days (%)
  let resSum = 0, resN = 0;
  for (let t = Math.max(0, p.day - 13); t <= p.day; t++) {
    const m = produced(p, t).oil;
    if (m > 0) { resSum += Math.abs(measuredOil(p, t) - m) / m; resN++; }
  }
  const residual = resN ? (resSum / resN) * 100 : 0;
  const cov = ledgerCoverage(p.id);
  const band = (v: number, g: (v: number) => boolean, a: (v: number) => boolean): TrustStatus => (g(v) ? 'GREEN' : a(v) ? 'AMBER' : 'RED');
  const factors: TrustFactor[] = [
    { factor: 'DATA_COMPLETENESS', status: band(dq.score, (v) => v >= 0.9, (v) => v >= 0.8), detail: `${(dq.score * 100).toFixed(0)}% of expected samples in the last 7 days` },
    { factor: 'DATA_FRESHNESS', status: 'GREEN', detail: 'last sample within 2 sampling intervals' },
    { factor: 'SENSOR_HEALTH', status: band(dq.score, (v) => v >= 0.8, (v) => v >= 0.6), detail: `DQ score ${dq.score.toFixed(2)}` },
    { factor: 'PHYSICS_ML_AGREEMENT', status: residual < 10 ? 'GREEN' : residual < 15 ? 'AMBER' : 'RED', detail: `mean residual ${residual.toFixed(1)}% of the physics value over 14 days (cap 15%)` },
    // 80 % nominal; bands widened for the small (21-point) ledger window
    { factor: 'INTERVAL_COVERAGE', status: band(cov, (v) => v >= 0.7 && v <= 0.9, (v) => v >= 0.6 /* over-coverage = band too wide: conservative, amber */), detail: `${(cov * 100).toFixed(0)}% of the last ${getLedger(p.id).length} actuals inside the 80% band` },
    { factor: 'OOD_DISTANCE', status: ood.flag ? 'RED' : ood.score >= 0.6 ? 'AMBER' : 'GREEN', detail: ood.flag ? ood.detail : `score ${ood.score.toFixed(2)} (block at ${ood.threshold})` },
  ];
  return { level: trustLevel(factors, CRITICAL), factors };
}

// ---- field -------------------------------------------------------------------------------
export function fieldKpis(): FieldKpis {
  const wells = allCurrent();
  const producing = wells.filter((w) => w.phase === 'PRODUCTION');
  const ev = evidence('field', `field@offset${clockOffset()}`);
  const by: Record<LimitName, number> = { INFLOW: 0, PUMP: 0, FLOAT: 0, FATIGUE: 0, TORQUE: 0 };
  let oil = 0, kwh = 0, sorSum = 0, highRisk = 0, due = 0;
  for (const w of producing) {
    by[bottleneck(w, w.day).active]++;
    const o = measuredOil(w, w.day);
    oil += o;
    kwh += kwhPerDay(w, w.hz);
    const win = resteamWindow(w);
    sorSum += (w.steamT * BBL_PER_T_CWE) / cumOilTo(w, win.p50);
    if (risk30(w, w.day).any >= 0.15) highRisk++;
    if (win.p50 - w.day <= 30) due++;
  }
  const injecting = wells.filter((w) => w.phase === 'INJECTION').length;
  return {
    data_mode: 'SIMULATED',
    operating_wells: sim(wells.length),
    total_oil_bopd: sim(oil, 'BOPD'),
    steam_today_t: calc(injecting * reg('steam.rate_t_per_h') * 24, ev, { unit: 't' }),
    injecting_wells: injecting,
    avg_cycle_sor: calc(sorSum / producing.length, ev, { provenance: 'PREDICTED' }),
    kwh_per_bbl: calc(kwh / oil, ev, { unit: 'kWh/bbl' }),
    high_risk_wells: highRisk,
    resteams_due_30d: due,
    by_bottleneck: by,
  };
}

export function wellSummaries(): WellSummary[] {
  return allCurrent().map((w) => {
    const producing = w.phase === 'PRODUCTION';
    const t = w.day;
    const ev = evidence('state', snap(w));
    const b = producing ? bottleneck(w, t) : null;
    const win = producing ? resteamWindow(w) : null;
    const r = producing ? risk30(w, t) : { any: 0, by_mode: { ROD_FAILURE: 0, PUMP_UNSETTING: 0, PUMP_FAILURE: 0 } };
    const top = (Object.entries(r.by_mode) as [FailureMode, number][]).sort((a, c) => c[1] - a[1])[0][0];
    const oil = producing ? measuredOil(w, t) : 0;
    const oil7 = producing && t >= 7 ? measuredOil(w, t - 7) : oil;
    return {
      well_id: w.id, cycle_no: w.cycleNo, phase: w.phase, production_day: producing ? t : w.phaseDay ?? 0,
      oil_bopd: sim(oil, 'BOPD'),
      oil_delta_7d_pct: oil7 ? ((oil - oil7) / oil7) * 100 : 0,
      active: b?.active ?? 'INFLOW', next: b?.next ?? 'INFLOW',
      fmi_min: calc(producing ? fmiAt(w, t, w.hz) : 1, ev),
      fmi_min_depth_m: w.fmiMinDepthM,
      risk_30d: calc(r.any, evidence('risk', snap(w)), { provenance: 'PREDICTED' }),
      risk_by_mode: r.by_mode,
      top_mode: top,
      goodman_sr: producing ? goodmanSr(w, t, w.hz) : 0,
      fillage: producing ? produced(w, t).fillage : 0,
      resteam_p50_day: win ? win.p50 : null,
      days_to_resteam: win ? win.p50 - t : null,
      trust: stateTrust(w).level,
      dq_score: dqOf(w).score,
      ood: oodOf(w).flag,
      pending_recs: 0,
    };
  });
}

// ---- well ---------------------------------------------------------------------------------
export function wellState(id: string): WellState {
  const p = current(id);
  if (!p) throw new Error(`unknown well ${id}`);
  const t = p.day;
  const s = snap(p);
  const evS = evidence('state', s);
  const evRod = evidence('rods', s, { hz: p.hz, stroke: p.stroke });
  const evRisk = evidence('risk', s);
  const pr = produced(p, t);
  const oil = measuredOil(p, t);
  const T = tNwb(p, t);
  const pip = 110 + 170 * pr.fillage ** 2;
  const r = risk30(p, t);
  const win = p.phase === 'PRODUCTION' ? resteamWindow(p) : null;
  const producing = p.phase === 'PRODUCTION';
  return {
    well_id: p.id,
    as_of: asOf(),
    data_mode: 'SIMULATED',
    cycle: { cycle_no: p.cycleNo, phase: p.phase, production_day: producing ? t : p.phaseDay ?? 0 },
    measured: {
      oil_rate: sim(producing ? oil : 0, 'BOPD'),
      fluid_rate: sim(producing ? oil / p.oilFrac : 0, 'BFPD'),
      vfd_hz: sim(p.hz, 'Hz'),
      spm: sim(spmOf(p.hz), 'SPM'),
      stroke_in: sim(p.stroke, 'in'),
      wellhead_temp_c: sim(tubingTemp(p, t, 0), '°C'),
      kwh_per_bbl: calc(producing ? kwhPerDay(p, p.hz) / oil : 0, evidence('energy', s), { unit: 'kWh/bbl' }),
    },
    estimated: {
      t_nwb_c: calc(T, evS, { lo: T - 3, hi: T + 3, unit: '°C', confidence: 'HIGH' }),
      viscosity_cp: calc(viscosityCp(T), evS, { lo: viscosityCp(T + 3), hi: viscosityCp(T - 3), unit: 'cP', confidence: 'MEDIUM', assumed: true }),
      pip_psi: calc(pip, evS, { lo: pip - 30, hi: pip + 30, unit: 'psi', confidence: 'MEDIUM' }),
      fillage: calc(pr.fillage, evS, { lo: Math.max(0, pr.fillage - 0.06), hi: Math.min(1, pr.fillage + 0.06), confidence: 'MEDIUM' }),
    },
    indicators: {
      fmi_min: { ...calc(fmiAt(p, t, p.hz), evRod), depth_m: p.fmiMinDepthM, limit: FMI_LIMIT },
      goodman_sr_max: { ...calc(goodmanSr(p, t, p.hz), evRod), limit: SR_LIMIT, section: 1 },
      impact_index: calc(impactIndex(p, t), evRod),
      sor_projected: calc(win ? (p.steamT * BBL_PER_T_CWE) / cumOilTo(p, win.p50) : 0, evidence('sor', s), { provenance: 'PREDICTED' }),
    },
    risk_30d: { any: calc(r.any, evRisk, { provenance: 'PREDICTED', assumed: true }), by_mode: r.by_mode },
    dq: dqOf(p),
    ood: oodOf(p),
    trust: stateTrust(p),
  };
}

const SHAPE: [number, number][] = [[0, 0.58], [0.33, 0.44], [0.66, 0.3], [1, 0.22]];
function fmiShape(z: number, minDepth: number, pumpDepth: number) {
  if (z <= minDepth) {
    const x = z / minDepth;
    for (let i = 1; i < SHAPE.length; i++) {
      const [x0, y0] = SHAPE[i - 1], [x1, y1] = SHAPE[i];
      if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  const x = (z - minDepth) / (pumpDepth - minDepth);
  return 0.22 + 0.09 * Math.pow(x, 0.8);
}

export function rodProfile(id: string, hz?: number): RodProfile {
  const p = current(id)!;
  const t = p.day;
  const useHz = hz ?? p.hz;
  const pumpDepth = reg('srp.pump_depth_m');
  const fmiNow = fmiAt(p, t, useHz);
  const depth: number[] = [];
  for (let z = 0; z <= pumpDepth; z += 50) depth.push(z);
  const fmi = depth.map((z) => 1 - (1 - fmiShape(z, p.fmiMinDepthM, pumpDepth)) * ((1 - fmiNow) / (1 - 0.22)));
  const temp = depth.map((z) => tubingTemp(p, t, z));
  const sr = goodmanSr(p, t, useHz);
  const age = t / 45;
  return {
    well_id: p.id, vfd_hz: useHz, spm: spmOf(useHz), stroke_in: p.stroke,
    depth_m: depth, temp_c: temp, mu_cp: temp.map(viscosityCp), fmi,
    fmi_min: fmiNow, fmi_min_depth_m: p.fmiMinDepthM, fmi_limit: FMI_LIMIT, goodman_limit: SR_LIMIT,
    sections: [
      { section: 1, grade: 'D', diameter_in: 1.0, from_m: 0, to_m: 380, goodman_sr: sr, damage_cum: 0.034 * age },
      { section: 2, grade: 'D', diameter_in: 0.875, from_m: 380, to_m: 760, goodman_sr: sr * 0.9, damage_cum: 0.021 * age },
      { section: 3, grade: 'D', diameter_in: 0.75, from_m: 760, to_m: pumpDepth, goodman_sr: sr * 0.73, damage_cum: 0.009 * age },
    ],
    impact_index: impactIndex(p, t, useHz),
    provenance: 'DERIVED', evidence_id: evidence('rods', snap(p), { hz: useHz, stroke: p.stroke }),
  };
}

// ---- Bottleneck Navigator ----------------------------------------------------------------
const NOTES: Record<LimitName, string> = {
  INFLOW: 'Inflow-limited: speeding up the pump adds no oil.',
  PUMP: 'Pump-limited: more speed or a longer stroke adds oil, within the float margin.',
  FLOAT: 'Float-limited: the pump already runs at the float-safe speed; heat (re-steam) relaxes it.',
  FATIGUE: 'Fatigue-limited: rod stress caps the rate; a stronger rod grade or slower speed relaxes it.',
  TORQUE: 'Torque-limited: the gearbox rating caps the rate.',
};

function avgNetAtCutoff(p: WellParams, T: number) {
  const C = cycleCost(p.steamT);
  let cum = 0;
  for (let t = 0; t <= T; t++) cum += piDaily(p, t, hzPolicy(p, t));
  return (cum - C) / (injDays(p.steamT) + p.soakD + T);
}

function srpLever(p: WellParams, hz: number, stroke: number, label: string): Lever {
  const t0 = p.day;
  const alt: WellParams = { ...p };
  const H = 14;
  let d = 0, dOil = 0, fmiMin = Infinity, srMax = 0, fillMin = 1;
  for (let t = t0; t < t0 + H; t++) {
    d += piDaily(alt, t, hz, 1, stroke) - piDaily(p, t, p.hz);
    dOil += produced(alt, t, hz, stroke).oil - produced(p, t).oil;
    fmiMin = Math.min(fmiMin, fmiAt(p, t, hz, stroke));
    srMax = Math.max(srMax, goodmanSr(p, t, hz, stroke));
    fillMin = Math.min(fillMin, produced(p, t, hz, stroke).fillage);
  }
  const p90 = fmiMin - FMI_P90_GAP;
  const e0 = kwhPerDay(p, p.hz), e1 = kwhPerDay(p, hz, stroke);
  const r0 = risk30(p, t0).any, r1 = risk30(p, t0, hz, stroke).any;
  let gate: Lever['gate'] = 'PASS';
  let gateDetail = `P90 FMI_min ${p90.toFixed(2)} ≥ ${FMI_LIMIT}`;
  if (p90 < FMI_LIMIT) { gate = 'FAIL'; gateDetail = `P90 FMI_min ${p90.toFixed(2)} < ${FMI_LIMIT} within 14 days`; }
  else if (srMax > SR_LIMIT) { gate = 'FAIL'; gateDetail = `Goodman SR ${srMax.toFixed(2)} > ${SR_LIMIT}`; }
  else if (fillMin < FILLAGE_MIN) { gate = 'FAIL'; gateDetail = `fillage ${fillMin.toFixed(2)} < ${FILLAGE_MIN}`; }
  else if (srMax >= 0.9 * SR_LIMIT) { gate = 'WARN'; gateDetail = `Goodman SR ${srMax.toFixed(2)} within 10% of ${SR_LIMIT}`; }
  else if (p90 < FMI_LIMIT * 1.1) { gate = 'WARN'; gateDetail = `P90 FMI_min ${p90.toFixed(2)} within 10% of ${FMI_LIMIT}`; }
  else if (hz > TRAINED_HZ_MAX) { gate = 'WARN'; gateDetail = `${hz} Hz is outside the trained speed range (≤ ${TRAINED_HZ_MAX} Hz)`; }
  const pct = (a: number, b: number) => `${b >= a ? '+' : '−'}${Math.abs(((b - a) / a) * 100).toFixed(0)}%`;
  return {
    lever: stroke !== p.stroke ? 'STROKE' : 'VFD_HZ',
    change: label,
    d_inr_per_day: d / H,
    basis: 'DAILY',
    d_oil_bopd: dOil / H,
    effects: `energy ${pct(e0, e1)} · FMI_min ${fmiAt(p, t0, p.hz).toFixed(2)} → ${fmiAt(p, t0, hz, stroke).toFixed(2)} · risk ${(r0 * 100).toFixed(0)}% → ${(r1 * 100).toFixed(0)}%${stroke !== p.stroke ? ` · Goodman ${goodmanSr(p, t0, p.hz).toFixed(2)} → ${goodmanSr(p, t0, hz, stroke).toFixed(2)}` : ''}`,
    gate, gate_detail: gateDetail,
  };
}

export function bottleneckFor(id: string): Bottleneck {
  const p = current(id)!;
  const t = p.day;
  const ls = limits(p, t);
  const b = bottleneck(p, t);
  const act = b.sorted[0], nxt = b.sorted[1];
  const oil = produced(p, t).oil;
  const perUnit = p.oilFrac * PRICES.oil - (kwhPerDay(p, p.hz) / oil) * PRICES.power * p.oilFrac;
  const relax = Math.min(0.1 * act.q, nxt.q - act.q);

  const levers: Lever[] = [];
  const hzDown = Math.max(HZ_MIN, p.hz - 4);
  if (hzDown < p.hz) levers.push(srpLever(p, hzDown, p.stroke, `VFD ${p.hz} → ${hzDown} Hz (SPM ${spmOf(p.hz).toFixed(1)} → ${spmOf(hzDown).toFixed(1)})`));
  const hzUp = Math.min(HZ_MAX, p.hz + 3);
  if (hzUp > p.hz) levers.push(srpLever(p, hzUp, p.stroke, `VFD ${p.hz} → ${hzUp} Hz (SPM ${spmOf(p.hz).toFixed(1)} → ${spmOf(hzUp).toFixed(1)})`));
  const strokeUp = [86, 100, 120].find((s) => s > p.stroke);
  if (strokeUp) {
    const hzS = Math.max(HZ_MIN, Math.round((p.hz * p.stroke) / strokeUp));
    levers.push(srpLever(p, hzS, strokeUp, `Stroke ${p.stroke} → ${strokeUp} in at ${hzS} Hz`));
  }
  if (p.phase === 'PRODUCTION') {
    const win = resteamWindow(p);
    if (Math.abs(win.p50 - PRACTICE_CUTOFF_DAY) >= 5 && t < win.p50) {
      levers.push({
        lever: 'RESTEAM_TIMING', basis: 'CYCLE_AVG',
        change: `Re-steam at day ${win.p50} (P50) instead of day ${PRACTICE_CUTOFF_DAY}`,
        d_inr_per_day: avgNetAtCutoff(p, win.p50) - avgNetAtCutoff(p, PRACTICE_CUTOFF_DAY),
        gate: 'PASS', gate_detail: `window day ${win.p10}–${win.p90}`,
        effects: `cycle average ₹/day at the optimal-stopping day vs current practice`,
      });
    }
  }
  const rank = { PASS: 0, WARN: 1, FAIL: 2 } as const;
  levers.sort((a, c) => (a.gate === 'FAIL') !== (c.gate === 'FAIL') ? rank[a.gate] - rank[c.gate] : c.d_inr_per_day - a.d_inr_per_day);

  return {
    well_id: p.id,
    limits: ls.map((l) => ({ name: l.name, q_bfpd: l.q, basis: l.basis })),
    active: b.active, next: b.next,
    shadow_price: { inr_per_day_per_unit: perUnit, unit: 'bbl/d fluid', inr_per_day_at_10pct: relax * perUnit, capped_by_next: nxt.q - act.q < 0.1 * act.q },
    levers,
    note: NOTES[b.active],
    provenance: 'DERIVED',
    evidence_id: evidence('navigator', snap(p)),
  };
}

export function bottleneckHistory(id: string): BottleneckSpan[] {
  const p = current(id)!;
  const win = resteamWindow(p);
  const end = Math.max(p.day, win.p50);
  const spans: BottleneckSpan[] = [];
  for (let t = 0; t <= end; t++) {
    const a = bottleneck(p, t).active;
    const f = t > p.day;
    const last = spans[spans.length - 1];
    if (last && last.active === a && last.forecast === f) last.to_day = t;
    else spans.push({ from_day: t, to_day: t, active: a, forecast: f });
  }
  return spans;
}

export function resteam(id: string): ResteamWindow {
  const p = current(id)!;
  const win = resteamWindow(p);
  const ev = evidence('resteam', snap(p));
  const end = Math.min(MAX_DAY, win.p90 + 25);
  const curve = { day: [] as number[], p10: [] as number[], p50: [] as number[], p90: [] as number[] };
  const variants = WINDOW_SAMPLES.map((s) => ({ p: { ...p, D: p.D * s.dScale }, level: s.level }));
  for (let t = 0; t <= end; t += 2) {
    curve.day.push(t);
    const v = variants.map((x) => piDaily(x.p, t, hzPolicy(x.p, t), x.level));
    curve.p10.push(Math.min(...v));
    curve.p50.push(v[1]);
    curve.p90.push(Math.max(...v));
  }
  return {
    well_id: p.id, cycle_no: p.cycleNo, production_day: p.day,
    window: { p10_day: win.p10, p50_day: win.p50, p90_day: win.p90, p50_date: dateAt(clockOffset() + win.p50 - p.day).toISOString() },
    pi_now: calc(piDaily(p, p.day), ev, { provenance: 'PREDICTED', unit: '₹/day', assumed: true }),
    pi_bar_star: calc(win.piBarStar, ev, { provenance: 'PREDICTED', unit: '₹/day', assumed: true }),
    curve, current_practice_cutoff_day: PRACTICE_CUTOFF_DAY, evidence_id: ev,
  };
}

export function productionSeries(id: string): ProductionSeries {
  const p = current(id)!;
  const history = [];
  for (let t = Math.max(0, p.day - 80); t <= p.day; t++) history.push({ day: t, value: measuredOil(p, t) });
  const forecast = [];
  for (let h = 1; h <= 14; h++) {
    const t = p.day + h;
    const v = produced(p, t, Math.min(p.hz, hzFloat(p, t))).oil;
    const half = v * (0.036 + 0.003 * h);
    forecast.push({ day: t, value: v, lo: v - half, hi: v + half });
  }
  return { well_id: p.id, unit: 'BOPD', history, forecast, evidence_id: evidence('forecast', snap(p)) };
}


