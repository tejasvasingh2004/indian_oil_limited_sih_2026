import { useEffect, useRef } from 'react';

export interface Hotspot { id: string; x: number; y: number; label: string; alert?: boolean }

interface Props {
  /** strokes per minute — drives the animation */
  spm?: number;
  variant?: 'well' | 'field';
  hotspots?: Hotspot[];
  activeHotspot?: string | null;
  onHotspot?: (id: string, rect: DOMRect) => void;
}

// Geometry in the 1600 × 900 scene (ground at y = 660).
const GROUND = 660;
const PIVOT = { x: 805, y: 430 };
const HEAD_R = 250;   // horse-head arc radius (bridle hangs tangent to it)
const TAIL = 185;     // pivot → equalizer
const GEAR = { x: 985, y: 598 };
const CRANK = 37;     // crank throw; beam swing = asin(CRANK / TAIL) ≈ 11.5°
const WELL_X = PIVOT.x - HEAD_R;
/** scene anchor points (1600 × 900 user space), for hotspots */
export const SCENE = { GROUND, PIVOT, HEAD_R, GEAR, WELL_X };

/**
 * Golden-hour Thar dunes with a working pumpjack — the "hero photograph" of the
 * visual reference, drawn as SVG so it can move at the well's real SPM.
 */
