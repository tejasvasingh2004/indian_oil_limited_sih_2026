import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRecommendations } from '@/api/hooks';
import { Card } from '@/components/Card';
import { DataModeChip, StatusChip, VERDICT_LABEL, trustTone, verdictTone } from '@/components/Chips';
import { Frame } from '@/components/Frame';
import { PillBar } from '@/components/PillBar';
import { DesertScene } from '@/components/scenes/DesertScene';
import { inr } from '@/lib/format';

/** Recommendation inbox and history (frontend.md §5.7). */
export function Inbox() {
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const { data } = useRecommendations();
  const nav = useNavigate();
  const rows = (data ?? []).filter((r) => filter === 'ALL' || r.status === 'PENDING');
  return (
    <Frame scene={<DesertScene variant="field" />} focus>
      <header className="hero-title compact">
        <h1>Inbox</h1>
        <p>Recommendations waiting for an engineer · decisions are recorded, never sent to field equipment</p>
        <div className="hero-chips"><DataModeChip /></div>
      </header>
      <div className="designer scroll">
        <Card strong style={{ maxWidth: 980, width: '100%', margin: '0 auto' }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="seg" role="group" aria-label="Filter">
              <button aria-pressed={filter === 'PENDING'} onClick={() => setFilter('PENDING')}>Pending</button>
              <button aria-pressed={filter === 'ALL'} onClick={() => setFilter('ALL')}>History</button>
            </div>
            <span className="label-3">{data?.length ?? 0} recommendations this session</span>
          </div>
          {!rows.length ? (
            <div className="center" style={{ padding: '30px 0' }}>
              <p className="muted">{filter === 'PENDING' ? 'Nothing is waiting for a decision.' : 'No recommendations yet.'}</p>
              <Link className="pill-btn primary" to="/wells/BG-023/optimize">Run the optimizer on BG-023 <span className="plus">→</span></Link>
            </div>
          ) : (
            <table className="t">
              <thead><tr><th>Well</th><th>Strategy</th><th>Gate</th><th>Trust</th><th className="r">Net ₹/day</th><th>Status</th><th>Comment</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.recommendation_id} className="link" tabIndex={0}
                    onClick={() => nav(`/wells/${r.well_id}/optimize/${r.run_id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/wells/${r.well_id}/optimize/${r.run_id}`)}>
                    <td><b style={{ fontWeight: 600 }}>{r.well_id}</b> <span className="faint">day {r.created_day}</span></td>
                    <td>{r.strategy.toLowerCase()}</td>
                    <td><StatusChip tone={verdictTone(r.verdict)}>{VERDICT_LABEL[r.verdict]}</StatusChip></td>
                    <td><StatusChip tone={trustTone(r.trust)} mark={false}>{r.trust.toLowerCase()}</StatusChip></td>
                    <td className="r num">{inr(r.net_inr_per_day)}</td>
                    <td><StatusChip tone={r.status === 'APPROVED' ? 'ok' : r.status === 'REJECTED' ? 'fail' : r.status === 'DEFERRED' ? 'warn' : 'neutral'} mark={false}>{r.status.toLowerCase()}</StatusChip></td>
                    <td className="faint" style={{ whiteSpace: 'normal', maxWidth: 220 }}>{r.comment ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <PillBar title="Inbox" actions={<Link className="pill-btn" to="/field">Field board</Link>} />
    </Frame>
  );
}
