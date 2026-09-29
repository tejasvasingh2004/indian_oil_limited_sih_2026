import { useNavigate } from 'react-router-dom';
import { useWells } from '@/api/hooks';
import type { FailureMode } from '@/api/types';
import { AlertIcon, GaugeIcon, ShieldIcon, WellIcon } from '@/components/Icons';
import { Metric } from '@/components/Metric';
import { PageHeader } from '@/components/Shell';
import { Panel, StatCard, Status } from '@/components/ui';
import { LIMIT_LABEL, LIMIT_VAR, MODE_LABEL, fmt, pct } from '@/lib/format';

const MODES: FailureMode[] = ['ROD_FAILURE', 'PUMP_UNSETTING', 'PUMP_FAILURE'];

/** Risk Center (frontend.md §5.6): which wells may fail in the next 30 days, and why. */
export function RiskCenter() {
  const { data: wells } = useWells();
  const nav = useNavigate();
  const rows = (wells ?? []).filter((w) => w.phase === 'PRODUCTION').sort((a, b) => b.risk_30d.value - a.risk_30d.value);
  const high = rows.filter((w) => w.risk_30d.value >= 0.15);
  const float = rows.filter((w) => w.fmi_min.value < 0.17);
  const modeTotals = MODES.map((m) => ({ m, n: rows.filter((w) => w.top_mode === m).length })).sort((a, b) => b.n - a.n);

  return (
    <>
      <PageHeader title="Risk" sub="Chance of rod failure, pump unsetting or pump failure in the next 30 days · failure costs are assumed" />
      <div className="stats">
        <StatCard variant="dark" icon={<AlertIcon />} label="Wells at 15% risk or more" value={wells ? high.length : '…'} unit={wells ? `of ${rows.length}` : ''}
          hint={high[0] ? `highest: ${high[0].well_id} at ${pct(high[0].risk_30d.value)}` : ''} />
        <StatCard variant="grey" icon={<GaugeIcon />} label="Rods close to floating" value={wells ? float.length : '…'} unit="wells" hint="float margin under 0.17 (limit 0.15)" />
        <StatCard variant="lime" icon={<ShieldIcon />} label="Most common failure" value={modeTotals[0] ? MODE_LABEL[modeTotals[0].m] : '…'}
          hint={modeTotals[0] ? `top risk in ${modeTotals[0].n} wells` : ''} />
      </div>
      <div className="section">
        <Panel title="Wells by 30-day risk" action={<span className="small muted">click a well to open it</span>}>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Well</th><th className="r">Risk 30 d</th>{MODES.map((m) => <th key={m} className="r">{MODE_LABEL[m]}</th>)}<th className="r">Float margin</th><th>Limited by</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((w) => {
                  const tone = w.risk_30d.value >= 0.2 ? 'bad' : w.risk_30d.value >= 0.15 ? 'warn' : 'ok';
                  return (
                    <tr key={w.well_id} className="link" tabIndex={0} onClick={() => nav(`/wells/${w.well_id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/wells/${w.well_id}`)}>
                      <td><span className="row"><span className="well-ico"><WellIcon /></span><span><div className="name">{w.well_id}</div><div className="size">cycle {w.cycle_no} · day {w.production_day}</div></span></span></td>
                      <td className="r"><Metric q={w.risk_30d} name={`30-day failure risk · ${w.well_id}`} format={(v) => pct(v)} align="right" /></td>
                      {MODES.map((m) => <td key={m} className="r num muted">{pct(w.risk_by_mode[m], 1)}</td>)}
                      <td className="r num" style={{ color: w.fmi_min.value < 0.17 ? 'var(--bad)' : undefined }}>{fmt(w.fmi_min.value, 2)}</td>
                      <td><span className="row"><i className="dot" style={{ background: LIMIT_VAR[w.active] }} />{LIMIT_LABEL[w.active]}</span></td>
                      <td><Status tone={tone}>{tone === 'bad' ? 'High' : tone === 'warn' ? 'Watch' : 'Low'}</Status></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small faint" style={{ marginBottom: 0 }}>Risk rises when the rods run close to floating, rod stress is high or the pump runs part-empty. The model learns from OIL's failure records in the next release.</p>
        </Panel>
      </div>
    </>
  );
}
