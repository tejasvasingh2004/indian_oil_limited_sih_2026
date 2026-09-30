// Minimal Chrome DevTools Protocol driver (no Puppeteer dependency) used by the
// E2E smoke test and for screenshots. Needs Node ≥ 22 (global WebSocket) and Chrome.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ base = 'http://localhost:5173', width = 1440, height = 900, port = 9333, outDir = '.' } = {}) {
  const chromePath = CANDIDATES.find((p) => existsSync(p));
  if (!chromePath) throw new Error('Chrome not found; set CHROME_PATH');
  const profile = join(tmpdir(), `petrotwin-e2e-${port}`);
  mkdirSync(profile, { recursive: true });
  const chrome = spawn(chromePath, ['--headless=new', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });

  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
  }
  if (!target) { chrome.kill(); throw new Error('Chrome did not start'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${expr.slice(0, 120)}\n→ ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  const page = {
    errors,
    evaluate,
    go: async (path, wait = 2000) => { await send('Page.navigate', { url: base + path }); await sleep(wait); },
    shot: async (name) => {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      const f = join(outDir, `${name}.png`);
      writeFileSync(f, Buffer.from(data, 'base64'));
      return f;
    },
    text: () => evaluate('document.body.innerText'),
    /** wait until the page text contains s (or the regex matches) */
    waitText: async (s, timeout = 8000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        const t = await evaluate('document.body.innerText');
        if (typeof s === 'string' ? t.includes(s) : s.test(t)) return true;
        await sleep(150);
      }
      throw new Error(`timed out waiting for "${s}"`);
    },
    click: (sel) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('no ' + ${JSON.stringify(sel)}); e.click(); return true; })()`),
    clickText: (tag, text) => evaluate(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(tag)})].find((x) => !x.disabled && x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!e) throw new Error('no ${tag} starting with ' + ${JSON.stringify(text)}); e.click(); return true; })()`),
    /** set a React-controlled input's value and fire input/change */
    setValue: (sel, v) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('no ' + ${JSON.stringify(sel)});
      const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(String(v))});
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`),
    resize: (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }),
    close: async () => { try { ws.close(); } catch { /* closed */ } chrome.kill(); },
  };
  return page;
}
