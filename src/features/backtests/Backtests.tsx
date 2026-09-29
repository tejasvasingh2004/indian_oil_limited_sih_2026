import { Link } from 'react-router-dom';
import { Card } from '@/components/Card';
import { DataModeChip, StatusChip } from '@/components/Chips';
import { Frame } from '@/components/Frame';
import { PillBar } from '@/components/PillBar';
import { DesertScene } from '@/components/scenes/DesertScene';

/**
 * Counterfactual backtest (frontend.md §5.9, system-design §15). The layout always
 * puts forecast skill before any gain. Values stay as ‹placeholders› until a stored
 * backtest run exists — the claims policy forbids showing an unreplayable gain.
 */
export function Backtests() {
  const P = ({ children }: { children: string }) => <span className="ph">‹{children}›</span>;
  return (
    <Frame scene={<DesertScene variant="field" />} focus>
      <header className="hero-title compact">
        <h1>Backtests</h1>
        <p>Replay history cycle by cycle: forecast skill first, then the predicted difference from optimizing</p>
        <div className="hero-chips"><DataModeChip /><StatusChip tone="warn">No stored backtest run yet</StatusChip></div>
      </header>
      <div className="designer scroll">
        <div className="bt-grid">
          <Card strong title="Protocol" titleLeft>
            <ol className="protocol">
              <li><b>Calibrate</b> the twin and models on cycles before <i>k</i> only.</li>
              <li><b>Forecast cycle <i>k</i></b> under the settings actually used → cycle-oil error, rate MAE, 80% interval coverage.</li>
              <li><b>Skill gate:</b> cycle-oil APE ≤ 20% and coverage 70–90% (placeholder thresholds).</li>
              <li><b>Optimize cycle <i>k</i></b> with the same constraints, registry and prices → predicted Δ ₹/day, SOR, kWh/bbl, failure exposure, with intervals.</li>
              <li><b>Report skill first.</b> Aggregate gains only over cycles that pass the skill gate, and state how many were excluded.</li>
            </ol>
            <button className="pill-btn" disabled title="The harness runs in the backend (backtest/); the in-browser mock does not replay history">
              Run on simulated history · needs backend
            </button>
          </Card>

          <Card strong title="Backtest ‹id› · history: SIMULATED" titleLeft>
            <div className="bt-section">
              <div className="label">1 · Forecast skill (cycle k under the settings actually used)</div>
              <div className="bt-stats">
                <div><span className="label-3">Cycles evaluated</span><b><P>N</P></b></div>
                <div><span className="label-3">Median cycle-oil APE</span><b><P>x%</P></b></div>
                <div><span className="label-3">80% coverage</span><b><P>y%</P></b></div>
                <div><span className="label-3">Pass the skill gate</span><b><P>n</P> of <P>N</P></b></div>
              </div>
            </div>
            <div className="divider" />
            <div className="bt-section" aria-disabled>
              <div className="label">2 · Predicted difference, optimized vs actual (skill-passing cycles only)</div>
              <div className="bt-stats">
                <div><span className="label-3">Δ net ₹/day</span><b><P>median [P10, P90]</P></b></div>
                <div><span className="label-3">Δ SOR</span><b><P>…</P></b></div>
                <div><span className="label-3">Δ kWh/bbl</span><b><P>…</P></b></div>
                <div><span className="label-3">Excluded for low skill</span><b><P>N − n</P></b></div>
              </div>
              <p className="label-3">Label on every number: BACKTESTED on SIMULATED history — not a field result.</p>
            </div>
          </Card>
        </div>
        <p className="label-3 center">
          Why placeholders: PRD §11 forbids any % gain that does not come from a stored, replayable backtest.
          The optimizer's predicted gains are on the <Link to="/wells/BG-023/optimize">Cycle Designer</Link>, labelled PREDICTED.
        </p>
      </div>
      <PillBar title="Backtests" actions={<Link className="pill-btn" to="/field">Field board</Link>} />
    </Frame>
  );
}
