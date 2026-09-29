import { useState } from 'react';
import type { Confidence, GateVerdict, Trust } from '@/api/types';
import type { Tone } from './ui';

export const trustTone = (l: Confidence): Tone => (l === 'HIGH' ? 'ok' : l === 'MEDIUM' ? 'warn' : 'bad');
export const verdictTone = (v: GateVerdict): Tone => (v === 'APPROVED_FOR_REVIEW' ? 'ok' : v === 'HUMAN_REVIEW_REQUIRED' ? 'warn' : 'bad');
export const VERDICT_LABEL: Record<GateVerdict, string> = {
  APPROVED_FOR_REVIEW: 'Gate pass',
  HUMAN_REVIEW_REQUIRED: 'Needs review',
  REJECTED: 'Rejected',
};

const FACTOR_LABEL: Record<string, string> = {
  DATA_COMPLETENESS: 'Data completeness', DATA_FRESHNESS: 'Data freshness', SENSOR_HEALTH: 'Sensor health',
  PHYSICS_ML_AGREEMENT: 'Physics–ML agreement', INTERVAL_COVERAGE: 'Forecast band coverage', OOD_DISTANCE: 'Within training range',
  OPTIMIZER_SANITY: 'Optimizer sanity', GATE_STATUS: 'Safety gate',
};
const COLOR = { GREEN: 'var(--ok)', AMBER: 'var(--warn)', RED: 'var(--bad)' } as const;

/** Trust Meter: a status pill that opens its factor list. */
export function TrustMeter({ trust }: { trust: Trust }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button className={`status ${trustTone(trust.level)}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}
        title="Why this trust level">trust {trust.level.toLowerCase()}</button>
      {open && (
        <div className="popover" role="dialog" aria-label="Trust factors" style={{ top: 'calc(100% + 8px)', right: 0, width: 290 }}>
          <div className="small muted" style={{ marginBottom: 8 }}>Trust is the weakest of these checks</div>
          <div className="stack">
            {trust.factors.map((f) => (
              <div key={f.factor} className="row" style={{ alignItems: 'flex-start' }}>
                <span className="dot" style={{ background: COLOR[f.status], marginTop: 5 }} />
                <div>
                  <div style={{ fontSize: 12 }}>{FACTOR_LABEL[f.factor] ?? f.factor}</div>
                  {f.detail && <div className="small faint">{f.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
