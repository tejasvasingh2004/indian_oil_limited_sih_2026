import { useModelHealth } from '@/api/hooks';
import { PulseIcon, ShieldIcon, GaugeIcon } from '@/components/Icons';
import { PageHeader } from '@/components/Shell';
import { Panel, StatCard, Status, type Tone } from '@/components/ui';
import { fmt } from '@/lib/format';

const TONE: Record<string, Tone> = { PASS: 'ok', WARN: 'warn', FAIL: 'bad' };

/** Model Health (frontend.md §5.11, system-design §9.6): release gates for the four models. */
export function ModelHealth() {
  const { data: h } = useModelHealth();
  const gates = h?.models.flatMap((m) => m.gates) ?? [];
  const passing = h?.models.filter((m) => m.gates.every((g) => g.status !== 'FAIL')).length ?? 0;
  const metric = (model: string, label: string) => h?.models.find((m) => m.model === model)?.metrics.find((x) => x.label === label)?.value ?? '…';

  return (
    <>
      <PageHeader title="Model health" sub="A model is used only while it passes its release gates · metrics are recomputed from the simulated history" />
      <div className="stats">
        <StatCard variant="dark" icon={<ShieldIcon />} label="Models released" value={h ? passing : '…'} unit={h ? `of ${h.models.length}` : ''}
          hint={h ? `${gates.filter((g) => g.status === 'PASS').length} gates pass · ${gates.filter((g) => g.status === 'WARN').length} warn · ${gates.filter((g) => g.status === 'FAIL').length} fail` : ''} />
        <StatCard variant="grey" icon={<GaugeIcon />} label="Forecast error" value={metric('A', 'Mean abs. error')}
          hint={`persistence baseline ${metric('A', 'Persistence baseline')}`} />
        <StatCard variant="lime" icon={<PulseIcon />} label="Failure model C-index" value={metric('D', 'C-index')} hint="1.0 = perfect ranking, 0.5 = coin flip" />
      </div>

      <div className="section grid-2">
        {(h?.models ?? []).map((m) => (
          <Panel key={m.model} title={`${m.model} · ${m.name}`}
            right={<Status tone={m.gates.some((g) => g.status === 'FAIL') ? 'bad' : m.gates.some((g) => g.status === 'WARN') ? 'warn' : 'ok'}>
              {m.gates.some((g) => g.status === 'FAIL') ? 'Blocked' : 'Released'}
            </Status>}>
            <div className="tiles" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
              {m.metrics.map((x) => (
                <div key={x.label} className="tile" style={{ minHeight: 70 }}>
                  <span className="t-label">{x.label}</span>
                  <span className="t-value" style={{ fontSize: 22, color: x.good === false ? 'var(--bad)' : undefined }}>{x.value}</span>
                </div>
              ))}
            </div>
            <ul className="gate-list">
              {m.gates.map((g) => (
                <li key={g.gate}><Status tone={TONE[g.status]}>{g.status.toLowerCase()}</Status><span><b style={{ fontWeight: 500 }}>{g.gate}.</b> <span className="muted">{g.detail}</span></span></li>
              ))}
            </ul>
            <div className="small faint" style={{ marginTop: 12 }}>{m.version} · trained {m.trained_at} · data {m.dataset_hash}</div>
          </Panel>
        ))}
        {!h && [0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 260 }} />)}
      </div>

      {h && (
        <div className="section">
          <Panel title="Training range" action={<span className="small muted">outside it the twin flags the well out of distribution and blocks optimization</span>}>
            <table className="tbl">
              <thead><tr><th>Input</th><th className="r">From</th><th className="r">To</th><th>Unit</th></tr></thead>
              <tbody>{h.training_range.map((r) => (
                <tr key={r.feature}><td>{r.feature}</td><td className="r num">{fmt(r.lo)}</td><td className="r num">{fmt(r.hi)}</td><td className="muted">{r.unit}</td></tr>
              ))}</tbody>
            </table>
          </Panel>
        </div>
      )}
    </>
  );
}
