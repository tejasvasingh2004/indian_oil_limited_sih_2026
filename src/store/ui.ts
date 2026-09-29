import { create } from 'zustand';
import type { ScenarioInput } from '@/api/types';

export type ScenarioDraft = ScenarioInput & { planned: boolean };

interface UiState {
  evidenceId: string | null;
  evidenceLabel: string;
  openEvidence: (id: string, label: string) => void;
  closeEvidence: () => void;
  toast: string | null;
  showToast: (msg: string) => void;
  drafts: Record<string, ScenarioDraft[]>;
  setDrafts: (wellId: string, d: ScenarioDraft[]) => void;
}

const load = (): Record<string, ScenarioDraft[]> => {
  try { return JSON.parse(localStorage.getItem('pt.drafts') ?? '{}'); } catch { return {}; }
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUi = create<UiState>((set) => ({
  evidenceId: null,
  evidenceLabel: '',
  openEvidence: (id, label) => set({ evidenceId: id, evidenceLabel: label }),
  closeEvidence: () => set({ evidenceId: null }),
  toast: null,
  showToast: (msg) => {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 3800);
  },
  drafts: load(),
  setDrafts: (wellId, d) =>
    set((s) => {
      const drafts = { ...s.drafts, [wellId]: d };
      try { localStorage.setItem('pt.drafts', JSON.stringify(drafts)); } catch { /* storage unavailable */ }
      return { drafts };
    }),
}));
