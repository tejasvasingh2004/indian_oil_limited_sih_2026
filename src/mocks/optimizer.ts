// Scenario Lab and optimizer mocks (system-design §5.7–5.8, §11–14).
// The optimizer is an exhaustive grid over steam designs with a per-block SRP
// plan for each objective preset. It is labelled as a grid everywhere in the UI.
import type {
  Confidence, DecisionKind, Explanation, GateCheck, GateVerdict, OptimizationRequest, OptimizationRun, ParetoPoint,
  Quantity, Recommendation, SanityFlag, ScenarioFlag, ScenarioInput, ScenarioResult, Strategy, StrategyLabel, Trust, WellDesign,
} from '@/api/types';
import { reg } from './registry';
import { FMI_LIMIT, SR_LIMIT, FILLAGE_MIN, HZ_MIN, HZ_MAX, spmOf, WellParams } from './model';
import {
  CycleEval, Design, Preset, designGrid, evaluateCycle, evaluateDesignAllPresets, cycleUncertainty,
} from './cycle';
import { evidence } from './evidence';
import { current, clockOffset, recommendations } from './state';
import { CRITICAL, stateTrust, trustLevel, wellState } from './server';

const PRACTICE_CUTOFF_DAY = 150;
const TRAINED_HZ_MAX = reg('ml.trained_vfd_hz_max');
const KSC_MAX = reg('limits.inj_pressure_ksc_max');
const STEAM_MIN = reg('limits.steam_t_min');
const STEAM_MAX_SCENARIO = 1600;

const pred = (value: number, ev: string, extra: Partial<Omit<Quantity, 'provenance'>> = {}): Quantity =>
  ({ value, provenance: 'PREDICTED', evidence_id: ev, ...extra }) as Quantity;

function confidenceOf(net: number, lo: number, hi: number): Confidence {
  const w = (hi - lo) / Math.abs(net);
  return w <= 0.15 ? 'HIGH' : w <= 0.35 ? 'MEDIUM' : 'LOW';
}

const practiceDesign = (p: WellParams): Design => ({ steamT: p.steamT, injKsc: p.injKsc, soakD: p.soakD, stroke: p.stroke });
const practiceHz = (p: WellParams) => p.hzNominal ?? p.hz;

// ---- Scenario Lab --------------------------------------------------------------------------
export interface ScenarioRequest {
  well_id: string;
  scenarios: (ScenarioInput & { planned?: boolean; cutoff?: 'optimal' | 'practice' })[];
}

