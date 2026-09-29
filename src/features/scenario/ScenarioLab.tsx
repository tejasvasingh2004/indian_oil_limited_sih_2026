import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useScenarios, useWellDesign } from '@/api/hooks';
import type { Quantity, ScenarioResult, WellDesign } from '@/api/types';
import { LineChart } from '@/components/charts';
import { BoltIcon, GaugeIcon, RupeeIcon } from '@/components/Icons';
import { Metric } from '@/components/Metric';
import { PageHeader } from '@/components/Shell';
import { Panel, StatCard, Status } from '@/components/ui';
import { delta, fmt, inr, pct } from '@/lib/format';
import { REG } from '@/mocks/registry';
import { useUi, type ScenarioDraft } from '@/store/ui';

const LIMITS = {
  steam_t: [REG['limits.steam_t_min'].value, 1600],
  inj_pressure_ksc: [60, REG['limits.inj_pressure_ksc_max'].value],
  soak_d: [REG['limits.soak_d_min'].value, REG['limits.soak_d_max'].value],
  vfd_hz: [REG['limits.vfd_hz_min'].value, REG['limits.vfd_hz_max'].value],
} as const;
const STEAM_RATE = REG['steam.rate_t_per_h'].value;
const TRAINED_HZ = REG['ml.trained_vfd_hz_max'].value;
const FMI_LIMIT = REG['limits.fmi_min'].value;
export const SCENARIO_COLORS = ['#6fae2c', '#3563a8', '#d9821a', '#9b59b6'];

/** Starting designs (system-design §5.7) plus one with a planned pump speed. */
const presets = (d: WellDesign): ScenarioDraft[] => [
  { name: 'A', steam_t: d.steam_t, inj_pressure_ksc: d.inj_pressure_ksc, soak_d: d.soak_d, vfd_hz: d.vfd_hz - 3, stroke_in: d.stroke_in, planned: false },
  { name: 'B', steam_t: d.steam_t - 200, inj_pressure_ksc: d.inj_pressure_ksc - 3, soak_d: d.soak_d - 1, vfd_hz: d.vfd_hz - 5, stroke_in: d.stroke_in, planned: false },
  { name: 'C', steam_t: Math.min(1500, d.steam_t + 200), inj_pressure_ksc: Math.min(95, d.inj_pressure_ksc + 5), soak_d: d.soak_d + 2, vfd_hz: d.vfd_hz + 2, stroke_in: d.stroke_in, planned: false },
  { name: 'D', steam_t: d.steam_t, inj_pressure_ksc: d.inj_pressure_ksc, soak_d: d.soak_d, vfd_hz: d.vfd_hz, stroke_in: d.stroke_in, planned: true },
];

type Key = keyof typeof LIMITS;
const invalid = (s: ScenarioDraft, k: Key) => !(k === 'vfd_hz' && s.planned) && (s[k] < LIMITS[k][0] || s[k] > LIMITS[k][1]);

