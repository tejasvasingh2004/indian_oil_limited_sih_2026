import type { ReactNode } from 'react';

/** The rounded "photograph": a full-bleed scene with glass content floating on it. */
export function Frame({ scene, focus, children }: { scene: ReactNode; focus?: boolean; children: ReactNode }) {
  return (
    <div className={`frame ${focus ? 'focus' : ''}`}>
      <div className="frame-bg" aria-hidden={focus}>{scene}</div>
      <div className="frame-veil" />
      <div className="page">{children}</div>
    </div>
  );
}
