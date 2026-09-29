import type { Strategy } from '@/api/types';
import { StatusChip, VERDICT_LABEL, trustTone, verdictTone } from '@/components/Chips';
import { Metric } from '@/components/Metric';
import { delta, fmt, inr, pct } from '@/lib/format';

const TITLE: Record<string, string> = {
  CURRENT: 'Current practice', PRODUCTION: 'Production', BALANCED: 'Balanced', ENERGY: 'Energy', RELIABILITY: 'Reliability',
};

function Delta({ a, b, better }: { a: number; b: number; better: 'up' | 'down' }) {
  const d = delta(a, b);
  if (!d.dir) return null;
  const good = (better === 'up') === d.dir > 0;
  return <span className={`dlt ${good ? 'good' : 'bad'}`}>{d.text}</span>;
}

export function StrategyCard({ s, current, selected, onSelect }: { s: Strategy; current: Strategy; selected: boolean; onSelect: () => void }) {
  const isCur = s.label === 'CURRENT';
  const k = s.kpis, c = current.kpis;
  const rejected = s.gate?.verdict === 'REJECTED';
  return (
    <button className={`card strategy ${selected ? 'selected' : ''} ${isCur ? 'is-current' : ''} ${rejected ? 'rejected' : ''}`}
      onClick={onSelect} disabled={isCur} aria-pressed={isCur ? undefined : selected}
      aria-label={`${TITLE[s.label]} strategy${s.gate ? ', ' + VERDICT_LABEL[s.gate.verdict] : ''}`}>
      <div className="row between">
        <b>{TITLE[s.label]}</b>
        {selected && <span className="star">★</span>}
      </div>
      <div className="strategy-kpis">
        <span className="label-3">Net ₹/day</span>
        <span className="row" style={{ gap: 5 }}>
          <Metric q={k.net_inr_per_day} name={`Net ₹/day · ${TITLE[s.label]}`} format={(v) => inr(v)} size="sm" />
          {!isCur && <Delta a={c.net_inr_per_day.value} b={k.net_inr_per_day.value} better="up" />}
        </span>
        <span className="label-3">Oil / cycle-day</span>
        <span className="row" style={{ gap: 5 }}>
          <span className="num">{fmt(k.oil_per_cycle_day.value, 1)}</span>
          {!isCur && <Delta a={c.oil_per_cycle_day.value} b={k.oil_per_cycle_day.value} better="up" />}
        </span>
        <span className="label-3">SOR</span><span className="num">{fmt(k.sor.value, 2)}</span>
        <span className="label-3">kWh/bbl</span>
        <span className="row" style={{ gap: 5 }}>
          <span className="num">{fmt(k.kwh_per_bbl.value, 1)}</span>
          {!isCur && <Delta a={c.kwh_per_bbl.value} b={k.kwh_per_bbl.value} better="down" />}
        </span>
        <span className="label-3">Risk (avg 30 d)</span><span className="num">{pct(k.failure_risk.value)}</span>
        <span className="label-3">Re-steam</span><span className="num">day {s.resteam_window.p50_day}</span>
      </div>
      <div className="row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
        {s.gate && !isCur && <StatusChip tone={verdictTone(s.gate.verdict)}>{s.gate.verdict === 'APPROVED_FOR_REVIEW' ? 'Gate pass' : s.gate.verdict === 'REJECTED' ? 'Rejected' : 'Review'}</StatusChip>}
        {s.trust && !rejected && <StatusChip tone={trustTone(s.trust.level)} mark={false}>trust {s.trust.level.toLowerCase()}</StatusChip>}
        {isCur && s.gate && (s.gate.verdict === 'REJECTED'
          ? <StatusChip tone="fail">{s.fmi_p90.value < 0.15 ? 'Floats as practised' : 'Fails the gate'}</StatusChip>
          : <StatusChip tone="ok">Within limits</StatusChip>)}
      </div>
    </button>
  );
}
