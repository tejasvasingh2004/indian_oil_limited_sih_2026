# PetroTwin — Frontend (R0 prototype)

Decision-support console for the Baghewala well-to-surface digital twin (SIH26120). Spec: [../frontend.md](../frontend.md). Build log: [../progress.md](../progress.md). Ideas and open threads: [../brain-dump.md](../brain-dump.md).

**All data is simulated.** Until the FastAPI backend exists, `src/mocks/` implements the API contract of [system-design.md §5](../system-design.md) in the browser with a small physics model. Nothing on screen is a field result.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run check        # typecheck + unit tests + no-literal-KPI guard
npm run build        # production bundle in dist/
```

Demo shortcuts:
- `/wells/BG-023` is the reference well (system-design §2.3).
- `/wells/BG-023/optimize?autorun=1` starts an optimization run immediately.
- `/wells/BG-009` is out of distribution, so you can see the OOD block.
- **+1 day** in the pill bar advances the simulated clock for all wells, and the twin-update card scores the new measurement.

## Screens

| Route | Screen | Covers |
|---|---|---|
| `/field` | Field Board: wells by bottleneck, output donut, tiles, needs-attention, well grid | US-01 |
| `/wells/:id` | Well Console: live pumpjack at the well's SPM (views: surface · rod string · reservoir), Navigator, re-steam window, float margin, status strip, drawers | US-02…10, 18, 19, 21 |
| `/wells/:id/scenario-lab` | Scenario Lab: up to 4 next-cycle designs, fixed or planned pump speed | US-11 |
| `/wells/:id/optimize[/:runId]` | Cycle Designer: grid optimizer, sanity check, strategies, comparison, SRP plan, trade-off space, explanation, gate + trust, decision | US-12…20 |
| `/risk` | Risk Center | US-10 |
| `/recommendations` | Inbox and history | US-20, 25 |
| `/backtests` | Counterfactual backtest layout (skill first; placeholders until a stored run exists) | US-22 |

Model health, data quality and admin are build-order step 9 and are not in this build.

## Layout

```text
src/
  api/          types (mirror system-design §5), client (mock-backed), React Query hooks
  mocks/        registry · model (physics chain) · wells (33) · cycle (next-cycle engine) ·
                optimizer (grid, gate, trust, sanity, explanations) · evidence · state (clock, ledger)
  components/   Card, Metric (provenance + evidence), Chips/TrustMeter, EvidencePopover, Drawer,
                PillBar, Frame, charts (bars, donuts, threshold, strip, line+band, step, scatter),
                scenes/ (DesertScene pumpjack, DownholeScene cutaway)
  features/     field · well · scenario · optimize · risk · inbox · backtests
  styles/       tokens.css (golden-hour glass), app.css
scripts/        check-no-literal-kpi.mjs (Evidence Lock guard)
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
| Dark theme default | Light "golden hour" default (`data-theme="dark"` still works) | The requested visual reference is light |
| MSW fixtures | In-browser mock module | Numbers are computed by a model, not recorded, so screens stay consistent |
