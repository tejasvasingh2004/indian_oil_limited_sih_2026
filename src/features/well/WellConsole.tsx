import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAdvanceTime, useBottleneck, useLedger, useResteam, useRodProfile, useWellState } from '@/api/hooks';
import { Frame } from '@/components/Frame';
import { PillBar } from '@/components/PillBar';
import { DesertScene } from '@/components/scenes/DesertScene';
import { DownholeScene } from '@/components/scenes/DownholeScene';
import { DataModeChip, StatusChip, TrustMeter } from '@/components/Chips';
import { HomeIcon } from '@/components/Icons';
import { dateTime, fmt } from '@/lib/format';
import { useUi } from '@/store/ui';
import { REG } from '@/mocks/registry';
import { IdentCard } from './IdentCard';
import { NavigatorCard } from './NavigatorCard';
import { ResteamCard } from './ResteamCard';
import { FloatCard } from './FloatCard';
import { StatusCard } from './StatusCard';
import { useHotspots, HotspotPopover } from './hotspots';

export type View = 'surface' | 'rods' | 'reservoir';

export function WellConsole() {
  const { wellId = 'BG-023' } = useParams();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || 'surface';
  const setView = (v: View) => setParams(v === 'surface' ? {} : { view: v }, { replace: true });

  const state = useWellState(wellId);
  const rods = useRodProfile(wellId);
  const s = state.data;
  const { spots, active, open, close, content } = useHotspots(wellId, view, setView);

  const scene = view === 'surface'
    ? <DesertScene spm={s?.measured.spm.value ?? 4.8} hotspots={spots} activeHotspot={active?.id} onHotspot={open} />
    : <DownholeScene profile={rods.data} tNwb={s?.estimated.t_nwb_c.value} tRes={REG['reservoir.temperature_c'].value}
        reservoirDepthM={REG['reservoir.depth_m'].value} focus={view === 'reservoir' ? 'reservoir' : 'rods'}
        hotspots={spots} activeHotspot={active?.id} onHotspot={open} />;

  const producing = s?.cycle.phase === 'PRODUCTION';
  const floatNow = s && s.indicators.fmi_min.value < s.indicators.fmi_min.limit;
  const [twinShown, setTwinShown] = useState(false);
  const adv = useAdvanceTime();
  const showToast = useUi((u) => u.showToast);

  return (
    <Frame scene={scene}>
      <div className="console">
        <div className="a-ident"><IdentCard wellId={wellId} /></div>

        <header className="a-title hero-title">
          <h1>Well {wellId}</h1>
          <p>
            {s ? <>Cycle {s.cycle.cycle_no} · {s.cycle.phase.toLowerCase()} day {s.cycle.production_day} · Jodhpur Sandstone · {dateTime(s.as_of)}</> : 'Loading…'}
          </p>
          {s && (
            <div className="hero-chips">
              <DataModeChip />
              <TrustMeter trust={s.trust} />
              <StatusChip tone={s.dq.score >= 0.8 ? 'ok' : 'warn'}>DQ {fmt(s.dq.score, 2)}</StatusChip>
              <StatusChip tone={s.ood.flag ? 'fail' : 'ok'}>{s.ood.flag ? 'Out of distribution' : 'In distribution'}</StatusChip>
            </div>
          )}
        </header>

        <div className="a-resteam">{producing ? <ResteamCard wellId={wellId} /> : <NotProducing phase={s?.cycle.phase} />}</div>
        <div className="a-nav">{producing ? <NavigatorCard wellId={wellId} /> : <div className="card" style={{ flex: 1 }} />}</div>

        <div className="a-hero">
          {s?.ood.flag && (
            <div className="banner fail card" role="alert" style={{ maxWidth: 520, marginBottom: 'auto' }}>
              <b>⛔ Out-of-distribution condition.</b> {s.ood.detail} Prediction confidence LOW · optimization BLOCKED · engineer review.
            </div>
          )}
          {!s?.ood.flag && floatNow && (
            <div className="banner fail card" role="alert" style={{ maxWidth: 520, marginBottom: 'auto' }}>
              <b>Rod float at the current speed.</b> FMI_min {fmt(s!.indicators.fmi_min.value, 2)} is below the {s!.indicators.fmi_min.limit} limit as the tubing fluid cools. See the Navigator levers.
            </div>
          )}
          {twinShown && <TwinUpdate wellId={wellId} onClose={() => setTwinShown(false)} />}
          <div className="dots" role="group" aria-label="Scene view" style={{ marginBottom: 6 }}>
            {(['surface', 'rods', 'reservoir'] as View[]).map((v, i) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)} title={v === 'surface' ? 'Surface unit' : v === 'rods' ? 'Rod string (FMI along depth)' : 'Reservoir heated zone'}
                aria-label={v === 'surface' ? 'Surface unit' : v === 'rods' ? 'Rod string' : 'Reservoir'}>
                {i === 0 ? <HomeIcon /> : i}
              </button>
            ))}
          </div>
        </div>

        <div className="a-status"><StatusCard wellId={wellId} /></div>
        <div className="a-float">{producing ? <FloatCard wellId={wellId} onShowRods={() => setView('rods')} /> : <div className="card" />}</div>
      </div>

      <PillBar wellId={wellId} actions={<>
        <button className="pill-btn" disabled={adv.isPending}
          title="Demo only: the simulator emits the next day of measurements for all wells and the twin runs its update tick"
          onClick={() => adv.mutate(1, { onSuccess: () => { setTwinShown(true); showToast('Simulated clock advanced one day for all wells.'); } })}>
          {adv.isPending ? 'Updating…' : '+1 day'}
        </button>
        <Link className="pill-btn" to={`/wells/${wellId}/scenario-lab`}>Scenario Lab <span className="plus">+</span></Link>
        <Link className="pill-btn primary" to={`/wells/${wellId}/optimize`}>Optimize <span className="plus">+</span></Link>
      </>} />

      {active && <HotspotPopover rect={active.rect} onClose={close}>{content}</HotspotPopover>}
    </Frame>
  );
}

