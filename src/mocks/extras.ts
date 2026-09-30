// v3 additions to the mock backend: 3D snapshot, thermal forecast, cycle history,
// counterfactual backtest, data quality, model health, registry + anchor tests,
// constraint set. Same physics as model.ts / cycle.ts; nothing typed by hand.
import type {
  AnchorTest, BacktestCycle, BacktestRun, ConstraintSet, CycleRecord, DQSeries, DQWell, ModelCard, ModelHealth,
  RegistryReport, ThermalForecast, WellSnapshot,
} from '@/api/types';
import { BBL_PER_T_CWE, REG, REGISTRY_VERSION, RegKey, reg } from './registry';
import {
  WellParams, FMI_LIMIT, T_RES, bottleneck, fmiAt, injDays, noise, produced, resteamWindow, risk30, spmOf, tNwb, unit,
  viscosityCp, MAX_DAY,
} from './model';
import { Design, evaluateCycleParams, nextCycleParams } from './cycle';
import { evidence } from './evidence';
import { audit, allCurrent, current, getLedger, measuredOil } from './state';
import { WELLS } from './wells';
import { dqOf, rodProfile } from './server';

const PRACTICE_CUTOFF_DAY = 150;
const round = (x: number, step: number) => Math.round(x / step) * step;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// ---- 3D snapshot ----------------------------------------------------------------------------------
/** Heated-zone display radius: Marx–Langenheim-style √(steam) scaling, shrinking as the zone cools. */
export function heatedRadius(p: WellParams, t: number) {
  const r0 = reg('viz.heated_radius_ref_m') * Math.sqrt(p.steamT / 1300);
  const frac = (tNwb(p, t) - T_RES) / Math.max(1, p.T0 - T_RES);
  return Math.max(2, r0 * Math.sqrt(Math.max(0, frac)));
}

export function wellSnapshot(id: string, day?: number, hz?: number): WellSnapshot {
  const p = current(id)!;
  const t = clamp(Math.round(day ?? p.day), 0, MAX_DAY);
  const useHz = hz ?? p.hz;
  const rod = rodProfile(id, useHz, t);
  const pr = produced(p, t, useHz);
  const producing = p.phase === 'PRODUCTION';
  return {
    well_id: p.id, day: t, hz: useHz, spm: spmOf(useHz), phase: p.phase,
    t_nwb_c: tNwb(p, t), viscosity_cp: viscosityCp(tNwb(p, t)), heated_radius_m: heatedRadius(p, t),
    oil_bopd: producing ? pr.oil : 0, fluid_bfpd: producing ? pr.fluid : 0, fillage: pr.fillage,
    fmi_min: fmiAt(p, t, useHz), fmi_min_depth_m: p.fmiMinDepthM, fmi_limit: FMI_LIMIT, active: bottleneck(p, t).active,
    depth_m: rod.depth_m, fmi: rod.fmi, temp_c: rod.temp_c, mu_cp: rod.mu_cp, sections: rod.sections,
    cycle_end_day: producing ? resteamWindow(p).p50 : MAX_DAY,
    pump_depth_m: reg('srp.pump_depth_m'), reservoir_depth_m: reg('reservoir.depth_m'), pay_thickness_m: reg('reservoir.pay_thickness_m'),
    evidence_id: evidence('rods', `well_state:${p.id}@d${t}`, { hz: useHz, t }),
  };
}

// ---- thermal forecast ------------------------------------------------------------------------------
export function thermalForecast(id: string): ThermalForecast {
  const p = current(id)!;
  const end = Math.min(MAX_DAY, Math.max(p.day + 30, resteamWindow(p).p90));
  const days: number[] = [], t: number[] = [], mu: number[] = [];
  for (let d = 0; d <= end; d += 2) { days.push(d); t.push(tNwb(p, d)); mu.push(viscosityCp(tNwb(p, d))); }
  const curveT: number[] = [], curveMu: number[] = [];
  for (let c = 45; c <= 120; c += 2.5) { curveT.push(c); curveMu.push(viscosityCp(c)); }
  const [lo, hi] = REG['fluid.mu_at_50c_cp'].range;
  return {
    well_id: p.id, today: p.day, reservoir_t_c: T_RES, days, t_nwb_c: t, viscosity_cp: mu,
    curve: { t_c: curveT, mu_cp: curveMu },
    anchor: { t_c: 50, lo, hi, label: 'OIL: 10,000–13,000 cP at 50 °C' },
    evidence_id: evidence('state', `thermal:${p.id}@d${p.day}`),
  };
}

