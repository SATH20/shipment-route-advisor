# Prompts for building the Next.js frontend

Use these in order, one prompt per step. Wait for each step to work before sending the next.
Put the `frontend-brief/` folder inside the repo first (as `docs/design/`), so the agent can read
`design-reference.html` and `world-map.svg`.

---

## Prompt 0 - Context (send first)

```
You are working in my repo "shipment-route-advisor". It recommends shipping routes. The Python
engine is finished and tested: engine/, services/, evaluation/, config/, geography.py,
generate_dataset.py, tests/. DO NOT change any logic in these folders. The only Python you may add
is a thin API layer in api/ and one display helper in geography.py (I will tell you when).

Goal: replace the Streamlit dashboard with a Next.js frontend that a child could understand.
The visual design is in docs/design/design-reference.html (open it and read it fully: layout,
colours, fonts, spacing, animations, wording). Match it closely. world-map.svg is only a
reference for how the map should look; we will draw the map in code.

Rules:
- Plain words everywhere. Never show these words in the UI: regret, CVaR, Pareto, dominated,
  Monte Carlo, expected value, objective, stochastic. Use the wording table in Prompt 3.
- Every number on screen must come from the API. Never hard-code or invent numbers.
- No emojis. Icons are simple inline stroke SVGs.
- Accessible: real <button>/<a>/<label>, 44px touch targets, text contrast 4.5:1,
  respects prefers-reduced-motion.
- Works on a phone (375px wide) and a laptop.
- Do not commit or push. Do not put any API keys in code.

Reply with a short plan of the folders you will create. Don't write code yet.
```

---

## Prompt 1 - API layer (FastAPI)

```
Create api/__init__.py and api/main.py: a FastAPI app that exposes the existing engine.
Add fastapi==0.115.4, uvicorn==0.32.0 and httpx==0.27.2 to requirements.txt.
Run with: uvicorn api.main:app --reload --port 8000
Enable CORS for http://localhost:3000.

Use the existing functions, do not copy their logic:
- engine.dataset.load_tables, engine.dataset.build_shipments
- evaluation.scenarios.SCENARIOS (to apply world events to the legs table before building)
- engine.analysis.analyze(shipment, mode=..., keep_samples=True, penalty_per_day=..., carbon_price=..., min_on_time=...)
  Note: analyze() skips confidence and tipping points when any override is passed. That is intended.
- services.explanation_service.explain(analysis, use_llm=False)
- geography.route_path(route.legs) for map coordinates ([lat, lon] pairs)
- evaluation.scenarios.run_scenario(name)
- config.assumptions.assumptions_table()
Cache results with functools.lru_cache keyed on the query parameters.

Endpoints:

GET /api/shipments
  -> list of { id, cargo, profile, origin, destination, value_usd, weight_kg, deadline_days,
               recommended_route_name, confidence_label }

GET /api/shipments/{id}
  query params (all optional): mode = "expected" | "play_safe"
                               events = comma-separated scenario names from SCENARIOS
                               penalty (float, $ per late day), deadline_shift (float, days),
                               carbon (float, $ per tonne), min_on_time (0-1)
  -> {
    shipment: { id, cargo, profile, origin, destination, value_usd, weight_kg, deadline_days,
                penalty_per_day, min_on_time, risk_mode, hazardous, avoid_regions, budget_usd },
    mode,                       // the mode actually used
    recommended_route_id,       // null if nothing is possible
    warnings: [string],
    routes: [{
      id, name, stops: [port names], status, reasons: [string],
      freight_usd, planned_days,
      metrics: null | { mean_days, p90_days, p_on_time, p_disruption, exp_late_cost, exp_loss,
                        carbon_cost, exp_total, cvar_total, co2_tonnes },
      coords: [[lat, lon], ...],
      passages: [string],       // from geography.route_passages (Prompt 2)
      arrival_histogram: null | { edges: [number], counts: [number] }   // 30 bins from metrics.arrival_samples
    }],
    confidence: null | { label, agreement, runs, alternatives: { route_name: share } },
    tipping: [{ parameter, sentence, new_route }],
    explanation: { text, source }
  }
  Return 404 for an unknown id and 422 for an unknown event name.

GET /api/evaluation
  -> { comparison: [...rows of evaluation/results/comparison.csv],
       noise_sweep: [...rows of noise_sweep.csv], by_profile: [...rows of by_profile.csv] }
  If the CSVs are missing, return 503 with the message "Run python -m evaluation.evaluate first".

GET /api/scenarios/{name}  -> the fields of run_scenario(name) as JSON
GET /api/assumptions       -> [{ name, value }]

Add tests/test_api.py using fastapi.testclient: shipments list has 30 items; S020 returns 4
routes and exactly one with status "recommended"; mode=expected changes S020's pick to
"Direct sea"; events="Red Sea crisis" works; unknown id gives 404.
Run python -m pytest and show me the result.
```

