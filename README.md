# PetroTwin — Frontend (R0 prototype)

Decision-support console for the Baghewala well-to-surface digital twin (SIH26120). Spec: [../frontend.md](../frontend.md). Build log: [../progress.md](../progress.md). Ideas and open threads: [../brain-dump.md](../brain-dump.md).

**All data is simulated.** Nothing on screen is a field result.

Two transports, same screens: on start-up the app asks `/api/health`. If the FastAPI backend ([../backend](../backend)) answers, every call goes over HTTP (plus a WebSocket for live updates) and the sidebar shows **Live API**. If not, `src/mocks/` runs the same twin in the browser and the sidebar shows **Browser twin**. `?mock=1` forces the browser twin.

## Run

```bash
npm install
npm run dev          # http://localhost:5173 (proxies /api to :8000 if the backend runs)
npm run check        # typecheck + unit tests + no-literal-KPI guard
npm run build        # production bundle in dist/
npm run e2e          # headless-Chrome smoke test against the running app (BASE=…, MOCK=1)
```

Whole stack: `../start.ps1` / `../start.sh` (backend + Vite), or `docker compose up --build` in the repo root → http://localhost:8080.

Demo shortcuts:
- `/wells/BG-023` is the reference well (system-design §2.3).
- `/wells/BG-023/optimize?autorun=1` starts an optimization run immediately.
- `/wells/BG-009` is out of distribution, so you can see the OOD block.
- **+1 day** on a well page advances the simulated clock for all wells; a note shows how the new measurement compared with the forecast.
- `/wells/BG-023/3d` is the 3D sandbox: drag pump speed to 50 Hz and the day to 130 to watch the rods float. `?view=reservoir` opens on the pump and pay.
- The avatar (top right) switches the demo role: viewer (read only), engineer, admin (adds the Admin page).

## Screens

Visual style (v2): white dashboard with a left sidebar, three stat cards per page (black / grey / lime), bordered panels, a hatched lime meter and tables with small status pills. Every page follows the same pattern — stat cards, one or two panels, one table.

| Route | Screen | Covers |
|---|---|---|
| `/field` | Dashboard: oil today, energy per barrel, wells needing attention; reservoir-limited meter; re-steam calendar; wells table | US-01 |
| `/wells/:id` | Well: oil rate, rod float margin, re-steam in; what limits the well; what to change (levers + safety); oil forecast; vitals; rod string (FMI vs depth, Goodman, fatigue); heat and viscosity; steam cycles; decisions for this well; data-score chip; drawers for the re-steam curve, bottleneck history and forecast check | US-02…10, 18, 19, 21, 25 |
| `/wells/:id/3d` | 3D sandbox: cut-away strata, pay, heated zone, rod string coloured by float margin, pumpjack at the real SPM; day and speed sliders recompute live | US-05, 08, 09 |
| `/wells/:id/scenario-lab` | Scenario Lab: up to 4 next-cycle designs, fixed or planned pump speed | US-11 |
| `/wells/:id/optimize[/:runId]` | Optimize: setup, progress, strategies table, pump-speed plan, why, safety check + trust, decision | US-12…20 |
| `/risk` | Risk | US-10 |
| `/recommendations` | Inbox and history | US-20, 25 |
| `/backtests` | Counterfactual backtest on simulated history: run → progress → skill first, then gains on skill-passing cycles; per-cycle table | US-22 |
| `/data-quality` | Data quality: scores, flags, raw vs cleaned, events | US-04 |
| `/models` | Model health: release gates and metrics for models A–D, training range | US-23 |
| `/admin` | Admin (admin role): parameter registry + anchor tests, limits, hash-chained audit log (read-only in R0; edits need OIL sign-off) | US-24, 26 |

## Layout

```text
src/
  api/          types (mirror system-design §5), client (live HTTP or browser twin), events (WebSocket), React Query hooks
  mocks/        registry · model (physics chain) · wells (33) · cycle (next-cycle engine) ·
                optimizer (grid, gate, trust, sanity, explanations) · evidence · state (clock, ledger, audit chain) ·
                extras (3D snapshot, thermal, cycles, backtest, data quality, model health, registry)
  components/   Shell (sidebar + header), ui (StatCard, Panel, Tile, Meter, Status, PillLink), Metric,
                Chips (TrustMeter), EvidencePopover, Drawer, charts (limit bars, line + band, step plan, scatter)
  features/     field · well · well3d (three.js sandbox) · scenario · optimize · risk · inbox · backtests ·
                quality · models · admin
  store/        ui (evidence popover, toast, drafts) · role (demo role switch)
  styles/       tokens.css, app.css
scripts/        check-no-literal-kpi.mjs (Evidence Lock guard) · e2e/ (CDP driver + smoke test)
```

## Rules the code enforces

- Every KPI renders through `<Metric>`. Computed values carry an `evidence_id`, and TypeScript requires it for `DERIVED/PREDICTED/BACKTESTED`. Click opens the evidence record.
- `npm run lint:kpi` fails on numbers-with-units typed into JSX. Limits are read from the registry.
- The optimizer mock is labelled "exhaustive grid, not NSGA-III" (claims policy).
- Decisions never send settings anywhere. LOW trust needs a review note; a reject needs a reason and a comment; REJECTED strategies can't be decided.

## Deviations from frontend.md §3

| Spec | Here | Why |
|---|---|---|
| Tailwind + shadcn/ui | Plain CSS with tokens | The frosted-glass reference look is custom; utilities add little |
| Plotly | Hand-drawn SVG charts | Minimal marks match the reference; saves ~3 MB |
| react-three-fiber | Plain three.js in one class, lazy-loaded | One scene; fewer dependencies; React owns only the controls |
| Dark theme default | Light dashboard only | The requested visual reference is light and minimal |
| MSW fixtures | In-browser mock module | Numbers are computed by a model, not recorded, so screens stay consistent |
