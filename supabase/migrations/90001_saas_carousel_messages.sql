-- ============================================================
-- SaaS Carousel: support carousel in messages and templates
-- Migration 90001 (high-offset SaaS namespace)
-- ============================================================

DO $$ BEGIN
  -- 1. Widen messages.content_type check constraint to include 'carousel'
  ALTER TABLE messages
    DROP CONSTRAINT IF EXISTS messages_content_type_check;

  ALTER TABLE messages
    ADD CONSTRAINT messages_content_type_check
    CHECK (content_type IN (
      'text', 'image', 'document', 'audio', 'video',
      'location', 'template', 'interactive', 'carousel'
    ));

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
