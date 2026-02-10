# Agent Dashboard

A **Kanban-style control room** for AI assistants. Tracks tasks, deliverables, schedules, and activity logs with **automatic status** driven by OpenClaw events. Built for OpenClaw and designed to run behind **Tailscale Serve** at `/agent`.

> This README is a **complete handoff**. Someone with zero context should be able to: **run it, connect an agent, and keep the dashboard updated**.

---

## What This App Does

- **Kanban board** (To Do / Blocked / In Progress / Done / Archived)
- **Deliverables** grid
- **Upcoming Work** synced from OpenClaw cron jobs
- **Activity rail** (Actions by default; System/Status behind ⚙️)
- **Automatic status** driven by gateway events (no manual status API)
- **Read‑only UI for humans** (agents write via API)

---

## Quick Start (Local + Tailscale HTTPS)

> Requires **Node 18+**, **Tailscale**, and **OpenClaw** running.

### 1) Install + Run
```bash
cd agent-dashboard/apps/web
npm install
npm run dev
```

**Custom port** (default is 3000):
```bash
# Via environment variable
PORT=3900 npm run dev

# Or via CLI flag
npm run dev -- --port 3900
```

Optional (keep running after shell closes):
```bash
PORT=3900 nohup npm run dev >/tmp/agent-dashboard-dev.log 2>&1 &
```

**Production build (only if you need it):**
```bash
npm run build
PORT=3900 npm run start
```

### 2) Ensure basePath is `/agent`
`apps/web/next.config.ts`:
```ts
const nextConfig = {
  basePath: "/agent",
  assetPrefix: "/agent/",
};
```

### 3) Configure Tailscale Serve
```bash
tailscale serve reset
# OpenClaw Gateway UI (18789)
tailscale serve --bg --set-path / 18789
# Agent dashboard (Next.js, basePath /agent) — adjust port if changed
tailscale serve --bg --set-path /agent http://127.0.0.1:3000/agent

tailscale serve status
```

### 4) Open the Dashboard
```
https://<your-tailnet-host>.ts.net/agent
```

---

## Connect to OpenClaw

Open the **Connect OpenClaw** modal in the UI and set:
- **Gateway URL**: `https://<your-tailnet-host>.ts.net`
- **Token**: gateway token
- **Session Key**: usually `agent:main:main`

### Pairing (first time only)
```bash
openclaw devices list --json
openclaw devices approve <requestId>
```

---

## Demo Mode (for screenshots)

- A **Demo Mode** button appears **only when there are no real tasks**.
- Clicking it loads **fixture data** from `apps/web/app/demo-data.json`.
- A toast appears: “Demo mode enabled — showing fixture data.”

> This only touches the JSON fixture, not your real SQLite data.

---

## Agent Instructions (copy/paste prompt)

If a user gives this repo to an agent, the agent should be told to:

```
1) Run the dashboard (npm run dev) and serve via Tailscale at /agent. Use PORT=<port> if 3000 is taken.
2) Connect to OpenClaw via the UI (Gateway URL + Token + Session Key).
3) Use the dashboard API for tasks/deliverables/schedules.
4) Always log notable outputs in the Action Log with format:
   "Project — Verb + Output" (e.g., "Aurora — Drafted ingestion spec").
5) Keep task status accurate: todo → in_progress → done.
6) Log a Deliverable for every concrete output (docs, plans, screenshots, PRs).
```

---

## Action Log Style Guide (MANDATORY)

Action Log entries must be **output‑focused and human‑readable**.

✅ **Good:**
- "Aurora — Drafted ingestion spec"
- "Harbor — Created launch outline"
- "Agent Dashboard — Added demo mode"

❌ **Bad:**
- "Working"
- "Thinking"
- "Ping"

---

## How Status Works

Status is **event‑driven** (no manual updates):
- First `agent` event after idle → `reading` (3s) → `working`
- `chat.final` → `replied`

States used: `reading`, `working`, `replied`, `idle`, `error`, `unknown`

---

## REST API (Agent‑Facing)

Base URL when served at `/agent`:
```
https://<your-tailnet-host>.ts.net/agent/api
```

### Tasks
```bash
curl https://<host>.ts.net/agent/api/tasks
curl -X POST https://<host>.ts.net/agent/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Design data model","project":"Aurora","status":"todo","priority":1,"description":"..."}'
```

### Deliverables
```bash
curl https://<host>.ts.net/agent/api/deliverables
```

### Events (Action Log)
```bash
curl "https://<host>.ts.net/agent/api/events?limit=100"
```

---

## FAQ

**Q: Do I need HTTPS?**
Yes. Use Tailscale Serve or localhost. The control UI requires a secure context.

**Q: Why does `/agent` 404?**
Check basePath and Tailscale proxy config.

**Q: The UI says “Disconnected.”**
Open Connect modal and set Gateway URL + Token + Session Key. Pair if needed.

**Q: Can I demo without real data?**
Yes. Clear tasks and toggle Demo Mode to load fixtures.

**Q: How do I keep agents compliant with Action Logs?**
Include the Action Log instructions in your agent prompt (see above).

---

## File Map

- `apps/web/app/page.tsx` — UI + websocket status logic
- `apps/web/app/api/*` — REST API routes (tasks/deliverables/notes/events/schedules)
- `apps/web/app/lib/db.ts` — SQLite schema + helpers
- `apps/web/app/opclaw-ws.ts` — OpenClaw WS connect + signing
- `apps/web/next.config.ts` — basePath + assetPrefix
- `apps/web/app/demo-data.json` — demo fixtures

---

## License

Open source.
