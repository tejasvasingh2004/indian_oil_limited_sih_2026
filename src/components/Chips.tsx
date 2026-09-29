import { useState, type ReactNode } from 'react';
import type { Confidence, Trust, GateVerdict } from '@/api/types';

export type Tone = 'ok' | 'warn' | 'fail' | 'info' | 'neutral';

/** The reference's "Average Risk !" chip: text plus a status mark (never colour alone). */
export function StatusChip({ tone, children, mark = true }: { tone: Tone; children: ReactNode; mark?: boolean }) {
  const sym = tone === 'ok' ? '✓' : tone === 'fail' ? '✕' : tone === 'warn' ? '!' : tone === 'info' ? 'i' : '';
  return (
    <span className={`chip ${tone}`}>
      {children}
      {mark && sym && <span className="bang" aria-hidden>{sym}</span>}
    </span>
  );
}

export const trustTone = (l: Confidence): Tone => (l === 'HIGH' ? 'ok' : l === 'MEDIUM' ? 'warn' : 'fail');
export const verdictTone = (v: GateVerdict): Tone => (v === 'APPROVED_FOR_REVIEW' ? 'ok' : v === 'HUMAN_REVIEW_REQUIRED' ? 'warn' : 'fail');
export const VERDICT_LABEL: Record<GateVerdict, string> = {
  APPROVED_FOR_REVIEW: 'Approved for review',
  HUMAN_REVIEW_REQUIRED: 'Human review required',
  REJECTED: 'Rejected',
};

const FACTOR_LABEL: Record<string, string> = {
  DATA_COMPLETENESS: 'Data completeness', DATA_FRESHNESS: 'Data freshness', SENSOR_HEALTH: 'Sensor health',
  PHYSICS_ML_AGREEMENT: 'Physics–ML agreement', INTERVAL_COVERAGE: 'Interval coverage', OOD_DISTANCE: 'OOD distance',
  OPTIMIZER_SANITY: 'Optimizer sanity', GATE_STATUS: 'Gate status',
};
const STATUS_COLOR = { GREEN: 'var(--ok)', AMBER: 'var(--warn)', RED: 'var(--fail)' } as const;

/** Trust Meter (system-design §13): level chip that expands to its factors. */
export function TrustMeter({ trust, compact }: { trust: Trust; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button className={`chip ${trustTone(trust.level)}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {compact ? '' : 'Trust '}
        <b style={{ fontWeight: 600 }}>{trust.level}</b>
        <span className="bang" aria-hidden>{trust.level === 'HIGH' ? '✓' : '!'}</span>
      </button>
      {open && (
        <div className="card strong" role="dialog" aria-label="Trust factors"
          style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 300, zIndex: 20, padding: 14, borderRadius: 16 }}>
          <div className="label" style={{ marginBottom: 8 }}>Trust Meter · {trust.level}</div>
          <div className="stack">
            {trust.factors.map((f) => (
              <div key={f.factor} className="row" style={{ alignItems: 'flex-start' }}>
                <span className="dot" style={{ background: STATUS_COLOR[f.status], marginTop: 5 }} />
                <div>
                  <div style={{ fontSize: 12 }}>{FACTOR_LABEL[f.factor] ?? f.factor} <span className="faint">· {f.status.toLowerCase()}</span></div>
                  {f.detail && <div className="label-3">{f.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

export function DataModeChip() {
  return (
    <span className="chip" title="All values come from the physics-informed simulator, not OIL field data">
      <span className="dot" style={{ background: 'var(--warn)' }} />
      Simulated data
    </span>
  );
}
