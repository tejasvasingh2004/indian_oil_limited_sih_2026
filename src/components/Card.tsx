import type { CSSProperties, ReactNode } from 'react';
import { ArrowUpRight } from './Icons';

interface Props {
  title?: ReactNode;
  sub?: ReactNode;
  titleLeft?: boolean;
  /** the reference's dark corner button: opens the detail view */
  onExpand?: () => void;
  expandLabel?: string;
  strong?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function Card({ title, sub, titleLeft, onExpand, expandLabel, strong, className = '', style, children }: Props) {
  return (
    <section className={`card ${strong ? 'strong' : ''} ${className}`} style={style}>
      {title && <h2 className={`card-title ${titleLeft ? 'left' : ''}`}>{title}</h2>}
      {sub && <div className="card-sub">{sub}</div>}
      {onExpand && (
        <button className="corner" onClick={onExpand} aria-label={expandLabel ?? 'Open details'} title={expandLabel ?? 'Open details'}>
          <ArrowUpRight />
        </button>
      )}
      {children}
    </section>
  );
}
