'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ImageIcon, FileVideo, FileText, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  uploadAccountMedia,
  MEDIA_MAX_BYTES_BY_KIND,
} from '@/lib/storage/upload-media';
import {
  MEDIA_HEADER_SPECS,
  type MediaHeaderKind,
} from '@/lib/whatsapp/media-header-types';

export interface TemplateHeaderMediaInputProps {
  headerType: 'image' | 'video' | 'document';
  value: string; // current URL
  onChange: (url: string) => void;
  disabled?: boolean;
}

function isValidHttpUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function TemplateHeaderMediaInput({
  headerType,
  value,
  onChange,
  disabled = false,
}: TemplateHeaderMediaInputProps) {
  const t = useTranslations('Broadcasts.wizard');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const spec = MEDIA_HEADER_SPECS[headerType as MediaHeaderKind];

  const label =
    headerType === 'video'
      ? t('personalize.headerVideo')
      : headerType === 'document'
      ? t('personalize.headerDocument')
      : t('personalize.headerImage');

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (spec.mimeTypes.length > 0 && !spec.mimeTypes.includes(file.type)) {
      toast.error(`Invalid file format. Accepted: ${spec.formats}`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const maxBytes = MEDIA_MAX_BYTES_BY_KIND[headerType as MediaHeaderKind];
    if (file.size > maxBytes) {
      toast.error(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      onChange(publicUrl);
      toast.success('Media uploaded successfully');
    } catch (err) {
      console.error('Media header upload failed:', err);
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isInvalidUrl = value.trim().length > 0 && !isValidHttpUrl(value.trim());

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium text-foreground">{label}</p>
        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium uppercase text-primary">
          {headerType}
        </span>
      </div>

      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
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
          accept={spec ? spec.mimeTypes.join(',') : undefined}
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled || uploading}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 border-border text-foreground hover:bg-muted"
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

      <p className="mt-1.5 text-xs text-muted-foreground">
        {desc} {spec?.formats ? `(${spec.formats})` : ''}
      </p>

      {isInvalidUrl && (
        <p className="mt-1.5 text-xs text-amber-300">
          {t('personalize.mediaUrlInvalid')}
        </p>
      )}

      {/* Preview Area */}
      {value.trim() && isValidHttpUrl(value.trim()) && (
        <div className="mt-3">
          {headerType === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.trim()}
              alt="Header preview"
              className="max-h-40 rounded-lg border border-border object-contain"
            />
          )}
          {headerType === 'video' && (
            <video
              src={value.trim()}
              controls
              className="max-h-32 rounded-lg border border-border"
            />
          )}
          {headerType === 'document' && (
            <a
              href={value.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-primary underline hover:text-primary/80 max-w-full"
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {value.trim().split('/').pop()?.split('?')[0] || value.trim()}
              </span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