export function runScenarios(req: ScenarioRequest): ScenarioResult[] {
  const p = current(req.well_id)!;
  return req.scenarios.map((s) => {
    const flags: ScenarioFlag[] = [];
    const hard = (ok: boolean, param: keyof ScenarioInput, detail: string) => { if (!ok) flags.push({ type: 'HARD_LIMIT', param, detail }); };
    hard(s.steam_t >= STEAM_MIN && s.steam_t <= STEAM_MAX_SCENARIO, 'steam_t', `steam must be ${STEAM_MIN}–${STEAM_MAX_SCENARIO} t`);
    hard(s.inj_pressure_ksc >= 60 && s.inj_pressure_ksc <= KSC_MAX, 'inj_pressure_ksc', `injection pressure must be ≤ ${KSC_MAX} ksc`);
    hard(s.soak_d >= reg('limits.soak_d_min') && s.soak_d <= reg('limits.soak_d_max'), 'soak_d', `soak must be ${reg('limits.soak_d_min')}–${reg('limits.soak_d_max')} d`);
    hard(s.vfd_hz >= HZ_MIN && s.vfd_hz <= HZ_MAX, 'vfd_hz', `VFD must be ${HZ_MIN}–${HZ_MAX} Hz`);
    hard([86, 100, 120].includes(s.stroke_in), 'stroke_in', 'stroke must be 86, 100 or 120 in');
    const design: Design = { steamT: s.steam_t, injKsc: s.inj_pressure_ksc, soakD: s.soak_d, stroke: s.stroke_in };
    const blocked = flags.length > 0;
    const e = blocked ? null : evaluateCycle(p, design, s.planned ? { kind: 'optimal', preset: 'balanced' } : { kind: 'fixed', hz: s.vfd_hz },
      s.cutoff === 'practice' ? PRACTICE_CUTOFF_DAY : 'optimal');
    const u = e ? cycleUncertainty(p, e) : null;
    if (e && !s.planned && s.vfd_hz > TRAINED_HZ_MAX)
      flags.push({ type: 'OUTSIDE_TRAINING_RANGE', param: 'vfd_hz', detail: `${s.vfd_hz} Hz > trained max ${TRAINED_HZ_MAX} Hz` });
    if (e && e.floatFromDay !== null)
      flags.push({ type: 'FLOAT_MARGIN', param: 'vfd_hz', detail: `float margin below ${FMI_LIMIT} from production day ${e.floatFromDay}` });
    const ev = evidence('scenario', `well_state:${p.id}@offset${clockOffset()}`, { s });
    const q = (v: number, extra: Partial<Omit<Quantity, 'provenance'>> = {}) => pred(v, ev, extra);
    let confidence: Confidence = e && u ? confidenceOf(e.net, u.netLo, u.netHi) : 'LOW';
    if (flags.some((f) => f.type === 'OUTSIDE_TRAINING_RANGE')) confidence = 'LOW';
    const zero = q(0);
    return {
      name: s.name,
      derived: e
        ? { spm: spmOf(s.vfd_hz), inj_d: e.injD, resteam_p50_day: e.cutoffDay, cycle_days: e.cycleDays }
        : { spm: spmOf(s.vfd_hz), inj_d: 0, resteam_p50_day: 0, cycle_days: 0 },
      kpis: e && u
        ? {
            cycle_oil_bbl: q(e.cycleOil, { lo: u.oilLo, hi: u.oilHi, unit: 'bbl' }),
            oil_per_cycle_day: q(e.oilPerCycleDay, { unit: 'bbl/d' }),
            sor: q(e.sor),
            kwh_per_bbl: q(e.kwhPerBbl, { unit: 'kWh/bbl' }),
            failure_risk: q(e.risk, { assumed: true }),
            fmi_min_p90: q(e.fmiMinP90),
            net_inr_per_day: q(e.net, { lo: u.netLo, hi: u.netHi, unit: '₹/day', assumed: true }),
          }
        : { cycle_oil_bbl: zero, oil_per_cycle_day: zero, sor: zero, kwh_per_bbl: zero, failure_risk: zero, fmi_min_p90: zero, net_inr_per_day: zero },
      confidence,
      flags,
      blocked,
      plan: e?.plan ?? [],
      trajectory: e?.trajectory ?? { day: [], oil: [], fmi: [], hz: [] },
    } as ScenarioResult;
  });
}

export function wellDesign(id: string): WellDesign {
  const p = current(id)!;
  return { cycle_no: p.cycleNo, steam_t: p.steamT, inj_pressure_ksc: p.injKsc, soak_d: p.soakD, stroke_in: p.stroke, vfd_hz: practiceHz(p), practice_cutoff_day: PRACTICE_CUTOFF_DAY };
}

// ---- Optimizer -------------------------------------------------------------------------------
interface RunState { run: OptimizationRun; timer?: ReturnType<typeof setTimeout> }
const runs = new Map<string, RunState>();
let runSeq = 0;

export function startOptimization(req: OptimizationRequest): OptimizationRun {
  const p = current(req.well_id)!;
  const run_id = `opt-${(++runSeq).toString().padStart(3, '0')}-${req.well_id}`;
  const base: OptimizationRun = {
    run_id, well_id: req.well_id, status: 'QUEUED', generation: 0, of: 1, request: req,
    versions: { twin: 'mock-0.1.0', optimizer: 'mock-grid-0.1.0', registry: 'reg-2026.09.30-1', constraint_set: 'default-v4 (placeholder)' },
    sanity_flags: [], strategies: [], pareto: [],
  };
  const state: RunState = { run: base };
  runs.set(run_id, state);

  if (wellState(req.well_id).ood.flag) {
    base.status = 'BLOCKED_OOD';
    return structuredClone(base);
  }

  const strokes = [86, 100, 120];
  const grid = designGrid(req.steam_available_t, strokes);
  const chunk = 60;
  base.of = Math.ceil(grid.length / chunk);
  base.status = 'RUNNING';
  const results: Record<Preset, CycleEval>[] = [];
  let i = 0;
  const step = () => {
    const slice = grid.slice(i, i + chunk);
    for (const d of slice) {
      const r = evaluateDesignAllPresets(p, d);
      results.push(r);
      const b = r.balanced;
      base.pareto.push({ net: b.net, oil: b.cycleOil, kwh: b.kwhPerBbl, risk: b.risk, front: false });
    }
    i += chunk;
    base.generation = Math.min(base.of, base.generation + 1);
    if (i < grid.length) state.timer = setTimeout(step, 90);
    else finish(state, p, req, grid, results);
  };
  state.timer = setTimeout(step, 150);
  return structuredClone(base);
}

