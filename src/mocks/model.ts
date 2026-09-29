// Mock "twin": a deliberately small version of the system-design §7 physics so
// every number in the UI is computed, not typed. Illustrative only — it stands
// in for the backend until the API exists. All values are SIMULATED.
import type { LimitName, Phase, FailureMode } from '@/api/types';
import { reg } from './registry';

export interface WellParams {
  id: string;
  cycleNo: number;
  phase: Phase;
  /** production day "now" (0 when injecting or soaking) */
  day: number;
  /** oil deliverability: harmonic decline + hot flush term (bbl/d) */
  qi: number; D: number; flushAmp: number; flushTau: number;
  /** near-wellbore temperature decay after soak (°C, days) */
  T0: number; tau: number;
  oilFrac: number;
  /** pump displacement × volumetric efficiency at 45 Hz and the current stroke (bbl/d fluid) */
  pumpCap45: number;
  hz: number; stroke: number;
  /** speed the well runs at when not float-limited (defaults to hz) */
  hzNominal?: number;
  /** float coefficient: FMI = 1 − kFmi · r(t) · (hz/45) · (stroke/stroke₀) */
  kFmi: number;
  /** Goodman stress ratio (worst section) at 45 Hz, current stroke, 60 °C at the pump */
  sr0: number;
  fatigueBase: number; torqueBase: number;
  /** 30-day failure risk at FMI = 0.22 and SR = sr0, and its split across modes */
  risk0: number; modeSplit: Record<FailureMode, number>;
  kwhPerDay45: number;
  steamT: number; injKsc: number; soakD: number;
  fmiMinDepthM: number;
  /** day within injection or soak, for non-producing wells */
  phaseDay?: number;
}

export interface Srp { hz: number; stroke: number }
export const srpOf = (p: WellParams): Srp => ({ hz: p.hz, stroke: p.stroke });

// ---- viscosity (Walther / ASTM D341, anchored at 50 °C) -----------------------
const B = reg('fluid.walther_B');
const A = Math.log10(Math.log10(reg('fluid.mu_at_50c_cp') + 0.7)) + B * Math.log10(323.15);
export function viscosityCp(tC: number): number {
  const ll = A - B * Math.log10(tC + 273.15);
  return Math.pow(10, Math.pow(10, ll)) - 0.7;
}
const MU_REF = viscosityCp(60);

export const FMI_LIMIT = reg('limits.fmi_min');
export const SR_LIMIT = reg('limits.goodman_sr');
export const FILLAGE_MIN = reg('limits.fillage_min');
/** gap between P50 and P90 float margin (stands in for the full-path ensemble) */
export const FMI_P90_GAP = 0.05;
export const T_RES = reg('reservoir.temperature_c');
const K_GEAR = reg('srp.k_gear_spm_per_hz');
export const HZ_MIN = reg('limits.vfd_hz_min');
export const HZ_MAX = reg('limits.vfd_hz_max');

// ---- state along the cycle ----------------------------------------------------
export const tNwb = (p: WellParams, t: number) => T_RES + (p.T0 - T_RES) * Math.exp(-t / p.tau);
export const tPump = (p: WellParams, t: number) => tNwb(p, t) - 2;
/** viscosity ratio at the pump vs 60 °C, damped (sinker bars, emulsion) */
export const rVisc = (p: WellParams, t: number) => Math.pow(viscosityCp(tPump(p, t)) / MU_REF, 0.3);

export const oilDeliverability = (p: WellParams, t: number) =>
  p.qi / (1 + p.D * t) + p.flushAmp * Math.exp(-t / p.flushTau);
export const fluidIn = (p: WellParams, t: number) => oilDeliverability(p, t) / p.oilFrac;
export const pumpCap = (p: WellParams, hz: number, stroke = p.stroke) => p.pumpCap45 * (hz / 45) * (stroke / p.stroke);
export const spmOf = (hz: number) => hz * K_GEAR;

/** peak rod speed scales with stroke × SPM, so drag (and FMI) follows both */
export const fmiAt = (p: WellParams, t: number, hz: number, stroke = p.stroke) =>
  1 - p.kFmi * rVisc(p, t) * (hz / 45) * (stroke / p.stroke);
/** highest VFD frequency that keeps FMI_min ≥ limit */
export const hzFloat = (p: WellParams, t: number, stroke = p.stroke) =>
  (45 * (1 - FMI_LIMIT)) / (p.kFmi * rVisc(p, t) * (stroke / p.stroke));
export const goodmanSr = (p: WellParams, t: number, hz: number, stroke = p.stroke) =>
  p.sr0 * (stroke / p.stroke) * Math.pow(hz / 45, 0.8) * Math.pow(rVisc(p, t), 0.5);
export const fatigueLimit = (p: WellParams, t: number) => p.fatigueBase / Math.pow(rVisc(p, t), 0.5);
export const torqueLimit = (p: WellParams, t: number) => p.torqueBase / Math.pow(rVisc(p, t), 0.4);

export function produced(p: WellParams, t: number, hz = p.hz, stroke = p.stroke) {
  const fin = fluidIn(p, t);
  const cap = Math.min(pumpCap(p, hz, stroke), torqueLimit(p, t));
  const fluid = Math.min(fin, cap);
  return { fluid, oil: fluid * p.oilFrac, fillage: Math.min(1, fin / pumpCap(p, hz, stroke)) };
}

