import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useScenarios, useWellDesign, useWellState } from '@/api/hooks';
import type { Quantity, ScenarioResult, WellDesign } from '@/api/types';
import { Card } from '@/components/Card';
import { LineChart } from '@/components/charts';
import { DataModeChip, StatusChip } from '@/components/Chips';
import { Frame } from '@/components/Frame';
import { Metric } from '@/components/Metric';
import { PillBar } from '@/components/PillBar';
import { DesertScene } from '@/components/scenes/DesertScene';
import { delta, fmt, inr, pct } from '@/lib/format';
import { REG } from '@/mocks/registry';
import { useUi, type ScenarioDraft } from '@/store/ui';

const LIMITS = {
  steam_t: [REG['limits.steam_t_min'].value, 1600],
  inj_pressure_ksc: [60, REG['limits.inj_pressure_ksc_max'].value],
  soak_d: [REG['limits.soak_d_min'].value, REG['limits.soak_d_max'].value],
  vfd_hz: [REG['limits.vfd_hz_min'].value, REG['limits.vfd_hz_max'].value],
} as const;
const K_GEAR = REG['srp.k_gear_spm_per_hz'].value;
const STEAM_RATE = REG['steam.rate_t_per_h'].value;
const TRAINED_HZ = REG['ml.trained_vfd_hz_max'].value;
export const SCENARIO_COLORS = ['var(--limit-inflow)', 'var(--accent-deep)', 'var(--limit-float)', 'var(--limit-pump)'];

/** Starting designs (system-design §5.7) plus a planned-speed variant to show the CSS–SRP coupling. */
const presets = (d: WellDesign): ScenarioDraft[] => [
  { name: 'A', steam_t: d.steam_t, inj_pressure_ksc: d.inj_pressure_ksc, soak_d: d.soak_d, vfd_hz: d.vfd_hz - 3, stroke_in: d.stroke_in, planned: false },
  { name: 'B', steam_t: d.steam_t - 200, inj_pressure_ksc: d.inj_pressure_ksc - 3, soak_d: d.soak_d - 1, vfd_hz: d.vfd_hz - 5, stroke_in: d.stroke_in, planned: false },
  { name: 'C', steam_t: Math.min(1500, d.steam_t + 200), inj_pressure_ksc: Math.min(95, d.inj_pressure_ksc + 5), soak_d: d.soak_d + 2, vfd_hz: d.vfd_hz + 2, stroke_in: d.stroke_in, planned: false },
  { name: 'D', steam_t: d.steam_t, inj_pressure_ksc: d.inj_pressure_ksc, soak_d: d.soak_d, vfd_hz: d.vfd_hz, stroke_in: d.stroke_in, planned: true },
];

type Key = keyof typeof LIMITS;
const invalid = (s: ScenarioDraft, k: Key) => s[k] < LIMITS[k][0] || s[k] > LIMITS[k][1];
const anyInvalid = (s: ScenarioDraft) => (Object.keys(LIMITS) as Key[]).some((k) => (k === 'vfd_hz' && s.planned ? false : invalid(s, k)));

