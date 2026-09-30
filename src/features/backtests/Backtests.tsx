import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBacktest, useLatestBacktest, useStartBacktest } from '@/api/hooks';
import type { BacktestRun, Quantity } from '@/api/types';
import { HistoryIcon, RupeeIcon, ShieldIcon } from '@/components/Icons';
import { Metric } from '@/components/Metric';
import { PageHeader } from '@/components/Shell';
import { Meter, Panel, StatCard, Status } from '@/components/ui';
import { fmt, inr, pct } from '@/lib/format';
import { canAct, useRole } from '@/store/role';

const STEPS = [
  ['Learn', 'Fit the twin on cycles before cycle k only.'],
  ['Check the forecast', 'Predict cycle k with the settings actually used, then compare with what happened.'],
  ['Skill gate', 'Keep only cycles where the oil forecast was within 20%; the band should hold 70–90% of actuals.'],
  ['Optimize', 'Re-plan cycle k with the same limits and prices; record the predicted difference.'],
  ['Report', 'Forecast skill first. Gains only for cycles that passed the skill gate.'],
];

/**
 * Counterfactual backtest (frontend.md §5.9, system-design §15, US-22).
 * Skill always comes before gains; gains count only skill-passing cycles.
 */
export function Backtests() {
  const role = useRole((r) => r.role);
  const { data: latest } = useLatestBacktest();
  const start = useStartBacktest();
  const [runId, setRunId] = useState<string | undefined>();
  const { data: live } = useBacktest(runId ?? latest?.backtest_id);
  const run = live ?? latest ?? null;
  const running = run?.status === 'RUNNING' || start.isPending;

  return (
    <>
      <PageHeader title="Backtests" sub="Prove the value on history before anything touches the field · history here is simulated"
        actions={<button className="btn primary" disabled={running || !canAct(role)} title={canAct(role) ? '' : 'Viewers cannot start runs'}
          onClick={() => start.mutate(undefined, { onSuccess: (r) => setRunId(r.backtest_id) })}>
          {running ? 'Running…' : run ? 'Run again' : 'Run backtest'}
        </button>} />

      {run?.summary ? <Report run={run} /> : (
        <div className="grid-2">
          <Panel title="How it works">
            <Steps />
          </Panel>
          <Panel title={running ? 'Running' : 'No run yet'}>
            {running && run ? (
              <>
                <div className="meter-title">Replaying wells {run.progress} of {run.of}</div>
                <Meter value={run.progress} max={run.of || 1} ariaLabel={`Backtest progress: ${run.progress} of ${run.of} wells`} />
                <p className="small faint">For every past cycle: calibrate on earlier cycles, forecast, check skill, re-optimize.</p>
              </>
            ) : (
              <p className="muted" style={{ margin: 0 }}>Start a run to replay every producing well's past cycles. No gain is shown until it comes from a stored, replayable run.</p>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}

function Steps() {
  return (
    <table className="tbl">
      <tbody>
        {STEPS.map(([t, d], i) => (
          <tr key={t}><td className="time">{i + 1}</td><td><div className="name">{t}</div><div className="size" style={{ whiteSpace: 'normal' }}>{d}</div></td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Report({ run }: { run: BacktestRun }) {
  const s = run.summary!;
  const th = run.thresholds;
  const covOk = s.coverage >= th.coverage_lo && s.coverage <= th.coverage_hi;
  const q = (value: number): Quantity => ({ value, provenance: 'BACKTESTED', evidence_id: run.evidence_id ?? '', assumed: true });
  const [show, setShow] = useState<'all' | 'excluded'>('all');
  const rows = run.cycles.filter((c) => show === 'all' || !c.skill_pass);

  return (
    <>
      <div className="stats">
        <StatCard variant="dark" icon={<ShieldIcon />} label="1 · Forecast error (median)" value={fmt(s.median_ape * 100, 1)} unit="%"
          hint={`${s.cycles_evaluated} past cycles on ${s.wells} wells · gate ≤ ${fmt(th.ape_max * 100)}%`} />
        <StatCard variant="grey" icon={<HistoryIcon />} label="Actuals inside the band" value={fmt(s.coverage * 100)} unit="%"
          hint={`target ${fmt(th.coverage_lo * 100)}–${fmt(th.coverage_hi * 100)}% · ${covOk ? 'calibrated' : 'needs recalibration'}`} />
        <StatCard variant="lime" icon={<RupeeIcon />} label="2 · Predicted gain per cycle-day"
          value={run.evidence_id ? <Metric q={q(s.d_net_median)} name="Median predicted net gain on skill-passing cycles" format={(v) => inr(v, { signed: true })} unit="" /> : inr(s.d_net_median)}
          hint={`${s.passing} cycles passed skill · ${s.excluded} excluded · P10–P90 ${inr(s.d_net_p10)} to ${inr(s.d_net_p90)}`} />
      </div>

      <div className="section grid-2">
        <Panel title="Skill first" right={<Status tone={covOk && s.median_ape <= th.ape_max ? 'ok' : 'warn'}>{covOk && s.median_ape <= th.ape_max ? 'Skill shown' : 'Check skill'}</Status>}>
          <div className="meter-title">Cycles that passed the skill gate</div>
          <Meter value={s.passing} max={s.cycles_evaluated || 1} ariaLabel={`${s.passing} of ${s.cycles_evaluated} cycles passed`} />
          <div className="meter-labels"><span>{s.passing} passed</span><span>{s.excluded} excluded from gains</span></div>
          <table className="tbl" style={{ marginTop: 14 }}>
            <tbody>
              <tr><td>Median steam-oil ratio change</td><td className="r num">{fmt(s.d_sor_median, 2)}</td></tr>
              <tr><td>Median energy change</td><td className="r num">{fmt(s.d_kwh_median, 2)} kWh/bbl</td></tr>
              <tr><td>Registry</td><td className="r">{run.registry_version}</td></tr>
              <tr><td>History</td><td className="r"><Status tone="warn">simulated</Status></td></tr>
            </tbody>
          </table>
          <p className="small faint" style={{ margin: '10px 0 0' }}>Gains are what the twin predicts the optimized settings would have earned on the same cycles — a prediction on simulated history, not a field result. OIL's cycle records replace this history in the next release.</p>
        </Panel>
        <Panel title="How it works"><Steps /></Panel>
      </div>

      <div className="section">
        <Panel title="Cycles" action={<span className="seg" role="group" aria-label="Filter cycles">
          <button aria-pressed={show === 'all'} onClick={() => setShow('all')}>All</button>
          <button aria-pressed={show === 'excluded'} onClick={() => setShow('excluded')}>Excluded</button>
        </span>} right={<span className="small muted">{run.backtest_id}</span>}>
          <div className="scroll-x" style={{ maxHeight: 460, overflowY: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Well · cycle</th><th>Learned from</th><th className="r">Forecast</th><th className="r">Actual</th><th className="r">Error</th><th>Skill</th><th className="r">Δ net ₹/day</th><th>Optimized design</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={`${c.well_id}-${c.cycle_no}`}>
                    <td><Link to={`/wells/${c.well_id}`} className="name">{c.well_id}</Link> <span className="size">c{c.cycle_no}</span></td>
                    <td className="time">cycles {c.calibrated_on[0]}–{c.calibrated_on[c.calibrated_on.length - 1]}</td>
                    <td className="r num">{fmt(c.forecast_oil)}<div className="size">{fmt(c.lo)}–{fmt(c.hi)}</div></td>
                    <td className="r num">{fmt(c.actual_oil)}</td>
                    <td className="r num">{pct(c.ape, 1)}</td>
                    <td><Status tone={c.skill_pass ? 'ok' : 'bad'}>{c.skill_pass ? 'pass' : 'excluded'}</Status></td>
                    <td className="r num" style={{ opacity: c.skill_pass ? 1 : 0.4 }}>{inr(c.d_net, { signed: true })}</td>
                    <td className="small muted">{c.d_net > 0 ? `${fmt(c.optimized.steam_t)} t · soak ${c.optimized.soak_d} d` : 'no better design found'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
