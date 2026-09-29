import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRodProfile, useWellState } from '@/api/hooks';
import { Metric } from '@/components/Metric';
import type { Hotspot } from '@/components/scenes/DesertScene';
import { SCENE } from '@/components/scenes/DesertScene';
import { depthY } from '@/components/scenes/DownholeScene';
import { REG } from '@/mocks/registry';
import { fmt } from '@/lib/format';
import type { View } from './WellConsole';

export function useHotspots(wellId: string, view: View, setView: (v: View) => void) {
  const { data: s } = useWellState(wellId);
  const { data: rods } = useRodProfile(wellId);
  const [active, setActive] = useState<{ id: string; rect: DOMRect } | null>(null);
  useEffect(() => setActive(null), [view, wellId]);

  const lowFmi = !!s && s.indicators.fmi_min.value < s.indicators.fmi_min.limit * 1.1;
  const spots: Hotspot[] = view === 'surface'
    ? [
        { id: 'unit', x: SCENE.PIVOT.x - SCENE.HEAD_R + 40, y: SCENE.PIVOT.y - 44, label: 'Pumping unit: speed, stroke and rod stress' },
        { id: 'wellhead', x: SCENE.WELL_X, y: SCENE.GROUND - 72, label: 'Wellhead: rates and temperature' },
        { id: 'motor', x: SCENE.GEAR.x + 98, y: SCENE.GROUND - 84, label: 'Motor: energy per barrel' },
        { id: 'downhole', x: SCENE.WELL_X, y: SCENE.GROUND + 80, label: 'Downhole: float margin and pump', alert: lowFmi },
      ]
    : [
        ...(rods ? [{ id: 'fmi', x: 800, y: depthY(rods.fmi_min_depth_m), label: 'Minimum float margin along the rod string', alert: lowFmi }] : []),
        { id: 'pump', x: 800, y: depthY(REG['srp.pump_depth_m'].value) + 12, label: 'Pump: fillage and intake pressure' },
        { id: 'heat', x: 1000, y: depthY(REG['reservoir.depth_m'].value + 15), label: 'Heated zone: near-wellbore temperature and viscosity' },
      ];

  let content: ReactNode = null;
  if (active && s) {
    const m = s.measured, e = s.estimated;
    switch (active.id) {
      case 'unit':
        content = <Pop title="Pumping unit">
          <Metric q={m.vfd_hz} name="VFD frequency" label="VFD" unit="Hz" size="sm" />
          <Metric q={m.spm} name="Strokes per minute" label="SPM" digits={1} size="sm" />
          <Metric q={m.stroke_in} name="Stroke length" label="Stroke" unit="in" size="sm" />
          <Metric q={s.indicators.goodman_sr_max} name="Goodman stress ratio (worst section)" label="Goodman" digits={2} size="sm" />
        </Pop>;
        break;
      case 'wellhead':
        content = <Pop title="Wellhead">
          <Metric q={m.oil_rate} name="Oil rate" label="Oil" digits={1} unit="BOPD" size="sm" />
          <Metric q={m.fluid_rate} name="Fluid rate" label="Fluid" digits={0} unit="BFPD" size="sm" />
          <Metric q={m.wellhead_temp_c} name="Wellhead temperature" label="Temp" digits={0} unit="°C" size="sm" />
        </Pop>;
        break;
      case 'motor':
        content = <Pop title="Motor & VFD">
          <Metric q={m.kwh_per_bbl} name="Energy per barrel" label="Energy" digits={1} unit="kWh/bbl" size="sm" />
          <Metric q={s.indicators.impact_index} name="Impact index (float + fluid pound)" label="Impact idx" digits={2} size="sm" />
        </Pop>;
        break;
      case 'downhole':
      case 'fmi':
        content = <Pop title="Rod string" action={view === 'surface' ? { label: 'View rod string', on: () => setView('rods') } : undefined}>
          <Metric q={s.indicators.fmi_min} name="Float Margin Index (minimum)" label={`FMI min @ ${fmt(s.indicators.fmi_min.depth_m)} m`} digits={2} size="sm" />
          <span className="label-3" style={{ alignSelf: 'end' }}>limit {s.indicators.fmi_min.limit}</span>
          {rods && <span className="label-3" style={{ gridColumn: '1 / -1' }}>Tubing {fmt(rods.temp_c[0])} °C at surface → {fmt(rods.temp_c[rods.temp_c.length - 1])} °C at the pump; viscosity around the rods {fmt(rods.mu_cp[rods.mu_cp.length - 1])}–{fmt(rods.mu_cp[0])} cP.</span>}
        </Pop>;
        break;
      case 'pump':
        content = <Pop title="Pump">
          <Metric q={e.fillage} name="Pump fillage (estimated)" label="Fillage" format={(v) => `${fmt(v * 100)}%`} size="sm" showRange />
          <Metric q={e.pip_psi} name="Pump intake pressure (estimated)" label="PIP" unit="psi" size="sm" showRange />
        </Pop>;
        break;
      case 'heat':
        content = <Pop title="Heated zone" action={view === 'rods' ? { label: 'Zoom to reservoir', on: () => setView('reservoir') } : undefined}>
          <Metric q={e.t_nwb_c} name="Near-wellbore temperature (estimated)" label="T near well" unit="°C" size="sm" showRange />
          <Metric q={e.viscosity_cp} name="Viscosity (estimated)" label="Viscosity" unit="cP" size="sm" showRange />
        </Pop>;
        break;
    }
  }

  return {
    spots,
    active,
    open: (id: string, rect: DOMRect) => setActive((a) => (a?.id === id ? null : { id, rect })),
    close: () => setActive(null),
    content,
  };
}

function Pop({ title, children, action }: { title: string; children: ReactNode; action?: { label: string; on: () => void } }) {
  return (
    <>
      <div className="label" style={{ marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>{children}</div>
      {action && <button className="pill-btn" style={{ marginTop: 10 }} onClick={action.on}>{action.label} →</button>}
    </>
  );
}

export function HotspotPopover({ rect, onClose, children }: { rect: DOMRect; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const out = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!ref.current?.contains(t) && !t.closest('.svg-hotspot') && !t.closest('.overlay')) onClose();
    };
    window.addEventListener('keydown', esc);
    document.addEventListener('mousedown', out);
    return () => { window.removeEventListener('keydown', esc); document.removeEventListener('mousedown', out); };
  }, [onClose]);
  const x = Math.min(window.innerWidth - 150, Math.max(150, rect.left + rect.width / 2));
  const above = rect.top > 220;
  return (
    <div ref={ref} className="card strong" role="dialog" aria-label="Details"
      style={{ position: 'fixed', left: x, top: above ? rect.top - 12 : rect.bottom + 12, transform: `translate(-50%, ${above ? '-100%' : '0'})`, width: 260, padding: 14, borderRadius: 18, zIndex: 30 }}>
      {children}
    </div>
  );
}
