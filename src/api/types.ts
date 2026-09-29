// Mirrors system-design.md §5. Keep field names identical to the API contract
// so the mock layer can be swapped for openapi-fetch without touching screens.

export type Provenance = 'FIELD' | 'SIMULATED' | 'DERIVED' | 'PREDICTED' | 'BACKTESTED' | 'FIELD_VALIDATED';
export type Computed = 'DERIVED' | 'PREDICTED' | 'BACKTESTED' | 'FIELD_VALIDATED';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type EvidenceLabel = 'PS' | 'OIL' | 'LITERATURE' | 'ASSUMED' | 'DEMO';

interface QuantityBase {
  value: number;
  lo?: number;
  hi?: number;
  unit?: string;
  confidence?: Confidence;
  /** true when the value depends on an ASSUMED or unverified registry parameter */
  assumed?: boolean;
}
/** Computed values must carry an evidence id (Evidence Lock, FR-31). */
export type Quantity =
  | (QuantityBase & { provenance: 'FIELD' | 'SIMULATED'; evidence_id?: string })
  | (QuantityBase & { provenance: Computed; evidence_id: string });

export type LimitName = 'INFLOW' | 'PUMP' | 'FLOAT' | 'FATIGUE' | 'TORQUE';
export type Phase = 'INJECTION' | 'SOAK' | 'PRODUCTION';
export type TrustStatus = 'GREEN' | 'AMBER' | 'RED';

export interface TrustFactor { factor: string; status: TrustStatus; detail?: string }
export interface Trust { level: Confidence; factors: TrustFactor[] }

export interface FieldKpis {
  data_mode: 'SIMULATED' | 'FIELD';
  operating_wells: Quantity;
  total_oil_bopd: Quantity;
  steam_today_t: Quantity;
  injecting_wells: number;
  avg_cycle_sor: Quantity;
  kwh_per_bbl: Quantity;
  high_risk_wells: number;
  resteams_due_30d: number;
  by_bottleneck: Record<LimitName, number>;
}

export interface WellSummary {
  well_id: string;
  cycle_no: number;
  phase: Phase;
  production_day: number;
  oil_bopd: Quantity;
  oil_delta_7d_pct: number;
  active: LimitName;
  next: LimitName;
  fmi_min: Quantity;
  fmi_min_depth_m: number;
  risk_30d: Quantity;
  risk_by_mode: Record<FailureMode, number>;
  top_mode: FailureMode;
  goodman_sr: number;
  fillage: number;
  resteam_p50_day: number | null;
  days_to_resteam: number | null;
  trust: Confidence;
  dq_score: number;
  ood: boolean;
  pending_recs: number;
}

export type FailureMode = 'ROD_FAILURE' | 'PUMP_UNSETTING' | 'PUMP_FAILURE';

export interface WellState {
  well_id: string;
  as_of: string;
  data_mode: 'SIMULATED' | 'FIELD';
  cycle: { cycle_no: number; phase: Phase; production_day: number };
  measured: {
    oil_rate: Quantity; fluid_rate: Quantity; vfd_hz: Quantity; spm: Quantity; stroke_in: Quantity;
    wellhead_temp_c: Quantity; kwh_per_bbl: Quantity;
  };
  estimated: { t_nwb_c: Quantity; viscosity_cp: Quantity; pip_psi: Quantity; fillage: Quantity };
  indicators: {
    fmi_min: Quantity & { depth_m: number; limit: number };
    goodman_sr_max: Quantity & { limit: number; section: number };
    impact_index: Quantity;
    sor_projected: Quantity;
  };
  risk_30d: { any: Quantity; by_mode: Record<FailureMode, number> };
  dq: { score: number; flags: string[] };
  ood: { flag: boolean; score: number; threshold: number; detail?: string };
  trust: Trust;
}

export interface RodSection {
  section: number; grade: string; diameter_in: number; from_m: number; to_m: number;
  goodman_sr: number; damage_cum: number;
}
export interface RodProfile {
  well_id: string; vfd_hz: number; spm: number; stroke_in: number;
  depth_m: number[]; temp_c: number[]; mu_cp: number[]; fmi: number[];
  fmi_min: number; fmi_min_depth_m: number; fmi_limit: number;
  goodman_limit: number;
  sections: RodSection[]; impact_index: number;
  provenance: Computed; evidence_id: string;
}

export interface Lever {
  lever: 'VFD_HZ' | 'STROKE' | 'RESTEAM_TIMING' | 'STEAM_DESIGN';
  change: string;
  d_inr_per_day: number;
  basis: 'DAILY' | 'CYCLE_AVG';
  d_oil_bopd?: number;
  effects?: string;
  gate: 'PASS' | 'WARN' | 'FAIL';
  gate_detail?: string;
}
export interface Bottleneck {
  well_id: string;
  limits: { name: LimitName; q_bfpd: number; basis: string }[];
  active: LimitName; next: LimitName;
  shadow_price: { inr_per_day_per_unit: number; unit: string; inr_per_day_at_10pct: number; capped_by_next: boolean };
  levers: Lever[];
  note?: string;
  provenance: Computed; evidence_id: string;
}
export interface BottleneckSpan { from_day: number; to_day: number; active: LimitName; forecast: boolean }