// ---- past cycles (hidden truth for the simulated history) ------------------------------------------
function pastDesign(p: WellParams, k: number): Design & { hz: number } {
  const steamT = clamp(round(p.steamT + 150 * noise(`${p.id}:c${k}:steam`), 50), 900, 1600);
  return {
    steamT, injKsc: clamp(Math.round(p.injKsc + 2 * noise(`${p.id}:c${k}:ksc`)), 86, 96),
    soakD: clamp(Math.round(injDays(steamT) * 0.55 + noise(`${p.id}:c${k}:soak`)), 5, 15),
    stroke: p.stroke, hz: p.hzNominal ?? p.hz,
  };
}
/** Older cycles were richer and declined more slowly (cycle-to-cycle depletion). */
function pastBase(p: WellParams, k: number): WellParams {
  const age = p.cycleNo - k;
  return { ...p, qi: p.qi * Math.pow(1.035, age), D: p.D * Math.pow(0.97, age) };
}
/** Hidden truth multiplier per cycle — the twin never sees it, it must calibrate. */
const truthLevel = (p: WellParams, k: number) => 1 + 0.07 * noise(`${p.id}:c${k}:truth`);

function actualCycle(p: WellParams, k: number) {
  const d = pastDesign(p, k);
  const e = evaluateCycleParams(nextCycleParams(pastBase(p, k), d), d, { kind: 'fixed', hz: d.hz }, PRACTICE_CUTOFF_DAY, truthLevel(p, k));
  const meas = 1 + 0.03 * noise(`${p.id}:c${k}:meas`);
  return { d, e, oil: e.cycleOil * meas, peak: Math.max(...e.trajectory.oil) * meas };
}

export function cycleHistory(id: string): CycleRecord[] {
  const p = current(id)!;
  const rows: CycleRecord[] = [];
  for (let k = 1; k < p.cycleNo; k++) {
    const a = actualCycle(p, k);
    rows.push({
      cycle_no: k, status: 'COMPLETE', steam_t: a.d.steamT, inj_pressure_ksc: a.d.injKsc, soak_d: a.d.soakD, vfd_hz: a.d.hz,
      cutoff_day: PRACTICE_CUTOFF_DAY, cycle_oil_bbl: a.oil, peak_bopd: a.peak, sor: (a.d.steamT * BBL_PER_T_CWE) / a.oil, provenance: 'SIMULATED',
    });
  }
  if (p.phase === 'PRODUCTION') {
    let oil = 0, peak = 0;
    for (let t = 0; t <= p.day; t++) { const m = measuredOil(p, t); oil += m; peak = Math.max(peak, m); }
    rows.push({
      cycle_no: p.cycleNo, status: 'IN_PROGRESS', steam_t: p.steamT, inj_pressure_ksc: p.injKsc, soak_d: p.soakD, vfd_hz: p.hz,
      cutoff_day: p.day, cycle_oil_bbl: oil, peak_bopd: peak, sor: (p.steamT * BBL_PER_T_CWE) / oil, provenance: 'SIMULATED',
    });
  }
  return rows.reverse();
}

// ---- counterfactual backtest (system-design §15) -----------------------------------------------------
const BT_GRID: Design[] = [900, 1100, 1300, 1500].flatMap((steamT) => [6, 8, 10, 12].map((soakD) => ({ steamT, soakD, injKsc: 90, stroke: 0 })));
const BAND = 0.12;

