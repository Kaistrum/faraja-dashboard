# Faraja — Coordinator Dashboard

The stakeholder-facing dashboard for crisis coordinators and supervisors. Provides a real-time overview of active incidents, responder availability, and assignment progress — designed to help coordinators achieve the **48-hour response target**.

Built with **Next.js** and **Mantine**, the dashboard consumes the Faraja Backend API and adds AI-assisted features on top for smarter incident triage.

---

## Features

- **Incident map** — all active crisis reports plotted on a Leaflet map with automatic clustering
- **Responder management** — see who is available, their current assignments, and workload
- **Assignment dispatch** — assign responders to incidents directly from the dashboard
- **AI severity scoring** — Claude-powered weight suggestion system helps prioritise which incidents need fastest response
- **Photo viewer** — browse photos submitted with each crisis report
- **Statistics panel** — severity summary and breakdown by disaster type
- **Incident detail view** — full report data including AI-classified labels, location, and description
- **Authentication** — role-based access for coordinators and supervisors

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (src/ structure) |
| UI Library | Mantine 9 |
| Maps | Leaflet + react-leaflet + react-leaflet-cluster |
| Styling | Tailwind CSS v4 |
| Icons | Tabler Icons |
| AI | Anthropic SDK (Claude) — weight/scoring suggestions |

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Main dashboard — summary stats and map |
| `/incidents` | Full incident list and filterable map |
| `/responders` | Responder roster, availability, and assignments |
| `/scoring` | AI-assisted severity weight configuration |
| `/signin` | Coordinator authentication |

---

## Setup

### Prerequisites

- Node.js 20+
- A running [Faraja Backend API](../backend/README.md)
- An Anthropic API key (for the AI scoring feature)

### Local development

```bash
cd dashboard
npm install
```

Create a `.env.local` file:

```env
RAPIDA_API_BASE=http://localhost:8000/api
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
npm run dev
```

Open http://localhost:3050.

> The dashboard runs on port **3050** to avoid conflicts with the reporters app (3000) and responders app (3100).

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RAPIDA_API_BASE` | Yes | Base URL of the Faraja Backend API |
| `ANTHROPIC_API_KEY` | No | Claude API key — enables AI weight suggestions. Omit to disable. |

---

## API Routes

These Next.js API routes proxy to the Faraja Backend and Claude:

| Route | Method | Description |
|-------|--------|-------------|
| `/api/tasks` | `GET` | List all crisis report tasks |
| `/api/assignments` | `GET` | List all responder assignments |
| `/api/responders` | `GET` | List responders and their status |
| `/api/clusters` | `GET` | Map cluster data for incident visualisation |
| `/api/stats/severity-summary` | `GET` | Severity distribution statistics |
| `/api/photo/[id]` | `GET` | Retrieve a crisis report photo |
| `/api/ai/suggest-weights` | `POST` | Ask Claude to suggest severity scoring weights |

---

## The 48-Hour Response View

The dashboard is built around the goal of dispatching a responder to every crisis site within 48 hours of the report being submitted. Key UX decisions supporting this:

- High-severity and critical-priority incidents are highlighted at the top of all lists
- The incident map shows colour-coded pins by damage severity
- Assignments carry a visible `due_date` and the dashboard flags overdue assignments
- The AI scoring tool helps coordinators tune severity weights so the most urgent incidents always rank first

---

## AI Weight Suggestion

The `/scoring` page lets coordinators adjust how damage severity, disaster type, and humanitarian category contribute to an incident's overall priority score.

Clicking **Suggest Weights** sends the current incident distribution to Claude, which returns a recommended weighting and a plain-English rationale. Coordinators can accept, modify, or ignore the suggestion.

---

## Project Structure

```
dashboard/
├── src/
│   ├── pages/
│   │   ├── index.tsx                  # Main dashboard
│   │   ├── incidents.tsx              # Incident list + map
│   │   ├── responders.tsx             # Responder management
│   │   ├── scoring.tsx                # AI severity weighting
│   │   ├── signin.tsx                 # Authentication
│   │   └── api/
│   │       ├── tasks.ts               # Task list
│   │       ├── assignments.ts         # Assignments
│   │       ├── responders.ts          # Responder status
│   │       ├── clusters.ts            # Map clusters
│   │       ├── stats/severity-summary.ts
│   │       ├── photo/[id].ts          # Photo retrieval
│   │       └── ai/suggest-weights.ts  # Claude AI weights
│   ├── components/
│   │   ├── DashboardMap.tsx           # Main incident map
│   │   ├── Header.tsx                 # Navigation header
│   │   ├── IncidentDrawer.tsx         # Slide-in incident detail
│   │   └── SeverityBadge.tsx         # Colour-coded severity indicator
│   └── lib/
│       └── rapida.ts                  # Backend API client and type transforms
├── public/
├── next.config.ts
└── package.json
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (port 3050) |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
