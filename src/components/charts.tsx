// Minimal SVG charts in the visual language of the reference: muted bars with a
// yellow highlight, a thin donut, a threshold bar and a "barcode" strip.
import { useId, type ReactNode } from 'react';

// ---- vertical bars (rate limits) -----------------------------------------------------------
export interface Bar { key: string; label: string; value: number; highlight?: boolean; color?: string; note?: string }
/** Fills its parent's height (give the parent a height or flex: 1). */
export function Bars({ bars, format, minHeight = 120 }: { bars: Bar[]; format: (v: number) => string; minHeight?: number }) {
  const max = Math.max(...bars.map((b) => b.value)) * 1.06 || 1;
  return (
    <div role="img" aria-label={bars.map((b) => `${b.label} ${format(b.value)}${b.note ? ' ' + b.note : ''}`).join(', ')}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${bars.length}, 1fr)`, gap: 10, height: '100%', minHeight }}>
      {bars.map((b) => (
        <div key={b.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minHeight: 0 }}>
          <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', minHeight: 0 }}>
            <span className="num" style={{ fontSize: 10.5, marginBottom: 4, color: b.highlight ? 'var(--text)' : 'var(--text-3)', fontWeight: b.highlight ? 600 : 400 }}>{format(b.value)}</span>
            <div style={{
              width: '100%', maxWidth: 30, height: `${Math.max(3, (b.value / max) * 88)}%`, borderRadius: 7,
              background: b.color ?? (b.highlight ? 'var(--accent)' : 'var(--bar-muted)'),
              boxShadow: b.highlight ? '0 0 0 1px var(--accent-deep) inset' : undefined,
            }} />
          </div>
          <span style={{ fontSize: 9.5, color: 'var(--text-2)', textAlign: 'center', lineHeight: 1.15, minHeight: 22 }}>{b.label}{b.note && <><br /><b style={{ fontWeight: 600 }}>{b.note}</b></>}</span>
        </div>
      ))}
    </div>
  );
}

// ---- donut (cycle progress vs re-steam window) -------------------------------------------------
export function WindowDonut({ day, total, p10, p50, p90, center }: { day: number; total: number; p10: number; p50: number; p90: number; center: ReactNode }) {
  const R = 62, C = 2 * Math.PI * R;
  const f = (d: number) => Math.min(1, Math.max(0, d / total));
  const arc = (from: number, to: number) => ({ strokeDasharray: `${(f(to) - f(from)) * C} ${C}`, strokeDashoffset: -f(from) * C });
  const at = (d: number) => {
    const a = f(d) * 2 * Math.PI - Math.PI / 2;
    return { x: 80 + R * Math.cos(a), y: 80 + R * Math.sin(a) };
  };
  const now = at(day), mid = at(p50);
  return (
    <div style={{ position: 'relative', width: 170, height: 170, margin: '0 auto' }}>
      <svg viewBox="0 0 160 160" width="170" height="170" role="img" aria-label={`Production day ${day}; re-steam window day ${p10} to ${p90}, P50 day ${p50}`}>
        <g transform="rotate(0 80 80)">
          <circle cx="80" cy="80" r={R} fill="none" stroke="var(--bar-muted)" strokeWidth="14" />
          <circle cx="80" cy="80" r={R} fill="none" stroke="var(--glass-strong)" strokeWidth="14" {...arc(0, day)} transform="rotate(-90 80 80)" style={{ opacity: 0.9 }} />
          <circle cx="80" cy="80" r={R} fill="none" stroke="var(--accent)" strokeWidth="14" strokeLinecap="butt" {...arc(p10, p90)} transform="rotate(-90 80 80)" />
        </g>
        <circle cx={now.x} cy={now.y} r="5" fill="var(--ink-btn)" stroke="#fff" strokeWidth="2" />
        <circle cx={mid.x} cy={mid.y} r="3.2" fill="var(--accent-ink)" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>{center}</div>
      </div>
    </div>
  );
}

// ---- horizontal threshold bar (float margin vs limit) ---------------------------------------------
export function ThresholdBar({ value, limit, max, marks = [], ariaLabel }: { value: number; limit: number; max: number; marks?: { v: number; label: string }[]; ariaLabel: string }) {
  const x = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  const ok = value >= limit;
  return (
    <div role="img" aria-label={ariaLabel} style={{ position: 'relative', height: 34, marginTop: 6 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 8, height: 14, borderRadius: 7, background: 'var(--bar-muted)' }} />
      <div style={{ position: 'absolute', left: 0, width: x(Math.max(0, value)), top: 8, height: 14, borderRadius: 7, background: ok ? 'var(--green-bar)' : 'var(--fail)' }} />
      <div style={{ position: 'absolute', left: x(limit), top: 2, bottom: 6, width: 2, background: 'var(--text)', borderRadius: 1 }} />
      <span className="label-3" style={{ position: 'absolute', left: x(limit), top: 24, transform: 'translateX(-50%)' }}>limit {limit}</span>
      {marks.map((m) => (
        <span key={m.label} title={m.label} style={{ position: 'absolute', left: x(m.v), top: 5, width: 8, height: 20, marginLeft: -4, borderRadius: 4, border: '1.5px dashed var(--text-2)' }} />
      ))}
    </div>
  );
}

// ---- barcode strip (daily oil through the cycle) -------------------------------------------------
export function Strip({ values, splitAt, height = 34, ariaLabel }: { values: number[]; splitAt: number; height?: number; ariaLabel: string }) {
  const max = Math.max(...values);
  return (
    <div role="img" aria-label={ariaLabel} style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height }}>
      {values.map((v, i) => (
        <span key={i} style={{
          flex: 1, minWidth: 1, height: `${Math.max(12, (v / max) * 100)}%`, borderRadius: 1,
          background: i < splitAt ? 'var(--bar-muted-2)' : 'var(--accent)', opacity: i < splitAt ? 0.9 : 0.75,
        }} />
      ))}
    </div>
  );
}

// ---- line + band chart (forecast, re-steam curve) -------------------------------------------------
export interface Series { x: number[]; y: number[]; lo?: number[]; hi?: number[]; color?: string; dashed?: boolean; dots?: boolean }
export function LineChart({ series, height = 150, xLabel, yFormat, vlines = [], hlines = [], bands = [], ariaLabel }: {
  series: Series[]; height?: number; xLabel?: string; yFormat: (v: number) => string;
  vlines?: { x: number; label: string; strong?: boolean }[]; hlines?: { y: number; label: string }[];
  bands?: { from: number; to: number; label?: string }[]; ariaLabel: string;
}) {
  const id = useId();
  const W = 520, H = height, P = { l: 44, r: 10, t: 12, b: 24 };
  const xs = series.flatMap((s) => s.x);
  const ys = series.flatMap((s) => [...s.y, ...(s.lo ?? []), ...(s.hi ?? [])]).concat(hlines.map((h) => h.y));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const pad = (yMax - yMin) * 0.08 || 1;
  const y0 = yMin - pad, y1 = yMax + pad;
  const sx = (v: number) => P.l + ((v - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const sy = (v: number) => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);
  const path = (x: number[], y: number[]) => x.map((v, i) => `${i ? 'L' : 'M'}${sx(v).toFixed(1)} ${sy(y[i]).toFixed(1)}`).join(' ');
  const ticks = [y0 + (y1 - y0) * 0.15, (y0 + y1) / 2, y1 - (y1 - y0) * 0.15];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
      {bands.map((b, i) => (
        <g key={i}>
          <rect x={sx(b.from)} y={P.t} width={Math.max(2, sx(b.to) - sx(b.from))} height={H - P.t - P.b} fill="var(--band-fill)" rx="4" />
          {b.label && <text x={(sx(b.from) + sx(b.to)) / 2} y={P.t + 11} textAnchor="middle" fontSize="9.5" fill="var(--accent-ink)">{b.label}</text>}
        </g>
      ))}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} stroke="var(--hairline)" />
          <text x={P.l - 6} y={sy(t) + 3} textAnchor="end" fontSize="9.5" fill="var(--text-3)">{yFormat(t)}</text>
        </g>
      ))}
      {hlines.map((h, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={sy(h.y)} y2={sy(h.y)} stroke="var(--text-2)" strokeDasharray="4 4" />
          <text x={W - P.r} y={sy(h.y) - 4} textAnchor="end" fontSize="9.5" fill="var(--text-2)">{h.label}</text>
        </g>
      ))}
      {series.map((s, i) => s.lo && s.hi && (
        <path key={`b${i}`} d={`${path(s.x, s.hi)} ${s.x.slice().reverse().map((v, j) => `L${sx(v).toFixed(1)} ${sy(s.lo![s.x.length - 1 - j]).toFixed(1)}`).join(' ')} Z`}
          fill={s.color ?? 'var(--accent)'} opacity="0.22" />
      ))}
      {series.map((s, i) => (
        <g key={`l${i}`}>
          <path d={path(s.x, s.y)} fill="none" stroke={s.color ?? 'var(--text)'} strokeWidth="1.8" strokeDasharray={s.dashed ? '5 4' : undefined} />
          {s.dots && s.x.map((v, j) => <circle key={j} cx={sx(v)} cy={sy(s.y[j])} r="2" fill={s.color ?? 'var(--text)'} />)}
        </g>
      ))}
      {vlines.map((v, i) => (
        <g key={i}>
          <line x1={sx(v.x)} x2={sx(v.x)} y1={P.t} y2={H - P.b} stroke={v.strong ? 'var(--text)' : 'var(--text-3)'} strokeWidth={v.strong ? 1.5 : 1} strokeDasharray={v.strong ? undefined : '3 3'} />
          <text x={sx(v.x) + 4} y={H - P.b - 4} fontSize="9.5" fill="var(--text-2)">{v.label}</text>
        </g>
      ))}
      <text x={W - P.r} y={H - 6} textAnchor="end" fontSize="9.5" fill="var(--text-3)">{xLabel}</text>
      <text x={P.l} y={H - 6} fontSize="9.5" fill="var(--text-3)">{x0}</text>
      <title id={id}>{ariaLabel}</title>
    </svg>
  );
}

// ---- SRP plan step chart -------------------------------------------------------------------------
export function StepPlan({ blocks, until, window: win, height = 110 }: {
  blocks: { from_day: number; to_day: number; vfd_hz: number }[]; until: number; window?: { p10: number; p90: number }; height?: number;
}) {
  const W = 520, H = height, P = { l: 36, r: 26, t: 10, b: 22 };
  const sx = (d: number) => P.l + (d / until) * (W - P.l - P.r);
  const lo = 28, hi = 52;
  const sy = (hz: number) => P.t + (1 - (hz - lo) / (hi - lo)) * (H - P.t - P.b);
  const d = blocks.map((b, i) => `${i ? 'L' : 'M'}${sx(b.from_day)} ${sy(b.vfd_hz)} L${sx(Math.min(until, b.to_day + 1))} ${sy(b.vfd_hz)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label={`SRP plan: ${blocks.map((b) => `${b.vfd_hz} Hz from day ${b.from_day}`).join(', ')}`}>
      {win && <rect x={sx(win.p10)} y={P.t} width={sx(win.p90) - sx(win.p10)} height={H - P.t - P.b} fill="var(--band-fill)" rx="4" />}
      {[30, 40, 50].map((hz) => (
        <g key={hz}>
          <line x1={P.l} x2={W - P.r} y1={sy(hz)} y2={sy(hz)} stroke="var(--hairline)" />
          <text x={P.l - 6} y={sy(hz) + 3} textAnchor="end" fontSize="9.5" fill="var(--text-3)">{hz} Hz</text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--accent-deep)" strokeWidth="2.4" />
      {[0, Math.round(until / 2), until].map((t) => (
        <text key={t} x={sx(t)} y={H - 6} fontSize="9.5" fill="var(--text-3)" textAnchor="middle">day {t}</text>
      ))}
    </svg>
  );
}

// ---- Pareto scatter ------------------------------------------------------------------------------
export function Scatter({ points, picks, current, xKey, yKey, xFormat, yFormat, xLabel, yLabel, height = 220 }: {
  points: { x: number; y: number; front: boolean }[]; picks: { x: number; y: number; label: string; selected?: boolean }[];
  current?: { x: number; y: number }; xKey: string; yKey: string; xFormat: (v: number) => string; yFormat: (v: number) => string;
  xLabel: string; yLabel: string; height?: number;
}) {
  const W = 420, H = height, P = { l: 48, r: 12, t: 12, b: 30 };
  const all = [...points, ...picks, ...(current ? [current] : [])];
  if (!all.length) return <div className="skeleton" style={{ height }} />;
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const [xa, xb] = [Math.min(...xs), Math.max(...xs)], [ya, yb] = [Math.min(...ys), Math.max(...ys)];
  const sx = (v: number) => P.l + ((v - xa) / (xb - xa || 1)) * (W - P.l - P.r);
  const sy = (v: number) => P.t + (1 - (v - ya) / (yb - ya || 1)) * (H - P.t - P.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Pareto scatter of ${yKey} against ${xKey}`}>
      <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="var(--hairline)" />
      <line x1={P.l} x2={P.l} y1={P.t} y2={H - P.b} stroke="var(--hairline)" />
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={p.front ? 2.6 : 1.6} fill={p.front ? 'var(--text-2)' : 'var(--bar-muted-2)'} />
      ))}
      {current && (
        <g transform={`translate(${sx(current.x)} ${sy(current.y)})`}>
          <rect x="-5" y="-5" width="10" height="10" transform="rotate(45)" fill="none" stroke="var(--text)" strokeWidth="1.6" />
          <text x="9" y="4" fontSize="10" fill="var(--text)">current</text>
        </g>
      )}
      {picks.map((p) => (
        <g key={p.label} transform={`translate(${sx(p.x)} ${sy(p.y)})`}>
          <circle r={p.selected ? 7 : 5.5} fill="var(--accent)" stroke="var(--accent-ink)" strokeWidth={p.selected ? 2 : 1} />
        </g>
      ))}
      {/* labels in a column on the right so clustered picks stay readable */}
      {picks.map((p, i) => {
        const ly = P.t + 10 + i * 13;
        return (
          <g key={p.label + 'l'}>
            <line x1={sx(p.x) + 6} y1={sy(p.y)} x2={W - P.r - 70} y2={ly - 3} stroke="var(--text-3)" strokeWidth="0.6" />
            <text x={W - P.r - 66} y={ly} fontSize="9.5" fill={p.selected ? 'var(--text)' : 'var(--text-2)'} fontWeight={p.selected ? 600 : 400}>{p.label.toLowerCase()}</text>
          </g>
        );
      })}
      <text x={W - P.r} y={H - 8} textAnchor="end" fontSize="9.5" fill="var(--text-3)">{xLabel} →</text>
      <text x={P.l + 4} y={P.t + 8} fontSize="9.5" fill="var(--text-3)">↑ {yLabel}</text>
      <text x={P.l} y={H - 8} fontSize="9.5" fill="var(--text-3)">{xFormat(xa)}</text>
      <text x={P.l - 6} y={H - P.b} textAnchor="end" fontSize="9.5" fill="var(--text-3)">{yFormat(ya)}</text>
      <text x={P.l - 6} y={P.t + 8} textAnchor="end" fontSize="9.5" fill="var(--text-3)">{yFormat(yb)}</text>
    </svg>
  );
}

// ---- multi-segment donut (field composition) ---------------------------------------------------
export function SegmentDonut({ segments, center, size = 170 }: { segments: { key: string; value: number; color: string; label: string }[]; center: ReactNode; size?: number }) {
  const R = 62, C = 2 * Math.PI * R;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(', ')}>
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--bar-muted)" strokeWidth="14" />
        {segments.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * C;
          const el = <circle key={s.key} cx="80" cy="80" r={R} fill="none" stroke={s.color} strokeWidth="14"
            strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 80 80)" />;
          acc += len;
          return el;
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}><div>{center}</div></div>
    </div>
  );
}
