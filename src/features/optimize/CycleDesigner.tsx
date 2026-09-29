import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useOptimization, useStartOptimization, useWellDesign, useWellState } from '@/api/hooks';
import type { OptimizationRequest, OptimizationRun, Strategy, StrategyLabel } from '@/api/types';
import { Scatter, StepPlan } from '@/components/charts';
import { TrustMeter, VERDICT_LABEL, trustTone, verdictTone } from '@/components/Chips';
import { Drawer } from '@/components/Drawer';
import { BoltIcon, RupeeIcon, ShieldIcon } from '@/components/Icons';
import { Metric } from '@/components/Metric';
import { PageHeader } from '@/components/Shell';
import { Meter, Panel, PillLink, StatCard, Status } from '@/components/ui';
import { delta, fmt, inr, pct } from '@/lib/format';
import { REG } from '@/mocks/registry';
import { ExplanationPanel, GateChecklist } from './Explanation';
import { DecisionBar } from './DecisionBar';

const v = (k: keyof typeof REG) => REG[k].value;
const LIMITS_TEXT = `rod float margin ≥ ${v('limits.fmi_min')} · rod stress ≤ ${v('limits.goodman_sr').toFixed(2)} · pump fillage ≥ ${v('limits.fillage_min')} · pump ${v('limits.vfd_hz_min')}–${v('limits.vfd_hz_max')} Hz · injection ≤ ${v('limits.inj_pressure_ksc_max')} ksc`;
const TITLE: Record<StrategyLabel, string> = { CURRENT: 'Current practice', PRODUCTION: 'Most oil', BALANCED: 'Balanced', ENERGY: 'Least energy', RELIABILITY: 'Most reliable' };
const OBJECTIVES: { key: OptimizationRequest['objective']; label: StrategyLabel }[] = [
  { key: 'balanced', label: 'BALANCED' }, { key: 'production', label: 'PRODUCTION' },
  { key: 'energy', label: 'ENERGY' }, { key: 'reliability', label: 'RELIABILITY' },
];

export function CycleDesigner() {
  const { wellId = 'BG-023', runId } = useParams();
  const nav = useNavigate();
  const { data: state } = useWellState(wellId);
  const { data: r } = useOptimization(runId);
  return (
    <>
      <PageHeader title="Optimize" sub={`Well ${wellId} · choose the steam cycle, pump-speed plan and re-steam day together`}
        actions={runId ? <Link className="btn ghost" to={`/wells/${wellId}/optimize`}>New run</Link> : undefined} />
      {!runId && <Setup wellId={wellId} blocked={!!state?.ood.flag} oodDetail={state?.ood.detail} onStarted={(id) => nav(`/wells/${wellId}/optimize/${id}`)} />}
      {runId && !r && <div className="skeleton" style={{ height: 200 }} />}
      {r && (r.status === 'RUNNING' || r.status === 'QUEUED') && <Progress run={r} />}
      {r?.status === 'BLOCKED_OOD' && <Blocked detail={state?.ood.detail} wellId={wellId} />}
      {r?.status === 'SUCCEEDED' && <Results run={r} />}
    </>
  );
}

