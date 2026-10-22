// ============================================================
// Dialog form state ⇄ rule (client-safe, pure).
//
// The form keeps the schedule's fields even while "only on certain days and
// times" is off, so switching it off and on again does not lose them;
// `formToCandidate` emits `schedule: null` while it is off. The message part
// reuses the suggested-replies editor state (one sub-state per message type).
// ============================================================

import {
  editorToMessage,
  emptyEditorState,
  messageToEditor,
  type EditorState,
} from '@/saas/lib/quick-replies/editor-state';
import { ISO_WEEKDAYS, type AutoresponderItem, type SendWhen } from './types';
import type { AutoresponderCandidate } from './validate';

export const DEFAULT_INACTIVITY_DAYS = 30;

export interface RuleForm {
  name: string;
  sendWhen: SendWhen;
  intervalDays: number;
  scheduleEnabled: boolean;
  days: number[];
  from: string;
  to: string;
  timezone: string;
  editor: EditorState;
}

/** The viewer's own time zone, the natural default for a new schedule. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function emptyRuleForm(timezone: string = browserTimeZone()): RuleForm {
  return {
    name: '',
    sendWhen: 'first_message',
    intervalDays: DEFAULT_INACTIVITY_DAYS,
    scheduleEnabled: false,
    days: [...ISO_WEEKDAYS],
    from: '09:00',
    to: '18:00',
    timezone,
    editor: emptyEditorState(),
  };
}

/** Throws if the stored message no longer matches its type (hand-edited row). */
export function itemToForm(
  item: AutoresponderItem,
  fallbackTimezone: string = browserTimeZone()
): RuleForm {
  const base = emptyRuleForm(fallbackTimezone);
  return {
    ...base,
    name: item.name,
    sendWhen: item.send_when,
    intervalDays: item.interval_days ?? base.intervalDays,
    ...(item.schedule
      ? {
          scheduleEnabled: true,
          days: item.schedule.days,
          from: item.schedule.from,
          to: item.schedule.to,
          timezone: item.schedule.timezone,
        }
      : {}),
    editor: messageToEditor(item.message),
  };
}

/** The unvalidated body `validateAutoresponder` and the API take. */
export function formToCandidate(form: RuleForm): AutoresponderCandidate {
  return {
    name: form.name,
    message: editorToMessage(form.editor),
    send_when: form.sendWhen,
    interval_days: form.sendWhen !== 'first_message' ? form.intervalDays : null,
    schedule: form.scheduleEnabled
      ? {
          days: form.days,
          from: form.from,
          to: form.to,
          timezone: form.timezone,
        }
      : null,
  };
}

/**
 * Time zones to offer: the browser's list (plus UTC, which some engines omit)
 * and always the one already chosen, so editing a rule never silently
 * changes its zone.
 */
export function timeZoneOptions(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    // Older engines: fall through to the minimal list below.
  }
  const all = new Set<string>(zones);
  all.add('UTC');
  if (current) all.add(current);
  return [...all].sort((a, b) => a.localeCompare(b));
}
