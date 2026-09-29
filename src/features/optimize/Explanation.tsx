import type { Explanation, GateCheck, GateVerdict } from '@/api/types';
import { VERDICT_LABEL, verdictTone } from '@/components/Chips';
import { Metric } from '@/components/Metric';
import { Status } from '@/components/ui';
import { inr } from '@/lib/format';

/** Explainability contract (system-design §14.2), in plain words. */
export function ExplanationPanel({ e }: { e: Explanation }) {
  return (
    <dl className="kv">
      <dt>Change</dt>
      <dd><ul>{e.what.map((w) => <li key={w}>{w}</li>)}</ul></dd>
      <dt>Because</dt><dd>{e.why}</dd>
      <dt>Gain</dt>
      <dd><Metric q={e.inr_effect} name="Change in net ₹/day vs current practice" format={(v) => `${inr(v, { signed: true })}/day`} unit="" showRange /></dd>
      <dt>Limit in play</dt><dd>{e.binding_limit}</dd>
      <dt>Confidence</dt><dd><Status tone={e.confidence === 'HIGH' ? 'ok' : e.confidence === 'MEDIUM' ? 'warn' : 'bad'}>{e.confidence.toLowerCase()}</Status></dd>
      <dt>Applies to</dt><dd className="muted">{e.cycle_context}</dd>
    </dl>
  );
}

const LABEL = { PASS: 'Pass', WARN: 'Close', FAIL: 'Fail' } as const;
const TONE = { PASS: 'ok', WARN: 'warn', FAIL: 'bad' } as const;

export function GateChecklist({ gate }: { gate: { verdict: GateVerdict; checks: GateCheck[] } }) {
  return (
    <>
      <ul className="gate-list">
        {gate.checks.map((c) => (
          <li key={c.check}>
            <Status tone={TONE[c.status]}>{LABEL[c.status]}</Status>
            <div><div>{c.check}</div><div className="small faint">{c.detail}</div></div>
          </li>
        ))}
      </ul>
      <div className="row between" style={{ marginTop: 14 }}>
        <span className="small muted">Re-checked independently, using the cautious (P90) float margin.</span>
        <Status tone={verdictTone(gate.verdict)}>{VERDICT_LABEL[gate.verdict]}</Status>
      </div>
    </>
  );
}