export function limits(p: WellParams, t: number): { name: LimitName; q: number; basis: string }[] {
  const hf = hzFloat(p, t);
  return [
    { name: 'INFLOW', q: fluidIn(p, t), basis: 'deliverability at minimum PIP' },
    { name: 'PUMP', q: pumpCap(p, HZ_MAX), basis: `max rated ${spmOf(HZ_MAX).toFixed(2)} SPM × ${p.stroke} in` },
    { name: 'FLOAT', q: pumpCap(p, hf), basis: `max ${spmOf(hf).toFixed(1)} SPM with FMI_min ≥ ${FMI_LIMIT}` },
    { name: 'FATIGUE', q: fatigueLimit(p, t), basis: `Goodman SR ≤ ${SR_LIMIT.toFixed(2)}` },
    { name: 'TORQUE', q: torqueLimit(p, t), basis: 'gearbox 95% rating' },
  ];
}

export function bottleneck(p: WellParams, t: number) {
  const ls = [...limits(p, t)].sort((a, b) => a.q - b.q);
  return { active: ls[0].name, next: ls[1].name, sorted: ls };
}

// ---- energy, risk, economics --------------------------------------------------
export const kwhPerDay = (p: WellParams, hz: number, stroke = p.stroke) =>
  p.kwhPerDay45 * Math.pow(hz / 45, 1.2) * Math.pow(stroke / p.stroke, 0.9);

export function risk30(p: WellParams, t: number, hz = p.hz, stroke = p.stroke) {
  const fmiTerm = Math.exp(-5 * (fmiAt(p, t, hz, stroke) - 0.22));
  const srTerm = Math.exp(3 * (goodmanSr(p, t, hz, stroke) - p.sr0));
  const any = Math.min(0.35, Math.max(0.02, p.risk0 * fmiTerm * srTerm));
  const s = p.modeSplit;
  const by_mode = {
    ROD_FAILURE: any * s.ROD_FAILURE,
    PUMP_UNSETTING: any * s.PUMP_UNSETTING,
    PUMP_FAILURE: any * s.PUMP_FAILURE,
  };
  return { any, by_mode };
}

export interface Prices { oil: number; power: number; failure: number }
export const PRICES: Prices = {
  oil: reg('econ.oil_netback_inr'),
  power: reg('econ.power_inr_per_kwh'),
  failure: reg('econ.failure_cost_inr'),
};

/** daily net ₹ (system-design §7.10) */
export function piDaily(p: WellParams, t: number, hz = p.hz, levelScale = 1, stroke = p.stroke, prices = PRICES) {
  const { oil } = produced(p, t, hz, stroke);
  return oil * levelScale * prices.oil - kwhPerDay(p, hz, stroke) * prices.power
    - (risk30(p, t, hz, stroke).any * prices.failure) / 30;
}

export const injDays = (steamT: number) => steamT / (reg('steam.rate_t_per_h') * 24);
export const cycleCost = (steamT: number) => steamT * reg('econ.steam_inr_per_t') + reg('econ.mobilization_inr');

/** Forecast policy: run at the nominal speed, but never above the float-safe speed. */
export const hzPolicy = (p: WellParams, t: number, hz = p.hzNominal ?? p.hz) => Math.min(hz, hzFloat(p, t));

/** Optimal stopping (system-design §11.4): T* = argmax (Σπ − C) / L(T). */
export function optimalCutoff(p: WellParams, levelScale = 1, hz = p.hzNominal ?? p.hz) {
  const C = cycleCost(p.steamT);
  const off = injDays(p.steamT) + p.soakD;
  let cum = 0;
  let best = { T: 60, avg: -Infinity };
  for (let T = 0; T <= MAX_DAY; T++) {
    cum += piDaily(p, T, hzPolicy(p, T, hz), levelScale);
    if (T < 60) continue;
    const avg = (cum - C) / (off + T);
    if (avg > best.avg) best = { T, avg };
  }
  return best;
}
export const MAX_DAY = 220;

/** Decline-rate and level uncertainty stand in for the 50 posterior samples of §8. */
export const WINDOW_SAMPLES = [
  { dScale: 1.25, level: 0.97 },
  { dScale: 1, level: 1 },
  { dScale: 0.8, level: 1.03 },
];

export function resteamWindow(p: WellParams) {
  const [lo, mid, hi] = WINDOW_SAMPLES.map((s) => optimalCutoff({ ...p, D: p.D * s.dScale }, s.level));
  const days = [lo.T, hi.T].sort((a, b) => a - b);
  return { p10: days[0], p50: mid.T, p90: days[1], piBarStar: mid.avg };
}

// ---- deterministic noise ---------------------------------------------------------
export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** seeded, roughly standard-normal noise */
export function noise(seed: string): number {
  const u = hash(seed) / 4294967295;
  const v = hash(seed + '#') / 4294967295;
  return Math.sqrt(-2 * Math.log(u + 1e-9)) * Math.cos(2 * Math.PI * v);
}
/** seeded uniform in [0, 1) */
export const unit = (seed: string) => hash(seed) / 4294967296;
export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- reference well BG-023 (system-design §2.3) -------------------------------
export const BG023: WellParams = {
  id: 'BG-023', cycleNo: 7, phase: 'PRODUCTION', day: 45,
  qi: 39.05, D: 0.00373, flushAmp: 50, flushTau: 10,
  T0: 83.9, tau: 50, oilFrac: 0.55,
  pumpCap45: 97, hz: 45, stroke: 100,
  kFmi: 0.78, sr0: 0.71, fatigueBase: 124, torqueBase: 139,
  risk0: 0.143, modeSplit: { ROD_FAILURE: 0.49, PUMP_UNSETTING: 0.35, PUMP_FAILURE: 0.21 },
  kwhPerDay45: 479,
  steamT: 1300, injKsc: 90, soakD: 9,
  fmiMinDepthM: 610,
};
