import { useState } from 'react';
import { useLedger, useProduction, useWellState } from '@/api/hooks';
import { Card } from '@/components/Card';
import { LineChart, Strip } from '@/components/charts';
import { Drawer } from '@/components/Drawer';
import { Metric } from '@/components/Metric';
import { MODE_LABEL, fmt, pct } from '@/lib/format';

/** Bottom-centre card (the reference's "Loan Status" + barcode): the well's vital signs. */
export function StatusCard({ wellId }: { wellId: string }) {
  const { data: s } = useWellState(wellId);
  const { data: prod } = useProduction(wellId);
  const [open, setOpen] = useState(false);
  if (!s) return <div className="card skeleton" style={{ height: 130 }} />;
  const strip = prod ? [...prod.history.map((p) => p.value), ...prod.forecast.map((p) => p.value)] : [];
  return (
    <Card title="Well status" onExpand={() => setOpen(true)} expandLabel="Open forecast and prediction ledger">
      <div className="kpi-row">
        <Metric q={s.measured.oil_rate} name="Oil rate" label="Oil" digits={1} unit="BOPD" size="sm" />
        <Metric q={s.estimated.t_nwb_c} name="Near-wellbore temperature (estimated)" label="T near well" digits={0} unit="°C" size="sm" />
        <Metric q={s.estimated.viscosity_cp} name="Viscosity at near-wellbore temperature (estimated)" label="Viscosity" digits={0} unit="cP" size="sm" />
        <Metric q={s.measured.vfd_hz} name="VFD frequency" label={`VFD · ${fmt(s.measured.spm.value, 1)} SPM`} digits={0} unit="Hz" size="sm" />
        <Metric q={s.measured.kwh_per_bbl} name="Energy per barrel" label="Energy" digits={1} unit="kWh/bbl" size="sm" />
        <Metric q={s.risk_30d.any} name="30-day failure risk (survival model)" label="Risk 30 d" format={(v) => pct(v)} size="sm" />
      </div>
      <div style={{ marginTop: 12 }}>
        {prod ? (
          <Strip values={strip} splitAt={prod.history.length} ariaLabel={`Daily oil over the last ${prod.history.length} days, then a 14-day forecast`} />
        ) : <div className="skeleton" style={{ height: 34 }} />}
        <div className="row between label-3" style={{ marginTop: 4 }}>
          <span>day {prod?.history[0]?.day}</span><span>today · day {s.cycle.production_day}</span><span>forecast +14 d</span>
        </div>
      </div>
      {open && <StatusDrawer wellId={wellId} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function StatusDrawer({ wellId, onClose }: { wellId: string; onClose: () => void }) {
  const { data: s } = useWellState(wellId);
  const { data: prod } = useProduction(wellId);
  const { data: ledger } = useLedger(wellId);
  const cov = ledger?.length ? ledger.filter((e) => e.in_interval).length / ledger.length : 0;
  return (
    <Drawer title="Forecast & ledger" sub={`${wellId} · Model A production forecast and prediction ledger`} onClose={onClose}>
      {prod && (
        <LineChart height={190} ariaLabel="Oil rate history and 14-day forecast with band" xLabel="production day" yFormat={(v) => fmt(v)}
          series={[
            { x: prod.history.map((p) => p.day), y: prod.history.map((p) => p.value), color: 'var(--text-2)', dots: true },
            { x: prod.forecast.map((p) => p.day), y: prod.forecast.map((p) => p.value), lo: prod.forecast.map((p) => p.lo!), hi: prod.forecast.map((p) => p.hi!), color: 'var(--accent-deep)', dashed: true },
          ]}
          vlines={[{ x: prod.history[prod.history.length - 1].day, label: 'today', strong: true }]} />
      )}
      {s && (
        <table className="t">
          <thead><tr><th>Failure mode (30 d)</th><th className="r">Probability</th></tr></thead>
          <tbody>
            {Object.entries(s.risk_30d.by_mode).map(([k, v]) => <tr key={k}><td>{MODE_LABEL[k]}</td><td className="r num">{pct(v, 1)}</td></tr>)}
          </tbody>
        </table>
      )}
      {ledger && (
        <>
          <div className="label">Prediction ledger — coverage {pct(cov)} of {ledger.length} days (80% target)</div>
          <table className="t">
            <thead><tr><th>Day</th><th className="r">Predicted</th><th className="r">Band</th><th className="r">Actual</th><th /></tr></thead>
            <tbody>
              {ledger.slice().reverse().slice(0, 10).map((e) => (
                <tr key={e.day}>
                  <td className="num">{e.day}</td>
                  <td className="r num">{fmt(e.predicted, 1)}</td>
                  <td className="r num faint">{fmt(e.lo, 1)}–{fmt(e.hi, 1)}</td>
                  <td className="r num">{fmt(e.actual, 1)}</td>
                  <td className="r">{e.in_interval ? '✓' : '✕'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Drawer>
  );
}