---

## Prompt 2 - Passages helper (display only)

```
In geography.py add route_passages(legs) -> list of human names of the passages a route goes
through, in order and without duplicates, based on the waypoint names in each sea leg's path
(use _shortest with the same region rules that sea_path uses):
  CAPE or CAPEFAR -> "Cape of Good Hope", SUZ -> "Suez Canal", "Panama" -> "Panama Canal",
  MAL or SGS -> "Strait of Malacca", GIB -> "Strait of Gibraltar", BAB -> "Bab-el-Mandeb".
Rail legs add "rail across land", air legs add "flight".
This is for labels only. Do not change sea_path, leg_path or anything the generator uses.
Add a test: S020's Direct sea route includes "Cape of Good Hope" and its Suez route includes
"Suez Canal". Run python -m pytest.
```

---

## Prompt 3 - Next.js app, layout and wording

```
Create the frontend in web/ with:
  next@14.2.15, react@18.3.1, react-dom@18.3.1, typescript@5.6.3, tailwindcss@3.4.14,
  postcss@8.4.47, autoprefixer@10.4.20, d3-geo@3.1.1, topojson-client@3.1.0, world-atlas@2.0.2,
  and the matching @types packages.
App Router, TypeScript, src/ folder. Fonts with next/font/google: Inter (body) and
Space Grotesk (headings). API base URL from NEXT_PUBLIC_API_URL, default http://localhost:8000.

Copy the colours from the design into tailwind.config as named tokens:
  ink #0f1b2d, paper #f7f5f0, card #ffffff, line #e7e3da, muted #4a5566, subtle #6b7686,
  accent #1d4ed8, ocean #eaf1f8, land #f7f4ec, good #15803d, bad #b42318,
  route-plane #7c3aed, route-ship #1d4ed8, route-suez #dc4a3d, route-rail #15803d,
  route-shipair #d97706, route-hub #0891b2
Copy the keyframes from the design (draw, rise, grow, ping) into globals.css, with the
prefers-reduced-motion rule.

Header with logo mark + "Route Advisor" and nav: "Plan a shipment" (/), "How it decides" (/how),
"Does it work?" (/results). Footer text exactly as in the design.

Create src/lib/words.ts with this wording table and use it everywhere:
  Route names:  "Direct sea" -> "Direct ship", "Sea via hub" -> "Ship with a stop",
                "Suez corridor" -> "Ship through Suez", "Sea + rail" -> "Ship, then train",
                "Sea + air" -> "Ship, then plane", "Air freight" -> "By plane".
                For "Direct ship", add the main passage from `passages` as a subtitle
                (e.g. "around Africa" for Cape of Good Hope, "through the Panama Canal").
  Status:       recommended -> "Our pick", candidate -> "Possible",
                dominated -> "Worse in every way", "fails reliability" -> "Too often late",
                "not allowed" -> "Not allowed"
  Numbers:      exp_total -> "Usual total cost", cvar_total -> "Bad-luck cost",
                p_on_time -> "Arrives on time", p_disruption -> "Chance of trouble",
                mean_days -> "days", co2_tonnes -> "Pollution (t CO2)", freight_usd -> "Ticket price"
  Profiles:     express -> "Urgent", standard -> "Normal", budget -> "Cheap is fine",
                high_value -> "Very valuable"
  Modes:        play_safe -> "Play it safe", expected -> "Cheapest on average"
Also a one-line plain description per route type, like the design ("Fastest. Costs the most.").
Write these from the route's own numbers where possible, not fixed text.

Create src/lib/api.ts with typed fetch functions for every endpoint in Prompt 1, plus loading and
error states (a friendly message telling the user to start the API with the uvicorn command).
Show me the empty layout running with npm run dev.
```

---

## Prompt 4 - The "Plan a shipment" page

