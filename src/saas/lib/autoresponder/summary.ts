// Plain-language one-liners for the list ("First message, and after 30 days
// of silence" / "Mon, Tue, 18:00–09:00 (Asia/Kolkata)"). Pure: the caller
// passes the `SaasAutoresponder` translator.

import type { AutoresponderItem } from './types';

export type SummaryTranslate = (
  key: string,
  values?: Record<string, string | number>
) => string;

export function whenSummary(
  item: Pick<AutoresponderItem, 'send_when' | 'interval_days'>,
  t: SummaryTranslate
): string {
  if (item.send_when === 'first_message') return t('summary.first_message');
  return t(`summary.${item.send_when}`, { count: item.interval_days ?? 0 });
}

/** Null when the rule is not limited to certain days and times. */
export function scheduleSummary(
  schedule: AutoresponderItem['schedule'],
  t: SummaryTranslate
): string | null {
  if (!schedule) return null;
  const days =
    schedule.days.length === 7
      ? t('summary.everyDay')
      : schedule.days.map((d) => t(`days.${d}`)).join(', ');
  return t('summary.schedule', {
    days,
    from: schedule.from,
    to: schedule.to,
    timezone: schedule.timezone,
  });
}
