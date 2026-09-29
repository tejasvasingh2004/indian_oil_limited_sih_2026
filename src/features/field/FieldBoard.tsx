import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFieldKpis, useWells } from '@/api/hooks';
import type { LimitName, Quantity, WellSummary } from '@/api/types';
import { Card } from '@/components/Card';
import { Bars, SegmentDonut } from '@/components/charts';
import { StatusChip, trustTone } from '@/components/Chips';
import { Drawer } from '@/components/Drawer';
import { Frame } from '@/components/Frame';
import { Metric } from '@/components/Metric';
import { PillBar } from '@/components/PillBar';
import { DesertScene } from '@/components/scenes/DesertScene';
import { Logo } from '@/components/Icons';
import { DataModeChip } from '@/components/Chips';
import { LIMIT_LABEL, LIMIT_VAR, MODE_LABEL, fmt, pct } from '@/lib/format';

const ORDER: LimitName[] = ['INFLOW', 'FLOAT', 'PUMP', 'FATIGUE', 'TORQUE'];

export function FieldBoard() {
  const { data: k } = useFieldKpis();
  const { data: wells } = useWells();
  const [grid, setGrid] = useState(false);
  const nav = useNavigate();

  const producing = wells?.filter((w) => w.phase === 'PRODUCTION') ?? [];
  const oilBy = useMemo(() => {
    const m: Record<string, number> = {};
    for (const w of producing) m[w.active] = (m[w.active] ?? 0) + w.oil_bopd.value;
    return m;
  }, [producing]);
  const attention = useMemo(() => attentionList(wells ?? []), [wells]);
  const top = k ? ORDER.reduce((a, b) => (k.by_bottleneck[b] > k.by_bottleneck[a] ? b : a)) : 'INFLOW';

  return (
    <Frame scene={<DesertScene variant="field" />}>
      <div className="console">
        <div className="a-ident">
          <Card title="Baghewala Field">
            <div className="row between">
              <div className="row">
                <span className="ident-avatar" aria-hidden><Logo style={{ width: 20, height: 20 }} /></span>
                <div>
                  <div className="label-3">Jodhpur Sandstone · Rajasthan</div>
                  <div style={{ fontWeight: 600 }}>Oil India Limited</div>
                </div>
              </div>
              {k && <StatusChip tone="info">{k.by_bottleneck ? `${producing.length} producing` : ''}</StatusChip>}
            </div>
            {k && (
              <>
                <div className="progress" style={{ marginTop: 14 }} aria-hidden>
                  <span style={{ width: `${(producing.length / k.operating_wells.value) * 100}%` }} />
                </div>
                <div className="label-3" style={{ marginTop: 6, textAlign: 'center' }}>
                  {k.operating_wells.value} operating wells · {k.injecting_wells} injecting · {k.operating_wells.value - producing.length - k.injecting_wells} soaking
                </div>
              </>
            )}
          </Card>
        </div>

        <header className="a-title hero-title">
          <h1>Baghewala Field</h1>
          <p>Wells grouped by what limits them · heavy oil 17–19° API · CSS + SRP</p>
          <div className="hero-chips"><DataModeChip /></div>
        </header>

        <div className="a-nav">
          <Card title="Wells by bottleneck" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {k ? (
              <>
                <div className="tri">
                  <div><div className="label-3">Producing</div><div className="num">{producing.length}</div></div>
                  <Metric q={k.total_oil_bopd} name="Total oil" size="big" digits={0} align="center" label={<span className="label-3">BOPD total</span>} />
                  <div><div className="label-3">Energy</div><Metric q={k.kwh_per_bbl} name="Field energy per barrel" size="sm" digits={1} unit="kWh/bbl" align="right" /></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '14px 0 4px' }}>
                  <StatusChip tone="warn">Mostly {LIMIT_LABEL[top].toLowerCase()}-limited</StatusChip>
                </div>
                <div style={{ flex: 1, minHeight: 150 }}>
                  <div style={{ height: '100%' }}>
                    <Bars format={(v) => fmt(v)}
                      bars={ORDER.map((n) => ({ key: n, label: LIMIT_LABEL[n], value: k.by_bottleneck[n], highlight: n === top, color: n === top ? undefined : `color-mix(in srgb, ${LIMIT_VAR[n]} 55%, transparent)` }))} />
                  </div>
                </div>
                <p className="label-3 center" style={{ margin: '8px 0 0' }}>Bottleneck = the lowest of inflow, pump, float, fatigue and torque rate limits, computed per well.</p>
              </>
            ) : <div className="skeleton" style={{ flex: 1 }} />}
          </Card>
        </div>

        <div className="a-resteam">
          <Card title="Field output" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {k ? (
              <>
                <div className="row between">
                  <div><div className="label-3">Steam today</div><Metric q={k.steam_today_t} name="Steam injected today" size="sm" digits={0} unit="t" /></div>
                  <div style={{ textAlign: 'right' }}><div className="label-3">High-risk wells</div><div className="num">{k.high_risk_wells}</div></div>
                </div>
                <div style={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 180 }}>
                  <SegmentDonut
                    segments={ORDER.map((n) => ({ key: n, value: oilBy[n] ?? 0, color: LIMIT_VAR[n], label: `${LIMIT_LABEL[n]}-limited oil` }))}
                    center={<><div className="label-3">Oil by limit</div><div className="big num">{fmt(k.total_oil_bopd.value)}</div><div className="label-3">BOPD</div></>} />
                </div>
                <div className="legend" style={{ justifyContent: 'center' }}>
                  {ORDER.filter((n) => oilBy[n]).map((n) => <span key={n}><i className="dot" style={{ background: LIMIT_VAR[n] }} />{LIMIT_LABEL[n]}</span>)}
                </div>
                <div className="tri" style={{ marginTop: 12 }}>
                  <div><div className="label-3">Re-steams ≤30 d</div><div className="num">{k.resteams_due_30d}</div></div>
                  <Metric q={k.avg_cycle_sor} name="Average projected cycle SOR" size="big" digits={2} align="center" label={<span className="label-3">Avg cycle SOR</span>} />
                  <div><div className="label-3">Injecting</div><div className="num">{k.injecting_wells}</div></div>
                </div>
              </>
            ) : <div className="skeleton" style={{ flex: 1 }} />}
          </Card>
        </div>

        <div className="a-hero" />

        <div className="a-status">
          <Card title="Wells" onExpand={() => setGrid(true)} expandLabel="Open the well grid">
            <div className="tiles" role="list">
              {(wells ?? []).map((w) => (
                <button key={w.well_id} role="listitem" className={`tile ${w.ood || w.risk_30d.value >= 0.15 ? 'alert' : ''}`}
                  onClick={() => nav(`/wells/${w.well_id}`)}
                  title={`${w.well_id} · ${w.phase === 'PRODUCTION' ? `${LIMIT_LABEL[w.active]}-limited · ${fmt(w.oil_bopd.value, 1)} BOPD` : w.phase.toLowerCase()}`}>
                  {w.well_id.slice(3)}
                  <span className="bar" style={{ background: w.phase === 'PRODUCTION' ? LIMIT_VAR[w.active] : 'var(--bar-muted-2)' }} />
                </button>
              ))}
            </div>
            <div className="legend" style={{ marginTop: 10 }}>
              {ORDER.map((n) => <span key={n}><i className="dot" style={{ background: LIMIT_VAR[n] }} />{LIMIT_LABEL[n]}</span>)}
              <span><i className="dot" style={{ background: 'var(--bar-muted-2)' }} />injecting / soaking</span>
              <span><i className="dot" style={{ background: 'var(--fail)' }} />risk ≥ 15% or OOD</span>
            </div>
          </Card>
        </div>

        <div className="a-float">
          <Card title="Needs attention">
            <div className="attn">
              {attention.slice(0, 3).map((a) => (
                <Link key={a.id + a.text} to={`/wells/${a.id}`}>
                  <span className="dot" style={{ background: a.tone === 'fail' ? 'var(--fail)' : 'var(--warn)' }} />
                  <span><b style={{ fontWeight: 600 }}>{a.id}</b> <span className="muted">{a.text}</span></span>
                  <span className="faint">→</span>
                </Link>
              ))}
              {!attention.length && <span className="muted">Nothing flagged.</span>}
            </div>
          </Card>
        </div>
      </div>

      <PillBar title="Field" actions={<>
        <Link className="pill-btn" to="/risk">Risk center</Link>
        <Link className="pill-btn primary" to="/wells/BG-023">Reference well <span className="plus">+</span></Link>
      </>} />

      {grid && wells && <WellGrid wells={wells} onClose={() => setGrid(false)} onOpen={(id) => nav(`/wells/${id}`)} />}
    </Frame>
  );
}

