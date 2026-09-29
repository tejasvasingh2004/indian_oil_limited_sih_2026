import { useEffect } from 'react';
import { useEvidence } from '@/api/hooks';
import { useUi } from '@/store/ui';
import { CloseIcon } from './Icons';

/** Evidence Lock (frontend.md §5.5): how any computed number was produced. */
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
      <div className="card strong modal" role="dialog" aria-modal="true" aria-label={`Evidence for ${evidenceLabel}`} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <div>
            <div className="label">Evidence</div>
            <div className="mid">{evidenceLabel}</div>
          </div>
          <button className="pill-btn" onClick={closeEvidence} aria-label="Close" autoFocus><CloseIcon /></button>
        </div>
        {isLoading && <div className="skeleton" style={{ height: 160 }} />}
        {error && <div className="banner fail">Evidence record not found.</div>}
        {data && (
          <>
            <table className="t">
              <tbody>
                <tr><th>Function</th><td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{data.function}</td></tr>
                <tr><th>Code</th><td className="num">{data.code_version}</td></tr>
                <tr><th>Registry</th><td className="num">{data.registry_version}</td></tr>
                <tr><th>Inputs</th><td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{data.inputs_hash}</td></tr>
                <tr><th>Snapshot</th><td style={{ fontSize: 11 }}>{data.data_snapshot_ref}</td></tr>
                {Object.keys(data.model_versions).length > 0 && (
                  <tr><th>Models</th><td>{Object.entries(data.model_versions).map(([k, v]) => `${k} ${v}`).join(' · ')}</td></tr>
                )}
                {data.run_id && <tr><th>Run</th><td>{data.run_id}</td></tr>}
              </tbody>
            </table>
            {data.parameters_used.length > 0 && (
              <>
                <div className="label" style={{ margin: '14px 0 6px' }}>Parameters used</div>
                <table className="t">
                  <tbody>
                    {data.parameters_used.map((p) => (
                      <tr key={p.key}>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{p.key}</td>
                        <td className="r">
                          {p.label === 'ASSUMED' ? <span className="flag-assumed">⚑ ASSUMED</span> : p.label}
                          {p.verify && <span className="faint"> · verify pending</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p className="label-3" style={{ marginTop: 12 }}>
              Computed by the in-browser mock of the PetroTwin backend on simulated data. Not a field result.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
