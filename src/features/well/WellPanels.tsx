// v3 panels on the well page: rod string (US-05), heat & viscosity (US-08),
// cycle history and this well's decisions (US-25).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCycles, useRecommendations, useRodProfile, useThermal } from '@/api/hooks';
import type { Quantity } from '@/api/types';
import { DepthProfile, LineChart } from '@/components/charts';
import { VERDICT_LABEL, verdictTone } from '@/components/Chips';
import { Metric } from '@/components/Metric';
import { Panel, PillLink, Status } from '@/components/ui';
import { fmt, inr, pct } from '@/lib/format';

const STRATEGY: Record<string, string> = { PRODUCTION: 'Most oil', BALANCED: 'Balanced', ENERGY: 'Least energy', RELIABILITY: 'Most reliable' };

export function RodStringPanel({ wellId }: { wellId: string }) {
  const { data: r } = useRodProfile(wellId);
  if (!r) return <Panel title="Rod string"><div className="skeleton" style={{ height: 250 }} /></Panel>;
  const q = (value: number): Quantity => ({ value, provenance: 'DERIVED', evidence_id: r.evidence_id, assumed: true });
  return (
    <Panel title="Rod string" action={<PillLink to={`/wells/${wellId}/3d`}>See in 3D</PillLink>}
      right={<Status tone={r.fmi_min < r.fmi_limit ? 'bad' : r.fmi_min < r.fmi_limit + 0.05 ? 'warn' : 'ok'}>{r.fmi_min < r.fmi_limit ? 'Floating' : 'Not floating'}</Status>}>
      <DepthProfile depth={r.depth_m} value={r.fmi} limit={r.fmi_limit} weakDepth={r.fmi_min_depth_m}
        sections={r.sections.map((s) => ({ from_m: s.from_m, to_m: s.to_m, label: `${s.diameter_in}″ grade ${s.grade}` }))}
        ariaLabel={`Float margin along the rod string at ${fmt(r.vfd_hz)} Hz. Weakest point ${fmt(r.fmi_min, 2)} at ${fmt(r.fmi_min_depth_m)} m; limit ${r.fmi_limit}.`} />
      <table className="tbl" style={{ marginTop: 10 }}>
        <thead><tr><th>Section</th><th>Depth</th><th className="r">Rod stress</th><th className="r">Fatigue used</th></tr></thead>
        <tbody>
          {r.sections.map((s) => (
            <tr key={s.section}>
              <td><span className="name">{s.section}</span> <span className="size">{s.diameter_in}″ · grade {s.grade}</span></td>
              <td className="time">{fmt(s.from_m)}–{fmt(s.to_m)} m</td>
              <td className="r"><Metric q={q(s.goodman_sr)} name={`Goodman stress ratio, section ${s.section}`} digits={2} align="right" />
                <span className="size"> / {r.goodman_limit}</span></td>
              <td className="r num">{pct(s.damage_cum, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small faint" style={{ margin: '10px 0 0' }}>
        Float margin is how much faster the rods fall than the horsehead moves down. Below {r.fmi_limit} the rods float and the string buckles. Impact index {fmt(r.impact_index, 2)}.
      </p>
    </Panel>
  );
}

export function HeatPanel({ wellId }: { wellId: string }) {
  const { data: t } = useThermal(wellId);
  const [view, setView] = useState<'temp' | 'visc'>('temp');
  return (
    <Panel title="Heat and viscosity"
      action={<span className="seg" role="group" aria-label="Chart">
        <button aria-pressed={view === 'temp'} onClick={() => setView('temp')}>Cooling</button>
        <button aria-pressed={view === 'visc'} onClick={() => setView('visc')}>Viscosity vs temperature</button>
      </span>}>
      {!t ? <div className="skeleton" style={{ height: 220 }} /> : view === 'temp' ? (
        <>
          <LineChart height={220} xLabel="production day" yFormat={(v) => `${fmt(v)}°`}
            ariaLabel={`Near-well temperature through the cycle, falling toward the reservoir temperature of ${t.reservoir_t_c} degrees`}
            series={[
              { x: t.days.filter((d) => d <= t.today), y: t.t_nwb_c.filter((_, i) => t.days[i] <= t.today), color: 'var(--ink)' },
              { x: t.days.filter((d) => d >= t.today), y: t.t_nwb_c.filter((_, i) => t.days[i] >= t.today), color: 'var(--warn)', dashed: true },
            ]}
            hlines={[{ y: t.reservoir_t_c, label: `reservoir ${t.reservoir_t_c}°` }]}
            vlines={[{ x: t.today, label: 'today', strong: true }]} />
          <p className="small faint" style={{ margin: '8px 0 0' }}>The steam's heat spreads out and the zone cools; oil thickens as it does, which is what ends the cycle.</p>
        </>
      ) : (
        <>
          <LineChart height={220} yLog xLabel="temperature °C" xFormat={(v) => `${fmt(v)}°`} yFormat={(v) => fmt(v)}
            ariaLabel="Oil viscosity against temperature on a log scale, with OIL's published range at 50 degrees"
            series={[{ x: t.curve.t_c, y: t.curve.mu_cp, color: 'var(--ink)' }]}
            marks={[{ x: t.anchor.t_c, lo: t.anchor.lo, hi: t.anchor.hi, label: t.anchor.label }]} />
          <p className="small faint" style={{ margin: '8px 0 0' }}>Walther curve (cP, log scale) anchored on OIL's value at {t.anchor.t_c} °C; the slope is assumed until lab data arrive ⚑.</p>
        </>
      )}
    </Panel>
  );
}

export function CyclesPanel({ wellId }: { wellId: string }) {
  const { data: rows } = useCycles(wellId);
  return (
    <Panel title="Steam cycles" action={<span className="small muted">history is simulated</span>}>
      <div className="scroll-x">
        <table className="tbl">
          <thead><tr><th>Cycle</th><th className="r">Steam</th><th className="r">Soak</th><th className="r">Pump</th><th className="r">Stopped</th><th className="r">Oil</th><th className="r">Peak</th><th className="r">SOR</th></tr></thead>
          <tbody>
            {(rows ?? []).map((c) => (
              <tr key={c.cycle_no}>
                <td><span className="name">{c.cycle_no}</span> {c.status === 'IN_PROGRESS' && <Status tone="info">now</Status>}</td>
                <td className="r num">{fmt(c.steam_t)} t</td>
                <td className="r num">{c.soak_d} d</td>
                <td className="r num">{fmt(c.vfd_hz)} Hz</td>
                <td className="r num">day {c.cutoff_day}</td>
                <td className="r num">{fmt(c.cycle_oil_bbl)} bbl</td>
                <td className="r num">{fmt(c.peak_bopd, 1)}</td>
                <td className="r num">{fmt(c.sor, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function WellDecisionsPanel({ wellId }: { wellId: string }) {
  const { data } = useRecommendations(wellId);
  const nav = useNavigate();
  return (
    <Panel title="Decisions for this well" action={<PillLink to="/recommendations">Inbox</PillLink>}>
      {!data?.length ? (
        <p className="muted" style={{ margin: 0 }}>No recommendations yet. <Link to={`/wells/${wellId}/optimize`}>Run the optimizer</Link> to get one.</p>
      ) : (
        <table className="tbl">
          <thead><tr><th>Day</th><th>Strategy</th><th className="r">Net ₹/day</th><th>Safety</th><th>Status</th></tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.recommendation_id} className="link" tabIndex={0} onClick={() => nav(`/wells/${wellId}/optimize/${r.run_id}`)}
                onKeyDown={(e) => e.key === 'Enter' && nav(`/wells/${wellId}/optimize/${r.run_id}`)}>
                <td className="time">day {r.created_day}</td>
                <td>{STRATEGY[r.strategy] ?? r.strategy}{r.comment && <div className="size">“{r.comment}”</div>}</td>
                <td className="r num">{inr(r.net_inr_per_day)}</td>
                <td><Status tone={verdictTone(r.verdict)}>{VERDICT_LABEL[r.verdict]}</Status></td>
                <td><Status tone={r.status === 'APPROVED' ? 'ok' : r.status === 'REJECTED' ? 'bad' : r.status === 'PENDING' ? 'info' : 'neutral'}>{r.status.toLowerCase()}</Status></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
