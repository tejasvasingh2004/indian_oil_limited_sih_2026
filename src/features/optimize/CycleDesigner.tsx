import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useOptimization, useStartOptimization, useWellDesign, useWellState } from '@/api/hooks';
import type { OptimizationRequest, OptimizationRun, Strategy, StrategyLabel } from '@/api/types';
import { Card } from '@/components/Card';
import { Scatter, StepPlan } from '@/components/charts';
import { DataModeChip, StatusChip } from '@/components/Chips';
import { Frame } from '@/components/Frame';
import { PillBar } from '@/components/PillBar';
import { DesertScene } from '@/components/scenes/DesertScene';
import { fmt, inr, pct } from '@/lib/format';
import { REG } from '@/mocks/registry';

const v = (k: keyof typeof REG) => REG[k].value;
/** constraint summary built from the parameter registry, never typed */
const LIMITS_TEXT = `FMI ≥ ${v('limits.fmi_min')} · Goodman ≤ ${v('limits.goodman_sr').toFixed(2)} · fillage ≥ ${v('limits.fillage_min')} · VFD ${v('limits.vfd_hz_min')}–${v('limits.vfd_hz_max')} Hz · ≤ ${v('limits.inj_pressure_ksc_max')} ksc`;
import { StrategyCard } from './StrategyCard';
import { Comparison } from './Comparison';
import { ExplanationPanel, GateChecklist } from './Explanation';
import { DecisionBar } from './DecisionBar';

const OBJECTIVES: { key: OptimizationRequest['objective']; label: StrategyLabel }[] = [
  { key: 'balanced', label: 'BALANCED' }, { key: 'production', label: 'PRODUCTION' },
  { key: 'energy', label: 'ENERGY' }, { key: 'reliability', label: 'RELIABILITY' },
];

export function CycleDesigner() {
  const { wellId = 'BG-023', runId } = useParams();
  const nav = useNavigate();
  const { data: state } = useWellState(wellId);
  const run = useOptimization(runId);
  const r = run.data;

  return (
    <Frame scene={<DesertScene spm={state?.measured.spm.value} />} focus>
      <header className="hero-title compact">
        <h1>Cycle Designer</h1>
        <p>Well {wellId} · steam design, pump-speed plan and re-steam day chosen together</p>
        <div className="hero-chips">
          <DataModeChip />
          <StatusChip tone="info">Mock optimizer: exhaustive grid, not NSGA-III</StatusChip>
        </div>
      </header>

      <div className="designer scroll">
        {!runId && <Setup wellId={wellId} blocked={!!state?.ood.flag} oodDetail={state?.ood.detail}
          onStarted={(id) => nav(`/wells/${wellId}/optimize/${id}`)} />}
        {runId && !r && <div className="card skeleton" style={{ height: 300 }} />}
        {r && (r.status === 'RUNNING' || r.status === 'QUEUED') && <Progress run={r} />}
        {r?.status === 'BLOCKED_OOD' && <Blocked detail={state?.ood.detail} wellId={wellId} />}
        {r?.status === 'SUCCEEDED' && <Results run={r} />}
      </div>

      <PillBar wellId={wellId} wellSuffix="/optimize" actions={<>
        <Link className="pill-btn" to={`/wells/${wellId}`}>Well console</Link>
        {runId && <Link className="pill-btn" to={`/wells/${wellId}/optimize`}>New run <span className="plus">+</span></Link>}
        <Link className="pill-btn primary" to="/recommendations">Inbox</Link>
      </>} />
    </Frame>
  );
}

