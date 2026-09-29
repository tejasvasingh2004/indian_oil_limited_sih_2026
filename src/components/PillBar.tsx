import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWells, useRecommendations } from '@/api/hooks';
import { ChevronLeft, ChevronRight, Logo, MenuIcon } from './Icons';

interface Props {
  /** well in focus; enables the ‹ › pager through the 33 wells */
  wellId?: string;
  /** the route suffix to keep when paging (e.g. "/scenario-lab") */
  wellSuffix?: string;
  title?: string;
  actions?: ReactNode;
}

/** Bottom pill bar from the reference: brand · pager · actions. */
export function PillBar({ wellId, wellSuffix = '', title, actions }: Props) {
  const { data: wells } = useWells();
  const { data: recs } = useRecommendations();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const ids = wells?.map((w) => w.well_id) ?? [];
  const idx = wellId ? ids.indexOf(wellId) : -1;
  const pending = recs?.filter((r) => r.status === 'PENDING').length ?? 0;

  const go = (d: number) => {
    if (idx < 0 || !ids.length) return;
    nav(`/wells/${ids[(idx + d + ids.length) % ids.length]}${wellSuffix}`);
  };

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menu]);

  return (
    <nav className="card pillbar" aria-label="Main">
      <Link to="/field" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
        <Logo /> PetroTwin <span className="faint" style={{ fontWeight: 400 }}>· Baghewala</span>
      </Link>

      <div className="pager">
        {wellId && <button className="round" onClick={() => go(-1)} aria-label="Previous well"><ChevronLeft /></button>}
        <div className="current">
          <span>{wellId ?? title}</span>
          {(wellId || pending > 0) && <span className="count num" title={wellId ? 'Wells in the field' : 'Pending decisions'}>{wellId ? ids.length || '·' : pending}</span>}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button className="round" style={{ width: 26, height: 26 }} onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Menu">
              <MenuIcon />
            </button>
            {menu && (
              <div className="card strong" role="menu" style={{ position: 'absolute', bottom: 'calc(100% + 14px)', left: '50%', transform: 'translateX(-50%)', width: 230, padding: 8, borderRadius: 18 }}>
                {[
                  ['/field', 'Field board'],
                  [wellId ? `/wells/${wellId}` : '/wells/BG-023', 'Well console'],
                  [wellId ? `/wells/${wellId}/scenario-lab` : '/wells/BG-023/scenario-lab', 'Scenario Lab'],
                  [wellId ? `/wells/${wellId}/optimize` : '/wells/BG-023/optimize', 'Cycle designer'],
                  ['/risk', 'Risk center'],
                  ['/recommendations', `Inbox${pending ? ` (${pending})` : ''}`],
                  ['/backtests', 'Backtests'],
                ].map(([to, label]) => (
                  <Link key={to} to={to} role="menuitem" onClick={() => setMenu(false)}
                    style={{ display: 'block', padding: '8px 12px', borderRadius: 10, color: 'inherit', textDecoration: 'none' }}
                    className="menu-link">{label}</Link>
                ))}
                <div className="label-3" style={{ padding: '6px 12px 4px' }}>Model health, data quality and admin come in R0 step 9.</div>
              </div>
            )}
          </div>
        </div>
        {wellId && <button className="round" onClick={() => go(1)} aria-label="Next well"><ChevronRight /></button>}
      </div>

      <div className="actions">{actions}</div>
    </nav>
  );
}
