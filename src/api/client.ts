// API surface used by screens. Two transports, same types:
//  - live: the FastAPI backend (../backend) over HTTP, paths as in system-design §5;
//  - mock: the in-browser twin (src/mocks) when no backend answers /api/health.
// The mode is chosen once at start-up, so recommendations and the audit log never
// mix between the two stores.
import type {
  AuditReport, BacktestRun, Bottleneck, BottleneckSpan, ConstraintSet, CycleRecord, DQSeries, DQWell, EvidenceRecord,
  FieldKpis, LedgerEntry, ModelHealth, OptimizationRequest, OptimizationRun, ProductionSeries, Recommendation,
  RegistryReport, ResteamWindow, RodProfile, ScenarioResult, ThermalForecast, WellDesign, WellSnapshot, WellState,
  WellSummary,
} from './types';
import * as server from '@/mocks/server';
import * as opt from '@/mocks/optimizer';
import * as extras from '@/mocks/extras';
import { resolveEvidence } from '@/mocks/evidence';
import { advance, auditReport, clockOffset, getLedger } from '@/mocks/state';

export type Mode = 'live' | 'mock';
let mode: Mode = 'mock';
export const apiMode = () => mode;

export type Role = 'viewer' | 'engineer' | 'admin';
let role: Role = 'engineer';
/** Demo role switch (no auth in R0). The backend enforces it from the X-Role header. */
export const setApiRole = (r: Role) => { role = r; };

/** Probe the backend once; `?mock=1` in the URL forces the browser twin. */
export async function detectMode(): Promise<Mode> {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mock')) return (mode = 'mock');
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 900);
    const r = await fetch('/api/health', { signal: ctl.signal });
    clearTimeout(timer);
    const body = r.ok ? await r.json() : null;
    mode = body?.status === 'ok' ? 'live' : 'mock';
  } catch {
    mode = 'mock';
  }
  return mode;
}

const latency = (ms = 180) => new Promise((r) => setTimeout(r, ms + Math.random() * 120));
async function mockCall<T>(fn: () => T, ms?: number): Promise<T> {
  await latency(ms);
  return fn();
}