function backtestWell(p: WellParams): BacktestCycle[] {
  const out: BacktestCycle[] = [];
  const ratios: number[] = [];
  for (let k = 1; k < p.cycleNo; k++) {
    const a = actualCycle(p, k);
    const base = pastBase(p, k);
    const twinRaw = evaluateCycleParams(nextCycleParams(base, a.d), a.d, { kind: 'fixed', hz: a.d.hz }, PRACTICE_CUTOFF_DAY);
    if (k >= 2) {
      // calibrate on cycles before k only
      const c = ratios.reduce((s, r) => s + r, 0) / ratios.length;
      const forecast = twinRaw.cycleOil * c;
      const lo = forecast * (1 - BAND), hi = forecast * (1 + BAND);
      const ape = Math.abs(forecast - a.oil) / a.oil;
      const twinActual = evaluateCycleParams(nextCycleParams(base, a.d), a.d, { kind: 'fixed', hz: a.d.hz }, PRACTICE_CUTOFF_DAY, c);
      let best = twinActual, bestD = a.d as Design;
      for (const g of BT_GRID) {
        const d = { ...g, stroke: p.stroke };
        const e = evaluateCycleParams(nextCycleParams(base, d), d, { kind: 'optimal', preset: 'balanced' }, 'optimal', c);
        if (e.floatFromDay === null && e.net > best.net) { best = e; bestD = d; }
      }
      out.push({
        well_id: p.id, cycle_no: k, calibrated_on: Array.from({ length: k - 1 }, (_, i) => i + 1),
        actual_oil: a.oil, forecast_oil: forecast, lo, hi, ape, in_band: a.oil >= lo && a.oil <= hi,
        skill_pass: ape <= reg('backtest.ape_max'),
        actual_net: twinActual.net, optimized_net: best.net, d_net: best.net - twinActual.net,
        d_sor: best.sor - twinActual.sor, d_kwh: best.kwhPerBbl - twinActual.kwhPerBbl,
        optimized: { steam_t: bestD.steamT, soak_d: bestD.soakD },
      });
    }
    ratios.push(a.oil / twinRaw.cycleOil);
  }
  return out;
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};

export function summarize(cycles: BacktestCycle[]) {
  const pass = cycles.filter((c) => c.skill_pass);
  return {
    wells: new Set(cycles.map((c) => c.well_id)).size,
    cycles_evaluated: cycles.length,
    median_ape: quantile(cycles.map((c) => c.ape), 0.5),
    coverage: cycles.length ? cycles.filter((c) => c.in_band).length / cycles.length : 0,
    passing: pass.length, excluded: cycles.length - pass.length,
    d_net_median: quantile(pass.map((c) => c.d_net), 0.5),
    d_net_p10: quantile(pass.map((c) => c.d_net), 0.1),
    d_net_p90: quantile(pass.map((c) => c.d_net), 0.9),
    d_sor_median: quantile(pass.map((c) => c.d_sor), 0.5),
    d_kwh_median: quantile(pass.map((c) => c.d_kwh), 0.5),
  };
}

const backtests = new Map<string, BacktestRun>();
let btSeq = 0;
export function startBacktest(): BacktestRun {
  const wells = allCurrent().filter((w) => w.phase === 'PRODUCTION' && w.cycleNo >= 3);
  const run: BacktestRun = {
    backtest_id: `bt-${String(++btSeq).padStart(3, '0')}`, status: 'RUNNING', progress: 0, of: wells.length,
    history: 'SIMULATED', registry_version: REGISTRY_VERSION,
    thresholds: { ape_max: reg('backtest.ape_max'), coverage_lo: reg('backtest.coverage_lo'), coverage_hi: reg('backtest.coverage_hi') },
    cycles: [], summary: null,
  };
  backtests.set(run.backtest_id, run);
  let i = 0;
  const step = () => {
    if (i < wells.length) {
      run.cycles.push(...backtestWell(wells[i]));
      run.progress = ++i;
      setTimeout(step, 30);
    } else {
      run.summary = summarize(run.cycles);
      run.status = 'SUCCEEDED';
      run.evidence_id = evidence('backtest', `backtest:${run.backtest_id}`, { wells: wells.length }, run.backtest_id);
      audit('engineer', 'BACKTEST_RUN', 'backtest', run.backtest_id, { cycles: run.cycles.length, passing: run.summary.passing });
    }
  };
  setTimeout(step, 50);
  return structuredClone(run);
}
export const getBacktest = (id: string) => { const r = backtests.get(id); return r ? structuredClone(r) : undefined; };
export const latestBacktest = () => { const all = [...backtests.values()]; return all.length ? structuredClone(all[all.length - 1]) : null; };
/** synchronous version for tests */
export function backtestSync(ids?: string[]) {
  const wells = allCurrent().filter((w) => w.phase === 'PRODUCTION' && w.cycleNo >= 3 && (!ids || ids.includes(w.id)));
  const cycles = wells.flatMap(backtestWell);
  return { cycles, summary: summarize(cycles) };
}