function feasible(e: CycleEval, req: OptimizationRequest) {
  return e.sor <= req.max_sor && e.risk <= req.max_failure_risk && e.floatFromDay === null
    && e.srMax <= SR_LIMIT && e.fillageMin >= FILLAGE_MIN && e.design.steamT <= req.steam_available_t;
}

function markFront(points: ParetoPoint[]) {
  for (const a of points) {
    a.front = !points.some((b) => b !== a && b.net >= a.net && b.oil >= a.oil && b.kwh <= a.kwh && b.risk <= a.risk
      && (b.net > a.net || b.oil > a.oil || b.kwh < a.kwh || b.risk < a.risk));
  }
}

function finish(state: RunState, p: WellParams, req: OptimizationRequest, grid: Design[], results: Record<Preset, CycleEval>[]) {
  const run = state.run;
  markFront(run.pareto);

  const pickBy = (preset: Preset, score: (e: CycleEval) => number) =>
    results.map((r) => r[preset]).filter((e) => feasible(e, req)).sort((a, b) => score(b) - score(a) || b.net - a.net)[0];
  const picks: Record<Exclude<StrategyLabel, 'CURRENT'>, CycleEval | undefined> = {
    PRODUCTION: pickBy('production', (e) => e.oilPerCycleDay),
    BALANCED: pickBy('balanced', (e) => e.net),
    ENERGY: pickBy('energy', (e) => -e.kwhPerBbl),
    RELIABILITY: pickBy('reliability', (e) => -e.risk),
  };

  const cur = evaluateCycle(p, practiceDesign(p), { kind: 'fixed', hz: practiceHz(p) }, PRACTICE_CUTOFF_DAY);
  const flags = sanity(p, req, grid, results, picks, cur);
  run.sanity_flags = flags;
  run.current = toStrategy(p, 'CURRENT', cur, run.run_id, cur);
  run.current.resteam_window = { p10_day: PRACTICE_CUTOFF_DAY, p50_day: PRACTICE_CUTOFF_DAY, p90_day: PRACTICE_CUTOFF_DAY, basis: 'current practice' };
  run.current.gate = gate(p, cur, req, 'CURRENT');

  // a new run supersedes older pending recommendations for this well (system-design §11.5)
  for (const r of recommendations) if (r.well_id === p.id && r.status === 'PENDING') r.status = 'EXPIRED';

  const baseTrust = stateTrust(p);
  run.strategies = (Object.keys(picks) as (keyof typeof picks)[]).flatMap((label) => {
    const e = picks[label];
    if (!e) return [];
    const s = toStrategy(p, label, e, run.run_id, cur);
    const g = gate(p, e, req, label);
    const own = flags.filter((f) => f.strategy === label || f.severity === 'FAIL');
    const factors = [
      ...baseTrust.factors,
      { factor: 'OPTIMIZER_SANITY', status: own.some((f) => f.severity === 'FAIL') ? 'RED' : own.some((f) => f.severity === 'WARN') ? 'AMBER' : 'GREEN', detail: own.length ? own.map((f) => f.code).join(', ') : 'no flags on this strategy' },
      { factor: 'GATE_STATUS', status: g.verdict === 'REJECTED' ? 'RED' : g.checks.some((c) => c.status === 'WARN') ? 'AMBER' : 'GREEN', detail: g.checks.filter((c) => c.status !== 'PASS').map((c) => c.check).join(', ') || 'all checks pass' },
    ] as Trust['factors'];
    const trust: Trust = { level: trustLevel(factors, CRITICAL), factors };
    let verdict: GateVerdict = g.verdict;
    if (verdict === 'APPROVED_FOR_REVIEW' && trust.level !== 'HIGH') verdict = 'HUMAN_REVIEW_REQUIRED';
    s.gate = { verdict, checks: g.checks };
    s.trust = trust;
    if (verdict !== 'REJECTED') {
      s.recommendation_id = `rec-${run.run_id}-${label.toLowerCase()}`;
      recommendations.push({
        recommendation_id: s.recommendation_id, well_id: p.id, run_id: run.run_id, strategy: label,
        created_day: p.day, trust: trust.level, verdict, status: 'PENDING', net_inr_per_day: e.net,
      });
    }
    return [s];
  });
  run.status = 'SUCCEEDED';
  run.generation = run.of;
}

