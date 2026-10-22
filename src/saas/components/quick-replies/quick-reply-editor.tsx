'use client';

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { InteractiveBuilder } from '@/components/interactive/interactive-builder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { uploadAccountMedia } from '@/lib/storage/upload-media';
import { INTERACTIVE_LIMITS } from '@/lib/whatsapp/meta-api';
import { CarouselInteractiveEditor } from '@/saas/components/carousel-interactive-editor';
import { TemplateHeaderMediaInput } from '@/saas/components/template-header-media-input';
import { AUDIO_EXTENSIONS, MESSAGE_LIMITS } from '@/saas/lib/messages/limits';
import {
  EDITOR_TYPES,
  type EditorState,
  type HeaderKind,
  type InteractiveKind,
  type MediaFields,
  type MediaHeaderKind,
} from '@/saas/lib/quick-replies/editor-state';
import { getExtension } from '@/saas/lib/whatsapp/media-specs';
import { ContactEditor } from './contact-editor';
import { TokenInsertBar, useTokenInsert } from './token-insert';

const AUDIO_MAX_BYTES = 16 * 1024 * 1024;

interface QuickReplyEditorProps {
  value: EditorState;
  /**
   * A state setter: the carousel editor updates functionally (an upload
   * finishing must not overwrite edits made meanwhile), so a plain callback
   * taking a value would lose those.
   */
  onChange: Dispatch<SetStateAction<EditorState>>;
  /** Show the carousel editor's inline validation (after a save attempt). */
  showIssues?: boolean;
}

type MediaKey = 'image' | 'video' | 'document' | 'audio';
type SetFn = <K extends keyof EditorState>(key: K, v: EditorState[K]) => void;

/**
 * Per-type form for a suggested reply. Controlled: the parent owns the
 * state (see `editor-state.ts`) and derives the preview and the stored
 * message from it. Switching the type tab keeps what was typed for the
 * other types.
 */
export function QuickReplyEditor({
  value,
  onChange,
  showIssues = false,
}: QuickReplyEditorProps) {
  const t = useTranslations('SaasQuickReplies');
  const { rootRef, onFocusCapture, insert } = useTokenInsert();
  const set: SetFn = (key, v) => onChange((prev) => ({ ...prev, [key]: v }));
  // Functional, so an upload finishing late patches the latest fields (a
  // caption typed meanwhile survives) instead of restoring a stale copy.
  const patchMedia = (key: MediaKey, patch: Partial<MediaFields>) =>
    onChange((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  return (
    <div ref={rootRef} onFocusCapture={onFocusCapture} className="space-y-4">
      <div>
        <Label className="text-muted-foreground mb-1.5 block text-xs">
          {t('typeLabel')}
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {EDITOR_TYPES.map((type) => (
            <TypeChip
              key={type}
              active={value.type === type}
              label={t(`types.${type}`)}
              onClick={() => set('type', type)}
            />
          ))}
        </div>
      </div>

      {/* Name / phone go into whichever text field was last focused. */}
      {value.type !== 'audio' && <TokenInsertBar onInsert={insert} />}

      {value.type === 'text' && <TextForm value={value} set={set} />}
      {value.type === 'interactive' && (
        <InteractiveForm value={value} set={set} />
      )}
      {(value.type === 'image' ||
        value.type === 'video' ||
        value.type === 'document') && (
        <MediaForm
          kind={value.type}
          fields={value[value.type]}
          onPatch={(patch) => patchMedia(value.type as MediaKey, patch)}
        />
      )}
      {value.type === 'audio' && (
        <AudioForm
          fields={value.audio}
          onPatch={(patch) => patchMedia('audio', patch)}
        />
      )}
      {value.type === 'carousel' && (
        <CarouselInteractiveEditor
          value={value.carousel}
          onChange={(update) =>
            onChange((prev) => ({
              ...prev,
              carousel:
                typeof update === 'function' ? update(prev.carousel) : update,
            }))
          }
          showIssues={showIssues}
        />
      )}
      {value.type === 'location' && <LocationForm value={value} set={set} />}
      {value.type === 'contact' && (
        <ContactEditor
          contacts={value.contacts}
          onUpdate={(change) =>
            onChange((prev) => ({ ...prev, contacts: change(prev.contacts) }))
          }
        />
      )}
    </div>
  );
}

function TypeChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-muted text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  hint,
  counter,
  children,
}: {
  label: string;
  hint?: string;
  counter?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-muted-foreground text-xs">{label}</Label>
        {counter ? (
          <span className="text-muted-foreground text-[11px]">{counter}</span>
        ) : null}
      </div>
      {children}
      {hint ? (
        <p className="text-muted-foreground text-[11px]">{hint}</p>
      ) : null}
    </div>
  );
}

// ---- Text -------------------------------------------------------------

