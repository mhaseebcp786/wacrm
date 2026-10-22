-- ============================================================
-- SaaS Suggested Replies: saas_quick_replies + 'rich_interactive' content type
-- Migration 90003 (high-offset SaaS namespace)
--
--   1. saas_quick_replies — a saved reply is a name plus a shared message
--      object ({ message_type, payload }; src/saas/lib/messages). It extends
--      upstream's `quick_replies` (035, text + reply-button/list only) to
--      all nine message types. The upstream table is left untouched: the
--      list endpoint merges both, and editing an upstream row in the new
--      editor moves it here.
--   2. messages.content_type gains 'rich_interactive' — how a sent interactive
--      message the upstream buttons/list sender cannot express is stored (a
--      URL button, or reply buttons with an image/video/document header). Its
--      payload lives in messages.interactive_payload; the fork's inbox bubble
--      draws it, other readers fall back to content_text.
--
-- Must run AFTER 90002 (which last widened the content_type CHECK to add
-- 'contact'); the list below is that list plus 'rich_interactive'. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS saas_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Tenancy. Every member of the account shares its replies.
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Author / audit only — never used for tenancy isolation.
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 100),
  message_type TEXT NOT NULL CHECK (message_type IN (
    'text', 'interactive', 'image', 'video', 'audio',
    'document', 'carousel', 'location', 'contact'
  )),
  -- The Meta send body minus the recipient, validated app-side by
  -- validateQuickReplyMessage before it is stored.
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_quick_replies_account
  ON saas_quick_replies(account_id, created_at DESC);

ALTER TABLE saas_quick_replies ENABLE ROW LEVEL SECURITY;

-- Same model as upstream quick_replies (035): any member can read,
-- agent+ can create / edit / delete.
DROP POLICY IF EXISTS saas_quick_replies_select ON saas_quick_replies;
DROP POLICY IF EXISTS saas_quick_replies_insert ON saas_quick_replies;
DROP POLICY IF EXISTS saas_quick_replies_update ON saas_quick_replies;
DROP POLICY IF EXISTS saas_quick_replies_delete ON saas_quick_replies;
CREATE POLICY saas_quick_replies_select ON saas_quick_replies FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY saas_quick_replies_insert ON saas_quick_replies FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY saas_quick_replies_update ON saas_quick_replies FOR UPDATE
  USING (is_account_member(account_id, 'agent'));
CREATE POLICY saas_quick_replies_delete ON saas_quick_replies FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON saas_quick_replies;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON saas_quick_replies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$
DECLARE
  -- Everything the CHECK allows right now, so a value that a future upstream
  -- migration adds before this one runs is kept, not silently dropped.
  allowed text[];
  -- What this migration adds.
  wanted  text[] := ARRAY['rich_interactive'];
  -- The floor: values earlier migrations (001, 010, 90001, 90002) set.
  floor_  text[] := ARRAY[
    'text', 'image', 'document', 'audio', 'video',
    'location', 'template', 'interactive', 'carousel', 'contact'
  ];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT m[1]), ARRAY[]::text[])
    INTO allowed
    FROM pg_constraint c,
         LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conname = 'messages_content_type_check'
     AND c.conrelid = 'public.messages'::regclass;

  allowed := ARRAY(
    SELECT DISTINCT v FROM unnest(allowed || wanted || floor_) AS v ORDER BY v
  );

  ALTER TABLE messages
    DROP CONSTRAINT IF EXISTS messages_content_type_check;

  EXECUTE format(
    'ALTER TABLE messages ADD CONSTRAINT messages_content_type_check CHECK (content_type IN (%s))',
    (SELECT string_agg(quote_literal(v), ', ') FROM unnest(allowed) AS v)
  );
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;