```
Build src/app/page.tsx exactly like sections 1-4 of docs/design/design-reference.html,
using live data from /api/shipments and /api/shipments/{id}. Default shipment: S020.

1. "The shipment": a dropdown of all shipments (label: id, cargo, origin country to destination
   country). One plain sentence built from the data: "Send {weight} kg of {cargo} worth {value}
   from {origin} to {destination}. It must arrive within {deadline} days, and every day late costs
   {penalty}." Chips: profile in plain words, on-time target, "Batteries can't fly" if hazardous,
   "No Red Sea" if avoid_regions has red_sea, freight budget if set.

2. "{n} ways to send it": a RouteMap component plus one card per route.
   RouteMap: inline SVG with d3-geo. Land from world-atlas/land-110m.json (import it locally,
   no network). Use geoEquirectangular().fitExtent() on the bounding box of all route coords
   plus a 10% margin. Ocean #eaf1f8, land #f7f4ec, faint graticule. Draw every route's coords
   as a path in its route colour; the recommended route is thick (8px) and the others 3-4px;
   rejected routes dotted. Animate drawing with the "draw" keyframe (pathLength=1), staggered.
   A small dot travels along the recommended route (SVG animateMotion). Origin and destination
   get dark dots with labels; the first stop of each route a small ring. Legend next to the map.
   Caption: "Lines show the ports and sea passages each way uses, not exact tracks."
   Route cards: name + plain subtitle, status badge ("Our pick" floats on top in green),
   big number of days with a bar against the deadline, then Ticket price, Chance of trouble,
   Usual total cost, Bad-luck cost, Pollution. Rejected routes show their reason in plain words
   instead of numbers. Below the cards, the one-line definitions of "Usual total cost" and
   "Bad-luck cost" from the design.

3. "Our pick, and why": dark panel like the design. Segmented control "Play it safe" /
   "Cheapest on average" that refetches with mode=play_safe / expected (default = the
   shipment's risk_mode). Big route name, 2-3 numbered reasons generated from the numbers
   (compare the pick with the next-best possible route: usual cost, bad-luck cost, days,
   on-time), "How sure are we?" with confidence.agreement x 100 and an animated bar, and
   "What would change our mind" from the tipping sentences (rewrite route names with words.ts).
   Show warnings in an amber box.

4. "Try it yourself": toggle cards for each event (Red Sea crisis, Red Sea reopens,
   Hub congestion spike, Air capacity crunch) and three sliders: late-day penalty,
   deadline shift (-10 to +10 days), price on pollution ($0-500/t). Every change refetches
   (debounce 300 ms). Show "Our pick now: X" and say clearly whether it changed and why,
   using the returned numbers. A "Reset" button.

Add a collapsible "See the 5,000 imagined trips" section: arrival_histogram per route as small
bar charts in plain SVG (no chart library) with a dashed line at the deadline.
Make every section fade/rise in on scroll (IntersectionObserver + the "rise" class).
```

---

## Prompt 5 - "How it decides" and "Does it work?"

```
/how: the 5 steps from the design (Check the rules, Imagine 5,000 trips, Drop the losers,
Add up the real cost, Double-check), each with its icon and short text. Under each step, a small
live example from S020 using /api/shipments/S020 (e.g. step 1: which routes were not allowed and
why; step 2: S020's chance of arriving on time per route; step 4: the cost parts as a stacked bar
per route: ticket, late fees, losses from trouble, pollution). Keep sentences short.

/results: "Money wasted per shipment" horizontal bars from /api/evaluation comparison
(show: Advisor profile settings, Always cheapest, Always safest, Always fastest, Fixed weights;
label the advisor "Route Advisor"). Then three plain findings computed from the data:
  - how often Route Advisor made the same choice as a perfect planner,
  - what "always cheapest" gets right (lowest average cost, lowest pollution) and wrong
    (missed on-time targets, much bigger bad-luck cost on valuable cargo),
  - what happens when the guesses get worse (noise_sweep table as a small line chart).
Then a "World events" grid from /api/scenarios/{name} for all 4 events: shipments re-routed,
forced switches, average cost before and after.
End with an honest "Limits" box: made-up prices and risks on real lanes, independent delays,
no capacity limits.
```

---

## Prompt 6 - Polish, clean up, verify

```
1. Responsiveness: check 375px, 768px and 1440px. Nothing overflows sideways; cards stack;
   the map scales; the segmented control and sliders stay usable.
2. Loading skeletons for the map and cards; a clear error box if the API is down.
3. Delete the dashboard/ folder (Streamlit). Remove streamlit and plotly from requirements.txt.
   Update tests/test_no_truth_leak.py to scan api/ and web/src/ instead of dashboard/.
4. Update README.md "Running it":
     pip install -r requirements.txt
     python generate_dataset.py
     python -m evaluation.evaluate
     uvicorn api.main:app --port 8000
     cd web && npm install && npm run dev      (open http://localhost:3000)
     python -m pytest
   and the code layout section (api/, web/ instead of dashboard/).
5. Run python -m pytest and npm run build. Both must pass. Fix any errors.
6. Give me a checklist of what I should click to verify each page works.
```
