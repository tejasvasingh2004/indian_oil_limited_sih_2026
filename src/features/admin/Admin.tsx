import { useState } from 'react';
import { useAudit, useConstraints, useRegistry } from '@/api/hooks';
import { CogIcon, HistoryIcon, ShieldIcon } from '@/components/Icons';
import { PageHeader } from '@/components/Shell';
import { Panel, StatCard, Status, type Tone } from '@/components/ui';
import { fmt } from '@/lib/format';
import { useRole } from '@/store/role';

const LABEL_TONE: Record<string, Tone> = { OIL: 'ok', PS: 'ok', LITERATURE: 'info', ASSUMED: 'warn', DEMO: 'neutral' };
type Tab = 'registry' | 'constraints' | 'audit';

/** Admin (frontend.md §5.12): parameter registry with anchor tests, constraint set, audit log. Read-only in R0. */
export function Admin() {
  const role = useRole((r) => r.role);
  const [tab, setTab] = useState<Tab>('registry');
  const { data: reg } = useRegistry();
  const { data: cons } = useConstraints();
  const { data: audit } = useAudit();
  const anchorsOk = reg?.anchors.filter((a) => a.pass).length ?? 0;
  const assumed = reg?.rows.filter((r) => r.label === 'ASSUMED' || r.verify).length ?? 0;

  if (role !== 'admin') {
    return (
      <>
        <PageHeader title="Admin" sub="Parameter registry, limits and the audit log" />
        <div className="note warn"><b>Admin role needed.</b> Switch role from the avatar menu (top right) to see this page. Viewers and engineers can still open any evidence record from a number.</div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Admin" sub="Every number the twin uses comes from here · changes need OIL sign-off and create a new registry version" />
      <div className="stats">
        <StatCard variant="dark" icon={<CogIcon />} label="Registry version" value={<span style={{ fontSize: 24 }}>{reg?.version ?? '…'}</span>} hint={reg ? `${reg.rows.length} parameters · ${assumed} assumed or awaiting OIL` : ''} />
        <StatCard variant="grey" icon={<ShieldIcon />} label="Anchor tests" value={reg ? anchorsOk : '…'} unit={reg ? `of ${reg.anchors.length}` : ''}
          hint="published OIL values the twin must reproduce" />
        <StatCard variant="lime" icon={<HistoryIcon />} label="Audit log" value={audit ? audit.entries.length : '…'} unit="entries"
          hint={audit ? (audit.chain_ok ? 'hash chain intact' : 'hash chain BROKEN') : ''} />
      </div>

      <div className="section">
        <Panel title={tab === 'registry' ? 'Parameter registry' : tab === 'constraints' ? 'Constraint set' : 'Audit log'}
          action={<span className="seg" role="tablist" aria-label="Admin sections">
            {(['registry', 'constraints', 'audit'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t === 'registry' ? 'Registry' : t === 'constraints' ? 'Limits' : 'Audit'}
              </button>
            ))}
          </span>}>
          {tab === 'registry' && reg && (
            <>
              <ul className="gate-list" style={{ marginBottom: 18 }}>
                {reg.anchors.map((a) => (
                  <li key={a.test}><Status tone={a.pass ? 'ok' : 'bad'}>{a.pass ? 'pass' : 'fail'}</Status><span><b style={{ fontWeight: 500 }}>{a.test}.</b> <span className="muted">{a.detail}</span></span></li>
                ))}
              </ul>
              <div className="scroll-x">
                <table className="tbl">
                  <thead><tr><th>Parameter</th><th className="r">Value</th><th>Unit</th><th>Source</th><th>Label</th></tr></thead>
                  <tbody>{reg.rows.map((r) => (
                    <tr key={r.key}>
                      <td className="name" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.key}</td>
                      <td className="r num">{fmt(r.value, r.value < 10 ? 2 : 0)}{r.range && <div className="size">{fmt(r.range[0], r.range[0] < 10 ? 2 : 0)}–{fmt(r.range[1], r.range[1] < 10 ? 2 : 0)}</div>}</td>
                      <td className="muted">{r.unit ?? ''}</td>
                      <td className="small muted" style={{ whiteSpace: 'normal', maxWidth: 340 }}>{r.source ?? '—'}</td>
                      <td><Status tone={LABEL_TONE[r.label] ?? 'neutral'}>{r.label.toLowerCase()}</Status>{r.verify && <span className="flag-assumed" title="awaiting OIL verification"> ⚑</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'constraints' && cons && (
            <>
              <div className="note warn" style={{ marginBottom: 14 }}><b>Placeholder limits.</b> These come from the registry until OIL's operating manual is loaded (set {cons.id}). The safety gate reads them on every run.</div>
              <table className="tbl">
                <thead><tr><th>Limit</th><th className="r">Value</th><th>Unit</th><th>Key</th></tr></thead>
                <tbody>{cons.limits.map((l) => (
                  <tr key={l.key}><td>{l.label}</td><td className="r num">{fmt(l.value, l.value < 10 ? 2 : 0)}</td><td className="muted">{l.unit ?? ''}</td><td className="size" style={{ fontFamily: 'var(--mono)' }}>{l.key}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
          {tab === 'audit' && audit && (
            <>
              <div className={`note ${audit.chain_ok ? 'ok' : 'bad'}`} style={{ marginBottom: 14 }}>
                {audit.chain_ok ? <><b>Chain intact.</b> Each entry stores the hash of the one before it, so an edited or deleted entry breaks the chain.</> : <><b>Chain broken.</b> An entry was changed after it was written.</>}
              </div>
              {!audit.entries.length ? <p className="muted">Nothing recorded yet — run an optimization, decide, or advance the clock.</p> : (
                <div className="scroll-x">
                  <table className="tbl">
                    <thead><tr><th>#</th><th>When</th><th>Who</th><th>Action</th><th>What</th><th>Hash</th></tr></thead>
                    <tbody>{audit.entries.map((e) => (
                      <tr key={e.seq}>
                        <td className="time">{e.seq}</td>
                        <td className="time">{new Date(e.ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{e.actor}</td>
                        <td><span className="name">{e.action.replace(/_/g, ' ').toLowerCase()}</span></td>
                        <td className="small muted" title={e.payload}>{e.entity} {e.entity_id}</td>
                        <td className="size" style={{ fontFamily: 'var(--mono)' }} title={`prev ${e.prev_hash}`}>{e.hash.slice(0, 12)}…</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {((tab === 'registry' && !reg) || (tab === 'constraints' && !cons) || (tab === 'audit' && !audit)) && <div className="skeleton" style={{ height: 200 }} />}
        </Panel>
      </div>
    </>
  );
}
