# 16 — Flow Builder (visual conversation flows)

**Roadmap:** bonus (adjacent to P0.2 / P1.1) · **LeminAi route:** `/flow-builder` · **API:** `/api/flows`
**wacrm context:** wacrm already has a visual automation / chat-flow builder; this documents
LeminAi's for parity comparison.

Reference only. From the live trial sidebar (`/flow-builder` is a heavy canvas app; structure below
is from the product video — the canvas was not deep-driven on the trial).

## 1. What it is

A visual, node-based builder for **multi-step WhatsApp conversations**: a trigger starts the flow,
then message/question/logic nodes branch based on the customer's button/list choices. Distinct from
**Forms** ([07](07-forms-flows.md), native Meta Flow forms) — this is a CRM-side conversation engine
that *sends* messages (including the shared message object) and reacts to replies.

## 2. Structure (video)

- **Create flow**: name, description, **auto-exit inactive session time** (1h–72h or Never).
- **Trigger node** at the start — configurable trigger type (keyword, etc.).
- **Nodes** (right-hand palette): Text / Image / Video / Audio / Document message; **Delay**
  (e.g. 30s); **Quick question** (collect input); **Conditional path** (branch on conditions);
  **API request**; **Lead-up / contact lookup**. Connect nodes to form the journey.
- **Validate** then **Save flow**.

## 3. Mapping to this fork

wacrm's existing flow/automation builder likely covers most of this. Gap items worth comparing:
per-flow **auto-exit inactive timeout**, **API-request** and **contact-lookup** nodes, and the
**conditional path** branching on button/list replies. If the shared message object (from
[01](01-suggested-replies.md)) is implemented, flow message nodes should emit it directly.
Spec/comparison only — no implementation here.