function NotProducing({ phase }: { phase?: string }) {
  return (
    <div className="card" style={{ flex: 1 }}>
      <h2 className="card-title">Re-steam window</h2>
      <p className="muted center">The well is in the {phase?.toLowerCase()} phase. Production KPIs start after soak.</p>
    </div>
  );
}

/** Demo step 9: how the twin absorbed the newest measurement. */
function TwinUpdate({ wellId, onClose }: { wellId: string; onClose: () => void }) {
  const ledger = useLedger(wellId);
  const bott = useBottleneck(wellId);
  const resteam = useResteam(wellId);
  const last = ledger.data?.[ledger.data.length - 1];
  const cov = ledger.data ? ledger.data.filter((e) => e.in_interval).length / ledger.data.length : 0;
  if (!last) return null;
  return (
    <div className="card strong" style={{ padding: '10px 14px', borderRadius: 16, fontSize: 12, maxWidth: 540, marginBottom: 10 }} role="status">
      <div className="row between"><b>Twin update · production day {last.day}</b><button className="pill-btn" style={{ padding: '2px 8px' }} onClick={onClose} aria-label="Dismiss">×</button></div>
      <div className="num">
        Measured oil {fmt(last.actual, 1)} BOPD · predicted {fmt(last.predicted, 1)} [{fmt(last.lo, 1)}–{fmt(last.hi, 1)}] → {last.in_interval ? 'inside the band ✓' : 'outside the band ✕'}
      </div>
      <div className="faint">
        Ledger coverage {fmt(cov * 100)}% over {ledger.data?.length} days · bottleneck {bott.data?.active.toLowerCase() ?? '…'} · re-steam P50 day {resteam.data?.window.p50_day ?? '…'}
      </div>
    </div>
  );
}