export function ScenarioLab() {
  const { wellId = 'BG-023' } = useParams();
  const { data: design } = useWellDesign(wellId);
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
  useEffect(() => { if (design) simulate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [design]);

  const cols = results && results.length === scenarios.length + 1 ? results : null;
  const valid = cols?.filter((c) => !c.blocked) ?? [];
  const best = (f: (r: ScenarioResult) => number, dir: 1 | -1) => [...valid].sort((a, b) => dir * (f(b) - f(a)))[0];
  const bestNet = best((r) => r.kpis.net_inr_per_day.value, 1);
  const bestEnergy = best((r) => r.kpis.kwh_per_bbl.value, -1);
  const safe = valid.filter((c) => !c.flags.some((f) => f.type === 'FLOAT_MARGIN'));
  const nameOf = (r?: ScenarioResult) => (!r ? '' : r.name === 'Current' ? 'current practice' : `scenario ${r.name}`);

  return (
    <>
      <PageHeader title="Scenario Lab" sub={`Well ${wellId} · compare next-cycle designs (cycle ${design ? design.cycle_no + 1 : '…'}) — steam, soak and pump speed together`}
        actions={<>
          <button className="btn ghost" onClick={() => design && setDrafts(wellId, presets(design))}>Reset</button>
          <button className="btn primary" onClick={simulate} disabled={run.isPending || !design}>{run.isPending ? 'Simulating…' : 'Simulate'}</button>
        </>} />

      <div className="stats">
        <StatCard variant="dark" icon={<RupeeIcon />} label="Best net ₹/day" value={bestNet ? fmt(bestNet.kpis.net_inr_per_day.value / 1e5, 2) : '…'} unit="lakh"
          hint={bestNet ? `${nameOf(bestNet)} · cut-off by optimal stopping` : ''} />
        <StatCard variant="grey" icon={<BoltIcon />} label="Least energy" value={bestEnergy ? fmt(bestEnergy.kpis.kwh_per_bbl.value, 1) : '…'} unit="kWh/bbl"
          hint={bestEnergy ? nameOf(bestEnergy) : ''} />
        <StatCard variant="lime" icon={<GaugeIcon />} label="Designs that never float" value={cols ? safe.length : '…'} unit={cols ? `of ${valid.length}` : ''}
          hint="rod float margin stays above the limit all cycle" />
      </div>

      <div className="section">
        <Panel title="Designs" action={<span className="small muted">edit the white boxes · “plan” lets the twin choose the pump speed week by week</span>}>
          <div className="scroll-x">
            <table className="tbl lab">
              <thead>
                <tr>
                  <th />
                  <th>Current practice</th>
                  {scenarios.map((s, i) => (
                    <th key={i}><span className="row"><i className="dot" style={{ background: SCENARIO_COLORS[i] }} />Scenario {s.name}
                      {scenarios.length > 1 && <button className="btn ghost sm" style={{ padding: '0 7px' }} aria-label={`Remove scenario ${s.name}`}
                        onClick={() => setDrafts(wellId, scenarios.filter((_, j) => j !== i))}>×</button>}</span></th>
                  ))}
                  {scenarios.length < 4 && design && <th><button className="btn sm" onClick={() => setDrafts(wellId, [...scenarios, { ...presets(design)[3], name: String.fromCharCode(65 + scenarios.length) }])}>+ Add</button></th>}
                </tr>
              </thead>
              <tbody>
                <InputRow label="Steam (t)" k="steam_t" step={50} design={design?.steam_t} scenarios={scenarios} update={update} />
                <InputRow label="Injection pressure (ksc)" k="inj_pressure_ksc" step={1} design={design?.inj_pressure_ksc} scenarios={scenarios} update={update} />
                <InputRow label="Soak (days)" k="soak_d" step={1} design={design?.soak_d} scenarios={scenarios} update={update} />
                <tr>
                  <td className="muted">Pump speed (Hz)</td>
                  <td className="num">{design?.vfd_hz} fixed</td>
                  {scenarios.map((s, i) => (
                    <td key={i}>
                      <span className="row">
                        <span className="seg" role="group" aria-label={`Scenario ${s.name} speed mode`}>
                          <button aria-pressed={!s.planned} onClick={() => update(i, { planned: false })}>fixed</button>
                          <button aria-pressed={s.planned} onClick={() => update(i, { planned: true })}>plan</button>
                        </span>
                        {!s.planned && <input className="input num" type="number" value={s.vfd_hz} aria-invalid={invalid(s, 'vfd_hz')} aria-label={`Scenario ${s.name} pump speed Hz`}
                          onChange={(e) => update(i, { vfd_hz: +e.target.value })} style={{ width: 58 }} />}
                        {!s.planned && s.vfd_hz > TRAINED_HZ && !invalid(s, 'vfd_hz') && <span className="flag-assumed" title={`above the speeds the model was trained on (≤ ${TRAINED_HZ} Hz)`}>⚠</span>}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="muted">Stroke (in)</td>
                  <td className="num">{design?.stroke_in}</td>
                  {scenarios.map((s, i) => (
                    <td key={i}><select className="select" value={s.stroke_in} style={{ width: 80 }} aria-label={`Scenario ${s.name} stroke`}
                      onChange={(e) => update(i, { stroke_in: +e.target.value })}>{[86, 100, 120].map((v) => <option key={v}>{v}</option>)}</select></td>
                  ))}
                </tr>
                <tr><td colSpan={2 + scenarios.length} style={{ paddingTop: 18, fontSize: 13 }}>Predicted cycle <span className="small faint">· simulated · ★ best in row · click a value for how it was computed</span></td></tr>
                {cols ? <ResultRows cols={cols} /> : <tr><td colSpan={2 + scenarios.length}><div className="skeleton" style={{ height: 200 }} /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="section grid-2">
        <Panel title="Rod float margin through the cycle" action={<span className="small muted">below the red line the rods float</span>}>
          {cols ? <LineChart height={200} ariaLabel="Rod float margin through the cycle for each design" xLabel="production day" yFormat={(v) => fmt(v, 2)}
            series={cols.map((r, i) => ({ x: r.trajectory.day, y: r.trajectory.fmi, color: i === 0 ? 'var(--ink)' : SCENARIO_COLORS[i - 1], dashed: i === 0 }))}
            hlines={[{ y: FMI_LIMIT, label: `limit ${FMI_LIMIT}` }]} /> : <div className="skeleton" style={{ height: 200 }} />}
          <Legend cols={cols ?? []} />
        </Panel>
        <Panel title="Oil rate through the cycle" action={<span className="small muted">until each design’s re-steam day</span>}>
          {cols ? <LineChart height={200} ariaLabel="Oil rate through the cycle for each design" xLabel="production day" yFormat={(v) => fmt(v)}
            series={cols.map((r, i) => ({ x: r.trajectory.day, y: r.trajectory.oil, color: i === 0 ? 'var(--ink)' : SCENARIO_COLORS[i - 1], dashed: i === 0 }))} /> : <div className="skeleton" style={{ height: 200 }} />}
          <Legend cols={cols ?? []} />
        </Panel>
      </div>

      <p className="small faint">When a design looks right, <Link to={`/wells/${wellId}/optimize`}>let the optimizer search all designs</Link> — the ★ here is not a recommendation.</p>
    </>
  );
}

function InputRow({ label, k, step, design, scenarios, update }: {
  label: string; k: Key; step: number; design?: number; scenarios: ScenarioDraft[]; update: (i: number, p: Partial<ScenarioDraft>) => void;
}) {
  return (
    <tr>
      <td className="muted">{label}</td>
      <td className="num">{design !== undefined ? fmt(design) : '…'}</td>
      {scenarios.map((s, i) => (
        <td key={i}>
          <span className="row">
            <input className="input num" type="number" step={step} value={s[k]} aria-invalid={invalid(s, k)} aria-label={`Scenario ${s.name} ${label}`}
              title={invalid(s, k) ? `allowed ${LIMITS[k][0]}–${LIMITS[k][1]}` : undefined}
              onChange={(e) => update(i, { [k]: +e.target.value } as Partial<ScenarioDraft>)} style={{ width: 84 }} />
            {k === 'steam_t' && <span className="small faint">{fmt(s.steam_t / STEAM_RATE / 24, 1)} d</span>}
            {invalid(s, k) && <span className="small" style={{ color: 'var(--bad)' }}>{LIMITS[k][0]}–{LIMITS[k][1]}</span>}
          </span>
        </td>
      ))}
    </tr>
  );
}

function Legend({ cols }: { cols: ScenarioResult[] }) {
  return (
    <div className="legend" style={{ marginTop: 8 }}>
      {cols.map((r, i) => <span key={r.name}><i className="dot" style={{ background: i === 0 ? 'var(--ink)' : SCENARIO_COLORS[i - 1] }} />{r.name === 'Current' ? 'current practice' : `scenario ${r.name}`}</span>)}
    </div>
  );
}

type Row = { label: string; name: string; get: (r: ScenarioResult) => Quantity; fmt: (v: number) => string; better: 'up' | 'down'; absolute?: boolean };

function ResultRows({ cols }: { cols: ScenarioResult[] }) {
  const rows: Row[] = useMemo(() => [
    { label: 'Net ₹/day', name: 'Net ₹/day, cycle average', get: (r) => r.kpis.net_inr_per_day, fmt: (v) => inr(v), better: 'up' },
    { label: 'Oil per cycle-day', name: 'Oil per cycle-day', get: (r) => r.kpis.oil_per_cycle_day, fmt: (v) => fmt(v, 1), better: 'up' },
    { label: 'Steam-oil ratio', name: 'Cycle steam-oil ratio', get: (r) => r.kpis.sor, fmt: (v) => fmt(v, 2), better: 'down' },
    { label: 'Energy (kWh/bbl)', name: 'Energy per barrel', get: (r) => r.kpis.kwh_per_bbl, fmt: (v) => fmt(v, 1), better: 'down' },
    { label: 'Failure risk (30 d)', name: 'Mean 30-day failure risk', get: (r) => r.kpis.failure_risk, fmt: (v) => pct(v), better: 'down' },
  ], []);
  const cur = cols[0];
  const valid = cols.filter((c) => !c.blocked);
  return (
    <>
      {rows.map((row) => {
        const vals = valid.map((c) => row.get(c).value);
        const best = row.better === 'up' ? Math.max(...vals) : Math.min(...vals);
        return (
          <tr key={row.label}>
            <td className="muted">{row.label}</td>
            {cols.map((c, i) => {
              if (c.blocked) return <td key={c.name}><Status tone="bad">Blocked</Status></td>;
              const q = row.get(c);
              const d = i > 0 ? delta(row.get(cur).value, q.value) : null;
              const good = d && d.dir !== 0 && ((row.better === 'up') === (d.dir > 0));
              return (
                <td key={c.name}>
                  <span className="row" style={{ gap: 4 }}>
                    <Metric q={q} name={`${row.name} · ${c.name === 'Current' ? 'current practice' : 'scenario ' + c.name}`} format={row.fmt} />
                    {Math.abs(q.value - best) < 1e-9 && <span style={{ color: 'var(--lime-deep)' }} aria-label="best in row">★</span>}
                    {d && d.dir !== 0 && <span className={`dlt ${good ? 'good' : 'bad'}`}>{d.text}</span>}
                  </span>
                </td>
              );
            })}
          </tr>
        );
      })}
      <tr>
        <td className="muted">Rod float</td>
        {cols.map((c) => {
          const f = c.flags.find((x) => x.type === 'FLOAT_MARGIN');
          return <td key={c.name}>{c.blocked ? '' : f ? <Status tone="bad">from day {f.detail.match(/\d+$/)?.[0]}</Status> : <Status tone="ok">Never</Status>}</td>;
        })}
      </tr>
      <tr>
        <td className="muted">Re-steam on</td>
        {cols.map((c, i) => <td key={c.name} className="num">{c.blocked ? '' : `day ${c.derived.resteam_p50_day}${i === 0 ? ' (habit)' : ''}`}</td>)}
      </tr>
      <tr>
        <td className="muted">Confidence</td>
        {cols.map((c) => <td key={c.name}>
          <Status tone={c.confidence === 'HIGH' ? 'ok' : c.confidence === 'MEDIUM' ? 'warn' : 'bad'} title={c.flags.filter((f) => f.type === 'OUTSIDE_TRAINING_RANGE').map((f) => f.detail).join('; ') || undefined}>
            {c.confidence.toLowerCase()}
          </Status>
        </td>)}
      </tr>
    </>
  );
}