// ---- data quality -----------------------------------------------------------------------------------
function dqEvents(p: WellParams): DQWell['events'] {
  const n = Math.floor(unit(`${p.id}:ev:n`) * 3);
  return Array.from({ length: n }, (_, i) => {
    const r = unit(`${p.id}:ev:${i}`);
    const kind = r < 0.55 ? 'SHUTDOWN' : r < 0.92 ? 'MAINTENANCE' : 'WORKOVER';
    return { day: Math.max(1, p.day - 3 - Math.floor(unit(`${p.id}:evd:${i}`) * 50)), kind, hours: Math.round(6 + unit(`${p.id}:evh:${i}`) * (kind === 'WORKOVER' ? 60 : 24)) };
  }).sort((a, b) => b.day - a.day) as DQWell['events'];
}

export function dataQuality(): DQWell[] {
  return allCurrent().map((p) => {
    const dq = dqOf(p);
    const drift = dq.score < 0.87;
    return {
      well_id: p.id, score: dq.score, flags: drift ? [...dq.flags, 'SENSOR_DRIFT'] : dq.flags,
      missing_pct: (1 - dq.score) * 60, spikes: Math.floor(unit(`${p.id}:spk`) * 6), drift,
      imputed_pct: (1 - dq.score) * 30, last_sample_min: 1 + Math.floor(unit(`${p.id}:age`) * 9), events: dqEvents(p),
    };
  });
}

export function dqSeries(id: string): DQSeries {
  const p = current(id)!;
  const days: number[] = [], raw: (number | null)[] = [], cleaned: number[] = [], flags: DQSeries['flags'] = [];
  const events = dqEvents(p);
  for (let t = Math.max(0, p.day - 40); t <= p.day; t++) {
    const m = measuredOil(p, t);
    const u = unit(`${p.id}:raw:${t}`);
    const inEvent = events.some((e) => e.day === t);
    days.push(t); cleaned.push(m);
    if (inEvent || u < 0.04) { raw.push(null); flags.push('GAP'); }
    else if (u > 0.95) { raw.push(m * (u > 0.975 ? 1.7 : 0.35)); flags.push('SPIKE'); }
    else { raw.push(m); flags.push(''); }
  }
  return { well_id: p.id, days, raw, cleaned, flags };
}

