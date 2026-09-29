import { useBottleneck, useWellState } from '@/api/hooks';
import { Card } from '@/components/Card';
import { StatusChip } from '@/components/Chips';
import { Metric } from '@/components/Metric';
import { LIMIT_LABEL, LIMIT_VAR, fmt } from '@/lib/format';

/** Top-left card (the reference's "True Borrower"): what limits this well now. */
export function IdentCard({ wellId }: { wellId: string }) {
  const { data: s } = useWellState(wellId);
  const { data: b } = useBottleneck(wellId);
  if (!s) return <div className="card skeleton" style={{ height: 150 }} />;
  const producing = s.cycle.phase === 'PRODUCTION';
  const fill = s.estimated.fillage.value;
  return (
    <Card title="Active bottleneck">
      {producing && b ? (
        <>
          <div className="row between">
            <div className="row">
              <span className="ident-avatar" aria-hidden>
                <span className="dot" style={{ width: 14, height: 14, background: LIMIT_VAR[b.active] }} />
              </span>
              <div>
                <div className="label-3">Binding now</div>
                <div style={{ fontWeight: 600 }}>{LIMIT_LABEL[b.active]}</div>
              </div>
            </div>
            <StatusChip tone={b.next === 'FLOAT' ? 'warn' : 'neutral'}>Next: {LIMIT_LABEL[b.next].toLowerCase()}</StatusChip>
          </div>
          <div className="progress" style={{ marginTop: 14 }} aria-hidden><span style={{ width: `${fill * 100}%` }} /></div>
          <div className="row between" style={{ marginTop: 6 }}>
            <Metric q={s.estimated.fillage} name="Pump fillage" size="sm" format={(v) => `${fmt(v * 100)}%`} label="Fillage" />
            <span className="label-3" style={{ textAlign: 'right' }}>
              {fill < 0.95 ? 'pump has spare capacity' : 'pump runs full'}
            </span>
          </div>
        </>
      ) : (
        <p className="muted center" style={{ margin: 0 }}>
          {s.cycle.phase === 'INJECTION' ? `Injecting steam · day ${s.cycle.production_day}` : `Soaking · day ${s.cycle.production_day}`}
        </p>
      )}
    </Card>
  );
}
