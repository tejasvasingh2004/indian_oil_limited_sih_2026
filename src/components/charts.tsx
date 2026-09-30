// Minimal SVG charts in the v2 dashboard style: thin black/lime lines,
// hatched or grey tracks, lime highlight for the one thing that matters.

// ---- horizontal limit bars (what limits the well) ---------------------------------------------
export interface LimitBar { key: string; label: string; value: number; active?: boolean; next?: boolean }
export function LimitBars({ bars, format }: { bars: LimitBar[]; format: (v: number) => string }) {
  const max = Math.max(...bars.map((b) => b.value)) * 1.05 || 1;
  return (
    <div className="stack" style={{ gap: 9 }} role="img"
      aria-label={bars.map((b) => `${b.label} ${format(b.value)}${b.active ? ', binding' : b.next ? ', next' : ''}`).join('; ')}>
      {bars.map((b) => (
        <div key={b.key} style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr) 82px', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: b.active ? 600 : 400 }}>{b.label}</span>
          <div style={{ height: 12, borderRadius: 3, background: b.active ? 'transparent' : 'var(--soft)', position: 'relative',
            backgroundImage: b.active ? 'repeating-linear-gradient(135deg, #e6e6e6 0 1.5px, #fff 1.5px 7px)' : undefined, border: b.active ? '1px solid var(--line)' : 0 }}>
            <div style={{ position: 'absolute', inset: 0, width: `${(b.value / max) * 100}%`, borderRadius: 3,
              background: b.active ? 'var(--lime)' : b.next ? 'var(--dark)' : 'var(--soft-2)' }} />
          </div>
          <span className="num" style={{ fontSize: 12, textAlign: 'right', fontWeight: b.active ? 600 : 400 }}>
            {format(b.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---- line + band chart ----------------------------------------------------------------------------
export interface Series { x: number[]; y: number[]; lo?: number[]; hi?: number[]; color?: string; dashed?: boolean; width?: number }
export function LineChart({ series, height = 170, xLabel, yFormat, vlines = [], hlines = [], bands = [], ariaLabel, yLog = false, marks = [], xFormat }: {
  series: Series[]; height?: number; xLabel?: string; yFormat: (v: number) => string;
  vlines?: { x: number; label: string; strong?: boolean }[]; hlines?: { y: number; label: string }[];
  bands?: { from: number; to: number; label?: string }[]; ariaLabel: string;
  /** log-scaled y axis (viscosity) */
  yLog?: boolean;
  /** vertical range marks, e.g. a published anchor band at one x */
  marks?: { x: number; lo: number; hi: number; label: string }[];
  xFormat?: (v: number) => string;
}) {
  const W = 560, H = height, P = { l: 46, r: 12, t: 12, b: 24 };
  const xs = series.flatMap((s) => s.x);
  const tf = (v: number) => (yLog ? Math.log10(Math.max(v, 1e-9)) : v);
  const ys = series.flatMap((s) => [...s.y, ...(s.lo ?? []), ...(s.hi ?? [])]).concat(hlines.map((h) => h.y), marks.flatMap((m) => [m.lo, m.hi])).map(tf);
  if (!xs.length) return <div className="skeleton" style={{ height }} />;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const pad = (yMax - yMin) * 0.1 || 1;
  const y0 = yMin - pad, y1 = yMax + pad;
  const sx = (v: number) => P.l + ((v - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const sy = (v: number) => P.t + (1 - (tf(v) - y0) / (y1 - y0)) * (H - P.t - P.b);
  const inv = (t: number) => (yLog ? Math.pow(10, t) : t);
  const path = (x: number[], y: number[]) => x.map((v, i) => `${i ? 'L' : 'M'}${sx(v).toFixed(1)} ${sy(y[i]).toFixed(1)}`).join(' ');
  const ticks = [y0 + (y1 - y0) * 0.15, (y0 + y1) / 2, y1 - (y1 - y0) * 0.15];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
      {bands.map((b, i) => (
        <g key={i}>
          <rect x={sx(b.from)} y={P.t} width={Math.max(2, sx(b.to) - sx(b.from))} height={H - P.t - P.b} fill="var(--lime)" opacity="0.28" rx="4" />
          {b.label && <text x={(sx(b.from) + sx(b.to)) / 2} y={P.t + 11} textAnchor="middle" fontSize="10" fill="var(--ink-2)">{b.label}</text>}
        </g>
      ))}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={sy(inv(t))} y2={sy(inv(t))} stroke="var(--line)" />
          <text x={P.l - 6} y={sy(inv(t)) + 3} textAnchor="end" fontSize="10" fill="var(--ink-3)">{yFormat(inv(t))}</text>
        </g>
      ))}
      {hlines.map((h, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={sy(h.y)} y2={sy(h.y)} stroke="var(--bad)" strokeDasharray="4 4" />
          <text x={W - P.r} y={sy(h.y) - 4} textAnchor="end" fontSize="10" fill="var(--bad)">{h.label}</text>
        </g>
      ))}
      {series.map((s, i) => s.lo && s.hi && (
        <path key={`b${i}`} d={`${path(s.x, s.hi)} ${s.x.slice().reverse().map((v, j) => `L${sx(v).toFixed(1)} ${sy(s.lo![s.x.length - 1 - j]).toFixed(1)}`).join(' ')} Z`}
          fill="var(--lime)" opacity="0.35" />
      ))}
      {series.map((s, i) => (
        <path key={`l${i}`} d={path(s.x, s.y)} fill="none" stroke={s.color ?? 'var(--ink)'} strokeWidth={s.width ?? 1.8} strokeDasharray={s.dashed ? '5 4' : undefined} />
      ))}
      {vlines.map((v, i) => (
        <g key={i}>
          <line x1={sx(v.x)} x2={sx(v.x)} y1={P.t} y2={H - P.b} stroke={v.strong ? 'var(--ink)' : 'var(--ink-3)'} strokeDasharray={v.strong ? undefined : '3 3'} />
          <text x={sx(v.x) + 4} y={H - P.b - 4} fontSize="10" fill="var(--ink-2)">{v.label}</text>
        </g>
      ))}
      {marks.map((m, i) => (
        <g key={`m${i}`}>
          <line x1={sx(m.x)} x2={sx(m.x)} y1={sy(m.lo)} y2={sy(m.hi)} stroke="var(--lime-deep)" strokeWidth="6" strokeLinecap="round" opacity="0.8" />
          <text x={sx(m.x) + 8} y={sy(m.hi) - 2} fontSize="10" fill="var(--ink-2)">{m.label}</text>
        </g>
      ))}
      <text x={W - P.r} y={H - 6} textAnchor="end" fontSize="10" fill="var(--ink-3)">{xLabel}</text>
      <text x={P.l} y={H - 6} fontSize="10" fill="var(--ink-3)">{xFormat ? xFormat(x0) : x0}</text>
    </svg>
  );
}

// ---- SRP plan step chart ---------------------------------------------------------------------------
export function StepPlan({ blocks, until, window: win, compare, height = 120 }: {
  blocks: { from_day: number; to_day: number; vfd_hz: number }[]; until: number; window?: { p10: number; p90: number };
  compare?: number; height?: number;
}) {
  const W = 560, H = height, P = { l: 40, r: 26, t: 10, b: 22 };
  const sx = (d: number) => P.l + (Math.min(d, until) / until) * (W - P.l - P.r);
  const lo = 28, hi = 52;
  const sy = (hz: number) => P.t + (1 - (hz - lo) / (hi - lo)) * (H - P.t - P.b);
  const d = blocks.map((b, i) => `${i ? 'L' : 'M'}${sx(b.from_day)} ${sy(b.vfd_hz)} L${sx(b.to_day + 1)} ${sy(b.vfd_hz)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label={`Pump speed plan: ${blocks.map((b) => `${b.vfd_hz} Hz from day ${b.from_day}`).join(', ')}`}>
      {win && <rect x={sx(win.p10)} y={P.t} width={Math.max(2, sx(win.p90) - sx(win.p10))} height={H - P.t - P.b} fill="var(--lime)" opacity="0.3" rx="4" />}
      {[30, 40, 50].map((hz) => (
        <g key={hz}>
          <line x1={P.l} x2={W - P.r} y1={sy(hz)} y2={sy(hz)} stroke="var(--line)" />
          <text x={P.l - 6} y={sy(hz) + 3} textAnchor="end" fontSize="10" fill="var(--ink-3)">{hz} Hz</text>
        </g>
      ))}
      {compare !== undefined && <line x1={sx(0)} x2={sx(until)} y1={sy(compare)} y2={sy(compare)} stroke="var(--ink-3)" strokeDasharray="5 4" />}
      <path d={d} fill="none" stroke="var(--ink)" strokeWidth="2.2" />
      {[0, Math.round(until / 2), until].map((t) => (
        <text key={t} x={sx(t)} y={H - 6} fontSize="10" fill="var(--ink-3)" textAnchor="middle">day {t}</text>
      ))}
    </svg>
  );
}

// ---- scatter (trade-off space) -----------------------------------------------------------------------
export function Scatter({ points, picks, current, xFormat, yFormat, xLabel, yLabel, height = 210 }: {
  points: { x: number; y: number; front: boolean }[]; picks: { x: number; y: number; label: string; selected?: boolean }[];
  current?: { x: number; y: number }; xFormat: (v: number) => string; yFormat: (v: number) => string;
  xLabel: string; yLabel: string; height?: number;
}) {
  const W = 460, H = height, P = { l: 52, r: 90, t: 12, b: 30 };
  const all = [...points, ...picks, ...(current ? [current] : [])];
  if (!all.length) return <div className="skeleton" style={{ height }} />;
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const [xa, xb] = [Math.min(...xs), Math.max(...xs)], [ya, yb] = [Math.min(...ys), Math.max(...ys)];
  const sx = (v: number) => P.l + ((v - xa) / (xb - xa || 1)) * (W - P.l - P.r);
  const sy = (v: number) => P.t + (1 - (v - ya) / (yb - ya || 1)) * (H - P.t - P.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${yLabel} against ${xLabel} for every design searched`}>
      <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="var(--line)" />
      <line x1={P.l} x2={P.l} y1={P.t} y2={H - P.b} stroke="var(--line)" />
      {points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={p.front ? 2.4 : 1.5} fill={p.front ? 'var(--ink-2)' : 'var(--soft-2)'} />)}
      {current && (
        <g transform={`translate(${sx(current.x)} ${sy(current.y)})`}>
          <rect x="-5" y="-5" width="10" height="10" transform="rotate(45)" fill="#fff" stroke="var(--ink)" strokeWidth="1.6" />
        </g>
      )}
      {picks.map((p) => <circle key={p.label} cx={sx(p.x)} cy={sy(p.y)} r={p.selected ? 7 : 5} fill="var(--lime)" stroke="var(--ink)" strokeWidth={p.selected ? 2 : 1} />)}
      {picks.map((p, i) => {
        const ly = P.t + 10 + i * 14;
        return (
          <g key={p.label + 'l'}>
            <line x1={sx(p.x) + 6} y1={sy(p.y)} x2={W - P.r + 4} y2={ly - 3} stroke="var(--ink-3)" strokeWidth="0.6" />
            <text x={W - P.r + 8} y={ly} fontSize="10" fill="var(--ink)" fontWeight={p.selected ? 600 : 400}>{p.label.toLowerCase()}</text>
          </g>
        );
      })}
      {current && <text x={W - P.r + 8} y={P.t + 10 + picks.length * 14} fontSize="10" fill="var(--ink-2)">◇ current</text>}
      <text x={W - P.r} y={H - 8} textAnchor="end" fontSize="10" fill="var(--ink-3)">{xLabel} →</text>
      <text x={P.l + 4} y={P.t + 8} fontSize="10" fill="var(--ink-3)">↑ {yLabel}</text>
      <text x={P.l} y={H - 8} fontSize="10" fill="var(--ink-3)">{xFormat(xa)}</text>
      <text x={P.l - 6} y={H - P.b} textAnchor="end" fontSize="10" fill="var(--ink-3)">{yFormat(ya)}</text>
      <text x={P.l - 6} y={P.t + 8} textAnchor="end" fontSize="10" fill="var(--ink-3)">{yFormat(yb)}</text>
    </svg>
  );
}

// ---- rod string: float margin against depth (depth grows downward) ------------------------------------
export function DepthProfile({ depth, value, limit, weakDepth, sections, height = 250, ariaLabel }: {
  depth: number[]; value: number[]; limit: number; weakDepth: number;
  sections: { from_m: number; to_m: number; label: string }[]; height?: number; ariaLabel: string;
}) {
  const W = 560, H = height, P = { l: 46, r: 110, t: 10, b: 22 };
  const zMax = depth[depth.length - 1] || 1;
  const vMax = Math.max(1, ...value);
  const vMin = Math.min(0, ...value);
  const sx = (v: number) => P.l + ((v - vMin) / (vMax - vMin)) * (W - P.l - P.r);
  const sy = (z: number) => P.t + (z / zMax) * (H - P.t - P.b);
  const color = (v: number) => (v < limit ? 'var(--bad)' : v < limit + 0.1 ? 'var(--warn)' : 'var(--lime-deep)');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
      <rect x={sx(vMin)} y={P.t} width={sx(limit) - sx(vMin)} height={H - P.t - P.b} fill="var(--bad-bg)" />
      <line x1={sx(limit)} x2={sx(limit)} y1={P.t} y2={H - P.b} stroke="var(--bad)" strokeDasharray="4 4" />
      <text x={sx(limit) + 4} y={H - P.b - 4} fontSize="10" fill="var(--bad)">limit {limit}</text>
      {[0, 0.25, 0.5, 0.75, 1].map((k) => (
        <g key={k}>
          <line x1={P.l} x2={W - P.r} y1={sy(k * zMax)} y2={sy(k * zMax)} stroke="var(--line)" />
          <text x={P.l - 6} y={sy(k * zMax) + 3} textAnchor="end" fontSize="10" fill="var(--ink-3)">{Math.round(k * zMax)} m</text>
        </g>
      ))}
      {depth.slice(1).map((z, i) => (
        <line key={z} x1={sx(value[i])} y1={sy(depth[i])} x2={sx(value[i + 1])} y2={sy(z)} stroke={color(Math.min(value[i], value[i + 1]))} strokeWidth="2.4" strokeLinecap="round" />
      ))}
      <circle cx={sx(Math.min(...value))} cy={sy(weakDepth)} r="4.5" fill="#fff" stroke="var(--ink)" strokeWidth="1.5" />
      {sections.map((s, i) => (
        <g key={i}>
          <rect x={W - P.r + 14} y={sy(s.from_m) + 1} width="8" height={Math.max(2, sy(s.to_m) - sy(s.from_m) - 2)} rx="3" fill={i % 2 ? 'var(--soft-2)' : 'var(--dark)'} />
          <text x={W - P.r + 28} y={(sy(s.from_m) + sy(s.to_m)) / 2 + 3} fontSize="10" fill="var(--ink-2)">{s.label}</text>
        </g>
      ))}
      <text x={W - P.r} y={H - 6} textAnchor="end" fontSize="10" fill="var(--ink-3)">float margin →</text>
    </svg>
  );
}
