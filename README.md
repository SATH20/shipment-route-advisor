# Shipment route advisor

Take-home assignment for the Aiqon AI Internship: recommend a route for each shipment, balancing cost, delivery time and risk.

**Live demo:** https://shipment-route-advisor.vercel.app
**Report:** [report.pdf](report.pdf)

> **If the live demo is slow:** that is Render's free tier, not the code. The API sleeps after about 15 minutes without traffic, so the first request can take up to a minute while it wakes up (the page shows a "Starting the server" notice and keeps retrying). Default shipment pages are served from a precomputed cache and are quick once the server is awake. Anything computed live (another mode, a world event, a slider, your own shipment) runs on a slow free CPU and can take several seconds to a minute.

## What it does

Each shipment has a few candidate routes (direct sea, through the Suez Canal, via a hub, sea plus rail, sea plus air, air). For every shipment the advisor:

1. removes routes that break a rule,
2. simulates the rest 5,000 times,
3. drops routes that are worse on every measure,
4. picks the one with the lowest expected total cost in dollars (high-value cargo is scored on its worst 10% of outcomes instead of the average).

Each recommendation comes with an explanation, a confidence level, and the smallest change in inputs that would make a different route win.

## Things to try in the demo

- **S020** (electronics, Nhava Sheva to Antwerp): switch between expected cost and play-safe. Expected cost picks Direct sea, play-safe picks Air freight.
- **S025** (express cargo on the Suez corridor): tick "Red Sea crisis". The route moves off Suez because its on-time probability drops below the 90% express target.
- **Air capacity crunch** on all shipments: average cost rises 33% and no shipment can switch.
- **Your own shipment:** not in the web UI. Send it to the API (POST /api/recommend on the API's /docs page) or use the command line; see "Your own shipment" below.
- **How it decides** and **Does it work?** show the method and the evaluation.

## Running it locally

Needs Python 3.11+ and Node 20+. No API key is needed.

```bash
pip install -r requirements.txt
python generate_dataset.py          # writes data/ and evaluation/ground_truth/ (same bytes every run)
python -m evaluation.evaluate       # writes evaluation/results/*.csv
python -m evaluation.scenarios      # writes evaluation/results/scenarios.csv
python -m pytest
```

Then start the API and the web app in two terminals:

```bash
uvicorn api.main:app --port 8000
```

```bash
cd web
npm install
npm run dev        # then open http://localhost:3000
```

`npm run build`, `npm run lint` and `npx tsc --noEmit` also work. The web app calls the API at `http://localhost:8000`. To use other ports, set `NEXT_PUBLIC_API_URL` for the web app and `ALLOWED_ORIGINS` (comma-separated) for the API, for example `ALLOWED_ORIGINS=http://localhost:3001 uvicorn api.main:app --port 8001` and `NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev -- -p 3001`.

`api/cache/` holds the precomputed answer for every shipment with default settings, because the full analysis is slow on a free hosting CPU. The API uses it only if it was built from the same data, code and library versions, and computes live otherwise. Other modes, world events, slider changes and your own shipments are always computed live. After changing the data or any decision code, rebuild it with `python scripts/build_cache.py`.

An LLM can optionally rewrite the explanations (see Design choices).

## Your own shipment

The advisor also takes a shipment that is not in the dataset. Describe it in JSON (shipment fields plus 1 to 6 routes of 1 to 4 legs each; see `examples/custom_shipment.json`, Chennai to Rotterdam) and run the same pipeline:

```bash
curl -X POST "http://localhost:8000/api/recommend" -H "Content-Type: application/json" --data @examples/custom_shipment.json
```

```bash
python -m engine.optimizer --file examples/custom_shipment.json
```

The API returns the same response as `GET /api/shipments/{id}` (pick, every route's numbers, explanation, confidence and what would change it). Add `?mode=play_safe` or `?mode=expected` to override the profile. `delay_penalty_usd_per_day` is optional and defaults to the profile's share of cargo value. Out-of-range values (for example a probability above 1), unknown profiles, modes or regions, and legs that do not connect origin to destination are rejected with a 422 that names the field. Ports the map does not know are fine; their route just comes back without map coordinates.

## How a route is scored

I didn't want to use weights like 0.4 for cost and 0.3 for time, because there is no good answer to "why 0.4?". Instead every factor is converted to dollars:

- cost: the freight quote
- time: expected days late x the customer's penalty per late day
- risk: probability of a disruption x the share of cargo value lost (10%)
- emissions: tonnes of CO2 x a carbon price ($90/t)

The penalty per late day and the reliability requirement depend on the type of cargo:

| Profile | Cost of one late day | Required on-time probability | Scored on |
|---|---|---|---|
| Express (pharma, spare parts) | 2% of cargo value | 90% | average cost |
| Standard (apparel, home goods) | 0.4% | 70% | average cost |
| Budget (furniture, materials) | 0.08% | none | average cost |
| High value (electronics, batteries) | 0.6% | 80% | worst 10% of costs (CVaR) |

## Steps

1. Hard rules: hazardous cargo can't go by air, the customer can exclude regions (for example the Red Sea), freight must fit the budget, and planned transit must fit the deadline.
2. Simulation: each leg can be delayed (with a random delay length) or disrupted. 5,000 runs give the distribution of arrival time and total cost.
3. Reliability rule: the route must meet the profile's on-time probability.
4. Pareto filter: a route is dropped if another route is at least as good on cost, time, reliability, disruption risk and CO2.
5. Score: expected total cost, or worst-10% cost for high-value cargo.
6. Confidence: the decision is repeated 100 times with the delay and risk estimates randomly changed by about 30%. High means the same route won at least 80% of the time.
7. What would change it: one input at a time (late penalty, deadline, carbon price, a route's risk) is changed until a different route wins.
8. Explanation: a text built from the numbers above.

Example output for S020 (electronics worth about $1.06M, Nhava Sheva to Antwerp):

```
Recommended: Air freight (Nhava Sheva -> Antwerp).
Why: Its average cost is higher ($4,172 vs $1,812 for Direct sea), but its worst case is much
better ($8,960 vs $13,433). For high-value cargo we protect against the bad outcomes.
Confidence: High - the same route won 82 of 100 re-runs with risk estimates varied by about 30%.
What would change it: If Direct sea's delay and disruption risk were 35% lower (disruption
chance 1.3% -> 1.1%), it would become the pick.
```

Scored on average cost instead, the same shipment would go by Direct sea.

## Code layout

```
config/assumptions.py      all assumptions (penalties, loss on disruption, carbon price, seeds)
generate_dataset.py        creates the synthetic data
geography.py               port positions and the sea-lane network (used for distances and the map)
data/                      shipments, routes and legs: the estimates the advisor uses
engine/                    constraints, simulation, pareto, scoring, optimizer, confidence, tipping
services/                  explanation text and the check on LLM output
evaluation/                baselines, metrics, evaluation, scenarios
evaluation/ground_truth/   true parameters, only used for evaluation
api/                       FastAPI layer over the engine (GET by shipment id, POST /api/recommend)
api/cache/                 precomputed default responses (scripts/build_cache.py)
examples/                  a shipment that is not in the dataset, as JSON
web/                       Next.js frontend: plan a shipment, how it decides, does it work
tests/                     unit tests
```

## Data

The data is synthetic: 30 shipments on 8 trade lanes (for example Mumbai to Hamburg and Shanghai to Rotterdam), 4 candidate routes each.

Routes are chains of legs between real ports. Routes have one to three legs; single-leg routes (direct sea, air) are allowed, and the data model accepts any chain of legs. Leg distances come from a small sea-lane network in `geography.py` (waypoints at Malacca, Bab-el-Mandeb, Suez, Gibraltar, the Cape of Good Hope, Panama and so on), and freight and transit time follow from distance and mode. The web app map draws the same paths. Route types:

- Direct sea: one sea leg. I assume it avoids the Red Sea, so Asia and India to Europe go around Africa.
- Suez corridor: through the Red Sea and the Suez Canal. Much shorter (Shanghai to Rotterdam: about 33 days instead of 43) but with high geopolitical risk. Only on lanes where Suez is the short way.
- Sea via hub: two sea legs through a transshipment port, with congestion at the hub.
- Sea + rail: sea to a land-bridge hub, then rail (China-Europe railway from Lianyungang, the Iran-Russia corridor from Bandar Abbas, the US land bridge from Los Angeles).
- Sea + air: sea to a hub, then air.
- Air freight: one to three days, roughly $3-9 per kg, about 60x the CO2 of sea.

Every shipment has Direct sea and Air freight plus two other types. Nine customers exclude the Red Sea, three shipments are lithium batteries (which can't fly), and six budget or standard customers have a freight limit.

The generator saves the data twice. The true parameters go to `evaluation/ground_truth/`. A copy where the delay and risk numbers have random errors (lognormal, sigma 0.3) goes to `data/`. The advisor only reads `data/`, and there is a test that checks this.

## Evaluation

All strategies make their choices from the noisy estimates and follow the same hard rules. Each choice is then simulated with the true parameters. The oracle is the best choice under the same rules if the true parameters were known. Regret is the difference between a strategy's cost and the oracle's cost. Results are averaged over three sets of estimation errors.

| Strategy | Avg regret | Same as oracle | Meets on-time target | Avg worst-10% cost | Total CO2 (t) |
|---|---|---|---|---|---|
| Always cheapest | $1,297 | 76% | 93% | $8,720 | 17.3 |
| Always fastest | $5,714 | 30% | 100% | $10,541 | 218.5 |
| Always safest | $4,055 | 43% | 100% | $8,768 | 203.7 |
| Fixed weights (0.4/0.3/0.15/0.15) | $6,093 | 47% | 100% | $11,111 | 161.4 |
| Advisor, expected cost for every shipment | $452 | 82% | 100% | $6,559 | 60.0 |
| Advisor, play-safe for every shipment | $831 | 67% | 100% | $6,008 | 88.0 |
| **Advisor (profile settings)** | **$315** | **91%** | **100%** | **$6,421** | **67.3** |
| Oracle | $0 | 100% | 100% | $6,083 | 67.0 |

With larger or smaller estimation errors, the average regret was:

| Estimation error | 0% | 30% | 60% |
|---|---|---|---|
| Advisor (profile settings) | $0 | $315 | $319 |
| Advisor, play-safe for every shipment | $424 | $831 | $1,027 |
| Always cheapest | $1,297 | $1,297 | $1,297 |
| Fixed weights | $6,442 | $6,093 | $6,110 |

What I take from this:

- With perfect risk estimates the advisor's regret is $0. With 30% estimation error it makes the oracle's choice 91% of the time, and at 60% error 83% of the time. The average regret barely changes ($315 to $319) because the decisions it gets wrong are close calls.
- Always picking the cheapest allowed route has the lowest average cost ($1,986 vs $3,200) and the lowest CO2, but it misses the on-time target for 25% of express shipments, and its worst-case cost on high-value cargo is 2.6 times higher ($17,583 vs $6,833).
- For express cargo the advisor spends more on average ($7,813 vs $3,224 for cheapest) because it pays for reliability. Its worst case there is no better than cheapest's.
- Treating every shipment the same way does worse. Play-safe for everyone raises the regret to $831, and expected cost for everyone to $452, so the per-profile settings matter.
- Fixed weights did worst of all, even worse than always picking the safest route. Normalising cost, time and risk to 0-1 and adding them loses the information about how big the differences actually are.
- The advisor minimises expected cost and regret is measured in cost, so the comparison favours it. That is why I also report reliability, worst case and CO2.
- The Suez corridor wins for 5 shipments (low-value or urgent cargo). It loses for valuable cargo, where a disruption costs more than the time it saves (10 to 16 days from East Asia or India to northern Europe, 24 to 27 days from Mundra to Piraeus).

## Scenarios

`python -m evaluation.scenarios` changes the conditions for all 30 shipments and re-runs every decision.

| Scenario | Shipments re-routed | Forced (old route breaks a rule) | Only one valid route left | Avg cost before / after (each shipment's own measure) |
|---|---|---|---|---|
| Red Sea crisis | 3 | 3 | 6 | $4,598 / $4,838 |
| Red Sea reopens | 2 | 0 | 4 | $4,598 / $3,948 |
| Hub congestion spike | 3 | 2 | 5 | $4,598 / $5,061 |
| Air capacity crunch (air freight +80%) | 0 | 0 | 5 | $4,598 / $6,102 |

- A Red Sea crisis pushes the three express shipments that use Suez below their 90% on-time target, so they move to rail, air and sea + air.
- If Red Sea risk returns to normal, S013 (express spare parts) moves from air to Suez and saves about $18,000.
- An 80% rise in air prices raises the average cost by 33% and no shipment switches: five shipments have only one valid route under their deadlines. Changing routes won't help there; the deadlines would have to be renegotiated.

## What I got wrong along the way

- My first oracle ignored the on-time requirements. It could choose routes the policy doesn't allow, so the comparison was unfair. I changed it to follow the same rules as every strategy.
- In the first dataset the deadlines were so tight that almost every sea route was rejected, so there was hardly a decision to make. I changed the deadlines to be based on the direct sea transit time.
- When I added the map, it showed that leg distances didn't match geography: the generator split each route's distance between legs at random (Jebel Ali to Piraeus was 4,000 km instead of about 25,000 km around Africa), and some "Sea + rail" routes had rail legs crossing oceans. I rebuilt the generator so distances come from the sea-lane network and rail starts at real land-bridge hubs. This also removed the "Cape route" type, which became the same as Direct sea. I haven't tuned the data since then, so the results aren't adjusted in the advisor's favour.
- The first cost chart in the web app was a box plot. It was unreadable because most simulated voyages cost exactly the freight, so I replaced it with median, average and worst-10% bars.
- In one version of the data the random draw produced no hazardous shipments, so the "no air for batteries" rule was tested but never used. The generator now makes sure there are at least two.
- The "what would change it" search re-decides with 1,000 simulations to stay fast, but compared the result with the 5,000-simulation pick. On close calls (S009 and S021 in play-safe mode) the cheaper re-decision already disagreed at today's inputs, so it reported nonsense such as "with a deadline 0.0 days later". It now switches to the full simulation count when that happens, and never reports a change of zero. The same search said "None would win" when a shorter deadline left no valid route; it now says no route would pass the rules. Neither change affects any pick or evaluation number.
- In the scenarios, some route changes first showed up as negative savings. These were switches forced by a broken rule, so I now count them separately.
- Shanghai to Rotterdam was routed through the Panama Canal. Sea paths to European ports now exclude Panama.
- The full analysis took about a minute per shipment on Render's free CPU, almost all of it in the confidence check and the tipping-point search. Default results are now precomputed and guarded by a fingerprint of the data, code and library versions. While testing the cache I also found and fixed a crash when `min_on_time` was passed twice to the shipments endpoint.

## Assumptions

All of these are in `config/assumptions.py`.

| | |
|---|---|
| Simulations per route | 5,000 |
| Cargo value lost on disruption | 10% |
| Extra days per disruption | 7 |
| Carbon price | $90 per tonne CO2 |
| Disruption probability per leg | 0.002 + 0.06 x geo_risk^2 + 0.01 x congestion |
| Speed | sea 650 km/day, rail 750 km/day, air 9,000 km/day, plus about a day of handling per leg |
| Freight rate per kg per 1,000 km | sea $0.021, rail $0.060, air $0.55 |
| CO2 per tonne-km | sea 0.010, rail 0.022, road 0.062, air 0.600 kg |
| Worst-case measure | average of the worst 10% of simulated costs |
| Estimation error in the evaluation | lognormal, sigma 0.3 |

## Design choices

- The rules run in two stages. "Hazardous cargo can't fly" can be checked before simulating. "78% on time is not enough" needs the simulation first.
- The Pareto filter runs after the simulation, because on-time probability is one of the things being compared. In play-safe mode the worst-case cost is also compared, so a route that is only better in bad outcomes is kept.
- The random numbers in the simulation depend only on the route. When the confidence check or the tipping-point search changes an input, any change in the decision comes from that input and not from new random numbers.
- The LLM is optional and only rewrites the explanation text. It doesn't choose the route. If `GEMINI_API_KEY` is set, Gemini rewrites the text, and `validation_service.py` checks that every number and route name it uses appears in the optimizer output. If anything doesn't match, or the call fails, the plain text is shown instead.

## Limitations

- Synthetic data: the ports and distances are realistic, but rates, delay probabilities and risk levels are made up.
- The sea-lane network is coarse (63 waypoints), so distances are approximate.
- Direct sea is assumed to avoid the Red Sea on every lane.
- Delays are independent. A real port strike or storm affects many shipments at once.
- No capacity limits: any number of shipments can take the same flight or train.
- No re-routing during the voyage.
- The disruption formula and the 10% loss are assumptions, not estimated from data.

## With real data

The advisor needs four numbers per leg: delay probability, delay length, congestion and disruption risk. With historical shipments these could be predicted by a model (for example gradient boosting on lane, carrier, season and port congestion data), and the predictions would go into `simulation.py`. The rest of the pipeline would stay the same.

Other things I would add: shared capacity across shipments, correlated disruptions, re-routing during the voyage, and learning the profile settings from planners' past decisions.