function Setup({ wellId, blocked, oodDetail, onStarted }: { wellId: string; blocked: boolean; oodDetail?: string; onStarted: (id: string) => void }) {
  const { data: design } = useWellDesign(wellId);
  const start = useStartOptimization();
  const [req, setReq] = useState<OptimizationRequest>({ well_id: wellId, scope: 'CSS_AND_SRP', steam_available_t: 1500, objective: 'balanced', max_sor: 2.5, max_failure_risk: 0.2 });
  const [params] = useSearchParams();
  const auto = useRef(false); // StrictMode runs effects twice in dev
  useEffect(() => setReq((q) => ({ ...q, well_id: wellId })), [wellId]);
  useEffect(() => {
    if (auto.current) return;
    auto.current = true;
    if (params.get('autorun') && !blocked) start.mutate({ ...req, well_id: wellId }, { onSuccess: (x) => onStarted(x.run_id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (blocked) return <Blocked detail={oodDetail} wellId={wellId} />;
  const steamBad = req.steam_available_t < v('limits.steam_t_min') || req.steam_available_t > 1600;
  return (
    <Panel title="New run" action={<span className="small muted">takes a few seconds · nothing is sent to the field</span>}>
      <div className="form">
        <label htmlFor="steam">Steam available</label>
        <div className="row"><input id="steam" className="input num" type="number" step={50} value={req.steam_available_t} aria-invalid={steamBad}
          onChange={(e) => setReq({ ...req, steam_available_t: +e.target.value })} style={{ width: 120 }} />
          <span className="small muted">tonnes for cycle {design ? design.cycle_no + 1 : '…'} ({fmt(v('limits.steam_t_min'))}–{fmt(1600)})</span></div>
        <label>Highlight</label>
        <div className="seg" role="group" aria-label="Which strategy to highlight">
          {OBJECTIVES.map((o) => <button key={o.key} aria-pressed={req.objective === o.key} onClick={() => setReq({ ...req, objective: o.key })}>{TITLE[o.label]}</button>)}
        </div>
        <label htmlFor="sor">Max steam-oil ratio</label>
        <input id="sor" className="input num" type="number" step={0.1} value={req.max_sor} onChange={(e) => setReq({ ...req, max_sor: +e.target.value })} style={{ width: 120 }} />
        <label htmlFor="risk">Max failure risk</label>
        <div className="row"><input id="risk" className="input num" type="number" value={Math.round(req.max_failure_risk * 100)} onChange={(e) => setReq({ ...req, max_failure_risk: +e.target.value / 100 })} style={{ width: 120 }} /><span className="small muted">% in 30 days, averaged over the cycle</span></div>
        <label>Safety limits</label>
        <div className="row" style={{ flexWrap: 'wrap' }}><Status tone="warn">Placeholder</Status><span className="small muted">{LIMITS_TEXT}</span></div>
      </div>
      <div className="row between" style={{ marginTop: 20 }}>
        <span className="small muted">All four strategies are always computed.</span>
        <button className="btn primary" disabled={steamBad || start.isPending} onClick={() => start.mutate(req, { onSuccess: (x) => onStarted(x.run_id) })}>
          {start.isPending ? 'Starting…' : 'Find strategies'}
        </button>
      </div>
    </Panel>
  );
}

function Blocked({ detail, wellId }: { detail?: string; wellId: string }) {
  return (
    <div className="note bad">
      <b>Optimization blocked — out of distribution.</b> {detail} Predictions would be unreliable, so an engineer must review the well first.{' '}
      <Link to={`/wells/${wellId}`}>Open the well</Link>
    </div>
  );
}

function Progress({ run }: { run: OptimizationRun }) {
  return (
    <Panel title="Searching" action={<span className="small muted">every steam design × 4 objectives · mock backend (exhaustive grid, not NSGA-III)</span>}>
      <Meter value={run.generation} max={run.of} ariaLabel={`batch ${run.generation} of ${run.of}`} />
      <div className="meter-labels"><span>{fmt(run.pareto.length)} designs evaluated</span><span>{Math.round((run.generation / run.of) * 100)}%</span></div>
    </Panel>
  );
}

function Results({ run }: { run: OptimizationRun }) {
  const initial = OBJECTIVES.find((o) => o.key === run.request.objective)?.label ?? 'BALANCED';
  const [sel, setSel] = useState<StrategyLabel>(initial);
  const [space, setSpace] = useState(false);
  const s = run.strategies.find((x) => x.label === sel) ?? run.strategies[0];
  const cur = run.current!;
  if (!s) return <div className="note warn">No design satisfies the limits. Relax the steam-oil ratio or risk limit and run again.</div>;
  const d = (a: number, b: number, better: 'up' | 'down') => {
    const x = delta(a, b);
    return x.dir === 0 ? 'same as current practice' : `${x.text} vs current practice${(better === 'up') === (x.dir > 0) ? '' : ' (worse)'}`;
  };
  const warnings = run.sanity_flags.filter((f) => f.severity !== 'INFO');

  return (
    <>
      <div className="stats">
        <StatCard variant="dark" icon={<RupeeIcon />} label={`Net ₹/day · ${TITLE[s.label].toLowerCase()}`}
          value={<Metric q={s.kpis.net_inr_per_day} name="Net ₹/day, cycle average" format={(x) => fmt(x / 1e5, 2)} unit="" />} unit="lakh"
          hint={d(cur.kpis.net_inr_per_day.value, s.kpis.net_inr_per_day.value, 'up')} />
        <StatCard variant="grey" icon={<BoltIcon />} label="Energy per barrel" value={fmt(s.kpis.kwh_per_bbl.value, 1)} unit="kWh/bbl"
          hint={d(cur.kpis.kwh_per_bbl.value, s.kpis.kwh_per_bbl.value, 'down')} />
        <StatCard variant="lime" icon={<ShieldIcon />} label="Failure risk (30 d)" value={fmt(s.kpis.failure_risk.value * 100)} unit="%"
          hint={`current practice ${pct(cur.kpis.failure_risk.value)} · rods ${s.fmi_p90.value >= 0.15 ? 'never float' : 'float'}`} />
      </div>

      {warnings.length > 0 && (
        <div className="note warn section"><b>Check before trusting:</b> {warnings.map((w) => w.detail).join('; ')}.</div>
      )}

      <div className="section">
        <Panel title="Strategies" action={<PillLink onClick={() => setSpace(true)}>All designs</PillLink>} right={<span className="small muted">click a row to see why</span>}>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Strategy</th><th>Pump speed</th><th>Re-steam</th><th className="r">Net ₹/day</th><th className="r">kWh/bbl</th><th className="r">Risk</th><th>Safety</th><th>Trust</th></tr></thead>
              <tbody>
                {[cur, ...run.strategies].map((x) => {
                  const isCur = x.label === 'CURRENT';
                  return (
                    <tr key={x.label} className={`${isCur ? '' : 'link'} ${x.label === s.label ? 'sel' : ''}`} tabIndex={isCur ? -1 : 0}
                      onClick={() => !isCur && setSel(x.label)} onKeyDown={(e) => !isCur && e.key === 'Enter' && setSel(x.label)}>
                      <td><div className="name">{TITLE[x.label]}{x.label === s.label && <span style={{ color: 'var(--lime-deep)' }}> ●</span>}</div>
                        <div className="size">{fmt(x.parameters.steam_t)} t steam · soak {x.parameters.soak_d} d · stroke {x.parameters.stroke_in} in</div></td>
                      <td className="small">{planText(x)}</td>
                      <td className="num">day {x.resteam_window.p50_day}{isCur ? <span className="faint"> habit</span> : ''}</td>
                      <td className="r num">{inr(x.kpis.net_inr_per_day.value)}</td>
                      <td className="r num">{fmt(x.kpis.kwh_per_bbl.value, 1)}</td>
                      <td className="r num">{pct(x.kpis.failure_risk.value)}</td>
                      <td>{isCur
                        ? (x.gate?.verdict === 'REJECTED' ? <Status tone="bad">{x.fmi_p90.value < 0.15 ? 'Rods float' : 'Unsafe'}</Status> : <Status tone="ok">Within limits</Status>)
                        : x.gate && <Status tone={verdictTone(x.gate.verdict)}>{VERDICT_LABEL[x.gate.verdict]}</Status>}</td>
                      <td>{x.trust && !isCur ? <Status tone={trustTone(x.trust.level)}>{x.trust.level.toLowerCase()}</Status> : <span className="faint">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="section grid-2">
        <Panel title="Pump-speed plan" action={<span className="small muted">dashed = current {cur.srp_plan[0]?.vfd_hz} Hz · green = re-steam window</span>}>
          <StepPlan blocks={s.srp_plan} until={Math.max(s.resteam_window.p90_day, s.srp_plan[s.srp_plan.length - 1]?.to_day ?? 0)}
            window={{ p10: s.resteam_window.p10_day, p90: s.resteam_window.p90_day }} compare={cur.srp_plan[0]?.vfd_hz} />
          <p className="small muted" style={{ marginBottom: 0 }}>Fast while the well is hot, slower as the oil in the tubing cools and thickens — this keeps the rods from floating.</p>
        </Panel>
        <Panel title="Why this strategy">{s.explanation && <ExplanationPanel e={s.explanation} />}</Panel>
      </div>

      <div className="section grid-2">
        <Panel title="Safety check" right={s.trust && <TrustMeter trust={s.trust} />}>{s.gate && <GateChecklist gate={s.gate} />}</Panel>
        <Panel title="Decision"><DecisionBar s={s} /></Panel>
      </div>

      {space && <SpaceDrawer run={run} selected={s} onClose={() => setSpace(false)} />}
    </>
  );
}

function planText(s: Strategy) {
  const hz = s.srp_plan.map((b) => b.vfd_hz);
  if (new Set(hz).size <= 1) return `${hz[0]} Hz fixed`;
  const low = Math.min(...hz);
  return `${hz[0]} → ${low} Hz from day ${s.srp_plan.find((b) => b.vfd_hz === low)!.from_day}`;
}

function SpaceDrawer({ run, selected, onClose }: { run: OptimizationRun; selected: Strategy; onClose: () => void }) {
  const pts = useMemo(() => run.pareto.map((p) => ({ x: p.kwh, y: p.net, front: p.front })), [run.pareto]);
  const cur = run.current!;
  return (
    <Drawer title="All designs searched" sub={`${fmt(run.pareto.length)} designs · net ₹/day against energy per barrel`} onClose={onClose}>
      <Scatter points={pts} picks={run.strategies.map((x) => ({ x: x.kpis.kwh_per_bbl.value, y: x.kpis.net_inr_per_day.value, label: TITLE[x.label], selected: x.label === selected.label }))}
        current={{ x: cur.kpis.kwh_per_bbl.value, y: cur.kpis.net_inr_per_day.value }}
        xFormat={(x) => fmt(x, 1)} yFormat={(y) => inr(y)} xLabel="kWh/bbl" yLabel="net ₹/day" />
      <p className="small muted" style={{ margin: 0 }}>Up and to the left is better. Dark dots are designs no other design beats on every measure; green dots are the four strategies.</p>
      {run.sanity_flags.length > 0 && (
        <div>
          <div className="small muted" style={{ marginBottom: 6 }}>Optimizer self-checks</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {run.sanity_flags.map((f, i) => <li key={i}>{f.strategy ? `${TITLE[f.strategy].toLowerCase()}: ` : ''}{f.detail}</li>)}
          </ul>
        </div>
      )}
    </Drawer>
  );
}
