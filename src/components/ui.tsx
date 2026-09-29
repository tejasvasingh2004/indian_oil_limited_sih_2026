// Small UI kit that copies the reference dashboard: stat cards (dark / grey / lime),
// bordered panels with an outline pill button, grey tiles, hatched meter, status pills.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronRight } from './Icons';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

interface StatProps {
  variant: 'dark' | 'grey' | 'lime';
  icon: ReactNode;
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  hint?: ReactNode;
  to?: string;
  onOpen?: () => void;
  openLabel?: string;
}

export function StatCard({ variant, icon, label, value, unit, hint, to, onOpen, openLabel }: StatProps) {
  return (
    <section className={`stat ${variant}`}>
      <span className="ico" aria-hidden>{icon}</span>
      <span className="dots" aria-hidden>⋮</span>
      <div className="label">{label}</div>
      <div className="value"><span className="n num">{value}</span>{unit && <span className="u">{unit}</span>}</div>
      {hint && <div className="hint">{hint}</div>}
      {to && <Link className="go" to={to} aria-label={openLabel ?? `Open ${label}`}><ArrowUpRight /></Link>}
      {onOpen && <button className="go" onClick={onOpen} aria-label={openLabel ?? `Open ${label}`}><ArrowUpRight /></button>}
    </section>
  );
}

export function Panel({ title, action, right, children, className = '' }: {
  title: ReactNode; action?: ReactNode; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <h2>{title}</h2>
        {action}
        {right && <div className="right">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/** Outline pill like "All plans ›". */
export function PillLink({ to, onClick, children }: { to?: string; onClick?: () => void; children: ReactNode }) {
  if (to) return <Link className="btn sm" to={to}>{children}<ChevronRight /></Link>;
  return <button className="btn sm" onClick={onClick}>{children}<ChevronRight /></button>;
}

export function Tile({ label, value, of }: { label: ReactNode; value: ReactNode; of?: ReactNode }) {
  return (
    <div className="tile">
      <span className="t-label">{label}</span>
      <span className="t-value num">{value}{of !== undefined && <span className="t-of">{of}</span>}</span>
    </div>
  );
}

/** Lime fill over a hatched track; optional black mark (e.g. a limit). */
export function Meter({ value, max, mark, ariaLabel }: { value: number; max: number; mark?: number; ariaLabel: string }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className="meter" role="img" aria-label={ariaLabel}>
      <span style={{ left: 0, width: pct(value) }} />
      {mark !== undefined && <span className="mark" style={{ left: pct(mark) }} />}
    </div>
  );
}

export function Status({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return <span className={`status ${tone}`} title={title}>{children}</span>;
}
