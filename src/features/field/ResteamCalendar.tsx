import { useNavigate } from 'react-router-dom';
import type { WellSummary } from '@/api/types';
import { Panel } from '@/components/ui';
import { REG } from '@/mocks/registry';

const HORIZON = 60;

/**
 * Re-steam calendar (frontend.md §5.1): when each well is due for its next steam
 * cycle over the next 60 days. Bar = P10–P90 window, dot = most likely day.
 * Wells due the same week compete for the steam generator.
 */
export function ResteamCalendar({ wells }: { wells: WellSummary[] }) {
  const nav = useNavigate();
  const rows = wells
    .filter((w) => w.phase === 'PRODUCTION' && w.resteam_p50_day !== null && w.resteam_p50_day - w.production_day <= HORIZON)
    .map((w) => ({
      id: w.well_id,
      p10: Math.max(0, (w.resteam_p10_day ?? w.resteam_p50_day!) - w.production_day),
      p50: Math.max(0, w.resteam_p50_day! - w.production_day),
      p90: Math.max(0, (w.resteam_p90_day ?? w.resteam_p50_day!) - w.production_day),
    }))
    .sort((a, b) => a.p50 - b.p50);
  const x = (d: number) => `${(Math.min(HORIZON, d) / HORIZON) * 100}%`;
  const weeks = Array.from({ length: Math.ceil(HORIZON / 7) }, (_, i) => rows.filter((r) => r.p50 >= i * 7 && r.p50 < (i + 1) * 7).length);
  const tph = REG['steam.rate_t_per_h'].value;
  const busiest = Math.max(0, ...weeks);

  return (
    <Panel title="Re-steam calendar" action={<span className="small muted">next {HORIZON} days · bar = window, dot = best day</span>}>
      {!rows.length ? <p className="muted" style={{ margin: 0 }}>No well is due for steam in the next {HORIZON} days.</p> : (
        <>
          <div className="cal">
            <div className="cal-head">
              <span />
              <div className="cal-track">
                {[0, 15, 30, 45, 60].map((d) => <span key={d} style={{ left: x(d) }}>{d === 0 ? 'today' : `+${d} d`}</span>)}
              </div>
            </div>
            {rows.map((r) => (
              <button key={r.id} className="cal-row" onClick={() => nav(`/wells/${r.id}`)} aria-label={`${r.id}: re-steam in ${r.p50} days, window ${r.p10} to ${r.p90} days`}>
                <span className="name">{r.id}</span>
                <div className="cal-track">
                  <i className="win" style={{ left: x(r.p10), width: `calc(${x(r.p90)} - ${x(r.p10)} + 4px)` }} />
                  <i className="p50" style={{ left: x(r.p50) }} />
                </div>
              </button>
            ))}
          </div>
          <div className="row between small muted" style={{ marginTop: 10 }}>
            <span>{rows.length} wells due · busiest week has {busiest}</span>
            <span>one generator at {tph} t/h steams one well at a time {busiest > 1 ? '— stagger the busiest week' : ''}</span>
          </div>
        </>
      )}
    </Panel>
  );
}
