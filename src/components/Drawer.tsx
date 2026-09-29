import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons';

export function Drawer({ title, sub, onClose, children }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  // portal: glass cards use backdrop-filter, which would trap fixed children inside the card
  return createPortal(
    <>
      <div className="overlay" style={{ background: 'rgba(40,28,14,0.12)' }} onClick={onClose} />
      <aside className="card strong drawer scroll" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} style={{ zIndex: 51 }}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <div>
            <div className="mid">{title}</div>
            {sub && <div className="label">{sub}</div>}
          </div>
          <button className="pill-btn" onClick={onClose} aria-label="Close" autoFocus><CloseIcon /></button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>,
    document.body,
  );
}
