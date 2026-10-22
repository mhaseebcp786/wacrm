-- ============================================================
-- SaaS Carousel: support carousel in messages and templates
-- Migration 90001 (high-offset SaaS namespace)
-- ============================================================

-- 1. Widen messages.content_type check constraint to include 'carousel'
DO $$
DECLARE
  -- Everything the CHECK allows right now, so a value that a future upstream
  -- migration adds before this one runs is kept, not silently dropped.
  allowed text[];
  -- What this migration adds.
  wanted  text[] := ARRAY['carousel'];
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

DO $$ BEGIN
  -- 2. Widen message_templates.header_type check constraint to include 'carousel'
  ALTER TABLE message_templates
    DROP CONSTRAINT IF EXISTS message_templates_header_type_check;

  ALTER TABLE message_templates
    ADD CONSTRAINT message_templates_header_type_check
    CHECK (header_type IN ('text', 'image', 'video', 'document', 'carousel'));
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

-- 3. Add carousel_cards column to message_templates for carousel template card data
ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS carousel_cards JSONB;

-- 4. Add comment
COMMENT ON COLUMN message_templates.carousel_cards IS
  'SaaS carousel template cards - array of CarouselTemplateCard objects. NULL for non-carousel templates.';
