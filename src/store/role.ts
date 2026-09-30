import { create } from 'zustand';
import { Role, setApiRole } from '@/api/client';

// Demo role switch (frontend.md §8): R0 has no login, so the header menu picks a role.
// viewer: read only · engineer: run, decide · admin: engineer + Admin page.
const initial = ((): Role => {
  try { const r = localStorage.getItem('pt.role'); return r === 'viewer' || r === 'admin' ? r : 'engineer'; } catch { return 'engineer'; }
})();
setApiRole(initial);

interface RoleState { role: Role; setRole: (r: Role) => void }
export const useRole = create<RoleState>((set) => ({
  role: initial,
  setRole: (role) => {
    setApiRole(role);
    try { localStorage.setItem('pt.role', role); } catch { /* storage unavailable */ }
    set({ role });
  },
}));
export const canAct = (r: Role) => r !== 'viewer';
