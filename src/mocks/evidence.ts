// Evidence Lock (system-design §14.1), mock side: every computation registers a
// record and hands back its id; the UI resolves ids through the API.
import type { EvidenceRecord } from '@/api/types';
import { REG, REGISTRY_VERSION, RegKey } from './registry';
import { hash } from './model';

type Kind = EvidenceRecord['kind'];

const FUNCTIONS: Record<string, { kind: Kind; fn: string; params: RegKey[]; models?: string[] }> = {
  state: { kind: 'STATE', fn: 'mock.state_estimation.estimate', params: ['fluid.mu_at_50c_cp', 'fluid.walther_B', 'reservoir.temperature_c'] },
  energy: { kind: 'STATE', fn: 'mock.physics.surface.energy_intensity', params: [] },
  rods: { kind: 'ROD_PROFILE', fn: 'mock.physics.srp.fmi_profile', params: ['fluid.mu_at_50c_cp', 'fluid.walther_B', 'srp.pump_depth_m', 'limits.fmi_min', 'limits.goodman_sr'] },
  navigator: { kind: 'NAVIGATOR', fn: 'mock.navigator.rate_limits', params: ['limits.fmi_min', 'limits.goodman_sr', 'econ.oil_netback_inr', 'econ.power_inr_per_kwh', 'econ.failure_cost_inr', 'srp.k_gear_spm_per_hz'] },
  risk: { kind: 'FORECAST', fn: 'mock.ml.failure.survival_hazard', params: ['limits.fmi_min', 'econ.failure_cost_inr'], models: ['D'] },
  resteam: { kind: 'FORECAST', fn: 'mock.optimizer.cutoff.optimal_stopping', params: ['econ.oil_netback_inr', 'econ.steam_inr_per_t', 'econ.power_inr_per_kwh', 'econ.failure_cost_inr', 'econ.mobilization_inr', 'steam.rate_t_per_h'], models: ['A', 'D'] },
  forecast: { kind: 'FORECAST', fn: 'mock.ml.production.forecast', params: ['fluid.walther_B'], models: ['A'] },
  sor: { kind: 'FORECAST', fn: 'mock.physics.surface.cycle_sor', params: ['steam.rate_t_per_h'], models: ['A'] },
  scenario: { kind: 'SCENARIO', fn: 'mock.simulation.evaluate_cycle', params: ['steam.quality', 'steam.rate_t_per_h', 'fluid.walther_B', 'econ.oil_netback_inr', 'econ.steam_inr_per_t', 'econ.power_inr_per_kwh', 'econ.failure_cost_inr', 'limits.fmi_min'], models: ['A', 'D'] },
  strategy: { kind: 'STRATEGY', fn: 'mock.optimizer.grid.evaluate_design', params: ['steam.quality', 'steam.rate_t_per_h', 'fluid.walther_B', 'econ.oil_netback_inr', 'econ.steam_inr_per_t', 'econ.power_inr_per_kwh', 'econ.failure_cost_inr', 'econ.mobilization_inr', 'limits.fmi_min', 'limits.goodman_sr'], models: ['A', 'D'] },
  field: { kind: 'FIELD', fn: 'mock.field.aggregate_kpis', params: ['field.operating_wells', 'steam.rate_t_per_h'] },
};

export const CODE_VERSION = 'mock-0.1.0';
export const MODEL_VERSIONS: Record<string, string> = { A: 'a-mock-2026.09.30', D: 'd-mock-2026.09.30' };

const store = new Map<string, EvidenceRecord>();

/** Register a computation and return its evidence id (deterministic per inputs). */
export function evidence(key: keyof typeof FUNCTIONS, snapshot: string, inputs: unknown = null, runId?: string): string {
  const f = FUNCTIONS[key];
  const inputsJson = JSON.stringify(inputs);
  const id = 'ev_' + hash(`${key}|${snapshot}|${inputsJson}|${runId ?? ''}`).toString(36);
  if (!store.has(id)) {
    store.set(id, {
      evidence_id: id,
      kind: f.kind,
      function: f.fn,
      code_version: CODE_VERSION,
      inputs_hash: 'sha:' + hash(inputsJson + snapshot).toString(16).padStart(8, '0'),
      data_snapshot_ref: snapshot,
      registry_version: REGISTRY_VERSION,
      parameters_used: f.params.map((k) => ({ key: k, label: REG[k].label, verify: 'verify' in REG[k] ? Boolean(REG[k].verify) : false })),
      model_versions: Object.fromEntries((f.models ?? []).map((m) => [m, MODEL_VERSIONS[m]])),
      run_id: runId,
      created_at: new Date().toISOString(),
    });
  }
  return id;
}

export const resolveEvidence = (id: string) => store.get(id);

/** true when any parameter behind this evidence is ASSUMED or awaiting verification */
export function isAssumed(id: string): boolean {
  const r = store.get(id);
  return !!r?.parameters_used.some((p) => p.label === 'ASSUMED' || p.verify);
}
