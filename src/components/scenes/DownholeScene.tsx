import type { RodProfile } from '@/api/types';
import type { Hotspot } from './DesertScene';
import { fmt } from '@/lib/format';

interface Props {
  profile?: RodProfile;
  tNwb?: number;
  tRes: number;
  reservoirDepthM: number;
  focus: 'rods' | 'reservoir';
  hotspots?: Hotspot[];
  activeHotspot?: string | null;
  onHotspot?: (id: string, rect: DOMRect) => void;
}

// fits surface → pay between the title and the bottom cards (~y 150–610 of 900)
const TOP = 150;
const PER_M = 0.34;
export const depthY = (m: number) => TOP + m * PER_M;
const X = 800;

/** FMI colour ramp: pale when rods fall freely → yellow → orange → red below the limit */
export function fmiColor(f: number, limit = 0.15) {
  const stops: [number, [number, number, number]][] = [
    [limit - 0.05, [201, 73, 60]], [limit, [226, 120, 70]], [0.22, [233, 168, 99]], [0.32, [242, 218, 114]], [0.5, [246, 236, 214]],
  ];
  if (f <= stops[0][0]) return `rgb(${stops[0][1].join(',')})`;
  for (let i = 1; i < stops.length; i++) {
    const [f1, c1] = stops[i];
    const [f0, c0] = stops[i - 1];
    if (f <= f1) {
      const k = (f - f0) / (f1 - f0);
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * k)).join(',')})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1].join(',')})`;
}

/** Cutaway from surface to the Jodhpur Sandstone: rods coloured by FMI(z). */
export function DownholeScene({ profile, tNwb, tRes, reservoirDepthM, focus, hotspots = [], activeHotspot, onHotspot }: Props) {
  const pumpY = depthY(profile?.depth_m[profile.depth_m.length - 1] ?? 1100);
  const payTop = depthY(reservoirDepthM - 30), payBot = depthY(reservoirDepthM + 60);
  const heat = Math.max(0, (tNwb ?? tRes) - tRes);
  const zoom = focus === 'reservoir';
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="img"
      aria-label="Cutaway of the well: rod string coloured by float margin along depth, tubing temperature and viscosity, heated zone in the reservoir (illustration)">
      <defs>
        <linearGradient id="dhSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a9b3bb" /><stop offset="1" stopColor="#efcd98" />
        </linearGradient>
        <linearGradient id="earth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#caa06c" /><stop offset="0.5" stopColor="#a98159" /><stop offset="1" stopColor="#7c5c40" />
        </linearGradient>
        <radialGradient id="heatZone" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffcf7a" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="#f09a4e" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f09a4e" stopOpacity="0" />
        </radialGradient>
        {profile && (
          <linearGradient id="rodGrad" gradientUnits="userSpaceOnUse" x1={X} y1={depthY(0)} x2={X} y2={pumpY}>
            {profile.fmi.map((f, i) => (
              <stop key={i} offset={i / (profile.fmi.length - 1)} stopColor={fmiColor(f, profile.fmi_limit)} />
            ))}
          </linearGradient>
        )}
        <pattern id="sand" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="4" r="1" fill="#6f4f33" opacity="0.25" />
          <circle cx="10" cy="10" r="1" fill="#6f4f33" opacity="0.2" />
        </pattern>
      </defs>

      <rect width="1600" height={TOP} fill="url(#dhSky)" />
      <rect y={TOP} width="1600" height={900 - TOP} fill="url(#earth)" />
      <rect y={TOP} width="1600" height={900 - TOP} fill="url(#sand)" />

      <g>
        {/* strata */}
        {[[0.12, 0.08], [0.33, 0.06], [0.55, 0.09], [0.78, 0.07]].map(([f, a], i) => (
          <rect key={i} y={TOP + (payTop - TOP) * f} width="1600" height={(payTop - TOP) * 0.05} fill="#fff3dc" opacity={a} />
        ))}
        <rect y={payTop} width="1600" height={payBot - payTop} fill="#d9b178" opacity="0.55" />
        <text x={500} y={payTop + 20} className="svg-label">Jodhpur Sandstone · pay</text>

        {/* wellhead */}
        <g fill="#2c2621">
          <rect x={X - 16} y={TOP - 18} width={32} height={18} rx="3" />
          <rect x={X - 5} y={TOP - 30} width={10} height={14} rx="2" />
        </g>

        {/* depth scale */}
        <g className="svg-axis" style={{ opacity: zoom ? 0 : 1, transition: 'opacity .4s' }}>
          {[0, 200, 400, 600, 800, 1000].map((m) => (
            <g key={m} transform={`translate(560 ${depthY(m)})`}>
              <line x1="0" x2="14" />
              <text x="-8" y="4" textAnchor="end">{m} m</text>
            </g>
          ))}
        </g>

        {/* heated zone */}
        <ellipse cx={X} cy={depthY(reservoirDepthM + 15)} rx={(90 + heat * 9) * (zoom ? 1.35 : 1)} ry={(30 + heat * 1.8) * (zoom ? 1.35 : 1)} fill="url(#heatZone)" style={{ transition: 'all .5s' }} />
        {zoom && tNwb !== undefined && (
          <text x={X + 60 + heat * 12} y={depthY(reservoirDepthM + 15) + 44} className="svg-label strong">heated zone · {fmt(tNwb)} °C</text>
        )}

        {/* casing, tubing, rods */}
        <rect x={X - 22} y={TOP} width={44} height={payBot - TOP} fill="#efe3cf" opacity="0.5" />
        <rect x={X - 22} y={TOP} width={3} height={payBot - TOP} fill="#5c4632" opacity="0.7" />
        <rect x={X + 19} y={TOP} width={3} height={payBot - TOP} fill="#5c4632" opacity="0.7" />
        <rect x={X - 9} y={TOP} width={18} height={pumpY - TOP + 30} fill="#fff" opacity="0.35" />
        <line x1={X} y1={TOP} x2={X} y2={pumpY} stroke={profile ? 'url(#rodGrad)' : '#ddd'} strokeWidth={7} strokeLinecap="round" style={{ opacity: zoom ? 0.35 : 1, transition: 'opacity .4s' }} />
        {profile?.sections.slice(1).map((s) => (
          <line key={s.section} x1={X - 14} x2={X + 14} y1={depthY(s.from_m)} y2={depthY(s.from_m)} stroke="#3b2e22" strokeWidth="1.5" />
        ))}
        <rect x={X - 12} y={pumpY - 6} width={24} height={34} rx="4" fill="#2c2621" />
        <text x={X + 32} y={pumpY + 34} className="svg-label">pump · {fmt(profile?.depth_m[profile.depth_m.length - 1] ?? 1100)} m</text>

        {/* tubing temperature & viscosity along depth */}
        {profile && (zoom ? [profile.depth_m.length - 1] : [0, 8, 14, profile.depth_m.length - 1]).map((i) => (
          <g key={i} transform={`translate(${X + 40} ${depthY(profile.depth_m[i])})`}>
            <line x1="-18" x2="-4" stroke="#fff" strokeOpacity="0.8" />
            <text x="0" y="4" className="svg-label">{fmt(profile.temp_c[i])} °C · {fmt(profile.mu_cp[i])} cP</text>
          </g>
        ))}

        {/* FMI minimum marker */}
        {profile && !zoom && (
          <g transform={`translate(${X} ${depthY(profile.fmi_min_depth_m)})`}>
            <line x1="-40" x2="-14" stroke="#fff" strokeWidth="1.5" />
            <text x="-46" y="4" textAnchor="end" className="svg-label strong">FMI min {profile.fmi_min.toFixed(2)}</text>
          </g>
        )}

        {hotspots.map((h) => (
          <g key={h.id} className={`svg-hotspot ${h.alert ? 'alert' : ''} ${activeHotspot === h.id ? 'active' : ''}`}
            transform={`translate(${h.x} ${h.y})`} role="button" tabIndex={0} aria-label={h.label}
            onClick={(e) => onHotspot?.(h.id, (e.currentTarget as SVGGElement).getBoundingClientRect())}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHotspot?.(h.id, (e.currentTarget as SVGGElement).getBoundingClientRect()); } }}>
            <circle r={22} className="ring" />
            <circle r={11} fill="rgba(255,255,255,0.94)" />
            <circle r={4} className="core" />
          </g>
        ))}
      </g>

      {/* legend */}
      <g transform={`translate(${X + 200} ${TOP + 30})`} className="svg-legend">
        <text x="0" y="-10">float margin FMI(z)</text>
        {[0.1, 0.15, 0.22, 0.32, 0.5].map((f, i) => (
          <g key={f} transform={`translate(${i * 54} 0)`}>
            <rect width="50" height="8" rx="3" fill={fmiColor(f)} />
            <text y="24">{f === 0.15 ? 'limit' : f.toFixed(2)}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
