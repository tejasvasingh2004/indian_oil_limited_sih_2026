import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24' } as const;

export const ArrowUpRight = (p: P) => <svg {...s} {...p}><path d="M7 17 17 7M8 7h9v9" /></svg>;
export const ChevronRight = (p: P) => <svg {...s} width="12" height="12" {...p}><path d="m9 6 6 6-6 6" /></svg>;
export const ChevronLeft = (p: P) => <svg {...s} width="12" height="12" {...p}><path d="m15 6-6 6 6 6" /></svg>;
export const CloseIcon = (p: P) => <svg {...s} width="14" height="14" {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>;
export const Bell = (p: P) => <svg {...s} {...p}><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0" /></svg>;

// navigation
export const GridIcon = (p: P) => <svg {...s} {...p}><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></svg>;
export const WellIcon = (p: P) => <svg {...s} {...p}><path d="M3 9.5 19 6.5M19 6.5c1.6.3 2 1.6 1.6 2.8M11 8 8 20M11 8l3 12M6 20h10M4 10v5" /><circle cx="11" cy="8" r=".8" fill="currentColor" /></svg>;
export const FlaskIcon = (p: P) => <svg {...s} {...p}><path d="M9 3h6M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3M7.5 14h9" /></svg>;
export const SlidersIcon = (p: P) => <svg {...s} {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
export const ShieldIcon = (p: P) => <svg {...s} {...p}><path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z" /><path d="M12 8v5M12 16h.01" /></svg>;
export const InboxIcon = (p: P) => <svg {...s} {...p}><path d="M4 13 6 5h12l2 8v6H4zM4 13h5l1 2h4l1-2h5" /></svg>;
export const HistoryIcon = (p: P) => <svg {...s} {...p}><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 8v4l3 2" /></svg>;

// stat card icons
export const DropIcon = (p: P) => <svg {...s} {...p}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" /></svg>;
export const GaugeIcon = (p: P) => <svg {...s} {...p}><path d="M4 16a8 8 0 1 1 16 0M12 16l4-5" /><circle cx="12" cy="16" r="1.2" /></svg>;
export const CalendarIcon = (p: P) => <svg {...s} {...p}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>;
export const BoltIcon = (p: P) => <svg {...s} {...p}><path d="M13 3 5 14h6l-1 7 8-11h-6z" /></svg>;
export const AlertIcon = (p: P) => <svg {...s} {...p}><path d="M12 4 3 20h18zM12 10v4M12 17h.01" /></svg>;
export const RupeeIcon = (p: P) => <svg {...s} {...p}><path d="M7 5h10M7 9h10M9 5c4 0 5 1.7 5 4s-2 4-5 4H7l7 7" /></svg>;
