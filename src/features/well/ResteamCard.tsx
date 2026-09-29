import { useState } from 'react';
import { useResteam, useWellState } from '@/api/hooks';
import type { Quantity } from '@/api/types';
import { Card } from '@/components/Card';
import { LineChart, WindowDonut } from '@/components/charts';
import { Drawer } from '@/components/Drawer';
import { Metric } from '@/components/Metric';
import { dateShort, fmt, inr } from '@/lib/format';

/** Top-right card (the reference's LTV donut): where the cycle stands vs the optimal re-steam window. */
export function ResteamCard({ wellId }: { wellId: string }) {
  const { data: r } = useResteam(wellId);
  const { data: s } = useWellState(wellId);
  const [open, setOpen] = useState(false);
  if (!r || !s) return <div className="card skeleton" style={{ flex: 1 }} />;
  const w = r.window;
  const beyond = w.p50_day >= 220;
  const q = (value: number): Quantity => ({ value, provenance: 'PREDICTED', evidence_id: r.evidence_id });
  return (
    <Card title="Re-steam window" onExpand={() => setOpen(true)} expandLabel="Open the optimal-stopping curve" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="label-3">Daily net now</div>
          <Metric q={r.pi_now} name="Daily net ₹ today" size="sm" format={(v) => inr(v)} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="label-3">Best cycle average</div>
          <Metric q={r.pi_bar_star} name="Best achievable cycle-average ₹/day (π̄*)" size="sm" format={(v) => inr(v)} align="right" />
        </div>
      </div>
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 180 }}>
        <WindowDonut day={r.production_day} total={Math.max(w.p90_day + 10, 160)} p10={w.p10_day} p50={w.p50_day} p90={w.p90_day}
          center={<>
            <div className="label-3">Production day</div>
            <div className="big num">{r.production_day}</div>
            <div className="label-3">{beyond ? 'no re-steam before day 220' : `${w.p50_day - r.production_day} days to P50`}</div>
          </>} />
      </div>
      <div className="tri" style={{ marginTop: 6 }}>
        <div><div className="label-3">P10</div><div className="num">day {w.p10_day}</div></div>
        <div>
          <Metric q={q(w.p50_day)} name="Re-steam day (P50)" size="big" format={(v) => fmt(v)} align="center" />
          <div className="label-3 center">P50 · {dateShort(w.p50_date)}</div>
        </div>
        <div><div className="label-3">P90</div><div className="num">day {w.p90_day}</div></div>
      </div>
      <p className="label-3 center" style={{ margin: '8px 0 0' }}>Current practice: day {r.current_practice_cutoff_day}</p>
      {open && (
        <Drawer title="Re-steam window" sub={`${wellId} · optimal stopping on daily net ₹ (renewal–reward)`} onClose={() => setOpen(false)}>
          <LineChart
            height={200}
            ariaLabel="Daily net rupees through the cycle with the best cycle average and the re-steam window"
            xLabel="production day"
            yFormat={(v) => inr(v, { lakhDigits: 1 })}
            series={[{ x: r.curve.day, y: r.curve.p50, lo: r.curve.p10, hi: r.curve.p90, color: 'var(--accent-deep)' }]}
            hlines={[{ y: r.pi_bar_star.value, label: `π̄* ${inr(r.pi_bar_star.value)}` }]}
            vlines={[{ x: r.production_day, label: 'today', strong: true }, { x: r.current_practice_cutoff_day, label: 'practice' }]}
            bands={[{ from: w.p10_day, to: w.p90_day, label: 'window' }]}
          />
          <div className="banner info">
            Re-steam when today’s net ₹ falls to the best achievable cycle average (π̄*), counting injection, soak and mobilisation.
            The band is P10–P90 over decline-rate and level uncertainty. It assumes the pump runs no faster than the float-safe speed as the well cools.
          </div>
          <table className="t">
            <tbody>
              <tr><th>Daily net now</th><td className="r num">{inr(r.pi_now.value)}</td></tr>
              <tr><th>Best cycle average π̄*</th><td className="r num">{inr(r.pi_bar_star.value)}</td></tr>
              <tr><th>Window</th><td className="r num">day {w.p10_day} – {w.p90_day} (P50 {w.p50_day}, {dateShort(w.p50_date)})</td></tr>
              <tr><th>Steam last cycle</th><td className="r num">cycle {s.cycle.cycle_no}</td></tr>
            </tbody>
          </table>
          <p className="label-3">Prices and costs are ASSUMED registry values until OIL provides them (⚑).</p>
        </Drawer>
      )}
    </Card>
  );
}