export interface ResteamWindow {
  well_id: string; cycle_no: number; production_day: number;
  window: { p10_day: number; p50_day: number; p90_day: number; p50_date: string };
  pi_now: Quantity; pi_bar_star: Quantity;
  curve: { day: number[]; p10: number[]; p50: number[]; p90: number[] };
  current_practice_cutoff_day: number;
  evidence_id: string;
}

export interface SeriesPoint { day: number; value: number; lo?: number; hi?: number }
export interface ProductionSeries {
  well_id: string; unit: string;
  history: SeriesPoint[]; forecast: SeriesPoint[];
  evidence_id: string;
}

export interface LedgerEntry {
  day: number; predicted: number; lo: number; hi: number; actual: number; in_interval: boolean;
}

export interface EvidenceRecord {
  evidence_id: string;
  kind: 'STATE' | 'FORECAST' | 'ROD_PROFILE' | 'NAVIGATOR' | 'SCENARIO' | 'STRATEGY' | 'GATE' | 'BACKTEST' | 'FIELD';
  function: string;
  code_version: string;
  inputs_hash: string;
  data_snapshot_ref: string;
  registry_version: string;
  parameters_used: { key: string; label: EvidenceLabel; verify: boolean }[];
  model_versions: Record<string, string>;
  run_id?: string;
  created_at: string;
}

// ---- Scenario Lab -------------------------------------------------------------
export interface WellDesign { cycle_no: number; steam_t: number; inj_pressure_ksc: number; soak_d: number; stroke_in: number; vfd_hz: number; practice_cutoff_day: number }
export interface ScenarioInput {
  name: string;
  steam_t: number;
  inj_pressure_ksc: number;
  soak_d: number;
  vfd_hz: number;
  stroke_in: number;
}
export interface ScenarioFlag { type: 'OUTSIDE_TRAINING_RANGE' | 'HARD_LIMIT' | 'FLOAT_MARGIN'; param: keyof ScenarioInput; detail: string }
export interface ScenarioResult {
  name: string;
  derived: { spm: number; inj_d: number; resteam_p50_day: number; cycle_days: number };
  kpis: {
    cycle_oil_bbl: Quantity; oil_per_cycle_day: Quantity; sor: Quantity; kwh_per_bbl: Quantity;
    failure_risk: Quantity; fmi_min_p90: Quantity; net_inr_per_day: Quantity;
  };
  confidence: Confidence;
  flags: ScenarioFlag[];
  blocked: boolean;
  plan: SrpBlock[];
  trajectory: { day: number[]; oil: number[]; fmi: number[]; hz: number[] };
}

// ---- Optimization -----------------------------------------------------------
export type StrategyLabel = 'PRODUCTION' | 'BALANCED' | 'ENERGY' | 'RELIABILITY' | 'CURRENT';
export type GateVerdict = 'APPROVED_FOR_REVIEW' | 'HUMAN_REVIEW_REQUIRED' | 'REJECTED';
export interface GateCheck { check: string; status: 'PASS' | 'WARN' | 'FAIL'; detail: string }
export interface SrpBlock { from_day: number; to_day: number; vfd_hz: number; spm: number }
export interface Explanation {
  what: string[]; why: string; driver: string; governing_relation: string;
  binding_limit: string; inr_effect: Quantity; confidence: Confidence; cycle_context: string;
}
export interface Strategy {
  strategy_id: string;
  label: StrategyLabel;
  parameters: { steam_t: number; inj_pressure_ksc: number; soak_d: number; stroke_in: number };
  srp_plan: SrpBlock[];
  resteam_window: { p10_day: number; p50_day: number; p90_day: number; basis?: string };
  kpis: {
    cycle_oil_bbl: Quantity; oil_per_cycle_day: Quantity; sor: Quantity; kwh_per_bbl: Quantity;
    failure_risk: Quantity; net_inr_per_day: Quantity;
  };
  fmi_p90: { value: number; depth_m: number };
  gate?: { verdict: GateVerdict; checks: GateCheck[] };
  trust?: Trust;
  explanation?: Explanation;
  recommendation_id?: string;
}
export interface SanityFlag { code: string; severity: 'INFO' | 'WARN' | 'FAIL'; strategy?: StrategyLabel; detail: string }
export interface ParetoPoint { net: number; oil: number; kwh: number; risk: number; front: boolean }
export interface OptimizationRequest {
  well_id: string; scope: 'CSS_AND_SRP' | 'SRP_ONLY'; steam_available_t: number;
  objective: 'production' | 'balanced' | 'energy' | 'reliability'; max_sor: number; max_failure_risk: number;
}
export interface OptimizationRun {
  run_id: string; well_id: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'BLOCKED_OOD' | 'FAILED';
  generation: number; of: number;
  request: OptimizationRequest;
  versions: Record<string, string>;
  sanity_flags: SanityFlag[];
  current?: Strategy;
  strategies: Strategy[];
  pareto: ParetoPoint[];
}

export type DecisionKind = 'APPROVED' | 'REJECTED' | 'DEFERRED';
export interface Recommendation {
  recommendation_id: string; well_id: string; run_id: string; strategy: StrategyLabel;
  created_day: number; trust: Confidence; verdict: GateVerdict;
  status: 'PENDING' | 'EXPIRED' | DecisionKind; net_inr_per_day: number; reason?: string; comment?: string; review_note?: string;
}