function planSummary(e: CycleEval) {
  const hz = e.plan.map((b) => b.vfd_hz);
  if (new Set(hz).size === 1) return `VFD ${hz[0]} Hz fixed`;
  const low = Math.min(...hz);
  const firstLow = e.plan.find((b) => b.vfd_hz === low)!.from_day;
  return `VFD ${hz[0]} Hz while hot → ${low} Hz from day ${firstLow}`;
}

function toStrategy(p: WellParams, label: StrategyLabel, e: CycleEval, runId: string, cur: CycleEval): Strategy {
  const ev = evidence('strategy', `well_state:${p.id}@offset${clockOffset()}`, { d: e.design, label }, runId);
  const u = cycleUncertainty(p, e);
  const q = (v: number, extra: Partial<Omit<Quantity, 'provenance'>> = {}) => pred(v, ev, extra);
  const s: Strategy = {
    strategy_id: `${runId}-${label.toLowerCase()}`,
    label,
    parameters: { steam_t: e.design.steamT, inj_pressure_ksc: e.design.injKsc, soak_d: e.design.soakD, stroke_in: e.design.stroke },
    srp_plan: e.plan,
    resteam_window: { p10_day: u.p10, p50_day: e.cutoffDay, p90_day: u.p90 },
    kpis: {
      cycle_oil_bbl: q(e.cycleOil, { lo: u.oilLo, hi: u.oilHi, unit: 'bbl' }),
      oil_per_cycle_day: q(e.oilPerCycleDay, { unit: 'bbl/d' }),
      sor: q(e.sor),
      kwh_per_bbl: q(e.kwhPerBbl, { unit: 'kWh/bbl' }),
      failure_risk: q(e.risk, { assumed: true }),
      net_inr_per_day: q(e.net, { lo: u.netLo, hi: u.netHi, unit: '₹/day', assumed: true }),
    },
    fmi_p90: { value: e.fmiMinP90, depth_m: p.fmiMinDepthM },
  };
  if (label !== 'CURRENT') s.explanation = explain(p, e, cur, u, ev);
  return s;
}

function explain(p: WellParams, e: CycleEval, cur: CycleEval, u: ReturnType<typeof cycleUncertainty>, ev: string): Explanation {
  const what: string[] = [];
  const d = e.design, c = cur.design;
  if (d.steamT !== c.steamT) what.push(`Steam ${c.steamT.toLocaleString('en-IN')} → ${d.steamT.toLocaleString('en-IN')} t`);
  if (d.soakD !== c.soakD) what.push(`Soak ${c.soakD} → ${d.soakD} d`);
  if (d.injKsc !== c.injKsc) what.push(`Injection pressure ${c.injKsc} → ${d.injKsc} ksc`);
  if (d.stroke !== c.stroke) what.push(`Stroke ${c.stroke} → ${d.stroke} in`);
  what.push(`${planSummary(cur)} → ${planSummary(e)}`);
  what.push(`Re-steam at day ${u.p10}–${u.p90} (P50 ${e.cutoffDay}) instead of day ${PRACTICE_CUTOFF_DAY}`);

  const dominant = Object.entries(e.limitShare).sort((a, b) => b[1] - a[1])[0];
  const why: string[] = [];
  if (dominant[0] === 'INFLOW')
    why.push(`The well is inflow-limited for ${(dominant[1] * 100).toFixed(0)}% of the cycle, so pump speed above what the reservoir delivers adds no oil.`);
  else why.push(`The binding limit is ${dominant[0].toLowerCase()} for ${(dominant[1] * 100).toFixed(0)}% of the cycle.`);
  if (e.plan.length > 1) why.push('The plan runs fast only while the well is hot, then slows as the tubing fluid cools and viscosity rises, keeping the float margin above the limit.');
  if (cur.floatFromDay !== null) why.push(`At a fixed ${cur.plan[0].vfd_hz} Hz the rods would start to float around day ${cur.floatFromDay}.`);
  if (d.steamT < c.steamT) why.push('Less steam loses little oil because the heated-zone response flattens at higher tonnage.');
  if (d.steamT > c.steamT) why.push('More steam enlarges the heated zone and lifts the early, pump-limited rate.');

  const delta = e.net - cur.net;
  return {
    what,
    why: why.join(' '),
    driver: cur.floatFromDay !== null ? 'float margin as the tubing fluid cools' : dominant[0] === 'INFLOW' ? 'inflow-limited operation' : `${dominant[0].toLowerCase()} limit`,
    governing_relation: 'q = min(inflow, pump, float, fatigue, torque); FMI = 1 − k·r(μ)·v, v ∝ stroke × SPM',
    binding_limit: `${dominant[0]} for ${(dominant[1] * 100).toFixed(0)}% of the cycle; P90 FMI_min ${e.fmiMinP90.toFixed(2)} vs ${FMI_LIMIT}`,
    inr_effect: pred(delta, ev, { lo: u.netLo - cur.net, hi: u.netHi - cur.net, unit: '₹/day', assumed: true }),
    confidence: confidenceOf(e.net, u.netLo, u.netHi),
    cycle_context: `Applies to cycle ${p.cycleNo + 1}; the well is now in cycle ${p.cycleNo}, production day ${p.day}.`,
  };
}

