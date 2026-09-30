// End-to-end smoke test: drives the real UI in headless Chrome.
//   npm run e2e                      → against http://localhost:5173 (dev server must be running)
//   BASE=http://localhost:8080 npm run e2e   → against the docker-compose stack
//   MOCK=1 npm run e2e               → force the in-browser twin even if a backend is up
// Walks every screen, then the core loop: optimize → decide → inbox → audit,
// the clock, a backtest, the 3D sandbox and the viewer role. Fails on any page error.
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const Q = process.env.MOCK ? '?mock=1' : '';
const OUT = process.env.E2E_OUT ?? 'e2e-shots';
mkdirSync(OUT, { recursive: true });

const results = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✓ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    console.log(`  ✗ ${name}\n      ${e.message.split('\n').join('\n      ')}`);
    try { await p.shot(`fail-${name.replace(/\W+/g, '-')}`); } catch { /* ignore */ }
  }
}

const p = await launch({ base: BASE, outDir: OUT, height: 1000 });
/** client-side navigation keeps the browser twin's state (a reload would reset it) */
const nav = async (path, wait = 900) => {
  await p.evaluate(`window.history.pushState({}, '', ${JSON.stringify(path)}); window.dispatchEvent(new PopStateEvent('popstate')); true`);
  await sleep(wait);
};

try {
  console.log(`PetroTwin E2E smoke → ${BASE}${Q ? ' (mock forced)' : ''}`);
  await p.go('/field' + Q, 2500);
  await p.evaluate("localStorage.setItem('pt.role','engineer'); true");
  const mode = await p.evaluate("document.querySelector('.mode')?.textContent ?? ''");
  console.log(`  mode: ${mode}`);

  const screens = [
    ['/field', 'Re-steam calendar'], ['/wells/BG-023', 'Rod string'], ['/wells/BG-023/3d', 'Sandbox'],
    ['/wells/BG-023/scenario-lab', 'Scenario'], ['/wells/BG-023/optimize', 'New run'], ['/risk', 'Risk'],
    ['/recommendations', 'Inbox'], ['/backtests', 'Backtests'], ['/data-quality', 'Raw vs cleaned'], ['/models', 'Training range'],
    ['/wells/BG-009', 'Out of distribution'],
  ];
  for (const [path, text] of screens) {
    await step(`screen ${path}`, async () => { await nav(path, 300); await p.waitText(text, 10000); });
  }

  await step('optimize → strategies', async () => {
    await nav('/wells/BG-023/optimize?autorun=1', 500);
    await p.waitText('Strategies', 20000);
    await p.shot('optimize');
  });
  await step('decide (later) → recorded', async () => {
    await p.clickText('button', 'Later');
    await p.waitText(/deferred/i, 8000);
  });
  await step('inbox history shows the decision', async () => {
    await nav('/recommendations');
    await p.clickText('button', 'History');
    await p.waitText(/deferred/i, 5000);
  });

  await step('+1 day advances the clock', async () => {
    await nav('/wells/BG-023');
    await p.waitText('Rod string', 8000);
    const before = await p.evaluate("document.querySelector('.top .sub')?.textContent ?? ''");
    await p.clickText('button', '+1 day');
    await p.waitText('measured', 8000);
    const after = await p.evaluate("document.querySelector('.top .sub')?.textContent ?? ''");
    if (before === after) throw new Error(`header did not change: ${after}`);
  });

  await step('backtest runs, skill first', async () => {
    await nav('/backtests');
    await p.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(Run backtest|Run again)/.test(x.textContent.trim())); b.click(); return true; })()`);
    await p.waitText('Skill first', 30000);
    const t = await p.text();
    if (t.indexOf('Forecast error') > t.indexOf('Predicted gain')) throw new Error('gain shown before skill');
    await p.shot('backtests');
  });

  await step('3D sandbox recomputes on slider change', async () => {
    await nav('/wells/BG-023/3d', 2500);
    await p.waitText('Sandbox', 8000);
    const canvas = await p.evaluate("!!document.querySelector('.scene-host canvas')");
    if (!canvas) throw new Error('no WebGL canvas');
    await p.setValue('input[aria-label="Pump speed in hertz"]', 50);
    await p.setValue('input[aria-label="Production day"]', 130);
    await p.waitText('rods float', 8000);
    await p.shot('3d-sandbox');
  });

  await step('admin: audit chain has entries and is intact', async () => {
    await p.evaluate("localStorage.setItem('pt.role','admin'); true");
    await p.click('button.avatar');
    await p.clickText('button[role="menuitemradio"]', 'Admin');
    await nav('/admin');
    await p.clickText('button', 'Audit');
    await p.waitText('Chain intact', 5000);
    const t = await p.text();
    for (const a of ['optimization run', 'decision deferred', 'advance time', 'backtest run']) if (!t.includes(a)) throw new Error(`audit missing "${a}"`);
    await p.shot('admin-audit');
  });

  await step('viewer cannot act', async () => {
    await p.click('button.avatar');
    await p.clickText('button[role="menuitemradio"]', 'Viewer');
    await nav('/wells/BG-023');
    await p.waitText('Rod string', 8000);
    const disabled = await p.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '+1 day')?.disabled`);
    if (!disabled) throw new Error('+1 day enabled for viewer');
    await p.click('button.avatar');
    await p.clickText('button[role="menuitemradio"]', 'Engineer');
  });

  await step('no page errors', async () => {
    const errs = p.errors.filter((e) => !/favicon|WebSocket/i.test(e));
    if (errs.length) throw new Error(errs.slice(0, 5).join('\n'));
  });
} finally {
  await p.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — ${failed.length} failed` : ''} · screenshots in ${OUT}/`);
process.exit(failed.length ? 1 : 0);
