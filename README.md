# Lumen — inference fleet console

A live operations dashboard for a (simulated) fleet of AI models, built with **Next.js 16 (App Router)**, **TypeScript** and **Tailwind CSS v4**, and deployed on **Vercel**.

Traffic is simulated in the browser once a second; everything you do — taking a model offline, shifting traffic weight, lowering an alert limit — feeds back into the simulation, so latency, errors, the routing map and alerts all react to your changes.

## Features

| Area | What it does |
| --- | --- |
| **Routing map** | Canvas animation of requests flowing from the router to each model. Particle rate follows each model's real share of traffic; failed requests are drawn in coral; node colour shows health against your limits. Respects `prefers-reduced-motion`. |
| **Telemetry chart** | SVG chart of served vs. demanded req/s and fleet p95 latency with your latency limit overlaid. 1/2/4-minute windows, hover or tap for exact readings, pause/resume. |
| **Readouts** | Throughput, p95, error rate and models serving, with change versus a minute ago. |
| **Models** | Sortable, searchable table (cards on mobile). Toggle models online/offline and set traffic weights; overloaded models slow down and start failing. Settings persist in `localStorage`. |
| **Alerts** | Raised when a model crosses your p95 or error-rate limits, with a 30-second cooldown. Acknowledge individually or all at once. |
| **Ops assistant** | Chat panel backed by `POST /api/assistant`. The server reads a snapshot of the fleet, answers questions ("which model is slowest?") and returns actions ("take Vega offline", "rebalance", "set latency limit to 700 ms") that the client applies. Rule-based — no API key or external model needed. |
| **Cost planner** | Estimates tokens for a prompt and compares monthly cost across models for a given reply length and daily volume. |
| **Command menu** | `⌘K` / `Ctrl+K`: jump to sections, pause the stream, export readings as CSV, toggle models, reset the fleet. |
| **Health check** | `GET /api/health` reports server time, Vercel region and commit; the sidebar shows round-trip time. |

## Getting started

```bash
npm install
npm run dev       # http://localhost:3000
```

Other scripts:

```bash
npm run lint      # ESLint (next/core-web-vitals + TypeScript)
npm run build     # production build
npm start         # serve the production build
```

Requires Node.js 20.9 or later. Dependencies are pinned to exact versions in `package.json`, so a fresh `npm install` reproduces the tested build.

## Environment variables

None are required. The app reads the following **optional** variables that Vercel sets automatically, purely for display on the health endpoint:

- `VERCEL_REGION`
- `VERCEL_ENV`
- `VERCEL_GIT_COMMIT_SHA`

No secrets or API keys are used or committed; `.env*` files are git-ignored.

## API

### `POST /api/assistant`

```json
{ "message": "which model is slowest?", "snapshot": { "models": [...], "totals": {...}, "thresholds": {...}, "openAlerts": 0 } }
```

Returns `{ "reply": string, "actions": AssistantAction[] }`. Input is validated (message ≤ 500 characters, ≤ 20 models); malformed requests get a `400` with an explanation.

### `GET /api/health`

Returns `{ status, time, region, environment, commit }`, never cached.

## Project structure

```
src/
  app/
    api/assistant/route.ts   assistant endpoint
    api/health/route.ts      health endpoint
    layout.tsx               fonts, metadata
    page.tsx                 renders the dashboard
    globals.css              Tailwind theme tokens
  components/                dashboard UI (map, chart, table, alerts, assistant, planner, command menu)
  hooks/                     useFleet (simulation + persistence), useServerHealth
  lib/                       simulation reducer, assistant engine, token/cost maths, types
```

## Deployment

The project deploys to Vercel with zero configuration: framework preset **Next.js**, build command `next build`, output handled automatically. Every push to `main` triggers a production deployment.

Fonts (Sora and Unbounded) are self-hosted from npm packages via `next/font/local`, so builds don't depend on Google Fonts being reachable.

## Notes

Model names, prices and capacities are fictional and for demonstration only.