function gate(p: WellParams, e: CycleEval, req: OptimizationRequest, label: StrategyLabel) {
  const checks: GateCheck[] = [];
  const add = (check: string, status: GateCheck['status'], detail: string) => checks.push({ check, status, detail });
  const d = e.design;
  const within = d.steamT >= STEAM_MIN && d.steamT <= req.steam_available_t && d.soakD >= reg('limits.soak_d_min') && d.soakD <= reg('limits.soak_d_max');
  const fast = e.hzMaxUsed >= 0.95 * HZ_MAX;
  add('Operating limits', within ? (fast ? 'WARN' : 'PASS') : 'FAIL',
    within ? (fast ? `plan reaches ${e.hzMaxUsed} Hz, within 5% of the ${HZ_MAX} Hz maximum` : 'steam, soak and speed inside the constraint set') : 'a variable is outside the constraint set');
  const rodStatus: GateCheck['status'] = e.fmiMinP90 < FMI_LIMIT || e.srMax > SR_LIMIT || e.fillageMin < FILLAGE_MIN ? 'FAIL'
    : e.fmiMinP90 < FMI_LIMIT * 1.1 || e.srMax >= 0.9 * SR_LIMIT ? 'WARN' : 'PASS';
  add('Rod & equipment', rodStatus,
    `P90 FMI_min ${e.fmiMinP90.toFixed(2)} at day ${e.fmiMinDay} (limit ${FMI_LIMIT}) · Goodman ${e.srMax.toFixed(2)} (limit ${SR_LIMIT}) · fillage ≥ ${e.fillageMin.toFixed(2)}`);
  add('Injection pressure', d.injKsc > KSC_MAX ? 'FAIL' : d.injKsc >= 0.95 * KSC_MAX ? 'WARN' : 'PASS', `${d.injKsc} ksc vs ${KSC_MAX} ksc limit`);
  add('Physics validity', 'PASS', 'rates ≥ 0, fillage within [0, 1], operating point converged');
  const ood = wellState(p.id).ood;
  add('Out of distribution', ood.flag ? 'FAIL' : e.hzMaxUsed > TRAINED_HZ_MAX ? 'WARN' : 'PASS',
    ood.flag ? ood.detail ?? 'well is OOD' : e.hzMaxUsed > TRAINED_HZ_MAX ? `plan uses ${e.hzMaxUsed} Hz; trained up to ${TRAINED_HZ_MAX} Hz` : `score ${ood.score.toFixed(2)}`);
  const hi = e.risk * 1.3;
  add('Risk threshold', hi > req.max_failure_risk ? 'FAIL' : e.risk > 0.75 * req.max_failure_risk ? 'WARN' : 'PASS',
    `mean 30-day risk ${(e.risk * 100).toFixed(0)}% (upper ${(hi * 100).toFixed(0)}%) vs ${(req.max_failure_risk * 100).toFixed(0)}%`);
  const verdict: GateVerdict = checks.some((c) => c.status === 'FAIL') ? 'REJECTED'
    : checks.some((c) => c.status === 'WARN') ? 'HUMAN_REVIEW_REQUIRED' : 'APPROVED_FOR_REVIEW';
  void label;
  return { verdict, checks };
}

