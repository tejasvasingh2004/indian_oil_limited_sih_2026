import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFieldKpis, useWells } from '@/api/hooks';
import type { WellSummary } from '@/api/types';
import { AlertIcon, DropIcon, GaugeIcon, WellIcon } from '@/components/Icons';
import { Metric } from '@/components/Metric';
import { PageHeader } from '@/components/Shell';
import { Meter, Panel, PillLink, StatCard, Status, Tile, type Tone } from '@/components/ui';
import { ResteamCalendar } from './ResteamCalendar';
import { LIMIT_LABEL, LIMIT_VAR, MODE_LABEL, fmt, pct } from '@/lib/format';

/** One word per well, so the table reads at a glance. */
export function wellStatus(w: WellSummary): { tone: Tone; label: string; why: string } {
  if (w.ood) return { tone: 'bad', label: 'Blocked', why: 'outside the model’s training range' };
  if (w.phase !== 'PRODUCTION') return { tone: 'neutral', label: w.phase === 'INJECTION' ? 'Injecting' : 'Soaking', why: 'steam cycle in progress' };
  if (w.fmi_min.value < 0.15) return { tone: 'bad', label: 'Rod float', why: `float margin ${fmt(w.fmi_min.value, 2)} below 0.15` };
  if (w.risk_30d.value >= 0.2) return { tone: 'bad', label: 'High risk', why: `${MODE_LABEL[w.top_mode].toLowerCase()} ${pct(w.risk_30d.value)} in 30 d` };
  if (w.risk_30d.value >= 0.15) return { tone: 'warn', label: 'Watch', why: `${MODE_LABEL[w.top_mode].toLowerCase()} ${pct(w.risk_30d.value)} in 30 d` };
  if (w.fmi_min.value < 0.17) return { tone: 'warn', label: 'Watch', why: `float margin ${fmt(w.fmi_min.value, 2)} near the limit` };
  if (w.days_to_resteam !== null && w.days_to_resteam <= 30) return { tone: 'info', label: 'Re-steam soon', why: `re-steam in ${w.days_to_resteam} d` };
  return { tone: 'ok', label: 'Normal', why: '' };
}
const RANK: Record<Tone, number> = { bad: 0, warn: 1, info: 2, neutral: 3, ok: 4 };

export function FieldBoard() {
  const { data: k } = useFieldKpis();
  const { data: wells } = useWells();
  const [all, setAll] = useState(false);
  const nav = useNavigate();

  const producing = wells?.filter((w) => w.phase === 'PRODUCTION') ?? [];
  const sorted = useMemo(() => [...(wells ?? [])].sort((a, b) =>
    RANK[wellStatus(a).tone] - RANK[wellStatus(b).tone] || b.risk_30d.value - a.risk_30d.value), [wells]);
  const attention = sorted.filter((w) => ['bad', 'warn'].includes(wellStatus(w).tone));
  const rows = all ? sorted : sorted.slice(0, 8);
  const inflow = k?.by_bottleneck.INFLOW ?? 0;

  return (
    <>
      <PageHeader title="Dashboard" sub="Baghewala field · Jodhpur Sandstone · CSS + sucker-rod pumps" />

      <div className="stats">
        <StatCard variant="dark" icon={<DropIcon />} label="Oil today" value={k ? fmt(k.total_oil_bopd.value) : '…'} unit="BOPD"
          hint={k ? `${producing.length} of ${k.operating_wells.value} wells producing` : ''} onOpen={() => setAll(true)} openLabel="Show all wells" />
        <StatCard variant="grey" icon={<GaugeIcon />} label="Energy per barrel" value={k ? fmt(k.kwh_per_bbl.value, 1) : '…'} unit="kWh/bbl"
          hint={k ? `average cycle SOR ${fmt(k.avg_cycle_sor.value, 2)}` : ''} />
        <StatCard variant="lime" icon={<AlertIcon />} label="Wells needing attention" value={wells ? attention.length : '…'}
          hint="high failure risk, rod float or blocked" to="/risk" openLabel="Open the risk center" />
      </div>

      <div className="section">
        <Panel title="What limits the wells" action={<PillLink to="/risk">Risk center</PillLink>}>
          <div className="split">
            <div>
              <div className="meter-title">Reservoir-limited <span className="muted small">(the pump could lift more than the reservoir gives)</span></div>
              {k ? <Meter value={inflow} max={producing.length || 1} ariaLabel={`${inflow} of ${producing.length} producing wells are limited by reservoir inflow`} /> : <div className="skeleton" style={{ height: 26 }} />}
              <div className="meter-labels">
                <span>{inflow} reservoir-limited</span>
                <span>{k ? `${k.by_bottleneck.FLOAT} rod float · ${k.by_bottleneck.PUMP} pump · ${k.by_bottleneck.TORQUE} torque` : ''}</span>
              </div>
            </div>
            <div className="tiles">
              <Tile label="Re-steams ≤ 30 d" value={k?.resteams_due_30d ?? '…'} of={`/${producing.length}`} />
              <Tile label="Steam today" value={k ? <Metric q={k.steam_today_t} name="Steam injected today" format={(v) => fmt(v)} unit="" /> : '…'} of="t" />
            </div>
          </div>
        </Panel>
      </div>

      {wells && <div className="section"><ResteamCalendar wells={wells} /></div>}

      <div className="section">
        <Panel title="Wells" action={<PillLink onClick={() => setAll((a) => !a)}>{all ? 'Needs attention first' : `All ${wells?.length ?? ''} wells`}</PillLink>}>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Cycle · day</th><th>Well</th><th>Limited by</th><th className="r">Oil</th><th className="r">Risk 30 d</th><th className="r">Re-steam in</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((w) => {
                  const st = wellStatus(w);
                  const prod = w.phase === 'PRODUCTION';
                  return (
                    <tr key={w.well_id} className="link" tabIndex={0} onClick={() => nav(`/wells/${w.well_id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/wells/${w.well_id}`)}>
                      <td className="time">c{w.cycle_no} · d{w.production_day}</td>
                      <td>
                        <span className="row">
                          <span className="well-ico"><WellIcon /></span>
                          <span><div className="name">{w.well_id}</div><div className="size">{st.why || `${LIMIT_LABEL[w.active].toLowerCase()}-limited`}</div></span>
                        </span>
                      </td>
                      <td>{prod ? <span className="row"><i className="dot" style={{ background: LIMIT_VAR[w.active] }} />{LIMIT_LABEL[w.active]}</span> : <span className="faint">—</span>}</td>
                      <td className="r num">{prod ? `${fmt(w.oil_bopd.value, 1)} bbl/d` : '—'}</td>
                      <td className="r num">{prod ? pct(w.risk_30d.value) : '—'}</td>
                      <td className="r num">{w.days_to_resteam === null ? '—' : w.resteam_p50_day! >= 220 ? '> 220 d' : `${w.days_to_resteam} d`}</td>
                      <td><Status tone={st.tone}>{st.label}</Status></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
