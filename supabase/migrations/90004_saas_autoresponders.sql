-- ============================================================
-- SaaS Welcome & Away Messages (the "autoresponder")
-- Migration 90004 (high-offset SaaS namespace)
--
--   1. saas_autoresponders — a rule is a name plus a shared message object
--      ({ message_type, payload }; src/saas/lib/messages) plus WHEN to send it:
--        send_when = 'first_message'     the customer's very first message
--        send_when = 'after_inactivity'  their first message, and again when
--                                        they come back after interval_days
--                                        days of silence ("welcome back")
--        send_when = 'every_n_days'      any message, at most once every
--                                        interval_days days (an away note)
--      optionally limited to ISO weekdays (1 = Monday … 7 = Sunday) and an
--      HH:MM window (inclusive, may run overnight) read in an IANA time zone.
--      Read-only for members: rules are written by the API (service role).
--   2. saas_autoresponder_sends — which rule answered which conversation and
--      when. The webhook claims a row here before sending, so two customer
--      messages processed at the same moment cannot both trigger the same
--      rule. Written by the service role only (RLS on, no policies).
--
-- Sidecar tables: no upstream table is altered. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS saas_autoresponders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Tenancy. Every member of the account shares its rules.
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Author / audit only — never used for tenancy isolation.
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 100),
  message_type TEXT NOT NULL CHECK (message_type IN (
    'text', 'interactive', 'image', 'video', 'audio',
    'document', 'carousel', 'location', 'contact'
  )),
  -- The Meta send body minus the recipient, validated app-side by
  -- validateAutoresponder before it is stored.
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  send_when TEXT NOT NULL,
  interval_days INTEGER,
  schedule_days SMALLINT[],
  schedule_from TEXT,
  schedule_to TEXT,
  timezone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The row rules are (re)created by name on every run, not inline above, so a
-- database that already has an earlier version of this table converges to
-- the current rules (CREATE TABLE IF NOT EXISTS would keep the old ones).
ALTER TABLE saas_autoresponders
  DROP CONSTRAINT IF EXISTS saas_autoresponders_send_when_check;
ALTER TABLE saas_autoresponders
  ADD CONSTRAINT saas_autoresponders_send_when_check
  CHECK (send_when IN ('first_message', 'after_inactivity', 'every_n_days'));

-- A day count is required for (and only for) the two kinds that have one.
ALTER TABLE saas_autoresponders
  DROP CONSTRAINT IF EXISTS saas_autoresponders_interval_check;
ALTER TABLE saas_autoresponders
  ADD CONSTRAINT saas_autoresponders_interval_check CHECK (
    (send_when IN ('after_inactivity', 'every_n_days')
       AND interval_days IS NOT NULL
       AND interval_days BETWEEN 1 AND 90)
    OR (send_when = 'first_message' AND interval_days IS NULL)
  );

-- A schedule is all four columns or none of them.
ALTER TABLE saas_autoresponders
  DROP CONSTRAINT IF EXISTS saas_autoresponders_schedule_check;
ALTER TABLE saas_autoresponders
  ADD CONSTRAINT saas_autoresponders_schedule_check CHECK (
    (schedule_days IS NULL AND schedule_from IS NULL
       AND schedule_to IS NULL AND timezone IS NULL)
    OR (schedule_days IS NOT NULL
       AND schedule_from IS NOT NULL
       AND schedule_to IS NOT NULL
       AND timezone IS NOT NULL
       AND cardinality(schedule_days) BETWEEN 1 AND 7
       AND schedule_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
       AND schedule_from ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       AND schedule_to ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       AND schedule_from <> schedule_to
       AND btrim(timezone) <> '')
  );

CREATE INDEX IF NOT EXISTS idx_saas_autoresponders_account
  ON saas_autoresponders(account_id, created_at DESC);

ALTER TABLE saas_autoresponders ENABLE ROW LEVEL SECURITY;

-- Any member can READ the rules. There are deliberately NO write policies:
-- the API routes write with the service role after checking the agent role
-- and validating the rule (Flow buttons, tokens in links…). A write policy
-- would let any agent bypass that through PostgREST, or spoof `user_id`.
-- Earlier versions of this migration created write policies; drop them.
DROP POLICY IF EXISTS saas_autoresponders_select ON saas_autoresponders;
DROP POLICY IF EXISTS saas_autoresponders_insert ON saas_autoresponders;
DROP POLICY IF EXISTS saas_autoresponders_update ON saas_autoresponders;
DROP POLICY IF EXISTS saas_autoresponders_delete ON saas_autoresponders;
CREATE POLICY saas_autoresponders_select ON saas_autoresponders FOR SELECT
  USING (is_account_member(account_id));

DROP TRIGGER IF EXISTS set_updated_at ON saas_autoresponders;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON saas_autoresponders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS saas_autoresponder_sends (
  autoresponder_id UUID NOT NULL
    REFERENCES saas_autoresponders(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL
    REFERENCES conversations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (autoresponder_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_saas_autoresponder_sends_account
  ON saas_autoresponder_sends(account_id);

-- The webhook asks "what has answered THIS conversation" on every inbound
-- message; the primary key leads with autoresponder_id, so it needs its own.
CREATE INDEX IF NOT EXISTS idx_saas_autoresponder_sends_conversation
  ON saas_autoresponder_sends(conversation_id);

-- Internal bookkeeping for the inbound webhook (service role). RLS on with
-- no policies: members and anonymous callers can neither read nor write it.
ALTER TABLE saas_autoresponder_sends ENABLE ROW LEVEL SECURITY;
