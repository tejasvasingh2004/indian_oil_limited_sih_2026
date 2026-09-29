// Guards for the mock twin: the numbers the demo relies on, the registry
// anchors, and the rules the UI enforces. See system-design.md §2.3, §3.3.
import { describe, expect, test } from 'vitest';
import { BG023, bottleneck, fmiAt, kwhPerDay, limits, piDaily, produced, risk30, tNwb, viscosityCp } from './model';
import { WELLS } from './wells';
import { evaluateCycle, designGrid, evaluateDesignAllPresets } from './cycle';
import { decisionError, runScenarios } from './optimizer';
import { wellState, fieldKpis } from './server';
import { resolveEvidence } from './evidence';
import { REG } from './registry';

describe('registry anchors (system-design §3.3)', () => {
  test('viscosity at 50 °C lies in OIL’s published 10,000–13,000 cP', () => {
    const mu = viscosityCp(50);
    expect(mu).toBeGreaterThanOrEqual(10000);
    expect(mu).toBeLessThanOrEqual(13000);
  });
  test('reservoir temperature is the PS value 46–48 °C', () => {
    const t = REG['reservoir.temperature_c'].value;
    expect(t).toBeGreaterThanOrEqual(46);
    expect(t).toBeLessThanOrEqual(48);
  });
  test('viscosity falls monotonically with temperature', () => {
    for (let t = 40; t < 200; t += 5) expect(viscosityCp(t + 5)).toBeLessThan(viscosityCp(t));
  });
});

describe('reference well BG-023 at production day 45 (system-design §2.3)', () => {
  const t = BG023.day;
  test('rates, fillage and temperature', () => {
    const p = produced(BG023, t);
    expect(p.oil).toBeCloseTo(34, 0);
    expect(p.fluid).toBeCloseTo(62, 0);
    expect(p.fillage).toBeCloseTo(0.64, 2);
    expect(tNwb(BG023, t)).toBeCloseTo(62, 0);
  });
  test('float margin and rate limits', () => {
    expect(fmiAt(BG023, t, 45)).toBeCloseTo(0.22, 2);
    expect(fmiAt(BG023, t, 41)).toBeCloseTo(0.29, 2);
    const l = Object.fromEntries(limits(BG023, t).map((x) => [x.name, x.q]));
    expect(l.INFLOW).toBeCloseTo(62, 0);
    expect(l.PUMP).toBeCloseTo(108, 0);
    expect(l.FLOAT).toBeCloseTo(106, 0);
    expect(bottleneck(BG023, t)).toMatchObject({ active: 'INFLOW', next: 'FLOAT' });
  });
  test('risk, energy and daily net ₹', () => {
    expect(risk30(BG023, t).any).toBeCloseTo(0.143, 2);
    expect(kwhPerDay(BG023, 45) / produced(BG023, t).oil).toBeCloseTo(14.1, 1);
    expect(piDaily(BG023, t) / 1e5).toBeCloseTo(1.8, 1);
  });
  test('float margin falls as the tubing cools (the PS rod-float mechanism)', () => {
    expect(fmiAt(BG023, 90, 45)).toBeLessThan(fmiAt(BG023, 45, 45));
    expect(fmiAt(BG023, 45, 48)).toBeLessThan(fmiAt(BG023, 45, 45));
  });
});

describe('33-well field', () => {
  test('bottlenecks are computed, not assigned: 18 inflow / 7 float / 4 pump / 2 torque', () => {
    const counts: Record<string, number> = {};
    for (const w of WELLS.filter((x) => x.phase === 'PRODUCTION')) {
      const a = bottleneck(w, w.day).active;
      counts[a] = (counts[a] ?? 0) + 1;
    }
    expect(counts).toEqual({ INFLOW: 18, FLOAT: 7, PUMP: 4, TORQUE: 2 });
    expect(WELLS).toHaveLength(33);
  });
  test('one injecting and one soaking well; steam today = 3.1 t/h × 24 h', () => {
    expect(WELLS.filter((w) => w.phase === 'INJECTION')).toHaveLength(1);
    expect(WELLS.filter((w) => w.phase === 'SOAK')).toHaveLength(1);
    expect(fieldKpis().steam_today_t.value).toBeCloseTo(74.4, 1);
  });
  test('BG-009 is out of distribution (demo of the OOD block)', () => {
    expect(wellState('BG-009').ood.flag).toBe(true);
    expect(wellState('BG-023').ood.flag).toBe(false);
  });
});

describe('Evidence Lock', () => {
  test('every computed value in a well state resolves to an evidence record', () => {
    const s = wellState('BG-023');
    const computed = [s.measured.kwh_per_bbl, ...Object.values(s.estimated), s.indicators.fmi_min, s.indicators.goodman_sr_max, s.risk_30d.any];
    for (const q of computed) {
      expect(q.provenance).not.toBe('SIMULATED');
      expect(q.evidence_id && resolveEvidence(q.evidence_id)).toBeTruthy();
    }
  });
});

describe('cycle engine and optimizer', () => {
  const design = { steamT: 1300, injKsc: 90, soakD: 9, stroke: 100 };
  test('a fixed 45 Hz floats mid-cycle; a planned speed never floats', () => {
    expect(evaluateCycle(BG023, design, { kind: 'fixed', hz: 45 }).floatFromDay).not.toBeNull();
    expect(evaluateCycle(BG023, design, { kind: 'optimal', preset: 'balanced' }).floatFromDay).toBeNull();
  });
  test('planned SRP never exceeds the trained speed range', () => {
    const e = evaluateCycle(BG023, design, { kind: 'optimal', preset: 'production' });
    expect(Math.max(...e.plan.map((b) => b.vfd_hz))).toBeLessThanOrEqual(REG['ml.trained_vfd_hz_max'].value);
  });
  test('the full grid evaluates in under 3 s', () => {
    const t0 = performance.now();
    for (const d of designGrid(1500, [86, 100, 120])) evaluateDesignAllPresets(BG023, d);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
  test('scenario hard limits block the column', () => {
    const [r] = runScenarios({ well_id: 'BG-023', scenarios: [{ name: 'X', steam_t: 5000, inj_pressure_ksc: 90, soak_d: 9, vfd_hz: 45, stroke_in: 100 }] });
    expect(r.blocked).toBe(true);
  });
});

describe('decision rules (system-design §5.10, §13.2)', () => {
  test('rejected strategies cannot be decided on', () => {
    expect(decisionError({ verdict: 'REJECTED', trust: 'HIGH' }, { decision: 'APPROVED' })).toMatch(/cannot/);
  });
  test('a reject needs a reason and a comment', () => {
    expect(decisionError({ verdict: 'APPROVED_FOR_REVIEW', trust: 'HIGH' }, { decision: 'REJECTED', reason: 'OTHER' })).toMatch(/reason and a comment/);
    expect(decisionError({ verdict: 'APPROVED_FOR_REVIEW', trust: 'HIGH' }, { decision: 'REJECTED', reason: 'OTHER', comment: 'steam down' })).toBeNull();
  });
  test('LOW trust needs a review note before approval', () => {
    expect(decisionError({ verdict: 'HUMAN_REVIEW_REQUIRED', trust: 'LOW' }, { decision: 'APPROVED' })).toMatch(/review note/);
    expect(decisionError({ verdict: 'HUMAN_REVIEW_REQUIRED', trust: 'LOW' }, { decision: 'APPROVED', review_note: 'checked' })).toBeNull();
  });
});
