'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  isCarouselMessageTemplate,
  storedCarouselCards,
} from '@/saas/lib/whatsapp/template-form-carousel';
import type { MessageTemplate } from '@/types';

/** "Carousel · N cards" badge for the templates list (null for other templates). */
export function CarouselTemplateBadge({
  template,
}: {
  template: MessageTemplate;
}) {
  const t = useTranslations('SaasTemplates');
  if (!isCarouselMessageTemplate(template)) return null;
  const count = storedCarouselCards(template).length;
  return (
    <Badge className="border-primary/30 bg-primary/10 text-primary border text-xs">
      {t('carousel.badge', { count })}
    </Badge>
  );
}
