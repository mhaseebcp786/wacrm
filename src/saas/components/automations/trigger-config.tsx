'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import {
  PRODUCT_IDS_MAX,
  TRIGGER_TEXT_MAX,
  type SaasAutomationTriggerType,
} from '@/saas/lib/automations/types';

interface SaasTriggerConfigProps {
  /** Any trigger type: nothing is rendered for the upstream ones. */
  type: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

const HELP_ONLY: Partial<Record<SaasAutomationTriggerType, string>> = {
  flow_response: 'formHelp',
  meta_ads_ctwa: 'adHelp',
  anything_else: 'fallbackHelp',
};

/**
 * The trigger card's settings for the extra triggers. Rendered after the
 * upstream trigger settings; returns nothing for a trigger it does not own.
 */
export function SaasTriggerConfig({
  type,
  config,
  onChange,
}: SaasTriggerConfigProps) {
  const t = useTranslations('SaasAutomations.trigger');

  if (type === 'button_reply' || type === 'list_reply') {
    const prefix = type === 'button_reply' ? 'buttonText' : 'rowText';
    return (
      <div>
        <label className="text-muted-foreground mb-1 block text-xs font-medium">
          {t(`${prefix}Label`)}
        </label>
        <Input
          value={(config.text as string) ?? ''}
          maxLength={TRIGGER_TEXT_MAX}
          onChange={(e) => onChange({ ...config, text: e.target.value })}
          placeholder={t(`${prefix}Placeholder`)}
          className="bg-muted text-foreground"
        />
        <p className="text-muted-foreground mt-1 text-[11px]">
          {t(`${prefix}Help`)}
        </p>
      </div>
    );
  }

  if (type === 'catalog_order') {
    return <ProductIds config={config} onChange={onChange} />;
  }

  const help = HELP_ONLY[type as SaasAutomationTriggerType];
  if (help) {
    return <p className="text-muted-foreground text-[11px]">{t(help)}</p>;
  }
  return null;
}

function ProductIds({
  config,
  onChange,
}: Pick<SaasTriggerConfigProps, 'config' | 'onChange'>) {
  const t = useTranslations('SaasAutomations.trigger');
  const ids = (config.product_ids as string[] | undefined) ?? [];
  // Local draft, parsed on blur: a comma and a trailing space must survive
  // keystrokes (same pattern as the keyword and reply-id fields).
  const [draft, setDraft] = useState(ids.join(', '));

  function commit() {
    const parsed = draft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, PRODUCT_IDS_MAX);
    setDraft(parsed.join(', '));
    onChange({ ...config, product_ids: parsed });
  }

  return (
    <div>
      <label className="text-muted-foreground mb-1 block text-xs font-medium">
        {t('productIdsLabel')}
      </label>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        placeholder={t('productIdsPlaceholder')}
        className="bg-muted text-foreground font-mono"
      />
      <p className="text-muted-foreground mt-1 text-[11px]">
        {t('productIdsHelp')}
      </p>
    </div>
  );
}
