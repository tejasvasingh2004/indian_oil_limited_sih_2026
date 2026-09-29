import type { Strategy } from '@/api/types';
import { Metric } from '@/components/Metric';
import { fmt, inr, pct } from '@/lib/format';

const plan = (s: Strategy) => {
  const hz = s.srp_plan.map((b) => b.vfd_hz);
  if (new Set(hz).size <= 1) return `${hz[0]} Hz fixed`;
  return `${hz[0]} → ${Math.min(...hz)} Hz (${s.srp_plan.length} steps)`;
};

/** Current practice vs recommended (frontend.md §5.4). */
export function Comparison({ current: c, s }: { current: Strategy; s: Strategy }) {
  const P = (label: string, a: string, b: string) => (
    <tr key={label}><th>{label}</th><td className="num">{a}</td><td className="num"><b style={{ fontWeight: 600 }}>{b}</b></td></tr>
  );
  return (
    <table className="t">
      <thead><tr><th /><th>Current</th><th>{s.label.toLowerCase()}</th></tr></thead>
      <tbody>
        {P('Steam', `${fmt(c.parameters.steam_t)} t`, `${fmt(s.parameters.steam_t)} t`)}
        {P('Injection pressure', `${c.parameters.inj_pressure_ksc} ksc`, `${s.parameters.inj_pressure_ksc} ksc`)}
        {P('Soak', `${c.parameters.soak_d} d`, `${s.parameters.soak_d} d`)}
        {P('Stroke', `${c.parameters.stroke_in} in`, `${s.parameters.stroke_in} in`)}
        {P('Pump speed', plan(c), plan(s))}
        {P('Re-steam', `day ${c.resteam_window.p50_day}`, `day ${s.resteam_window.p50_day} [${s.resteam_window.p10_day}–${s.resteam_window.p90_day}]`)}
        <tr><th>Cycle oil</th><td className="num">{fmt(c.kpis.cycle_oil_bbl.value)}</td>
          <td><Metric q={s.kpis.cycle_oil_bbl} name="Cycle oil" size="sm" digits={0} showRange unit="bbl" /></td></tr>
        {P('Oil per cycle-day', fmt(c.kpis.oil_per_cycle_day.value, 1), fmt(s.kpis.oil_per_cycle_day.value, 1))}
        {P('SOR', fmt(c.kpis.sor.value, 2), fmt(s.kpis.sor.value, 2))}
        {P('kWh/bbl', fmt(c.kpis.kwh_per_bbl.value, 1), fmt(s.kpis.kwh_per_bbl.value, 1))}
        {P('Risk (avg 30 d)', pct(c.kpis.failure_risk.value), pct(s.kpis.failure_risk.value))}
        {P('P90 FMI min', fmt(c.fmi_p90.value, 2), fmt(s.fmi_p90.value, 2))}
        <tr><th>Net ₹/day</th><td className="num">{inr(c.kpis.net_inr_per_day.value)}</td>
          <td><Metric q={s.kpis.net_inr_per_day} name="Net ₹/day (cycle average)" size="sm" format={(v) => inr(v)} showRange /></td></tr>
      </tbody>
      <tfoot><tr><td colSpan={3} className="label-3">PREDICTED · SIMULATED data · click a value for evidence</td></tr></tfoot>
    </table>
  );
}
