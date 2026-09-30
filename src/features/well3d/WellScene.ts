// Three.js scene for the 3D well sandbox: a cut-away earth block with the
// (illustrative) Baghewala strata, the Jodhpur Sandstone pay, the heated zone
// around the well, casing + tubing + rod string coloured by float margin, the
// downhole pump and an animated pumpjack. Imperative on purpose: React owns the
// controls, this class owns the GPU objects. Depth is not to scale (see depthY).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { WellSnapshot } from '@/api/types';

export interface Layer { name: string; from: number; to: number; color: string; pay?: boolean }
export interface HoverInfo { depth_m: number; fmi: number; temp_c: number; mu_cp: number; section: number; grade: string; diameter_in: number }
export interface SceneOptions { xray: boolean; heat: boolean; labels: boolean; motion: boolean }
export type View = 'whole' | 'surface' | 'reservoir';

const W = 30; //                     block half-width, 1 unit = 1 m horizontally
const WELL = new THREE.Vector3(1.6, 0, 1.6); // well sits just inside the cut quadrant (x > 0, z > 0)
const OVER = 14; //                  overburden: 14 m of depth per unit
const DEEP = 3; //                   near the pump and in the reservoir: 3 m per unit
let pumpDepthM = 1100;

/** Piecewise depth → scene y: the overburden is squeezed so the pay zone stays readable. */
export function depthY(z: number) {
  const k = pumpDepthM - 60;
  return z <= k ? -z / OVER : -k / OVER - (z - k) / DEEP;
}

// FMI colours: lime = comfortable, amber = within 0.1 of the limit, red = below it (rods float)
const C_OK = new THREE.Color('#7cc242');
const C_NEAR = new THREE.Color('#e0a030');
const C_BAD = new THREE.Color('#d8453a');
export function fmiColor(f: number, limit: number) {
  if (f < limit) return C_BAD;
  if (f < limit + 0.1) return C_NEAR.clone().lerp(C_OK, (f - limit) / 0.1 * 0.25);
  return C_OK.clone().lerp(new THREE.Color('#4f9a2a'), Math.min(1, (f - limit - 0.1) / 0.4));
}

function label(text: string, cls = 'l3d') {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  return new CSS2DObject(el);
}

const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...extra });

export class WellScene {
  private renderer: THREE.WebGLRenderer;
  private css: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private raf = 0;
  private ro: ResizeObserver;

  private rock = new THREE.Group();
  private rockMats: THREE.MeshStandardMaterial[] = [];
  private labels = new THREE.Group();
  private rods = new THREE.Group();
  private rodSegs: THREE.Mesh[] = [];
  private heat = new THREE.Group();
  private heatOuter!: THREE.Mesh;
  private heatCore!: THREE.Mesh;
  private heatLabel!: CSS2DObject;
  private weakRing!: THREE.Mesh;
  private weakLabel!: CSS2DObject;
  private pumpLabel!: CSS2DObject;
  private plunger!: THREE.Mesh;
  private beam = new THREE.Group();
  private crank = new THREE.Group();
  private pitman!: THREE.Mesh;
  private polished!: THREE.Mesh;
  private flow!: THREE.Points;
  private flowSpeed = 0;
  private steam!: THREE.Points;
  private statusLabel!: CSS2DObject;

  private snap: WellSnapshot | null = null;
  private opts: SceneOptions = { xray: false, heat: true, labels: true, motion: true };
  private phase = 0;
  private spm = 0;
  private producing = true;
  private injecting = false;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private onHover?: (h: HoverInfo | null) => void;
  private hovered: THREE.Mesh | null = null;
  private built = false;