export function DesertScene({ spm = 4.8, variant = 'well', hotspots = [], activeHotspot, onHotspot }: Props) {
  const beam = useRef<SVGGElement>(null);
  const crank = useRef<SVGGElement>(null);
  const pitman = useRef<SVGLineElement>(null);
  const bridle = useRef<SVGLineElement>(null);
  const rod = useRef<SVGGElement>(null);

  useEffect(() => {
    if (variant !== 'well') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const theta = reduce ? -Math.PI / 3 : ((now - t0) / 1000) * (spm / 60) * 2 * Math.PI;
      // four-bar approximation: tail follows the crank pin vertically, so the pitman keeps its length
      const a = Math.asin((CRANK / TAIL) * Math.sin(theta)); // + = clockwise (head up)
      const deg = (a * 180) / Math.PI;
      beam.current?.setAttribute('transform', `rotate(${deg} ${PIVOT.x} ${PIVOT.y})`);
      crank.current?.setAttribute('transform', `rotate(${(theta * 180) / Math.PI} ${GEAR.x} ${GEAR.y})`);
      const tx = PIVOT.x + TAIL * Math.cos(a), ty = PIVOT.y + TAIL * Math.sin(a);
      const px = GEAR.x + CRANK * Math.cos(theta), py = GEAR.y + CRANK * Math.sin(theta);
      pitman.current?.setAttribute('x1', `${tx}`); pitman.current?.setAttribute('y1', `${ty}`);
      pitman.current?.setAttribute('x2', `${px}`); pitman.current?.setAttribute('y2', `${py}`);
      const hy = PIVOT.y - HEAD_R * Math.sin(a) + 18;
      const carrier = 560 - HEAD_R * a;
      bridle.current?.setAttribute('y1', `${hy}`); bridle.current?.setAttribute('y2', `${carrier}`);
      rod.current?.setAttribute('transform', `translate(0 ${carrier - 560})`);
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [spm, variant]);

  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="img"
      aria-label="Pumpjack on a heavy-oil well in the Thar desert at sunset (illustration)">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#93a6b8" />
          <stop offset="0.38" stopColor="#c9bca8" />
          <stop offset="0.62" stopColor="#efc98f" />
          <stop offset="0.74" stopColor="#f7d9a2" />
          <stop offset="1" stopColor="#e7b77a" />
        </linearGradient>
        <radialGradient id="sunGlow" cx="0.78" cy="0.66" r="0.45">
          <stop offset="0" stopColor="#fff2cf" stopOpacity="0.95" />
          <stop offset="0.25" stopColor="#ffd98c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffd98c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="duneFar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4bf8c" /><stop offset="1" stopColor="#cfa574" />
        </linearGradient>
        <linearGradient id="duneMid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dcae72" /><stop offset="1" stopColor="#b98752" />
        </linearGradient>
        <linearGradient id="duneNear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d7a466" /><stop offset="1" stopColor="#8f633a" />
        </linearGradient>
        <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6e2" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff6e2" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff6e2" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2a2521" />
          <stop offset="0.7" stopColor="#3a332c" />
          <stop offset="1" stopColor="#7a5a36" />
        </linearGradient>
        <linearGradient id="rim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.6" stopColor="#f5c77e" stopOpacity="0" />
          <stop offset="1" stopColor="#f5c77e" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="shadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#5a3b1c" stopOpacity="0.35" />
          <stop offset="1" stopColor="#5a3b1c" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1600" height="900" fill="url(#sky)" />
      <rect width="1600" height="900" fill="url(#sunGlow)" />
      <circle cx="1250" cy="585" r="46" fill="#fff5dc" opacity="0.95" />
      <rect y="545" width="1600" height="120" fill="url(#haze)" />

      {/* far dunes with distant pumpjacks */}
      <path d="M0 612 C 180 585 320 600 470 590 C 640 578 760 606 930 596 C 1110 585 1260 600 1420 588 C 1500 583 1560 590 1600 588 L1600 900 L0 900Z" fill="url(#duneFar)" opacity="0.9" />
      {[[290, 590, 0.16], [1400, 588, 0.14], [650, 586, 0.1]].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`} fill="#7c5d3f" opacity="0.45">
          <path d="M-140 -210 L150 -250 L160 -235 L-130 -195Z" />
          <path d="M-10 -225 L-60 0 L-40 0 L0 -200 L40 0 L60 0Z" />
          <rect x="-190" y="-230" width="30" height="60" rx="6" />
          <rect x="-200" y="0" width="420" height="14" />
        </g>
      ))}
      <path d="M0 640 C 220 610 380 632 560 624 C 760 615 900 640 1080 630 C 1260 620 1420 640 1600 626 L1600 900 L0 900Z" fill="url(#duneMid)" />

      {/* steam line from the generator (right) toward the well */}
      <g opacity="0.55" stroke="#6b4a2a" strokeWidth="3" fill="none">
        <path d={`M1600 ${GROUND - 8} L1180 ${GROUND - 8}`} />
        {[1560, 1480, 1400, 1320, 1240].map((x) => <path key={x} d={`M${x} ${GROUND - 8} v12`} strokeWidth="2" />)}
      </g>

      <path d={`M0 ${GROUND} C 260 ${GROUND - 14} 520 ${GROUND + 6} 800 ${GROUND} C 1080 ${GROUND - 6} 1340 ${GROUND + 10} 1600 ${GROUND - 4} L1600 900 L0 900Z`} fill="url(#duneNear)" />
      {/* wind ripples */}
      <g stroke="#f2cf98" strokeOpacity="0.35" strokeWidth="1.4" fill="none">
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M${-40 + i * 190} ${GROUND + 60 + (i % 3) * 38} q 60 -10 120 0 t 120 0`} />
        ))}
      </g>

      {variant === 'field' && <FieldJacks />}

      {variant === 'well' && (
        <g>
          <ellipse cx={805} cy={GROUND + 14} rx={330} ry={26} fill="url(#shadow)" />
          {/* flowline to a small tank */}
          <path d={`M${WELL_X} ${GROUND - 12} H 330`} stroke="#3a2f25" strokeWidth="5" fill="none" />
          <g fill="#3a3129">
            <rect x="250" y={GROUND - 78} width="80" height="78" rx="6" />
            <rect x="244" y={GROUND - 84} width="92" height="10" rx="4" />
          </g>

          {/* skid */}
          <rect x={WELL_X + 70} y={GROUND - 12} width={450} height={14} rx="3" fill="#2d2721" />
          {/* samson post */}
          <g fill="url(#steel)">
            <path d={`M${PIVOT.x - 70} ${GROUND - 12} L${PIVOT.x - 8} ${PIVOT.y + 10} L${PIVOT.x + 4} ${PIVOT.y + 10} L${PIVOT.x - 52} ${GROUND - 12}Z`} />
            <path d={`M${PIVOT.x + 70} ${GROUND - 12} L${PIVOT.x + 8} ${PIVOT.y + 10} L${PIVOT.x - 4} ${PIVOT.y + 10} L${PIVOT.x + 52} ${GROUND - 12}Z`} />
            <rect x={PIVOT.x - 46} y={PIVOT.y + 120} width={92} height={7} rx="2" />
          </g>
          {/* gear reducer + motor */}
          <g>
            <rect x={GEAR.x - 44} y={GEAR.y - 30} width={88} height={GROUND - 12 - GEAR.y + 30} rx="10" fill="#2f2923" />
            <rect x={GEAR.x + 70} y={GROUND - 64} width={56} height={52} rx="8" fill="#3b332b" />
            <path d={`M${GEAR.x + 98} ${GROUND - 40} L${GEAR.x + 10} ${GEAR.y + 4}`} stroke="#1f1a16" strokeWidth="3" />
            <rect x={GEAR.x + 70} y={GROUND - 64} width={56} height={52} rx="8" fill="url(#rim)" opacity="0.6" />
          </g>
          {/* crank + counterweights (rotating) */}
          <g ref={crank}>
            <rect x={GEAR.x - 8} y={GEAR.y - 8} width={CRANK + 16} height={16} rx="8" fill="#2a241f" />
            <path d={`M${GEAR.x - 14} ${GEAR.y - 34} A 58 58 0 0 0 ${GEAR.x - 14} ${GEAR.y + 34} L ${GEAR.x - 70} ${GEAR.y + 24} A 40 40 0 0 1 ${GEAR.x - 70} ${GEAR.y - 24} Z`} fill="#453a30" />
            <path d={`M${GEAR.x - 14} ${GEAR.y - 34} A 58 58 0 0 0 ${GEAR.x - 14} ${GEAR.y + 34} L ${GEAR.x - 70} ${GEAR.y + 24} A 40 40 0 0 1 ${GEAR.x - 70} ${GEAR.y - 24} Z`} fill="url(#rim)" opacity="0.35" />
          </g>
          <circle cx={GEAR.x} cy={GEAR.y} r={9} fill="#1c1814" />
          {/* pitman arm */}
          <line ref={pitman} x1={PIVOT.x + TAIL} y1={PIVOT.y} x2={GEAR.x} y2={GEAR.y + CRANK} stroke="#2a241f" strokeWidth="8" strokeLinecap="round" />

          {/* walking beam + horse head (rocking) */}
          <g ref={beam}>
            <rect x={PIVOT.x - HEAD_R + 20} y={PIVOT.y - 11} width={HEAD_R + TAIL - 10} height={22} rx="4" fill="url(#steel)" />
            <rect x={PIVOT.x - HEAD_R + 20} y={PIVOT.y - 11} width={HEAD_R + TAIL - 10} height={4} rx="2" fill="#f1c47d" opacity="0.5" />
            <path
              d={`M${PIVOT.x - HEAD_R + 26} ${PIVOT.y - 40}
                  L${PIVOT.x - HEAD_R * Math.cos(0.17)} ${PIVOT.y - HEAD_R * Math.sin(0.17)}
                  A ${HEAD_R} ${HEAD_R} 0 0 0 ${PIVOT.x - HEAD_R * Math.cos(0.3)} ${PIVOT.y + HEAD_R * Math.sin(0.3)}
                  L${PIVOT.x - HEAD_R + 36} ${PIVOT.y + 58} Z`}
              fill="#2c2621"
            />
            <circle cx={PIVOT.x + TAIL} cy={PIVOT.y} r={9} fill="#1f1a16" />
          </g>
          <circle cx={PIVOT.x} cy={PIVOT.y} r={11} fill="#1b1714" />

          {/* bridle + polished rod + wellhead */}
          <line ref={bridle} x1={WELL_X} y1={PIVOT.y + 18} x2={WELL_X} y2={560} stroke="#1c1814" strokeWidth="2.5" />
          <g ref={rod}>
            <rect x={WELL_X - 20} y={556} width={40} height={7} rx="2" fill="#241f1a" />
            <line x1={WELL_X} y1={563} x2={WELL_X} y2={622} stroke="#c9b79a" strokeWidth="3" />
          </g>
          <g fill="#2c2621">
            <rect x={WELL_X - 9} y={GROUND - 48} width={18} height={48} rx="3" />
            <rect x={WELL_X - 22} y={GROUND - 30} width={44} height={9} rx="3" />
            <rect x={WELL_X - 5} y={GROUND - 62} width={10} height={16} rx="2" />
          </g>
        </g>
      )}

      {hotspots.map((h) => (
        <g
          key={h.id}
          className={`svg-hotspot ${h.alert ? 'alert' : ''} ${activeHotspot === h.id ? 'active' : ''}`}
          transform={`translate(${h.x} ${h.y})`}
          role="button"
          tabIndex={0}
          aria-label={h.label}
          onClick={(e) => onHotspot?.(h.id, (e.currentTarget as SVGGElement).getBoundingClientRect())}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onHotspot?.(h.id, (e.currentTarget as SVGGElement).getBoundingClientRect());
            }
          }}
        >
          <circle r="22" className="ring" />
          <circle r="11" fill="rgba(255,255,255,0.94)" />
          <circle r="4" className="core" />
        </g>
      ))}
    </svg>
  );
}