function attentionList(wells: WellSummary[]) {
  const out: { id: string; text: string; tone: 'fail' | 'warn'; score: number }[] = [];
  for (const w of wells) {
    if (w.ood) out.push({ id: w.well_id, text: 'out of distribution — optimization blocked', tone: 'fail', score: 3 });
    if (w.phase !== 'PRODUCTION') continue;
    if (w.risk_30d.value >= 0.15) out.push({ id: w.well_id, text: `${MODE_LABEL[w.top_mode].toLowerCase()} risk ${pct(w.risk_30d.value)} (30 d)`, tone: w.risk_30d.value >= 0.2 ? 'fail' : 'warn', score: 2 + w.risk_30d.value });
    if (w.fmi_min.value < 0.17) out.push({ id: w.well_id, text: `FMI min ${fmt(w.fmi_min.value, 2)} @ ${w.fmi_min_depth_m} m`, tone: w.fmi_min.value < 0.15 ? 'fail' : 'warn', score: 1.5 + (0.17 - w.fmi_min.value) });
    if (w.days_to_resteam !== null && w.days_to_resteam <= 30) out.push({ id: w.well_id, text: `re-steam due in ${w.days_to_resteam} d`, tone: 'warn', score: 1 });
  }
  return out.sort((a, b) => b.score - a.score);
}

