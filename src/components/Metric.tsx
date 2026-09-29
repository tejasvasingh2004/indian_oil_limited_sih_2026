import type { ReactNode } from 'react';
import type { Quantity } from '@/api/types';
import { useUi } from '@/store/ui';
import { fmt } from '@/lib/format';

const PROV_LABEL: Record<string, string> = {
  FIELD: 'measured', SIMULATED: 'simulated', DERIVED: 'estimated', PREDICTED: 'predicted',
  BACKTESTED: 'backtested', FIELD_VALIDATED: 'field-validated',
};

export function ProvenanceBadge({ kind }: { kind: Quantity['provenance'] }) {
  return <span className={`prov ${kind}`} title={`Provenance: ${PROV_LABEL[kind]}`}>{PROV_LABEL[kind]}</span>;
}

interface Props {
  q: Quantity;
  label?: ReactNode;
  /** evidence popover title */
  name: string;
  digits?: number;
  unit?: string;
  /** custom value formatter (overrides digits) */
  format?: (v: number) => string;
  size?: 'big' | 'mid' | 'sm';
  showRange?: boolean;
  showBadge?: boolean;
  align?: 'left' | 'center' | 'right';
}

/**
 * Every KPI goes through here (frontend.md §6). Computed values are clickable
 * evidence; estimated values are dashed; ASSUMED inputs get a ⚑.
 */
export function Metric({ q, label, name, digits = 0, unit, format, size = 'mid', showRange, showBadge, align = 'left' }: Props) {
  const openEvidence = useUi((s) => s.openEvidence);
  const f = format ?? ((v: number) => fmt(v, digits));
  const clickable = !!q.evidence_id;
  const est = q.provenance === 'DERIVED';
  const u = unit ?? q.unit;
  const aria = `${name}: ${f(q.value)}${u ? ' ' + u : ''}, ${PROV_LABEL[q.provenance]}${q.assumed ? ', depends on assumed inputs' : ''}`;
  const body = (
    <>
      {label && <span className="label">{label}</span>}
      <span className={`metric-value ${size === 'big' ? 'big' : size === 'mid' ? 'mid' : ''}`}>
        <span className="num">{f(q.value)}</span>
        {u && <span className="u">{u}</span>}
        {q.assumed && <span className="flag-assumed" title="Depends on ASSUMED or unverified registry parameters">⚑</span>}
      </span>
      {showRange && q.lo !== undefined && q.hi !== undefined && (
        <span className="range num">[{f(q.lo)}–{f(q.hi)}]</span>
      )}
      {showBadge && <ProvenanceBadge kind={q.provenance} />}
    </>
  );
  const cls = `metric ${clickable ? 'clickable' : ''} ${est ? 'est' : ''}`;
  const style = { alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start' } as const;
  if (!clickable) return <span className={cls} style={style} aria-label={aria}>{body}</span>;
  return (
    <span
      className={cls}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={`${aria}. Open evidence`}
      title="Click for evidence"
      onClick={() => openEvidence(q.evidence_id!, name)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEvidence(q.evidence_id!, name); } }}
    >
      {body}
    </span>
  );
}
