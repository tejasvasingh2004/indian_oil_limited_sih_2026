import { Link, useNavigate } from 'react-router-dom';
import { useWells } from '@/api/hooks';
import type { FailureMode } from '@/api/types';
import { Card } from '@/components/Card';
import { DataModeChip, StatusChip } from '@/components/Chips';
import { Frame } from '@/components/Frame';
import { Metric } from '@/components/Metric';
import { PillBar } from '@/components/PillBar';
import { DesertScene } from '@/components/scenes/DesertScene';
import { LIMIT_LABEL, LIMIT_VAR, MODE_LABEL, fmt, pct } from '@/lib/format';

const MODES: FailureMode[] = ['ROD_FAILURE', 'PUMP_UNSETTING', 'PUMP_FAILURE'];

/** Risk Center (frontend.md §5.6): wells ranked by 30-day failure probability, with the physics exposures behind it. */
export function RiskCenter() {
  const { data: wells } = useWells();
  const nav = useNavigate();
  const rows = (wells ?? []).filter((w) => w.phase === 'PRODUCTION').sort((a, b) => b.risk_30d.value - a.risk_30d.value);
  const max = Math.max(0.01, ...rows.flatMap((w) => MODES.map((m) => w.risk_by_mode[m])));

  return (
    <Frame scene={<DesertScene variant="field" />} focus>
      <header className="hero-title compact">
        <h1>Risk Center</h1>
        <p>30-day probability of rod failure, pump unsetting and pump failure · survival model on physics exposures</p>
        <div className="hero-chips"><DataModeChip /><StatusChip tone="warn">Failure costs ASSUMED</StatusChip></div>
      </header>
      <div className="designer scroll">
        <Card strong>
          <table className="t risk-table">
            <thead>
              <tr>
                <th>Well</th><th className="r">Risk 30 d</th>
                {MODES.map((m) => <th key={m} className="c">{MODE_LABEL[m]}</th>)}
                <th className="r">FMI min</th><th className="r">Goodman</th><th className="r">Fillage</th><th>Limit</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.well_id} className="link" tabIndex={0} onClick={() => nav(`/wells/${w.well_id}?view=rods`)}
                  onKeyDown={(e) => e.key === 'Enter' && nav(`/wells/${w.well_id}?view=rods`)}>
                  <td><b style={{ fontWeight: 600 }}>{w.well_id}</b> <span className="faint">c{w.cycle_no} · d{w.production_day}</span></td>
                  <td className="r"><Metric q={w.risk_30d} name={`30-day failure risk · ${w.well_id}`} format={(v) => pct(v)} size="sm" align="right" /></td>
                  {MODES.map((m) => {
                    const v = w.risk_by_mode[m];
                    return (
                      <td key={m} className="c">
                        <span className="heat" title={`${MODE_LABEL[m]} ${pct(v, 1)}`} style={{ background: `color-mix(in srgb, var(--fail) ${Math.round((v / max) * 85)}%, transparent)` }}>
                          {pct(v, 1)}
                        </span>
                      </td>
                    );
                  })}
                  <td className={`r num ${w.fmi_min.value < 0.165 ? 'flag-fail' : ''}`}>{fmt(w.fmi_min.value, 2)}</td>
                  <td className={`r num ${w.goodman_sr >= 0.81 ? 'flag-fail' : ''}`}>{fmt(w.goodman_sr, 2)}</td>
                  <td className="r num">{pct(w.fillage)}</td>
                  <td><span className="dot" style={{ background: LIMIT_VAR[w.active], marginRight: 5 }} />{LIMIT_LABEL[w.active]}</td>
                  <td className="faint">→</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="label-3" style={{ marginBottom: 0 }}>
            Exposures shown are the model's covariates: low float margin, high rod stress and low fillage (fluid pound) raise the hazard.
            Click a well to open its rod string. Values are simulated; the survival model trains on OIL's failure records in R1.
          </p>
        </Card>
      </div>
      <PillBar title="Risk" actions={<Link className="pill-btn" to="/field">Field board</Link>} />
    </Frame>
  );
}