function TextForm({ value, set }: { value: EditorState; set: SetFn }) {
  const t = useTranslations('SaasQuickReplies');
  const { body } = value.text;
  return (
    <Field
      label={t('text.label')}
      counter={`${body.length}/${MESSAGE_LIMITS.textBodyMaxLength}`}
    >
      <Textarea
        value={body}
        maxLength={MESSAGE_LIMITS.textBodyMaxLength}
        onChange={(e) => set('text', { body: e.target.value })}
        placeholder={t('text.placeholder')}
        className="bg-muted text-foreground min-h-32"
      />
    </Field>
  );
}

// ---- Headers (media for reply buttons / link buttons) -------------------

const MEDIA_KINDS: MediaHeaderKind[] = ['image', 'video', 'document'];

function HeaderKindChips({
  kinds,
  value,
  onChange,
}: {
  kinds: HeaderKind[];
  value: HeaderKind;
  onChange: (k: HeaderKind) => void;
}) {
  const t = useTranslations('SaasQuickReplies.header');
  return (
    <div className="flex flex-wrap gap-1.5">
      {kinds.map((k) => (
        <TypeChip
          key={k}
          active={value === k}
          label={t(k)}
          onClick={() => onChange(k)}
        />
      ))}
    </div>
  );
}

// ---- Interactive ------------------------------------------------------

