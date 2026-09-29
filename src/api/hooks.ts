import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { OptimizationRequest } from './types';
import type { DecisionRequest, ScenarioRequest } from './client';

// The simulated clock is part of every key so "Advance time" refetches everything.
export const useClock = () => useQuery({ queryKey: ['clock'], queryFn: api.clock, staleTime: Infinity });
const useT = () => useClock().data ?? 0;

export const useFieldKpis = () => { const t = useT(); return useQuery({ queryKey: ['field', 'kpis', t], queryFn: api.fieldKpis }); };
export const useWells = () => { const t = useT(); return useQuery({ queryKey: ['wells', t], queryFn: api.wells }); };
export const useWellState = (id: string) => { const t = useT(); return useQuery({ queryKey: ['well', id, 'state', t], queryFn: () => api.wellState(id) }); };
export const useRodProfile = (id: string, hz?: number) => {
  const t = useT();
  return useQuery({ queryKey: ['well', id, 'rods', hz ?? 'current', t], queryFn: () => api.rodProfile(id, hz), placeholderData: (prev) => prev });
};
export const useBottleneck = (id: string) => { const t = useT(); return useQuery({ queryKey: ['well', id, 'bottleneck', t], queryFn: () => api.bottleneck(id) }); };
export const useBottleneckHistory = (id: string) => { const t = useT(); return useQuery({ queryKey: ['well', id, 'bhist', t], queryFn: () => api.bottleneckHistory(id) }); };
export const useResteam = (id: string) => { const t = useT(); return useQuery({ queryKey: ['well', id, 'resteam', t], queryFn: () => api.resteamWindow(id) }); };
export const useProduction = (id: string) => { const t = useT(); return useQuery({ queryKey: ['well', id, 'prod', t], queryFn: () => api.production(id) }); };
export const useLedger = (id: string) => { const t = useT(); return useQuery({ queryKey: ['well', id, 'ledger', t], queryFn: () => api.ledger(id) }); };
export const useEvidence = (eid: string | null) =>
  useQuery({ queryKey: ['evidence', eid], queryFn: () => api.evidence(eid!), enabled: !!eid, staleTime: Infinity });

export const useWellDesign = (id: string) => { const t = useT(); return useQuery({ queryKey: ['well', id, 'design', t], queryFn: () => api.wellDesign(id) }); };
export const useScenarios = () => useMutation({ mutationFn: (req: ScenarioRequest) => api.scenarios(req) });

export const useStartOptimization = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: OptimizationRequest) => api.startOptimization(req),
    onSuccess: (run) => qc.setQueryData(['opt', run.run_id], run),
  });
};
export const useOptimization = (runId: string | undefined) =>
  useQuery({
    queryKey: ['opt', runId],
    queryFn: () => api.optimization(runId!),
    enabled: !!runId,
    refetchInterval: (q) => (q.state.data && ['QUEUED', 'RUNNING'].includes(q.state.data.status) ? 250 : false),
  });

export const useRecommendations = (wellId?: string) => useQuery({ queryKey: ['recs', wellId ?? 'all'], queryFn: () => api.recommendations(wellId) });
export const useDecide = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recId, d }: { recId: string; d: DecisionRequest }) => api.decide(recId, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recs'] }),
  });
};

export const useAdvanceTime = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: number) => api.advanceTime(days),
    onSuccess: (offset) => qc.setQueryData(['clock'], offset),
  });
};