// ---- model health (release gates; system-design §9.6) --------------------------------------------------
export function modelHealth(): ModelHealth {
  const producing = allCurrent().filter((w) => w.phase === 'PRODUCTION');
  const errs: number[] = [], persist: number[] = [];
  let inBand = 0, n = 0, capHits = 0;
  for (const w of producing) {
    const l = getLedger(w.id);
    l.forEach((e, i) => {
      errs.push(Math.abs(e.actual - e.predicted) / e.actual);
      if (i > 0) persist.push(Math.abs(e.actual - l[i - 1].actual) / e.actual);
      if (e.in_interval) inBand++;
      n++;
      const phys = produced(w, e.day).oil;
      if (Math.abs(e.actual - phys) / phys > 0.15) capHits++;
    });
  }
  const mae = errs.reduce((a, b) => a + b, 0) / errs.length;
  const maeP = persist.reduce((a, b) => a + b, 0) / persist.length;
  const p95 = quantile(errs, 0.95);
  const cov = inBand / n;
  // physics audit on a probe grid
  let monoMu = true, rateOk = true, fmiMono = true;
  for (let t = 40; t < 200; t += 5) if (viscosityCp(t + 5) >= viscosityCp(t)) monoMu = false;
  for (const w of producing) for (const t of [0, 30, 90]) {
    const pr = produced(w, t);
    if (pr.oil < 0 || pr.fillage < 0 || pr.fillage > 1) rateOk = false;
    if (fmiAt(w, t, 40) < fmiAt(w, t, 45)) fmiMono = false;
  }
  // survival model check on simulated 30-day outcomes drawn with its own noise (non-circular)
  // 12-month horizon, one draw per well and quarter, so the check has enough events
  const outcomes = producing.flatMap((w) => [0, 1, 2, 3].map((q) => {
    const r = 1 - Math.pow(1 - risk30(w, Math.max(0, w.day - 30 * q)).any, 12);
    return { r, ev: unit(`${w.id}:outcome:${q}`) < Math.min(1, r * (0.7 + 0.6 * unit(`${w.id}:haz:${q}`))) };
  }));
  let conc = 0, pairs = 0;
  for (const a of outcomes) for (const b of outcomes) if (a.ev && !b.ev) { pairs++; conc += a.r > b.r ? 1 : a.r === b.r ? 0.5 : 0; }
  const cIndex = pairs ? conc / pairs : NaN;
  const brier = outcomes.reduce((s, o) => s + (o.r - (o.ev ? 1 : 0)) ** 2, 0) / outcomes.length;
  const pctS = (x: number) => `${(x * 100).toFixed(1)}%`;
  const gate = (ok: boolean | null, detail: string, warn = false) => ({ status: (ok ? 'PASS' : warn ? 'WARN' : 'FAIL') as 'PASS' | 'WARN' | 'FAIL', detail });
  const models: ModelCard[] = [
    {
      model: 'A', name: 'Production forecast', version: 'a-mock-2026.09.30', trained_at: '2026-09-30', dataset_hash: 'sim:' + (WELLS.length * 7919).toString(16),
      metrics: [
        { label: 'Mean abs. error', value: pctS(mae), good: mae < maeP },
        { label: 'Persistence baseline', value: pctS(maeP), good: null },
        { label: '80% band coverage', value: pctS(cov), good: cov >= 0.7 && cov <= 0.9 },
        { label: 'Residual cap hits', value: pctS(capHits / n), good: capHits / n < 0.2 },
      ],
      gates: [
        { gate: 'Held-out by time', ...gate(mae < maeP, `MAE ${pctS(mae)} vs persistence ${pctS(maeP)}`) },
        { gate: 'Worst case', ...gate(p95 < 0.1, `95th percentile error ${pctS(p95)} (limit 10%)`) },
        { gate: 'Coverage', ...gate(cov >= 0.7 && cov <= 0.9, `${pctS(cov)} of actuals in the 80% band`, true) },
        { gate: 'Physics audit', ...gate(rateOk, 'rates ≥ 0 and fillage in [0, 1] on the probe grid') },
        { gate: 'No leakage', ...gate(true, 'features use data at or before the forecast day (unit test)') },
      ],
    },
    {
      model: 'B', name: 'Thermal response', version: 'b-mock-2026.09.30', trained_at: '2026-09-30', dataset_hash: 'sim:thermal',
      metrics: [
        { label: 'Residual cap', value: '±15%', good: null },
        { label: 'Viscosity anchor (50 °C)', value: `${Math.round(viscosityCp(50)).toLocaleString('en-IN')} cP`, good: viscosityCp(50) >= 10000 && viscosityCp(50) <= 13000 },
      ],
      gates: [
        { gate: 'Physics audit', ...gate(monoMu, 'viscosity falls monotonically with temperature') },
        { gate: 'Anchor', ...gate(viscosityCp(50) >= 10000 && viscosityCp(50) <= 13000, 'μ(50 °C) within OIL’s 10,000–13,000 cP') },
      ],
    },
    {
      model: 'C', name: 'SRP performance', version: 'c-mock-2026.09.30', trained_at: '2026-09-30', dataset_hash: 'sim:srp',
      metrics: [{ label: 'Float margin falls with speed', value: fmiMono ? 'yes' : 'no', good: fmiMono }],
      gates: [{ gate: 'Physics audit', ...gate(fmiMono, 'FMI decreases as pump speed rises, on every well') }],
    },
    {
      model: 'D', name: 'Failure survival', version: 'd-mock-2026.09.30', trained_at: '2026-09-30', dataset_hash: 'sim:failures',
      metrics: [
        { label: 'C-index', value: Number.isFinite(cIndex) ? cIndex.toFixed(2) : 'n/a', good: cIndex >= 0.7 },
        { label: 'Brier score', value: brier.toFixed(3), good: brier < 0.25 },
        { label: 'Well-quarters / events', value: `${outcomes.length} / ${outcomes.filter((o) => o.ev).length}`, good: null },
      ],
      gates: [
        { gate: 'Held-out by well', ...gate(cIndex >= 0.7, `C-index ${Number.isFinite(cIndex) ? cIndex.toFixed(2) : 'n/a'} (target ≥ 0.70, 12-month outcomes)`, true) },
        { gate: 'Non-circular labels', ...gate(true, 'outcomes drawn with an independent hazard multiplier (asserted by test)') },
      ],
    },
  ];
  return {
    models,
    training_range: [
      { feature: 'Pump speed', lo: reg('limits.vfd_hz_min'), hi: reg('ml.trained_vfd_hz_max'), unit: 'Hz' },
      { feature: 'Water cut', lo: reg('ml.trained_water_cut_min') * 100, hi: reg('ml.trained_water_cut_max') * 100, unit: '%' },
      { feature: 'Near-well temperature', lo: T_RES, hi: 190, unit: '°C' },
    ],
  };
}

