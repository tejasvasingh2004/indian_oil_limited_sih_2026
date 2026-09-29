import { useState } from 'react';
import { useBottleneck, useBottleneckHistory } from '@/api/hooks';
import type { Bottleneck, Lever, Quantity } from '@/api/types';
import { Card } from '@/components/Card';
import { Bars } from '@/components/charts';
import { StatusChip } from '@/components/Chips';
import { Drawer } from '@/components/Drawer';
import { Metric } from '@/components/Metric';
import { LIMIT_LABEL, LIMIT_VAR, fmt, inr } from '@/lib/format';

const derived = (b: Bottleneck, value: number, unit?: string): Quantity =>
  ({ value, unit, provenance: 'DERIVED', evidence_id: b.evidence_id, assumed: true });

/** Bottom-left card (the reference's rating chart): rate limits with the binding one in yellow. */
export function NavigatorCard({ wellId }: { wellId: string }) {
  const { data: b } = useBottleneck(wellId);
  const [open, setOpen] = useState(false);
  if (!b) return <div className="card skeleton" style={{ flex: 1 }} />;
  const act = b.limits.find((l) => l.name === b.active)!;
  const best = b.levers.find((l) => l.gate !== 'FAIL');
  const order = ['INFLOW', 'PUMP', 'FLOAT', 'FATIGUE', 'TORQUE'] as const;
  return (
    <Card title="Bottleneck Navigator" onExpand={() => setOpen(true)} expandLabel="Open levers and bottleneck history" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="tri">
        <div>
          <div className="label-3">Binding limit</div>
          <div style={{ fontSize: 12 }}>{LIMIT_LABEL[b.active]}</div>
        </div>
        <Metric q={derived(b, act.q_bfpd)} name={`${LIMIT_LABEL[b.active]} limit`} size="big" digits={0} label={<span className="label-3">bbl/d fluid</span>} align="center" />
        <div>
          <div className="label-3">Relax +10%</div>
          <Metric q={derived(b, b.shadow_price.inr_per_day_at_10pct)} name="Value of relaxing the binding limit by 10%" size="sm" format={(v) => `${inr(v, { signed: true })}/d`} align="right" />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '14px 0 4px' }}>
        <StatusChip tone={b.active === 'INFLOW' ? 'warn' : b.active === 'FLOAT' ? 'fail' : 'info'}>{LIMIT_LABEL[b.active]}-limited</StatusChip>
      </div>
      <div style={{ flex: 1, minHeight: 150 }}>
        <div style={{ height: '100%' }}>
          <Bars
            format={(v) => fmt(v)}
            bars={order.map((n) => {
              const l = b.limits.find((x) => x.name === n)!;
              return { key: n, label: LIMIT_LABEL[n], value: l.q_bfpd, highlight: n === b.active, note: n === b.next ? 'next' : undefined };
            })}
          />
        </div>
      </div>
      <p className="label-3 center" style={{ margin: '8px 0 0' }}>{b.note}</p>
      <div className="divider" />
      {best ? (
        <div className="tri">
          <div><div className="label-3">Best lever</div><div style={{ fontSize: 11.5 }}>{best.lever === 'RESTEAM_TIMING' ? 'Re-steam timing' : best.lever === 'STROKE' ? 'Stroke' : 'VFD speed'}</div></div>
          <Metric q={derived(b, best.d_inr_per_day)} name={best.change} size="mid" format={(v) => inr(v, { signed: true })} align="center"
            label={<span className="label-3">₹/day {best.basis === 'CYCLE_AVG' ? '(cycle avg)' : ''}</span>} />
          <div><div className="label-3">Gate</div><StatusChip tone={best.gate === 'PASS' ? 'ok' : 'warn'}>{best.gate}</StatusChip></div>
        </div>
      ) : <p className="muted center">No lever passes the gate.</p>}

      {open && <NavigatorDrawer wellId={wellId} b={b} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function LeverRow({ l, b }: { l: Lever; b: Bottleneck }) {
  return (
    <div className={`lever ${l.gate === 'FAIL' ? 'fail' : ''}`}>
      <div style={{ fontWeight: 500 }}>{l.gate === 'FAIL' ? '✕ ' : ''}{l.change}</div>
      <Metric q={derived(b, l.d_inr_per_day)} name={l.change} size="sm" format={(v) => `${inr(v, { signed: true })}/d`} align="right" />
      <div className="label-3">
        {l.effects}{l.d_oil_bopd !== undefined && ` · oil ${l.d_oil_bopd >= 0 ? '+' : ''}${fmt(l.d_oil_bopd, 1)} BOPD`}
        {l.basis === 'CYCLE_AVG' && ' · cycle average'}
      </div>
      <StatusChip tone={l.gate === 'PASS' ? 'ok' : l.gate === 'WARN' ? 'warn' : 'fail'}>{l.gate}</StatusChip>
      <div className="label-3" style={{ gridColumn: '1 / -1' }}>Gate: {l.gate_detail}</div>
    </div>
  );
}

function NavigatorDrawer({ wellId, b, onClose }: { wellId: string; b: Bottleneck; onClose: () => void }) {
  const { data: hist } = useBottleneckHistory(wellId);
  const end = hist?.length ? hist[hist.length - 1].to_day + 1 : 1;
  return (
    <Drawer title="Bottleneck Navigator" sub={`${wellId} · rate limits, shadow price and levers (14-day horizon, gate-checked)`} onClose={onClose}>
      <table className="t">
        <thead><tr><th>Limit</th><th className="r">bbl/d fluid</th><th>Basis</th></tr></thead>
        <tbody>
          {[...b.limits].sort((x, y) => x.q_bfpd - y.q_bfpd).map((l) => (
            <tr key={l.name}>
              <td><span className="dot" style={{ background: LIMIT_VAR[l.name], marginRight: 6 }} />{LIMIT_LABEL[l.name]}{l.name === b.active ? ' · active' : l.name === b.next ? ' · next' : ''}</td>
              <td className="r num">{fmt(l.q_bfpd, 1)}</td>
              <td className="faint">{l.basis}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="banner info"><span>
        Relaxing <b>{LIMIT_LABEL[b.active].toLowerCase()}</b> is worth <b>{inr(b.shadow_price.inr_per_day_per_unit)}</b>/day per bbl/d of fluid;
        a 10% relaxation is worth <b>{inr(b.shadow_price.inr_per_day_at_10pct)}</b>/day{b.shadow_price.capped_by_next ? ', capped by the next limit' : ''}.
      </span></div>
      <div>
        <div className="label" style={{ marginBottom: 6 }}>Levers, ranked by net ₹/day</div>
        {b.levers.map((l) => <LeverRow key={l.change} l={l} b={b} />)}
      </div>
      {hist && (
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Bottleneck through the cycle (hatched = forecast)</div>
          <div style={{ display: 'flex', height: 22, borderRadius: 8, overflow: 'hidden' }} role="img"
            aria-label={hist.map((h) => `${LIMIT_LABEL[h.active]} day ${h.from_day}–${h.to_day}${h.forecast ? ' forecast' : ''}`).join(', ')}>
            {hist.map((h, i) => (
              <div key={i} title={`${LIMIT_LABEL[h.active]} · day ${h.from_day}–${h.to_day}${h.forecast ? ' (forecast)' : ''}`}
                style={{ flex: h.to_day - h.from_day + 1, background: LIMIT_VAR[h.active], opacity: h.forecast ? 0.45 : 0.95,
                  backgroundImage: h.forecast ? 'repeating-linear-gradient(45deg, rgba(255,255,255,.5) 0 3px, transparent 3px 7px)' : undefined }} />
            ))}
          </div>
          <div className="row between label-3" style={{ marginTop: 4 }}><span>day 0</span><span>day {end - 1}</span></div>
        </div>
      )}
      <p className="label-3">Heater, diluent and in-stroke VFD profile levers arrive in P2 (costs still ASSUMED). Values are simulated.</p>
    </Drawer>
  );
}
