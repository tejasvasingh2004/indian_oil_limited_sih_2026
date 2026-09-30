import { describe, expect, it } from 'vitest';
import { backtestSync, cycleHistory, dataQuality, modelHealth, registryReport, thermalForecast, wellSnapshot } from './extras';
import { advance, auditReport } from './state';
import { reg } from './registry';

describe('v3 twin additions', () => {
  it('reproduces every published anchor', () => {
    const r = registryReport();
    expect(r.anchors.every((a) => a.pass)).toBe(true);
    expect(r.rows.every((x) => !!x.label)).toBe(true);
  });

  it('3D snapshot follows the physics: faster pump and later day lower the float margin', () => {
    const now = wellSnapshot('BG-023');
    const fast = wellSnapshot('BG-023', now.day, 50);
    const late = wellSnapshot('BG-023', now.day + 80);
    expect(fast.fmi_min).toBeLessThan(now.fmi_min);
    expect(late.fmi_min).toBeLessThan(now.fmi_min);
    expect(late.heated_radius_m).toBeLessThan(now.heated_radius_m);
    expect(late.viscosity_cp).toBeGreaterThan(now.viscosity_cp);
    expect(now.depth_m.length).toBe(now.fmi.length);
    // profile is sampled every 50 m, so its minimum sits just above the true minimum
    expect(Math.min(...now.fmi)).toBeGreaterThanOrEqual(now.fmi_min - 1e-9);
    expect(Math.min(...now.fmi) - now.fmi_min).toBeLessThan(0.02);
  });

  it('near-well temperature cools toward the reservoir', () => {
    const t = thermalForecast('BG-023');
    expect(t.t_nwb_c[0]).toBeGreaterThan(t.t_nwb_c[t.t_nwb_c.length - 1]);
    expect(t.t_nwb_c[t.t_nwb_c.length - 1]).toBeGreaterThanOrEqual(t.reservoir_t_c);
  });

  it('cycle history ends with the cycle in progress', () => {
    const c = cycleHistory('BG-023');
    expect(c[0].status).toBe('IN_PROGRESS');
    expect(c.slice(1).every((x) => x.status === 'COMPLETE')).toBe(true);
  });

  it('backtest reports skill first and counts gains only on skill-passing cycles', () => {
    const { cycles, summary } = backtestSync();
    expect(summary.cycles_evaluated).toBe(cycles.length);
    expect(summary.passing + summary.excluded).toBe(cycles.length);
    expect(summary.median_ape).toBeLessThan(reg('backtest.ape_max'));
    expect(summary.coverage).toBeGreaterThanOrEqual(reg('backtest.coverage_lo'));
    expect(summary.coverage).toBeLessThanOrEqual(reg('backtest.coverage_hi'));
    // no leakage: cycle k is forecast from cycles before k only
    expect(cycles.every((c) => c.calibrated_on.every((k) => k < c.cycle_no))).toBe(true);
    // optimized never worse than actual on the same twin
    expect(cycles.every((c) => c.d_net >= 0)).toBe(true);
  });

  it('model health: no release gate fails on the simulated history', () => {
    const h = modelHealth();
    expect(h.models).toHaveLength(4);
    expect(h.models.flatMap((m) => m.gates).some((g) => g.status === 'FAIL')).toBe(false);
  });

  it('data-quality scores are fractions', () => {
    expect(dataQuality().every((d) => d.score > 0 && d.score <= 1)).toBe(true);
  });

  it('audit log is hash-chained', () => {
    advance(1);
    const a = auditReport();
    expect(a.entries.length).toBeGreaterThan(0);
    expect(a.chain_ok).toBe(true);
    expect(a.entries[0].action).toBe('ADVANCE_TIME');
  });
});