function Setup({ wellId, blocked, oodDetail, onStarted }: { wellId: string; blocked: boolean; oodDetail?: string; onStarted: (runId: string) => void }) {
  const { data: design } = useWellDesign(wellId);
  const start = useStartOptimization();
  const [req, setReq] = useState<OptimizationRequest>({
    well_id: wellId, scope: 'CSS_AND_SRP', steam_available_t: 1500, objective: 'balanced', max_sor: 2.5, max_failure_risk: 0.2,
  });
  useEffect(() => setReq((q) => ({ ...q, well_id: wellId })), [wellId]);
  // ?autorun=1 starts with the defaults (demo convenience)
  const [params] = useSearchParams();
  const autoStarted = useRef(false); // StrictMode runs effects twice in dev
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    if (params.get('autorun') && !blocked) start.mutate({ ...req, well_id: wellId }, { onSuccess: (r) => onStarted(r.run_id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (blocked) return <Blocked detail={oodDetail} wellId={wellId} />;
  const bad = req.steam_available_t < 800 || req.steam_available_t > 1600 || req.max_sor <= 0 || req.max_failure_risk <= 0 || req.max_failure_risk > 1;
  return (
    <Card strong style={{ maxWidth: 760, margin: '10px auto 0', width: '100%' }} title="New optimization run">
      <div className="setup-grid">
        <label>Scope</label>
        <div className="seg" role="group" aria-label="Scope">
          <button aria-pressed>Next cycle: steam + pump plan + re-steam day</button>
          <button disabled title="Arrives with the SRP-only endpoint">Rest of current cycle (next build)</button>
        </div>
        <label htmlFor="steam">Steam available</label>
        <div className="row field"><input id="steam" type="number" step={50} value={req.steam_available_t} aria-invalid={req.steam_available_t < 800 || req.steam_available_t > 1600}
          onChange={(e) => setReq({ ...req, steam_available_t: +e.target.value })} style={{ width: 110 }} /><span className="faint">t · generator allocation for cycle {design ? design.cycle_no + 1 : '…'} ({fmt(v('limits.steam_t_min'))}–{fmt(1600)})</span></div>
        <label>Objective</label>
        <div className="seg" role="group" aria-label="Objective">
          {OBJECTIVES.map((o) => <button key={o.key} aria-pressed={req.objective === o.key} onClick={() => setReq({ ...req, objective: o.key })}>{o.key}</button>)}
        </div>
        <label htmlFor="sor">Max SOR</label>
        <div className="row field"><input id="sor" type="number" step={0.1} value={req.max_sor} onChange={(e) => setReq({ ...req, max_sor: +e.target.value })} style={{ width: 110 }} /></div>
        <label htmlFor="risk">Max failure risk</label>
        <div className="row field"><input id="risk" type="number" step={1} value={Math.round(req.max_failure_risk * 100)} onChange={(e) => setReq({ ...req, max_failure_risk: +e.target.value / 100 })} style={{ width: 110 }} /><span className="faint">% · mean 30-day risk over the cycle</span></div>
        <label>Constraint set</label>
        <div className="row"><StatusChip tone="warn">default-v4 · PLACEHOLDER limits</StatusChip><span className="label-3">{LIMITS_TEXT}</span></div>
      </div>
      <div className="row between" style={{ marginTop: 18 }}>
        <span className="label-3">All four strategies are computed; the objective picks which one is highlighted.</span>
        <button className="pill-btn primary" disabled={bad || start.isPending} onClick={() => start.mutate(req, { onSuccess: (r) => onStarted(r.run_id) })}>
          {start.isPending ? 'Starting…' : 'Optimize'} <span className="plus">→</span>
        </button>
      </div>
    </Card>
  );
}

function Blocked({ detail, wellId }: { detail?: string; wellId: string }) {
  return (
    <Card strong style={{ maxWidth: 640, margin: '10px auto 0' }}>
      <div className="banner fail" role="alert" style={{ flexDirection: 'column' }}>
        <b>⛔ Out-of-distribution condition</b>
        <span>{detail}</span>
        <span>Prediction confidence: LOW · Optimization: BLOCKED · Recommendation: ENGINEER REVIEW</span>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <Link className="pill-btn" to={`/wells/${wellId}`}>View state details</Link>
        <Link className="pill-btn" to={`/wells/${wellId}/scenario-lab`}>Open Scenario Lab (low-confidence mode)</Link>
      </div>
    </Card>
  );
}

function Progress({ run }: { run: OptimizationRun }) {
  const done = run.generation / run.of;
  return (
    <Card strong style={{ maxWidth: 760, margin: '10px auto 0', width: '100%' }} title="Searching steam designs">
      <div className="progress" style={{ height: 8 }} aria-label={`batch ${run.generation} of ${run.of}`}><span style={{ width: `${done * 100}%` }} /></div>
      <div className="row between label-3" style={{ marginTop: 6 }}>
        <span>batch {run.generation} / {run.of} · {fmt(run.pareto.length)} designs evaluated × 4 objective presets</span>
        <span>{fmt(run.pareto.filter((p) => p.front).length)} on the front so far</span>
      </div>
      <div style={{ marginTop: 12 }}>
        <Scatter points={run.pareto.map((p) => ({ x: p.kwh, y: p.net, front: false }))} picks={[]} xKey="kWh/bbl" yKey="net ₹/day"
          xFormat={(v) => fmt(v, 1)} yFormat={(v) => inr(v, { lakhDigits: 2 })} xLabel="kWh/bbl" yLabel="net ₹/day" />
      </div>
    </Card>
  );
}

type Axes = 'energy' | 'risk' | 'oil';

function Results({ run }: { run: OptimizationRun }) {
  const initial = OBJECTIVES.find((o) => o.key === run.request.objective)?.label ?? 'BALANCED';
  const [sel, setSel] = useState<StrategyLabel>(initial);
  const [axes, setAxes] = useState<Axes>('energy');
  const selected = run.strategies.find((s) => s.label === sel) ?? run.strategies[0];
  const cur = run.current!;
  const pts = useMemo(() => run.pareto.map((p) => ({
    x: axes === 'energy' ? p.kwh : axes === 'risk' ? p.risk : p.risk,
    y: axes === 'oil' ? p.oil : p.net, front: p.front,
  })), [run.pareto, axes]);
  const at = (s: Strategy) => ({
    x: axes === 'energy' ? s.kpis.kwh_per_bbl.value : s.kpis.failure_risk.value,
    y: axes === 'oil' ? s.kpis.cycle_oil_bbl.value : s.kpis.net_inr_per_day.value,
  });

  return (
    <>
      {run.sanity_flags.length > 0 && <SanityPanel flags={run.sanity_flags} />}

      <div className="strategies">
        <StrategyCard s={cur} current={cur} selected={false} onSelect={() => undefined} />
        {run.strategies.map((s) => <StrategyCard key={s.label} s={s} current={cur} selected={s.label === selected?.label} onSelect={() => setSel(s.label)} />)}
      </div>

      {selected && (
        <div className="results-grid">
          <Card strong title={`Current practice vs ${selected.label.toLowerCase()}`} titleLeft>
            <Comparison current={cur} s={selected} />
          </Card>

          <div className="stack" style={{ gap: 14 }}>
            <Card strong title="SRP plan through the cycle" sub={`${selected.label.toLowerCase()} · VFD per 7-day block · re-steam window shaded`}>
              <StepPlan blocks={selected.srp_plan} until={Math.max(selected.resteam_window.p90_day, selected.srp_plan[selected.srp_plan.length - 1]?.to_day ?? 0)}
                window={{ p10: selected.resteam_window.p10_day, p90: selected.resteam_window.p90_day }} />
              <div className="row between label-3">
                <span>current practice: {cur.srp_plan[0]?.vfd_hz} Hz fixed, re-steam day {cur.resteam_window.p50_day}</span>
                <span>P90 FMI_min {fmt(selected.fmi_p90.value, 2)}</span>
              </div>
            </Card>
            <Card strong title="Trade-off space">
              <div className="seg" role="group" aria-label="Axes" style={{ marginBottom: 6 }}>
                <button aria-pressed={axes === 'energy'} onClick={() => setAxes('energy')}>₹/day vs kWh/bbl</button>
                <button aria-pressed={axes === 'risk'} onClick={() => setAxes('risk')}>₹/day vs risk</button>
                <button aria-pressed={axes === 'oil'} onClick={() => setAxes('oil')}>oil vs risk</button>
              </div>
              <Scatter points={pts} picks={run.strategies.map((s) => ({ ...at(s), label: s.label, selected: s.label === selected.label }))} current={at(cur)}
                xKey={axes === 'energy' ? 'kWh/bbl' : 'risk'} yKey={axes === 'oil' ? 'cycle oil' : 'net ₹/day'}
                xFormat={(v) => (axes === 'energy' ? fmt(v, 1) : pct(v))} yFormat={(v) => (axes === 'oil' ? fmt(v) : inr(v))}
                xLabel={axes === 'energy' ? 'kWh/bbl' : 'avg 30-day risk'} yLabel={axes === 'oil' ? 'cycle oil (bbl)' : 'net ₹/day'} />
              <p className="label-3" style={{ margin: 0 }}>{fmt(run.pareto.length)} designs (balanced plan) · dark dots are non-dominated · ◆ current practice.</p>
            </Card>
          </div>

          <div className="stack" style={{ gap: 14 }}>
            {selected.explanation && <Card strong title="Why" titleLeft><ExplanationPanel e={selected.explanation} /></Card>}
            {selected.gate && selected.trust && <Card strong title="Safety gate & trust" titleLeft><GateChecklist gate={selected.gate} trust={selected.trust} /></Card>}
            <Card strong title="Decision" titleLeft><DecisionBar s={selected} /></Card>
          </div>
        </div>
      )}
    </>
  );
}

function SanityPanel({ flags }: { flags: OptimizationRun['sanity_flags'] }) {
  const [open, setOpen] = useState(false);
  const serious = flags.filter((f) => f.severity !== 'INFO');
  const info = flags.filter((f) => f.severity === 'INFO');
  const line = (f: OptimizationRun['sanity_flags'][number], i: number) => (
    <li key={i}><b style={{ fontWeight: 600 }}>{f.code.replace(/_/g, ' ').toLowerCase()}</b>{f.strategy ? ` · ${f.strategy.toLowerCase()}` : ''} — {f.detail}</li>
  );
  const tone = serious.some((f) => f.severity === 'FAIL') ? 'fail' : serious.length ? 'warn' : 'info';
  return (
    <div className={`banner ${tone}`} style={{ flexDirection: 'column', gap: 4 }}>
      <div className="row between" style={{ width: '100%' }}>
        <b>Optimizer sanity check · {serious.length} warning{serious.length === 1 ? '' : 's'}, {info.length} note{info.length === 1 ? '' : 's'}</b>
        {info.length > 0 && <button className="pill-btn" style={{ padding: '2px 10px' }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? 'Hide notes' : 'Show notes'}</button>}
      </div>
      {serious.length > 0 && <ul className="sanity-list">{serious.map(line)}</ul>}
      {open && <ul className="sanity-list faint">{info.map(line)}</ul>}
    </div>
  );
}
