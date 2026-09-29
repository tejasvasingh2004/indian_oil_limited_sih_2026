import { useState } from 'react';
import { decisionError } from '@/api/client';
import { useDecide, useRecommendations } from '@/api/hooks';
import type { DecisionKind, Strategy } from '@/api/types';
import { StatusChip } from '@/components/Chips';
import { useUi } from '@/store/ui';

const REASONS = ['OPERATIONAL_CONSTRAINT', 'STEAM_NOT_AVAILABLE', 'DISAGREE_WITH_MODEL', 'EQUIPMENT_LIMIT', 'OTHER'];

/** Approve / Defer / Reject with the review rules of system-design §5.10 and §13.2. */
export function DecisionBar({ s }: { s: Strategy }) {
  const decide = useDecide();
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
    return <div className="banner fail"><b>Rejected by the gate.</b> {fail ? `${fail.check}: ${fail.detail}` : ''} It cannot be approved.</div>;
  }
  if (rec && rec.status !== 'PENDING') {
    return (
      <div className="stack">
        <StatusChip tone={rec.status === 'APPROVED' ? 'ok' : rec.status === 'REJECTED' ? 'fail' : 'warn'}>{rec.status.toLowerCase()}</StatusChip>
        {rec.comment && <span className="muted">“{rec.comment}”</span>}
        <span className="label-3">Recorded in the audit log. No settings were sent to field equipment.</span>
      </div>
    );
  }

  const needsAck = verdict === 'HUMAN_REVIEW_REQUIRED' || trust === 'MEDIUM';
  const submit = (decision: DecisionKind) => {
    const d = { decision, reason: reason || undefined, comment: comment || undefined, review_note: note || undefined };
    const err = decisionError({ verdict, trust }, d);
    if (err) return showToast(err);
    decide.mutate({ recId: s.recommendation_id!, d }, {
      onSuccess: () => showToast(`${decision === 'APPROVED' ? 'Approved' : decision === 'REJECTED' ? 'Rejected' : 'Deferred'} — decision recorded. No settings are sent to field equipment.`),
      onError: (e) => showToast((e as Error).message),
    });
  };
  const approveBlocked = (needsAck && !ack) || (trust === 'LOW' && !note.trim());

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row field" style={{ gap: 8 }}>
        <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason (required to reject)" style={{ maxWidth: 210 }}>
          <option value="">Reason (required to reject)</option>
          {REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ').toLowerCase()}</option>)}
        </select>
      </div>
      <textarea className="field-input" rows={2} placeholder="Comment" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Comment" />
      {trust === 'LOW' && (
        <textarea className="field-input" rows={2} placeholder="Review note (required: LOW trust)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Review note" />
      )}
      {needsAck && (
        <label className="row label" style={{ gap: 6 }}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          I have reviewed the {verdict === 'HUMAN_REVIEW_REQUIRED' ? 'gate warnings' : 'trust factors'} for this strategy.
        </label>
      )}
      <div className="row" style={{ gap: 6 }}>
        <button className="pill-btn primary" disabled={approveBlocked || decide.isPending} onClick={() => submit('APPROVED')}>Approve</button>
        <button className="pill-btn" disabled={decide.isPending} onClick={() => submit('DEFERRED')}>Defer</button>
        <button className="pill-btn" disabled={decide.isPending} onClick={() => submit('REJECTED')}>Reject</button>
      </div>
      <span className="label-3">Approving records a decision only; no settings are sent to field equipment.</span>
    </div>
  );
}
