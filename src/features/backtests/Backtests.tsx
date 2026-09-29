import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/Shell';
import { Panel, Status } from '@/components/ui';

/**
 * Counterfactual backtest (frontend.md §5.9). Skill always comes before gains, and
 * values stay as ‹placeholders› until a stored run exists (PRD §11 claims policy).
 */
export function Backtests() {
  const P = ({ children }: { children: string }) => <span className="ph">‹{children}›</span>;
  const steps = [
    ['Learn', 'Fit the twin on cycles before cycle k only.'],
    ['Check the forecast', 'Predict cycle k with the settings OIL actually used, then compare with what happened.'],
    ['Skill gate', 'Keep only cycles where the forecast was good (oil error ≤ 20%, band coverage 70–90%).'],
    ['Optimize', 'Re-plan cycle k with the same limits and prices; record the predicted difference.'],
    ['Report', 'Show forecast skill first. Show gains only for cycles that passed the skill gate.'],
  ];
  return (
    <>
      <PageHeader title="Backtests" sub="Prove the value on history before anything touches the field" actions={<Status tone="warn">No stored run yet</Status>} />
      <div className="grid-2">
        <Panel title="How it works">
          <table className="tbl">
            <tbody>
              {steps.map(([t, d], i) => (
                <tr key={t}><td className="time">{i + 1}</td><td><div className="name">{t}</div><div className="size" style={{ whiteSpace: 'normal' }}>{d}</div></td></tr>
              ))}
            </tbody>
          </table>
          <button className="btn" disabled style={{ marginTop: 12 }} title="Runs in the backend backtest harness">Run on simulated history — needs backend</button>
        </Panel>
        <Panel title="Report" action={<span className="small muted">history: simulated</span>}>
          <div className="meter-title">1 · Forecast skill</div>
          <div className="tiles" style={{ flexWrap: 'wrap' }}>
            <div className="tile"><span className="t-label">Cycles checked</span><span className="t-value"><P>N</P></span></div>
            <div className="tile"><span className="t-label">Oil error</span><span className="t-value"><P>x%</P></span></div>
            <div className="tile"><span className="t-label">In band</span><span className="t-value"><P>y%</P></span></div>
          </div>
          <div className="meter-title" style={{ marginTop: 18 }}>2 · Predicted difference (skill-passing cycles only)</div>
          <div className="tiles" style={{ flexWrap: 'wrap', opacity: 0.6 }}>
            <div className="tile"><span className="t-label">Net ₹/day</span><span className="t-value"><P>Δ</P></span></div>
            <div className="tile"><span className="t-label">Steam-oil ratio</span><span className="t-value"><P>Δ</P></span></div>
            <div className="tile"><span className="t-label">Excluded</span><span className="t-value"><P>n</P></span></div>
          </div>
          <p className="small faint" style={{ marginBottom: 0 }}>
            No gain is shown until it comes from a stored, replayable backtest. Predicted gains live on <Link to="/wells/BG-023/optimize">Optimize</Link>, labelled as predictions.
          </p>
        </Panel>
      </div>
    </>
  );
}