export function ScenarioLab() {
  const { wellId = 'BG-023' } = useParams();
  const { data: design } = useWellDesign(wellId);
  const { data: state } = useWellState(wellId);
  const { drafts, setDrafts } = useUi();
  const run = useScenarios();
  const [results, setResults] = useState<ScenarioResult[] | null>(null);

  const scenarios = drafts[wellId] ?? (design ? presets(design) : []);
  const update = (i: number, patch: Partial<ScenarioDraft>) => setDrafts(wellId, scenarios.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const simulate = () => {
    if (!design) return;
    run.mutate({
      well_id: wellId,
      scenarios: [
        { name: 'Current', steam_t: design.steam_t, inj_pressure_ksc: design.inj_pressure_ksc, soak_d: design.soak_d, vfd_hz: design.vfd_hz, stroke_in: design.stroke_in, planned: false, cutoff: 'practice' },
        ...scenarios.map((s) => ({ ...s, cutoff: 'optimal' as const })),
      ],
    }, { onSuccess: setResults });
  };
  // run once when the design arrives (and when the simulated clock moves)
  useEffect(() => { if (design) simulate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [design]);

  const cols = results ?? [];
  const cur = cols[0];

  return (
    <Frame scene={<DesertScene spm={state?.measured.spm.value} />} focus>
      <header className="hero-title compact">
        <h1>Scenario Lab</h1>
        <p>Well {wellId} · next-cycle designs (cycle {design ? design.cycle_no + 1 : '…'}) · steam, soak and pump speed evaluated together</p>
        <div className="hero-chips"><DataModeChip /><StatusChip tone="info">Cut-off by optimal stopping</StatusChip></div>
      </header>

      <div className="lab">
        <Card strong className="scroll" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row between">
            <h2 className="card-title left" style={{ margin: 0 }}>Designs</h2>
            <div className="row">
              <button className="pill-btn" onClick={() => design && setDrafts(wellId, presets(design))}>Reset</button>
              {scenarios.length < 4 && design && (
                <button className="pill-btn" onClick={() => setDrafts(wellId, [...scenarios, { ...presets(design)[0], name: String.fromCharCode(65 + scenarios.length) }])}>
                  Add <span className="plus">+</span>
                </button>
              )}
              <button className="pill-btn primary" onClick={simulate} disabled={run.isPending || !design}>{run.isPending ? 'Simulating…' : 'Simulate'}</button>
            </div>
          </div>

          <table className="t lab-table">
            <thead>
              <tr>
                <th />
                <th>Current practice</th>
                {scenarios.map((s, i) => (
                  <th key={i}>
                    <span className="dot" style={{ background: SCENARIO_COLORS[i], marginRight: 6 }} />Scenario {s.name}
                    {anyInvalid(s) && <span className="flag-fail" title="A value is outside the constraint set; this scenario will be blocked"> ⚠</span>}
                    {scenarios.length > 1 && (
                      <button className="linkish" aria-label={`Remove scenario ${s.name}`} onClick={() => setDrafts(wellId, scenarios.filter((_, j) => j !== i))}>×</button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <InputRow label="Steam (t)" k="steam_t" step={50} design={design?.steam_t} scenarios={scenarios} update={update} after={(v) => fmt(v / STEAM_RATE / 24, 1) + " d inj."} />
              <InputRow label="Injection pressure (ksc)" k="inj_pressure_ksc" step={1} design={design?.inj_pressure_ksc} scenarios={scenarios} update={update} />
              <InputRow label="Soak (d)" k="soak_d" step={1} design={design?.soak_d} scenarios={scenarios} update={update} />
              <tr>
                <th>Pump speed (Hz · SPM)</th>
                <td className="num">fixed {design?.vfd_hz} · {fmt((design?.vfd_hz ?? 0) * K_GEAR, 1)}</td>
                {scenarios.map((s, i) => (
                  <td key={i}>
                    <div className="row field" style={{ gap: 6, flexWrap: 'wrap', maxWidth: 150 }}>
                      <div className="seg" role="group" aria-label={`Scenario ${s.name} speed mode`}>
                        <button aria-pressed={!s.planned} onClick={() => update(i, { planned: false })}>fixed</button>
                        <button aria-pressed={s.planned} onClick={() => update(i, { planned: true })} title="Best speed per 7-day block inside the float, fatigue and fillage envelope">plan</button>
                      </div>
                      {!s.planned && (
                        <>
                          <input type="number" step={1} value={s.vfd_hz} aria-invalid={invalid(s, 'vfd_hz')} aria-label={`Scenario ${s.name} VFD Hz`}
                            onChange={(e) => update(i, { vfd_hz: +e.target.value })} style={{ width: 52 }} />
                          <span className="faint num">{fmt(s.vfd_hz * K_GEAR, 1)}</span>
                          {s.vfd_hz > TRAINED_HZ && !invalid(s, 'vfd_hz') && <span title={`above the trained range (≤ ${TRAINED_HZ} Hz)`} className="flag-assumed">⚠</span>}
                        </>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
              <tr>
                <th>Stroke (in)</th>
                <td className="num">{design?.stroke_in}</td>
                {scenarios.map((s, i) => (
                  <td key={i} className="field">
                    <select value={s.stroke_in} onChange={(e) => update(i, { stroke_in: +e.target.value })} aria-label={`Scenario ${s.name} stroke`} style={{ width: 76 }}>
                      {[86, 100, 120].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
              <tr className="section"><th colSpan={2 + scenarios.length}>Predicted cycle <span className="faint" style={{ fontWeight: 400 }}>· PREDICTED on SIMULATED data · ★ best per row</span></th></tr>
              {results && results.length === scenarios.length + 1
                ? <ResultRows cols={cols} cur={cur} />
                : <tr><td colSpan={2 + scenarios.length}><div className="skeleton" style={{ height: 220 }} /></td></tr>}
            </tbody>
          </table>
          <p className="label-3" style={{ margin: 0 }}>
            ★ marks the best value in a row; the optimizer, not the ★, makes recommendations. Click any value for its evidence. Prices and failure costs are ASSUMED (⚑).
          </p>
        </Card>

        <div className="stack" style={{ gap: 14, minHeight: 0 }}>
          <Card title="Float margin through the cycle" sub="P50 FMI_min along the rod string · limit 0.15">
            {results ? <LineChart height={190} ariaLabel="Float margin through the cycle for each scenario" xLabel="production day" yFormat={(v) => fmt(v, 2)}
              series={cols.map((r, i) => ({ x: r.trajectory.day, y: r.trajectory.fmi, color: i === 0 ? 'var(--text-2)' : SCENARIO_COLORS[i - 1], dashed: i === 0 }))}
              hlines={[{ y: 0.15, label: 'limit 0.15' }]} /> : <div className="skeleton" style={{ height: 190 }} />}
            <Legend cols={cols} />
          </Card>
          <Card title="Oil rate through the cycle" sub="bbl/d until each design's re-steam day">
            {results ? <LineChart height={170} ariaLabel="Oil rate through the cycle for each scenario" xLabel="production day" yFormat={(v) => fmt(v)}
              series={cols.map((r, i) => ({ x: r.trajectory.day, y: r.trajectory.oil, color: i === 0 ? 'var(--text-2)' : SCENARIO_COLORS[i - 1], dashed: i === 0 }))} /> : <div className="skeleton" style={{ height: 170 }} />}
          </Card>
        </div>
      </div>

      <PillBar wellId={wellId} wellSuffix="/scenario-lab" actions={<>
        <Link className="pill-btn" to={`/wells/${wellId}`}>Well console</Link>
        <Link className="pill-btn primary" to={`/wells/${wellId}/optimize`}>Optimize <span className="plus">+</span></Link>
      </>} />
    </Frame>
  );
}

function InputRow({ label, k, step, design, scenarios, update, after }: {
  label: string; k: Key; step: number; design?: number; scenarios: ScenarioDraft[]; update: (i: number, p: Partial<ScenarioDraft>) => void;
  after?: (v: number) => string;
}) {
  return (
    <tr>
      <th>{label}</th>
      <td className="num">{design !== undefined ? fmt(design) : '…'}{design !== undefined && after && <span className="faint"> · {after(design)}</span>}</td>
      {scenarios.map((s, i) => (
        <td key={i} className="field">
          <span className="row" style={{ gap: 6 }}>
            <input type="number" step={step} value={s[k]} aria-invalid={invalid(s, k)} aria-label={`Scenario ${s.name} ${label}`}
              title={invalid(s, k) ? `allowed ${LIMITS[k][0]}–${LIMITS[k][1]}` : undefined}
              onChange={(e) => update(i, { [k]: +e.target.value } as Partial<ScenarioDraft>)} style={{ width: 72 }} />
            {invalid(s, k) ? <span className="flag-fail label-3">{LIMITS[k][0]}–{LIMITS[k][1]}</span> : after && <span className="faint label-3">{after(s[k])}</span>}
          </span>
        </td>
      ))}
    </tr>
  );
}

function Legend({ cols }: { cols: ScenarioResult[] }) {
  return (
    <div className="legend" style={{ marginTop: 6 }}>
      {cols.map((r, i) => <span key={r.name}><i className="dot" style={{ background: i === 0 ? 'var(--text-2)' : SCENARIO_COLORS[i - 1] }} />{r.name === 'Current' ? 'current practice' : `scenario ${r.name}`}</span>)}
    </div>
  );
}

type Row = { label: string; get: (r: ScenarioResult) => Quantity | null; fmt: (v: number) => string; better: 'up' | 'down' | null; name: string; absolute?: boolean };

function ResultRows({ cols, cur }: { cols: ScenarioResult[]; cur?: ScenarioResult }) {
  const rows: Row[] = useMemo(() => [
    { label: 'Cycle oil (bbl)', name: 'Cycle oil', get: (r) => r.kpis.cycle_oil_bbl, fmt: (v) => fmt(v), better: 'up' },
    { label: 'Oil per cycle-day', name: 'Oil per cycle-day', get: (r) => r.kpis.oil_per_cycle_day, fmt: (v) => fmt(v, 1), better: 'up' },
    { label: 'SOR', name: 'Cycle steam-oil ratio', get: (r) => r.kpis.sor, fmt: (v) => fmt(v, 2), better: 'down' },
    { label: 'kWh/bbl', name: 'Energy per barrel', get: (r) => r.kpis.kwh_per_bbl, fmt: (v) => fmt(v, 1), better: 'down' },
    { label: 'Failure risk (avg 30 d)', name: 'Mean 30-day failure risk', get: (r) => r.kpis.failure_risk, fmt: (v) => pct(v), better: 'down' },
    { label: 'FMI min (P90)', name: 'Minimum float margin, P90', get: (r) => r.kpis.fmi_min_p90, fmt: (v) => fmt(v, 2), better: 'up', absolute: true },
    { label: 'Net ₹/day (cycle avg)', name: 'Net ₹/day, cycle average', get: (r) => r.kpis.net_inr_per_day, fmt: (v) => inr(v), better: 'up' },
  ], []);
  const valid = cols.filter((c) => !c.blocked);
  const bestOf = (row: Row) => {
    const vs = valid.map((c) => row.get(c)!.value);
    return row.better === 'up' ? Math.max(...vs) : Math.min(...vs);
  };
  return (
    <>
          {rows.map((row) => {
            const best = bestOf(row);
            return (
              <tr key={row.label}>
                <th>{row.label}</th>
                {cols.map((c, i) => {
                  if (c.blocked) return <td key={c.name} className="faint">blocked</td>;
                  const q = row.get(c)!;
                  const base = cur ? row.get(cur)!.value : 0;
                  const d = cur && i > 0 && row.better
                    ? (row.absolute
                      ? { dir: Math.abs(q.value - base) < 0.005 ? (0 as const) : q.value > base ? (1 as const) : (-1 as const), text: (q.value >= base ? '+' : '−') + fmt(Math.abs(q.value - base), 2) }
                      : delta(base, q.value))
                    : null;
                  const good = d && d.dir !== 0 && ((row.better === 'up') === (d.dir > 0));
                  return (
                    <td key={c.name}>
                      <span className="row" style={{ gap: 6 }}>
                        <Metric q={q} name={`${row.name} · ${i === 0 ? 'current practice' : 'scenario ' + c.name}`} format={row.fmt} size="sm" />
                        {Math.abs(q.value - best) < 1e-9 && valid.length > 1 && <span aria-label="best in row" className="star">★</span>}
                        {d && d.dir !== 0 && <span className={`dlt ${good ? 'good' : 'bad'}`}>{d.text}</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr>
            <th>Float margin</th>
            {cols.map((c) => <td key={c.name} className={c.flags.some((f) => f.type === 'FLOAT_MARGIN') ? 'flag-fail' : 'faint'}>
              {c.blocked ? '' : c.flags.find((f) => f.type === 'FLOAT_MARGIN') ? `floats from day ${c.flags.find((f) => f.type === 'FLOAT_MARGIN')!.detail.match(/\d+$/)?.[0]}` : 'never below limit'}
            </td>)}
          </tr>
          <tr>
            <th>Re-steam day (P50)</th>
            {cols.map((c, i) => <td key={c.name} className="num">{c.blocked ? '' : `${i === 0 ? 'day ' : 'day '}${c.derived.resteam_p50_day}${i === 0 ? ' (habit)' : ''}`}</td>)}
          </tr>
          <tr>
            <th>Confidence</th>
            {cols.map((c) => <td key={c.name}><StatusChip tone={c.confidence === 'HIGH' ? 'ok' : c.confidence === 'MEDIUM' ? 'warn' : 'fail'} mark={false}>{c.confidence.toLowerCase()}</StatusChip></td>)}
          </tr>
          <tr>
            <th>Flags</th>
            {cols.map((c) => <td key={c.name} className="label-3" style={{ whiteSpace: 'normal', maxWidth: 170 }}>
              {c.flags.filter((f) => f.type !== 'FLOAT_MARGIN').map((f) => f.detail).join('; ') || '—'}
            </td>)}
          </tr>
    </>
  );
}