async function http<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const r = await fetch('/api' + path, {
    method,
    headers: { 'X-Role': role, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    let detail = `${r.status} ${r.statusText}`;
    try { const j = await r.json(); if (j?.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail); } catch { /* keep status */ }
    throw new Error(detail);
  }
  return r.json() as Promise<T>;
}

const qs = (o: Record<string, string | number | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? '?' + p.join('&') : '';
};

/** Pick the transport per call: `live` path, or the `mock` function. */
function route<T>(live: () => Promise<T>, mock: () => T, ms?: number): Promise<T> {
  return mode === 'live' ? live() : mockCall(mock, ms);
}
const must = <T,>(v: T | undefined, what: string): T => { if (v === undefined) throw new Error(`${what} not found`); return v; };

export const api = {
  fieldKpis: (): Promise<FieldKpis> => route(() => http('GET', '/field/kpis'), server.fieldKpis),
  wells: (): Promise<WellSummary[]> => route(() => http('GET', '/wells'), server.wellSummaries),
  wellState: (id: string): Promise<WellState> => route(() => http('GET', `/wells/${id}/state`), () => server.wellState(id)),
  rodProfile: (id: string, hz?: number): Promise<RodProfile> =>
    route(() => http('GET', `/wells/${id}/rod-profile${qs({ hz })}`), () => server.rodProfile(id, hz), 90),
  bottleneck: (id: string): Promise<Bottleneck> => route(() => http('GET', `/wells/${id}/bottleneck`), () => server.bottleneckFor(id)),
  bottleneckHistory: (id: string): Promise<BottleneckSpan[]> =>
    route(() => http('GET', `/wells/${id}/bottleneck/history`), () => server.bottleneckHistory(id)),
  resteamWindow: (id: string): Promise<ResteamWindow> => route(() => http('GET', `/wells/${id}/resteam-window`), () => server.resteam(id)),
  production: (id: string): Promise<ProductionSeries> =>
    route(() => http('GET', `/wells/${id}/production/forecast`), () => server.productionSeries(id)),
  ledger: (id: string): Promise<LedgerEntry[]> => route(() => http('GET', `/ledger/${id}`), () => getLedger(id)),
  evidence: (eid: string): Promise<EvidenceRecord> =>
    route(() => http('GET', `/evidence/${eid}`), () => must(resolveEvidence(eid), `evidence ${eid}`), 60),
  wellDesign: (id: string): Promise<WellDesign> => route(() => http('GET', `/wells/${id}/design`), () => opt.wellDesign(id), 60),
  scenarios: (req: opt.ScenarioRequest): Promise<ScenarioResult[]> =>
    route(() => http('POST', '/simulation/scenario', req), () => opt.runScenarios(req), 350),
  startOptimization: (req: OptimizationRequest): Promise<OptimizationRun> =>
    route(() => http('POST', '/optimization/run', req), () => opt.startOptimization(req)),
  optimization: (runId: string): Promise<OptimizationRun> =>
    route(() => http('GET', `/optimization/${runId}`), () => must(opt.getOptimization(runId), `run ${runId}`), 40),
  latestRun: (wellId: string): Promise<OptimizationRun | null> =>
    route(() => http('GET', `/wells/${wellId}/optimization/latest`), () => opt.latestRunFor(wellId) ?? null, 40),
  recommendations: (wellId?: string): Promise<Recommendation[]> =>
    route(() => http('GET', `/recommendations${qs({ well_id: wellId })}`), () => opt.listRecommendations(wellId)),
  decide: (recId: string, d: opt.DecisionRequest): Promise<Recommendation> =>
    route(() => http('POST', `/recommendations/${recId}/decision`, d), () => opt.decide(recId, d)),
  /** dev only: moves the simulated clock for every well */
  advanceTime: (days: number): Promise<number> =>
    route(async () => (await http<{ offset: number }>('POST', '/dev/advance-time', { days })).offset, () => { advance(days); return clockOffset(); }, 250),
  clock: (): Promise<number> => route(async () => (await http<{ offset: number }>('GET', '/dev/clock')).offset, () => clockOffset(), 0),

  // v3
  snapshot: (id: string, day?: number, hz?: number): Promise<WellSnapshot> =>
    route(() => http('GET', `/wells/${id}/snapshot${qs({ day, hz })}`), () => extras.wellSnapshot(id, day, hz), 30),
  thermal: (id: string): Promise<ThermalForecast> => route(() => http('GET', `/wells/${id}/thermal`), () => extras.thermalForecast(id)),
  cycles: (id: string): Promise<CycleRecord[]> => route(() => http('GET', `/wells/${id}/cycles`), () => extras.cycleHistory(id)),
  startBacktest: (): Promise<BacktestRun> => route(() => http('POST', '/backtests/run', {}), extras.startBacktest),
  backtest: (id: string): Promise<BacktestRun> =>
    route(() => http('GET', `/backtests/${id}`), () => must(extras.getBacktest(id), `backtest ${id}`), 40),
  latestBacktest: (): Promise<BacktestRun | null> => route(() => http('GET', '/backtests/latest'), extras.latestBacktest, 40),
  dataQuality: (): Promise<DQWell[]> => route(() => http('GET', '/data-quality'), extras.dataQuality),
  dqSeries: (id: string): Promise<DQSeries> => route(() => http('GET', `/data-quality/${id}/series`), () => extras.dqSeries(id)),
  modelHealth: (): Promise<ModelHealth> => route(() => http('GET', '/models/health'), extras.modelHealth),
  registry: (): Promise<RegistryReport> => route(() => http('GET', '/admin/registry'), extras.registryReport),
  constraints: (): Promise<ConstraintSet> => route(() => http('GET', '/admin/constraints'), extras.constraintSet),
  audit: (): Promise<AuditReport> => route(() => http('GET', '/audit'), auditReport),
};

export type { ScenarioRequest, DecisionRequest } from '@/mocks/optimizer';
export { decisionError } from '@/mocks/optimizer';
