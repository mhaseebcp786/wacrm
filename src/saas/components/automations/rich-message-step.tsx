'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useTranslations } from 'next-intl';

import { QuickReplyEditor } from '@/saas/components/quick-replies/quick-reply-editor';
import { looksLikeMessageObject } from '@/saas/lib/automations/rich-config';
import {
  editorToMessage,
  emptyEditorState,
  messageToEditor,
  type EditorState,
} from '@/saas/lib/quick-replies/editor-state';

function initialEditor(config: Record<string, unknown>): EditorState {
  if (!looksLikeMessageObject(config)) return emptyEditorState();
  try {
    return messageToEditor(config);
  } catch {
    // A hand-edited step that no longer matches its type: start over.
    return emptyEditorState();
  }
}

interface RichMessageStepProps {
  /** The step's `step_config`: a message object. */
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

/**
 * Editor for the "Send rich message" automation step: the shared message
 * editor (nine types) over the step's message object. The editor keeps its
 * own state so switching type tabs keeps what was typed for the others, and
 * writes the active message back to the step on every change.
 */
export function RichMessageStep({ config, onChange }: RichMessageStepProps) {
  const t = useTranslations('SaasAutomations.step');
  const [editor, setEditorState] = useState(() => initialEditor(config));
  // The editor updates functionally (an upload finishing must not overwrite
  // edits made meanwhile), so resolve against the newest state, not a render's.
  const latest = useRef(editor);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const setEditor: Dispatch<SetStateAction<EditorState>> = useCallback(
    (update) => {
      const next =
        typeof update === 'function' ? update(latest.current) : update;
      latest.current = next;
      setEditorState(next);
      onChangeRef.current(editorToMessage(next) as Record<string, unknown>);
    },
    []
  );

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-[11px]">{t('richHint')}</p>
      <QuickReplyEditor value={editor} onChange={setEditor} />
    </div>
  );
}
