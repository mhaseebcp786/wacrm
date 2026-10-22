import { NextResponse } from 'next/server';

import { getT } from '@/lib/i18n/translate';
import type { ServiceError } from './service';

const t = getT('Api');

/**
 * Map a service failure onto the dashboard's `{ error }` shape. A rejected
 * rule also carries the machine-readable `errors` (code + message-object
 * issues) so the dialog can point at the field in the user's language.
 */
export function serviceErrorResponse(
  e: ServiceError,
  operation: 'save' | 'load' = 'save'
): NextResponse {
  switch (e.error) {
    case 'invalid':
      return NextResponse.json(
        { error: t('saasAutoresponder.invalid'), errors: e.errors },
        { status: 400 }
      );
    case 'notFound':
      return NextResponse.json(
        { error: t('saasAutoresponder.notFound') },
        { status: 404 }
      );
    case 'db':
      console.error('[saas-autoresponder] database error:', e.message);
      return NextResponse.json(
        {
          error: t(
            operation === 'load'
              ? 'saasAutoresponder.loadFailed'
              : 'saasAutoresponder.saveFailed'
          ),
        },
        { status: 500 }
      );
  }
}