function WellGrid({ wells, onClose, onOpen }: { wells: WellSummary[]; onClose: () => void; onOpen: (id: string) => void }) {
  const [sort, setSort] = useState<'well' | 'oil' | 'risk' | 'fmi' | 'resteam'>('well');
  const val = (w: WellSummary): number => sort === 'oil' ? -w.oil_bopd.value : sort === 'risk' ? -w.risk_30d.value : sort === 'fmi' ? w.fmi_min.value : sort === 'resteam' ? (w.days_to_resteam ?? 999) : 0;
  const rows = [...wells].sort((a, b) => val(a) - val(b) || a.well_id.localeCompare(b.well_id));
  const q = (x: Quantity) => x.value;
  return (
    <Drawer title="Well grid" sub="All 33 wells · simulated · click a row to open the well" onClose={onClose}>
      <div className="seg" role="group" aria-label="Sort by">
        {(['well', 'oil', 'risk', 'fmi', 'resteam'] as const).map((s) => (
          <button key={s} aria-pressed={sort === s} onClick={() => setSort(s)}>{s === 'fmi' ? 'FMI' : s === 'resteam' ? 're-steam' : s}</button>
        ))}
      </div>
      <div className="scroll">
        <table className="t">
          <thead><tr><th>Well</th><th>Phase</th><th className="r">Oil</th><th className="r">Δ7d</th><th>Limit</th><th className="r">FMI</th><th className="r">Risk</th><th className="r">Re-steam</th><th>Trust</th></tr></thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.well_id} className="link" onClick={() => onOpen(w.well_id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(w.well_id)}>
                <td><b style={{ fontWeight: 600 }}>{w.well_id}</b>{w.ood && ' ⛔'}</td>
                <td className="faint">{w.phase === 'PRODUCTION' ? `c${w.cycle_no} · d${w.production_day}` : w.phase.toLowerCase()}</td>
                <td className="r num">{w.phase === 'PRODUCTION' ? fmt(q(w.oil_bopd), 1) : '—'}</td>
                <td className="r num faint">{w.phase === 'PRODUCTION' ? `${w.oil_delta_7d_pct >= 0 ? '+' : ''}${fmt(w.oil_delta_7d_pct, 0)}%` : ''}</td>
                <td>{w.phase === 'PRODUCTION' && <><span className="dot" style={{ background: LIMIT_VAR[w.active], marginRight: 5 }} />{LIMIT_LABEL[w.active]}</>}</td>
                <td className="r num">{w.phase === 'PRODUCTION' ? fmt(w.fmi_min.value, 2) : ''}</td>
                <td className="r num">{w.phase === 'PRODUCTION' ? pct(w.risk_30d.value) : ''}</td>
                <td className="r num">{w.days_to_resteam !== null ? (w.resteam_p50_day! >= 220 ? '>220' : `${w.days_to_resteam} d`) : ''}</td>
                <td><StatusChip tone={trustTone(w.trust)} mark={false}>{w.trust.toLowerCase()}</StatusChip></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Drawer>
  );
}
