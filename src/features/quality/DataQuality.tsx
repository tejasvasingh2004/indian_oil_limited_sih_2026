import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDataQuality, useDqSeries } from '@/api/hooks';
import type { DQSeries } from '@/api/types';
import { LineChart, type Series } from '@/components/charts';
import { AlertIcon, CalendarIcon, DatabaseIcon, WellIcon } from '@/components/Icons';
import { PageHeader } from '@/components/Shell';
import { Panel, StatCard, Status } from '@/components/ui';
import { fmt, pct } from '@/lib/format';

const FLAG: Record<string, string> = {
  IMPUTED_2H_GAP: 'gap filled', SPIKE_REMOVED: 'spike removed', SENSOR_DRIFT: 'sensor drift', STALE: 'stale',
};
const EVENT: Record<string, string> = { SHUTDOWN: 'Shutdown', MAINTENANCE: 'Maintenance', WORKOVER: 'Workover' };

/** Raw readings with gaps become separate line pieces; gaps are shaded. */
function rawPieces(d: DQSeries): { series: Series[]; gaps: { from: number; to: number }[] } {
  const series: Series[] = [];
  const gaps: { from: number; to: number }[] = [];
  let cur: Series | null = null;
  d.days.forEach((day, i) => {
    const v = d.raw[i];
    if (v === null) {
      cur = null;
      gaps.push({ from: day - 0.5, to: day + 0.5 });
      return;
    }
    if (!cur) { cur = { x: [], y: [], color: 'var(--ink-3)', width: 1.2 }; series.push(cur); }
    cur.x.push(day); cur.y.push(v);
  });
  return { series, gaps };
}

/** Data Quality Center (frontend.md §5.10, US-04): what the twin cleaned before it used the data. */
export function DataQuality() {
  const { data: rows } = useDataQuality();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const sorted = useMemo(() => [...(rows ?? [])].sort((a, b) => a.score - b.score), [rows]);
  const sel = params.get('well') ?? sorted[0]?.well_id ?? null;
  const { data: series } = useDqSeries(sel);
  const avg = rows?.length ? rows.reduce((s, r) => s + r.score, 0) / rows.length : 0;
  const flagged = rows?.filter((r) => r.score < 0.9).length ?? 0;
  const events = rows?.reduce((s, r) => s + r.events.length, 0) ?? 0;
  const pieces = series ? rawPieces(series) : null;
  const selRow = rows?.find((r) => r.well_id === sel);

  return (
    <>
      <PageHeader title="Data quality" sub="Checks run on every reading before the twin uses it · raw data is kept, cleaning is logged" />
      <div className="stats">
        <StatCard variant="dark" icon={<DatabaseIcon />} label="Average data score" value={rows ? fmt(avg * 100) : '…'} unit="%"
          hint="share of readings that passed every check" />
        <StatCard variant="grey" icon={<AlertIcon />} label="Wells below 90%" value={rows ? flagged : '…'} hint="their estimates carry lower trust" />
        <StatCard variant="lime" icon={<CalendarIcon />} label="Events in the last 50 days" value={rows ? events : '…'} hint="shutdowns, maintenance, workovers" />
      </div>

      <div className="section grid-2">
        <Panel title={sel ? `Raw vs cleaned · ${sel}` : 'Raw vs cleaned'}
          right={selRow && <Status tone={selRow.score >= 0.9 ? 'ok' : selRow.score >= 0.8 ? 'warn' : 'bad'}>{fmt(selRow.score * 100)}%</Status>}>
          {series && pieces ? (
            <>
              <LineChart height={210} xLabel="production day" yFormat={(v) => fmt(v)}
                ariaLabel={`Oil rate readings for ${sel}: raw readings in grey with gaps and spikes, cleaned series in black`}
                series={[...pieces.series, { x: series.days, y: series.cleaned, color: 'var(--ink)', width: 1.8 }]}
                bands={pieces.gaps} />
              <div className="legend" style={{ marginTop: 8 }}>
                <span><i className="dot" style={{ background: 'var(--ink-3)' }} />raw</span>
                <span><i className="dot" style={{ background: 'var(--ink)' }} />cleaned (used by the twin)</span>
                <span><i className="dot" style={{ background: 'var(--lime)' }} />gap, filled</span>
                <span>{series.flags.filter((f) => f === 'SPIKE').length} spikes removed</span>
              </div>
            </>
          ) : <div className="skeleton" style={{ height: 210 }} />}
        </Panel>
        <Panel title="Events" action={<span className="small muted">{sel}</span>}>
          {!selRow?.events.length ? <p className="muted" style={{ margin: 0 }}>No shutdowns or workovers in the window.</p> : (
            <table className="tbl">
              <thead><tr><th>Day</th><th>Event</th><th className="r">Hours</th><th>Effect on the twin</th></tr></thead>
              <tbody>{selRow.events.map((e, i) => (
                <tr key={i}>
                  <td className="time">day {e.day}</td>
                  <td>{EVENT[e.kind]}</td>
                  <td className="r num">{e.hours}</td>
                  <td className="small muted">{e.kind === 'WORKOVER' ? 'state re-estimated after restart' : 'hours excluded from fitting'}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          <p className="small faint" style={{ margin: '12px 0 0' }}>Checks: range limits, rate of change, flat-line, spikes (median filter), gaps (≤ 2 h filled, longer left empty), drift against the well test.</p>
        </Panel>
      </div>

      <div className="section">
        <Panel title="Wells" action={<span className="small muted">lowest score first · click a row to inspect</span>}>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Well</th><th className="r">Score</th><th>Flags</th><th className="r">Missing</th><th className="r">Filled</th><th className="r">Spikes</th><th className="r">Last reading</th><th /></tr></thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.well_id} className={`link ${r.well_id === sel ? 'sel' : ''}`} tabIndex={0}
                    onClick={() => setParams({ well: r.well_id })} onKeyDown={(e) => e.key === 'Enter' && setParams({ well: r.well_id })}>
                    <td><span className="row"><span className="well-ico"><WellIcon /></span><span className="name">{r.well_id}</span></span></td>
                    <td className="r num">{fmt(r.score * 100)}%</td>
                    <td className="small">{r.flags.length ? r.flags.map((f) => FLAG[f] ?? f.toLowerCase()).join(' · ') : <span className="faint">none</span>}</td>
                    <td className="r num">{pct(r.missing_pct / 100, 1)}</td>
                    <td className="r num">{pct(r.imputed_pct / 100, 1)}</td>
                    <td className="r num">{r.spikes}</td>
                    <td className="r time">{r.last_sample_min} min ago</td>
                    <td><button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); nav(`/wells/${r.well_id}`); }}>Well</button></td>
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