  constructor(private host: HTMLElement, private layers: Layer[], onHover?: (h: HoverInfo | null) => void) {
    this.onHover = onHover;
    const { clientWidth: w, clientHeight: h } = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor('#f6f6f3');
    this.renderer.localClippingEnabled = true;
    host.appendChild(this.renderer.domElement);

    this.css = new CSS2DRenderer();
    this.css.setSize(w, h);
    Object.assign(this.css.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    host.appendChild(this.css.domElement);

    this.camera = new THREE.PerspectiveCamera(32, w / h, 0.5, 3000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 520;

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b9ae98', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.5);
    sun.position.set(80, 140, 110);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#ffffff', 0.5);
    fill.position.set(-90, 20, -60);
    this.scene.add(fill);

    this.scene.add(this.rock, this.labels, this.heat);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointer);
    this.renderer.domElement.addEventListener('pointerleave', this.clearHover);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.view('whole', false);
    if (import.meta.env.DEV) (window as unknown as { __well3d: WellScene }).__well3d = this;
    this.loop();
  }

  // ---- static geometry (built on first snapshot: depths come from the registry) ----------------------
  private build(s: WellSnapshot) {
    pumpDepthM = s.pump_depth_m;
    const bottomM = s.reservoir_depth_m + s.pay_thickness_m + 40;
    const layers = this.layers.map((l) => ({ ...l, to: Math.min(l.to, bottomM) }));

    // earth block with the front-right quadrant cut away
    for (const l of layers) {
      const y0 = depthY(l.from), y1 = depthY(l.to), h = y0 - y1, yc = (y0 + y1) / 2;
      const m = mat(l.color, { roughness: 0.95, transparent: true, opacity: 1 });
      this.rockMats.push(m);
      const a = new THREE.Mesh(new THREE.BoxGeometry(W, h, 2 * W), m);
      a.position.set(-W / 2, yc, 0);
      const b = new THREE.Mesh(new THREE.BoxGeometry(W, h, W), m);
      b.position.set(W / 2, yc, -W / 2);
      for (const mesh of [a, b]) {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.12 }));
        mesh.add(e);
        this.rock.add(mesh);
      }
      const lb = label(l.pay ? `${l.name} · pay` : l.name, l.pay ? 'l3d pay' : 'l3d layer');
      lb.position.set(-W * 0.5, yc, W + 0.2);
      this.labels.add(lb);
    }
    // depth scale on the front-left edge
    const ticks = [0, 300, 600, 900, s.pump_depth_m, s.reservoir_depth_m, s.reservoir_depth_m + s.pay_thickness_m];
    for (const z of ticks) {
      const t = label(`${z.toLocaleString('en-IN')} m`, 'l3d tick');
      t.center.set(1, 0.5);
      t.position.set(-W - 1.2, depthY(z), W);
      this.labels.add(t);
      const tick = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), mat('#333333'));
      tick.position.set(-W - 0.4, depthY(z), W);
      this.labels.add(tick);
    }

    // wellbore: casing (to the bottom of the pay), tubing, perforations
    const yCasing = depthY(s.reservoir_depth_m + s.pay_thickness_m);
    const casing = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.05, -yCasing, 24, 1, true),
      mat('#9aa3ad', { metalness: 0.6, roughness: 0.35, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    );
    casing.position.set(WELL.x, yCasing / 2, WELL.z);
    this.scene.add(casing);
    const yPump = depthY(s.pump_depth_m);
    const tubing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, -yPump, 20, 1, true),
      mat('#7d8791', { metalness: 0.5, roughness: 0.4, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    tubing.position.set(WELL.x, yPump / 2, WELL.z);
    this.scene.add(tubing);
    for (let z = s.reservoir_depth_m + 4; z < s.reservoir_depth_m + s.pay_thickness_m - 2; z += 4) {
      for (let k = 0; k < 4; k++) {
        const perf = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.22), mat('#c2571f'));
        perf.position.set(WELL.x, depthY(z), WELL.z);
        perf.rotation.y = (k * Math.PI) / 4;
        this.scene.add(perf);
      }
    }

    // downhole pump (barrel + animated plunger)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 5, 20), mat('#2b2b2b', { metalness: 0.5, roughness: 0.4 }));
    barrel.position.set(WELL.x, yPump - 2.5, WELL.z);
    this.scene.add(barrel);
    this.plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.2, 16), mat('#a8e26d'));
    this.plunger.position.set(WELL.x, yPump - 1.2, WELL.z);
    this.rods.add(this.plunger);
    this.pumpLabel = label('', 'l3d');
    this.pumpLabel.position.set(WELL.x + 3, yPump - 2.5, WELL.z + 2);
    this.labels.add(this.pumpLabel);

    // rod string: one segment per profile interval, coloured by float margin
    for (let i = 0; i < s.depth_m.length - 1; i++) {
      const y0 = depthY(s.depth_m[i]), y1 = depthY(s.depth_m[i + 1]);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, y0 - y1, 10), mat('#7cc242', { roughness: 0.5 }));
      seg.position.set(WELL.x, (y0 + y1) / 2, WELL.z);
      seg.userData.i = i;
      this.rodSegs.push(seg);
      this.rods.add(seg);
    }
    this.weakRing = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.22, 10, 36), mat('#d8453a', { emissive: '#5a120c' }));
    this.weakRing.rotation.x = Math.PI / 2;
    this.scene.add(this.weakRing);
    this.weakLabel = label('', 'l3d warn');
    this.scene.add(this.weakLabel);
    this.scene.add(this.rods);

    // heated zone around the well in the pay (outer = warm, core = steam chest)
    const yTop = depthY(s.reservoir_depth_m), yBot = depthY(s.reservoir_depth_m + s.pay_thickness_m);
    const yMid = (yTop + yBot) / 2;
    this.heatOuter = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24),
      new THREE.MeshStandardMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.4, roughness: 0.6, depthWrite: false, side: THREE.DoubleSide, emissive: '#7a2a00', emissiveIntensity: 0.4 }));
    this.heatCore = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 18),
      new THREE.MeshStandardMaterial({ color: '#ffd166', transparent: true, opacity: 0.55, roughness: 0.5, depthWrite: false, emissive: '#b34700', emissiveIntensity: 0.6 }));
    this.heatOuter.position.set(WELL.x, yMid, WELL.z);
    this.heatCore.position.copy(this.heatOuter.position);
    this.heatOuter.userData.half = (yTop - yBot) / 2;
    this.heat.add(this.heatOuter, this.heatCore);
    this.heatLabel = label('', 'l3d heat');
    this.heat.add(this.heatLabel);

    // oil rising in the tubing (speed follows the oil rate)
    const n = 90;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      pos.set([WELL.x + Math.cos(a) * 0.58, yPump * (i / n), WELL.z + Math.sin(a) * 0.58], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.flow = new THREE.Points(g, new THREE.PointsMaterial({ color: '#3a2412', size: 0.34, sizeAttenuation: true }));
    this.scene.add(this.flow);

    this.buildSurface();
    this.built = true;
  }

  private buildSurface() {
    // concrete pad and wellhead ("Christmas tree")
    const pad = new THREE.Mesh(new THREE.BoxGeometry(16, 0.3, 7), mat('#d9d6cf'));
    pad.position.set(WELL.x - 7, 0.15, WELL.z - 0.5);
    this.scene.add(pad);
    const tree = new THREE.Group();
    const steel = mat('#5f6a74', { metalness: 0.6, roughness: 0.35 });
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 1.2, 20), steel); t1.position.y = 0.6;
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 16), steel); t2.position.y = 2;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 3, 12), steel); arm.rotation.z = Math.PI / 2; arm.position.set(0, 1.7, 0);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.08, 8, 20), mat('#cf4336')); wheel.position.set(1.4, 1.7, 0.4);
    tree.add(t1, t2, arm, wheel);
    tree.position.set(WELL.x, 0.3, WELL.z);
    this.scene.add(tree);

    // pumpjack: beam along −x with the horsehead over the well
    const pj = new THREE.Group();
    pj.position.set(WELL.x, 0.3, WELL.z);
    const paint = mat('#2f3a44', { metalness: 0.35, roughness: 0.5 });
    const accent = mat('#a8e26d', { roughness: 0.6 });
    const skid = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.5, 2.6), paint); skid.position.set(-7.2, 0.25, 0);
    pj.add(skid);
    const pivot = new THREE.Vector3(-4.2, 7.2, 0);
    for (const dz of [-0.9, 0.9]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7.4, 0.35), paint);
      leg.position.set(pivot.x - 0.8, pivot.y / 2, dz);
      leg.rotation.x = dz > 0 ? -0.12 : 0.12;
      leg.rotation.z = -0.1;
      pj.add(leg);
    }
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.25, 7.6, 0.25), paint);
    brace.position.set(pivot.x + 1.2, pivot.y / 2 - 0.2, 0); brace.rotation.z = 0.33;
    pj.add(brace);

    this.beam.position.copy(pivot);
    const beamBar = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.6, 0.55), paint);
    beamBar.position.set(-0.8, 0, 0);
    // horsehead: an arc swept around the pivot so the bridle hangs straight over the well
    const R = -pivot.x + 0.25;
    const hs = new THREE.Shape();
    hs.absarc(0, 0, R, -0.24, 0.24, false);
    hs.absarc(0, 0, R - 1.3, 0.24, -0.24, true);
    const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.9, bevelEnabled: false, curveSegments: 16 });
    hg.translate(0, 0, -0.45);
    const head = new THREE.Mesh(hg, accent);
    this.beam.add(beamBar, head);
    const bearing = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.2, 12), steel);
    bearing.rotation.x = Math.PI / 2;
    this.beam.add(bearing);
    pj.add(this.beam);

    // gearbox, crank + counterweights, motor
    const gear = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 1.8), paint); gear.position.set(-10.2, 1.5, 0);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 16), mat('#3563a8')); motor.rotation.x = Math.PI / 2; motor.position.set(-12.4, 1.1, 0);
    pj.add(gear, motor);
    this.crank.position.set(-10.2, 2.4, 0);
    for (const dz of [-1.15, 1.15]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.25), paint); arm.position.set(0, -0.9, dz);
      const cw = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 0.35), mat('#cf4336', { roughness: 0.6 })); cw.position.set(0, -1.7, dz);
      this.crank.add(arm, cw);
    }
    pj.add(this.crank);
    this.pitman = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1, 0.22), paint);
    pj.add(this.pitman);
    // bridle + polished rod from the horsehead down into the wellhead
    this.polished = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 8), steel);
    pj.add(this.polished);
    this.scene.add(pj);
    this.pivot = pivot;

    // steam generator + surface line
    const gen = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 3.4, 3.6), mat('#e8e6e0'));
    body.position.y = 1.7;
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 5, 12), mat('#8a8a8a', { metalness: 0.4 }));
    stack.position.set(2.8, 5.2, 0);
    gen.add(body, stack);
    gen.position.set(20, 0, -16);
    this.scene.add(gen);
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(16, 1.2, -16), new THREE.Vector3(8, 0.9, -16), new THREE.Vector3(WELL.x + 3, 0.9, -6),
      new THREE.Vector3(WELL.x + 2, 1.7, WELL.z - 0.4), new THREE.Vector3(WELL.x + 0.5, 1.7, WELL.z),
    ]);
    const line = new THREE.Mesh(new THREE.TubeGeometry(path, 60, 0.28, 10), mat('#b8b2a6', { metalness: 0.3 }));
    this.scene.add(line);
    const genLabel = label('Steam generator', 'l3d');
    genLabel.position.set(20, 8.5, -16);
    this.labels.add(genLabel);
    this.statusLabel = label('', 'l3d strong');
    this.statusLabel.position.set(WELL.x - 6, 11.5, WELL.z);
    this.labels.add(this.statusLabel);

    // steam puffs from the stack while injecting
    const n = 40, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([22.8, 7.7 + (i / n) * 8, -16], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.steam = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, transparent: true, opacity: 0.8 }));
    this.steam.visible = false;
    this.scene.add(this.steam);
  }
  private pivot!: THREE.Vector3;

  // ---- live data --------------------------------------------------------------------------------------
  update(s: WellSnapshot) {
    if (!this.built) this.build(s);
    this.snap = s;
    this.producing = s.phase === 'PRODUCTION';
    this.injecting = s.phase === 'INJECTION';
    this.spm = this.producing ? s.spm : 0;
    this.flowSpeed = this.producing ? Math.max(0.4, s.oil_bopd / 8) : 0;
    this.steam.visible = this.injecting;

    s.fmi.slice(0, -1).forEach((_, i) => {
      const f = Math.min(s.fmi[i], s.fmi[i + 1]);
      (this.rodSegs[i].material as THREE.MeshStandardMaterial).color.copy(fmiColor(f, s.fmi_limit));
    });
    const yWeak = depthY(s.fmi_min_depth_m);
    this.weakRing.position.set(WELL.x, yWeak, WELL.z);
    (this.weakRing.material as THREE.MeshStandardMaterial).color.copy(fmiColor(s.fmi_min, s.fmi_limit));
    this.weakLabel.position.set(WELL.x + 4, yWeak, WELL.z + 3);
    this.weakLabel.element.textContent = `Weakest rod point · ${s.fmi_min_depth_m.toLocaleString('en-IN')} m · float margin ${s.fmi_min.toFixed(2)}${s.fmi_min < s.fmi_limit ? ' — floating' : ''}`;
    this.weakLabel.element.className = `l3d ${s.fmi_min < s.fmi_limit ? 'bad' : s.fmi_min < s.fmi_limit + 0.1 ? 'warn' : 'ok'}`;

    const r = s.heated_radius_m;
    const half = this.heatOuter.userData.half as number;
    this.heatOuter.scale.set(r, half * 0.92, r);
    this.heatCore.scale.set(r * 0.45, half * 0.7, r * 0.45);
    const tFrac = Math.max(0, Math.min(1, (s.t_nwb_c - 47) / 150));
    (this.heatOuter.material as THREE.MeshStandardMaterial).color.set(new THREE.Color('#ffc27a').lerp(new THREE.Color('#ff5a1f'), tFrac));
    (this.heatOuter.material as THREE.MeshStandardMaterial).opacity = 0.22 + 0.3 * tFrac;
    this.heatCore.visible = s.t_nwb_c > 90;
    this.heatLabel.position.set(WELL.x + r * 0.75, this.heatOuter.position.y + half * 0.4, WELL.z + r * 0.75);
    this.heatLabel.element.textContent = `Heated zone · r ≈ ${r.toFixed(0)} m · ${s.t_nwb_c.toFixed(0)} °C · ${Math.round(s.viscosity_cp).toLocaleString('en-IN')} cP`;

    this.pumpLabel.element.textContent = `Pump · ${s.pump_depth_m.toLocaleString('en-IN')} m · ${Math.round(s.fillage * 100)}% full`;
    this.statusLabel.element.textContent = this.producing
      ? `Producing · ${s.spm.toFixed(1)} strokes/min · ${s.oil_bopd.toFixed(1)} BOPD`
      : this.injecting ? 'Injecting steam · pump stopped' : 'Soaking · well shut in';
    this.applyOptions();
  }

  setOptions(o: SceneOptions) {
    this.opts = o;
    this.applyOptions();
  }

  private applyOptions() {
    if (!this.built) return;
    const { xray, heat, labels } = this.opts;
    for (const m of this.rockMats) { m.opacity = xray ? 0.16 : 1; m.depthWrite = !xray; }
    this.heat.visible = heat;
    this.labels.visible = labels;
    this.heatLabel.visible = labels && heat;
    this.weakLabel.visible = labels;
  }

  view(v: View, smooth = true) {
    const targets: Record<View, [THREE.Vector3, THREE.Vector3]> = {
      whole: [new THREE.Vector3(-3, -64, 0), new THREE.Vector3(170, 40, 215)],
      surface: [new THREE.Vector3(-4, 3, 0), new THREE.Vector3(26, 13, 34)],
      reservoir: [new THREE.Vector3(1, depthY(pumpDepthM + 60), 1), new THREE.Vector3(62, depthY(pumpDepthM + 20), 78)],
    };
    const [t, p] = targets[v];
    if (!smooth) { this.controls.target.copy(t); this.camera.position.copy(p); this.controls.update(); return; }
    const t0 = this.controls.target.clone(), p0 = this.camera.position.clone();
    const start = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / 700), e = 1 - Math.pow(1 - k, 3);
      this.controls.target.lerpVectors(t0, t, e);
      this.camera.position.lerpVectors(p0, p, e);
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }

  // ---- animation --------------------------------------------------------------------------------------
  private animate(dt: number) {
    const s = this.snap;
    if (!s || !this.built) return;
    const moving = this.opts.motion && this.producing;
    if (moving) this.phase += (dt * this.spm / 60) * Math.PI * 2;
    const a = this.phase;
    // crank turns; the beam rocks ±0.2 rad; the polished rod follows the horsehead
    this.crank.rotation.z = -a;
    // crank pin at 1.75 on the arm; the beam's rear end follows it (rear down ↔ horsehead up)
    const tilt = 0.28 * Math.cos(a);
    this.beam.rotation.z = tilt;
    const pin = new THREE.Vector3(-10.2 - 1.75 * Math.sin(a), 2.4 - 1.75 * Math.cos(a), 0);
    const rear = new THREE.Vector3(-5.9, 0, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt).add(this.pivot);
    const mid = pin.clone().add(rear).multiplyScalar(0.5);
    const len = pin.distanceTo(rear);
    this.pitman.position.copy(mid);
    this.pitman.scale.set(1, len, 1);
    this.pitman.rotation.z = Math.atan2(rear.y - pin.y, rear.x - pin.x) - Math.PI / 2;
    // horsehead tip is at distance R in front of the pivot → vertical travel R·sin(tilt)
    const R = -this.pivot.x + 0.25;
    const topY = this.pivot.y + R * Math.sin(tilt) - 0.2;
    const botY = 2.2;
    this.polished.position.set(0, (topY + botY) / 2, 0);
    this.polished.scale.set(1, Math.max(0.1, topY - botY), 1);
    this.rods.position.y = this.producing ? Math.sin(tilt) * 2.2 : 0;

    if (this.flowSpeed > 0 && this.opts.motion) {
      const pos = this.flow.geometry.getAttribute('position') as THREE.BufferAttribute;
      const yPump = depthY(s.pump_depth_m);
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * this.flowSpeed * 1.6;
        if (y > 0) y = yPump + (y % 1);
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
    this.flow.visible = this.producing;
    if (this.steam.visible && this.opts.motion) {
      const pos = this.steam.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * 2.5;
        if (y > 16) y = 7.7;
        pos.setY(i, y);
        pos.setX(i, 22.8 + (y - 7.7) * 0.25 * Math.sin(i));
      }
      pos.needsUpdate = true;
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (document.hidden) return;
    this.animate(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.css.render(this.scene, this.camera);
  };

  // ---- hover readout on the rod string ------------------------------------------------------------------
  private handlePointer = (e: PointerEvent) => {
    const s = this.snap;
    if (!s || !this.onHover) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.rodSegs, false)[0];
    if (this.hovered && this.hovered !== hit?.object) (this.hovered.material as THREE.MeshStandardMaterial).emissive.set('#000000');
    if (!hit) { this.hovered = null; this.onHover(null); return; }
    const m = hit.object as THREE.Mesh;
    this.hovered = m;
    (m.material as THREE.MeshStandardMaterial).emissive.set('#333333');
    const i = m.userData.i as number;
    const z = s.depth_m[i] + 25;
    const sec = s.sections.find((x) => z >= x.from_m && z <= x.to_m) ?? s.sections[s.sections.length - 1];
    const mid = (a: number[]) => (a[i] + a[i + 1]) / 2;
    this.onHover({ depth_m: z, fmi: mid(s.fmi), temp_c: mid(s.temp_c), mu_cp: mid(s.mu_cp), section: sec.section, grade: sec.grade, diameter_in: sec.diameter_in });
  };
  private clearHover = () => {
    if (this.hovered) (this.hovered.material as THREE.MeshStandardMaterial).emissive.set('#000000');
    this.hovered = null;
    this.onHover?.(null);
  };

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.css.setSize(w, h);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointer);
    this.renderer.domElement.removeEventListener('pointerleave', this.clearHover);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((x) => x.dispose());
    });
    this.renderer.dispose();
    this.host.innerHTML = '';
  }
}