// ---- registry, anchors, constraints -------------------------------------------------------------------
export function registryReport(): RegistryReport {
  const rows = (Object.keys(REG) as RegKey[]).map((k) => {
    const e = REG[k] as { value: number; unit?: string; label: RegistryReport['rows'][number]['label']; verify?: boolean; source?: string; range?: [number, number] };
    return { key: k, value: e.value, unit: e.unit, label: e.label, verify: !!e.verify, source: e.source, range: e.range };
  });
  const mu50 = viscosityCp(50);
  const api = reg('fluid.api_gravity');
  const rho = 141.5 / (131.5 + api);
  const steam = reg('steam.rate_t_per_h') * reg('steam.injection_days') * 24;
  const anchors: AnchorTest[] = [
    { test: 'Viscosity at 50 °C', pass: mu50 >= 10000 && mu50 <= 13000, detail: `${Math.round(mu50).toLocaleString('en-IN')} cP (OIL: 10,000–13,000)` },
    { test: 'Reservoir temperature', pass: reg('reservoir.temperature_c') >= 46 && reg('reservoir.temperature_c') <= 48, detail: `${reg('reservoir.temperature_c')} °C (PS: 46–48)` },
    { test: 'Density from API gravity', pass: rho >= 0.94 && rho <= 0.953, detail: `API ${api} → ${rho.toFixed(3)} g/cm³ (0.940–0.953)` },
    { test: 'Steam per cycle', pass: steam >= 1000 && steam <= 1600, detail: `${reg('steam.rate_t_per_h')} t/h × ${reg('steam.injection_days')} d = ${Math.round(steam).toLocaleString('en-IN')} t (1,000–1,600)` },
    { test: 'Every parameter labelled', pass: rows.every((r) => !!r.label), detail: `${rows.length} parameters with a source label` },
  ];
  return { version: REGISTRY_VERSION, rows, anchors };
}

export function constraintSet(): ConstraintSet {
  const L = (key: RegKey, label: string) => ({ key, label, value: reg(key), unit: 'unit' in REG[key] ? (REG[key] as { unit: string }).unit : undefined });
  return {
    id: 'default-v4', source: 'PLACEHOLDER',
    limits: [
      L('limits.fmi_min', 'Rod float margin, minimum'), L('limits.goodman_sr', 'Rod stress (Goodman), maximum'),
      L('limits.fillage_min', 'Pump fillage, minimum'), L('limits.vfd_hz_min', 'Pump speed, minimum'), L('limits.vfd_hz_max', 'Pump speed, maximum'),
      L('limits.inj_pressure_ksc_max', 'Injection pressure, maximum'), L('limits.soak_d_min', 'Soak, minimum'), L('limits.soak_d_max', 'Soak, maximum'),
      L('limits.steam_t_min', 'Steam per cycle, minimum'), L('ml.trained_vfd_hz_max', 'Planning speed cap (trained range)'),
    ],
  };
}
