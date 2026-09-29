// Evidence Lock guard (frontend.md §6, system-design §14.1): screens must not
// contain hard-coded KPI numbers. Flags JSX text like "34 BOPD", "₹1.38 L",
// "0.22" next to an engineering unit. Values must come from the API or registry.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['src/features', 'src/components'];
const UNITS = 'BOPD|BFPD|bbl|cP|kWh|kWh/bbl|ksc|psi|SPM|Hz|°C|t/h';
// literal number + unit inside JSX text (between > and <, outside {braces})
const JSX_TEXT = new RegExp(`>([^<>{}]*?\\b\\d[\\d,]*(?:\\.\\d+)?\\s*(?:${UNITS})\\b[^<>{}]*)<`, 'g');
const RUPEE = />[^<>{}]*₹\s*\d[^<>{}]*</g;
// allowed: axis/tick scaffolding and depth scale in the cutaway
const ALLOW = [/\bm<\/text>/, /day \d+/];

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.tsx')) files.push(p);
  }
};
ROOTS.forEach(walk);

let bad = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  src.split('\n').forEach((line, i) => {
    for (const re of [JSX_TEXT, RUPEE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        if (ALLOW.some((a) => a.test(m[0]))) continue;
        bad++;
        console.log(`${relative('.', f)}:${i + 1}  literal KPI in JSX: ${m[0].slice(1, -1).trim()}`);
      }
    }
  });
}
if (bad) {
  console.error(`\n${bad} hard-coded KPI value(s). Take them from the API or the parameter registry.`);
  process.exit(1);
}
console.log(`no-literal-kpi: ${files.length} files clean`);