function InteractiveForm({ value, set }: { value: EditorState; set: SetFn }) {
  const t = useTranslations('SaasQuickReplies');
  const kinds: InteractiveKind[] = ['reply', 'cta'];
  const cta = value.cta;
  const setCta = (patch: Partial<EditorState['cta']>) =>
    set('cta', { ...cta, ...patch });
  const replyMedia = value.replyMedia;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {kinds.map((k) => (
          <TypeChip
            key={k}
            active={value.interactiveKind === k}
            label={t(`interactiveKinds.${k}`)}
            onClick={() => set('interactiveKind', k)}
          />
        ))}
      </div>

      {value.interactiveKind === 'reply' ? (
        <>
          <InteractiveBuilder
            value={value.reply}
            onChange={(p) => set('reply', p)}
            showPreview={false}
          />
          {value.reply.kind === 'buttons' && (
            <div className="border-border space-y-2 rounded-lg border p-3">
              <Label className="text-muted-foreground text-xs">
                {t('header.replyMediaLabel')}
              </Label>
              <HeaderKindChips
                kinds={['none', ...MEDIA_KINDS]}
                value={replyMedia.kind}
                onChange={(k) =>
                  set('replyMedia', {
                    kind: k as 'none' | MediaHeaderKind,
                    link: replyMedia.link,
                  })
                }
              />
              {replyMedia.kind !== 'none' && (
                <TemplateHeaderMediaInput
                  headerType={replyMedia.kind}
                  value={replyMedia.link}
                  onChange={(link) =>
                    set('replyMedia', { kind: replyMedia.kind, link })
                  }
                  label={t(`media.${replyMedia.kind}Label`)}
                />
              )}
              <p className="text-muted-foreground text-[11px]">
                {t('header.replyMediaHint')}
              </p>
              {replyMedia.kind !== 'none' && value.reply.header?.trim() && (
                <p className="text-[11px] text-amber-500">
                  {t('header.replyMediaOverrides')}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">
              {t('header.label')}
            </Label>
            <HeaderKindChips
              kinds={['none', 'text', ...MEDIA_KINDS]}
              value={cta.headerKind}
              onChange={(headerKind) => setCta({ headerKind })}
            />
            {cta.headerKind === 'text' && (
              <Field
                label={t('header.text')}
                counter={`${cta.headerText.length}/${INTERACTIVE_LIMITS.headerTextMaxLength}`}
              >
                <Input
                  value={cta.headerText}
                  maxLength={INTERACTIVE_LIMITS.headerTextMaxLength}
                  onChange={(e) => setCta({ headerText: e.target.value })}
                  className="bg-muted text-foreground"
                />
              </Field>
            )}
            {cta.headerKind !== 'none' && cta.headerKind !== 'text' && (
              <TemplateHeaderMediaInput
                headerType={cta.headerKind}
                value={cta.headerLink}
                onChange={(headerLink) => setCta({ headerLink })}
                label={t(`media.${cta.headerKind}Label`)}
              />
            )}
          </div>
          <Field
            label={t('cta.body')}
            counter={`${cta.body.length}/${INTERACTIVE_LIMITS.bodyMaxLength}`}
          >
            <Textarea
              value={cta.body}
              maxLength={INTERACTIVE_LIMITS.bodyMaxLength}
              onChange={(e) => setCta({ body: e.target.value })}
              className="bg-muted text-foreground min-h-24"
            />
          </Field>
          <Field
            label={t('cta.footer')}
            counter={`${cta.footer.length}/${INTERACTIVE_LIMITS.footerMaxLength}`}
          >
            <Input
              value={cta.footer}
              maxLength={INTERACTIVE_LIMITS.footerMaxLength}
              onChange={(e) => setCta({ footer: e.target.value })}
              className="bg-muted text-foreground"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t('cta.displayText')}
              counter={`${cta.displayText.length}/${INTERACTIVE_LIMITS.buttonTitleMaxLength}`}
            >
              <Input
                value={cta.displayText}
                maxLength={INTERACTIVE_LIMITS.buttonTitleMaxLength}
                onChange={(e) => setCta({ displayText: e.target.value })}
                className="bg-muted text-foreground"
              />
            </Field>
            <Field label={t('cta.url')}>
              <Input
                type="url"
                value={cta.url}
                onChange={(e) => setCta({ url: e.target.value })}
                placeholder="https://example.com"
                className="bg-muted text-foreground"
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Media ------------------------------------------------------------

function MediaForm({
  kind,
  fields,
  onPatch,
}: {
  kind: 'image' | 'video' | 'document';
  fields: MediaFields;
  onPatch: (patch: Partial<MediaFields>) => void;
}) {
  const t = useTranslations('SaasQuickReplies');
  return (
    <div className="space-y-3">
      <TemplateHeaderMediaInput
        headerType={kind}
        value={fields.link}
        onChange={(link) => onPatch({ link })}
        label={t(`media.${kind}Label`)}
      />
      {kind === 'document' && (
        <Field label={t('media.filename')} hint={t('media.filenameHint')}>
          <Input
            value={fields.filename}
            maxLength={MESSAGE_LIMITS.documentFilenameMaxLength}
            onChange={(e) => onPatch({ filename: e.target.value })}
            className="bg-muted text-foreground"
          />
        </Field>
      )}
      <Field
        label={t('media.caption')}
        counter={`${fields.caption.length}/${MESSAGE_LIMITS.captionMaxLength}`}
        hint={t('media.captionHint')}
      >
        <Textarea
          value={fields.caption}
          maxLength={MESSAGE_LIMITS.captionMaxLength}
          onChange={(e) => onPatch({ caption: e.target.value })}
          className="bg-muted text-foreground min-h-20"
        />
      </Field>
    </div>
  );
}

function AudioForm({
  fields,
  onPatch,
}: {
  fields: MediaFields;
  onPatch: (patch: Partial<MediaFields>) => void;
}) {
  const t = useTranslations('SaasQuickReplies');
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  // An upload that finishes after the form is gone (dialog closed, a new
  // draft opened) must not write into whatever replaced it.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploadingRef.current) return;
    const ext = getExtension(file.name);
    if (!ext || !(AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
      toast.error(
        t('media.audioFormat', {
          formats: AUDIO_EXTENSIONS.join(', ').toUpperCase(),
        })
      );
      return;
    }
    if (file.size > AUDIO_MAX_BYTES) {
      toast.error(t('media.audioTooLarge', { max: 16 }));
      return;
    }
    uploadingRef.current = true;
    setBusy(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      if (!mountedRef.current) return;
      onPatch({ link: publicUrl });
      toast.success(t('media.uploaded'));
    } catch (err) {
      if (mountedRef.current) {
        toast.error(
          err instanceof Error ? err.message : t('media.uploadFailed')
        );
      }
    } finally {
      uploadingRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <Field label={t('media.audioLabel')} hint={t('media.audioHint')}>
      <div className="flex gap-2">
        <Input
          type="url"
          value={fields.link}
          disabled={busy}
          onChange={(e) => onPatch({ link: e.target.value })}
          placeholder="https://example.com/voice-note.ogg"
          className="bg-muted text-foreground flex-1"
        />
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={pick}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="mr-1.5 h-3.5 w-3.5" />
          )}
          {busy ? t('media.uploading') : t('media.upload')}
        </Button>
      </div>
    </Field>
  );
}

// ---- Location ---------------------------------------------------------

function LocationForm({ value, set }: { value: EditorState; set: SetFn }) {
  const t = useTranslations('SaasQuickReplies');
  const l = value.location;
  const setLoc = (patch: Partial<EditorState['location']>) =>
    set('location', { ...l, ...patch });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('location.latitude')} hint={t('location.latitudeHint')}>
          <Input
            inputMode="decimal"
            value={l.latitude}
            onChange={(e) => setLoc({ latitude: e.target.value })}
            placeholder="12.9716"
            className="bg-muted text-foreground"
          />
        </Field>
        <Field
          label={t('location.longitude')}
          hint={t('location.longitudeHint')}
        >
          <Input
            inputMode="decimal"
            value={l.longitude}
            onChange={(e) => setLoc({ longitude: e.target.value })}
            placeholder="77.5946"
            className="bg-muted text-foreground"
          />
        </Field>
      </div>
      <Field label={t('location.name')}>
        <Input
          value={l.name}
          maxLength={MESSAGE_LIMITS.locationTextMaxLength}
          onChange={(e) => setLoc({ name: e.target.value })}
          className="bg-muted text-foreground"
        />
      </Field>
      <Field label={t('location.address')}>
        <Input
          value={l.address}
          maxLength={MESSAGE_LIMITS.locationTextMaxLength}
          onChange={(e) => setLoc({ address: e.target.value })}
          className="bg-muted text-foreground"
        />
      </Field>
    </div>
  );
}
