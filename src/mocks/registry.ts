// Mock of the parameter registry (system-design.md §3). Every constant the
// mock twin uses comes from here, so the evidence popover can list it with
// its label. Values mirror system-design.md §2.2 / §2.3.
import type { EvidenceLabel } from '@/api/types';

export interface RegEntry {
  value: number;
  unit?: string;
  label: EvidenceLabel;
  verify?: boolean;
  source?: string;
  range?: [number, number];
}

export const REGISTRY_VERSION = 'reg-2026.09.30-1';

export const REG = {
  'fluid.mu_at_50c_cp': { value: 11500, unit: 'cP', label: 'OIL', range: [10000, 13000], source: 'oil-india.com/rajasthan-fields' },
  'fluid.walther_B': { value: 3.8, label: 'ASSUMED', source: 'needs a second lab point from OIL' },
  'fluid.api_gravity': { value: 18, label: 'PS', range: [17, 19], source: 'PS SIH26120' },
  'reservoir.temperature_c': { value: 47, unit: '°C', label: 'PS', range: [46, 48], source: 'PS SIH26120' },
  'reservoir.depth_m': { value: 1150, unit: 'm', label: 'OIL', source: 'OIL-RF-EOI-014-2024' },
  'srp.pump_depth_m': { value: 1100, unit: 'm', label: 'LITERATURE', verify: true, source: 'SPE 23APOG-535203' },
  'srp.k_gear_spm_per_hz': { value: 0.107, unit: 'SPM/Hz', label: 'DEMO' },
  'steam.rate_t_per_h': { value: 3.1, unit: 't/h', label: 'OIL', verify: true, source: 'OIL CSS practice (to confirm)' },
  'steam.surface_pressure_ksc': { value: 90, unit: 'ksc', label: 'OIL', verify: true, range: [85, 97] },
  'steam.quality': { value: 0.65, label: 'OIL', verify: true, range: [0.6, 0.7] },
  'econ.oil_netback_inr': { value: 5500, unit: '₹/bbl', label: 'ASSUMED' },
  'econ.steam_inr_per_t': { value: 2500, unit: '₹/t', label: 'ASSUMED' },
  'econ.power_inr_per_kwh': { value: 8, unit: '₹/kWh', label: 'ASSUMED' },
  'econ.failure_cost_inr': { value: 600000, unit: '₹/event', label: 'ASSUMED' },
  'econ.mobilization_inr': { value: 150000, unit: '₹/cycle', label: 'ASSUMED' },
  'limits.fmi_min': { value: 0.15, label: 'ASSUMED' },
  'limits.goodman_sr': { value: 0.9, label: 'ASSUMED' },
  'limits.fillage_min': { value: 0.55, label: 'ASSUMED' },
  'limits.vfd_hz_min': { value: 30, unit: 'Hz', label: 'ASSUMED' },
  'limits.vfd_hz_max': { value: 50, unit: 'Hz', label: 'ASSUMED' },
  'limits.inj_pressure_ksc_max': { value: 97, unit: 'ksc', label: 'OIL', verify: true },
  'limits.soak_d_min': { value: 5, unit: 'd', label: 'ASSUMED' },
  'limits.soak_d_max': { value: 15, unit: 'd', label: 'ASSUMED' },
  'limits.steam_t_min': { value: 800, unit: 't', label: 'ASSUMED' },
  'ml.trained_vfd_hz_max': { value: 46, unit: 'Hz', label: 'DEMO' },
  'field.operating_wells': { value: 33, label: 'LITERATURE', source: 'Business Today, Apr 2026' },
  'steam.injection_days': { value: 17, unit: 'd', label: 'OIL', verify: true, range: [14, 21], source: 'OIL CSS practice (to confirm)' },
  'reservoir.pay_thickness_m': { value: 40, unit: 'm', label: 'ASSUMED', source: 'illustrative pay thickness for the 3D view' },
  'ml.trained_water_cut_min': { value: 0.35, label: 'DEMO' },
  'ml.trained_water_cut_max': { value: 0.65, label: 'DEMO' },
  'viz.heated_radius_ref_m': { value: 18, unit: 'm', label: 'DEMO', source: 'display scale for the heated zone (Marx–Langenheim-style radius at 1,300 t)' },
  'backtest.ape_max': { value: 0.2, label: 'ASSUMED', source: 'system-design §15 placeholder' },
  'backtest.coverage_lo': { value: 0.7, label: 'ASSUMED' },
  'backtest.coverage_hi': { value: 0.9, label: 'ASSUMED' },
} satisfies Record<string, RegEntry>;

export type RegKey = keyof typeof REG;

export const reg = (k: RegKey): number => REG[k].value;

/** Cold-water-equivalent barrels per tonne of steam. */
export const BBL_PER_T_CWE = 6.29;
