import { NextResponse } from 'next/server';

import { getT } from '@/lib/i18n/translate';
import type { ServiceError } from './service';

const t = getT('Api');

/**
 * Map a service failure onto the dashboard's `{ error }` shape. Validation
 * failures also carry the machine-readable `issues` (code + params + path)
 * so the editor can localize and point at the field.
 */
export function serviceErrorResponse(
  e: ServiceError,
  operation: 'save' | 'load' = 'save'
): NextResponse {
  switch (e.error) {
    case 'nameRequired':
      return NextResponse.json(
        { error: t('saasQuickReplies.nameRequired') },
        { status: 400 }
      );
    case 'nameTooLong':
      return NextResponse.json(
        { error: t('saasQuickReplies.nameTooLong', { max: e.max }) },
        { status: 400 }
      );
    case 'invalidMessage':
      return NextResponse.json(
        { error: t('saasQuickReplies.invalidMessage'), issues: e.issues },
        { status: 400 }
      );
    case 'notFound':
      return NextResponse.json(
        { error: t('saasQuickReplies.notFound') },
        { status: 404 }
      );
    case 'db':
      console.error('[saas-quick-replies] database error:', e.message);
      return NextResponse.json(
        {
          error: t(
            operation === 'load'
              ? 'saasQuickReplies.loadFailed'
              : 'saasQuickReplies.saveFailed'
          ),
        },
        { status: 500 }
      );
  }
}
