# 06 — AI Agent (multi-provider, hours, handoff)

**Roadmap:** P0.5 · **the reference app route:** `/ai-agents` (`/ai-agents/create`) · **AI providers set in** `/settings` → AI
**wacrm gap:** wacrm has BYOK draft/auto-reply + RAG, but no typing-delay, active-hours, tone/length
persona controls, or a structured 5-step agent builder.

Reference only. Live trial, 2026-10-21 (5-step wizard; step 1 fully captured, steps 2–5 from the
product video + checklist). Agent creation was not submitted (no WABA to exercise it).

## 1. Five-step builder

`Create AI Agent — Step N of 5: Persona · Model · Knowledge · Safety · Settings`.
Right-side **Setup Checklist**: agent language configured, agent context complete, provider API key
configured (in workspace settings), fallback action & message set, handoff triggers & keywords defined.

### Step 1 — Persona (captured)
- **Agent Name** (required).
- **Primary Language** select: English, Hindi (हिन्दी), Hinglish, Spanish, French, Arabic, Tamil.
- **Multilingual Auto-Reply** toggle — "reply in the customer's native tongue".
- **Emoji Expressiveness** toggle — allow contextual emojis.
- **Agent Tone** select: Professional, Friendly, Formal, Casual, Empathetic.
- **Response Length** select: Short (1–2 lines), Medium, Detailed.
- **AI Instructions / System Persona** (required textarea) + "Load Professional Template".

### Step 2 — Model (video)
- **AI Provider**: Gemini (Google), ChatGPT (OpenAI), Claude (Anthropic).
- **Response speed / typing delay**: `instant`, `heuristic`, or `fixed` delay.

### Step 3 — Knowledge (video)
Build a knowledge base from **Text, URL, FAQs, Files** (RAG).

### Step 4 — Safety (video)
- Topics the agent **can** handle vs topics to **avoid**.
- **Human-handoff keywords**.
- **Fallback action**: send a fallback message, or escalate to a human and disable the AI for that chat.

### Step 5 — Settings (video)
- Active / Paused.
- Conversation **history length** to remember.
- **Idle session timeout**.
- **Auto-reply for new conversations** toggle.
- **Restrict business hours** — AI answers only inside (or only outside) configured hours.

## 2. Provider credentials (`/settings` → AI)

Providers are connected once per workspace: "Add provider" → choose ChatGPT / Gemini / Claude →
paste API key. The AI Agent references these workspace providers (checklist item "API key is
configured in settings"). This fork already stores encrypted per-account provider keys — reuse that.

## 3. Mapping to this fork

- Extend the existing AI settings/assistant with: provider = Gemini added alongside OpenAI/Anthropic;
  `typing_delay_mode` (instant/heuristic/fixed) + send Meta typing indicator + read receipt on inbound;
  `active_hours` (start/end/timezone) and in-hours vs out-of-hours mode; persona fields (tone,
  length, language, multilingual, emoji); handoff keywords; fallback action.
- Sidecar `saas_ai_agents(account_id, name, language, multilingual, emoji, tone, response_length,
  system_prompt, provider, response_speed, knowledge jsonb, allowed_topics, avoided_topics,
  handoff_keywords text[], fallback_action, active, history_window, idle_timeout, auto_reply_new,
  business_hours jsonb)`.
- Typing indicator: on inbound destined for the bot, `POST /{phone_number_id}/messages` with
  `status:"read"` + `typing_indicator:{type:"text"}`, then wait `typing_delay_ms` (roadmap P0.5).
- Voice-note transcription (roadmap): fetch audio media, transcribe (Whisper/Gemini), feed RAG.
