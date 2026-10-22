# 10 — Agents, auto-assignment & RBAC

**Roadmap:** P1.3 · **the reference app route:** `/agents` · **API:** `/api/agents`, `/api/organizations`
**wacrm gap:** manual/basic assignment; no routing methods, concurrency caps, SLA re-assign, or
module-level RBAC.

Reference only. Live trial, 2026-10-21 (`spec_agents_full.json`, screenshots `agents_add.png`,
`agents_settings.png`). The routing-method dropdown is documented from the product video (the live
toggle probe timed out before the method select rendered).

## 1. Agents list

Header cards: Total / Active / Inactive agents. Columns include an **Auto-assign** per-agent toggle.
Per-agent actions (video): deactivate, **edit**, **configure modules** (RBAC), **login as** (admin
impersonation for support), delete. "Unlimited agent accounts."

## 2. Add Agent (captured)

Fields: First Name, Last Name, Email, Password (min 8), Confirm Password → **Create Agent**.
(Agents are full sub-users under the org; `parentUserId` in `/api/user`.)

## 3. Settings — auto-assignment (captured + video)

Captured switches (toggle off state): **Auto assign chats to agents**, and **Unassign chat when the
24-hour window closes** ("moves the chat back to Unassigned instead of leaving it stuck").

With auto-assign **on**, the video documents:
- **Assignment method**: **Manual** (no auto) · **Round robin** (equal) · **Ratio / weight-based**
  (predefined weights) · **Less active** (to the agent with the lowest workload).
- **Inactivity timeout** — how long an inactive chat stays assigned before the fallback applies.
- **Fallback mode** — what happens when the assigned agent is unavailable/inactive (reassign).
- Per-agent **max concurrent chats** and **Auto-assign** toggle gate who is eligible.

## 4. RBAC (video)

Per-agent **module permissions** ("configure to control which module the agent can access") — a
checkbox matrix over the sidebar modules, edited from the agent's actions.

## 5. Mapping to this fork

- Extend `account_members` (nullable, additive): `is_online`, `max_concurrent_chats`,
  `last_assigned_at`, `auto_assign bool`, `module_permissions jsonb`.
- Add to `conversations`: `sla_response_due_at`, `reassigned_count`.
- Assignment on unassigned inbound: pick eligible online agent with
  `open_count < max_concurrent_chats` by method (round-robin = `last_assigned_at ASC NULLS FIRST`);
  set `sla_response_due_at = now() + inactivity_timeout`.
- Per-minute cron: reassign conversations past `sla_response_due_at`, excluding the timed-out agent.
- Enforce `module_permissions` in middleware/server actions and hide sidebar entries accordingly.
- The "unassign on 24h window close" behaviour is a small, high-value addition unique to the reference app.
