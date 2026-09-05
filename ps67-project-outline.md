# Ocean State Console — Complete Project Outline (PS 67)

## One-line vision
A web platform where you can see how well the ocean model's predictions match what real
floats and buoys actually measured — spatially, in 3D, across depth and time.

## Why this matters (the "nation building" part)
Ocean forecasts feed cyclone warnings, fishing zone advisories, and coastal safety systems.
Right now, most people never see *how accurate* a forecast actually is at a given place and
depth — they just get a number. This tool makes that accuracy visible and checkable, which
is genuinely useful for researchers validating models and for building public trust in
ocean forecasting. That's the honest pitch — not "we made the ocean pretty," but "we made
forecast accuracy something you can see and question."

---

## Screens — 5 screens, 3 supporting states

### Primary screens
1. **Landing screen** — one-glance explanation of what the tool does, a "Launch console" CTA.
2. **Main console** — the flagship screen. 3D depth-layered grid, variable/depth/day controls, float markers, click-to-compare. This is 80% of your build effort and 100% of your demo.
3. **Float detail** — expanded view of one float: full history chart, metadata (float ID, depth capability, last reported time), not just the small popup.
4. **Comparison report** — a shareable, printable/exportable summary: model accuracy across all floats for a chosen day. This is what you hand to a researcher or judge afterward.
5. **Presentation mode** — stripped-down, large-text version of the console for showing on a projector during your pitch.

### Supporting states (not separate screens, but must be designed)
6. **Loading state** — while data is being fetched (you have this already: the status banner + dimmed grid pattern).
7. **Empty/error state** — a day or region has no data, or the backend is unreachable (you have this already: the fallback banner).
8. **Responsive/mobile layout** — control rail collapses to a drawer or bottom sheet on narrow screens.

---

## Features — organized by priority

### Must-have (MVP — this is what "done" means for the hackathon)
- 3D depth-layered grid (surface / mid / deep), colored by temperature
- Real surface temperature data (NOAA OISST) — already wired
- In-situ float markers positioned in the same 3D space, colored by model-vs-observed delta
- Click a float → see its model vs. observed comparison chart
- Day slider with play/pause animation
- Depth layer switch (surface / 100m / 500m)
- Graceful fallback when backend/data is unavailable (already built)
- Landing screen with a clear one-sentence explanation
- Presentation mode for the pitch

### Should-have (do these if MVP is solid with time to spare)
- Float detail screen (expanded history, metadata) — currently only a small popup exists
- Comparison report screen (exportable summary) — turns your tool into something a researcher could actually use after the demo
- Real ARGO float data (needs the free Argovis API key — currently placeholder)
- Mobile-responsive layout

### Stretch (mention as "future work" in your pitch, don't build under time pressure)
- Real currents variable (vector field from actual model data — currently frontend-only synthetic)
- Real subsurface model data (Copernicus/HYCOM) replacing the derived 100m/500m approximation
- Multi-region support (currently hardcoded to one Indian Ocean bounding box)
- User accounts / saved views
- Alerting when model deviates from observations beyond a threshold

---

## User flow

**Primary flow (a researcher/judge exploring the tool):**
1. Land on the landing screen, understand the pitch in one glance, click "Launch console."
2. Arrive at the main console — see the ocean grid rendering, floats visible.
3. Drag to orbit, get oriented in 3D space.
4. Switch depth layers — see how temperature structure changes with depth.
5. Click a float marker — side panel opens with a comparison chart.
6. Either close it and explore more floats, or click through to the full float detail screen.
7. Press play on the day slider — watch the week evolve, see which floats develop bigger model-vs-observation gaps over time.
8. Optionally, open the comparison report to see the accuracy summary across all floats for that day.

**Demo/pitch flow (what you actually do on stage):**
1. Open in presentation mode directly (skip the landing screen for time).
2. Orbit once to establish the 3D scene.
3. Immediately click a float with an interesting (large) delta — this is your hook, it shows the tool's actual purpose in the first 10 seconds.
4. Switch depth layers once to show the volumetric aspect.
5. Hit play briefly to show it's dynamic, not a static image.
6. Close with the comparison report or a one-line statement of impact.

---

## How the pieces connect (system flow)

1. **Data pipeline** fetches real ocean grid data (NOAA) and real float data (Argovis), processes/downsamples it, writes static JSON.
2. **Backend** serves that JSON through a simple API (`/grid`, `/floats`, `/floats/{id}/history`).
3. **Frontend** fetches from the backend and renders the 3D scene, controls, and comparison charts — falling back to synthetic data if the backend isn't reachable, so it's never broken to look at.

This is already built and tested end-to-end (see the `ps67-project.zip` from earlier) — the outline above is what to build *on top of* that foundation.

---

## Team mapping (6 people)

| Feature area | Owner(s) |
|---|---|
| Data engineering (real NOAA/Argovis fetch, processing) | 1–2 people |
| 3D frontend (console, depth layers, floats, camera) | 2 people |
| Backend API + float/comparison-report endpoints | 1 person |
| Landing, float detail, comparison report, presentation mode screens | 1 person (can double up with research/pitch role) |

---

## Build order (matches the roadmap from earlier)
1. Data pipeline real fetches working end to end for all 7 days
2. Backend serving all endpoints reliably
3. Main console fully wired to real data (done)
4. Landing screen + presentation mode (fast to build, high visual payoff)
5. Float detail screen (expand what's already there)
6. Comparison report screen
7. Mobile responsiveness pass
8. Full rehearsal in presentation mode

---

## Definition of done for the hackathon
You can say yes to all of these:
- [ ] A judge can watch the day slider animate and understand what's changing
- [ ] A judge can click at least 3 different floats and see believably different comparison results
- [ ] The tool works with zero internet dependency during the actual demo (pre-cached data)
- [ ] You can explain, in one sentence, why the model-vs-observation comparison matters to someone who isn't an oceanographer
- [ ] Nothing on screen is unexplained — every button, slider, and color has an obvious purpose
