import { useState } from 'react';
import { decisionError } from '@/api/client';
import { useDecide, useRecommendations } from '@/api/hooks';
import type { DecisionKind, Strategy } from '@/api/types';
import { Status } from '@/components/ui';
import { useUi } from '@/store/ui';
import { canAct, useRole } from '@/store/role';

const REASONS = ['Operational constraint', 'Steam not available', 'Disagree with the model', 'Equipment limit', 'Other'];

/** Approve / Defer / Reject (system-design §5.10, §13.2). Nothing is sent to field equipment. */
export function DecisionBar({ s }: { s: Strategy }) {
  const decide = useDecide();
  const viewer = !canAct(useRole((r) => r.role));
  const { data: recs } = useRecommendations();
  const showToast = useUi((u) => u.showToast);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');
  const [ack, setAck] = useState(false);
  const rec = recs?.find((r) => r.recommendation_id === s.recommendation_id);
  const verdict = s.gate?.verdict ?? 'REJECTED';
  const trust = s.trust?.level ?? 'LOW';

  if (verdict === 'REJECTED' || !s.recommendation_id) {
    const fail = s.gate?.checks.find((c) => c.status === 'FAIL');
    return <div className="note bad"><b>Failed the safety check.</b> {fail ? `${fail.check}: ${fail.detail}.` : ''} It cannot be approved.</div>;
  }
  if (rec && rec.status !== 'PENDING') {
    return (
      <div className="stack">
        <Status tone={rec.status === 'APPROVED' ? 'ok' : rec.status === 'REJECTED' ? 'bad' : 'neutral'}>{rec.status.toLowerCase()}</Status>
        {rec.comment && <span className="muted">“{rec.comment}”</span>}
        <span className="small faint">Saved to the audit log. No settings were sent to field equipment.</span>
      </div>
    );
  }

  const needsAck = verdict === 'HUMAN_REVIEW_REQUIRED' || trust === 'MEDIUM';
  const submit = (decision: DecisionKind) => {
    const d = { decision, reason: reason || undefined, comment: comment || undefined, review_note: note || undefined };
    const err = decisionError({ verdict, trust }, d);
    if (err) return showToast(err);
    decide.mutate({ recId: s.recommendation_id!, d }, {
      onSuccess: () => showToast(`${decision === 'APPROVED' ? 'Approved' : decision === 'REJECTED' ? 'Rejected' : 'Deferred'}. Nothing is sent to field equipment.`),
      onError: (e) => showToast((e as Error).message),
    });
  };
  const approveBlocked = (needsAck && !ack) || (trust === 'LOW' && !note.trim());

  return (
    <div className="stack" style={{ gap: 10 }}>
      <textarea className="input" rows={2} placeholder="Comment (needed to reject)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Comment" />
      <select className="select" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason (needed to reject)">
        <option value="">Reason (needed to reject)</option>
        {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      {trust === 'LOW' && <textarea className="input" rows={2} placeholder="Review note (needed: low trust)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Review note" />}
      {needsAck && (
        <label className="row small muted" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 3 }} />
          I have read the {verdict === 'HUMAN_REVIEW_REQUIRED' ? 'safety checks marked “Close”' : 'trust factors'} for this strategy.
        </label>
      )}
      <div className="row">
        <button className="btn primary" disabled={viewer || approveBlocked || decide.isPending} onClick={() => submit('APPROVED')}>Approve</button>
        <button className="btn" disabled={viewer || decide.isPending} onClick={() => submit('DEFERRED')}>Later</button>
        <button className="btn" disabled={viewer || decide.isPending} onClick={() => submit('REJECTED')}>Reject</button>
      </div>
      <span className="small faint">Approving only records the decision. Engineers change the well by hand.</span>
    </div>
  );
}
