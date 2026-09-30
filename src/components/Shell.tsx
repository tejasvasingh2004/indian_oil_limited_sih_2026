import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useRecommendations } from '@/api/hooks';
import { apiMode, type Role } from '@/api/client';
import { useRole } from '@/store/role';
import { Bell, CogIcon, CubeIcon, DatabaseIcon, FlaskIcon, PulseIcon, GridIcon, HistoryIcon, InboxIcon, ShieldIcon, SlidersIcon, WellIcon } from './Icons';

/** Remember the last well the engineer opened so Well / Scenario Lab / Optimize stay on it. */
function currentWell(pathname: string) {
  const m = pathname.match(/\/wells\/(BG-\d{3})/);
  if (m) {
    try { localStorage.setItem('pt.well', m[1]); } catch { /* storage unavailable */ }
    return m[1];
  }
  try { return localStorage.getItem('pt.well') ?? 'BG-023'; } catch { return 'BG-023'; }
}

/** Sidebar layout from the reference: logo, pill navigation, one status note at the bottom. */
export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const well = currentWell(pathname);
  const role = useRole((r) => r.role);
  const items: [string, string, ReactNode, boolean?][] = [
    ['/field', 'Dashboard', <GridIcon />],
    [`/wells/${well}`, `Well ${well.slice(3)}`, <WellIcon />, true],
    [`/wells/${well}/3d`, '3D well', <CubeIcon />],
    [`/wells/${well}/scenario-lab`, 'Scenario Lab', <FlaskIcon />],
    [`/wells/${well}/optimize`, 'Optimize', <SlidersIcon />],
    ['/risk', 'Risk', <ShieldIcon />],
    ['/recommendations', 'Inbox', <InboxIcon />],
    ['/backtests', 'Backtests', <HistoryIcon />],
    ['/data-quality', 'Data quality', <DatabaseIcon />],
    ['/models', 'Model health', <PulseIcon />],
    ...(role === 'admin' ? [['/admin', 'Admin', <CogIcon />] as [string, string, ReactNode]] : []),
  ];
  return (
    <div className="app">
      <aside className="side">
        <Link to="/field" className="logo" aria-label="PetroTwin home">Petro<span>Twin</span></Link>
        <nav className="nav" aria-label="Main">
          {items.map(([to, label, icon, exact], i) => (
            <span key={to} style={{ display: 'contents' }}>
              {(i === 5 || i === 8) && <span className="sep" />}
              <NavLink to={to} end={exact !== undefined}
                className={({ isActive }) => (isActive ? 'active' : '')}>
                {icon}{label}
              </NavLink>
            </span>
          ))}
        </nav>
        <div className="side-foot">
          <div className="mode" title={apiMode() === 'live' ? 'Connected to the FastAPI backend' : 'No backend answered /api/health; the twin runs in this browser'}>
            <i className={apiMode()} />{apiMode() === 'live' ? 'Live API' : 'Browser twin'}
          </div>
          <div className="sim"><i />Simulated data — values come from the physics-informed simulator, not OIL field records.</div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

/** Page header: title on the left; inbox bell and engineer avatar on the right. */
export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  const { data: recs } = useRecommendations();
  const pending = recs?.filter((r) => r.status === 'PENDING').length ?? 0;
  return (
    <header className="top">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="top-right">
        {actions}
        <Link to="/recommendations" className="bell" aria-label={`Inbox, ${pending} pending`} title="Pending decisions">
          <Bell />{pending > 0 && <b>{pending}</b>}
        </Link>
        <RoleMenu />
      </div>
    </header>
  );
}

const ROLES: [Role, string, string][] = [
  ['viewer', 'Viewer', 'read only'],
  ['engineer', 'Engineer', 'run, decide'],
  ['admin', 'Admin', 'engineer + registry and audit'],
];
const INITIALS: Record<Role, string> = { viewer: 'VW', engineer: 'PE', admin: 'AD' };

/** Demo role switch (no login in R0). The backend enforces the role on writes. */
function RoleMenu() {
  const { role, setRole } = useRole();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="avatar" aria-haspopup="menu" aria-expanded={open} title={`Role: ${role} (click to switch)`} onClick={() => setOpen((o) => !o)}>{INITIALS[role]}</button>
      {open && (
        <div className="popover role-menu" role="menu" style={{ right: 0, top: 42 }}>
          <div className="small faint" style={{ padding: '0 6px 6px' }}>Demo role</div>
          {ROLES.map(([r, label, what]) => (
            <button key={r} role="menuitemradio" aria-checked={role === r} className={role === r ? 'on' : ''} onClick={() => { setRole(r); setOpen(false); }}>
              <b>{label}</b><span>{what}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
