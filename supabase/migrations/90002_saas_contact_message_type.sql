-- ============================================================
-- SaaS shared message object: allow 'contact' in messages.content_type
-- Migration 90002 (high-offset SaaS namespace)
--
-- The shared message object (src/saas/lib/messages) has nine types; its
-- 'contact' type (a Meta `contacts` message) is stored with
-- content_type = 'contact'. Every other type already maps to an allowed
-- value ('text', 'image', 'video', 'audio', 'document', 'location',
-- 'interactive', 'carousel'), so this is the only value that must be added.
--
-- Must run AFTER 90001 (which last widened this CHECK to add 'carousel');
-- the list below is that list plus 'contact'. Idempotent: the constraint is
-- dropped and re-created by name, like 010 and 90001 did.
-- ============================================================

DO $$
DECLARE
  -- Everything the CHECK allows right now, so a value that a future upstream
  -- migration adds before this one runs is kept, not silently dropped.
  allowed text[];
  -- What this migration adds.
  wanted  text[] := ARRAY['contact'];
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
