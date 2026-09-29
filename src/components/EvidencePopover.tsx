import { useEffect } from 'react';
import { useEvidence } from '@/api/hooks';
import { useUi } from '@/store/ui';
import { CloseIcon } from './Icons';
import { Status } from './ui';

/** Evidence Lock: how any computed number was produced (frontend.md §5.5). */
export function EvidencePopover() {
  const { evidenceId, evidenceLabel, closeEvidence } = useUi();
  const { data, isLoading, error } = useEvidence(evidenceId);

  useEffect(() => {
    if (!evidenceId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeEvidence();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [evidenceId, closeEvidence]);

  if (!evidenceId) return null;
  return (
    <div className="overlay" style={{ zIndex: 70 }} onClick={closeEvidence}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`How ${evidenceLabel} was computed`} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div className="small muted">How this number was computed</div>
            <div style={{ fontSize: 17 }}>{evidenceLabel}</div>
          </div>
          <button className="btn ghost sm" onClick={closeEvidence} aria-label="Close" autoFocus><CloseIcon /></button>
        </div>
        {isLoading && <div className="skeleton" style={{ height: 160 }} />}
        {error && <div className="note bad">Evidence record not found.</div>}
        {data && (
          <>
            <dl className="kv">
              <dt>Function</dt><dd style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{data.function}</dd>
              <dt>Snapshot</dt><dd>{data.data_snapshot_ref}</dd>
              <dt>Registry</dt><dd>{data.registry_version}</dd>
              <dt>Code · inputs</dt><dd>{data.code_version} · <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{data.inputs_hash}</span></dd>
              {Object.keys(data.model_versions).length > 0 && <><dt>Models</dt><dd>{Object.entries(data.model_versions).map(([k, v]) => `${k} ${v}`).join(' · ')}</dd></>}
              {data.run_id && <><dt>Run</dt><dd>{data.run_id}</dd></>}
            </dl>
            {data.parameters_used.length > 0 && (
              <table className="tbl" style={{ marginTop: 16 }}>
                <thead><tr><th>Parameter used</th><th className="r">Source</th></tr></thead>
                <tbody>
                  {data.parameters_used.map((p) => (
                    <tr key={p.key}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{p.key}</td>
                      <td className="r">
                        <Status tone={p.label === 'ASSUMED' ? 'warn' : p.verify ? 'info' : 'ok'}>{p.label.toLowerCase()}{p.verify ? ' · verify' : ''}</Status>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="small faint" style={{ marginBottom: 0 }}>Computed by the in-browser mock of the PetroTwin backend on simulated data. Not a field result.</p>
          </>
        )}
      </div>
    </div>
  );
}
