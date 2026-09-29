import type { Explanation, GateCheck, GateVerdict, Trust } from '@/api/types';
import { StatusChip, TrustMeter, VERDICT_LABEL, verdictTone } from '@/components/Chips';
import { Metric } from '@/components/Metric';
import { inr } from '@/lib/format';

/** Explainability contract (system-design §14.2): every field is required. */
export function ExplanationPanel({ e }: { e: Explanation }) {
  return (
    <dl className="explain">
      <dt>What</dt>
      <dd><ul>{e.what.map((w) => <li key={w}>{w}</li>)}</ul></dd>
      <dt>Why</dt><dd>{e.why}</dd>
      <dt>Driver</dt><dd>{e.driver}</dd>
      <dt>Relation</dt><dd style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{e.governing_relation}</dd>
      <dt>Binding</dt><dd>{e.binding_limit}</dd>
      <dt>₹ effect</dt>
      <dd><Metric q={e.inr_effect} name="Change in net ₹/day vs current practice" size="sm" format={(v) => `${inr(v, { signed: true })}/day`} showRange /></dd>
      <dt>Confidence</dt><dd><StatusChip tone={e.confidence === 'HIGH' ? 'ok' : e.confidence === 'MEDIUM' ? 'warn' : 'fail'} mark={false}>{e.confidence.toLowerCase()} (computed from the interval width)</StatusChip></dd>
      <dt>Context</dt><dd>{e.cycle_context}</dd>
    </dl>
  );
}

const MARK = { PASS: '✓', WARN: '⚠', FAIL: '✕' } as const;
const COLOR = { PASS: 'var(--ok-ink)', WARN: 'var(--warn-ink)', FAIL: 'var(--fail-ink)' } as const;

export function GateChecklist({ gate, trust }: { gate: { verdict: GateVerdict; checks: GateCheck[] }; trust: Trust }) {
  return (
    <div className="stack">
      <ol className="gate">
        {gate.checks.map((c) => (
          <li key={c.check}>
            <span style={{ color: COLOR[c.status], fontWeight: 700 }} aria-label={c.status}>{MARK[c.status]}</span>
            <div><div>{c.check}</div><div className="label-3">{c.detail}</div></div>
          </li>
        ))}
      </ol>
      <div className="row between" style={{ marginTop: 6 }}>
        <TrustMeter trust={trust} />
        <StatusChip tone={verdictTone(gate.verdict)}>{VERDICT_LABEL[gate.verdict]}</StatusChip>
      </div>
      <p className="label-3" style={{ margin: 0 }}>The gate re-checks each strategy at the conservative (P90) float margin, independent of the optimizer.</p>
    </div>
  );
}
