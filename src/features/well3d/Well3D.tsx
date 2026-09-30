import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useSnapshot, useWellState } from '@/api/hooks';
import type { Quantity, WellSnapshot } from '@/api/types';
import { DropIcon, FlameIcon, GaugeIcon } from '@/components/Icons';
import { Metric } from '@/components/Metric';
import { PageHeader } from '@/components/Shell';
import { Panel, StatCard, Status } from '@/components/ui';
import { LIMIT_LABEL, fmt } from '@/lib/format';
import { REG } from '@/mocks/registry';
import { HoverInfo, Layer, SceneOptions, View, WellScene } from './WellScene';

// Illustrative Marwar-basin column above the Baghewala pay (depths ASSUMED, not OIL data).
const LAYERS: Layer[] = [
  { name: 'Quaternary sand & alluvium', from: 0, to: 150, color: '#e3d3a6' },
  { name: 'Tertiary sandstone & shale', from: 150, to: 450, color: '#cdbb94' },
  { name: 'Nagaur Group sandstone', from: 450, to: 800, color: '#c7a27c' },
  { name: 'Bilara Group dolomite & evaporite', from: 800, to: 1150, color: '#b9b4a7' },
  { name: 'Jodhpur Sandstone', from: 1150, to: 1190, color: '#d59a4f', pay: true },
  { name: 'Malani basement', from: 1190, to: 1300, color: '#8c8479' },
];

const HZ_MIN = REG['limits.vfd_hz_min'].value;
const HZ_MAX = REG['limits.vfd_hz_max'].value;
const HZ_TRAINED = REG['ml.trained_vfd_hz_max'].value;

