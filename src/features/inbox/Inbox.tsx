import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRecommendations } from '@/api/hooks';
import { VERDICT_LABEL, trustTone, verdictTone } from '@/components/Chips';
import { PageHeader } from '@/components/Shell';
import { Panel, Status } from '@/components/ui';
import { inr } from '@/lib/format';
import { WellIcon } from '@/components/Icons';

const NAME: Record<string, string> = { PRODUCTION: 'Most oil', BALANCED: 'Balanced', ENERGY: 'Least energy', RELIABILITY: 'Most reliable' };

/** Recommendation inbox and history (frontend.md §5.7). */
export function Inbox() {
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const { data } = useRecommendations();
  const nav = useNavigate();
  const rows = (data ?? []).filter((r) => filter === 'ALL' || r.status === 'PENDING');
  return (
    <>
      <PageHeader title="Inbox" sub="Recommendations waiting for an engineer · decisions are recorded, never sent to field equipment" />
      <Panel title={filter === 'PENDING' ? 'Waiting for you' : 'All decisions'}
        action={<span className="seg" role="group" aria-label="Filter">
          <button aria-pressed={filter === 'PENDING'} onClick={() => setFilter('PENDING')}>Pending</button>
          <button aria-pressed={filter === 'ALL'} onClick={() => setFilter('ALL')}>History</button>
        </span>}>
        {!rows.length ? (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <p className="muted">{filter === 'PENDING' ? 'Nothing is waiting for a decision.' : 'No recommendations yet.'}</p>
            <Link className="btn primary" to="/wells/BG-023/optimize">Optimize well BG-023</Link>
          </div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Day</th><th>Well</th><th>Strategy</th><th className="r">Net ₹/day</th><th>Safety</th><th>Trust</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.recommendation_id} className="link" tabIndex={0}
                  onClick={() => nav(`/wells/${r.well_id}/optimize/${r.run_id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/wells/${r.well_id}/optimize/${r.run_id}`)}>
                  <td className="time">day {r.created_day}</td>
                  <td><span className="row"><span className="well-ico"><WellIcon /></span><span className="name">{r.well_id}</span></span></td>
                  <td><div>{NAME[r.strategy] ?? r.strategy}</div>{r.comment && <div className="size">“{r.comment}”</div>}</td>
                  <td className="r num">{inr(r.net_inr_per_day)}</td>
                  <td><Status tone={verdictTone(r.verdict)}>{VERDICT_LABEL[r.verdict]}</Status></td>
                  <td><Status tone={trustTone(r.trust)}>{r.trust.toLowerCase()}</Status></td>
                  <td><Status tone={r.status === 'APPROVED' ? 'ok' : r.status === 'REJECTED' ? 'bad' : r.status === 'PENDING' ? 'info' : 'neutral'}>{r.status.toLowerCase()}</Status></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
