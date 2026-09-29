import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useRecommendations } from '@/api/hooks';
import { Bell, FlaskIcon, GridIcon, HistoryIcon, InboxIcon, ShieldIcon, SlidersIcon, WellIcon } from './Icons';

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
  const items: [string, string, ReactNode, boolean?][] = [
    ['/field', 'Dashboard', <GridIcon />],
    [`/wells/${well}`, `Well ${well.slice(3)}`, <WellIcon />, true],
    [`/wells/${well}/scenario-lab`, 'Scenario Lab', <FlaskIcon />],
    [`/wells/${well}/optimize`, 'Optimize', <SlidersIcon />],
    ['/risk', 'Risk', <ShieldIcon />],
    ['/recommendations', 'Inbox', <InboxIcon />],
    ['/backtests', 'Backtests', <HistoryIcon />],
  ];
  return (
    <div className="app">
      <aside className="side">
        <Link to="/field" className="logo" aria-label="PetroTwin home">Petro<span>Twin</span></Link>
        <nav className="nav" aria-label="Main">
          {items.map(([to, label, icon, exact], i) => (
            <span key={to} style={{ display: 'contents' }}>
              {i === 4 && <span className="sep" />}
              <NavLink to={to} end={exact !== undefined}
                className={({ isActive }) => (isActive ? 'active' : '')}>
                {icon}{label}
              </NavLink>
            </span>
          ))}
        </nav>
        <div className="side-foot">
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
        <span className="avatar" title="Production engineer (viewer role: engineer)">PE</span>
      </div>
    </header>
  );
}