/** Debounce slider values so dragging asks the twin a few times a second, not every pixel. */
function useDebounced<T>(v: T, ms = 90) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export default function Well3D() {
  const { wellId = 'BG-023' } = useParams();
  const [params] = useSearchParams();
  const initialView = params.get('view') as View | null;
  const { data: s } = useWellState(wellId);
  const today = s?.cycle.production_day;
  const hzNow = s?.measured.vfd_hz.value;
  const [day, setDay] = useState<number | null>(null);
  const [hz, setHz] = useState<number | null>(null);
  const [opts, setOpts] = useState<SceneOptions>(() => ({
    xray: false, heat: true, labels: true,
    motion: !(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
  }));
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const qDay = useDebounced(day);
  const qHz = useDebounced(hz);
  const { data: snap, isFetching } = useSnapshot(wellId, qDay ?? undefined, qHz ?? undefined);

  useEffect(() => { setDay(null); setHz(null); }, [wellId]);

  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<WellScene | null>(null);
  const [webgl, setWebgl] = useState(true);
  useEffect(() => {
    if (!host.current) return;
    try {
      scene.current = new WellScene(host.current, LAYERS, setHover);
      if (initialView === 'surface' || initialView === 'reservoir') scene.current.view(initialView, false);
    } catch {
      setWebgl(false);
    }
    return () => { scene.current?.dispose(); scene.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wellId]);
  useEffect(() => { if (snap) scene.current?.update(snap); }, [snap]);
  useEffect(() => { scene.current?.setOptions(opts); }, [opts]);

  const producing = s?.cycle.phase === 'PRODUCTION';
  const dayV = day ?? today ?? 0;
  const hzV = hz ?? hzNow ?? 45;
  const changed = day !== null || hz !== null;
  const end = snap ? Math.max(snap.cycle_end_day, dayV, 60) : 200;
  const q = (value: number, sn: WellSnapshot, unit?: string): Quantity => ({ value, unit, provenance: 'DERIVED', evidence_id: sn.evidence_id, assumed: true });

  return (
    <>
      <PageHeader
        title={`3D well · ${wellId}`}
        sub="Sandbox: drag the sliders and the twin recomputes rods, heat and rates. Nothing here is saved or sent to the field."
        actions={<>
          <Link className="btn ghost" to={`/wells/${wellId}`}>Back to well</Link>
          <Link className="btn primary" to={`/wells/${wellId}/optimize`}>Optimize</Link>
        </>}
      />

      <div className="stats">
        <StatCard variant="dark" icon={<DropIcon />} label={producing ? `Oil rate on day ${dayV}` : 'Oil rate'}
          value={snap ? <Metric q={q(snap.oil_bopd, snap)} name="Oil rate at the chosen day and speed" digits={1} unit="" /> : '…'} unit="BOPD"
          hint={snap ? `fluid ${fmt(snap.fluid_bfpd)} BFPD · pump ${fmt(snap.fillage * 100)}% full · ${LIMIT_LABEL[snap.active].toLowerCase()}-limited` : ''} />
        <StatCard variant="grey" icon={<GaugeIcon />} label="Rod float margin"
          value={snap ? <Metric q={q(snap.fmi_min, snap)} name="Float margin at the weakest rod point" digits={2} /> : '…'}
          hint={snap ? `limit ${snap.fmi_limit} · weakest at ${fmt(snap.fmi_min_depth_m)} m${snap.fmi_min < snap.fmi_limit ? ' · rods float' : ''}` : ''} />
        <StatCard variant="lime" icon={<FlameIcon />} label="Heated zone radius"
          value={snap ? <Metric q={q(snap.heated_radius_m, snap)} name="Heated zone radius (display model)" digits={0} unit="" /> : '…'} unit="m"
          hint={snap ? `${fmt(snap.t_nwb_c)} °C near the well · ${fmt(snap.viscosity_cp)} cP` : ''} />
      </div>

      <div className="section scene-grid">
        <section className="panel scene-panel">
          <div className="scene-host" ref={host} aria-label={`3D cut-away of well ${wellId}: strata, heated zone, rod string coloured by float margin and the pumpjack`} role="img" />
          {!webgl && <div className="note bad scene-fallback"><b>3D is not available in this browser.</b> WebGL could not start; the numbers on the right still update.</div>}
          <div className="scene-toolbar">
            <div className="seg" role="group" aria-label="Camera">
              {(['whole', 'surface', 'reservoir'] as View[]).map((v) => (
                <button key={v} aria-pressed="false" onClick={() => scene.current?.view(v)}>{v === 'whole' ? 'Whole well' : v === 'surface' ? 'Pumpjack' : 'Pump & pay'}</button>
              ))}
            </div>
            {isFetching && <span className="small muted">updating…</span>}
          </div>
          <div className="scene-legend small">
            <span><i className="sw" style={{ background: '#5ea634' }} />float margin comfortable</span>
            <span><i className="sw" style={{ background: '#e0a030' }} />near the limit</span>
            <span><i className="sw" style={{ background: '#d8453a' }} />rods float</span>
            <span><i className="sw" style={{ background: '#ff9a3c', opacity: 0.7 }} />heated zone</span>
            <span className="faint">depth not to scale · drag to orbit, scroll to zoom</span>
          </div>
          {hover && (
            <div className="scene-hover" role="status">
              <b>{fmt(hover.depth_m)} m</b> · float margin {fmt(hover.fmi, 2)} · {fmt(hover.temp_c)} °C · {fmt(hover.mu_cp)} cP
              <div className="faint">rod section {hover.section} · grade {hover.grade} · {hover.diameter_in}″</div>
            </div>
          )}
        </section>

        <Panel title="Sandbox" right={changed ? <button className="btn sm" onClick={() => { setDay(null); setHz(null); }}>Reset to today</button> : <Status tone="neutral">Today</Status>}>
          <div className="stack" style={{ gap: 18 }}>
            <label className="slider">
              <span className="row between"><span>Production day</span><b className="num">{dayV}{today !== undefined && dayV === today ? ' · today' : ''}</b></span>
              <input type="range" min={0} max={end} value={dayV} disabled={!producing} onChange={(e) => setDay(Number(e.target.value))} aria-label="Production day" />
              <span className="row between small faint"><span>after soak</span><span>re-steam due · day {snap ? snap.cycle_end_day : '…'}</span></span>
            </label>
            <label className="slider">
              <span className="row between"><span>Pump speed</span><b className="num">{fmt(hzV)} Hz{snap ? ` · ${fmt(snap.spm, 1)} SPM` : ''}</b></span>
              <input type="range" min={HZ_MIN} max={HZ_MAX} step={1} value={hzV} disabled={!producing} onChange={(e) => setHz(Number(e.target.value))} aria-label="Pump speed in hertz" />
              <span className="row between small faint"><span>{HZ_MIN}</span><span>trained up to {HZ_TRAINED}</span><span>{HZ_MAX}</span></span>
            </label>
            {hzV > HZ_TRAINED && <div className="note warn">Above {HZ_TRAINED} Hz the models are outside their training data; the optimizer never plans there.</div>}
            {!producing && s && <div className="note">The well is {s.cycle.phase.toLowerCase()} — the pump is stopped, so the sliders are off.</div>}

            <div className="toggles">
              {([['heat', 'Heated zone'], ['xray', 'X-ray rock'], ['labels', 'Labels'], ['motion', 'Motion']] as [keyof SceneOptions, string][]).map(([k, lb]) => (
                <label key={k} className="toggle">
                  <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.checked }))} />
                  <span>{lb}</span>
                </label>
              ))}
            </div>

            {snap && (
              <dl className="kv">
                <dt>Limited by</dt><dd>{LIMIT_LABEL[snap.active]}</dd>
                <dt>Phase</dt><dd>{snap.phase.toLowerCase()} · day {snap.day}</dd>
                <dt>Rod sections</dt><dd>{snap.sections.map((x) => `${x.diameter_in}″ to ${fmt(x.to_m)} m`).join(' · ')}</dd>
                <dt>Rod stress</dt><dd>{snap.sections.map((x) => fmt(x.goodman_sr, 2)).join(' / ')} (Goodman)</dd>
              </dl>
            )}
            <p className="small faint" style={{ margin: 0 }}>
              Strata are illustrative. Heated-zone size uses a demo scale ⚑; the rods, rates and temperatures come from the same twin as the rest of the app. Hover the rod string for values at depth.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}

