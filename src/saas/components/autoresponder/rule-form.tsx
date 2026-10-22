'use client';

import { useMemo, type Dispatch, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { QuickReplyEditor } from '@/saas/components/quick-replies/quick-reply-editor';
import { timeZoneOptions, type RuleForm } from '@/saas/lib/autoresponder/form';
import {
  AUTORESPONDER_NAME_MAX,
  INTERVAL_DAYS_MAX,
  INTERVAL_DAYS_MIN,
  ISO_WEEKDAYS,
  SEND_WHEN_VALUES,
} from '@/saas/lib/autoresponder/types';

const SELECT_CLASS =
  'border-border bg-muted text-foreground focus:border-primary w-full rounded-md border px-2 py-2 text-sm focus:outline-none';

const DAY_OPTIONS = Array.from(
  { length: INTERVAL_DAYS_MAX - INTERVAL_DAYS_MIN + 1 },
  (_, i) => INTERVAL_DAYS_MIN + i
);

interface RuleFormFieldsProps {
  form: RuleForm;
  /** A state setter: the message editor updates functionally (see QuickReplyEditor). */
  onChange: Dispatch<SetStateAction<RuleForm>>;
  /** Show the carousel editor's inline validation (after a save attempt). */
  showIssues: boolean;
}

/**
 * The fields of a Welcome & Away message, top to bottom in the order a person
 * thinks about them: name → when → (optionally) which days and hours → the
 * message itself. Controlled; the parent owns the state (see `form.ts`).
 */
export function RuleFormFields({
  form,
  onChange,
  showIssues,
}: RuleFormFieldsProps) {
  const t = useTranslations('SaasAutoresponder');
  // ~420 zone names: build and sort once per chosen zone, not per keystroke.
  const zones = useMemo(() => timeZoneOptions(form.timezone), [form.timezone]);
  const patch = (change: Partial<RuleForm>) =>
    onChange((prev) => ({ ...prev, ...change }));

  const toggleDay = (day: number) =>
    onChange((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day].sort((a, b) => a - b),
    }));

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <label
          htmlFor="autoresponder-name"
          className="text-muted-foreground block text-xs"
        >
          {t('nameLabel')}
        </label>
        <Input
          id="autoresponder-name"
          value={form.name}
          maxLength={AUTORESPONDER_NAME_MAX}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder={t('namePlaceholder')}
          className="bg-muted text-foreground"
        />
      </div>

      <section className="space-y-2">
        <h3 className="text-foreground text-sm font-medium">
          {t('whenTitle')}
        </h3>
        <div
          role="radiogroup"
          aria-label={t('whenTitle')}
          className="grid gap-2"
        >
          {SEND_WHEN_VALUES.map((value) => {
            const selected = form.sendWhen === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => patch({ sendWhen: value })}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  selected
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:bg-muted'
                )}
              >
                <span className="text-foreground block text-sm font-medium">
                  {t(`sendWhen.${value}.title`)}
                </span>
                <span className="text-muted-foreground mt-1 block text-xs">
                  {t(`sendWhen.${value}.description`)}
                </span>
              </button>
            );
          })}
        </div>

        {form.sendWhen !== 'first_message' && (
          <div className="space-y-1.5 pt-1">
            <label
              htmlFor="autoresponder-interval"
              className="text-muted-foreground block text-xs"
            >
              {t(`intervalLabel.${form.sendWhen}`)}
            </label>
            <select
              id="autoresponder-interval"
              value={form.intervalDays}
              onChange={(e) => patch({ intervalDays: Number(e.target.value) })}
              className={cn(SELECT_CLASS, 'sm:w-48')}
            >
              {DAY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {t('intervalOption', { count: n })}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-[11px]">
              {t(`intervalHint.${form.sendWhen}`)}
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              id="autoresponder-schedule-title"
              className="text-foreground text-sm font-medium"
            >
              {t('scheduleToggle')}
            </h3>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t('scheduleToggleHint')}
            </p>
          </div>
          <Switch
            checked={form.scheduleEnabled}
            onCheckedChange={(c) => patch({ scheduleEnabled: c === true })}
            aria-labelledby="autoresponder-schedule-title"
          />
        </div>

        {form.scheduleEnabled && (
          <div className="border-border space-y-3 rounded-lg border p-3">
            <div className="space-y-1.5">
              <span
                id="autoresponder-days-label"
                className="text-muted-foreground block text-xs"
              >
                {t('daysLabel')}
              </span>
              <div
                role="group"
                aria-labelledby="autoresponder-days-label"
                className="flex flex-wrap gap-1.5"
              >
                {ISO_WEEKDAYS.map((day) => {
                  const on = form.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(day)}
                      className={cn(
                        'min-w-12 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                        on
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t(`days.${day}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="autoresponder-from"
                  className="text-muted-foreground block text-xs"
                >
                  {t('timeFromLabel')}
                </label>
                <Input
                  id="autoresponder-from"
                  type="time"
                  value={form.from}
                  onChange={(e) => patch({ from: e.target.value })}
                  className="bg-muted text-foreground"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="autoresponder-to"
                  className="text-muted-foreground block text-xs"
                >
                  {t('timeToLabel')}
                </label>
                <Input
                  id="autoresponder-to"
                  type="time"
                  value={form.to}
                  onChange={(e) => patch({ to: e.target.value })}
                  className="bg-muted text-foreground"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="autoresponder-timezone"
                className="text-muted-foreground block text-xs"
              >
                {t('timezoneLabel')}
              </label>
              <select
                id="autoresponder-timezone"
                value={form.timezone}
                onChange={(e) => patch({ timezone: e.target.value })}
                className={SELECT_CLASS}
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-muted-foreground text-[11px]">
              {t('scheduleHint')}
            </p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div>
          <h3 className="text-foreground text-sm font-medium">
            {t('messageTitle')}
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {t('messageHint')}
          </p>
        </div>
        <QuickReplyEditor
          value={form.editor}
          onChange={(update) =>
            onChange((prev) => ({
              ...prev,
              editor:
                typeof update === 'function' ? update(prev.editor) : update,
            }))
          }
          showIssues={showIssues}
        />
      </section>
    </div>
  );
}
