import { useRodProfile, useWellState } from '@/api/hooks';
import type { Quantity } from '@/api/types';
import { Card } from '@/components/Card';
import { ThresholdBar } from '@/components/charts';
import { Metric } from '@/components/Metric';
import { fmt } from '@/lib/format';

/** Bottom-right card (the reference's DSCR bar): float margin vs its limit. */
export function FloatCard({ wellId, onShowRods }: { wellId: string; onShowRods: () => void }) {
  const { data: s } = useWellState(wellId);
  const hz = s ? Math.max(30, s.measured.vfd_hz.value - 4) : undefined;
  const { data: slower } = useRodProfile(wellId, hz);
  if (!s) return <div className="card skeleton" style={{ height: 150 }} />;
  const f = s.indicators.fmi_min;
  const alt: Quantity | undefined = slower ? { value: slower.fmi_min, provenance: 'DERIVED', evidence_id: slower.evidence_id } : undefined;
  return (
    <Card title="Float margin" onExpand={onShowRods} expandLabel="Show the rod string (FMI along depth)">
      <div className="row between">
        <span className="label-3">FMI min at {fmt(f.depth_m)} m</span>
        <span className="label-3">Goodman {fmt(s.indicators.goodman_sr_max.value, 2)} / {s.indicators.goodman_sr_max.limit}</span>
      </div>
      <ThresholdBar value={f.value} limit={f.limit} max={0.6} marks={alt ? [{ v: alt.value, label: `at ${hz} Hz` }] : []}
        ariaLabel={`Float margin ${fmt(f.value, 2)} against a limit of ${f.limit}`} />
      <div className="tri" style={{ marginTop: 8 }}>
        <div><div className="label-3">Limit</div><div className="num">{f.limit}</div></div>
        <Metric q={f} name="Float Margin Index (minimum along the rod string)" size="big" digits={2} align="center" label={<span className="label-3">Current</span>} />
        <div>
          <div className="label-3">At {hz} Hz</div>
          {alt ? <Metric q={alt} name={`FMI at ${hz} Hz`} size="sm" digits={2} align="right" /> : <span className="faint">…</span>}
        </div>
      </div>
    </Card>
  );
}