/** Field view: several small pumpjacks across the dunes. */
function FieldJacks() {
  // on a dune ridge high enough to stay visible between the glass cards
  const jacks: [number, number, number][] = [
    [560, 548, 0.3], [720, 560, 0.36], [890, 552, 0.33], [1050, 566, 0.38], [640, 530, 0.2], [980, 532, 0.2], [810, 526, 0.16],
  ];
  return (
    <g>
      <path d="M300 580 C 480 540 640 552 800 546 C 960 540 1120 560 1300 578 L1300 900 L300 900Z" fill="url(#duneMid)" opacity="0.85" />
      {jacks.map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <ellipse cx="20" cy="8" rx="240" ry="18" fill="url(#shadow)" />
          <g className="field-jack" style={{ animationDuration: `${10 + (i % 4) * 1.7}s`, animationDelay: `${-i * 1.3}s` }}>
            <path d="M-190 -238 L190 -270 L196 -250 L-184 -218Z" fill="#2c2621" />
            <path d="M-196 -262 q -42 44 -8 110 l 22 -6 q -26 -50 6 -96Z" fill="#2c2621" />
          </g>
          <path d="M-20 -236 L-86 0 L-66 0 L0 -214 L66 0 L86 0 L14 -236Z" fill="#332c25" />
          <rect x="120" y="-70" width="70" height="70" rx="10" fill="#2f2923" />
          <rect x="-230" y="0" width="460" height="12" rx="3" fill="#2d2721" />
        </g>
      ))}
    </g>
  );
}
