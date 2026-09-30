import type { QueryClient } from '@tanstack/react-query';

// Live mode only: the backend pushes small events over /api/ws and we refetch
// what they touch (system-design §5 WebSocket). Reconnects with back-off.
type Event = { type: 'clock' | 'optimization' | 'recommendation' | 'backtest'; id?: string; offset?: number };

export function connectEvents(qc: QueryClient, attempt = 0) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/api/ws`);
  ws.onopen = () => { attempt = 0; };
  ws.onmessage = (m) => {
    let e: Event;
    try { e = JSON.parse(m.data); } catch { return; }
    if (e.type === 'clock') qc.invalidateQueries({ queryKey: ['clock'] });
    if (e.type === 'optimization' && e.id) qc.invalidateQueries({ queryKey: ['opt', e.id] });
    if (e.type === 'recommendation') qc.invalidateQueries({ queryKey: ['recs'] });
    if (e.type === 'backtest') qc.invalidateQueries({ queryKey: ['backtest'] });
    qc.invalidateQueries({ queryKey: ['audit'] });
  };
  ws.onclose = () => setTimeout(() => connectEvents(qc, attempt + 1), Math.min(10_000, 500 * 2 ** attempt));
}
