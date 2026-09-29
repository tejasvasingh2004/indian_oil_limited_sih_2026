import type { SVGProps } from 'react';

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const ArrowUpRight = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" {...base} {...p}><path d="M5 11 11 5M6 5h5v5" /></svg>
);
export const ChevronLeft = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" width="14" height="14" {...base} {...p}><path d="M10 3 5 8l5 5" /></svg>
);
export const ChevronRight = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" width="14" height="14" {...base} {...p}><path d="m6 3 5 5-5 5" /></svg>
);
export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" width="15" height="15" {...base} {...p}><path d="M3 5h10M3 8h10M3 11h7" /></svg>
);
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" width="14" height="14" {...base} {...p}><path d="m4 4 8 8M12 4l-8 8" /></svg>
);
export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" width="12" height="12" {...base} {...p}><path d="M3 7.5 8 3l5 4.5V13H3z" /></svg>
);
/** brand mark: a pumpjack beam over a drop */
export const Logo = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" {...base} strokeWidth={1.7} {...p}>
    <path d="M3 8.5 19 5" />
    <path d="M19 5c1.8.3 2.4 1.7 2 3.2" />
    <path d="M11 6.8 8 20M11 6.8 14 20M6 20h10" />
    <path d="M4 9v5" />
    <circle cx="11" cy="6.8" r="1" fill="currentColor" />
  </svg>
);
