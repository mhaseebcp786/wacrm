'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ImageIcon,
  FileVideo,
  FileText,
  Upload,
  Loader2,
  Play,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { uploadAccountMedia } from '@/lib/storage/upload-media';
import { MEDIA_HEADER_SPECS } from '@/lib/whatsapp/media-header-types';
import {
  describeMediaLimit,
  deriveDocumentFilename,
  getExtension,
  validateMediaFile,
  validateMediaUrl,
} from '@/saas/lib/whatsapp/media-specs';

export interface TemplateHeaderMediaInputProps {
  headerType: 'image' | 'video' | 'document';
  value: string; // current URL
  onChange: (url: string) => void;
  disabled?: boolean;
  /** Overrides the default "Header image/video/document" title (carousel cards). */
  label?: string;
}

export function TemplateHeaderMediaInput({
  headerType,
  value,
  onChange,
  disabled = false,
  label: labelOverride,
}: TemplateHeaderMediaInputProps) {
  const t = useTranslations('Broadcasts.wizard');
  const ts = useTranslations('SaasTemplates');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Dropped uploads: a result that arrives after this input (its dialog /
  // card) is gone must not call back into a parent that has moved on.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const spec = MEDIA_HEADER_SPECS[headerType];
  const limit = describeMediaLimit(headerType, 'send');

  const label =
    labelOverride ??
    (headerType === 'video'
      ? t('personalize.headerVideo')
      : headerType === 'document'
        ? t('personalize.headerDocument')
        : t('personalize.headerImage'));

  const desc =
    headerType === 'video'
      ? t('personalize.headerVideoDesc')
      : headerType === 'document'
        ? t('personalize.headerDocumentDesc')
        : t('personalize.headerImageDesc');

  const Icon =
    headerType === 'video'
      ? FileVideo
      : headerType === 'document'
        ? FileText
        : ImageIcon;

  const resetInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const check = validateMediaFile(headerType, file, { context: 'send' });
    if (!check.ok && check.error) {
      toast.error(
        ts('media.toastRejected', {
          reason: ts(
            `media.issues.${check.error.code}`,
            check.error.params ?? {}
          ),
        })
      );
      resetInput();
      return;
    }

    setUploading(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      if (!mountedRef.current) return;
      onChange(publicUrl);
      toast.success(ts('media.toastUploaded'));
    } catch (err) {
      console.error('Media header upload failed:', err);
      if (mountedRef.current) {
        toast.error(
          err instanceof Error ? err.message : ts('media.toastUploadFailed')
        );
      }
    } finally {
      if (mountedRef.current) {
        setUploading(false);
        resetInput();
      }
    }
  };

  const trimmed = value.trim();
  const urlCheck = trimmed
    ? validateMediaUrl(headerType, trimmed, { context: 'send' })
    : null;
  const isInvalidUrl = urlCheck !== null && !urlCheck.ok;
  const previewable = urlCheck?.ok === true;
  const fileName = trimmed ? deriveDocumentFilename(trimmed) : null;
  const ext = trimmed ? getExtension(fileName ?? trimmed) : null;

  return (
    <div className="border-border bg-card/50 rounded-xl border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="text-primary h-4 w-4" />
        <p className="text-foreground text-sm font-medium">{label}</p>
        <span className="bg-primary/10 text-primary inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium uppercase">
          {headerType}
        </span>
      </div>

      <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
        {t('personalize.mediaUrl')}
      </label>

      <div className="flex gap-2">
        <Input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('personalize.mediaUrlPlaceholder')}
          disabled={disabled || uploading}
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground flex-1"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={spec.mimeTypes.join(',')}
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled || uploading}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
          className="border-border text-foreground hover:bg-muted shrink-0"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {t('personalize.uploadingMedia')}
            </>
          ) : (
            <>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {t('personalize.uploadMedia')}
            </>
          )}
        </Button>
      </div>

      <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        <span>{desc}</span>
        <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
          {ts('media.metaLimit', limit)}
        </span>
      </p>

      {isInvalidUrl && urlCheck?.error && (
        <p className="mt-1.5 text-xs text-red-400">
          {ts(
            `media.issues.${urlCheck.error.code}`,
            urlCheck.error.params ?? {}
          )}
        </p>
      )}
      {urlCheck?.ok && urlCheck.warning && (
        <p className="mt-1.5 text-xs text-amber-300">
          {ts(`media.issues.${urlCheck.warning.code}`)}
        </p>
      )}

      {/* Preview Area */}
      {previewable && (
        <div className="mt-3">
          {headerType === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={trimmed}
              alt={label}
              className="border-border max-h-40 rounded-lg border object-contain"
            />
          )}
          {headerType === 'video' && (
            <div className="border-border relative inline-block overflow-hidden rounded-lg border bg-black">
              <video
                src={trimmed}
                muted
                playsInline
                preload="metadata"
                controls
                className="max-h-32"
              />
              <Play className="pointer-events-none absolute top-2 left-2 h-4 w-4 text-white/80" />
            </div>
          )}
          {headerType === 'document' && (
            <a
              href={trimmed}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border bg-muted/50 text-foreground hover:bg-muted inline-flex max-w-full items-center gap-3 rounded-md border px-3 py-2.5 text-xs"
            >
              <FileText className="h-8 w-8 shrink-0 text-red-500" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {fileName ?? ts('media.documentFallbackName')}
                </span>
                {ext && (
                  <span className="text-muted-foreground block text-[10px] uppercase">
                    {ext}
                  </span>
                )}
              </span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