function sanity(p: WellParams, req: OptimizationRequest, grid: Design[], results: Record<Preset, CycleEval>[],
  picks: Record<string, CycleEval | undefined>, cur: CycleEval): SanityFlag[] {
  const flags: SanityFlag[] = [];
  for (const [label, e] of Object.entries(picks)) {
    if (!e) continue;
    const L = label as StrategyLabel;
    if (e.design.steamT >= req.steam_available_t)
      flags.push({ code: 'ON_BOUND', severity: 'INFO', strategy: L, detail: `steam = steam available (${req.steam_available_t.toLocaleString('en-IN')} t); more steam might raise it further` });
    if (e.design.steamT <= STEAM_MIN)
      flags.push({ code: 'ON_BOUND', severity: 'INFO', strategy: L, detail: `steam at the ${STEAM_MIN} t minimum` });
    if (e.design.soakD === reg('limits.soak_d_min') || e.design.soakD === reg('limits.soak_d_max'))
      flags.push({ code: 'ON_BOUND', severity: 'INFO', strategy: L, detail: `soak at the ${e.design.soakD} d bound of the constraint set` });
    const atMin = e.plan.filter((b) => b.vfd_hz === HZ_MIN).reduce((s, b) => s + b.to_day - b.from_day + 1, 0);
    if (atMin > 0.5 * (e.cutoffDay + 1))
      flags.push({ code: 'ON_BOUND', severity: 'INFO', strategy: L, detail: `the SRP plan spends ${((atMin / (e.cutoffDay + 1)) * 100).toFixed(0)}% of the cycle at the ${HZ_MIN} Hz minimum` });
  }
  // dead decision: injection pressure for the balanced design
  const bal = picks.BALANCED;
  if (bal) {
    const same = results.map((r) => r.balanced).filter((e) => e.design.steamT === bal.design.steamT && e.design.soakD === bal.design.soakD && e.design.stroke === bal.design.stroke);
    const nets = same.map((e) => e.net);
    const spread = (Math.max(...nets) - Math.min(...nets)) / Math.abs(bal.net);
    if (spread < 0.005)
      flags.push({ code: 'DEAD_DECISION', severity: 'WARN', detail: `injection pressure changes net ₹/day by only ${(spread * 100).toFixed(2)}% across 86–96 ksc; the model may be missing that physics` });
    if (bal.net > cur.net * 1.3)
      flags.push({ code: 'IMPLAUSIBLE_GAIN', severity: 'FAIL', strategy: 'BALANCED', detail: `balanced net ₹/day is ${(((bal.net - cur.net) / cur.net) * 100).toFixed(0)}% above current practice` });
  }
  const maxSor = Math.max(...results.map((r) => r.balanced.sor));
  if (maxSor < req.max_sor)
    flags.push({ code: 'NEVER_BINDS', severity: 'INFO', detail: `the SOR limit (${req.max_sor}) never binds; highest SOR in the grid is ${maxSor.toFixed(2)}` });
  void grid; void p;
  return flags;
}

export function getOptimization(runId: string): OptimizationRun | undefined {
  const s = runs.get(runId);
  return s ? structuredClone(s.run) : undefined;
}

export function latestRunFor(wellId: string): OptimizationRun | undefined {
  const all = [...runs.values()].filter((r) => r.run.well_id === wellId);
  return all.length ? structuredClone(all[all.length - 1].run) : undefined;
}

// ---- recommendations ---------------------------------------------------------------------------
export function listRecommendations(wellId?: string): Recommendation[] {
  return structuredClone(recommendations.filter((r) => !wellId || r.well_id === wellId).reverse());
}

export interface DecisionRequest { decision: DecisionKind; reason?: string; comment?: string; review_note?: string }

/** Decision rules (system-design §5.10, §13.2). The UI enforces the same rules. */
export function decisionError(r: Pick<Recommendation, 'verdict' | 'trust'>, d: DecisionRequest): string | null {
  if (r.verdict === 'REJECTED') return 'Rejected strategies cannot be decided on.';
  if (d.decision === 'REJECTED' && (!d.reason || !d.comment?.trim())) return 'A reject needs a reason and a comment.';
  if (d.decision === 'APPROVED' && r.trust === 'LOW' && !d.review_note?.trim()) return 'LOW trust: write a review note before approving.';
  return null;
}

export function decide(recId: string, d: DecisionRequest): Recommendation {
  const r = recommendations.find((x) => x.recommendation_id === recId);
  if (!r) throw new Error('recommendation not found');
  const err = decisionError(r, d);
  if (err) throw new Error(err);
  Object.assign(r, { status: d.decision, reason: d.reason, comment: d.comment, review_note: d.review_note });
  return structuredClone(r);
}
