// API surface used by screens. Today it is backed by the in-browser mock
// (src/mocks). When the FastAPI backend exists, replace each body with an
// openapi-fetch call to the path noted beside it — the types stay the same.
import type {
  Bottleneck, BottleneckSpan, EvidenceRecord, FieldKpis, LedgerEntry, OptimizationRequest, OptimizationRun,
  ProductionSeries, Recommendation, ResteamWindow, RodProfile, ScenarioResult, WellDesign, WellState, WellSummary,
} from './types';
import * as server from '@/mocks/server';
import * as opt from '@/mocks/optimizer';
import { resolveEvidence } from '@/mocks/evidence';
import { advance, clockOffset, getLedger } from '@/mocks/state';

const latency = (ms = 180) => new Promise((r) => setTimeout(r, ms + Math.random() * 120));
async function call<T>(fn: () => T, ms?: number): Promise<T> {
  await latency(ms);
  return fn();
}

export const api = {
  fieldKpis: (): Promise<FieldKpis> => call(server.fieldKpis), //                   GET /api/field/kpis
  wells: (): Promise<WellSummary[]> => call(server.wellSummaries), //              GET /api/wells
  wellState: (id: string): Promise<WellState> => call(() => server.wellState(id)), // GET /api/wells/{id}/state
  rodProfile: (id: string, hz?: number): Promise<RodProfile> => call(() => server.rodProfile(id, hz), 90), // GET /api/wells/{id}/rod-profile
  bottleneck: (id: string): Promise<Bottleneck> => call(() => server.bottleneckFor(id)), // GET /api/wells/{id}/bottleneck
  bottleneckHistory: (id: string): Promise<BottleneckSpan[]> => call(() => server.bottleneckHistory(id)), // …/bottleneck/history
  resteamWindow: (id: string): Promise<ResteamWindow> => call(() => server.resteam(id)), // GET /api/wells/{id}/resteam-window
  production: (id: string): Promise<ProductionSeries> => call(() => server.productionSeries(id)), // …/production/forecast
  ledger: (id: string): Promise<LedgerEntry[]> => call(() => getLedger(id)), //    GET /api/ledger/{id}
  evidence: (eid: string): Promise<EvidenceRecord> => call(() => {
    const r = resolveEvidence(eid);
    if (!r) throw new Error(`evidence ${eid} not found`);
    return r;
  }, 60), //                                                                       GET /api/evidence/{id}
  wellDesign: (id: string): Promise<WellDesign> => call(() => opt.wellDesign(id), 60), // GET /api/wells/{id} (current cycle design)
  scenarios: (req: opt.ScenarioRequest): Promise<ScenarioResult[]> => call(() => opt.runScenarios(req), 350), // POST /api/simulation/scenario
  startOptimization: (req: OptimizationRequest): Promise<OptimizationRun> => call(() => opt.startOptimization(req)), // POST /api/optimization/run
  optimization: (runId: string): Promise<OptimizationRun> => call(() => {
    const r = opt.getOptimization(runId);
    if (!r) throw new Error(`run ${runId} not found`);
    return r;
  }, 40), //                                                                       GET /api/optimization/{run_id}
  latestRun: (wellId: string): Promise<OptimizationRun | null> => call(() => opt.latestRunFor(wellId) ?? null, 40),
  recommendations: (wellId?: string): Promise<Recommendation[]> => call(() => opt.listRecommendations(wellId)), // GET /api/recommendations
  decide: (recId: string, d: opt.DecisionRequest): Promise<Recommendation> => call(() => opt.decide(recId, d)), // POST …/{id}/decision
  /** dev only: POST /api/dev/advance-time */
  advanceTime: (days: number): Promise<number> => call(() => { advance(days); return clockOffset(); }, 250),
  clock: (): Promise<number> => call(() => clockOffset(), 0),
};

export type { ScenarioRequest, DecisionRequest } from '@/mocks/optimizer';
export { decisionError } from '@/mocks/optimizer';
