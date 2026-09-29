import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useAdvanceTime, useBottleneck, useBottleneckHistory, useLedger, useProduction, useResteam, useWellState,
} from '@/api/hooks';
import type { Quantity } from '@/api/types';
import { LimitBars, LineChart } from '@/components/charts';
import { TrustMeter } from '@/components/Chips';
import { Drawer } from '@/components/Drawer';
import { CalendarIcon, DropIcon, GaugeIcon } from '@/components/Icons';
import { Metric } from '@/components/Metric';
import { PageHeader } from '@/components/Shell';
import { Panel, PillLink, StatCard, Status, Tile } from '@/components/ui';
import { LIMIT_LABEL, LIMIT_VAR, MODE_LABEL, dateShort, dateTime, fmt, inr, pct } from '@/lib/format';
import { useUi } from '@/store/ui';

type Open = null | 'resteam' | 'history' | 'ledger';

export function WellPage() {
  const { wellId = 'BG-023' } = useParams();
  const { data: s } = useWellState(wellId);
  const { data: b } = useBottleneck(wellId);
  const { data: r } = useResteam(wellId);
  const { data: prod } = useProduction(wellId);
  const adv = useAdvanceTime();
  const showToast = useUi((u) => u.showToast);
  const [open, setOpen] = useState<Open>(null);
  const [twin, setTwin] = useState(false);
  const producing = s?.cycle.phase === 'PRODUCTION';
  const derived = (value: number, unit?: string): Quantity => ({ value, unit, provenance: 'DERIVED', evidence_id: b!.evidence_id, assumed: true });

  return (
    <>
      <PageHeader
        title={`Well ${wellId}`}
        sub={s ? `Cycle ${s.cycle.cycle_no} · ${s.cycle.phase.toLowerCase()} day ${s.cycle.production_day} · ${dateTime(s.as_of)}` : 'Loading…'}
        actions={<>
          {s && <TrustMeter trust={s.trust} />}
          <button className="btn ghost" disabled={adv.isPending}
            title="Demo only: the simulator sends the next day of measurements for every well"
            onClick={() => adv.mutate(1, { onSuccess: () => { setTwin(true); showToast('New day of measurements received.'); } })}>
            {adv.isPending ? 'Updating…' : '+1 day'}
          </button>
          <Link className="btn primary" to={`/wells/${wellId}/optimize`}>Optimize</Link>
        </>}
      />

      {s?.ood.flag && <div className="note bad" style={{ marginBottom: 16 }}><b>Out of distribution.</b> {s.ood.detail} Optimization is blocked until an engineer reviews it.</div>}
      {s && producing && s.indicators.fmi_min.value < s.indicators.fmi_min.limit && (
        <div className="note bad" style={{ marginBottom: 16 }}><b>Rods are floating at the current speed.</b> Float margin {fmt(s.indicators.fmi_min.value, 2)} is below {s.indicators.fmi_min.limit}. Slow the pump — see the levers below.</div>
      )}
      {twin && <TwinNote wellId={wellId} onClose={() => setTwin(false)} />}

      <div className="stats">
        <StatCard variant="dark" icon={<DropIcon />} label="Oil rate" value={s ? fmt(s.measured.oil_rate.value, 1) : '…'} unit="BOPD"
          hint={s ? `fluid ${fmt(s.measured.fluid_rate.value)} BFPD · pump ${fmt(s.estimated.fillage.value * 100)}% full` : ''} />
        <StatCard variant="grey" icon={<GaugeIcon />} label="Rod float margin"
          value={s ? <Metric q={s.indicators.fmi_min} name="Float margin (minimum along the rod string)" digits={2} /> : '…'}
          hint={s ? `limit ${s.indicators.fmi_min.limit} · weakest at ${fmt(s.indicators.fmi_min.depth_m)} m` : ''} />
        <StatCard variant="lime" icon={<CalendarIcon />} label="Re-steam in"
          value={r ? (r.window.p50_day >= 220 ? `> ${220 - r.production_day}` : r.window.p50_day - r.production_day) : producing === false ? '—' : '…'} unit="days"
          hint={r ? `best day ${r.window.p50_day} (${dateShort(r.window.p50_date)}) · window ${r.window.p10_day}–${r.window.p90_day}` : ''}
          onOpen={r ? () => setOpen('resteam') : undefined} openLabel="Why this re-steam day" />
      </div>

      {producing && b && s && (
        <div className="section">
          <Panel title="What limits this well" action={<PillLink onClick={() => setOpen('history')}>Through the cycle</PillLink>}>
            <div className="split">
              <div>
                <div className="meter-title">
                  <span className="row" style={{ display: 'inline-flex' }}><i className="dot" style={{ background: LIMIT_VAR[b.active] }} /><b style={{ fontWeight: 500 }}>{LIMIT_LABEL[b.active]}-limited.</b></span>{' '}
                  <span className="muted">{b.note?.replace(/^[^:]+:\s*/, '')}</span>
                </div>
                <LimitBars format={(v) => `${fmt(v)} bbl/d`}
                  bars={[...b.limits].sort((x, y) => x.q_bfpd - y.q_bfpd).map((l) => ({ key: l.name, label: LIMIT_LABEL[l.name], value: l.q_bfpd, active: l.name === b.active, next: l.name === b.next }))} />
              </div>
              <div className="tiles">
                <Tile label="Worth of +10%" value={<Metric q={derived(b.shadow_price.inr_per_day_at_10pct)} name="Value of relaxing the binding limit by 10%" format={(v) => fmt(v / 1000, 1)} />} of="k ₹/day" />
                <Tile label="Failure risk 30 d" value={fmt(s.risk_30d.any.value * 100)} of="%" />
              </div>
            </div>
          </Panel>
        </div>
      )}

      {producing && b && (
        <div className="section">
          <Panel title="What to change" action={<span className="small muted">ranked by net ₹/day · checked by the safety gate</span>}>
            <table className="tbl">
              <thead><tr><th>Change</th><th>Effect</th><th className="r">Net ₹/day</th><th>Gate</th></tr></thead>
              <tbody>
                {b.levers.map((l) => (
                  <tr key={l.change} style={{ opacity: l.gate === 'FAIL' ? 0.55 : 1 }}>
                    <td><div className="name">{l.change}</div><div className="size">{l.basis === 'CYCLE_AVG' ? 'cycle average' : 'next 14 days'}</div></td>
                    <td className="small muted" style={{ whiteSpace: 'normal', maxWidth: 360 }}>{l.effects}</td>
                    <td className="r"><Metric q={derived(l.d_inr_per_day)} name={l.change} format={(v) => inr(v, { signed: true })} align="right" /></td>
                    <td><Status tone={l.gate === 'PASS' ? 'ok' : l.gate === 'WARN' ? 'warn' : 'bad'} title={l.gate_detail}>{l.gate === 'PASS' ? 'Safe' : l.gate === 'WARN' ? 'Review' : 'Unsafe'}</Status></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      {producing && s && (
        <div className="section grid-2">
          <Panel title="Oil rate" action={<PillLink onClick={() => setOpen('ledger')}>Forecast check</PillLink>}>
            {prod ? (
              <LineChart height={180} ariaLabel="Oil rate for the last 80 days and a 14-day forecast with its band" xLabel="production day" yFormat={(v) => fmt(v)}
                series={[
                  { x: prod.history.map((p) => p.day), y: prod.history.map((p) => p.value), color: 'var(--ink)' },
                  { x: prod.forecast.map((p) => p.day), y: prod.forecast.map((p) => p.value), lo: prod.forecast.map((p) => p.lo!), hi: prod.forecast.map((p) => p.hi!), color: 'var(--lime-deep)', dashed: true },
                ]}
                vlines={[{ x: prod.history[prod.history.length - 1].day, label: 'today', strong: true }]} />
            ) : <div className="skeleton" style={{ height: 180 }} />}
          </Panel>
          <Panel title="Vitals" action={<span className="small muted">underlined = estimated, click for how</span>}>
            <div className="grid-3" style={{ gap: 10 }}>
              <div className="tile"><Metric q={s.estimated.t_nwb_c} name="Temperature near the well (estimated)" label="Temp near well" unit="°C" size="mid" /></div>
              <div className="tile"><Metric q={s.estimated.viscosity_cp} name="Oil viscosity (estimated)" label="Viscosity" unit="cP" size="mid" /></div>
              <div className="tile"><Metric q={s.measured.vfd_hz} name="Pump speed" label={`Pump · ${fmt(s.measured.spm.value, 1)} SPM`} unit="Hz" size="mid" /></div>
              <div className="tile"><Metric q={s.measured.kwh_per_bbl} name="Energy per barrel" label="Energy" digits={1} unit="kWh/bbl" size="mid" /></div>
              <div className="tile"><Metric q={s.estimated.pip_psi} name="Pump intake pressure (estimated)" label="Pump intake" unit="psi" size="mid" /></div>
              <div className="tile"><Metric q={s.indicators.goodman_sr_max} name="Rod stress (Goodman ratio)" label="Rod stress" digits={2} size="mid" /></div>
            </div>
          </Panel>
        </div>
      )}

      {open === 'resteam' && <ResteamDrawer wellId={wellId} onClose={() => setOpen(null)} />}
      {open === 'history' && <HistoryDrawer wellId={wellId} onClose={() => setOpen(null)} />}
      {open === 'ledger' && <LedgerDrawer wellId={wellId} onClose={() => setOpen(null)} />}
    </>
  );
}

function TwinNote({ wellId, onClose }: { wellId: string; onClose: () => void }) {
  const { data: ledger } = useLedger(wellId);
  const last = ledger?.[ledger.length - 1];
  if (!last) return null;
  return (
    <div className={`note ${last.in_interval ? 'ok' : 'warn'} row between`} style={{ marginBottom: 16 }} role="status">
      <span><b>Day {last.day} measured.</b> Oil {fmt(last.actual, 1)} BOPD vs forecast {fmt(last.predicted, 1)} ({fmt(last.lo, 1)}–{fmt(last.hi, 1)}) — {last.in_interval ? 'inside the band. The twin updated its state.' : 'outside the band; the twin re-estimated its state.'}</span>
      <button className="btn ghost sm" onClick={onClose} aria-label="Dismiss">OK</button>
    </div>
  );
}

function ResteamDrawer({ wellId, onClose }: { wellId: string; onClose: () => void }) {
  const { data: r } = useResteam(wellId);
  if (!r) return null;
  const w = r.window;
  return (
    <Drawer title="When to re-steam" sub={`${wellId} · stop producing when today's profit falls to the best cycle average`} onClose={onClose}>
      <LineChart height={200} ariaLabel="Daily net rupees through the cycle, the best cycle average and the re-steam window"
        xLabel="production day" yFormat={(v) => inr(v, { lakhDigits: 1 })}
        series={[{ x: r.curve.day, y: r.curve.p50, lo: r.curve.p10, hi: r.curve.p90, color: 'var(--ink)' }]}
        hlines={[{ y: r.pi_bar_star.value, label: `best average ${inr(r.pi_bar_star.value)}` }]}
        vlines={[{ x: r.production_day, label: 'today', strong: true }, { x: r.current_practice_cutoff_day, label: 'habit' }]}
        bands={[{ from: w.p10_day, to: w.p90_day, label: 'window' }]} />
      <div className="grid-2">
        <Tile label="Today's net" value={<Metric q={r.pi_now} name="Daily net ₹ today" format={(v) => fmt(v / 1e5, 2)} unit="" />} of="L ₹/day" />
        <Tile label="Best cycle average" value={<Metric q={r.pi_bar_star} name="Best achievable cycle average" format={(v) => fmt(v / 1e5, 2)} unit="" />} of="L ₹/day" />
      </div>
      <div className="note">Re-steam between day <b>{w.p10_day}</b> and <b>{w.p90_day}</b> (most likely day {w.p50_day}) instead of day {r.current_practice_cutoff_day} by habit. The window covers uncertainty in how fast the well declines. Prices are assumed until OIL provides them.</div>
    </Drawer>
  );
}

function HistoryDrawer({ wellId, onClose }: { wellId: string; onClose: () => void }) {
  const { data: hist } = useBottleneckHistory(wellId);
  const { data: b } = useBottleneck(wellId);
  const { data: s } = useWellState(wellId);
  const end = hist?.length ? hist[hist.length - 1].to_day : 1;
  return (
    <Drawer title="What limits the well through the cycle" sub={`${wellId} · hatched = forecast`} onClose={onClose}>
      {hist && (
        <>
          <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden' }} role="img"
            aria-label={hist.map((h) => `${LIMIT_LABEL[h.active]} day ${h.from_day}–${h.to_day}${h.forecast ? ' forecast' : ''}`).join(', ')}>
            {hist.map((h, i) => (
              <div key={i} title={`${LIMIT_LABEL[h.active]} · day ${h.from_day}–${h.to_day}`}
                style={{ flex: h.to_day - h.from_day + 1, background: LIMIT_VAR[h.active],
                  backgroundImage: h.forecast ? 'repeating-linear-gradient(135deg, rgba(255,255,255,.65) 0 2px, transparent 2px 7px)' : undefined }} />
            ))}
          </div>
          <div className="row between small muted"><span>day 0</span><span>day {end}</span></div>
          <div className="legend">{[...new Set(hist.map((h) => h.active))].map((a) => <span key={a}><i className="dot" style={{ background: LIMIT_VAR[a] }} />{LIMIT_LABEL[a]}</span>)}</div>
        </>
      )}
      {b && (
        <table className="tbl">
          <thead><tr><th>Limit</th><th className="r">bbl/d fluid</th><th>How it is set</th></tr></thead>
          <tbody>{[...b.limits].sort((x, y) => x.q_bfpd - y.q_bfpd).map((l) => (
            <tr key={l.name}><td>{LIMIT_LABEL[l.name]}</td><td className="r num">{fmt(l.q_bfpd, 1)}</td><td className="small muted">{l.basis}</td></tr>
          ))}</tbody>
        </table>
      )}
      {s && (
        <table className="tbl">
          <thead><tr><th>Failure mode (30 days)</th><th className="r">Probability</th></tr></thead>
          <tbody>{Object.entries(s.risk_30d.by_mode).map(([k, v]) => <tr key={k}><td>{MODE_LABEL[k]}</td><td className="r num">{pct(v, 1)}</td></tr>)}</tbody>
        </table>
      )}
    </Drawer>
  );
}

function LedgerDrawer({ wellId, onClose }: { wellId: string; onClose: () => void }) {
  const { data: ledger } = useLedger(wellId);
  const cov = ledger?.length ? ledger.filter((e) => e.in_interval).length / ledger.length : 0;
  return (
    <Drawer title="Forecast check" sub={`${wellId} · yesterday's forecast vs today's measurement`} onClose={onClose}>
      <div className="note">{pct(cov)} of the last {ledger?.length ?? 0} days landed inside the forecast band (target about 80%).</div>
      <table className="tbl">
        <thead><tr><th>Day</th><th className="r">Forecast</th><th className="r">Band</th><th className="r">Measured</th><th /></tr></thead>
        <tbody>
          {(ledger ?? []).slice().reverse().slice(0, 12).map((e) => (
            <tr key={e.day}>
              <td className="time">day {e.day}</td>
              <td className="r num">{fmt(e.predicted, 1)}</td>
              <td className="r num faint">{fmt(e.lo, 1)}–{fmt(e.hi, 1)}</td>
              <td className="r num">{fmt(e.actual, 1)}</td>
              <td><Status tone={e.in_interval ? 'ok' : 'warn'}>{e.in_interval ? 'In band' : 'Missed'}</Status></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Drawer>
  );
}
